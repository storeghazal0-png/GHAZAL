import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

declare global {
  var __prismaPool: Pool | undefined;
  var __prismaClient: PrismaClient | undefined;
}

const connectionString = (process.env.NODE_ENV === 'test' && process.env.TEST_DATABASE_URL)
  ? process.env.TEST_DATABASE_URL
  : (process.env.DATABASE_URL || process.env.DIRECT_URL || '');

const isDev = process.env.NODE_ENV !== 'production';
const isRemoteDb = Boolean(
  connectionString && 
  !connectionString.includes('localhost') && 
  !connectionString.includes('127.0.0.1')
);

// إعداد Connection Pool متوافق مع البيئات السحابية والخوادم اللامركزية (Netlify Serverless)
const poolConfig = {
  connectionString,
  // الحد الأقصى للاتصالات المتزامنة
  max: parseInt(process.env.DB_POOL_MAX || (isDev ? '5' : '10')),
  // إغلاق الاتصال الخامل بعد 20 ثانية لتوفير موارد الخادم
  idleTimeoutMillis: 20000,
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


