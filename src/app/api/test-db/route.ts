import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const count = await prisma.product.count({
      where: { isVisible: true, channel: { in: ['ONLINE', 'SHARED'] } },
    });
    return NextResponse.json({ success: true, onlineProducts: count });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message, stack: e.stack }, { status: 500 });
  }
}
