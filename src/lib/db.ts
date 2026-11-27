import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

declare global {
  var __prismaPool: Pool | undefined;
  var __prismaClient: PrismaClient | undefined;
}

let rawConnection = (process.env.NODE_ENV === 'test' && process.env.TEST_DATABASE_URL)
  ? process.env.TEST_DATABASE_URL
  : (process.env.DATABASE_URL || process.env.DIRECT_URL || '');

// In Cloudflare Workers edge environments, Supabase transaction pooler on port 6543
// abruptly terminates TCP sockets with "Connection terminated unexpectedly".
// Switching to port 5432 (Session mode / direct) maintains full compatibility with V8 edge isolates.
if (rawConnection.includes('pooler.supabase.com:6543')) {
  rawConnection = rawConnection.replace(':6543', ':5432');
}

const connectionString = rawConnection;

const isDev = process.env.NODE_ENV !== 'production';
const isRemoteDb = Boolean(
  connectionString && 
  !connectionString.includes('localhost') && 
  !connectionString.includes('127.0.0.1')
);

const isCloudflare = Boolean(
  typeof globalThis !== 'undefined' &&
  (typeof (globalThis as any).WebSocketPair !== 'undefined' ||
   (typeof navigator !== 'undefined' && (navigator as any)?.userAgent === 'Cloudflare-Workers'))
);

// إعداد Connection Pool متوافق مع البيئات السحابية والخوادم اللامركزية (Cloudflare Workers / Netlify Serverless)
const poolConfig = {
  connectionString,
  // الحد الأقصى للاتصالات المتزامنة (في بيئات Edge نستخدم اتصالات خفيفة لتفادي الاتصالات العالقة)
  max: isCloudflare ? 2 : parseInt(process.env.DB_POOL_MAX || (isDev ? '5' : '10')),
  // إغلاق الاتصال الخامل بسرعة في Edge لتوفير موارد الخادم
  idleTimeoutMillis: isCloudflare ? 2000 : 20000,
  // الحد الأقصى للانتظار على اتصال جديد
  connectionTimeoutMillis: isDev ? 2000 : 10000,
  // الحد الأدنى للاتصالات الجاهزة (يجب أن يكون 0 دائماً في بيئات Serverless لمنع انهيار الحاوية عند بدء التشغيل)
  min: 0,
  // دعم اتصالات SSL لقواعد بيانات Supabase و Neon في السحابة مع قبول شهادات الـ Pooler
  ssl: isRemoteDb ? { rejectUnauthorized: false } : undefined,
};

// تخزين العميل والمجمع عالمياً عبر جميع دورات الاستدعاء السحابية (Serverless Global Caching)
if (!global.__prismaPool) {
  global.__prismaPool = new Pool(poolConfig);
  global.__prismaPool.on('error', (err) => {
    console.error('[DB Pool] Unexpected error on idle client:', err.message);
  });
}
const pool = global.__prismaPool;

if (!global.__prismaClient) {
  const adapter = new PrismaPg(pool);
  global.__prismaClient = new PrismaClient({
    adapter,
    log: isDev ? ['error', 'warn'] : ['error'],
  });
}
const prismaClient = global.__prismaClient;

export const prisma = prismaClient;
export { pool };


