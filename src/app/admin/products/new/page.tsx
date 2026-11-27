import React from 'react';
import Link from 'next/link';
import { requirePermission } from '@/lib/dal';
import { prisma } from '@/lib/db';
import { AdminSidebar } from '@/components/AdminSidebar';
import { ProductNewForm } from '@/components/ProductNewForm';
import { getSynchronizedCategories } from '@/actions/categories';
import { getGlobalSizePrices } from '@/actions/settings';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AdminProductsNewPage({
  searchParams
}: {
  searchParams?: Promise<{ channel?: string; barcode?: string; [key: string]: string | string[] | undefined }>;
}) {
  const session = await requirePermission('manage:products');
  const sp = searchParams ? await searchParams : {};
  const requestedChannel = typeof sp.channel === 'string' ? sp.channel.toUpperCase() : undefined;
  const requestedBarcode = typeof sp.barcode === 'string' ? sp.barcode.trim() : undefined;
  let user: any = session.employee || { name: 'مدير النظام (غزل)', role: { name: 'ADMIN' } };
  
  let categories: any[] = [];
  let brands: any[] = [];
  let genders: any[] = [];
  let seasons: any[] = [];
  let families: any[] = [];
  let globalPrices: any = { '50ml': 10000, '100ml': 15000, '200ml': 25000 };
  let nextSku = `GHZ-${Math.floor(1000 + Math.random() * 9000)}`;

  try {
    const [dbUser, dbCats, dbBrands, dbGenders, dbSeasons, dbFamilies, dbPrices, lastProduct] = await Promise.all([
      prisma.employee.findUnique({
        where: { id: session.employeeId },
        include: { role: true }
      }),
      prisma.category.findMany({ select: { id: true, name: true, channel: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
      prisma.brand.findMany({ orderBy: { name: 'asc' } }),
      prisma.gender.findMany({ orderBy: { name: 'asc' } }),
      prisma.season.findMany({ orderBy: { name: 'asc' } }),
      prisma.fragranceFamily.findMany({ orderBy: { name: 'asc' } }),
      getGlobalSizePrices(),
      prisma.product.findFirst({
        where: { sku: { startsWith: 'GHZ-' } },
        orderBy: { sku: 'desc' }
      })
    ]);

    if (dbUser) user = dbUser;
    categories = dbCats || [];
    brands = dbBrands || [];
    genders = dbGenders || [];
    seasons = dbSeasons || [];
    families = dbFamilies || [];
    if (dbPrices) globalPrices = dbPrices;

    let nextSkuNumber = 1;
    if (lastProduct && lastProduct.sku) {
      const match = lastProduct.sku.match(/GHZ-(\d+)/);
      if (match) {
        nextSkuNumber = parseInt(match[1], 10) + 1;
      }
    }
    nextSku = `GHZ-${nextSkuNumber.toString().padStart(4, '0')}`;
  } catch (err) {
    console.warn('Prisma AdminProductsNewPage query fallback active');
  }

  if (categories.length === 0) {
    categories = await getSynchronizedCategories();
  }

  if (brands.length === 0) {
    brands = [
      { id: 'b-1', name: "L'ORÉAL PARIS", nameAr: 'لوريال باريس' },
      { id: 'b-2', name: 'MAYBELLINE NEW YORK', nameAr: 'مايبيلين نيويورك' },
      { id: 'b-3', name: 'NYX MAKEUP', nameAr: 'نيكس بروفيشينال' },
      { id: 'b-4', name: 'LANEIGE', nameAr: 'لانيج' },
      { id: 'b-5', name: 'GHAZAL EXCLUSIVE', nameAr: 'غزل حصري' },
      { id: 'b-6', name: 'KÉRASTASE', nameAr: 'كيراستاس باريس' },
    ];
  }

  return (
    <div className="flex flex-col md:flex-row h-screen bg-[#FAFAFA] overflow-hidden" dir="rtl">
      <AdminSidebar employeeName={user?.name || ''} roleName={user?.role?.name || "ADMIN"} />

      <main className="flex-1 overflow-y-auto p-4 md:p-8 font-sans w-full max-w-full">
        <div className="mb-6 border-b border-zinc-200 pb-4">
          <div className="flex items-center gap-3 mb-2">
            <Link href="/admin/products" className="text-xs text-zinc-500 hover:underline">المنتجات والأسعار</Link>
            <span className="text-zinc-300">/</span>
            <span className="text-xs font-bold text-zinc-700">إضافة منتج جديد</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-6 bg-[#E6007E] rounded-full inline-block"></span>
            <h1 className="text-2xl font-bold font-heading text-zinc-900">
              إضافة منتج تجميل جديد
            </h1>
          </div>
        </div>

        <ProductNewForm 
          categories={categories.map(c => ({ id: c.id, name: c.name, channel: (c as any).channel || 'SHARED' }))} 
          brands={brands.map(b => ({ id: b.id, name: b.name, nameAr: b.nameAr }))}
          genders={genders.map(g => ({ id: g.id, name: g.name }))}
          seasons={seasons.map(s => ({ id: s.id, name: s.name }))}
          families={families.map(f => ({ id: f.id, name: f.name }))}
          globalPrices={globalPrices}
          nextSku={nextSku}
          initialChannel={requestedChannel === 'ONLINE' ? 'ONLINE' : (requestedChannel === 'POS' ? 'POS' : (requestedChannel === 'SHARED' ? 'SHARED' : undefined))}
          initialBarcode={requestedBarcode}
        />
      </main>
    </div>
  );
}
