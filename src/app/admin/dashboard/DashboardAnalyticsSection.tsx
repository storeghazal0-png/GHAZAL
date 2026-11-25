'use client';

import React, { useState } from 'react';
import { filsToDisplay } from '@/lib/money';
import { Flame, TrendingDown, Store, Globe, Award, AlertCircle, ShoppingCart } from 'lucide-react';

export interface ProductSaleStat {
  id: string;
  name: string;
  brand: string;
  category: string;
  priceFils: number;
  posQty: number;
  posRevenueFils: number;
  onlineQty: number;
  onlineRevenueFils: number;
  totalQty: number;
  totalRevenueFils: number;
}

interface Props {
  initialStats: ProductSaleStat[];
}

export function DashboardAnalyticsSection({ initialStats }: Props) {
  const [channel, setChannel] = useState<'all' | 'pos' | 'online'>('all');

  // Sort based on active channel
  const getQty = (p: ProductSaleStat) => {
    if (channel === 'pos') return p.posQty;
    if (channel === 'online') return p.onlineQty;
    return p.totalQty;
  };

  const getRevenue = (p: ProductSaleStat) => {
    if (channel === 'pos') return p.posRevenueFils;
    if (channel === 'online') return p.onlineRevenueFils;
    return p.totalRevenueFils;
  };

  // Filter items that have at least 1 sale for top list
  const sortedTop = [...initialStats]
    .filter(p => getQty(p) > 0)
    .sort((a, b) => getQty(b) - getQty(a));

  // Least selling (items with lowest or zero sales in this channel)
  const sortedLeast = [...initialStats]
    .sort((a, b) => getQty(a) - getQty(b))
    .slice(0, 5);

  const topItems = sortedTop.slice(0, 5);

  return (
    <div className="space-y-6 mb-8">
      {/* Header and Channel Filter Switcher */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-zinc-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-[#E6007E]" />
            <h2 className="text-lg md:text-xl font-bold text-zinc-900">
              تحليلات حركة المنتجات: الأكثر والأقل مبيعاً
            </h2>
          </div>
          <p className="text-xs text-zinc-500 mt-1">
            مقارنة تفصيلية بين مبيعات كاشير المحل (POS) وطلبات المتجر الإلكتروني (Online)
          </p>
        </div>

        {/* Channel Segmented Buttons */}
        <div className="flex bg-zinc-100 p-1 rounded-xl self-stretch sm:self-auto text-xs font-bold">
          <button
            type="button"
            onClick={() => setChannel('all')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              channel === 'all'
                ? 'bg-white text-zinc-900 shadow-xs'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            الكل (المحل + الأونلاين)
          </button>
          <button
            type="button"
            onClick={() => setChannel('pos')}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 ${
              channel === 'pos'
                ? 'bg-[#E6007E] text-white shadow-xs'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            <Store className="w-3.5 h-3.5" />
            <span>كاشير المحل (POS)</span>
          </button>
          <button
            type="button"
            onClick={() => setChannel('online')}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 ${
              channel === 'online'
                ? 'bg-[#1A1A1A] text-white shadow-xs'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>المتجر الإلكتروني</span>
          </button>
        </div>
      </div>

      {/* Grid: 2 Columns (Top Selling vs Least Selling) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* TOP SELLING PRODUCTS */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-zinc-200 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-zinc-100 mb-4">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg bg-pink-50 text-[#E6007E] flex items-center justify-center">
                  <Flame className="w-4 h-4 fill-current animate-pulse" />
                </span>
                <div>
                  <h3 className="font-bold text-base text-zinc-900">أفضل المنتجات مبيعاً (Top 5)</h3>
                  <p className="text-[11px] text-zinc-400">المنتجات الأعلى طلباً وإيراداً</p>
                </div>
              </div>
              <span className="text-[11px] font-bold text-pink-600 bg-pink-50 px-2 py-0.5 rounded-full">
                {channel === 'pos' ? 'كاش المحل' : channel === 'online' ? 'المتجر الإلكتروني' : 'إجمالي القنوات'}
              </span>
            </div>

            <div className="divide-y divide-zinc-100">
              {topItems.map((item, idx) => {
                const qty = getQty(item);
                const revenue = getRevenue(item);

                return (
                  <div key={item.id} className="py-3 flex items-center justify-between gap-3 text-xs md:text-sm">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                        idx === 0 ? 'bg-amber-400 text-white' : idx === 1 ? 'bg-zinc-300 text-zinc-700' : idx === 2 ? 'bg-amber-700/60 text-white' : 'bg-zinc-100 text-zinc-600'
                      }`}>
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <h4 className="font-bold text-zinc-900 truncate">{item.name}</h4>
                        <div className="flex items-center gap-2 text-[10px] text-zinc-400 mt-0.5">
                          <span className="text-[#E6007E] font-semibold">{item.brand}</span>
                          <span>•</span>
                          <span>{item.category}</span>
                          {channel === 'all' && (
                            <span className="text-zinc-500">
                              (كاش: {item.posQty} | أونلاين: {item.onlineQty})
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="text-left shrink-0">
                      <span className="font-black text-emerald-600 block">
                        {filsToDisplay(revenue, 'ar')}
                      </span>
                      <span className="text-[11px] font-bold text-zinc-600">
                        {qty} قطعة مباعة
                      </span>
                    </div>
                  </div>
                );
              })}

              {topItems.length === 0 && (
                <p className="text-zinc-400 py-8 text-center text-sm">
                  لا توجد مبيعات مسجلة في هذه القناة حالياً.
                </p>
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-zinc-100 flex items-center justify-between text-xs text-zinc-500">
            <span>ملاحظة: البيانات تُحدّث تلقائياً مع كل عملية بيع.</span>
            <span className="font-bold text-[#E6007E]">غزل لمستحضرات التجميل</span>
          </div>
        </div>

        {/* LEAST SELLING / SLOW-MOVING PRODUCTS */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-zinc-200 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-zinc-100 mb-4">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                  <TrendingDown className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="font-bold text-base text-zinc-900">أقل المنتجات مبيعاً (بطيئة الحركة)</h3>
                  <p className="text-[11px] text-zinc-400">منتجات تحتاج عروض ترويجية أو إعادة تسعير</p>
                </div>
              </div>
            </div>

            <div className="divide-y divide-zinc-100">
              {sortedLeast.map((item, idx) => {
                const qty = getQty(item);
                const revenue = getRevenue(item);

                return (
                  <div key={item.id} className="py-3 flex items-center justify-between gap-3 text-xs md:text-sm">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-6 h-6 rounded-full bg-zinc-100 text-zinc-500 flex items-center justify-center font-bold text-xs shrink-0">
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <h4 className="font-bold text-zinc-800 truncate">{item.name}</h4>
                        <div className="flex items-center gap-2 text-[10px] text-zinc-400 mt-0.5">
                          <span className="font-semibold text-zinc-600">{item.brand}</span>
                          <span>•</span>
                          <span>السعر: {filsToDisplay(item.priceFils, 'ar')}</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-left shrink-0">
                      <span className={`block text-[11px] font-bold px-2 py-0.5 rounded-full ${
                        qty === 0 ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
                      }`}>
                        {qty === 0 ? 'لم يُبع منه أي قطعة' : `${qty} قطع مباعة فقط`}
                      </span>
                      <span className="text-[10px] text-zinc-400 mt-0.5 block text-center">
                        {qty === 0 ? 'يوصى بعمل خصم' : filsToDisplay(revenue, 'ar')}
                      </span>
                    </div>
                  </div>
                );
              })}

              {sortedLeast.length === 0 && (
                <p className="text-zinc-400 py-8 text-center text-sm">
                  لا توجد منتجات مسجلة في قاعدة البيانات حالياً.
                </p>
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-zinc-100 text-xs text-amber-800 bg-amber-50/50 p-2.5 rounded-xl border border-amber-100 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>نصيحة النظام: يمكن إضافة هذه المنتجات كعروض هدايا في قسم "عروض خاصة" لتسريع تصريفها.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
