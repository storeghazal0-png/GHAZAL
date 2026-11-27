import { getCloudflareContext } from '@opennextjs/cloudflare';
import { cache } from 'react';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

declare global {
  var __localPrismaClient: PrismaClient | undefined;
  var __loggedDbMethod: boolean | undefined;
}

/**
 * Safely extracts host/protocol for logs without exposing credentials.
 */
function getSafeHost(urlStr: string): string {
  try {
    const url = new URL(urlStr);
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return 'configured-database-url';
  }
}

/**
 * Instantiates a PrismaClient configured for the current execution environment:
 * - In Cloudflare Workers production: Uses env.HYPERDRIVE.connectionString with PrismaPg({ maxUses: 1 })
 * - In Node.js / Local dev / Next.js build: Uses Pool with DIRECT_URL / DATABASE_URL
 */
function createPrismaClient(): PrismaClient {
  const isDev = process.env.NODE_ENV !== 'production';

  // 1. Cloudflare Workers Runtime with Hyperdrive Binding
  try {
    const cf = getCloudflareContext();
    const env = (cf?.env as any) || {};

    if (env.HYPERDRIVE?.connectionString) {
      if (!globalThis.__loggedDbMethod) {
        console.log('[Database] Connection initialized via Cloudflare Hyperdrive (binding: HYPERDRIVE, maxUses: 1)');
        globalThis.__loggedDbMethod = true;
      }

      // Official OpenNext Hyperdrive integration:
      // PrismaPg with maxUses: 1 releases sockets immediately back to Hyperdrive after checkout
      const adapter = new PrismaPg({
        connectionString: env.HYPERDRIVE.connectionString,
        maxUses: 1,
      });

      return new PrismaClient({
        adapter,
        log: ['error'],
      });
    }

    if (env.DATABASE_URL || env.DIRECT_URL) {
      let envConn = env.DATABASE_URL || env.DIRECT_URL;
      if (envConn.includes('pooler.supabase.com:6543')) {
        envConn = envConn.replace(':6543', ':5432');
      }
      if (!globalThis.__loggedDbMethod) {
        console.log(`[Database] Connection initialized via Cloudflare Env (host: ${getSafeHost(envConn)})`);
        globalThis.__loggedDbMethod = true;
      }
      const adapter = new PrismaPg({
        connectionString: envConn,
        maxUses: 1,
      });
      return new PrismaClient({
        adapter,
        log: ['error'],
      });
    }
  } catch {
    // getCloudflareContext throws outside Cloudflare runtime (e.g. Next build / Node CLI)
  }

  // 2. Node.js Local Development / Build-time / Test Environment
  let rawConnection = (process.env.NODE_ENV === 'test' && process.env.TEST_DATABASE_URL)
    ? process.env.TEST_DATABASE_URL
    : (process.env.DIRECT_URL || process.env.DATABASE_URL || '');

  if (rawConnection.includes('pooler.supabase.com:6543')) {
    rawConnection = rawConnection.replace(':6543', ':5432');
  }

  if (!globalThis.__loggedDbMethod) {
    console.log(`[Database] Connection initialized via Node.js environment (host: ${getSafeHost(rawConnection)})`);
    globalThis.__loggedDbMethod = true;
  }

  const isRemoteDb = Boolean(
    rawConnection &&
    !rawConnection.includes('localhost') &&
    !rawConnection.includes('127.0.0.1')
  );

  const pool = new Pool({
    connectionString: rawConnection,
    max: parseInt(process.env.DB_POOL_MAX || (isDev ? '5' : '10')),
    idleTimeoutMillis: 20000,
    connectionTimeoutMillis: 10000,
    min: 0,
    ssl: isRemoteDb ? { rejectUnauthorized: false } : undefined,
  });

  pool.on('error', (err) => {
    console.error('[DB Pool Error]:', err?.message || err);
  });

  const adapter = new PrismaPg(pool);
  return new PrismaClient({
    adapter,
    log: isDev ? ['error', 'warn'] : ['error'],
  });
}

/**
 * OpenNext official getDb helper.
 * React cache() memoizes the client within each incoming request context,
 * ensuring clean isolation and zero cross-request socket leaks.
 */
export const getDb = cache((): PrismaClient => {
  const isCloudflare = Boolean(
    typeof globalThis !== 'undefined' &&
    (typeof (globalThis as any).WebSocketPair !== 'undefined' ||
     (typeof navigator !== 'undefined' && (navigator as any)?.userAgent === 'Cloudflare-Workers'))
  );

  // In local development or build time, cache globally to avoid pool exhaustion
  if (!isCloudflare) {
    if (!global.__localPrismaClient) {
      global.__localPrismaClient = createPrismaClient();
    }
    return global.__localPrismaClient;
  }

  // In Cloudflare Worker: request-scoped creation via cache()
  return createPrismaClient();
});

/**
 * Backward-compatible helper for code calling getPrismaClient()
 */
export function getPrismaClient(): PrismaClient {
  return getDb();
}

/**
 * Universal Transparent Proxy for existing database access paths.
 * All existing call sites (`import { prisma } from '@/lib/db'`) seamlessly route
 * through `getDb()` to utilize Hyperdrive with zero code changes required.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getDb();
    const value = Reflect.get(client, prop, receiver);
    if (typeof value === 'function') {
      return value.bind(client);
    }
    return value;
  },
});
