'use server';

import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/dal';
import { revalidatePath } from 'next/cache';
import {
  testNeonConnection,
  getBackupAuditLogs,
  getLatestSuccessfulBackup,
  BackupLogEntry,
  NeonConnectionTestResult,
} from '../../neon';
import { runBackupOrchestrator, BackupOrchestratorResult } from '../../scripts/backup-orchestrator';
import {
  sendBackupSuccessEmail,
  sendBackupFailureEmail,
} from '@/lib/email';

export interface DatabaseStatusTelemetry {
  ok: boolean;
  latencyMs: number;
  name: string;
  provider: string;
  region: string;
  details?: string;
  error?: string;
}

export interface BackupSystemStatus {
  supabase: DatabaseStatusTelemetry;
  neon: DatabaseStatusTelemetry;
  latestBackup: BackupLogEntry | null;
  auditLogs: BackupLogEntry[];
  nextScheduledBackup: string;
  scheduleTextAr: string;
  resendReady: boolean;
  resendRecipient: string;
}

/**
 * Calculates the next upcoming Friday at 03:17 AM in Asia/Amman (UTC+3)
 */
function getNextFridayAmmanTime(): Date {
  const now = new Date();
  // Amman is UTC+3 permanently
  const ammanOffsetMs = 3 * 60 * 60 * 1000;
  const ammanNow = new Date(now.getTime() + ammanOffsetMs);

  const dayOfWeek = ammanNow.getUTCDay(); // 0 = Sun, 5 = Fri
  let daysUntilFriday = (5 - dayOfWeek + 7) % 7;

  const targetAmman = new Date(ammanNow);
  targetAmman.setUTCDate(ammanNow.getUTCDate() + daysUntilFriday);
  targetAmman.setUTCHours(3, 17, 0, 0);

  // If target time has already passed today, advance by 7 days
  if (targetAmman.getTime() <= ammanNow.getTime()) {
    targetAmman.setUTCDate(targetAmman.getUTCDate() + 7);
  }

  // Convert back to UTC timestamp
  return new Date(targetAmman.getTime() - ammanOffsetMs);
}

/**
 * Fetches real-time status of Supabase, Neon DR, and recent backup logs.
 */
export async function getBackupSystemStatusAction(): Promise<BackupSystemStatus> {
  await requireAdmin();

  // 1. Supabase Operational DB Telemetry
  let supabaseStatus: DatabaseStatusTelemetry = {
    ok: false,
    latencyMs: 0,
    name: 'Supabase PostgreSQL (Primary)',
    provider: 'Supabase AWS',
    region: 'eu-central-1 (Frankfurt)',
  };

  const supaStart = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1;`;
    supabaseStatus.ok = true;
    supabaseStatus.latencyMs = Date.now() - supaStart;
    supabaseStatus.details = 'متصلة بالكامل (Transaction Pooler + Session Pooler)';
  } catch (err: any) {
    supabaseStatus.ok = false;
    supabaseStatus.latencyMs = Date.now() - supaStart;
    supabaseStatus.error = err.message || 'Supabase unreachable';
  }

  // 2. Neon DR Database Telemetry
  const neonTest: NeonConnectionTestResult = await testNeonConnection();
  const neonStatus: DatabaseStatusTelemetry = {
    ok: neonTest.ok,
    latencyMs: neonTest.latencyMs,
    name: 'Neon PostgreSQL (Disaster Recovery)',
    provider: 'Neon Serverless AWS',
    region: 'eu-central-1 (Frankfurt)',
    details: neonTest.ok
      ? `متصلة وجاهزة (${neonTest.database || 'neondb'})`
      : 'غير متصلة',
    error: neonTest.error,
  };

  // 3. Audit Logs & Latest Successful Backup from Neon
  const [auditLogs, latestBackup] = await Promise.all([
    getBackupAuditLogs(15),
    getLatestSuccessfulBackup(),
  ]);

  // 4. Scheduling & Resend Telemetry
  const nextFriday = getNextFridayAmmanTime();
  const nextScheduledStr = nextFriday.toLocaleString('ar-JO', {
    timeZone: 'Asia/Amman',
    weekday: 'long',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const resendKey = process.env.RESEND_API_KEY;
  const resendTo =
    process.env.BACKUP_EMAIL_TO ||
    process.env.RESEND_ORDER_NOTIFICATION_EMAIL ||
    'admin@ghazal.jo';

  return {
    supabase: supabaseStatus,
    neon: neonStatus,
    latestBackup,
    auditLogs,
    nextScheduledBackup: nextScheduledStr,
    scheduleTextAr: 'كل يوم جمعة — الساعة 03:17 فجراً (توقيت عمّان)',
    resendReady: Boolean(resendKey && resendKey.length > 5),
    resendRecipient: resendTo,
  };
}

/**
 * Triggers an on-demand manual backup with Safe Backup Rotation.
 * Protected by admin authorization.
 */
export async function triggerManualBackupAction(): Promise<{
  success: boolean;
  message: string;
  result?: BackupOrchestratorResult;
}> {
  await requireAdmin();

  try {
    const res = await runBackupOrchestrator({
      skipEmail: false,
      silent: false,
    });

    revalidatePath('/admin/settings/backups');

    if (res.success) {
      return {
        success: true,
        message: `تم إنشاء النسخة الاحتياطية بنجاح واعتمادها في Neon (${res.tablesCount} جدول، ${res.rowsCount} سجل خلال ${res.durationSeconds} ثانية).`,
        result: res,
      };
    } else {
      return {
        success: false,
        message: `فشلت عملية النسخ: ${res.error || 'خطأ غير معروف'}. تم حماية النسخة السابقة دون أي تعديل.`,
        result: res,
      };
    }
  } catch (err: any) {
    revalidatePath('/admin/settings/backups');
    return {
      success: false,
      message: `استثناء غير متوقع: ${err.message}`,
    };
  }
}

/**
 * Dispatches a test backup email via Resend to verify delivery.
 * Protected by admin authorization.
 */
export async function sendTestBackupAlertAction(
  type: 'success' | 'failure'
): Promise<{ success: boolean; id?: string; error?: string }> {
  await requireAdmin();

  const now = new Date();
  if (type === 'success') {
    return await sendBackupSuccessEmail({
      startedAt: new Date(now.getTime() - 42000),
      completedAt: now,
      durationSeconds: 42,
      dumpSizeBytes: 24.8 * 1024 * 1024,
      tableCount: 45,
      rowCount: 4693,
      financialSumFils: 1250000,
    });
  } else {
    return await sendBackupFailureEmail({
      startedAt: new Date(now.getTime() - 15000),
      failedAt: now,
      stage: 'Verification Stage (Test Alert)',
      errorMessage: 'This is a simulated test alert dispatched from Ghazal Admin Settings.',
      previousBackupProtected: true,
    });
  }
}
