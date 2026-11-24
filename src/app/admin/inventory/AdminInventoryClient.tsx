'use client';

import React, { useState, useMemo, useTransition } from 'react';
import { 
  ClipboardCheck, FileText, Printer, Search, Filter, 
  Save, Plus, AlertCircle, CheckCircle2, RefreshCw, 
  SlidersHorizontal, Download, Eye, X, ArrowUpDown
} from 'lucide-react';
import { 
  InventoryItem, InventoryVoucher, InventoryVoucherItem,
  updateItemPhysicalCount, issueInventorySettlementVoucher 
} from '@/actions/inventory';

interface Props {
  initialItems: InventoryItem[];
  initialVouchers: InventoryVoucher[];
}

export default function AdminInventoryClient({ initialItems, initialVouchers }: Props) {
  const [items, setItems] = useState<InventoryItem[]>(initialItems);
  const [vouchers, setVouchers] = useState<InventoryVoucher[]>(initialVouchers);
  const [isPending, startTransition] = useTransition();

  // Navigation Tabs: Inventory Audit Table vs Issued Settlement Vouchers
  const [activeTab, setActiveTab] = useState<'audit' | 'vouchers'>('audit');

  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'MATCH' | 'SHORTAGE' | 'SURPLUS' | 'UNCOUNTED'>('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  // Issue Settlement Invoice Modal State
  const [isVoucherModalOpen, setIsVoucherModalOpen] = useState(false);
  const [voucherTitle, setVoucherTitle] = useState('فاتورة تسوية فروقات الجرد المستودعي');
  const [voucherReason, setVoucherReason] = useState('تسوية العجز والفائض الدوري المعتمد بعد الجرد الفعلي للمحل');
  const [auditorName, setAuditorName] = useState('مدير النظام / أمين المستودع');
  const [voucherSuccessMsg, setVoucherSuccessMsg] = useState<string | null>(null);

  // View Single Voucher Modal State
  const [selectedVoucher, setSelectedVoucher] = useState<InventoryVoucher | null>(null);

  // Categories list
  const categories = useMemo(() => {
    const set = new Set<string>();
    items.forEach(i => { if (i.category) set.add(i.category); });
    return Array.from(set);
  }, [items]);

  // Live Filtered Items
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      // 1. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = item.name.toLowerCase().includes(q);
        const matchBarcode = item.barcode.toLowerCase().includes(q);
        const matchSku = item.sku.toLowerCase().includes(q);
        const matchBrand = item.brand.toLowerCase().includes(q);
        if (!matchName && !matchBarcode && !matchSku && !matchBrand) return false;
      }

      // 2. Status Filter
      if (statusFilter !== 'ALL' && item.status !== statusFilter) return false;

      // 3. Category Filter
      if (categoryFilter !== 'ALL' && item.category !== categoryFilter) return false;

      return true;
    });
  }, [items, searchQuery, statusFilter, categoryFilter]);

  // Overall Financial & Count Indicators
  const stats = useMemo(() => {
    const totalCountedItems = items.filter(i => i.status !== 'UNCOUNTED').length;
    const matchCount = items.filter(i => i.status === 'MATCH').length;
    const shortageCount = items.filter(i => i.status === 'SHORTAGE').length;
    const surplusCount = items.filter(i => i.status === 'SURPLUS').length;

    let totalBookValue = 0;
    let totalActualValue = 0;
    let netVarianceValue = 0;

    items.forEach(i => {
      totalBookValue += i.bookStock * i.unitCostFils;
      totalActualValue += i.physicalStock * i.unitCostFils;
      netVarianceValue += i.varianceValueFils;
    });

    return {
      totalItems: items.length,
      totalCountedItems,
      matchCount,
      shortageCount,
      surplusCount,
      totalBookValue,
      totalActualValue,
      netVarianceValue
    };
  }, [items]);

  // Handle Physical Stock Change
  const handlePhysicalStockChange = (itemId: string, newCountStr: string) => {
    const val = parseInt(newCountStr);
    const newCount = isNaN(val) ? 0 : Math.max(0, val);

    setItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;

      const variance = newCount - item.bookStock;
      const varianceValueFils = variance * item.unitCostFils;
      let status: 'MATCH' | 'SHORTAGE' | 'SURPLUS' | 'UNCOUNTED' = 'MATCH';
      if (variance === 0) status = 'MATCH';
      else if (variance < 0) status = 'SHORTAGE';
      else status = 'SURPLUS';

      return {
        ...item,
        physicalStock: newCount,
        variance,
        varianceValueFils,
        status,
        lastAuditedAt: new Date().toISOString()
      };
    }));

    // Save change in background
    startTransition(async () => {
      await updateItemPhysicalCount(itemId, newCount);
    });
  };

  // Handle Note Change
  const handleItemNoteChange = (itemId: string, notes: string) => {
    setItems(prev => prev.map(item => item.id === itemId ? { ...item, notes } : item));
    startTransition(async () => {
      const it = items.find(x => x.id === itemId);
      if (it) {
        await updateItemPhysicalCount(itemId, it.physicalStock, notes);
      }
    });
  };

  // Items eligible for settlement (having shortage or surplus)
  const itemsWithVariance = useMemo(() => {
    return items.filter(i => i.variance !== 0);
  }, [items]);

  // Handle Issue Voucher Submit
  const handleIssueVoucherSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (itemsWithVariance.length === 0) {
      alert('لا توجد أصناف بها فروقات لإصدار فاتورة تسوية لها.');
      return;
    }

    const voucherItems: InventoryVoucherItem[] = itemsWithVariance.map(i => ({
      id: i.id,
      sku: i.sku,
      barcode: i.barcode,
      name: i.name,
      specification: i.specification,
      bookStock: i.bookStock,
      physicalStock: i.physicalStock,
      difference: i.variance,
      unitCostFils: i.unitCostFils,
      totalDiffFils: i.varianceValueFils
    }));

    startTransition(async () => {
      const res = await issueInventorySettlementVoucher({
        title: voucherTitle,
        reason: voucherReason,
        auditorName,
        items: voucherItems
      });

      if (res.success && res.voucher) {
        setVouchers(prev => [res.voucher!, ...prev]);
        // Update items to be MATCH since book stock is adjusted
        setItems(prev => prev.map(item => {
          const matched = voucherItems.find(v => v.id === item.id);
          if (matched) {
            return {
              ...item,
              bookStock: matched.physicalStock,
              variance: 0,
              varianceValueFils: 0,
              status: 'MATCH'
            };
          }
          return item;
        }));

        setIsVoucherModalOpen(false);
        setVoucherSuccessMsg(`تم إصدار فاتورة التسوية رقم (${res.voucher.voucherNumber}) بنجاح وتحديث الأرصدة الدفترية.`);
        setTimeout(() => setVoucherSuccessMsg(null), 5000);
      } else {
        alert(res.error || 'فشل إصدار فاتورة التسوية');
      }
    });
  };

  return (
    <div className="p-4 md:p-8 space-y-6 font-sans text-slate-900 max-w-[1400px] mx-auto" dir="rtl">
      {/* Official Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-300">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-2 rounded-lg bg-slate-900 text-white">
              <ClipboardCheck className="w-5 h-5" />
            </span>
            <h1 className="text-xl md:text-2xl font-black text-slate-900 font-heading">
              نظام الجرد المستودعي الشامل والمطابقة المالية
            </h1>
          </div>
          <p className="text-xs text-slate-500 font-medium">
            محل غزل لمستحضرات التجميل والمكياج والعناية — عين الباشا (شارع القدس) • وثيقة رسمية معتمدة
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto print:hidden">
          <button
            type="button"
            onClick={() => setIsVoucherModalOpen(true)}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>إصدار فاتورة تسوية جردية</span>
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>تصدير محضر الجرد (PDF)</span>
          </button>
        </div>
      </div>

      {voucherSuccessMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl text-xs font-bold flex items-center gap-2 animate-fade-in print:hidden">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
          <span>{voucherSuccessMsg}</span>
        </div>
      )}

      {/* Official Printable Header for A4 PDF */}
      <div className="hidden print:block text-slate-900 mb-6">
        <div className="border-b-2 border-slate-900 pb-4 mb-4 flex items-center justify-between">
          <div className="space-y-1">
            <h2 className="text-lg font-black tracking-wide text-slate-900">
              محل غزل للمكياج والتجميل والعناية — GHAZAL
            </h2>
            <p className="text-xs text-slate-700 font-bold">
              المملكة الأردنية الهاشمية — عين الباشا (شارع القدس) • هاتف: 0785050655
            </p>
            <p className="text-[11px] text-slate-600">
              محضر وقوائم الجرد المستودعي الفعلي والمطابقة الدفترية الدورية
            </p>
          </div>
          <div className="flex flex-col items-center">
            <div className="w-16 h-16 p-1 border border-slate-300 rounded-lg bg-white flex items-center justify-center">
              <img src="/logo.png" alt="شعار غزل" className="max-w-full max-h-full object-contain" />
            </div>
            <span className="text-[9px] font-bold text-slate-600 mt-1">سجل جرد معتمد</span>
          </div>
        </div>

        <div className="bg-slate-50 p-3 rounded-lg border border-slate-300 grid grid-cols-3 gap-3 text-xs mb-4">
          <div>
            <span className="text-slate-500 block text-[10px] font-bold">تاريخ وساعة استخراج المحضر:</span>
            <span className="font-bold text-slate-900 font-mono" dir="ltr">{new Date().toLocaleString('ar-JO')}</span>
          </div>
          <div>
            <span className="text-slate-500 block text-[10px] font-bold">لجنة الجرد والمطابقة:</span>
            <span className="font-bold text-slate-900">{auditorName}</span>
          </div>
          <div>
            <span className="text-slate-500 block text-[10px] font-bold">حالة الاعتماد:</span>
            <span className="font-bold text-slate-900">مطابقة جردية شاملة معتمدة</span>
          </div>
        </div>
      </div>

      {/* Formal Financial & Stock Indicators (Strictly Clean & Formal) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 print:grid-cols-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <span className="text-slate-500 text-[11px] font-bold block mb-1">إجمالي الأصناف المجرودة</span>
          <p className="text-xl font-black text-slate-900 font-mono">
            {stats.totalCountedItems} <span className="text-xs font-medium text-slate-500">/ {stats.totalItems} صنف</span>
          </p>
          <span className="text-[10px] text-slate-400 block mt-1 font-bold">
            {stats.matchCount} مطابق • {stats.shortageCount} عجز • {stats.surplusCount} زيادة
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <span className="text-slate-500 text-[11px] font-bold block mb-1">إجمالي القيمة الدفترية</span>
          <p className="text-xl font-black text-slate-800 font-mono" dir="ltr">
            {(stats.totalBookValue / 1000).toFixed(3)} <span className="text-xs font-bold text-slate-500">د.أ</span>
          </p>
          <span className="text-[10px] text-slate-400 block mt-1">حسب الأرصدة المسجلة بالنظام</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <span className="text-slate-500 text-[11px] font-bold block mb-1">القيمة الفعلية للمخزون</span>
          <p className="text-xl font-black text-slate-900 font-mono" dir="ltr">
            {(stats.totalActualValue / 1000).toFixed(3)} <span className="text-xs font-bold text-slate-500">د.أ</span>
          </p>
          <span className="text-[10px] text-slate-400 block mt-1">المحسوبة بعد العد اليدوي الفعلي</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <span className="text-slate-500 text-[11px] font-bold block mb-1">صافي قيمة فروقات الجرد</span>
          <p className={`text-xl font-black font-mono ${stats.netVarianceValue < 0 ? 'text-red-700' : stats.netVarianceValue > 0 ? 'text-blue-700' : 'text-slate-800'}`} dir="ltr">
            {stats.netVarianceValue > 0 ? '+' : ''}{(stats.netVarianceValue / 1000).toFixed(3)} <span className="text-xs font-bold text-slate-500">د.أ</span>
          </p>
          <span className="text-[10px] font-bold block mt-1">
            {stats.netVarianceValue < 0 ? 'عجز محاسبي يستوجب تسوية' : stats.netVarianceValue > 0 ? 'فائض مخزون إضافي' : 'رصيد مطابق 100%'}
          </span>
        </div>
      </div>

      {/* Tabs Switcher: Audit Table vs Settlement Invoices */}
      <div className="flex border-b border-slate-300 gap-4 text-xs font-bold print:hidden">
        <button
          type="button"
          onClick={() => setActiveTab('audit')}
          className={`pb-3 px-2 border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'audit' ? 'border-slate-900 text-slate-900 font-black' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <ClipboardCheck className="w-4 h-4" />
          <span>جدول الجرد الفعلي والمطابقة المباشرة ({filteredItems.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('vouchers')}
          className={`pb-3 px-2 border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'vouchers' ? 'border-slate-900 text-slate-900 font-black' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>فواتير وسندات التسوية الصادرة ({vouchers.length})</span>
        </button>
      </div>

      {/* TAB 1: Comprehensive Stocktaking Audit Table */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs print:hidden">
            <div className="flex-1 relative">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="بحث بالباركود، رمز SKU، اسم المستحضر، أو الماركة..."
                className="w-full pr-9 pl-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-slate-900 focus:bg-white"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Category Filter */}
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 outline-none focus:border-slate-900 cursor-pointer"
              >
                <option value="ALL">جميع الأقسام والتصنيفات</option>
                {categories.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>

              {/* Status Filter */}
              <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 font-bold text-[11px]">
                <button
                  type="button"
                  onClick={() => setStatusFilter('ALL')}
                  className={`px-2.5 py-1.5 rounded-md transition cursor-pointer ${statusFilter === 'ALL' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'}`}
                >
                  الكل
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('SHORTAGE')}
                  className={`px-2.5 py-1.5 rounded-md transition cursor-pointer ${statusFilter === 'SHORTAGE' ? 'bg-white text-red-700 shadow-2xs' : 'text-slate-600'}`}
                >
                  عجز ({stats.shortageCount})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('SURPLUS')}
                  className={`px-2.5 py-1.5 rounded-md transition cursor-pointer ${statusFilter === 'SURPLUS' ? 'bg-white text-blue-700 shadow-2xs' : 'text-slate-600'}`}
                >
                  زيادة ({stats.surplusCount})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('MATCH')}
                  className={`px-2.5 py-1.5 rounded-md transition cursor-pointer ${statusFilter === 'MATCH' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'}`}
                >
                  مطابق ({stats.matchCount})
                </button>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto w-full">
              <table className="w-full text-right border-collapse text-xs">
                <thead className="bg-slate-100 border-b border-slate-300 text-slate-700 font-black">
                  <tr>
                    <th className="p-3 text-start">الباركود / SKU</th>
                    <th className="p-3 text-start">اسم الصنف والمواصفة</th>
                    <th className="p-3 text-start">القسم</th>
                    <th className="p-3 text-center">الرصيد الدفتري</th>
                    <th className="p-3 text-center print:hidden">الرصيد الفعلي (العد اليدوي)</th>
                    <th className="p-3 text-center hidden print:table-cell">الفعلي</th>
                    <th className="p-3 text-center">الفارق</th>
                    <th className="p-3 text-start">سعر التكلفة</th>
                    <th className="p-3 text-start">قيمة الفارق (د.أ)</th>
                    <th className="p-3 text-center">الحالة</th>
                    <th className="p-3 text-start">ملاحظات التدقيق</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-medium text-slate-800">
                  {filteredItems.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Barcode & SKU */}
                      <td className="p-3 font-mono text-[11px] text-slate-600">
                        <span className="block font-bold text-slate-900">{item.barcode}</span>
                        <span className="text-[10px] text-slate-400">{item.sku}</span>
                      </td>

                      {/* Product Name */}
                      <td className="p-3 font-bold text-slate-900">
                        <span>{item.name}</span>
                        <span className="block text-[11px] font-normal text-slate-500">{item.specification} • {item.brand}</span>
                      </td>

                      {/* Category */}
                      <td className="p-3 text-slate-600 font-bold">{item.category}</td>

                      {/* Book Stock */}
                      <td className="p-3 text-center font-mono font-bold text-slate-700">
                        {item.bookStock}
                      </td>

                      {/* Physical Stock Input */}
                      <td className="p-3 text-center print:hidden">
                        <input
                          type="number"
                          min="0"
                          value={item.physicalStock}
                          onChange={(e) => handlePhysicalStockChange(item.id, e.target.value)}
                          className="w-16 px-2 py-1 bg-slate-50 border border-slate-300 rounded text-center font-mono font-black text-xs text-slate-900 focus:bg-white focus:border-slate-900 outline-none"
                        />
                      </td>
                      <td className="p-3 text-center font-mono font-bold hidden print:table-cell">
                        {item.physicalStock}
                      </td>

                      {/* Variance */}
                      <td className="p-3 text-center font-mono font-black text-xs">
                        <span className={item.variance < 0 ? 'text-red-700' : item.variance > 0 ? 'text-blue-700' : 'text-slate-600'}>
                          {item.variance > 0 ? `+${item.variance}` : item.variance}
                        </span>
                      </td>

                      {/* Unit Cost */}
                      <td className="p-3 font-mono text-slate-600" dir="ltr">
                        {(item.unitCostFils / 1000).toFixed(3)}
                      </td>

                      {/* Total Variance Value */}
                      <td className="p-3 font-mono font-bold" dir="ltr">
                        <span className={item.varianceValueFils < 0 ? 'text-red-700' : item.varianceValueFils > 0 ? 'text-blue-700' : 'text-slate-500'}>
                          {(item.varianceValueFils / 1000).toFixed(3)}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="p-3 text-center">
                        {item.status === 'MATCH' && (
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-800 rounded text-[10px] font-bold border border-slate-200">
                            مطابق
                          </span>
                        )}
                        {item.status === 'SHORTAGE' && (
                          <span className="px-2 py-0.5 bg-red-50 text-red-700 rounded text-[10px] font-bold border border-red-200">
                            عجز ({Math.abs(item.variance)})
                          </span>
                        )}
                        {item.status === 'SURPLUS' && (
                          <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] font-bold border border-blue-200">
                            زيادة (+{item.variance})
                          </span>
                        )}
                        {item.status === 'UNCOUNTED' && (
                          <span className="px-2 py-0.5 bg-zinc-100 text-zinc-500 rounded text-[10px] font-bold">
                            غير مجرود
                          </span>
                        )}
                      </td>

                      {/* Notes */}
                      <td className="p-3">
                        <input
                          type="text"
                          value={item.notes || ''}
                          onChange={(e) => handleItemNoteChange(item.id, e.target.value)}
                          placeholder="ملاحظة الجرد..."
                          className="w-full min-w-[120px] px-2 py-1 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-slate-900 text-[11px] outline-none text-slate-700"
                        />
                      </td>
                    </tr>
                  ))}

                  {filteredItems.length === 0 && (
                    <tr>
                      <td colSpan={10} className="p-8 text-center text-slate-400 font-bold">
                        لا توجد أصناف مطابقة لخيارات الفلترة المحددة.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Issued Settlement Vouchers & Invoices */}
      {activeTab === 'vouchers' && (
        <div className="space-y-4 print:hidden">
          <div className="bg-white p-4 rounded-xl border border-slate-200 flex items-center justify-between">
            <div>
              <h3 className="font-extrabold text-sm text-slate-900">سجل فواتير وسندات التسوية الجردية الرسمية</h3>
              <p className="text-xs text-slate-500">الفواتير والسندات المعتمدة لتعديل أرصدة المخزون بعد عمليات الجرد</p>
            </div>
            <button
              type="button"
              onClick={() => setIsVoucherModalOpen(true)}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>إصدار فاتورة تسوية جديدة</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {vouchers.map((vch) => (
              <div key={vch.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <div>
                    <span className="font-mono font-black text-sm text-slate-900 block">{vch.voucherNumber}</span>
                    <span className="text-[10px] text-slate-400 font-mono" dir="ltr">{new Date(vch.createdAt).toLocaleString('ar-JO')}</span>
                  </div>
                  <span className="px-2.5 py-1 bg-slate-100 text-slate-800 rounded-full text-[10px] font-extrabold border border-slate-200">
                    فاتورة تسوية معتمدة
                  </span>
                </div>

                <h4 className="font-bold text-xs text-slate-900">{vch.title}</h4>
                <p className="text-[11px] text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-200 leading-relaxed">
                  <strong className="text-slate-800">سبب التسوية:</strong> {vch.reason}
                </p>

                <div className="grid grid-cols-3 gap-2 text-center text-xs pt-1 border-t border-slate-100">
                  <div className="p-2 bg-slate-50 rounded-lg">
                    <span className="text-[10px] text-slate-500 block">الأصناف المعدلة</span>
                    <span className="font-bold text-slate-900">{vch.totalItemsCount} صنف</span>
                  </div>
                  <div className="p-2 bg-slate-50 rounded-lg col-span-2">
                    <span className="text-[10px] text-slate-500 block">صافي مبلغ التسوية</span>
                    <span className={`font-black font-mono ${vch.netVarianceFils < 0 ? 'text-red-700' : 'text-slate-900'}`} dir="ltr">
                      {(vch.netVarianceFils / 1000).toFixed(3)} د.أ
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <span className="text-[10px] text-slate-500">{vch.auditorName}</span>
                  <button
                    type="button"
                    onClick={() => setSelectedVoucher(vch)}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>عرض وطباعة الفاتورة</span>
                  </button>
                </div>
              </div>
            ))}

            {vouchers.length === 0 && (
              <div className="col-span-2 bg-white p-12 text-center rounded-2xl border border-slate-200 text-slate-400 font-bold">
                لم يتم إصدار فواتير تسوية جردية بعد.
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL 1: Issue Settlement Voucher */}
      {isVoucherModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto" dir="rtl">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-300 animate-fade-in my-8 text-xs font-bold text-slate-800">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-slate-900" />
                <h3 className="font-black text-base text-slate-900">إصدار فاتورة تسوية جردية رسمية</h3>
              </div>
              <button onClick={() => setIsVoucherModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer">
                ✕
              </button>
            </div>

            <form onSubmit={handleIssueVoucherSubmit} className="space-y-4 pt-4">
              <div>
                <label className="block mb-1 text-slate-700">عنوان وثيقة التسوية:</label>
                <input
                  type="text"
                  required
                  value={voucherTitle}
                  onChange={(e) => setVoucherTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold outline-none focus:border-slate-900 focus:bg-white"
                />
              </div>

              <div>
                <label className="block mb-1 text-slate-700">اسم مسؤول الجرد / المدقق:</label>
                <input
                  type="text"
                  required
                  value={auditorName}
                  onChange={(e) => setAuditorName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold outline-none focus:border-slate-900 focus:bg-white"
                />
              </div>

              <div>
                <label className="block mb-1 text-slate-700">سبب التسوية المحاسبية والاعتماد: *</label>
                <textarea
                  rows={2}
                  required
                  value={voucherReason}
                  onChange={(e) => setVoucherReason(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium outline-none focus:border-slate-900 focus:bg-white resize-none"
                />
              </div>

              {/* Items summary */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                <div className="flex justify-between text-xs">
                  <span>الأصناف التي سيتم تعديل رصيدها الدفتري:</span>
                  <span className="font-black text-slate-900 font-mono">{itemsWithVariance.length} صنف</span>
                </div>
                <div className="max-h-40 overflow-y-auto divide-y divide-slate-200 text-[11px] pr-1">
                  {itemsWithVariance.map(item => (
                    <div key={item.id} className="py-1.5 flex justify-between items-center">
                      <span>{item.name} ({item.specification})</span>
                      <span className={`font-mono font-bold ${item.variance < 0 ? 'text-red-700' : 'text-blue-700'}`}>
                        {item.bookStock} ← {item.physicalStock} ({item.variance > 0 ? `+${item.variance}` : item.variance})
                      </span>
                    </div>
                  ))}
                  {itemsWithVariance.length === 0 && (
                    <p className="text-slate-400 py-2">لا توجد أصناف بها فروقات حالياً؛ جميع الأرصدة متطابقة.</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="submit"
                  disabled={isPending || itemsWithVariance.length === 0}
                  className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-black rounded-xl transition shadow-xs flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  <span>اعتماد وإصدار الفاتورة وتحديث الأرصدة</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsVoucherModalOpen(false)}
                  className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: View Single Voucher Modal */}
      {selectedVoucher && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto" dir="rtl">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-300 animate-fade-in my-8 text-xs font-bold text-slate-800 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <span className="font-mono font-black text-sm text-slate-900 block">{selectedVoucher.voucherNumber}</span>
                <span className="text-[10px] text-slate-400">{new Date(selectedVoucher.createdAt).toLocaleString('ar-JO')}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3 py-1 bg-slate-900 text-white rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>طباعة</span>
                </button>
                <button onClick={() => setSelectedVoucher(null)} className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer">
                  ✕
                </button>
              </div>
            </div>

            <h3 className="font-black text-sm text-slate-900">{selectedVoucher.title}</h3>
            <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-200">
              <strong>سبب التسوية:</strong> {selectedVoucher.reason}
            </p>

            <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-100 border-b border-slate-200 text-slate-700 font-black">
                  <tr>
                    <th className="p-2.5">الصنف</th>
                    <th className="p-2.5 text-center">الرصيد السابق</th>
                    <th className="p-2.5 text-center">الرصيد المعدل</th>
                    <th className="p-2.5 text-center">الفارق</th>
                    <th className="p-2.5 text-start">القيمة (د.أ)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedVoucher.items.map(it => (
                    <tr key={it.id}>
                      <td className="p-2.5">{it.name} ({it.specification})</td>
                      <td className="p-2.5 text-center font-mono">{it.bookStock}</td>
                      <td className="p-2.5 text-center font-mono font-bold">{it.physicalStock}</td>
                      <td className={`p-2.5 text-center font-mono font-bold ${it.difference < 0 ? 'text-red-700' : 'text-blue-700'}`}>
                        {it.difference > 0 ? `+${it.difference}` : it.difference}
                      </td>
                      <td className="p-2.5 font-mono" dir="ltr">{(it.totalDiffFils / 1000).toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-slate-200 text-xs">
              <span className="text-slate-500">مسؤول الجرد: {selectedVoucher.auditorName}</span>
              <span className="font-mono font-black text-sm" dir="ltr">
                صافي الفارق: {(selectedVoucher.netVarianceFils / 1000).toFixed(3)} د.أ
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
