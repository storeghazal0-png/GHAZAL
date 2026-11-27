import React from 'react';
import { requirePOSAuth, getEmployeePermissions } from '@/lib/dal';
import { DeliveriesClient } from '@/app/admin/deliveries/DeliveriesClient';
import { getSettlementsDashboardData } from '@/actions/settlements';
import { getShippingZonesList } from '@/actions/shipping';
import Link from 'next/link';
import { Truck, ShoppingBag, Layers, ArrowRight } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function POSDeliveriesPage({
  searchParams
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await requirePOSAuth();
  const permissions = await getEmployeePermissions(session.employeeId);
  const canAccessOrders = permissions.includes('pos:access') || permissions.includes('manage:orders') || permissions.includes('pos.orders.view');

  if (!canAccessOrders) {
    return (
      <div className="p-8 text-center text-red-500 font-bold" dir="rtl">
        لا تملك صلاحية الوصول لطلبيات التوصيل
      </div>
    );
  }

  const sp = searchParams ? await searchParams : {};
  const requestedTab = typeof sp.tab === 'string' ? sp.tab : typeof sp.view === 'string' ? sp.view : typeof sp.q === 'string' ? sp.q : '';

  const [data, shippingZones] = await Promise.all([
    getSettlementsDashboardData('ONLINE'),
    getShippingZonesList()
  ]);

  return (
    <div className="min-h-screen bg-[#FAF8F5] flex flex-col font-sans" dir="rtl">
      {/* POS Sub-Header Navigation */}
      <div className="bg-black text-white px-5 py-3 flex justify-between items-center text-xs border-b border-zinc-800 shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 font-black text-sm md:text-base text-white">
            <span className="p-1.5 bg-purple-900/50 rounded-lg text-purple-400">
              <Truck className="w-4 h-4 md:w-5 md:h-5" />
            </span>
            <span>طلبيات شركة التوصيل — شاشة الكاشير</span>
          </div>
          <span className="hidden sm:inline-block text-[11px] text-zinc-300 bg-zinc-900 px-2.5 py-0.5 rounded-full border border-zinc-700">
            إرسال الشحنات ومتابعة المندوبين
          </span>
        </div>

        <div className="flex items-center gap-2 md:gap-3">
          <Link
            href="/pos/orders"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white font-bold transition text-xs border border-zinc-700 shadow-2xs"
          >
            <Layers className="w-3.5 h-3.5 text-zinc-400" />
            <span>طلبات المتجر</span>
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

      <main className="flex-1 p-4 md:p-8 overflow-y-auto">
        <DeliveriesClient
          initialTabParam={requestedTab}
          initialPreparedOrders={data.preparedOrders || []}
          initialCourierBatches={data.courierBatches || []}
          initialDeliveryOrders={data.deliveryOrders || []}
          deliverySettlement={data.deliverySettlement}
          initialShippingZones={shippingZones || []}
          initialCourierCompanies={data.courierCompanies || []}
          isPOS={true}
        />
      </main>
    </div>
  );
}
