import { cache } from 'react';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { getCloudflareContext } from '@opennextjs/cloudflare';

declare global {
  var __localPrismaClient: PrismaClient | undefined;
}

/**
 * Resolves the appropriate PostgreSQL connection string:
 * 1. Cloudflare Hyperdrive binding (runtime on Cloudflare Workers)
 * 2. Cloudflare env variables (DATABASE_URL / DIRECT_URL)
 * 3. Local/Build process.env (Local dev, Next.js build, Prisma CLI, tests)
 */
function resolveDatabaseConnection(): { connectionString: string; isHyperdrive: boolean } {
  // 1. Try Cloudflare Worker context (Hyperdrive binding)
  try {
    const cf = getCloudflareContext();
    const env = (cf?.env as any) || {};

    // Hyperdrive provides a local edge connection string to Cloudflare's pooled TCP proxy
    if (env.HYPERDRIVE?.connectionString) {
      return {
        connectionString: env.HYPERDRIVE.connectionString,
        isHyperdrive: true,
      };
    }

    if (env.DATABASE_URL || env.DIRECT_URL) {
      let envConn = env.DATABASE_URL || env.DIRECT_URL;
      if (envConn.includes('pooler.supabase.com:6543')) {
        envConn = envConn.replace(':6543', ':5432');
      }
      return {
        connectionString: envConn,
        isHyperdrive: false,
      };
    }
  } catch {
    // getCloudflareContext throws when called outside Cloudflare runtime (e.g. Next build)
  }

  // 2. Node.js process.env fallback (local dev, static build, tests)
  let rawConnection = (process.env.NODE_ENV === 'test' && process.env.TEST_DATABASE_URL)
    ? process.env.TEST_DATABASE_URL
    : (process.env.DATABASE_URL || process.env.DIRECT_URL || '');

  // Supabase transaction pooler on port 6543 terminates abruptly on edge V8 isolates;
  // port 5432 session mode or Hyperdrive is required.
  if (rawConnection.includes('pooler.supabase.com:6543')) {
    rawConnection = rawConnection.replace(':6543', ':5432');
  }

  return {
    connectionString: rawConnection,
    isHyperdrive: false,
  };
}

/**
 * Creates a configured PrismaClient with @prisma/adapter-pg.
 */
function createPrismaClient(connectionString: string, isHyperdrive: boolean): PrismaClient {
  const isDev = process.env.NODE_ENV !== 'production';
  const isRemoteDb = Boolean(
    connectionString && 
    !connectionString.includes('localhost') && 
    !connectionString.includes('127.0.0.1')
  );

  const pool = new Pool({
    connectionString,
    // When using Cloudflare Hyperdrive: maxUses: 1 ensures each socket is cleanly released
    // back to Hyperdrive after every query checkout, preventing stale socket termination
    // across Cloudflare Worker isolate ticks.
    maxUses: isHyperdrive ? 1 : undefined,
    max: isHyperdrive ? 10 : parseInt(process.env.DB_POOL_MAX || (isDev ? '5' : '10')),
    idleTimeoutMillis: isHyperdrive ? 1000 : (isRemoteDb ? 5000 : 20000),
    connectionTimeoutMillis: 10000,
    min: 0,
    // Hyperdrive handles SSL/TLS termination automatically.
    // Only pass custom SSL for direct non-Hyperdrive remote connections.
    ssl: isHyperdrive ? undefined : (isRemoteDb ? { rejectUnauthorized: false } : undefined),
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
 * React cache() scopes client lifecycle to the current HTTP request / action.
 * During a single request, all operations share the same client.
 * Across requests, a fresh client is created, eliminating socket carryover across frozen isolates.
 */
const getRequestScopedPrismaClient = cache((): PrismaClient => {
  const { connectionString, isHyperdrive } = resolveDatabaseConnection();
  return createPrismaClient(connectionString, isHyperdrive);
});

export function getPrismaClient(): PrismaClient {
  const isCloudflare = Boolean(
    typeof globalThis !== 'undefined' &&
    (typeof (globalThis as any).WebSocketPair !== 'undefined' ||
     (typeof navigator !== 'undefined' && (navigator as any)?.userAgent === 'Cloudflare-Workers'))
  );

  // In non-Cloudflare environments (local dev, next build, tests, CLI),
  // cache globally to prevent connection exhaustion.
  if (!isCloudflare) {
    if (!global.__localPrismaClient) {
      const { connectionString, isHyperdrive } = resolveDatabaseConnection();
      global.__localPrismaClient = createPrismaClient(connectionString, isHyperdrive);
    }
    return global.__localPrismaClient;
  }

  // In Cloudflare Worker: use request-scoped caching
  try {
    return getRequestScopedPrismaClient();
  } catch {
    // Fallback if accessed outside React render/action scope
    const { connectionString, isHyperdrive } = resolveDatabaseConnection();
    return createPrismaClient(connectionString, isHyperdrive);
  }
}

/**
 * Transparent Proxy for universal backward compatibility.
 * All existing call sites (`import { prisma } from '@/lib/db'`) work seamlessly.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getPrismaClient();
    const value = Reflect.get(client, prop, receiver);
    if (typeof value === 'function') {
      return value.bind(client);
    }
    return value;
  },
});
