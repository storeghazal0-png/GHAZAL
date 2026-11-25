'use client';

import React, { useState, useMemo } from 'react';
import Image from 'next/image';
import { 
  BarChart3, TrendingUp, Calendar, Printer, Filter, 
  ShoppingBag, Banknote, CreditCard, DollarSign, Layers, Tag, 
  Users, AlertCircle, ArrowUpRight, ArrowDownLeft, Clock, RotateCcw, FileText,
  Activity, ArrowUp, CheckCircle2, Flame, Snowflake, ChevronDown, ChevronUp, Award, Search
} from 'lucide-react';
import { ProductSalesAnalyticsResult, ProductSalesPerformanceItem } from '@/actions/product-reports';
import { formatJordanDateTime, getJordanNowFormatted } from '@/lib/date';

interface Props {
  sales: any[];
  expenses: any[];
  vouchers: any[];
  productAnalytics?: ProductSalesAnalyticsResult;
}

export default function AdminReportsClient({ sales, expenses, vouchers, productAnalytics }: Props) {
  const [timeRange, setTimeRange] = useState<'today' | 'week' | 'month' | 'all'>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [activeReportTab, setActiveReportTab] = useState<
    'overview' | 'products' | 'cashiers' | 'channels' | 'expenses'
  >('overview');

  // Product Sales Analytics View State
  const [productViewMode, setProductViewMode] = useState<'BEST' | 'LEAST' | 'ALL'>('BEST');
  const [productChannelFilter, setProductChannelFilter] = useState<'ALL' | 'POS' | 'ONLINE'>('ALL');
  const [productVisibleLimit, setProductVisibleLimit] = useState<number>(5);
  const [productSearch, setProductSearch] = useState('');

  // Live Auto-Filter by Date, Time, and Preset Range
  const filteredSales = useMemo(() => {
    return sales.filter((s) => {
      const saleDate = new Date(s.createdAt || Date.now());

      if (timeRange === 'today') {
        const today = new Date();
        if (saleDate.toDateString() !== today.toDateString()) return false;
      } else if (timeRange === 'week') {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        if (saleDate < weekAgo) return false;
      } else if (timeRange === 'month') {
        const monthAgo = new Date();
        monthAgo.setDate(monthAgo.getDate() - 30);
        if (saleDate < monthAgo) return false;
      }

      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        if (saleDate < start) return false;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        if (saleDate > end) return false;
      }

      if (startTime) {
        const [startH, startM] = startTime.split(':').map(Number);
        const saleMinutes = saleDate.getHours() * 60 + saleDate.getMinutes();
        const filterStartMinutes = startH * 60 + (startM || 0);
        if (saleMinutes < filterStartMinutes) return false;
      }
      if (endTime) {
        const [endH, endM] = endTime.split(':').map(Number);
        const saleMinutes = saleDate.getHours() * 60 + saleDate.getMinutes();
        const filterEndMinutes = endH * 60 + (endM || 0);
        if (saleMinutes > filterEndMinutes) return false;
      }

      return true;
    });
  }, [sales, timeRange, startDate, endDate, startTime, endTime]);

  // Filtered Products for Best / Least Selling Analysis (with POS / Online channel filter)
  const displayedProducts = useMemo(() => {
    if (!productAnalytics) return [];
    let list: ProductSalesPerformanceItem[] = [...productAnalytics.allProducts];

    if (productChannelFilter === 'POS') {
      if (productViewMode === 'BEST') {
        list.sort((a, b) => b.posCount - a.posCount || b.posRevenueFils - a.posRevenueFils);
      } else if (productViewMode === 'LEAST') {
        list.sort((a, b) => a.posCount - b.posCount || a.posRevenueFils - b.posRevenueFils);
      } else {
        list.sort((a, b) => b.posCount - a.posCount);
      }
    } else if (productChannelFilter === 'ONLINE') {
      if (productViewMode === 'BEST') {
        list.sort((a, b) => b.onlineCount - a.onlineCount || b.onlineRevenueFils - a.onlineRevenueFils);
      } else if (productViewMode === 'LEAST') {
        list.sort((a, b) => a.onlineCount - b.onlineCount || a.onlineRevenueFils - b.onlineRevenueFils);
      } else {
        list.sort((a, b) => b.onlineCount - a.onlineCount);
      }
    } else {
      if (productViewMode === 'BEST') {
        list = [...productAnalytics.bestSellers];
      } else if (productViewMode === 'LEAST') {
        list = [...productAnalytics.leastSellers];
      } else {
        list = [...productAnalytics.allProducts];
      }
    }

    if (productSearch.trim()) {
      const q = productSearch.trim().toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.brand.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q)
      );
    }
    return list;
  }, [productAnalytics, productViewMode, productChannelFilter, productSearch]);

  const visibleItems = useMemo(() => {
    return displayedProducts.slice(0, productVisibleLimit);
  }, [displayedProducts, productVisibleLimit]);

  // Calculations on filtered sales
  const totalSalesFils = filteredSales.reduce((acc, s) => acc + (s.total || 0), 0);
  const totalInvoicesCount = filteredSales.length;
  const cashSalesFils = filteredSales.filter(s => s.paymentMethod === 'CASH').reduce((acc, s) => acc + (s.total || 0), 0);
  const cardSalesFils = filteredSales.filter(s => s.paymentMethod === 'CARD').reduce((acc, s) => acc + (s.total || 0), 0);
  const creditSalesFils = filteredSales.filter(s => s.paymentMethod === 'CREDIT').reduce((acc, s) => acc + (s.total || 0), 0);

  const totalExpensesFils = expenses.reduce((acc, e) => acc + (e.amountFils || 0), 0);
  const cogsFils = Math.round(totalSalesFils * 0.65);
  const grossProfitFils = totalSalesFils - cogsFils;
  const estimatedProfitFils = grossProfitFils - totalExpensesFils;

  // Group by cashier
  const cashierMap = new Map<string, { count: number; total: number }>();
  for (const s of filteredSales) {
    const name = s.cashierName || 'كاشير رئيسي';
    const cur = cashierMap.get(name) || { count: 0, total: 0 };
    cashierMap.set(name, { count: cur.count + 1, total: cur.total + (s.total || 0) });
  }

  // Group sales by day for the trend chart
  const salesByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of filteredSales) {
      const d = new Date(s.createdAt || Date.now());
      const dayKey = isNaN(d.getTime()) ? 'اليوم' : d.toLocaleDateString('en-GB', { month: '2-digit', day: '2-digit' });
      map.set(dayKey, (map.get(dayKey) || 0) + (s.total || 0));
    }
    return Array.from(map.entries()).map(([day, amountFils]) => ({ day, amountFils }));
  }, [filteredSales, totalSalesFils]);

  const maxDaySalesFils = useMemo(() => {
    return Math.max(1, ...salesByDay.map(d => d.amountFils));
  }, [salesByDay]);

  const avgBasketFils = Math.round(totalSalesFils / Math.max(1, totalInvoicesCount));
  const cashPercent = totalSalesFils > 0 ? Math.round((cashSalesFils / totalSalesFils) * 100) : 0;
  const cardPercent = totalSalesFils > 0 ? Math.round((cardSalesFils / totalSalesFils) * 100) : 0;
  const creditPercent = totalSalesFils > 0 ? Math.round((creditSalesFils / totalSalesFils) * 100) : 0;
  const profitMarginPercent = totalSalesFils > 0 ? Math.round((estimatedProfitFils / Math.max(1, totalSalesFils)) * 100) : 0;

  return (
    <div className="p-6 space-y-6 font-sans text-zinc-900" dir="rtl">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-zinc-200">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-2 rounded-xl bg-blue-100 text-blue-700">
              <BarChart3 className="w-5 h-5" />
            </span>
            <h1 className="text-2xl font-black text-zinc-900 font-heading">
              التقارير الشاملة وتحليل المنتجات والمبيعات
            </h1>
          </div>
          <p className="text-xs text-zinc-500">
            متابعة دقيقة لأداء مبيعات الكاشير، المتجر الإلكتروني، حركة المنتجات، والمؤشرات المالية — محل غزل (عين الباشا)
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Time Range Filter */}
          <div className="flex rounded-xl bg-zinc-100 p-1 border border-zinc-200 text-xs font-bold">
            {(['today', 'week', 'month', 'all'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setTimeRange(r)}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                  timeRange === r ? 'bg-white text-zinc-900 shadow-2xs' : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                {r === 'today' ? 'اليوم' : r === 'week' ? 'هذا الأسبوع' : r === 'month' ? 'هذا الشهر' : 'الكل'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Official Print Header */}
      <div className="hidden print:block text-zinc-900 font-sans mb-6">
        <div className="border-b-2 border-zinc-900 pb-4 mb-4 flex items-center justify-between">
          <div className="space-y-1">
            <h2 className="text-xl font-black tracking-wide text-zinc-900">
              محل غزل للمكياج والتجميل والعطور — GHAZAL
            </h2>
            <p className="text-xs text-zinc-600 font-bold">
              المملكة الأردنية الهاشمية — لواء عين الباشا (السوق التجاري)
            </p>
            <p className="text-[11px] text-zinc-500">
              تقرير الأداء والمبيعات وتحليل حركة المنتجات الرسمي • هاتف: +962776299243
            </p>
          </div>
          <div className="flex flex-col items-center">
            <div className="w-20 h-20 p-1 border border-zinc-300 rounded-xl bg-white flex items-center justify-center">
              <img src="/logo.png" alt="شعار غزل" className="max-w-full max-h-full object-contain" />
            </div>
            <span className="text-[10px] font-bold text-zinc-500 mt-1">معتمد رسمياً</span>
          </div>
        </div>

        <div className="bg-zinc-100 p-3 rounded-xl border border-zinc-300 mb-6 grid grid-cols-3 gap-3 text-xs">
          <div>
            <span className="text-zinc-500 block text-[10px] font-bold">تاريخ وتوقيت الإصدار (توقيت الأردن):</span>
            <span className="font-bold text-zinc-900 font-mono" dir="ltr">{getJordanNowFormatted()}</span>
          </div>
          <div>
            <span className="text-zinc-500 block text-[10px] font-bold">الفترة الزمنية:</span>
            <span className="font-bold text-zinc-900">
              من {startDate || 'بداية السجل'} {startTime ? `(${startTime})` : ''} إلى {endDate || 'اليوم'} {endTime ? `(${endTime})` : ''}
            </span>
          </div>
          <div>
            <span className="text-zinc-500 block text-[10px] font-bold">إجمالي المبيعات الصافية:</span>
            <span className="font-black text-[#E6007E] font-mono" dir="ltr">{(totalSalesFils / 1000).toFixed(3)} د.أ</span>
          </div>
        </div>
      </div>

      {/* Date & Time Range Filter Ribbon */}
      <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-xs print:hidden space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-black text-zinc-800 flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-[#E6007E]" />
            فلاتر النطاق الزمني والساعة المحددة (تطبيق فوري تلقائي)
          </span>
          {(startDate || endDate || startTime || endTime) && (
            <button
              onClick={() => { setStartDate(''); setEndDate(''); setStartTime(''); setEndTime(''); }}
              className="text-xs text-red-600 hover:text-red-700 font-bold flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>إعادة ضبط التوقيت</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-[11px] font-bold text-zinc-600 mb-1">من تاريخ:</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-1.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-bold text-zinc-700 focus:outline-none focus:border-[#E6007E] font-mono"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-zinc-600 mb-1">إلى تاريخ:</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-1.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-bold text-zinc-700 focus:outline-none focus:border-[#E6007E] font-mono"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-zinc-600 mb-1">من الساعة:</label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full px-3 py-1.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-bold text-zinc-700 focus:outline-none focus:border-[#E6007E] font-mono"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-zinc-600 mb-1">إلى الساعة:</label>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full px-3 py-1.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-bold text-zinc-700 focus:outline-none focus:border-[#E6007E] font-mono"
            />
          </div>
        </div>
      </div>

      {/* Top 4 Metric KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-xs">
          <div className="flex items-center justify-between text-zinc-500 mb-1">
            <span className="text-xs font-bold">إجمالي مبيعات المحل</span>
            <ShoppingBag className="w-4 h-4 text-[#E6007E]" />
          </div>
          <div className="text-2xl font-black text-zinc-900 font-mono" dir="ltr">
            {(totalSalesFils / 1000).toFixed(3)} د.أ
          </div>
          <span className="text-[10px] text-zinc-400 mt-1 block">
            عدد الفواتير: <span className="font-bold text-zinc-700">{totalInvoicesCount}</span>
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-xs">
          <div className="flex items-center justify-between text-zinc-500 mb-1">
            <span className="text-xs font-bold">المصروفات التشغيلية</span>
            <DollarSign className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-black text-amber-700 font-mono" dir="ltr">
            {(totalExpensesFils / 1000).toFixed(3)} د.أ
          </div>
          <span className="text-[10px] text-zinc-400 mt-1 block">
            عدد السندات: <span className="font-bold text-zinc-700">{expenses.length}</span>
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-xs">
          <div className="flex items-center justify-between text-zinc-500 mb-1">
            <span className="text-xs font-bold">صافي الربح التشغيلي</span>
            <TrendingUp className={`w-4 h-4 ${estimatedProfitFils >= 0 ? 'text-emerald-600' : 'text-rose-600'}`} />
          </div>
          <div className={`text-2xl font-black font-mono ${estimatedProfitFils >= 0 ? 'text-emerald-600' : 'text-rose-600'}`} dir="ltr">
            {(estimatedProfitFils / 1000).toFixed(3)} د.أ
          </div>
          <span className={`text-[10px] font-bold mt-1 block ${estimatedProfitFils >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {estimatedProfitFils >= 0 ? `هامش ربح تشغيلي ~${profitMarginPercent}%` : `عجز / خسارة تشغيلية ~${profitMarginPercent}%`}
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-xs">
          <div className="flex items-center justify-between text-zinc-500 mb-1">
            <span className="text-xs font-bold">متوسط سلة المشتريات</span>
            <CreditCard className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-black text-blue-700 font-mono" dir="ltr">
            {(avgBasketFils / 1000).toFixed(3)} د.أ
          </div>
          <span className="text-[10px] text-zinc-400 mt-1 block">معدل إنفاق الزبون</span>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* BEST & LEAST SELLING PRODUCTS SECTION (الأكثر والأقل مبيعاً مع تفصيل الكاش والمتجر) */}
      {/* ==================================================================== */}
      <div className="bg-white rounded-3xl p-6 border border-zinc-200 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-100">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="p-2 rounded-xl bg-pink-100 text-[#E6007E]">
                <Flame className="w-5 h-5" />
              </span>
              <h2 className="text-xl font-black text-zinc-900 font-heading">
                تحليل حركة وأداء المنتجات (الأكثر مبيعاً والأقل مبيعاً)
              </h2>
            </div>
            <p className="text-xs text-zinc-500 font-medium">
              متابعة كمية وإيرادات كل منتج مع تفصيل المبيعات المنفذة عبر كاشير صالة المعرض (POS) مقابل طلبات المتجر الإلكتروني
            </p>
          </div>

          {/* Mode Switcher */}
          <div className="flex items-center gap-1.5 p-1 bg-zinc-100 rounded-2xl border border-zinc-200 text-xs font-black">
            <button
              type="button"
              onClick={() => { setProductViewMode('BEST'); setProductVisibleLimit(5); }}
              className={`px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition cursor-pointer ${
                productViewMode === 'BEST'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <Flame className="w-4 h-4 text-amber-300" />
              <span>أفضل المنتجات مبيعاً 🔥</span>
            </button>

            <button
              type="button"
              onClick={() => { setProductViewMode('LEAST'); setProductVisibleLimit(5); }}
              className={`px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition cursor-pointer ${
                productViewMode === 'LEAST'
                  ? 'bg-blue-700 text-white shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <Snowflake className="w-4 h-4 text-cyan-200" />
              <span>أقل المنتجات مبيعاً ❄️</span>
            </button>

            <button
              type="button"
              onClick={() => { setProductViewMode('ALL'); setProductVisibleLimit(10); }}
              className={`px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition cursor-pointer ${
                productViewMode === 'ALL'
                  ? 'bg-zinc-900 text-white shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <Layers className="w-4 h-4 text-zinc-300" />
              <span>جميع المنتجات والمقارنة</span>
            </button>
          </div>
        </div>

        {/* Channel Filter (كاش / متجر) & Search & Summary Indicator */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-zinc-50 p-3.5 rounded-2xl border border-zinc-200">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-black text-zinc-700">قناة البيع:</span>
            <div className="inline-flex rounded-xl p-1 bg-white border border-zinc-200 text-xs font-bold shadow-2xs">
              <button
                type="button"
                onClick={() => setProductChannelFilter('ALL')}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                  productChannelFilter === 'ALL'
                    ? 'bg-zinc-900 text-white shadow-2xs'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                جميع القنوات (كاش + متجر)
              </button>
              <button
                type="button"
                onClick={() => setProductChannelFilter('POS')}
                className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition cursor-pointer ${
                  productChannelFilter === 'POS'
                    ? 'bg-emerald-700 text-white shadow-2xs'
                    : 'text-zinc-600 hover:text-emerald-700'
                }`}
              >
                <Banknote className="w-3.5 h-3.5" />
                <span>الكاش والمعرض (POS) فقط</span>
              </button>
              <button
                type="button"
                onClick={() => setProductChannelFilter('ONLINE')}
                className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition cursor-pointer ${
                  productChannelFilter === 'ONLINE'
                    ? 'bg-blue-700 text-white shadow-2xs'
                    : 'text-zinc-600 hover:text-blue-700'
                }`}
              >
                <ShoppingBag className="w-3.5 h-3.5" />
                <span>المتجر الإلكتروني فقط</span>
              </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-3.5 h-3.5 absolute start-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="ابحث بالاسم أو الماركة..."
                className="w-full ps-8 pe-3 py-1.5 text-xs bg-white border border-zinc-200 rounded-xl outline-none focus:border-[#E6007E] font-bold"
              />
            </div>

            <div className="flex items-center gap-2 text-xs font-bold text-zinc-600 shrink-0">
              <span>المعروض: {visibleItems.length} من {displayedProducts.length}</span>
              <span className="text-zinc-300">|</span>
              <span className="text-emerald-700 font-mono">
                {productChannelFilter === 'POS'
                  ? `مبيعات الكاش: ${visibleItems.reduce((acc, p) => acc + p.posCount, 0)} قطعة`
                  : productChannelFilter === 'ONLINE'
                  ? `مبيعات المتجر: ${visibleItems.reduce((acc, p) => acc + p.onlineCount, 0)} قطعة`
                  : `إجمالي المعروض: ${visibleItems.reduce((acc, p) => acc + p.totalSold, 0)} قطعة`}
              </span>
            </div>
          </div>
        </div>

        {/* Products Table */}
        <div className="overflow-x-auto border border-zinc-200 rounded-2xl">
          <table className="w-full min-w-[700px] text-right text-xs">
            <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-600 font-bold">
              <tr>
                <th className="p-3.5 w-12 text-center">#</th>
                <th className="p-3.5">المنتج والتصنيف</th>
                <th className={`p-3.5 text-center font-black ${productChannelFilter === 'ALL' ? 'bg-zinc-100 text-zinc-900' : ''}`}>إجمالي المباع</th>
                <th className={`p-3.5 ${productChannelFilter === 'POS' ? 'bg-emerald-100/70 text-emerald-900 font-black' : ''}`}>مبيعات الكاشير (POS)</th>
                <th className={`p-3.5 ${productChannelFilter === 'ONLINE' ? 'bg-blue-100/70 text-blue-900 font-black' : ''}`}>مبيعات المتجر الإلكتروني</th>
                <th className="p-3.5 text-center font-black">إجمالي الإيرادات</th>
                <th className="p-3.5 text-center">حالة الطلب والنشاط</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 font-medium">
              {visibleItems.map((prod, idx) => (
                <tr key={prod.id} className="hover:bg-zinc-50/80 transition-colors">
                  <td className="p-3.5 text-center font-mono font-bold text-zinc-400">
                    {idx + 1}
                  </td>
                  <td className="p-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-zinc-100 relative overflow-hidden shrink-0 border border-zinc-200">
                        <Image src={prod.imageUrl} alt={prod.name} fill className="object-cover" />
                      </div>
                      <div>
                        <div className="font-extrabold text-zinc-900 text-sm">{prod.name}</div>
                        <div className="flex items-center gap-2 text-[11px] text-zinc-500 mt-0.5">
                          <span className="font-bold text-[#E6007E]">{prod.brand}</span>
                          <span>•</span>
                          <span>{prod.category}</span>
                          <span>•</span>
                          <span className="font-mono">{prod.sku}</span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="p-3.5 text-center">
                    <span className="inline-block px-3 py-1 rounded-xl text-xs font-black bg-zinc-900 text-white font-mono">
                      {prod.totalSold} قطعة
                    </span>
                  </td>
                  <td className="p-3.5">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs font-bold text-emerald-800">
                        <span className="flex items-center gap-1">
                          <Banknote className="w-3.5 h-3.5 text-emerald-600" />
                          <span>الكاش / المعرض:</span>
                        </span>
                        <span className="font-mono font-black">{prod.posCount} قطعة</span>
                      </div>
                      <div className="text-[10px] text-zinc-500 font-mono">
                        الإيراد: {(prod.posRevenueFils / 1000).toFixed(3)} د.أ
                      </div>
                    </div>
                  </td>
                  <td className="p-3.5">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs font-bold text-blue-800">
                        <span className="flex items-center gap-1">
                          <ShoppingBag className="w-3.5 h-3.5 text-blue-600" />
                          <span>المتجر الإلكتروني:</span>
                        </span>
                        <span className="font-mono font-black">{prod.onlineCount} قطعة</span>
                      </div>
                      <div className="text-[10px] text-zinc-500 font-mono">
                        الإيراد: {(prod.onlineRevenueFils / 1000).toFixed(3)} د.أ
                      </div>
                    </div>
                  </td>
                  <td className="p-3.5 text-center font-mono font-black text-zinc-900 text-sm">
                    {(prod.totalRevenueFils / 1000).toFixed(3)} د.أ
                  </td>
                  <td className="p-3.5 text-center">
                    {prod.performanceTier === 'BESTSELLER' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-200">
                        <Flame className="w-3 h-3 text-rose-600 fill-rose-600" />
                        <span>الأكثر مبيعاً 🔥</span>
                      </span>
                    ) : prod.performanceTier === 'HIGH' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
                        <TrendingUp className="w-3 h-3 text-emerald-600" />
                        <span>إقبال مرتفع 📈</span>
                      </span>
                    ) : prod.performanceTier === 'MEDIUM' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                        <span>طلب معتدل ⚡</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                        <Snowflake className="w-3 h-3 text-cyan-600" />
                        <span>بطيء الحركة ❄️</span>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {visibleItems.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-zinc-400 font-bold">
                    لا توجد منتجات مطابقة لشرط البحث.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* View More / View Less Controls */}
        <div className="flex flex-wrap items-center justify-between pt-2 gap-3">
          <div className="text-xs text-zinc-500 font-medium">
            يتم احتساب الكميات بدقة من فواتير الكاشير المسجلة وطلبيات المتجر الإلكتروني.
          </div>

          <div className="flex items-center gap-2">
            {productVisibleLimit < displayedProducts.length && (
              <button
                type="button"
                onClick={() => setProductVisibleLimit(prev => Math.min(prev + 5, displayedProducts.length))}
                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <ChevronDown className="w-4 h-4 text-[#E6007E]" />
                <span>عرض المزيد (+5 منتجات إضافية)</span>
              </button>
            )}

            {productVisibleLimit < displayedProducts.length && (
              <button
                type="button"
                onClick={() => setProductVisibleLimit(displayedProducts.length)}
                className="px-3.5 py-2 bg-pink-50 hover:bg-pink-100 text-[#E6007E] border border-pink-200 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                <span>عرض الكل ({displayedProducts.length})</span>
              </button>
            )}

            {productVisibleLimit > 5 && (
              <button
                type="button"
                onClick={() => setProductVisibleLimit(5)}
                className="px-3.5 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer"
              >
                <ChevronUp className="w-4 h-4" />
                <span>عرض أقل (إرجاع لأول 5)</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Daily Sales Trend Chart (CSS Bar Chart) */}
      <div className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-black text-zinc-900 font-heading">
              منحنى المبيعات اليومية (Sales Trend)
            </h2>
            <p className="text-xs text-zinc-500">مقارنة حركة الإيرادات خلال الأيام الأخيرة</p>
          </div>
          <span className="text-xs font-black text-[#E6007E] bg-pink-50 border border-pink-200 px-3 py-1 rounded-xl">
            مؤشر نشاط مباشر
          </span>
        </div>

        {salesByDay.length === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center text-zinc-400 gap-2 border-b border-zinc-200">
            <span className="text-xs font-bold text-zinc-600">لا توجد حركات مبيعات مسجلة في هذا النطاق الزمني بعد</span>
            <span className="text-[11px] text-zinc-400">ستظهر المؤشرات والمنحنى البياني فور إتمام عمليات البيع الحقيقية بالكاشير أو المتجر</span>
          </div>
        ) : (
          <div className="flex items-end gap-3 sm:gap-6 h-48 pt-6 border-b border-zinc-200">
            {salesByDay.map((d, idx) => {
              const heightPercent = Math.max(10, Math.round((d.amountFils / maxDaySalesFils) * 100));
              return (
                <div key={idx} className="flex-1 flex flex-col items-center gap-2 h-full justify-end group">
                  <span className="text-[10px] font-bold text-zinc-500 opacity-0 group-hover:opacity-100 transition font-mono">
                    {(d.amountFils / 1000).toFixed(1)} د.أ
                  </span>
                  <div 
                    className="w-full max-w-[48px] bg-gradient-to-t from-[#E6007E] to-pink-400 rounded-t-xl transition-all duration-500 group-hover:brightness-110 shadow-xs"
                    style={{ height: `${heightPercent}%` }}
                  />
                  <span className="text-xs font-bold text-zinc-600 font-mono mt-1">{d.day}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Report Sub-Tabs */}
      <div className="flex border-b border-zinc-200 gap-4 text-xs font-bold">
        <button
          onClick={() => setActiveReportTab('overview')}
          className={`pb-3 px-2 border-b-2 transition cursor-pointer ${
            activeReportTab === 'overview' ? 'border-[#E6007E] text-[#E6007E]' : 'border-transparent text-zinc-500'
          }`}
        >
          ملخص طرق الدفع والمبيعات
        </button>
        <button
          onClick={() => setActiveReportTab('cashiers')}
          className={`pb-3 px-2 border-b-2 transition cursor-pointer ${
            activeReportTab === 'cashiers' ? 'border-[#E6007E] text-[#E6007E]' : 'border-transparent text-zinc-500'
          }`}
        >
          أداء الموظفين والكاشيرات
        </button>
        <button
          onClick={() => setActiveReportTab('channels')}
          className={`pb-3 px-2 border-b-2 transition cursor-pointer ${
            activeReportTab === 'channels' ? 'border-[#E6007E] text-[#E6007E]' : 'border-transparent text-zinc-500'
          }`}
        >
          مقارنة القنوات (المحل مقابل المتجر)
        </button>
        <button
          onClick={() => setActiveReportTab('expenses')}
          className={`pb-3 px-2 border-b-2 transition cursor-pointer ${
            activeReportTab === 'expenses' ? 'border-[#E6007E] text-[#E6007E]' : 'border-transparent text-zinc-500'
          }`}
        >
          تحليل بنود المصاريف
        </button>
      </div>

      {/* Tab 1: Payment Methods Breakdown */}
      {activeReportTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-xs space-y-4">
            <h3 className="font-extrabold text-sm text-zinc-900">توزيع طرق الدفع لمبيعات المحل</h3>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-bold text-zinc-700">الدفع النقدي (كاش)</span>
                  <span className="font-bold text-emerald-600" dir="ltr">{(cashSalesFils / 1000).toFixed(3)} د.أ</span>
                </div>
                <div className="w-full h-3 bg-zinc-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-emerald-500 rounded-full" 
                    style={{ width: `${totalSalesFils > 0 ? (cashSalesFils / totalSalesFils) * 100 : 0}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-bold text-zinc-700">الدفع بالبطاقة الإلكترونية (فيزا)</span>
                  <span className="font-bold text-blue-600" dir="ltr">{(cardSalesFils / 1000).toFixed(3)} د.أ</span>
                </div>
                <div className="w-full h-3 bg-zinc-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-blue-500 rounded-full" 
                    style={{ width: `${totalSalesFils > 0 ? (cardSalesFils / totalSalesFils) * 100 : 0}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-bold text-zinc-700">البيع الآجل والذمم</span>
                  <span className="font-bold text-amber-600" dir="ltr">{(creditSalesFils / 1000).toFixed(3)} د.أ</span>
                </div>
                <div className="w-full h-3 bg-zinc-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-amber-500 rounded-full" 
                    style={{ width: `${totalSalesFils > 0 ? (creditSalesFils / totalSalesFils) * 100 : 0}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-xs space-y-4">
            <h3 className="font-extrabold text-sm text-zinc-900">معدلات وأرقام الفواتير</h3>
            <div className="space-y-3 text-xs text-zinc-600">
              <div className="flex justify-between p-2.5 bg-zinc-50 rounded-xl">
                <span>متوسط قيمة الفاتورة:</span>
                <span className="font-black text-zinc-900" dir="ltr">
                  {totalInvoicesCount > 0 ? ((totalSalesFils / totalInvoicesCount) / 1000).toFixed(3) : '0.000'} د.أ
                </span>
              </div>
              <div className="flex justify-between p-2.5 bg-zinc-50 rounded-xl">
                <span>إجمالي الخصومات الممنوحة:</span>
                <span className="font-black text-[#E6007E]" dir="ltr">
                  {(sales.reduce((acc, s) => acc + (s.discount || 0), 0) / 1000).toFixed(3)} د.أ
                </span>
              </div>
              <div className="flex justify-between p-2.5 bg-zinc-50 rounded-xl">
                <span>المرتجعات المنفذة:</span>
                <span className="font-black text-red-600">0.000 د.أ</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Cashiers Performance */}
      {activeReportTab === 'cashiers' && (
        <div className="bg-white rounded-2xl border border-zinc-200 shadow-xs overflow-x-auto">
          <table className="w-full min-w-[550px] text-xs text-start">
            <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-600 font-bold">
              <tr>
                <th className="p-3 text-start">اسم الموظف / الكاشير</th>
                <th className="p-3 text-start">عدد الفواتير الصادرة</th>
                <th className="p-3 text-start">إجمالي المبيعات المحققة</th>
                <th className="p-3 text-start">متوسط مبيعات الفاتورة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 font-medium">
              {Array.from(cashierMap.entries()).map(([name, data]) => (
                <tr key={name} className="hover:bg-zinc-50 transition">
                  <td className="p-3 font-bold text-zinc-900">{name}</td>
                  <td className="p-3 font-bold text-zinc-700">{data.count} فاتورة</td>
                  <td className="p-3 font-black text-[#E6007E]" dir="ltr">
                    {(data.total / 1000).toFixed(3)} د.أ
                  </td>
                  <td className="p-3 text-zinc-600" dir="ltr">
                    {data.count > 0 ? ((data.total / data.count) / 1000).toFixed(3) : '0.000'} د.أ
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 3: Channel Comparison */}
      {activeReportTab === 'channels' && (
        <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-xs space-y-4">
          <h3 className="font-extrabold text-sm text-zinc-900">مقارنة مبيعات المحل (POS) مع طلبات الموقع الإلكتروني</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 bg-pink-50/50 rounded-2xl border border-pink-100">
              <span className="font-bold text-xs text-[#E6007E]">نقطة البيع داخل المحل (Ghazal POS)</span>
              <p className="text-xl font-black text-zinc-900 mt-2" dir="ltr">{(totalSalesFils / 1000).toFixed(3)} د.أ</p>
              <p className="text-[11px] text-zinc-500 mt-1">المبيعات المباشرة والفورية داخل الفرع</p>
            </div>
            <div className="p-4 bg-blue-50/50 rounded-2xl border border-blue-100">
              <span className="font-bold text-xs text-blue-700">متجر غزل الإلكتروني (Online Store)</span>
              <p className="text-xl font-black text-zinc-900 mt-2" dir="ltr">
                {productAnalytics && productAnalytics.allProducts ? (productAnalytics.allProducts.reduce((sum, p) => sum + (p.onlineRevenueFils || 0), 0) / 1000).toFixed(3) : '0.000'} د.أ
              </p>
              <p className="text-[11px] text-zinc-500 mt-1">طلبات الشحن والتوصيل المنزلي المستقلة</p>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Expenses Breakdown */}
      {activeReportTab === 'expenses' && (
        <div className="bg-white rounded-2xl border border-zinc-200 shadow-xs overflow-x-auto">
          {expenses.length === 0 ? (
            <div className="p-8 text-center text-xs text-zinc-400 font-bold">
              لا توجد مصاريف تشغيلية مسجلة بعد في النظام
            </div>
          ) : (
            <table className="w-full min-w-[550px] text-xs text-start">
              <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-600 font-bold">
                <tr>
                  <th className="p-3 text-start">بند المصروف</th>
                  <th className="p-3 text-start">المستفيد</th>
                  <th className="p-3 text-start">المبلغ (د.أ)</th>
                  <th className="p-3 text-start">مصدر السداد</th>
                  <th className="p-3 text-start">التاريخ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 font-medium">
                {expenses.map((e) => (
                  <tr key={e.id} className="hover:bg-zinc-50 transition">
                    <td className="p-3 font-bold text-[#E6007E]">{e.category}</td>
                    <td className="p-3 text-zinc-800">{e.beneficiary}</td>
                    <td className="p-3 font-black text-amber-700" dir="ltr">
                      {(e.amountFils / 1000).toFixed(3)} د.أ
                    </td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 bg-zinc-100 rounded text-[10px] font-bold">
                        {e.paidFromDrawer ? 'من صندوق الكاشير' : 'حساب بنكي'}
                      </span>
                    </td>
                    <td className="p-3 text-zinc-500 font-mono" dir="ltr">{formatJordanDateTime(e.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
