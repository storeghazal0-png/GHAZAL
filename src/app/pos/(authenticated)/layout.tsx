import React from 'react';
import { requirePOSAuth, getEmployeePermissions } from '@/lib/dal';
import Link from 'next/link';
import { logout } from '@/actions/auth';
import { ShoppingBag, ArrowDownLeft, DollarSign, BarChart3, Layers, Truck, LogOut, Shield } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requirePOSAuth();
  const permissions = await getEmployeePermissions(session.employeeId);

  const showCounter = permissions.includes('pos:access');
  const showReport = permissions.includes('pos:access') || permissions.includes('manage:settings');
  const showOrders = permissions.includes('pos:access') || permissions.includes('manage:orders');
  const showAdmin = permissions.includes('manage:products') || permissions.includes('manage:orders') || permissions.includes('manage:settings');

  return (
    <div className="h-screen bg-[#F2F2F2] flex flex-col font-sans overflow-hidden" dir="rtl">
      {/* POS Top Header (Formal Monochrome) */}
      <header className="bg-black text-white px-5 py-2.5 flex justify-between items-center shadow-md border-b-2 border-zinc-700 shrink-0 z-20">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="font-heading font-black text-lg text-white tracking-wide">
              GHAZAL POS
            </span>
            <span className="text-xs font-bold text-zinc-300 bg-zinc-800 px-2 py-0.5 rounded border border-zinc-700">
              نظام الكاشير الموحد
            </span>
          </div>
          <span className="hidden sm:inline-block text-[11px] text-zinc-400 bg-zinc-900 px-2.5 py-0.5 rounded-full border border-zinc-800">
            الفرع الرئيسي • عمّان
          </span>
        </div>

        <div className="flex items-center gap-4 text-xs">
          <div className="text-end hidden sm:block">
            <p className="font-bold text-white">{session.employee.name}</p>
            <p className="text-[10px] text-zinc-400">{session.employee.role.name}</p>
          </div>

          <form action={logout}>
            <button
              type="submit"
              className="flex items-center gap-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white px-3 py-1.5 rounded-md font-bold text-xs transition-colors border border-zinc-700"
            >
              <LogOut className="w-3.5 h-3.5" />
              خروج
            </button>
          </form>
        </div>
      </header>

      {/* Main Screen Content Area */}
      <div className="flex-1 overflow-y-auto pb-16">
        {children}
      </div>

      {/* Modern POS Bottom Navigation Bar - Formal Monochrome */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-zinc-300 shadow-xl flex justify-around items-center h-16 px-2 z-20 shrink-0">
        {showCounter && (
          <Link
            href="/pos/cashier"
            className="flex flex-col items-center justify-center text-zinc-700 hover:text-black transition-colors w-full py-1 text-center group"
          >
            <ShoppingBag className="w-5 h-5 mb-1 group-hover:scale-110 transition-transform text-black" />
            <span className="text-[11px] font-bold">كاشير البيع</span>
          </Link>
        )}

        <Link
          href="/pos/returns"
          className="flex flex-col items-center justify-center text-zinc-700 hover:text-black transition-colors w-full py-1 text-center group"
        >
          <ArrowDownLeft className="w-5 h-5 mb-1 group-hover:scale-110 transition-transform" />
          <span className="text-[11px] font-bold">المرتجعات</span>
        </Link>

        {showOrders && (
          <Link
            href="/pos/orders"
            className="flex flex-col items-center justify-center text-zinc-700 hover:text-black transition-colors w-full py-1 text-center group"
          >
            <Layers className="w-5 h-5 mb-1 group-hover:scale-110 transition-transform" />
            <span className="text-[11px] font-bold">طلبات المتجر</span>
          </Link>
        )}

        {showOrders && (
          <Link
            href="/pos/deliveries"
            className="flex flex-col items-center justify-center text-zinc-700 hover:text-purple-700 transition-colors w-full py-1 text-center group"
          >
            <Truck className="w-5 h-5 mb-1 group-hover:scale-110 transition-transform text-purple-600" />
            <span className="text-[11px] font-bold">طلبيات شركة التوصيل</span>
          </Link>
        )}
      </nav>
    </div>
  );
}
