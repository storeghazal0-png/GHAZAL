import React from 'react';
import { requirePermission } from '@/lib/dal';
import { ReturnsClient } from './ReturnsClient';

export const dynamic = 'force-dynamic';

export default async function POSReturnsPage() {
  await requirePermission('pos:access');

  return (
    <div className="space-y-4">
      <div className="bg-white border-b border-zinc-200 px-6 py-4">
        <h1 className="text-xl font-extrabold text-zinc-900 font-heading">إدارة مرتجعات واستبدال الكاشير</h1>
        <p className="text-xs text-zinc-500 mt-1">
          البحث عن فواتير المبيعات برقم الإيصال أو الباركود، وصرف مبالغ الاسترجاع نقداً أو للبطاقة
        </p>
      </div>

      <ReturnsClient />
    </div>
  );
}
