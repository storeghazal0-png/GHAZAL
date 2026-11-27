import React from 'react';
import { requireAuth } from '@/lib/dal';
import { prisma } from '@/lib/db';
import { AdminSidebar } from '@/components/AdminSidebar';
import { getSynchronizedCategories } from '@/actions/categories';
import { AdminCategoriesClient } from './AdminCategoriesClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AdminCategoriesPage() {
  const session = await requireAuth();

  const categories = await getSynchronizedCategories();

  let allProducts: any[] = [];
  try {
    allProducts = await prisma.product.findMany({
      select: { id: true, nameAr: true, nameEn: true, channel: true, category: { select: { name: true } }, categoryId: true },
      orderBy: { nameAr: 'asc' }
    });
  } catch (err) {
    console.warn('Prisma products lookup fallback active');
  }

  return (
    <div className="flex flex-col md:flex-row h-screen bg-[var(--color-ivory-100)] overflow-hidden" dir="rtl">
      <AdminSidebar employeeName={session.employee.name} roleName={session?.employee?.role?.name || "ADMIN"} />

      <main className="flex-1 overflow-y-auto p-4 md:p-8 font-sans w-full max-w-full">
        <div className="flex justify-between items-center mb-6 border-b border-[var(--color-ivory-200)] pb-4">
          <div>
            <h1 className="text-3xl font-black font-heading text-[var(--color-charcoal-900)]">
              أقسام وتصنيفات المتجر والكاش
            </h1>
            <p className="text-zinc-600 mt-1 text-sm">
              تقسيم وإدارة أقسام المتجر الإلكتروني، أقسام الكاشير، والأقسام المشتركة مع رفع الصور وترتيب المنتجات
            </p>
          </div>
        </div>

        <AdminCategoriesClient 
          initialCategories={categories}
          allProducts={allProducts}
        />
      </main>
    </div>
  );
}
