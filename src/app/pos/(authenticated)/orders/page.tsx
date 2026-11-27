import React from 'react';
import { requirePOSAuth, getEmployeePermissions } from '@/lib/dal';
import { POSOrdersPanel } from '@/components/POSOrdersPanel';
import Link from 'next/link';
import { ShoppingBag, Truck, Layers, ArrowRight } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function POSOrdersPage() {
  const session = await requirePOSAuth();
  const activePermissions = await getEmployeePermissions(session.employeeId);
  const hasOrdersViewPermission = activePermissions.includes('pos:access') || activePermissions.includes('manage:orders') || activePermissions.includes('pos.orders.view');
  const hasOrdersManagePermission = activePermissions.includes('pos:access') || activePermissions.includes('manage:orders') || activePermissions.includes('pos.orders.manage');

  if (!hasOrdersViewPermission) {
    return (
      <div className="p-8 text-center text-red-500 font-bold" dir="rtl">
        لا تملك صلاحية الوصول لطلبات المتجر
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF8F5] flex flex-col font-sans" dir="rtl">
      {/* POS Sub-Header Navigation */}
      <div className="bg-black text-white px-5 py-3 flex justify-between items-center text-xs border-b border-zinc-800 shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 font-black text-sm md:text-base text-white">
            <span className="p-1.5 bg-pink-900/50 rounded-lg text-[#E6007E]">
              <Layers className="w-4 h-4 md:w-5 md:h-5" />
            </span>
            <span>طلبات المتجر الإلكتروني — شاشة الكاشير</span>
          </div>
          <span className="hidden sm:inline-block text-[11px] text-zinc-300 bg-zinc-900 px-2.5 py-0.5 rounded-full border border-zinc-700">
            تجهيز الطلبات وتحديث الحالات فورياً
          </span>
        </div>

        <div className="flex items-center gap-2 md:gap-3">
          <Link
            href="/pos/deliveries"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-950/60 hover:bg-purple-900 text-purple-200 border border-purple-800 font-bold transition text-xs shadow-2xs"
            title="الانتقال إلى طلبيات شركة التوصيل"
          >
            <Truck className="w-3.5 h-3.5 text-purple-400" />
            <span>طلبيات التوصيل</span>
          </Link>
          <Link
            href="/pos/cashier"
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#E6007E] hover:bg-[#c4006b] text-white font-black transition text-xs shadow-xs"
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>كاشير البيع</span>
          </Link>
        </div>
      </div>

      <main className="flex-1 p-3 md:p-6 flex justify-center overflow-hidden">
        <div className="w-full max-w-6xl h-[86vh]">
          <POSOrdersPanel hasManagePermission={hasOrdersManagePermission} isInline={true} />
        </div>
      </main>
    </div>
  );
}
