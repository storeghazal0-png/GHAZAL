import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { checkSessionAuth } from '@/lib/dal';
import { Client } from 'pg';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  // Authorization Protection
  const url = new URL(req.url);
  const keyParam = url.searchParams.get('key');
  const authHeader = req.headers.get('authorization') || req.headers.get('x-health-key');
  const sessionSecret = process.env.SESSION_SECRET || '';

  const isTokenMatch = (keyParam && sessionSecret && keyParam === sessionSecret) ||
    (authHeader && sessionSecret && authHeader.replace(/^Bearer\s+/i, '').trim() === sessionSecret);

  let isAuthorized = Boolean(isTokenMatch);

  if (!isAuthorized) {
    try {
      const session = await checkSessionAuth();
      if (session && session.employee?.role?.name?.toUpperCase() === 'ADMIN') {
        isAuthorized = true;
      }
    } catch {}
  }

  if (!isAuthorized) {
    return NextResponse.json(
      { error: 'Unauthorized: Health check requires valid authorization' },
      { status: 401 }
    );
  }

  // 1. Diagnostics on Cloudflare Runtime & Hyperdrive binding
  let isHyperdriveBound = false;
  let activeConnString = '';

  try {
    const cf = getCloudflareContext();
    const env = (cf?.env as any) || {};
    if (env.HYPERDRIVE?.connectionString) {
      isHyperdriveBound = true;
      activeConnString = env.HYPERDRIVE.connectionString;
    } else if (env.DATABASE_URL || env.DIRECT_URL) {
      activeConnString = env.DATABASE_URL || env.DIRECT_URL;
    }
  } catch {}

  if (!activeConnString) {
    activeConnString = process.env.DIRECT_URL || process.env.DATABASE_URL || '';
  }

  let pgConnectTimeMs = 0;
  let pgQueryTimeMs = 0;
  let pgSuccess = false;

  // 2. Test Hyperdrive independently of Prisma using pg Client and SELECT 1
  try {
    const pgClient = new Client({
      connectionString: activeConnString,
      connectionTimeoutMillis: 5000,
    });

    const t0 = performance.now();
    await pgClient.connect();
    pgConnectTimeMs = Math.round((performance.now() - t0) * 100) / 100;

    const t1 = performance.now();
    const pgRes = await pgClient.query('SELECT 1 as result');
    pgQueryTimeMs = Math.round((performance.now() - t1) * 100) / 100;

    pgSuccess = Boolean(pgRes?.rows?.[0]?.result === 1);
    await pgClient.end().catch(() => {});
  } catch (err: any) {
    console.error('[HealthCheck PG Error]:', err?.message);
  }

  // 3. Test through Prisma Client (Request-Scoped via getDb())
  let prismaLatencyMs = 0;
  let prismaSuccess = false;

  try {
    const tp0 = performance.now();
    const queryResult = await prisma.$queryRaw<Array<{ result: number }>>`SELECT 1 as result`;
    prismaLatencyMs = Math.round((performance.now() - tp0) * 100) / 100;
    prismaSuccess = Boolean(queryResult && queryResult.length > 0 && queryResult[0].result === 1);
  } catch (err: any) {
    console.error('[HealthCheck Prisma Error]:', err?.message);
  }

  const isHealthy = pgSuccess && prismaSuccess;

  return NextResponse.json({
    status: isHealthy ? 'HEALTHY' : 'DEGRADED',
    metrics: {
      pgConnectTimeMs,
      pgQueryTimeMs,
      prismaLatencyMs,
      totalDurationMs: Math.round((pgConnectTimeMs + pgQueryTimeMs + prismaLatencyMs) * 100) / 100,
    },
    routing: {
      connectionMode: isHyperdriveBound ? 'HYPERDRIVE_EDGE_POOL' : 'DIRECT_FALLBACK',
      hyperdriveActive: isHyperdriveBound,
      targetPort: 5432,
    },
    checks: {
      rawPgDriver: pgSuccess ? 'OK' : 'FAIL',
      prismaAdapterPg: prismaSuccess ? 'OK' : 'FAIL',
    },
    timestamp: new Date().toISOString(),
  });
}
