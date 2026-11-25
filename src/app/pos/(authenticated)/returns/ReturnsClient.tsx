'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { getSaleForReturn, processPOSReturn, getPOSReturnsLog } from '@/actions/pos';
import {
  Search,
  ArrowDownLeft,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Printer,
  RotateCcw,
  FileEdit,
  FileText,
  Clock,
  X,
  Check
} from 'lucide-react';
import { formatJordanDateTime, getJordanNowFormatted } from '@/lib/date';

interface ReturnableItem {
  variantId: string;
  sku: string;
  name: string;
  size: string;
  shade: string | null;
  unitPrice: number;
  originalQty: number;
  alreadyReturned: number;
  remainingQty: number;
}

interface SaleData {
  id: string;
  reference: string;
  invoiceNumber: string | null;
  total: number;
  customerName: string | null;
  createdAt: string;
  status?: string;
  isFullyReturned?: boolean;
  notes?: string | null;
  items: ReturnableItem[];
}

export function ReturnsClient() {
  const [isPending, startTransition] = useTransition();
  const [searchQuery, setSearchQuery] = useState('');
  const [sale, setSale] = useState<SaleData | null>(null);
  const [returnQtys, setReturnQtys] = useState<Record<string, number>>({});
  const [refundMethod, setRefundMethod] = useState<'CASH' | 'CARD'>('CASH');
  const [reason, setReason] = useState('مرتجع كاشير');
  const [errorMsg, setErrorMsg] = useState('');
  const [successResult, setSuccessResult] = useState<any | null>(null);

  // Return Choice Mode: Full Return vs Modify Invoice & Reissue
  const [returnMode, setReturnMode] = useState<'FULL_RETURN' | 'MODIFY_INVOICE'>('FULL_RETURN');
  const [previewReceiptOpen, setPreviewReceiptOpen] = useState(false);

  // View Mode: New Return vs Returned Invoices Log
  const [activeViewTab, setActiveViewTab] = useState<'NEW_RETURN' | 'RETURNS_LOG'>('NEW_RETURN');
  const [returnsLog, setReturnsLog] = useState<any[]>([]);
  const [returnsLogLoading, setReturnsLogLoading] = useState(false);
  const [returnsFilterSearch, setReturnsFilterSearch] = useState('');
  const [returnsFilterMode, setReturnsFilterMode] = useState<'ALL' | 'FULL_RETURN' | 'MODIFY_INVOICE'>('ALL');
  const [selectedReturnForPreview, setSelectedReturnForPreview] = useState<any | null>(null);

  const fetchReturnsLog = async () => {
    setReturnsLogLoading(true);
    try {
      const res = await getPOSReturnsLog();
      if (res && res.success && res.returns) {
        setReturnsLog(res.returns);
      }
    } catch (err) {
      console.warn('Failed to fetch returns log:', err);
    } finally {
      setReturnsLogLoading(false);
    }
  };

  useEffect(() => {
    fetchReturnsLog();
  }, []);

  const applyFullReturnQtys = (items: ReturnableItem[]) => {
    const full: Record<string, number> = {};
    items.forEach((item) => {
      full[item.variantId] = item.remainingQty;
    });
    setReturnQtys(full);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setErrorMsg('');
    setSuccessResult(null);

    startTransition(async () => {
      const res = await getSaleForReturn(searchQuery.trim());
      if (res.success && res.sale) {
        const fetchedSale = res.sale as SaleData;
        setSale(fetchedSale);

        if (returnMode === 'FULL_RETURN') {
          applyFullReturnQtys(fetchedSale.items);
        } else {
          const initialQtys: Record<string, number> = {};
          fetchedSale.items.forEach((item) => {
            initialQtys[item.variantId] = 0;
          });
          setReturnQtys(initialQtys);
        }
      } else {
        setSale(null);
        setErrorMsg(res.error || 'لم يتم العثور على الفاتورة');
      }
    });
  };

  const handleModeChange = (mode: 'FULL_RETURN' | 'MODIFY_INVOICE') => {
    setReturnMode(mode);
    if (!sale) return;

    if (mode === 'FULL_RETURN') {
      applyFullReturnQtys(sale.items);
      setReason('إرجاع الفاتورة بالكامل واسترداد القيمة');
    } else {
      const zeroQtys: Record<string, number> = {};
      sale.items.forEach((item) => {
        zeroQtys[item.variantId] = 0;
      });
      setReturnQtys(zeroQtys);
      setReason('تعديل الفاتورة وحذف منتجات مرتجعة');
    }
  };

  const handleQtyChange = (variantId: string, val: number, max: number) => {
    const clamped = Math.max(0, Math.min(val, max));
    setReturnQtys((prev) => ({ ...prev, [variantId]: clamped }));
  };

  const handleSetMaxQty = (variantId: string, max: number) => {
    setReturnQtys((prev) => ({ ...prev, [variantId]: max }));
  };

  const calculateTotalRefundFils = () => {
    if (!sale) return 0;
    return sale.items.reduce((acc, item) => {
      const qty = returnQtys[item.variantId] || 0;
      return acc + qty * item.unitPrice;
    }, 0);
  };

  const calculateNewInvoiceTotalFils = () => {
    if (!sale) return 0;
    const refund = calculateTotalRefundFils();
    return Math.max(0, sale.total - refund);
  };

  const handleSubmitReturn = () => {
    if (!sale) return;
    setErrorMsg('');

    const itemsToReturn = sale.items
      .filter((item) => (returnQtys[item.variantId] || 0) > 0)
      .map((item) => ({
        variantId: item.variantId,
        quantity: returnQtys[item.variantId],
        amount: returnQtys[item.variantId] * item.unitPrice,
      }));

    if (itemsToReturn.length === 0) {
      setErrorMsg('يرجى تحديد كمية للإرجاع لصنف واحد على الأقل');
      return;
    }

    startTransition(async () => {
      const res = await processPOSReturn({
        saleReference: sale.reference,
        items: itemsToReturn,
        refundMethod,
        reason: reason.trim() || (returnMode === 'FULL_RETURN' ? 'إرجاع الفاتورة بالكامل' : 'تعديل الفاتورة'),
        returnMode,
      });

      if (res.success && res.returnRecord) {
        setSuccessResult({
          returnId: res.returnRecord.id,
          totalRefundFils: res.refundAmountFils || res.returnRecord.totalAmount,
          itemCount: itemsToReturn.length,
          refundMethod,
          returnMode,
          isModified: res.isModified,
          newTotalFils: res.newTotalFils,
          newInvoiceNumber: res.newInvoiceNumber || sale.invoiceNumber || sale.reference,
          modificationNote: res.modificationNote,
          originalSale: sale,
          returnedItems: itemsToReturn.map((rit) => {
            const original = sale.items.find((i) => i.variantId === rit.variantId);
            return {
              ...rit,
              name: original?.name || 'صنف',
              unitPrice: original?.unitPrice || 0,
            };
          }),
        });
        setSale(null);
        setSearchQuery('');
        fetchReturnsLog();
      } else {
        setErrorMsg(res.error || 'فشل معالجة المرتجع');
      }
    });
  };

  const filteredReturnsLog = returnsLog.filter((r) => {
    if (returnsFilterMode !== 'ALL' && r.returnMode !== returnsFilterMode) return false;
    if (returnsFilterSearch.trim()) {
      const q = returnsFilterSearch.trim().toLowerCase();
      const match =
        (r.saleReference && r.saleReference.toLowerCase().includes(q)) ||
        (r.invoiceNumber && r.invoiceNumber.toLowerCase().includes(q)) ||
        (r.customerName && r.customerName.toLowerCase().includes(q)) ||
        (r.reason && r.reason.toLowerCase().includes(q)) ||
        (r.id && r.id.toLowerCase().includes(q));
      if (!match) return false;
    }
    return true;
  });

  const totalRefundAmountFils = filteredReturnsLog.reduce((acc, r) => acc + (r.totalRefundFils || 0), 0);

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6" dir="rtl">
      {/* Top Header & Navigation Tabs */}
      <div className="bg-white rounded-3xl p-4 shadow-xs border border-zinc-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-black text-zinc-900 flex items-center gap-2">
            <RotateCcw className="w-5 h-5 text-[#E6007E]" />
            <span>نظام المرتجعات وتعديل الفواتير (POS Returns & Modifications)</span>
          </h1>
          <p className="text-xs text-zinc-500 font-medium">إرجاع الفواتير بالكامل، تعديل الفواتير وحذف الأصناف، ومتابعة سجل المرتجعات</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveViewTab('NEW_RETURN')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-black transition cursor-pointer ${
              activeViewTab === 'NEW_RETURN'
                ? 'bg-[#E6007E] text-white shadow-sm'
                : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700'
            }`}
          >
            <RotateCcw className="w-4 h-4" />
            <span>إجراء مرتجع جديد</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveViewTab('RETURNS_LOG');
              fetchReturnsLog();
            }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-black transition cursor-pointer ${
              activeViewTab === 'RETURNS_LOG'
                ? 'bg-[#E6007E] text-white shadow-sm'
                : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>سجل الفواتير المرتجعة</span>
            <span className="ms-1 px-2 py-0.5 rounded-full text-[10px] bg-black/15 text-current font-mono font-black">
              {returnsLog.length}
            </span>
          </button>
        </div>
      </div>

      {/* Alert Notices */}
      {errorMsg && (
        <div className="p-4 bg-red-50 border-r-4 border-red-500 rounded-xl flex items-center gap-3 text-red-800 text-xs font-bold animate-fade-in shadow-xs">
          <AlertCircle className="w-5 h-5 shrink-0 text-red-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* VIEW 1: NEW RETURN */}
      {activeViewTab === 'NEW_RETURN' && (
        <div className="space-y-6">

      {/* Success Notification */}
      {successResult && (
        <div className="p-6 bg-white border border-emerald-200 rounded-3xl text-center space-y-4 shadow-sm animate-fade-in">
          <div className="w-14 h-14 bg-emerald-500 text-white rounded-full flex items-center justify-center mx-auto shadow-md">
            <CheckCircle className="w-8 h-8" />
          </div>

          <div>
            <h3 className="text-lg font-black text-slate-900">
              {successResult.returnMode === 'FULL_RETURN'
                ? 'تم إرجاع الفاتورة بالكامل بنجاح وتم وسمها كـ [تم إرجاعها بالكامل]'
                : 'تم تعديل الفاتورة وحذف المنتجات وإصدار فاتورة جديدة معدلة بنجاح!'}
            </h3>
            <p className="text-xs text-slate-600 mt-1">
              تم استرداد مبلغ{' '}
              <strong className="font-mono text-emerald-700 font-black text-sm">
                {(successResult.totalRefundFils / 1000).toFixed(3)} د.أ
              </strong>{' '}
              ({successResult.refundMethod === 'CASH' ? 'نقداً من الدرج' : 'إلى البطاقة'})
            </p>
          </div>

          {/* Details Box */}
          <div className="max-w-lg mx-auto bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs space-y-2 text-right">
            {successResult.returnMode === 'FULL_RETURN' ? (
              <div className="flex items-center justify-between">
                <span className="text-slate-500">حالة الفاتورة المعتمدة:</span>
                <span className="px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 font-black text-[11px]">
                  تم إرجاعها بالكامل (REFUNDED)
                </span>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">رقم الفاتورة المعدلة الجديدة:</span>
                  <span className="font-mono font-black text-purple-900 text-sm">
                    {successResult.newInvoiceNumber}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">الإجمالي الجديد بعد حذف المرتجع:</span>
                  <span className="font-mono font-black text-emerald-700 text-sm">
                    {(successResult.newTotalFils / 1000).toFixed(3)} د.أ
                  </span>
                </div>
                {successResult.modificationNote && (
                  <div className="pt-2 border-t border-slate-200 text-[11px] text-slate-600 bg-amber-50/70 p-2.5 rounded-xl border border-amber-200">
                    <div className="font-bold text-amber-900 mb-0.5 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      <span>ملاحظة التوثيق الرسمية المسجلة بالفاتورة:</span>
                    </div>
                    <p className="font-medium">{successResult.modificationNote}</p>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => setPreviewReceiptOpen(true)}
              className="px-5 py-2.5 bg-slate-900 hover:bg-black text-white text-xs font-black rounded-xl transition flex items-center gap-2 shadow-xs cursor-pointer"
            >
              <Printer className="w-4 h-4 text-pink-400" />
              <span>
                {successResult.returnMode === 'FULL_RETURN'
                  ? 'معاينة وطباعة إيصال الاسترداد الكامل'
                  : 'معاينة وطباعة الفاتورة المعدلة الجديدة'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSuccessResult(null)}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
            >
              إجراء معاملة أخرى
            </button>
          </div>
        </div>
      )}

      {/* Invoice Search Bar */}
      <div className="bg-white rounded-3xl shadow-xs border border-zinc-200 p-5 space-y-2">
        <h2 className="text-xs font-black text-zinc-900 flex items-center gap-2">
          <Search className="w-4 h-4 text-[#E6007E]" />
          <span>البحث عن الفاتورة المرجعية:</span>
        </h2>
        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="امسح باركود الإيصال أو أدخل رقم الفاتورة / المرجع (مثال: INV-2026-001 أو SALE-1001)..."
              className="w-full border border-zinc-200 rounded-2xl py-2.5 px-10 text-xs font-bold text-zinc-900 outline-none focus:border-[#E6007E] bg-zinc-50 focus:bg-white transition"
              autoFocus
            />
            <Search className="w-4 h-4 text-zinc-400 absolute start-3 top-3 pointer-events-none" />
          </div>
          <button
            type="submit"
            disabled={isPending}
            className="bg-[#E6007E] hover:bg-[#C5006C] text-white px-5 py-2.5 rounded-2xl text-xs font-black transition-colors disabled:opacity-50 flex items-center gap-1.5 shrink-0 shadow-xs cursor-pointer"
          >
            {isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            <span>بحث</span>
          </button>
        </form>
      </div>

      {/* Sale Items Review & Mode Selection */}
      {sale && (
        <div className="bg-white rounded-3xl shadow-xs border border-zinc-200 overflow-hidden space-y-0 animate-fade-in">
          {/* Header bar */}
          <div className="p-4 bg-zinc-50 border-b border-zinc-200 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3">
              <span className="text-zinc-500">رقم الفاتورة:</span>
              <strong className="text-zinc-900 font-mono text-sm font-black">
                {sale.invoiceNumber || sale.reference}
              </strong>
              <span className="text-zinc-300">•</span>
              <span className="text-zinc-500">العميل:</span>
              <strong className="text-zinc-900 font-bold">{sale.customerName || 'عميل نقدي'}</strong>
            </div>
            <div className="flex items-center gap-3 text-zinc-500 font-mono text-[11px]">
              <span>تاريخ البيع: {new Date(sale.createdAt).toLocaleDateString('ar-JO')}</span>
              <span className="px-2 py-0.5 rounded-md bg-zinc-200 text-zinc-800 font-bold">
                الإجمالي الأصلي: {(sale.total / 1000).toFixed(3)} د.أ
              </span>
            </div>
          </div>

          {/* RETURN OPTION SELECTOR (Full Return vs Modify Invoice) */}
          <div className="p-5 bg-gradient-to-r from-purple-50/70 via-pink-50/50 to-white border-b border-zinc-200 space-y-3">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-purple-600 text-white">
                <FileEdit className="w-4 h-4" />
              </span>
              <div>
                <h3 className="font-black text-xs text-zinc-900">
                  حدد نوع الإجراء المطلوب على الفاتورة:
                </h3>
                <p className="text-[11px] text-zinc-500">
                  يمكنك إما إرجاع الفاتورة بالكامل ووسمها مستردة، أو تعديل الفاتورة بحذف منتجات محددة وإصدار فاتورة جديدة موثقة.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {/* Option A: Full Return */}
              <div
                onClick={() => handleModeChange('FULL_RETURN')}
                className={`p-4 rounded-2xl border-2 transition cursor-pointer flex flex-col justify-between gap-2 ${
                  returnMode === 'FULL_RETURN'
                    ? 'border-rose-500 bg-rose-50/40 shadow-xs'
                    : 'border-zinc-200 bg-white hover:border-zinc-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center border ${
                      returnMode === 'FULL_RETURN' ? 'border-rose-600 bg-rose-600 text-white' : 'border-zinc-300'
                    }`}>
                      {returnMode === 'FULL_RETURN' && <Check className="w-3.5 h-3.5" />}
                    </span>
                    <strong className="text-xs font-black text-zinc-900">
                      1. إرجاع الفاتورة بالكامل (Full Return)
                    </strong>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-black">
                    تم إرجاعها بالكامل
                  </span>
                </div>
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  استرداد كامل كميات الأصناف المتبقية بالفاتورة، ووسم الفاتورة كـ <span className="font-bold text-rose-700">"تم إرجاعها بالكامل" (REFUNDED)</span> وصرف كامل المبلغ المدفوع.
                </p>
              </div>

              {/* Option B: Modify Invoice */}
              <div
                onClick={() => handleModeChange('MODIFY_INVOICE')}
                className={`p-4 rounded-2xl border-2 transition cursor-pointer flex flex-col justify-between gap-2 ${
                  returnMode === 'MODIFY_INVOICE'
                    ? 'border-purple-600 bg-purple-50/40 shadow-xs'
                    : 'border-zinc-200 bg-white hover:border-zinc-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center border ${
                      returnMode === 'MODIFY_INVOICE' ? 'border-purple-600 bg-purple-600 text-white' : 'border-zinc-300'
                    }`}>
                      {returnMode === 'MODIFY_INVOICE' && <Check className="w-3.5 h-3.5" />}
                    </span>
                    <strong className="text-xs font-black text-zinc-900">
                      2. تعديل الفاتورة وإصدار فاتورة جديدة (Modify & Reissue)
                    </strong>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 text-[10px] font-black">
                    فاتورة معدلة جديدة
                  </span>
                </div>
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  حذف أو تقليص المنتجات المحددة من الفاتورة، وإصدار <span className="font-bold text-purple-700">فاتورة جديدة معدلة</span> بالأصناف المتبقية مع توثيق <span className="font-bold text-zinc-700">وقت وتاريخ التعديل بملاحظة رسمية</span>.
                </p>
              </div>
            </div>
          </div>

          {/* Items Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start">
              <thead className="bg-zinc-100 text-zinc-700 font-black border-b border-zinc-200">
                <tr>
                  <th className="p-3.5 text-start">الصنف والمواصفة</th>
                  <th className="p-3.5 text-start">سعر الوحدة</th>
                  <th className="p-3.5 text-center">الكمية بالفاتورة</th>
                  <th className="p-3.5 text-center">المرتجع سابقاً</th>
                  <th className="p-3.5 text-center">المتبقي بالفاتورة</th>
                  <th className="p-3.5 text-start">
                    {returnMode === 'FULL_RETURN' ? 'الكمية المستردة بالكامل' : 'الكمية المراد حذفها من الفاتورة'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {sale.items.map((item) => (
                  <tr key={item.variantId} className="hover:bg-zinc-50/50 transition">
                    <td className="p-3.5">
                      <p className="font-extrabold text-zinc-900">{item.name}</p>
                      <p className="text-[11px] text-zinc-500 font-mono">
                        {item.shade ? `درجة: ${item.shade}` : item.size} ({item.sku})
                      </p>
                    </td>
                    <td className="p-3.5 font-mono font-bold text-zinc-800">
                      {(item.unitPrice / 1000).toFixed(3)} د.أ
                    </td>
                    <td className="p-3.5 font-mono text-center font-bold text-zinc-700">{item.originalQty}</td>
                    <td className="p-3.5 font-mono text-center text-zinc-400">{item.alreadyReturned}</td>
                    <td className="p-3.5 font-mono text-center font-black text-emerald-700">
                      {item.remainingQty}
                    </td>
                    <td className="p-3.5">
                      {item.remainingQty === 0 ? (
                        <span className="text-[10px] text-zinc-400 font-bold">تم إرجاع كامل الكمية مسبقاً</span>
                      ) : returnMode === 'FULL_RETURN' ? (
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-50 text-rose-800 rounded-lg font-mono font-black text-xs border border-rose-200">
                          <span>كامل الكمية: {item.remainingQty} قطعة</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="0"
                            max={item.remainingQty}
                            value={returnQtys[item.variantId] || 0}
                            onChange={(e) =>
                              handleQtyChange(item.variantId, parseInt(e.target.value) || 0, item.remainingQty)
                            }
                            className="w-16 border border-zinc-300 rounded-xl p-1.5 text-center font-mono font-black text-sm outline-none focus:border-purple-600 bg-white"
                          />
                          <button
                            type="button"
                            onClick={() => handleSetMaxQty(item.variantId, item.remainingQty)}
                            className="px-2 py-1 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-[10px] font-bold cursor-pointer transition"
                            title="حذف هذا الصنف بالكامل من الفاتورة"
                          >
                            حذف كامل الصنف
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Summary & Live Calculation Bar */}
          <div className="p-5 bg-zinc-50 border-t border-zinc-200 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3 bg-white rounded-xl border border-zinc-200">
                <span className="text-zinc-500 text-[11px] block">المبلغ المسترد للزبون:</span>
                <span className="font-mono font-black text-base text-rose-600">
                  -{(calculateTotalRefundFils() / 1000).toFixed(3)} د.أ
                </span>
              </div>

              <div className="p-3 bg-white rounded-xl border border-zinc-200">
                <span className="text-zinc-500 text-[11px] block">
                  {returnMode === 'FULL_RETURN' ? 'قيمة الفاتورة المتبقية:' : 'إجمالي الفاتورة الجديدة المعدلة:'}
                </span>
                <span className={`font-mono font-black text-base ${returnMode === 'FULL_RETURN' ? 'text-zinc-400' : 'text-emerald-700'}`}>
                  {(calculateNewInvoiceTotalFils() / 1000).toFixed(3)} د.أ
                </span>
              </div>

              <div className="p-3 bg-white rounded-xl border border-zinc-200">
                <span className="text-zinc-500 text-[11px] block">حالة الفاتورة بعد التنفيذ:</span>
                <span className="font-bold text-xs text-zinc-900 block mt-0.5">
                  {returnMode === 'FULL_RETURN'
                    ? 'تم إرجاعها بالكامل (REFUNDED)'
                    : 'إصدار فاتورة جديدة معدلة موثقة'}
                </span>
              </div>
            </div>

            {/* Note Preview for Modify Invoice */}
            {returnMode === 'MODIFY_INVOICE' && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
                <Clock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <div>
                  <strong>ملاحظة التوثيق الرسمية التي ستثبت على الفاتورة الجديدة:</strong>
                  <p className="text-[11px] text-amber-800 mt-0.5 font-medium">
                    "تم تعديل الفاتورة وحذف منتجات مرتجعة بتاريخ {getJordanNowFormatted()} بواسطة الكاشير | قيمة المرتجع المسترد: {(calculateTotalRefundFils() / 1000).toFixed(3)} د.أ | الإجمالي الجديد: {(calculateNewInvoiceTotalFils() / 1000).toFixed(3)} د.أ"
                  </p>
                </div>
              </div>
            )}

            {/* Refund Options & Confirmation */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-2 border-t border-zinc-200">
              <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
                <div>
                  <label className="block text-xs font-black text-zinc-700 mb-1">طريقة رد المبلغ:</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setRefundMethod('CASH')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                        refundMethod === 'CASH'
                          ? 'bg-zinc-900 text-white shadow-xs'
                          : 'bg-white border border-zinc-300 text-zinc-700'
                      }`}
                    >
                      نقداً (من الدرج)
                    </button>
                    <button
                      type="button"
                      onClick={() => setRefundMethod('CARD')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                        refundMethod === 'CARD'
                          ? 'bg-zinc-900 text-white shadow-xs'
                          : 'bg-white border border-zinc-300 text-zinc-700'
                      }`}
                    >
                      إلى البطاقة
                    </button>
                  </div>
                </div>

                <div className="flex-1 min-w-[220px]">
                  <label className="block text-xs font-black text-zinc-700 mb-1">سبب العملية:</label>
                  <input
                    type="text"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="w-full border border-zinc-300 rounded-xl p-2 text-xs text-zinc-900 bg-white outline-none focus:border-purple-600 font-medium"
                    placeholder="سبب الإرجاع أو التعديل..."
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 w-full md:w-auto justify-end">
                <button
                  type="button"
                  onClick={handleSubmitReturn}
                  disabled={isPending || calculateTotalRefundFils() === 0}
                  className={`px-6 py-3 rounded-xl text-xs font-black transition-colors disabled:opacity-40 flex items-center gap-2 shadow-sm cursor-pointer text-white ${
                    returnMode === 'FULL_RETURN'
                      ? 'bg-rose-600 hover:bg-rose-700'
                      : 'bg-purple-600 hover:bg-purple-700'
                  }`}
                >
                  {isPending ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : returnMode === 'FULL_RETURN' ? (
                    <RotateCcw className="w-4 h-4" />
                  ) : (
                    <FileEdit className="w-4 h-4" />
                  )}
                  <span>
                    {isPending
                      ? 'جاري التنفيذ...'
                      : returnMode === 'FULL_RETURN'
                      ? 'تأكيد إرجاع الفاتورة بالكامل ووسمها مستردة ↩️'
                      : 'اعتماد تعديل الفاتورة وإصدار الفاتورة الجديدة 📄✨'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* END OF VIEW 1 (NEW_RETURN) */}
      </div>
      )}

      {/* VIEW 2: RETURNED INVOICES LOG (سجل الفواتير المرتجعة) */}
      {activeViewTab === 'RETURNS_LOG' && (
        <div className="space-y-5 animate-fade-in">
          {/* KPI Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-white rounded-2xl p-4 border border-zinc-200 shadow-2xs">
              <span className="text-[11px] font-bold text-zinc-500">إجمالي المرتجعات المسجلة:</span>
              <div className="text-xl font-black text-zinc-900 mt-1 font-mono">{filteredReturnsLog.length} عملية</div>
            </div>
            <div className="bg-white rounded-2xl p-4 border border-zinc-200 shadow-2xs">
              <span className="text-[11px] font-bold text-zinc-500">إجمالي المبالغ المستردة:</span>
              <div className="text-xl font-black text-rose-600 mt-1 font-mono" dir="ltr">
                {(totalRefundAmountFils / 1000).toFixed(3)} د.أ
              </div>
            </div>
            <div className="bg-white rounded-2xl p-4 border border-zinc-200 shadow-2xs">
              <span className="text-[11px] font-bold text-zinc-500">فواتير مستردة بالكامل / معدلة:</span>
              <div className="text-sm font-black text-zinc-800 mt-2 flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-xs">
                  {filteredReturnsLog.filter((r) => r.returnMode === 'FULL_RETURN').length} بالكامل
                </span>
                <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 text-xs">
                  {filteredReturnsLog.filter((r) => r.returnMode === 'MODIFY_INVOICE').length} معدلة
                </span>
              </div>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="bg-white rounded-2xl p-4 border border-zinc-200 shadow-2xs flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="flex-1 w-full relative">
              <Search className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                value={returnsFilterSearch}
                onChange={(e) => setReturnsFilterSearch(e.target.value)}
                placeholder="ابحث برقم الفاتورة، المرجع، اسم الزبونة، أو سبب الإرجاع..."
                className="w-full ps-9 pe-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-bold text-zinc-900 focus:outline-none focus:border-[#E6007E]"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <select
                value={returnsFilterMode}
                onChange={(e) => setReturnsFilterMode(e.target.value as any)}
                className="px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-bold text-zinc-800 focus:outline-none focus:border-[#E6007E]"
              >
                <option value="ALL">جميع أنواع الإرجاع</option>
                <option value="FULL_RETURN">إرجاع بالكامل فقط</option>
                <option value="MODIFY_INVOICE">تعديل فاتورة وحذف أصناف</option>
              </select>

              <button
                type="button"
                onClick={fetchReturnsLog}
                disabled={returnsLogLoading}
                className="p-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl transition cursor-pointer"
                title="تحديث البيانات"
              >
                <RefreshCw className={`w-4 h-4 ${returnsLogLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Table of Returns */}
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-zinc-50 text-zinc-600 font-bold border-b border-zinc-200">
                  <tr>
                    <th className="p-3">رقم المرتجع / التاريخ</th>
                    <th className="p-3">رقم الفاتورة / المرجع</th>
                    <th className="p-3">اسم الزبونة</th>
                    <th className="p-3">نوع المعاملة</th>
                    <th className="p-3 text-left">المبلغ المسترد</th>
                    <th className="p-3">طريقة الرد</th>
                    <th className="p-3">السبب / الملاحظة</th>
                    <th className="p-3 text-center">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {filteredReturnsLog.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-zinc-400 font-bold">
                        لا توجد فواتير مرتجعة تطابق معايير البحث
                      </td>
                    </tr>
                  ) : (
                    filteredReturnsLog.map((ret, idx) => (
                      <tr key={ret.id || idx} className="hover:bg-zinc-50/80 transition">
                        <td className="p-3">
                          <div className="font-mono font-bold text-zinc-900">{ret.id || ret.returnId}</div>
                          <div className="text-[10px] text-zinc-400 font-mono mt-0.5" dir="ltr">
                            {formatJordanDateTime(ret.createdAt)}
                          </div>
                        </td>
                        <td className="p-3">
                          <span className="font-mono font-black text-[#E6007E]">
                            {ret.newInvoiceNumber || ret.invoiceNumber}
                          </span>
                          {ret.saleReference && (
                            <div className="text-[10px] text-zinc-400 font-mono">{ret.saleReference}</div>
                          )}
                        </td>
                        <td className="p-3 font-bold text-zinc-800">
                          {ret.customerName || 'عميل نقدي'}
                        </td>
                        <td className="p-3">
                          {ret.returnMode === 'FULL_RETURN' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 text-[11px] font-black border border-rose-200">
                              <RotateCcw className="w-3 h-3" />
                              <span>إرجاع بالكامل</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-purple-100 text-purple-800 text-[11px] font-black border border-purple-200">
                              <FileEdit className="w-3 h-3" />
                              <span>تعديل فاتورة</span>
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-left">
                          <span className="font-mono font-black text-rose-600 text-sm">
                            -{(ret.totalRefundFils / 1000).toFixed(3)} د.أ
                          </span>
                        </td>
                        <td className="p-3">
                          <span className="text-[11px] font-bold text-zinc-600">
                            {ret.refundMethod === 'CASH' ? 'نقداً 💵' : 'بطاقة 💳'}
                          </span>
                        </td>
                        <td className="p-3 max-w-[200px]">
                          <span className="text-[11px] text-zinc-600 line-clamp-2" title={ret.reason}>
                            {ret.reason || 'مرتجع كاشير'}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <button
                            type="button"
                            onClick={() => setSelectedReturnForPreview(ret)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded-xl text-xs font-bold transition cursor-pointer"
                          >
                            <Printer className="w-3.5 h-3.5 text-zinc-600" />
                            <span>معاينة الإيصال</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* HISTORICAL RETURN RECEIPT PREVIEW MODAL */}
      {selectedReturnForPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto" dir="rtl">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col border border-zinc-200 animate-fade-in my-8">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <span className="font-extrabold text-sm flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-[#E6007E]" />
                <span>إيصال مرتجع مسجل</span>
              </span>
              <button onClick={() => setSelectedReturnForPreview(null)} className="p-1 text-white/80 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 bg-slate-100 flex justify-center">
              <div className="w-full max-w-[340px] bg-white border border-slate-300 p-5 rounded-2xl shadow-md font-mono text-[11px] text-slate-900 space-y-2 select-text">
                <div className="text-center space-y-1">
                  <img src="/logo.png" alt="GHAZAL" className="h-10 mx-auto object-contain mb-1" />
                  <h2 className="font-black text-sm tracking-wider">محل غزل للمكياج والتجميل</h2>
                  <p className="text-[10px] text-slate-600 font-bold">عمان - لواء عين الباشا (السوق التجاري)</p>
                  <p className="text-[10px] text-slate-600 font-bold">هاتف: +962776299243</p>
                </div>

                <div className="border-t border-b border-dashed border-slate-400 py-2 space-y-1 text-[10px]">
                  <div className="flex justify-between">
                    <span>رقم المرتجع:</span>
                    <span className="font-bold text-slate-900">{selectedReturnForPreview.id || selectedReturnForPreview.returnId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>رقم الفاتورة:</span>
                    <span className="font-bold text-slate-900">{selectedReturnForPreview.newInvoiceNumber || selectedReturnForPreview.invoiceNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>الزبونة:</span>
                    <span className="font-bold">{selectedReturnForPreview.customerName || 'عميل نقدي'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>تاريخ المعاملة:</span>
                    <span dir="ltr">{formatJordanDateTime(selectedReturnForPreview.createdAt)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>نوع المعاملة:</span>
                    <span className={`font-black ${selectedReturnForPreview.returnMode === 'FULL_RETURN' ? 'text-rose-700' : 'text-purple-700'}`}>
                      {selectedReturnForPreview.returnMode === 'FULL_RETURN' ? 'إرجاع الفاتورة بالكامل ↩' : 'فاتورة معدلة رسمية 📄'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>طريقة الرد:</span>
                    <span className="font-bold">{selectedReturnForPreview.refundMethod === 'CASH' ? 'نقداً من الصندوق' : 'إلى البطاقة'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>الكاشير المسؤول:</span>
                    <span className="font-bold">{selectedReturnForPreview.cashierName || 'كاشير غزل'}</span>
                  </div>
                </div>

                {selectedReturnForPreview.items && selectedReturnForPreview.items.length > 0 && (
                  <div className="py-2">
                    <div className="font-bold text-[10px] text-slate-500 mb-1">الأصناف المرتجعة:</div>
                    <table className="w-full text-right text-[10px]">
                      <thead>
                        <tr className="border-b border-slate-300 font-bold">
                          <th className="py-1">الصنف</th>
                          <th className="py-1 text-center">الكمية</th>
                          <th className="py-1 text-left">المبلغ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {selectedReturnForPreview.items.map((it: any, i: number) => (
                          <tr key={i}>
                            <td className="py-1 font-bold">{it.name}</td>
                            <td className="py-1 text-center font-bold text-rose-700">-{it.quantity}</td>
                            <td className="py-1 text-left font-mono">{(it.amount / 1000).toFixed(3)} د.أ</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="border-t-2 border-dashed border-slate-400 pt-2 space-y-1 text-xs">
                  <div className="flex justify-between text-rose-700 font-bold">
                    <span>إجمالي المبلغ المسترد:</span>
                    <span className="font-black font-mono">-{(selectedReturnForPreview.totalRefundFils / 1000).toFixed(3)} د.أ</span>
                  </div>
                  {selectedReturnForPreview.returnMode === 'MODIFY_INVOICE' && selectedReturnForPreview.newTotalFils !== undefined && (
                    <div className="flex justify-between text-emerald-800 font-black text-sm pt-1 border-t border-slate-200">
                      <span>صافي الفاتورة المعدلة:</span>
                      <span className="font-mono">{(selectedReturnForPreview.newTotalFils / 1000).toFixed(3)} د.أ</span>
                    </div>
                  )}
                </div>

                <div className="mt-3 p-2 bg-slate-50 border border-slate-200 rounded-xl text-[9px] text-slate-600 text-center font-medium leading-relaxed">
                  {selectedReturnForPreview.reason || 'إرجاع معتمد في نظام غزل'}
                </div>

                <div className="text-center text-[9px] text-slate-500 pt-2">
                  شكراً لتعاملكم مع محل غزل — مستحضرات تجميل ومكياج وعطور
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 py-2.5 bg-[#E6007E] hover:bg-[#c4006b] text-white rounded-xl font-black text-xs flex items-center justify-center gap-1.5 shadow-sm transition cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>طباعة الإيصال 🖨️</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedReturnForPreview(null)}
                className="py-2.5 px-4 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl font-bold text-xs transition cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* THERMAL RECEIPT / MODIFIED INVOICE PREVIEW MODAL */}
      {previewReceiptOpen && successResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto" dir="rtl">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col border border-zinc-200 animate-fade-in my-8">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <span className="font-extrabold text-sm flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-[#E6007E]" />
                <span>
                  {successResult.returnMode === 'FULL_RETURN'
                    ? 'إيصال استرداد الفاتورة بالكامل'
                    : 'معاينة الفاتورة المعدلة الجديدة'}
                </span>
              </span>
              <button onClick={() => setPreviewReceiptOpen(false)} className="p-1 text-white/80 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 bg-slate-100 flex justify-center">
              <div className="w-full max-w-[340px] bg-white border border-slate-300 p-5 rounded-2xl shadow-md font-mono text-[11px] text-slate-900 space-y-2 select-text">
                <div className="text-center space-y-1">
                  <img src="/logo.png" alt="GHAZAL" className="h-10 mx-auto object-contain mb-1" />
                  <h2 className="font-black text-sm tracking-wider">محل غزل للمكياج والتجميل</h2>
                  <p className="text-[10px] text-slate-600 font-bold">عمان - لواء عين الباشا (السوق التجاري)</p>
                  <p className="text-[10px] text-slate-600 font-bold">هاتف: +962776299243</p>
                </div>

                <div className="border-t border-b border-dashed border-slate-400 py-2 space-y-1 text-[10px]">
                  <div className="flex justify-between">
                    <span>رقم الفاتورة:</span>
                    <span className="font-bold text-slate-900">
                      {successResult.newInvoiceNumber || successResult.returnId}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>تاريخ ووقت المعاملة:</span>
                    <span dir="ltr">{getJordanNowFormatted()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>نوع المعاملة:</span>
                    <span className={`font-black ${successResult.returnMode === 'FULL_RETURN' ? 'text-rose-700' : 'text-purple-700'}`}>
                      {successResult.returnMode === 'FULL_RETURN' ? 'تم إرجاع الفاتورة بالكامل ↩' : 'فاتورة معدلة رسمية 📄'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>طريقة الرد:</span>
                    <span className="font-bold">{successResult.refundMethod === 'CASH' ? 'نقداً من الدرج' : 'إلى البطاقة'}</span>
                  </div>
                </div>

                {/* Returned items */}
                <div className="py-2">
                  <div className="font-bold text-[10px] text-slate-700 mb-1">الأصناف المرتجعة والمحذوفة:</div>
                  <table className="w-full text-right text-[10px]">
                    <thead>
                      <tr className="border-b border-slate-300 font-bold">
                        <th className="py-1">الصنف</th>
                        <th className="py-1 text-center">الكمية</th>
                        <th className="py-1 text-left">المبلغ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {successResult.returnedItems.map((it: any, i: number) => (
                        <tr key={i}>
                          <td className="py-1 font-bold">{it.name}</td>
                          <td className="py-1 text-center font-bold text-rose-700">-{it.quantity}</td>
                          <td className="py-1 text-left font-mono">{(it.amount / 1000).toFixed(3)} د.أ</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="border-t-2 border-dashed border-slate-400 pt-2 space-y-1 text-xs">
                  <div className="flex justify-between text-rose-700 font-bold">
                    <span>إجمالي المبلغ المسترد:</span>
                    <span className="font-black font-mono">-{(successResult.totalRefundFils / 1000).toFixed(3)} د.أ</span>
                  </div>
                  {successResult.returnMode === 'MODIFY_INVOICE' && (
                    <div className="flex justify-between text-emerald-800 font-black text-sm pt-1 border-t border-slate-200">
                      <span>صافي الفاتورة المعدلة:</span>
                      <span className="font-mono">{(successResult.newTotalFils / 1000).toFixed(3)} د.أ</span>
                    </div>
                  )}
                </div>

                {/* Audit Timestamp Note */}
                <div className="mt-3 p-2 bg-slate-50 border border-slate-200 rounded-xl text-[9px] text-slate-600 text-center font-medium leading-relaxed">
                  {successResult.modificationNote || `تم إرجاع الفاتورة بالكامل بتاريخ ${getJordanNowFormatted()}`}
                </div>

                <div className="text-center text-[9px] text-slate-500 pt-2">
                  شكراً لتعاملكم مع محل غزل — مستحضرات تجميل ومكياج وعطور
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 py-2.5 bg-[#E6007E] hover:bg-[#c4006b] text-white rounded-xl font-black text-xs flex items-center justify-center gap-1.5 shadow-sm transition cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>طباعة الإيصال 🖨️</span>
              </button>
              <button
                type="button"
                onClick={() => setPreviewReceiptOpen(false)}
                className="py-2.5 px-4 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl font-bold text-xs transition cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
