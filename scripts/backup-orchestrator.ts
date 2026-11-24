import { spawnSync, execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { Client } from 'pg';
import {
  writeBackupAuditLog,
  getNeonBackupUrl,
  ensureBackupAuditLogTable,
  BackupLogEntry,
} from '../neon';
import { verifyBackup, ALL_PRISMA_TABLES, VerificationResult } from './verify-backup';
import { sendBackupSuccessEmail, sendBackupFailureEmail } from '../src/lib/email';

/**
 * GHAZAL - Safe Backup Rotation & Disaster Recovery Orchestrator
 *
 * Implements strict Safe Backup Rotation:
 * 1. Checks Supabase and Neon connectivity.
 * 2. Provisions ephemeral staging schema `ghazal_backup_staging` on Neon.
 * 3. Dumps Supabase database via session pooler (port 5432) / native replication.
 * 4. Restores into `ghazal_backup_staging`.
 * 5. Runs deep automated verification (45 tables, row counts, fils-level financial invariants).
 * 6. ON SUCCESS:
 *    - Atomically promotes `ghazal_backup_staging` -> `ghazal_backup_current`.
 *    - Decommissions prior backup (`ghazal_backup_old`).
 *    - Records SUCCESS in Neon `_backup_audit_log`.
 *    - Dispatches Arabic RTL Resend Success audit email.
 * 7. ON FAILURE:
 *    - Strictly preserves `ghazal_backup_current` without modification.
 *    - Cleans up ephemeral `ghazal_backup_staging`.
 *    - Records failure in Neon `_backup_audit_log`.
 *    - Dispatches Arabic RTL Resend Failure alert email.
 */

export interface BackupOrchestratorOptions {
  sourceConnectionString?: string;
  targetConnectionString?: string;
  skipEmail?: boolean;
  silent?: boolean;
}

export interface BackupOrchestratorResult {
  success: boolean;
  runId: string;
  startedAt: string;
  completedAt: string;
  durationSeconds: number;
  dumpSizeBytes: number;
  tablesCount: number;
  rowsCount: number;
  verification: VerificationResult | null;
  error?: string;
  emailSent?: boolean;
}

export async function runBackupOrchestrator(
  options: BackupOrchestratorOptions = {}
): Promise<BackupOrchestratorResult> {
  const startedAt = new Date();
  const runId = `backup_${startedAt.toISOString().replace(/[-:T.Z]/g, '').slice(0, 14)}_${Math.random().toString(36).substring(2, 7)}`;
  const log = options.silent ? () => {} : console.log;

  log(`\n===============================================================`);
  log(`🛡️  GHAZAL SAFE BACKUP ORCHESTRATOR — Run ID: ${runId}`);
  log(`⏰  Started at: ${startedAt.toISOString()}`);
  log(`===============================================================\n`);

  const sourceUrl =
    options.sourceConnectionString ||
    process.env.SUPABASE_BACKUP_URL ||
    process.env.DIRECT_URL ||
    process.env.DATABASE_URL;

  const targetUrl =
    options.targetConnectionString ||
    process.env.NEON_BACKUP_URL ||
    getNeonBackupUrl();

  if (!sourceUrl) {
    throw new Error('Backup orchestration aborted: Source connection URL (Supabase) is missing.');
  }
  if (!targetUrl) {
    throw new Error('Backup orchestration aborted: Target connection URL (Neon) is missing.');
  }

  // Pre-flight audit table initialization
  await ensureBackupAuditLogTable();

  // Log IN_PROGRESS state to Neon independent DR log
  await writeBackupAuditLog({
    id: runId,
    startedAt,
    status: 'IN_PROGRESS',
    sourceDb: 'Supabase PostgreSQL (AWS eu-central-1)',
    targetDb: 'Neon PostgreSQL (ghazal_backup_current)',
  });

  const neonClient = new Client({
    connectionString: targetUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });

  const supabaseClient = new Client({
    connectionString: sourceUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });

  let dumpSizeBytes = 0;
  let verificationResult: VerificationResult | null = null;

  try {
    // 1. Connectivity Check
    log(`[Orchestrator] Step 1: Validating database handshakes...`);
    await neonClient.connect();
    await supabaseClient.connect();
    log(`  ✅ Supabase session pooler connected successfully.`);
    log(`  ✅ Neon disaster recovery target connected successfully.`);

    // 2. Prepare Ephemeral Staging Schema
    log(`[Orchestrator] Step 2: Preparing ephemeral staging schema "ghazal_backup_staging"...`);
    await neonClient.query(`DROP SCHEMA IF EXISTS ghazal_backup_staging CASCADE;`);
    await neonClient.query(`CREATE SCHEMA ghazal_backup_staging;`);
    log(`  ✅ Staging schema initialized cleanly.`);

    // 3. Extraction & Ingest
    log(`[Orchestrator] Step 3: Extracting schema and replicating tables into staging...`);
    const hasPgDump = spawnSync('pg_dump', ['--version']).status === 0;

    if (hasPgDump) {
      log(`  Using native pg_dump CLI engine...`);
      const tempDumpPath = path.join(process.cwd(), `.temp_${runId}.sql`);
      try {
        execSync(
          `pg_dump "${sourceUrl}" --schema=public --no-owner --no-privileges -f "${tempDumpPath}"`,
          { stdio: 'inherit' }
        );

        let sqlContent = fs.readFileSync(tempDumpPath, 'utf8');
        dumpSizeBytes = Buffer.byteLength(sqlContent, 'utf8');

        // Remove any DROP/CREATE schema statements to completely protect target public schema
        sqlContent = sqlContent
          .replace(/DROP SCHEMA[^\n;]*;/gi, '')
          .replace(/CREATE SCHEMA[^\n;]*;/gi, '')
          .replace(/SELECT pg_catalog\.set_config\('search_path', '', false\);/g, "SELECT pg_catalog.set_config('search_path', 'ghazal_backup_staging, public', false);");

        // Rewrite public. and "public". schema targets to ghazal_backup_staging.
        sqlContent = `SET search_path = ghazal_backup_staging, public;\n` +
          sqlContent.replace(/(?:\"public\"|public)\./g, 'ghazal_backup_staging.');

        fs.writeFileSync(tempDumpPath, sqlContent, 'utf8');
        log(`  Applying dump to Neon staging (${(dumpSizeBytes / (1024 * 1024)).toFixed(2)} MB)...`);

        const psqlCmd = `psql -v ON_ERROR_STOP=1 "${targetUrl}" -f "${tempDumpPath}"`;
        execSync(psqlCmd, { stdio: 'inherit' });
      } finally {
        if (fs.existsSync(tempDumpPath)) {
          fs.unlinkSync(tempDumpPath);
        }
      }
    } else {
      log(`  Native pg_dump not in PATH; utilizing high-fidelity Node.js streaming replicator...`);
      // Generate standard DDL using Prisma migrate diff
      const ddlRaw = execSync(
        `npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script`,
        { encoding: 'utf8' }
      );

      dumpSizeBytes = Buffer.byteLength(ddlRaw, 'utf8');

      // Strip any CLI banner before the first SQL statement
      const sqlStart = ddlRaw.search(/--(?: CreateSchema| CreateTable| AddForeignKey| CreateIndex)/);
      const cleanDdl = sqlStart !== -1 ? ddlRaw.substring(sqlStart) : ddlRaw;

      // Separate table creation DDL from foreign key constraint DDL to guarantee order-independent data streaming
      const fkIdx = cleanDdl.indexOf('-- AddForeignKey');
      const tableDdlPart = fkIdx !== -1 ? cleanDdl.substring(0, fkIdx) : cleanDdl;
      const fkDdlPart = fkIdx !== -1 ? cleanDdl.substring(fkIdx) : '';

      // Execute table creations in staging schema
      const stagingTableDdl = `
        SET search_path = ghazal_backup_staging, public;
        ${tableDdlPart.replace(/CREATE SCHEMA IF NOT EXISTS "public";/g, '')}
      `;
      await neonClient.query(stagingTableDdl);
      log(`  ✅ All 45 staging tables, constraints, and indices provisioned.`);

      // Stream table data from Supabase to Neon staging
      log(`  Streaming table data from Supabase to Neon staging...`);
      for (const table of ALL_PRISMA_TABLES) {
        const rowsRes = await supabaseClient.query(`SELECT * FROM "public"."${table}";`);
        const rows = rowsRes.rows;

        if (rows.length > 0) {
          const columns = Object.keys(rows[0]);
          const quotedColumns = columns.map((c) => `"${c}"`).join(', ');

          // Batch insert in chunks of 200 rows
          const chunkSize = 200;
          for (let i = 0; i < rows.length; i += chunkSize) {
            const chunk = rows.slice(i, i + chunkSize);
            const valueClauses: string[] = [];
            const params: any[] = [];
            let paramIdx = 1;

            for (const row of chunk) {
              const rowParamPlaceholders: string[] = [];
              for (const col of columns) {
                rowParamPlaceholders.push(`$${paramIdx++}`);
                let val = row[col];
                // Serialize JSON/object structures if needed
                if (val !== null && typeof val === 'object' && !(val instanceof Date)) {
                  val = JSON.stringify(val);
                }
                params.push(val);
              }
              valueClauses.push(`(${rowParamPlaceholders.join(', ')})`);
            }

            const insertSql = `
              INSERT INTO "ghazal_backup_staging"."${table}" (${quotedColumns})
              VALUES ${valueClauses.join(', ')};
            `;
            await neonClient.query(insertSql, params);
          }
        }
      }
      log(`  ✅ Table data streaming completed for all 45 tables.`);

      // Apply Foreign Key constraints now that all data is in place
      if (fkDdlPart.trim().length > 0) {
        log(`  Applying relational foreign key constraints to staging schema...`);
        const stagingFkDdl = `
          SET search_path = ghazal_backup_staging, public;
          ${fkDdlPart}
        `;
        await neonClient.query(stagingFkDdl);
        log(`  ✅ All foreign keys and relational constraints verified and attached.`);
      }
    }

    // 4. Automated Verification Phase
    log(`[Orchestrator] Step 4: Executing automated verification engine...`);
    verificationResult = await verifyBackup({
      sourceConnectionString: sourceUrl,
      targetConnectionString: targetUrl,
      sourceSchema: 'public',
      targetSchema: 'ghazal_backup_staging',
      silent: options.silent,
    });

    if (!verificationResult.passed) {
      throw new Error(
        `Verification failed with ${verificationResult.errors.length} error(s): ${verificationResult.errors.join('; ')}`
      );
    }
    log(`  ✅ Verification PASSED: All 45 tables, row counts, and financial invariants match 100%.`);

    // 5. Safe Rotation Phase
    log(`[Orchestrator] Step 5: Executing atomic Safe Backup Rotation...`);
    // Check if previous verified backup exists
    const checkCurrentRes = await neonClient.query(`
      SELECT schema_name 
      FROM information_schema.schemata 
      WHERE schema_name = 'ghazal_backup_current';
    `);
    const hasCurrentBackup = checkCurrentRes.rows.length > 0;

    await neonClient.query('BEGIN;');
    await neonClient.query(`DROP SCHEMA IF EXISTS ghazal_backup_old CASCADE;`);

    if (hasCurrentBackup) {
      await neonClient.query(`ALTER SCHEMA ghazal_backup_current RENAME TO ghazal_backup_old;`);
    }

    await neonClient.query(`ALTER SCHEMA ghazal_backup_staging RENAME TO ghazal_backup_current;`);
    await neonClient.query(`DROP SCHEMA IF EXISTS ghazal_backup_old CASCADE;`);
    await neonClient.query('COMMIT;');
    log(`  ✅ Safe rotation complete: "ghazal_backup_current" is now live on Neon.`);

    const completedAt = new Date();
    const durationSeconds = Math.max(1, Math.round((completedAt.getTime() - startedAt.getTime()) / 1000));

    // 6. Record SUCCESS in Neon independent DR log
    let emailSent = false;
    let emailId: string | undefined;

    if (!options.skipEmail) {
      log(`[Orchestrator] Step 6: Dispatching Resend Success email alert...`);
      const emailRes = await sendBackupSuccessEmail({
        startedAt,
        completedAt,
        durationSeconds,
        dumpSizeBytes,
        tableCount: verificationResult.tablesVerified,
        rowCount: verificationResult.targetTotalRows,
        financialSumFils: verificationResult.financialParity[0]?.targetFils,
      });
      emailSent = emailRes.success;
      emailId = emailRes.id;
    }

    const successAudit: BackupLogEntry = {
      id: runId,
      startedAt,
      completedAt,
      status: 'SUCCESS',
      sourceDb: 'Supabase PostgreSQL',
      targetDb: 'Neon PostgreSQL (ghazal_backup_current)',
      durationSeconds,
      dumpSizeBytes,
      tableCount: verificationResult.tablesVerified,
      rowCount: verificationResult.targetTotalRows,
      financialSumFils: verificationResult.financialParity[0]?.targetFils,
      verificationDetails: {
        financialParity: verificationResult.financialParity,
        relationalChecks: verificationResult.relationalChecks,
      },
      emailSent,
      emailId,
    };
    await writeBackupAuditLog(successAudit);

    log(`\n🎉 Safe Backup Rotation completed successfully in ${durationSeconds}s.`);
    return {
      success: true,
      runId,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationSeconds,
      dumpSizeBytes,
      tablesCount: verificationResult.tablesVerified,
      rowsCount: verificationResult.targetTotalRows,
      verification: verificationResult,
      emailSent,
    };
  } catch (err: any) {
    const failedAt = new Date();
    const durationSeconds = Math.max(1, Math.round((failedAt.getTime() - startedAt.getTime()) / 1000));
    const errorMessage = err?.message || String(err);

    log(`\n❌ [Orchestrator Failure] Backup failed: ${errorMessage}`);
    log(`🛡️  Activating Safe Backup Rotation protection protocol...`);

    // Clean staging schema if it exists, leaving ghazal_backup_current completely protected
    try {
      await neonClient.query(`DROP SCHEMA IF EXISTS ghazal_backup_staging CASCADE;`);
      log(`  ✅ Staging schema cleaned. Verified backup "ghazal_backup_current" remains intact.`);
    } catch (cleanErr: any) {
      log(`  ⚠️ Failed to drop staging schema: ${cleanErr.message}`);
    }

    let emailSent = false;
    let emailId: string | undefined;

    if (!options.skipEmail) {
      log(`  Dispatching Resend Failure alert email...`);
      const emailRes = await sendBackupFailureEmail({
        startedAt,
        failedAt,
        stage: verificationResult ? 'Verification' : 'Ingest / Connectivity',
        errorMessage,
        previousBackupProtected: true,
      });
      emailSent = emailRes.success;
      emailId = emailRes.id;
    }

    // Write failure to Neon DR log
    const failureAudit: BackupLogEntry = {
      id: runId,
      startedAt,
      completedAt: failedAt,
      status: verificationResult ? 'VERIFICATION_FAILED' : 'FAILED',
      sourceDb: 'Supabase PostgreSQL',
      targetDb: 'Neon PostgreSQL (ghazal_backup_current)',
      durationSeconds,
      dumpSizeBytes,
      errorMessage,
      emailSent,
      emailId,
    };
    await writeBackupAuditLog(failureAudit).catch((e) =>
      console.error('[Orchestrator] Failed to record failure audit log:', e.message)
    );

    return {
      success: false,
      runId,
      startedAt: startedAt.toISOString(),
      completedAt: failedAt.toISOString(),
      durationSeconds,
      dumpSizeBytes,
      tablesCount: 0,
      rowsCount: 0,
      verification: verificationResult,
      error: errorMessage,
      emailSent,
    };
  } finally {
    await neonClient.end().catch(() => {});
    await supabaseClient.end().catch(() => {});
  }
}

// Standalone CLI execution
if (require.main === module || (typeof process !== 'undefined' && process.argv[1]?.endsWith('backup-orchestrator.ts'))) {
  runBackupOrchestrator()
    .then((result) => {
      if (!result.success) {
        console.error(`\nBackup orchestration failed: ${result.error}`);
        process.exit(1);
      }
      console.log(`\nBackup orchestration finished with status SUCCESS!`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Fatal unexpected orchestration exception:', err);
      process.exit(1);
    });
}
