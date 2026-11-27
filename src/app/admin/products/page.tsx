import React from 'react';
import { requireAuth } from '@/lib/dal';
import { prisma } from '@/lib/db';
import { AdminSidebar } from '@/components/AdminSidebar';
import { getGlobalSizePrices } from '@/actions/settings';
import { getProductCustomBadges } from '@/actions/products';
import { getSynchronizedCategories } from '@/actions/categories';
import { AdminProductsClient } from './AdminProductsClient';
import { filsToDisplay } from '@/lib/money';
import { COSMETICS_CATALOG } from '@/lib/cosmetics-catalog';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AdminProductsPage({
  searchParams
}: {
  searchParams?: Promise<{ channel?: string; [key: string]: string | string[] | undefined }>;
}) {
  const session = await requireAuth();
  const globalPrices = await getGlobalSizePrices();
  const sp = searchParams ? await searchParams : {};
  const initialChannelParam = typeof sp.channel === 'string' ? sp.channel.toLowerCase() : 'all';

  let products: any[] = [];
  let categories: any[] = [];

  try {
    products = await prisma.product.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        slug: true,
        nameAr: true,
        nameEn: true,
        sku: true,
        channel: true,
        isVisible: true,
        reviewReasons: true,
        category: { select: { id: true, name: true } },
        brand: { select: { id: true, name: true, nameAr: true } },
        variants: {
          select: {
            id: true,
            size: true,
            shade: true,
            price: true,
            costPrice: true,
            barcode: true,
            sku: true,
            isActive: true
          }
        },
        images: {
          where: { isMain: true },
          select: { url: true, isMain: true },
          take: 1
        }
      }
    });
    categories = await prisma.category.findMany({
      select: { id: true, name: true, channel: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }]
    });
  } catch (err) {
    console.warn('Prisma product query skipped:', err);
  }

  const customBadges = await getProductCustomBadges();

  products = products.map(p => ({
    ...p,
    tag: (p.reviewReasons?.startsWith('TAG:') ? p.reviewReasons.replace('TAG:', '') : null) || customBadges[p.id] || customBadges[p.slug] || p.tag || undefined
  }));

  if (categories.length === 0) {
    categories = await getSynchronizedCategories();
  }

  return (
    <div className="flex flex-col md:flex-row h-screen bg-[var(--color-ivory-100)] overflow-hidden" dir="rtl">
      <AdminSidebar employeeName={session.employee.name} roleName={session?.employee?.role?.name || "ADMIN"} />

      <main className="flex-1 overflow-y-auto p-4 md:p-8 font-sans w-full max-w-full">
        <AdminProductsClient 
          products={products} 
          globalPrices={globalPrices} 
          adminId={session.employee.id} 
          categories={categories}
          initialChannelParam={initialChannelParam}
        />
      </main>
    </div>
  );
}
