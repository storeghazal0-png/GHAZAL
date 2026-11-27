import { NextResponse } from 'next/server';
import { Client } from 'pg';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const dbUrl = process.env.DATABASE_URL || '';
  const directUrl = process.env.DIRECT_URL || '';
  
  const results: Record<string, any> = {
    hasDbUrl: Boolean(dbUrl),
    hasDirectUrl: Boolean(directUrl),
  };

  // Test 1: Direct Client with port 5432 and ssl: true
  if (directUrl || dbUrl) {
    const url5432 = (directUrl || dbUrl).replace(':6543', ':5432');
    const c5432 = new Client({
      connectionString: url5432,
      ssl: true,
    });
    try {
      await c5432.connect();
      const res = await c5432.query('SELECT count(*)::int as count FROM "Product" WHERE "isVisible" = true');
      results.test5432_sslTrue = { success: true, count: res.rows[0]?.count };
      await c5432.end();
    } catch (e: any) {
      results.test5432_sslTrue = { success: false, error: e.message, code: e.code };
    }
  }

  // Test 2: Direct Client with port 6543 and ssl: true
  if (dbUrl) {
    const c6543 = new Client({
      connectionString: dbUrl,
      ssl: true,
    });
    try {
      await c6543.connect();
      const res = await c6543.query('SELECT count(*)::int as count FROM "Product" WHERE "isVisible" = true');
      results.test6543_sslTrue = { success: true, count: res.rows[0]?.count };
      await c6543.end();
    } catch (e: any) {
      results.test6543_sslTrue = { success: false, error: e.message, code: e.code };
    }
  }

  // Test 3: Prisma query
  try {
    const prismaCount = await prisma.product.count({
      where: {
        isVisible: true,
        channel: { in: ['ONLINE', 'SHARED'] },
      },
    });
    results.prismaQuery = { success: true, count: prismaCount };
  } catch (e: any) {
    results.prismaQuery = { success: false, error: e.message, stack: e.stack };
  }

  return NextResponse.json(results);
}
