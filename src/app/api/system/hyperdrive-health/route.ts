import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { checkSessionAuth } from '@/lib/dal';

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

  // Execute SELECT 1 through Hyperdrive / Prisma
  try {
    const t0 = performance.now();
    const queryResult = await prisma.$queryRaw<Array<{ result: number }>>`SELECT 1 as result`;
    const latencyMs = Math.round((performance.now() - t0) * 100) / 100;

    let isHyperdriveBound = false;
    try {
      const cf = getCloudflareContext();
      isHyperdriveBound = Boolean((cf?.env as any)?.HYPERDRIVE?.connectionString);
    } catch {}

    const isHealthy = Boolean(queryResult && queryResult.length > 0 && queryResult[0].result === 1);

    return NextResponse.json({
      status: isHealthy ? 'HEALTHY' : 'DEGRADED',
      query: 'SELECT 1',
      latencyMs,
      connectionMode: isHyperdriveBound ? 'HYPERDRIVE_EDGE_POOL' : 'DIRECT_FALLBACK',
      hyperdriveActive: isHyperdriveBound,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        status: 'UNHEALTHY',
        query: 'SELECT 1',
        error: error?.message ? String(error.message).slice(0, 150) : 'Database execution error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
