import React from 'react';
import { requireAuth } from '@/lib/dal';
import { AdminSidebar } from '@/components/AdminSidebar';
import { prisma } from '@/lib/db';
import { getRewardsDashboardDataAction } from '@/actions/rewards';
import { getSynchronizedCategories } from '@/actions/categories';
import AdminRewardsClient from './AdminRewardsClient';

export default async function AdminRewardsPage({
  searchParams
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await requireAuth();
  const sp = searchParams ? await searchParams : {};
  const period = typeof sp.period === 'string' ? sp.period : 'LAST_30_DAYS';
  const requestedTab = typeof sp.tab === 'string' ? sp.tab : typeof sp.q === 'string' ? sp.q : typeof sp.view === 'string' ? sp.view : 'rules';

  const [dashboardData, categories] = await Promise.all([
    getRewardsDashboardDataAction(period),
    getSynchronizedCategories()
  ]);

  // Load available catalog products from database with categories & variants
  let products: any[] = [];
  try {
    const dbProds = await prisma.product.findMany({
      select: {
        id: true,
        nameAr: true,
        sku: true,
        channel: true,
        categoryId: true,
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
            parentId: true
          }
        },
        images: { select: { url: true }, orderBy: { isMain: 'desc' }, take: 1 },
        variants: { select: { price: true, costPrice: true, barcode: true } }
      },
      take: 3000,
      orderBy: { nameAr: 'asc' }
    });
    if (dbProds && dbProds.length > 0) {
      products = dbProds.map((p: any) => {
        const variantBarcodes = (p.variants || [])
          .map((v: any) => v.barcode)
          .filter((b: any): b is string => Boolean(b && typeof b === 'string' && b.trim().length > 0));
        const primaryBarcode = variantBarcodes[0] || '';
        const allBarcodes = Array.from(new Set([primaryBarcode, ...variantBarcodes].filter(Boolean)));
        const minPrice = p.variants?.length ? Math.min(...p.variants.map((v: any) => v.price)) : 0;
        const costPrice = p.variants?.[0]?.costPrice || Math.round(minPrice * 0.55);

        return {
          id: p.id,
          nameAr: p.nameAr,
          sku: p.sku || '',
          barcode: primaryBarcode,
          barcodes: allBarcodes,
          channel: p.channel || 'SHARED',
          categoryId: p.categoryId || p.category?.id || '',
          categoryName: p.category?.name || '',
          categorySlug: p.category?.slug || '',
          categoryParentId: p.category?.parentId || null,
          imageUrl: p.images?.[0]?.url || '/product-placeholder.png',
          price: minPrice,
          costPrice,
          stock: 99
        };
      });
    }
  } catch (err) {
    console.warn('Could not load products for rewards picker:', err);
  }

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-[var(--color-ivory-100)] overflow-hidden" dir="rtl">
      <AdminSidebar employeeName={session.employee.name} roleName={session?.employee?.role?.name || "ADMIN"} />
      <main className="flex-1 overflow-y-auto w-full max-w-full p-4 md:p-8 font-sans">
        <AdminRewardsClient 
          initialTabParam={requestedTab}
          initialData={dashboardData}
          availableProducts={products}
          categories={categories}
        />
      </main>
    </div>
  );
}
