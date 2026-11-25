import React from 'react';
import { requireAuth } from '@/lib/dal';
import { prisma } from '@/lib/db';
import { AdminSidebar } from '@/components/AdminSidebar';
import { filsToDisplay } from '@/lib/money';
import Link from 'next/link';
import { DashboardAnalyticsSection, ProductSaleStat } from './DashboardAnalyticsSection';

const AdminDashboardPage = async ({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) => {
  const session = await requireAuth();

  const resolvedParams = await searchParams;
  const filter = resolvedParams.filter || 'all';
  let dateFilter = {};
  const now = new Date();
  if (filter === 'today') {
    dateFilter = { createdAt: { gte: new Date(now.setHours(0,0,0,0)) } };
  } else if (filter === 'week') {
    dateFilter = { createdAt: { gte: new Date(now.setDate(now.getDate() - 7)) } };
  } else if (filter === 'month') {
    dateFilter = { createdAt: { gte: new Date(now.setMonth(now.getMonth() - 1)) } };
  }

  // Query actual metrics from DB
  let totalOrders = 0;
  let totalProducts = 0;
  let totalSales: any[] = [];
  let totalBrands = 0;
  let recentSales: any[] = [];
  let recentOrders: any[] = [];
  let dbProductsList: any[] = [];

  try {
    const [dbOrders, dbProducts, dbSales, dbBrands, dbRecentSales, dbRecentOrders, dbProductsData] = await Promise.all([
      prisma.order.count({ where: dateFilter }),
      prisma.product.count(),
      prisma.sale.findMany({ where: dateFilter, select: { total: true } }),
      prisma.brand.count(),
      prisma.sale.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { employee: { select: { name: true } }, items: true }
      }),
      prisma.order.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5
      }),
      prisma.product.findMany({
        include: { brand: true, category: true, variants: true }
      })
    ]);
    totalOrders = dbOrders;
    totalProducts = dbProducts;
    totalSales = dbSales;
    totalBrands = dbBrands;
    recentSales = dbRecentSales;
    recentOrders = dbRecentOrders;
    dbProductsList = dbProductsData;
  } catch (err) {
    console.warn('Prisma dashboard metrics skipped or offline:', err);
  }

  const totalSalesRevenue = totalSales.reduce((acc, s) => acc + s.total, 0);

  // Calculate Product Sales Breakdown (POS Cash vs Online Store)
  let saleItems: any[] = [];
  let orderItems: any[] = [];
  try {
    const [dbSaleItems, dbOrderItems] = await Promise.all([
      prisma.saleItem.findMany({
        where: { sale: { status: 'COMPLETED' } },
        select: {
          name: true,
          sku: true,
          quantity: true,
          unitPrice: true,
          total: true,
        }
      }),
      prisma.orderItem.findMany({
        where: { order: { status: { not: 'CANCELLED' } } },
        select: {
          name: true,
          sku: true,
          quantity: true,
          unitPrice: true,
          total: true,
        }
      })
    ]);
    saleItems = dbSaleItems;
    orderItems = dbOrderItems;
  } catch (err) {
    console.warn('Prisma analytics fetch skipped or offline:', err);
  }

  // Calculate product sales statistics purely from DB products and real sales
  const productStats: ProductSaleStat[] = dbProductsList.map((p) => {
    const pSaleItems = saleItems.filter(si => si.sku === p.sku || (si.name && p.nameAr && si.name.includes(p.nameAr)));
    const pOrderItems = orderItems.filter(oi => oi.sku === p.sku || (oi.name && p.nameAr && oi.name.includes(p.nameAr)));
    const posQty = pSaleItems.reduce((acc, it) => acc + (it.quantity || 0), 0);
    const posRevenueFils = pSaleItems.reduce((acc, it) => acc + (it.total || (it.unitPrice || 0) * (it.quantity || 0)), 0);
    const onlineQty = pOrderItems.reduce((acc, it) => acc + (it.quantity || 0), 0);
    const onlineRevenueFils = pOrderItems.reduce((acc, it) => acc + (it.total || (it.unitPrice || 0) * (it.quantity || 0)), 0);

    return {
      id: p.id,
      name: p.nameAr,
      brand: p.brand?.nameAr || p.brand?.nameEn || 'غزل',
      category: p.category?.nameAr || p.category?.nameEn || 'مستحضرات',
      priceFils: p.basePrice || p.variants?.[0]?.price || 0,
      posQty,
      posRevenueFils,
      onlineQty,
      onlineRevenueFils,
      totalQty: posQty + onlineQty,
      totalRevenueFils: posRevenueFils + onlineRevenueFils,
    };
  });

  return (
    <div className="flex flex-col md:flex-row h-screen bg-[#FAFAFA] overflow-hidden" dir="rtl">
      {/* Sidebar on the right */}
      <AdminSidebar employeeName={session.employee.name} roleName={session?.employee?.role?.name || "ADMIN"} />

      {/* Main Content Area on the left */}
      <main className="flex-1 overflow-y-auto p-4 md:p-8 font-sans w-full max-w-full">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 border-b border-zinc-200 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-6 bg-[#E6007E] rounded-full inline-block"></span>
              <h1 className="text-2xl md:text-3xl font-bold font-heading text-zinc-900">
                لوحة التحكم – غزل لمستحضرات التجميل
              </h1>
            </div>
            <p className="text-zinc-500 mt-1 text-sm">
              مرحباً بك مجدداً، {session.employee.name} | متابعة حية لعمليات المتجر ونقاط البيع POS
            </p>
          </div>
          <div className="flex flex-wrap gap-2 mt-4 md:mt-0">
            <Link href="/admin/dashboard?filter=today" className={`px-4 py-2 rounded-lg text-sm font-medium transition ${filter === 'today' ? 'bg-[#1A1A1A] text-white shadow-sm' : 'bg-white border text-zinc-600 hover:bg-zinc-50'}`}>اليوم</Link>
            <Link href="/admin/dashboard?filter=week" className={`px-4 py-2 rounded-lg text-sm font-medium transition ${filter === 'week' ? 'bg-[#1A1A1A] text-white shadow-sm' : 'bg-white border text-zinc-600 hover:bg-zinc-50'}`}>هذا الأسبوع</Link>
            <Link href="/admin/dashboard?filter=month" className={`px-4 py-2 rounded-lg text-sm font-medium transition ${filter === 'month' ? 'bg-[#1A1A1A] text-white shadow-sm' : 'bg-white border text-zinc-600 hover:bg-zinc-50'}`}>هذا الشهر</Link>
            <Link href="/admin/dashboard?filter=all" className={`px-4 py-2 rounded-lg text-sm font-medium transition ${filter === 'all' ? 'bg-[#1A1A1A] text-white shadow-sm' : 'bg-white border text-zinc-600 hover:bg-zinc-50'}`}>الكل</Link>
          </div>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-zinc-100 relative overflow-hidden">
            <div className="absolute top-0 right-0 left-0 h-1 bg-[#E6007E]"></div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">إجمالي طلبات المتجر</h3>
            <p className="text-3xl font-bold text-zinc-900">{totalOrders}</p>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-zinc-100 relative overflow-hidden">
            <div className="absolute top-0 right-0 left-0 h-1 bg-[#1A1A1A]"></div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">كتالوج المنتجات النشطة</h3>
            <p className="text-3xl font-bold text-zinc-900">{totalProducts}</p>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-zinc-100 relative overflow-hidden">
            <div className="absolute top-0 right-0 left-0 h-1 bg-emerald-500"></div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">إيرادات الكاشير (POS)</h3>
            <p className="text-3xl font-bold text-emerald-600">
              {filsToDisplay(totalSalesRevenue, 'ar')}
            </p>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-zinc-100 relative overflow-hidden">
            <div className="absolute top-0 right-0 left-0 h-1 bg-fuchsia-600"></div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">الماركات المعتمدة</h3>
            <p className="text-3xl font-bold text-zinc-900">{totalBrands}</p>
          </div>
        </div>

        {/* Sales Performance Analytics: Top & Least Selling by Channel */}
        <DashboardAnalyticsSection initialStats={productStats} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Recent Orders */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-zinc-100">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-zinc-900">أحدث طلبات المتجر الإلكتروني</h2>
              <Link href="/admin/orders" className="text-xs text-[#E6007E] font-bold hover:underline">عرض الكل</Link>
            </div>
            <div className="divide-y divide-zinc-100">
              {recentOrders.map((order) => (
                <div key={order.id} className="py-3 flex justify-between items-center">
                  <div>
                    <span className="font-bold text-zinc-900 font-mono text-sm">{order.reference}</span>
                    <p className="text-xs text-zinc-500">{order.customerName}</p>
                  </div>
                  <div className="text-left">
                    <span className="text-sm font-bold text-zinc-900">
                      {filsToDisplay(order.totalAmount, 'ar')}
                    </span>
                    <span className={`block text-[10px] px-2 py-0.5 rounded font-bold mt-1 text-center ${order.status === 'CONFIRMED' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                      {order.status}
                    </span>
                  </div>
                </div>
              ))}

              {recentOrders.length === 0 && (
                <p className="text-zinc-400 py-8 text-center text-sm">لا توجد طلبات متجر مسجلة حالياً.</p>
              )}
            </div>
          </div>

          {/* Recent POS Sales */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-zinc-100">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-zinc-900">أحدث مبيعات الكاشير (POS)</h2>
            </div>
            <div className="divide-y divide-zinc-100">
              {recentSales.map((sale) => (
                <div key={sale.id} className="py-3 flex justify-between items-center">
                  <div>
                    <span className="font-bold text-zinc-900 font-mono text-sm">{sale.reference || sale.id.substring(0, 8)}</span>
                    <p className="text-xs text-zinc-500">الكاشير: {sale.employee?.name || 'كاشير'} • {sale.items?.length || 0} قطع</p>
                  </div>
                  <div className="text-left">
                    <span className="text-sm font-bold text-emerald-600">
                      {filsToDisplay(sale.total, 'ar')}
                    </span>
                    <span className="block text-[10px] text-zinc-400 mt-1" dir="ltr">
                      {new Date(sale.createdAt).toLocaleTimeString('ar-JO-u-nu-latn', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              ))}

              {recentSales.length === 0 && (
                <p className="text-zinc-400 py-8 text-center text-sm">لا توجد عمليات بيع بالكاشير مسجلة اليوم.</p>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default AdminDashboardPage;
