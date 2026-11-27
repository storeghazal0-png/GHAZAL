import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const dbUrl = process.env.DATABASE_URL || '';
  const directUrl = process.env.DIRECT_URL || '';
  
  let host = '';
  if (dbUrl.includes('@')) {
    host = dbUrl.split('@')[1]?.split('/')[0] || '';
  }

  try {
    const productCount = await prisma.product.count();
    const onlineCount = await prisma.product.count({
      where: {
        isVisible: true,
        channel: { in: ['ONLINE', 'SHARED'] },
      },
    });

    return NextResponse.json({
      status: 'ok',
      hasDbUrl: Boolean(dbUrl),
      hasDirectUrl: Boolean(directUrl),
      host,
      productCount,
      onlineCount,
    });
  } catch (error: any) {
    return NextResponse.json({
      status: 'error',
      hasDbUrl: Boolean(dbUrl),
      hasDirectUrl: Boolean(directUrl),
      host,
      errorMessage: error?.message || String(error),
      errorCode: error?.code,
      errorStack: error?.stack,
    }, { status: 500 });
  }
}
