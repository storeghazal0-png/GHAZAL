import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { performDataRetentionCleanup } from '@/lib/data-retention';

/**
 * Cron Job — تنظيف دوري للبيانات وحفظ مساحة التخزين (Supabase Free Tier)
 * يُنفذ أسبوعياً تلقائياً عبر Vercel Cron أو استدعاء مجدول
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret) {
    const authHeader = request.headers.get('authorization') || '';
    const expectedHeader = `Bearer ${cronSecret}`;

    let isAuthorized = false;
    try {
      const authBuf = Buffer.from(authHeader);
      const expBuf = Buffer.from(expectedHeader);
      isAuthorized = authBuf.length === expBuf.length && crypto.timingSafeEqual(authBuf, expBuf);
    } catch {
      isAuthorized = false;
    }

    if (!isAuthorized) {
      return new NextResponse('Unauthorized', { status: 401 });
    }
  }

  try {
    const result = await performDataRetentionCleanup({ trigger: 'VERCEL_CRON' });
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[Cron data-retention] Error:', error);
    return NextResponse.json({ error: error?.message || 'Data retention cleanup failed' }, { status: 500 });
  }
}
