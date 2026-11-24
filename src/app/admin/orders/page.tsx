import React from 'react';
import { requireAuth } from '@/lib/dal';
import { prisma } from '@/lib/db';
import { AdminSidebar } from '@/components/AdminSidebar';
import { filsToDisplay } from '@/lib/money';
import Link from 'next/link';
import { getDemoOrders, GHAZAL_DEMO_ORDERS } from '@/lib/orders-catalog';
import { ShoppingBag, Clock, PackageCheck, Truck, CheckCircle2, XCircle, Layers, Search, Printer, FileText } from 'lucide-react';

export default async function AdminOrdersPage({
  searchParams
}: {
  searchParams: Promise<{ tab?: string; search?: string }>;
}) {
  const session = await requireAuth();
  const params = await searchParams;
  const currentTab = params.tab || 'ALL';
  const searchQuery = (params.search || '').trim();

  // The 6 official status categories requested by the user:
  // 1. الطلبات الجديدة: NEW, PENDING, AWAITING_WHATSAPP
  // 2. مؤكد وقيد التجهيز: CONFIRMED, PREPARING, CONFIRMED_PREPARING
  // 3. تم التجهيز بانتظار التوصيل: PREPARED, READY_FOR_DELIVERY, AWAITING_DELIVERY
  // 4. مع التوصيل: SHIPPED, OUT_FOR_DELIVERY, WITH_COURIER
  // 5. مكتمل: DELIVERED, COMPLETED
  // 6. ملغي: CANCELLED
  const tabStatusMap: Record<string, string[]> = {
    'NEW': ['PENDING', 'AWAITING_WHATSAPP', 'NEW'],
    'PREPARING': ['CONFIRMED', 'PREPARING', 'CONFIRMED_PREPARING'],
    'PREPARED': ['PREPARED', 'READY_FOR_DELIVERY', 'AWAITING_DELIVERY'],
    'SHIPPED': ['SHIPPED', 'OUT_FOR_DELIVERY', 'WITH_COURIER'],
    'COMPLETED': ['DELIVERED', 'COMPLETED'],
    'CANCELLED': ['CANCELLED']
  };

  const normalizedTab = currentTab === 'PENDING' ? 'NEW' : currentTab;

  let orders: any[] = [];
  let allOrdersForCounts: { id: string; status: string }[] = [];
  try {
    const whereClause: any = {};
    if (normalizedTab !== 'ALL') {
      const statusesToFetch = tabStatusMap[normalizedTab] || tabStatusMap['NEW'];
      whereClause.status = { in: statusesToFetch };
    }
    if (searchQuery) {
      whereClause.OR = [
        { reference: { contains: searchQuery, mode: 'insensitive' } },
        { customerName: { contains: searchQuery, mode: 'insensitive' } },
        { customerPhone: { contains: searchQuery, mode: 'insensitive' } },
      ];
    }

    const [dbOrders, countList] = await Promise.all([
      prisma.order.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        include: {
          items: true
        }
      }),
      prisma.order.findMany({
        select: { id: true, status: true }
      })
    ]);
    orders = dbOrders;
    allOrdersForCounts = countList;
  } catch (err) {
    console.warn('Prisma orders query failed');
  }

  // Calculate live badge counts for the tabs from database
  const getTabCount = (tabKey: string) => {
    if (tabKey === 'ALL') {
      return allOrdersForCounts.length;
    }
    const statuses = tabStatusMap[tabKey] || [];
    return allOrdersForCounts.filter(o => statuses.includes(o.status)).length;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'AWAITING_WHATSAPP':
      case 'PENDING':
      case 'NEW':
        return (
          <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-full text-xs font-black">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
            الطلبات الجديدة
          </span>
        );
      case 'CONFIRMED':
      case 'PREPARING':
      case 'CONFIRMED_PREPARING':
        return (
          <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-full text-xs font-black">
            <Clock className="w-3.5 h-3.5 text-amber-500" />
            مؤكد وقيد التجهيز
          </span>
        );
      case 'PREPARED':
      case 'READY_FOR_DELIVERY':
      case 'AWAITING_DELIVERY':
        return (
          <span className="inline-flex items-center gap-1 bg-purple-50 text-purple-700 border border-purple-200 px-2.5 py-1 rounded-full text-xs font-black">
            <PackageCheck className="w-3.5 h-3.5 text-purple-500" />
            تم التجهيز بانتظار التوصيل
          </span>
        );
      case 'SHIPPED':
      case 'OUT_FOR_DELIVERY':
      case 'WITH_COURIER':
        return (
          <span className="inline-flex items-center gap-1 bg-orange-50 text-orange-700 border border-orange-200 px-2.5 py-1 rounded-full text-xs font-black">
            <Truck className="w-3.5 h-3.5 text-orange-500" />
            مع التوصيل
          </span>
        );
      case 'DELIVERED':
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full text-xs font-black">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            مكتمل
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-700 border border-rose-200 px-2.5 py-1 rounded-full text-xs font-black">
            <XCircle className="w-3.5 h-3.5 text-rose-500" />
            ملغي
          </span>
        );
      default:
        return <span className="bg-zinc-100 text-zinc-800 px-2.5 py-1 rounded-full text-xs font-bold">{status}</span>;
    }
  };

  const tabsConfig = [
    { key: 'ALL', label: 'كافة الطلبات', icon: Layers, color: 'text-zinc-900', activeBg: 'border-zinc-900 text-zinc-900' },
    { key: 'NEW', label: 'الطلبات الجديدة', icon: ShoppingBag, color: 'text-blue-600', activeBg: 'border-blue-600 text-blue-600' },
    { key: 'PREPARING', label: 'مؤكد وقيد التجهيز', icon: Clock, color: 'text-amber-600', activeBg: 'border-amber-600 text-amber-600' },
    { key: 'PREPARED', label: 'تم التجهيز بانتظار التوصيل', icon: PackageCheck, color: 'text-purple-600', activeBg: 'border-purple-600 text-purple-600' },
    { key: 'SHIPPED', label: 'مع التوصيل', icon: Truck, color: 'text-orange-600', activeBg: 'border-orange-600 text-orange-600' },
    { key: 'COMPLETED', label: 'مكتمل', icon: CheckCircle2, color: 'text-emerald-600', activeBg: 'border-emerald-600 text-emerald-600' },
    { key: 'CANCELLED', label: 'ملغي', icon: XCircle, color: 'text-rose-600', activeBg: 'border-rose-600 text-rose-600' },
  ];

  return (
    <div className="flex flex-col md:flex-row h-screen bg-[var(--color-ivory-100)] overflow-hidden" dir="rtl">
      <AdminSidebar employeeName={session.employee.name} roleName={session?.employee?.role?.name || "ADMIN"} />

      <main className="flex-1 overflow-y-auto p-4 md:p-8 font-sans w-full max-w-full">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 pb-4 border-b border-zinc-200">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="p-2 rounded-xl bg-pink-100 text-[#E6007E]">
                <ShoppingBag className="w-5 h-5" />
              </span>
              <h1 className="text-2xl md:text-3xl font-extrabold font-heading text-zinc-900">
                طلبات المتجر الإلكتروني — محل غزل
              </h1>
            </div>
            <p className="text-xs md:text-sm text-zinc-500">
              إدارة دورة حياة وتجهيز وتوصيل طلبات الزبائن وتعديل الفواتير والبحث عن أي طلب
            </p>
          </div>
        </div>

        {/* Live Search Bar for Storefront Orders */}
        <div className="mb-6">
          <form method="GET" action="/admin/orders" className="flex flex-col sm:flex-row items-stretch gap-3">
            {normalizedTab && <input type="hidden" name="tab" value={normalizedTab} />}
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute inset-inline-start-3.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
              <input
                type="text"
                name="search"
                defaultValue={searchQuery}
                placeholder="ابحثي عن طلب برقم الطلب (مثال: GHZ-1001)، اسم الزبونة، رقم الهاتف، أو اسم المنتج..."
                className="w-full h-11 ps-10 pe-4 bg-white border border-zinc-200 rounded-2xl text-xs font-bold text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#E6007E]/30 focus:border-[#E6007E] transition shadow-2xs"
              />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="submit"
                className="h-11 px-5 rounded-2xl bg-[#E6007E] hover:bg-[#c4006b] text-white text-xs font-black transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Search className="w-3.5 h-3.5" />
                <span>بحث</span>
              </button>
              {searchQuery && (
                <Link
                  href={`/admin/orders?tab=${normalizedTab}`}
                  className="h-11 px-4 rounded-2xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-bold transition flex items-center justify-center"
                >
                  إلغاء البحث
                </Link>
              )}
            </div>
          </form>
        </div>

        {/* The Tabs: All Orders + The 6 Ordered Status Tabs */}
        <div className="flex gap-2 mb-6 border-b border-zinc-200 overflow-x-auto pb-1 scrollbar-none">
          {tabsConfig.map((tab) => {
            const isActive = normalizedTab === tab.key;
            const count = getTabCount(tab.key);
            const Icon = tab.icon;

            return (
              <Link
                key={tab.key}
                href={`/admin/orders?tab=${tab.key}${searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : ''}`}
                className={`flex items-center gap-2 px-3.5 py-2.5 font-black text-xs md:text-sm whitespace-nowrap border-b-2 transition-all rounded-t-xl ${
                  isActive
                    ? `${tab.activeBg} bg-white shadow-xs`
                    : 'border-transparent text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100/50'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{tab.label}</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  isActive ? 'bg-zinc-900 text-white' : 'bg-zinc-200 text-zinc-700'
                }`}>
                  {count}
                </span>
              </Link>
            );
          })}
        </div>

        {/* Orders Table */}
        <div className="bg-white rounded-2xl shadow-xs border border-zinc-200 overflow-hidden">
          <div className="overflow-x-auto w-full max-w-[90vw] md:max-w-full pb-2">
            <table className="w-full text-right border-collapse min-w-[850px] text-xs">
              <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-600 font-extrabold">
                <tr>
                  <th className="px-5 py-3.5">رقم الطلب</th>
                  <th className="px-5 py-3.5">اسم الزبونة</th>
                  <th className="px-5 py-3.5">رقم الهاتف</th>
                  <th className="px-5 py-3.5">حالة الطلب</th>
                  <th className="px-5 py-3.5">الإجمالي (شامل التوصيل)</th>
                  <th className="px-5 py-3.5">التاريخ والوقت</th>
                  <th className="px-5 py-3.5 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 font-medium">
                {orders.map((order) => (
                  <tr key={order.id} className="hover:bg-pink-50/20 transition-colors">
                    <td className="px-5 py-3.5 font-black font-mono text-zinc-900">
                      {order.reference}
                    </td>
                    <td className="px-5 py-3.5 font-bold text-zinc-900">
                      {order.customerName}
                    </td>
                    <td className="px-5 py-3.5 font-mono text-zinc-600" dir="ltr">
                      {order.customerPhone}
                    </td>
                    <td className="px-5 py-3.5">
                      {getStatusBadge(order.status)}
                    </td>
                    <td className="px-5 py-3.5 font-black text-emerald-700 font-mono text-sm">
                      {filsToDisplay(order.totalAmount, 'ar')}
                    </td>
                    <td className="px-5 py-3.5 text-zinc-500 font-mono" dir="ltr">
                      {new Date(order.createdAt).toLocaleString('ar-JO-u-nu-latn')}
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <Link
                          href={`/ar/invoice/${order.id}`}
                          target="_blank"
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-bold transition text-xs shadow-2xs"
                          title="عرض رابط الفاتورة"
                        >
                          <Printer className="w-3.5 h-3.5 text-zinc-600" />
                          <span>عرض رابط الفاتورة</span>
                        </Link>
                        <Link
                          href={`/admin/orders/${order.id}`}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-pink-50 hover:bg-[#E6007E] text-[#E6007E] hover:text-white font-bold transition shadow-xs text-xs"
                        >
                          <span>إدارة وتعديل</span>
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}

                {orders.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-zinc-400 font-bold">
                      {searchQuery ? `لا توجد نتائج مطابقة لبحثك عن: "${searchQuery}"` : 'لا توجد طلبات في هذا القسم حالياً.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
