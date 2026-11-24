import React from 'react';
import Link from 'next/link';
import { requirePermission } from '@/lib/dal';
import { prisma } from '@/lib/db';
import { AdminSidebar } from '@/components/AdminSidebar';
import { ProductEditForm } from '@/components/ProductEditForm';
import { getProductCustomBadges } from '@/actions/products';
import { getSynchronizedCategories } from '@/actions/categories';
import { COSMETICS_CATALOG } from '@/lib/cosmetics-catalog';
import { notFound } from 'next/navigation';

export default async function AdminProductEditPage({
  params
}: {
  params: Promise<{ id: string }>
}) {
  const session = await requirePermission('manage:products');
  let user: any = session.employee || { name: 'مدير النظام (غزل)', role: { name: 'ADMIN' } };
  const { id } = await params;

  let product: any = null;
  let categories: any[] = [];
  let brands: any[] = [];
  let genders: any[] = [];
  let seasons: any[] = [];
  let families: any[] = [];
  let allAccords: any[] = [];
  let allProducts: any[] = [];

  try {
    const dbUser = await prisma.employee.findUnique({
      where: { id: session.employeeId },
      include: { role: true }
    });
    if (dbUser) user = dbUser;

    const [dbProduct, dbCats, dbBrands, dbGenders, dbSeasons, dbFamilies, dbAccords, dbProducts] = await Promise.all([
      prisma.product.findUnique({
        where: { id },
        include: {
          category: true,
          images: true,
          variants: { orderBy: { createdAt: 'asc' } },
          accords: { include: { accord: true }, orderBy: { order: 'asc' } },
          similarProducts: { include: { similar: { include: { images: { where: { isMain: true }, take: 1 } } } }, orderBy: { order: 'asc' } },
        }
      }),
      prisma.category.findMany({ orderBy: { name: 'asc' } }),
      prisma.brand.findMany({ orderBy: { name: 'asc' } }),
      prisma.gender.findMany({ orderBy: { name: 'asc' } }),
      prisma.season.findMany({ orderBy: { name: 'asc' } }),
      prisma.fragranceFamily.findMany({ orderBy: { name: 'asc' } }),
      prisma.accord.findMany({ orderBy: { name: 'asc' } }),
      prisma.product.findMany({
        where: { id: { not: id }, isVisible: true },
        include: { images: { where: { isMain: true }, take: 1 } },
        orderBy: { nameAr: 'asc' },
      })
    ]);

    product = dbProduct;
    categories = dbCats || [];
    brands = dbBrands || [];
    genders = dbGenders || [];
    seasons = dbSeasons || [];
    families = dbFamilies || [];
    allAccords = dbAccords || [];
    allProducts = dbProducts || [];
  } catch (err) {
    console.warn('Prisma AdminProductEditPage query fallback active');
  }

  if (categories.length === 0) {
    categories = await getSynchronizedCategories();
  }

  const customBadges = await getProductCustomBadges();

  if (!product) {
    notFound();
  }

  const assignedTag = (product as any)?.tag || 
    (product?.reviewReasons?.startsWith('TAG:') ? product.reviewReasons.replace('TAG:', '') : null) || 
    customBadges[id] || 
    customBadges[product?.slug] || 
    '';

  const initialData = {
    nameAr: product.nameAr,
    nameEn: product.nameEn || '',
    sku: product.sku,
    tag: assignedTag,
    shortDescription: product.shortDescription,
    longDescription: product.longDescription,
    isVisible: product.isVisible,
    isFeatured: product.isFeatured,
    categoryId: product.categoryId,
    brandId: product.brandId,
    genderId: product.genderId,
    seasonId: product.seasonId,
    familyId: product.familyId,
    variants: product.variants.map((v: any) => ({
      id: v.id,
      size: v.size,
      shade: v.shade || '',
      colorName: v.colorName || '',
      colorHex: v.colorHex || '#E6007E',
      barcode: v.barcode || '',
      sku: v.sku,
      price: v.price,
      costPrice: v.costPrice ?? (v.price ? Math.round(v.price * 0.55) : 0),
      compareAt: v.compareAt ?? undefined,
      isActive: v.isActive
    })),
    images: product.images.map((img: any) => ({
      id: img.id,
      url: img.url,
      isMain: img.isMain
    })),
    accords: product.accords.map((a: any) => ({
      accordId: a.accordId,
      name: a.accord?.name || '',
      color: a.accord?.color || '#E6007E',
      value: a.value,
      order: a.order,
    })),
    similarProductIds: product.similarProducts.map((sp: any) => sp.similarId),
  };

  return (
    <div className="flex flex-col md:flex-row h-screen bg-[#FAFAFA] overflow-hidden" dir="rtl">
      <AdminSidebar employeeName={user?.name || ''} roleName={user?.role?.name || "ADMIN"} />

      <main className="flex-1 overflow-y-auto p-4 md:p-8 font-sans w-full max-w-full">
        <div className="mb-6 border-b border-zinc-200 pb-4">
          <div className="flex items-center gap-3 mb-2">
            <Link href="/admin/products" className="text-xs text-zinc-500 hover:underline">المنتجات والأسعار</Link>
            <span className="text-zinc-300">/</span>
            <span className="text-xs font-bold text-zinc-700">تعديل المنتج</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-6 bg-[#E6007E] rounded-full inline-block"></span>
            <h1 className="text-2xl font-bold font-heading text-zinc-900">
              تعديل: {product.nameAr}
            </h1>
          </div>
        </div>

        <ProductEditForm
          productId={product.id}
          initialData={initialData}
          categories={categories.map(c => ({ id: c.id, name: c.name }))}
          brands={brands.map(b => ({ id: b.id, name: b.name, nameAr: b.nameAr }))}
          genders={genders.map(g => ({ id: g.id, name: g.name }))}
          seasons={seasons.map(s => ({ id: s.id, name: s.name }))}
          families={families.map(f => ({ id: f.id, name: f.name }))}
          allAccords={allAccords.map(a => ({ id: a.id, name: a.name, color: a.color }))}
          allProducts={allProducts.map(p => ({
            id: p.id,
            nameAr: p.nameAr,
            nameEn: p.nameEn,
            sku: p.sku,
            imageUrl: p.images[0]?.url || null,
          }))}
        />
      </main>
    </div>
  );
}
