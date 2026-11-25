'use client';

import React, { useState, useMemo, useRef } from 'react';
import { 
  ShoppingBag, Search, Calendar, Clock, Users, CreditCard, Banknote, 
  Printer, ArrowUpRight, RotateCcw, Eye, FileText, CheckCircle2, X, Download, ShieldCheck
} from 'lucide-react';
import { getSaleDetailsForReceipt } from '@/actions/pos';

interface Props {
  initialSales: any[];
  employees: { id: string; name: string }[];
}

export default function AdminPOSSalesClient({ initialSales, employees }: Props) {
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [selectedMethod, setSelectedMethod] = useState('');

  // Receipt Modal State
  const [selectedReceipt, setSelectedReceipt] = useState<any | null>(null);
  const [isOfficialPdfModalOpen, setIsOfficialPdfModalOpen] = useState(false);

  // Live Auto-Filter: runs immediately whenever any filter input changes without needing a button click
  const filteredSales = useMemo(() => {
    return initialSales.filter((sale) => {
      const saleDate = new Date(sale.createdAt || Date.now());

      // 1. Date filter (from - to)
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

      // 2. Time filter (from hour - to hour)
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

      // 3. Employee filter
      if (selectedEmployee && sale.employeeId !== selectedEmployee && sale.cashierName !== selectedEmployee) {
        return false;
      }

      // 4. Payment method filter
      if (selectedMethod && sale.paymentMethod !== selectedMethod) {
        return false;
      }

      // 5. Search query
      if (search.trim()) {
        const q = search.toLowerCase();
        const ref = (sale.invoiceNumber || sale.reference || '').toLowerCase();
        const customer = (sale.customerName || sale.customerPhone || '').toLowerCase();
        const cashier = (sale.cashierName || '').toLowerCase();
        if (!ref.includes(q) && !customer.includes(q) && !cashier.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [initialSales, startDate, endDate, startTime, endTime, selectedEmployee, selectedMethod, search]);

  const handleViewReceipt = async (reference: string) => {
    try {
      const res = await getSaleDetailsForReceipt(reference);
      if (res.success && res.sale) {
        setSelectedReceipt(res.sale);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Calculations for filtered sales
  const totalSalesFils = filteredSales.reduce((acc, s) => acc + (s.total || 0), 0);
  const totalCashFils = filteredSales
    .filter(s => s.paymentMethod === 'CASH')
    .reduce((acc, s) => acc + (s.total || 0), 0);
  const totalCardFils = filteredSales
    .filter(s => s.paymentMethod === 'CARD')
    .reduce((acc, s) => acc + (s.total || 0), 0);
  const totalCreditFils = filteredSales
    .filter(s => s.paymentMethod === 'CREDIT')
    .reduce((acc, s) => acc + (s.total || 0), 0);

  const activeEmployeeName = employees.find(e => e.id === selectedEmployee)?.name;

  // English format for dates and times (digits 0-9)
  const formatJordanDateTimeEnglish = (d?: string | Date | number) => {
    if (!d) return '—';
    try {
      const dateObj = typeof d === 'string' || typeof d === 'number' ? new Date(d) : d;
      return new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Amman',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      }).format(dateObj);
    } catch {
      return String(d);
    }
  };

  // Print Official PDF Report (Without browser header/footer)
  const handlePrintOfficialReport = () => {
    const originalTitle = document.title;
    document.title = '';
    window.print();
    setTimeout(() => {
      document.title = originalTitle;
    }, 1000);
  };

  return (
    <div className="p-6 space-y-6 font-sans text-zinc-900" dir="rtl">
      
      {/* Page Header (Screen Only) */}
      <div className="print:hidden flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-zinc-200">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-2 rounded-xl bg-pink-100 text-[#E6007E]">
              <ShoppingBag className="w-5 h-5" />
            </span>
            <h1 className="text-2xl font-black text-zinc-900 font-heading">
              مبيعات الكاشير وفواتير نقطة البيع (POS Sales)
            </h1>
          </div>
          <p className="text-xs text-zinc-500">
            سجل مبيعات كاشير محل غزل — فلترة حية تلقائية حسب الوقت والتاريخ مع تصدير التقارير الرسمية
          </p>
        </div>

        {/* Official PDF Export Button */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrintOfficialReport}
            className="px-4 py-2.5 bg-[#E6007E] hover:bg-[#c4006b] text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-sm cursor-pointer"
          >
            <FileText className="w-4 h-4" />
            <span>تصدير تقرير رسمي PDF</span>
          </button>
        </div>
      </div>

      {/* -------------------------------------------------------------
          OFFICIAL PRINT / PDF TEMPLATE (Printed on A4 via window.print)
      ------------------------------------------------------------- */}
      <div className="hidden print:block text-zinc-900 font-sans mb-8">
        {/* Official Report Header */}
        <div className="border-b-2 border-zinc-900 pb-5 mb-5 flex items-center justify-between">
          <div className="space-y-1">
            <h2 className="text-xl font-black tracking-wide text-zinc-900">
              محل غزل للمكياج والتجميل والعناية — GHAZAL
            </h2>
            <p className="text-xs text-zinc-600 font-bold">
              المملكة الأردنية الهاشمية — عين الباشا (شارع القدس)
            </p>
            <p className="text-[11px] text-zinc-500">
              هاتف / واتساب: +962776299243 • السجل التجاري والمالي الرسمي
            </p>
          </div>

          <div className="flex flex-col items-center">
            <div className="w-20 h-20 p-1 border border-zinc-300 rounded-xl bg-white flex items-center justify-center">
              <img src="/logo.png" alt="شعار غزل" className="max-w-full max-h-full object-contain" />
            </div>
            <span className="text-[10px] font-bold text-zinc-500 mt-1">وثيقة رسمية معتمدة</span>
          </div>
        </div>

        {/* Report Meta Info Banner */}
        <div className="bg-zinc-100 p-3.5 rounded-xl border border-zinc-300 mb-6 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <span className="text-zinc-500 block text-[10px] font-bold">نوع التقرير:</span>
            <span className="font-black text-zinc-900">تقرير مبيعات الكاشير والتحصيل</span>
          </div>
          <div>
            <span className="text-zinc-500 block text-[10px] font-bold">تاريخ وتوقيت الإصدار:</span>
            <span className="font-bold text-zinc-900 font-mono" dir="ltr">{formatJordanDateTimeEnglish(new Date())}</span>
          </div>
          <div>
            <span className="text-zinc-500 block text-[10px] font-bold">الفترة المحددة:</span>
            <span className="font-bold text-zinc-900 font-mono" dir="ltr">
              من {startDate || 'بداية السجل'} {startTime ? `(${startTime})` : ''} إلى {endDate || 'اليوم'} {endTime ? `(${endTime})` : ''}
            </span>
          </div>
          <div>
            <span className="text-zinc-500 block text-[10px] font-bold">الكاشير / الموظف:</span>
            <span className="font-bold text-zinc-900">{activeEmployeeName || 'كافة الكاشيرات'}</span>
          </div>
        </div>

        {/* Financial KPI Summary Table for Print */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          <div className="p-3 border-2 border-zinc-900 rounded-xl text-center bg-zinc-50">
            <span className="text-[11px] font-bold text-zinc-600 block">إجمالي المبيعات</span>
            <span className="text-lg font-black text-zinc-900 font-mono" dir="ltr">{(totalSalesFils / 1000).toFixed(3)} د.أ</span>
          </div>
          <div className="p-3 border border-zinc-300 rounded-xl text-center">
            <span className="text-[11px] font-bold text-zinc-600 block">مقبوضات كاش</span>
            <span className="text-base font-black text-zinc-900 font-mono" dir="ltr">{(totalCashFils / 1000).toFixed(3)} د.أ</span>
          </div>
          <div className="p-3 border border-zinc-300 rounded-xl text-center">
            <span className="text-[11px] font-bold text-zinc-600 block">مقبوضات بطاقة (فيزا)</span>
            <span className="text-base font-black text-zinc-900 font-mono" dir="ltr">{(totalCardFils / 1000).toFixed(3)} د.أ</span>
          </div>
          <div className="p-3 border border-zinc-300 rounded-xl text-center">
            <span className="text-[11px] font-bold text-zinc-600 block">عدد العمليات</span>
            <span className="text-base font-black text-zinc-900 font-mono">{filteredSales.length} فاتورة</span>
          </div>
        </div>
      </div>

      {/* KPI Stat Cards (Screen View) */}
      <div className="print:hidden grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-xs">
          <p className="text-xs font-bold text-zinc-500 mb-1">إجمالي المبيعات المعروضة</p>
          <p className="text-2xl font-black text-[#E6007E]" dir="ltr">
            {(totalSalesFils / 1000).toFixed(3)} <span className="text-xs font-bold text-zinc-600">د.أ</span>
          </p>
          <p className="text-[11px] text-zinc-400 mt-2">مجموع {filteredSales.length} عملية بيع (تطبيق فوري)</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-xs">
          <p className="text-xs font-bold text-zinc-500 mb-1">المبيعات النقدية (كاش)</p>
          <p className="text-2xl font-black text-emerald-600" dir="ltr">
            {(totalCashFils / 1000).toFixed(3)} <span className="text-xs font-bold text-zinc-600">د.أ</span>
          </p>
          <p className="text-[11px] text-zinc-400 mt-2">داخل درج الكاشير</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-xs">
          <p className="text-xs font-bold text-zinc-500 mb-1">المبيعات بالبطاقة (فيزا)</p>
          <p className="text-2xl font-black text-blue-600" dir="ltr">
            {(totalCardFils / 1000).toFixed(3)} <span className="text-xs font-bold text-zinc-600">د.أ</span>
          </p>
          <p className="text-[11px] text-zinc-400 mt-2">عبر جهاز الدفع الإلكتروني</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-xs">
          <p className="text-xs font-bold text-zinc-500 mb-1">البيع الآجل والذمم</p>
          <p className="text-2xl font-black text-amber-600" dir="ltr">
            {(totalCreditFils / 1000).toFixed(3)} <span className="text-xs font-bold text-zinc-600">د.أ</span>
          </p>
          <p className="text-[11px] text-zinc-400 mt-2">مستحقات قيد التحصيل</p>
        </div>
      </div>

      {/* -------------------------------------------------------------
          ADVANCED FILTER RIBBON (Auto-Apply: No Submit Button Required)
      ------------------------------------------------------------- */}
      <div className="print:hidden bg-white p-4 rounded-2xl border border-zinc-200 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-black text-zinc-800 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            فلاتر الوقت والتاريخ والكاشير (تطبيق فوري تلقائي)
          </span>
          {(search || startDate || endDate || startTime || endTime || selectedEmployee || selectedMethod) && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setStartDate('');
                setEndDate('');
                setStartTime('');
                setEndTime('');
                setSelectedEmployee('');
                setSelectedMethod('');
              }}
              className="text-xs font-bold text-red-600 hover:text-red-700 flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>إعادة ضبط الفلاتر</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* 1. Date Range: From Date - To Date */}
          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-zinc-600">من تاريخ:</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-bold text-zinc-700 focus:outline-none focus:border-[#E6007E]"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-zinc-600">إلى تاريخ:</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-bold text-zinc-700 focus:outline-none focus:border-[#E6007E]"
            />
          </div>

          {/* 2. Time Range: From Hour - To Hour */}
          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-zinc-600 flex items-center gap-1">
              <Clock className="w-3 h-3 text-[#E6007E]" />
              من الساعة:
            </label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-bold text-zinc-700 focus:outline-none focus:border-[#E6007E]"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-zinc-600 flex items-center gap-1">
              <Clock className="w-3 h-3 text-[#E6007E]" />
              إلى الساعة:
            </label>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-bold text-zinc-700 focus:outline-none focus:border-[#E6007E]"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 border-t border-zinc-100">
          {/* Search by reference or customer */}
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-400 absolute start-3 top-3" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث برقم الفاتورة، المرجع، أو العميل..."
              className="w-full ps-9 pe-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-bold focus:outline-none focus:border-[#E6007E]"
            />
          </div>

          {/* Employee Filter */}
          <select
            value={selectedEmployee}
            onChange={(e) => setSelectedEmployee(e.target.value)}
            className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-bold text-zinc-700 focus:outline-none focus:border-[#E6007E]"
          >
            <option value="">جميع الكاشيرات</option>
            {employees.map(e => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>

          {/* Payment Method Filter */}
          <select
            value={selectedMethod}
            onChange={(e) => setSelectedMethod(e.target.value)}
            className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-bold text-zinc-700 focus:outline-none focus:border-[#E6007E]"
          >
            <option value="">كافة طرق الدفع</option>
            <option value="CASH">نقدي (كاش)</option>
            <option value="CARD">بطاقة / فيزا</option>
            <option value="CREDIT">آجل / ذمة</option>
          </select>
        </div>
      </div>

      {/* -------------------------------------------------------------
          SALES TABLE (Formatted for Screen & Official Print)
      ------------------------------------------------------------- */}
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-start">
            <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-600 font-bold">
              <tr>
                <th className="p-3 text-start">#</th>
                <th className="p-3 text-start">رقم الفاتورة / المرجع</th>
                <th className="p-3 text-start">الوقت والتاريخ</th>
                <th className="p-3 text-start">الموظف / الكاشير</th>
                <th className="p-3 text-start">العميل</th>
                <th className="p-3 text-start">طريقة الدفع</th>
                <th className="p-3 text-start">الإجمالي</th>
                <th className="p-3 text-center print:hidden">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 font-medium">
              {filteredSales.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-zinc-400">
                    لا توجد فواتير مبيعات مطابقة لمعايير البحث والتاريخ والساعة المحددة
                  </td>
                </tr>
              ) : (
                filteredSales.map((sale, idx) => (
                  <tr key={sale.id || sale.reference || idx} className="hover:bg-zinc-50 transition">
                    <td className="p-3 text-zinc-400 font-mono">{idx + 1}</td>
                    <td className="p-3 font-mono font-bold text-zinc-900">
                      {sale.invoiceNumber || sale.reference}
                    </td>
                    <td className="p-3 text-zinc-500 font-mono" dir="ltr">
                      {formatJordanDateTimeEnglish(sale.createdAt)}
                    </td>
                    <td className="p-3 font-bold text-zinc-800">
                      {sale.cashierName || 'كاشير غزل'}
                    </td>
                    <td className="p-3 text-zinc-600">
                      {sale.customerName || 'عميل نقدي'}
                    </td>
                    <td className="p-3">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold ${
                        sale.paymentMethod === 'CARD'
                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                          : sale.paymentMethod === 'CREDIT'
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      }`}>
                        {sale.paymentMethod === 'CARD' ? 'بطاقة / فيزا' : sale.paymentMethod === 'CREDIT' ? 'آجل / ذمة' : 'نقداً'}
                      </span>
                    </td>
                    <td className="p-3 font-black text-[#E6007E]" dir="ltr">
                      {((sale.total || 0) / 1000).toFixed(3)} د.أ
                    </td>
                    <td className="p-3 text-center print:hidden">
                      <button
                        type="button"
                        onClick={() => handleViewReceipt(sale.reference)}
                        className="p-1.5 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition cursor-pointer"
                        title="معاينة وطباعة الفاتورة"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {filteredSales.length > 0 && (
              <tfoot className="bg-zinc-100 font-black border-t-2 border-zinc-300">
                <tr>
                  <td colSpan={6} className="p-3 text-start text-zinc-800">المجموع النهائي للفواتير المعروضة:</td>
                  <td className="p-3 text-[#E6007E] text-sm font-mono" dir="ltr">
                    {(totalSalesFils / 1000).toFixed(3)} د.أ
                  </td>
                  <td className="p-3 print:hidden"></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Print Stylesheet (Hides browser header/footer via margin: 0) */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page {
            size: A4 portrait;
            margin: 0;
          }
          body {
            background: white !important;
            color: black !important;
            padding: 12mm 15mm !important;
            margin: 0 !important;
          }
          header, nav, aside {
            display: none !important;
          }
        }
      `}} />

      {/* Receipt Modal */}
      {selectedReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col border border-zinc-200">
            <div className="p-4 bg-zinc-900 text-white flex items-center justify-between">
              <span className="font-extrabold text-sm">تفاصيل الفاتورة والإيصال</span>
              <button onClick={() => setSelectedReceipt(null)} className="p-1 text-zinc-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto text-xs">
              <div className="text-center pb-3 border-b border-zinc-200">
                <h3 className="font-black text-base text-[#E6007E]">GHAZAL COSMETICS</h3>
                <p className="text-[11px] text-zinc-500">غزل للمكياج والتجميل • عين الباشا</p>
                <p className="font-mono text-xs text-zinc-700 font-bold mt-1">
                  رقم: {selectedReceipt.invoiceNumber || selectedReceipt.reference}
                </p>
              </div>

              <div className="space-y-1 text-zinc-600">
                <div className="flex justify-between">
                  <span>الكاشير:</span>
                  <span className="font-bold text-zinc-800">{selectedReceipt.cashierName || 'كاشير غزل'}</span>
                </div>
                <div className="flex justify-between">
                  <span>العميل:</span>
                  <span className="font-bold text-zinc-800">{selectedReceipt.customerName || 'عميل نقدي'}</span>
                </div>
                <div className="flex justify-between">
                  <span>طريقة الدفع:</span>
                  <span className="font-bold text-zinc-800">{selectedReceipt.paymentMethod === 'CARD' ? 'بطاقة' : selectedReceipt.paymentMethod === 'CREDIT' ? 'آجل' : 'نقدي'}</span>
                </div>
                {selectedReceipt.createdAt && (
                  <div className="flex justify-between">
                    <span>التاريخ والوقت:</span>
                    <span className="font-mono text-zinc-800 font-bold" dir="ltr">{formatJordanDateTimeEnglish(selectedReceipt.createdAt)}</span>
                  </div>
                )}
              </div>

              <div className="border-t border-b border-zinc-200 py-2 space-y-1">
                {(selectedReceipt.items || []).map((item: any, idx: number) => (
                  <div key={idx} className="flex justify-between">
                    <span>{item.name} × {item.quantity}</span>
                    <span className="font-bold" dir="ltr">{((item.total || 0) / 1000).toFixed(3)} د.أ</span>
                  </div>
                ))}
              </div>

              <div className="flex justify-between text-sm font-black pt-1">
                <span>الإجمالي النهائي:</span>
                <span className="text-[#E6007E]" dir="ltr">{((selectedReceipt.total || 0) / 1000).toFixed(3)} د.أ</span>
              </div>
            </div>

            <div className="p-4 bg-zinc-50 border-t border-zinc-200 flex gap-2">
              <button
                onClick={() => window.print()}
                className="flex-1 py-2.5 bg-[#E6007E] hover:bg-[#c4006b] text-white rounded-xl font-bold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>طباعة الإيصال</span>
              </button>
              <button
                onClick={() => setSelectedReceipt(null)}
                className="py-2.5 px-4 bg-zinc-200 hover:bg-zinc-300 text-zinc-700 rounded-xl font-bold cursor-pointer"
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
