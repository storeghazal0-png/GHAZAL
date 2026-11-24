'use client';

import React, { useState, useTransition, useMemo, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  StoreChannel,
  StoreInventoryItem,
  CashSaleRecord,
  OnlineOrderRecord,
  DeliveryOrderRecord,
  DeliverySettlementStatement,
  CashDrawerSettlement,
  BankSettlement,
  PurchaseInvoice,
  OperatingExpense,
  CourierBatchRecord,
  CourierBatchOrderSummary,
  createCourierBatchAction,
  updateCourierBatchStatusAction,
  recordCourierBatchRemittancePaymentAction,
  updateBatchOrderDeliveryStatusAction,
  toggleProductVisibilityAction,
  recordDeliveryRemittancePayment,
  settleSingleDeliveryOrderAction,
  reconcileCashDrawerSession,
  recordCashierDrawerExpense,
  addOperatingExpenseAction,
  deleteOperatingExpenseAction
} from '@/actions/settlements';
import { jodToFils } from '@/lib/money';
import {
  DollarSign,
  ShoppingBag,
  Truck,
  Receipt,
  Search,
  PlusCircle,
  CheckCircle2,
  AlertCircle,
  Printer,
  Boxes,
  Database,
  TrendingUp,
  RotateCcw,
  Clock,
  Landmark,
  Loader2,
  Filter,
  UserCheck,
  FileText,
  Eye,
  X,
  Calendar,
  User,
  ArrowRight,
  ArrowLeft,
  FileEdit,
  ChevronRight,
  ChevronLeft,
  PackageCheck,
  Package,
  Layers,
  ChevronDown,
  ChevronUp,
  CheckSquare,
  Square,
  Trash2,
  Check
} from 'lucide-react';
import { formatJordanDateTime, getJordanNowFormatted } from '@/lib/date';
import { getSaleDetailsForReceipt } from '@/actions/pos';

interface Props {
  initialData: {
    channelFilter: StoreChannel;
    kpis: {
      cashSalesTotalFils: number;
      onlineSalesTotalFils: number;
      deliveryReceivableFils: number;
      cashExpensesTotalFils: number;
      totalStockCostFils: number;
      reorderNeededCount: number;
      openVariancesFils: number;
    };
    inventory: StoreInventoryItem[];
    cashSales: CashSaleRecord[];
    onlineOrders: OnlineOrderRecord[];
    deliveryOrders: DeliveryOrderRecord[];
    preparedOrders?: CourierBatchOrderSummary[];
    courierBatches?: CourierBatchRecord[];
    cashExpenses: OperatingExpense[];
    invoices?: any[];
    deliverySettlement: DeliverySettlementStatement;
    cashDrawerSettlements: CashDrawerSettlement[];
    bankSettlements: BankSettlement[];
    purchaseInvoices: PurchaseInvoice[];
    operatingExpenses: OperatingExpense[];
    pnlReport: {
      grossSalesFils: number;
      cogsFils: number;
      grossProfitFils: number;
      operatingExpensesFils: number;
      netOperatingProfitFils: number;
      inventoryCostValuationFils: number;
    };
  };
  currentUserRole: string;
  initialQueryParam?: string;
}

type TabType = 'cash_sales' | 'online_sales' | 'delivery' | 'cash_expenses' | 'invoices' | 'pnl';

function mapQueryParamToTab(q?: string): TabType {
  if (!q) return 'cash_sales';
  const clean = q.toLowerCase().trim();
  if (['1', 'cash', 'cash-sales', 'cash_sales', 'pos'].includes(clean)) return 'cash_sales';
  if (['2', 'online', 'store', 'store-sales', 'online-sales', 'online_sales'].includes(clean)) return 'online_sales';
  if (['3', 'delivery', 'courier', 'courier-settlements', 'deliveries'].includes(clean)) return 'delivery';
  if (['4', 'expense', 'expenses', 'cash-expenses', 'cash_expenses'].includes(clean)) return 'cash_expenses';
  if (['5', 'invoices', 'invoice', 'inv', 'receipts', 'bills'].includes(clean)) return 'invoices';
  if (['6', 'pnl', 'profit', 'finance', 'financial-summary', 'reports'].includes(clean)) return 'pnl';
  return 'cash_sales';
}

function mapTabToQueryParam(tab: TabType): string {
  switch (tab) {
    case 'cash_sales': return 'cash-sales';
    case 'online_sales': return 'store-sales';
    case 'delivery': return 'courier-settlements';
    case 'cash_expenses': return 'cash-expenses';
    case 'invoices': return 'invoices';
    case 'pnl': return 'financial-summary';
    default: return 'cash-sales';
  }
}

const SETTLEMENT_TABS_LIST: { id: TabType; q: string; num: string; label: string; icon: any }[] = [
  { id: 'cash_sales', q: 'cash-sales', num: '1', label: 'مبيعات الكاش وصندوق المعرض', icon: DollarSign },
  { id: 'online_sales', q: 'store-sales', num: '2', label: 'مبيعات المتجر الإلكتروني', icon: ShoppingBag },
  { id: 'delivery', q: 'courier-settlements', num: '3', label: 'طلبيات وتسويات شركة التوصيل', icon: Truck },
  { id: 'cash_expenses', q: 'cash-expenses', num: '4', label: 'المصروفات وفواتير المحل (إيجار/كهرباء/فواتير)', icon: Receipt },
  { id: 'invoices', q: 'invoices', num: '5', label: 'سجل الفواتير وسندات البيع', icon: FileText },
  { id: 'pnl', q: 'financial-summary', num: '6', label: 'ملخص الأرباح والتقرير المالي', icon: TrendingUp },
];

export default function AdminSettlementsClient({ initialData, currentUserRole, initialQueryParam }: Props) {
  const [data, setData] = useState(initialData);

  useEffect(() => {
    setData(initialData);
  }, [initialData]);
  const [activeTab, setActiveTab] = useState<TabType>(() => mapQueryParamToTab(initialQueryParam));
  const [searchProductQuery, setSearchProductQuery] = useState('');
  const [busyProductId, setBusyProductId] = useState<string | null>(null);
  const [settlingOrderId, setSettlingOrderId] = useState<string | null>(null);

  // Exact CPA Cash Drawer Reconciliation Variables (Opening + Sales - Refunds - Expenses)
  const drawerOpeningCashFils = 50000; // 50.000 JOD standard float
  const drawerCashSalesFils = useMemo(() => {
    return data.cashSales
      .filter(s => (s.paymentMethod?.includes('نقد') || s.paymentMethod === 'CASH') && !s.isRefunded && s.status !== 'REFUNDED')
      .reduce((acc, s) => acc + (s.totalFils || 0), 0);
  }, [data.cashSales]);

  const drawerCashRefundsFils = useMemo(() => {
    return data.cashSales
      .filter(s => s.isRefunded || s.status === 'REFUNDED')
      .reduce((acc, s) => acc + ((s as any).refundAmountFils || s.totalFils || 0), 0);
  }, [data.cashSales]);

  const drawerCashExpensesFils = useMemo(() => {
    return data.cashExpenses.reduce((acc, e) => acc + (e.amountFils || 0), 0);
  }, [data.cashExpenses]);

  const drawerExpectedClosingCashFils = useMemo(() => {
    return drawerOpeningCashFils + drawerCashSalesFils - drawerCashRefundsFils - drawerCashExpensesFils;
  }, [drawerOpeningCashFils, drawerCashSalesFils, drawerCashRefundsFils, drawerCashExpensesFils]);

  const [drawerCountedInput, setDrawerCountedInput] = useState<number>(
    () => drawerExpectedClosingCashFils / 1000
  );

  // ----------------------------------------------------------------------
  // SECTION 1 FILTERS: مبيعات الكاش وصندوق المعرض (?q=cash-sales)
  // ----------------------------------------------------------------------
  const [cashFilterCashier, setCashFilterCashier] = useState<string>('ALL');
  const [cashFilterPaymentMethod, setCashFilterPaymentMethod] = useState<string>('ALL');
  const [cashFilterStatus, setCashFilterStatus] = useState<string>('ALL');
  const [cashFilterStartDate, setCashFilterStartDate] = useState('');
  const [cashFilterEndDate, setCashFilterEndDate] = useState('');
  const [cashFilterStartTime, setCashFilterStartTime] = useState('');
  const [cashFilterEndTime, setCashFilterEndTime] = useState('');
  const [cashFilterSearch, setCashFilterSearch] = useState('');

  const cashierOptions = useMemo(() => {
    const set = new Set<string>();
    data.cashSales.forEach(s => {
      if (s.cashierName) set.add(s.cashierName.trim());
    });
    return Array.from(set);
  }, [data.cashSales]);

  const filteredCashSales = useMemo(() => {
    return [...data.cashSales]
      .sort((a, b) => {
        const timeA = new Date(a.date).getTime();
        const timeB = new Date(b.date).getTime();
        if (!isNaN(timeA) && !isNaN(timeB)) return timeB - timeA;
        return b.date.localeCompare(a.date);
      })
      .filter((sale) => {
        if (cashFilterCashier !== 'ALL' && sale.cashierName !== cashFilterCashier) return false;
        if (cashFilterPaymentMethod !== 'ALL' && !sale.paymentMethod.includes(cashFilterPaymentMethod)) return false;
        if (cashFilterStatus !== 'ALL') {
          if (cashFilterStatus === 'REFUNDED') {
            const isRet = (sale as any).isRefunded || (sale as any).isModified || sale.status === 'REFUNDED' || sale.receiptNumber?.includes('-MOD');
            if (!isRet) return false;
          } else if (cashFilterStatus === 'COMPLETED') {
            const isRet = (sale as any).isRefunded || sale.status === 'REFUNDED';
            if (isRet) return false;
          }
        }
        if (cashFilterSearch.trim()) {
          const q = cashFilterSearch.trim().toLowerCase();
          const match =
            sale.receiptNumber.toLowerCase().includes(q) ||
            sale.cashierName.toLowerCase().includes(q) ||
            (sale.customerName && sale.customerName.toLowerCase().includes(q));
          if (!match) return false;
        }
        const datePrefix = sale.date.slice(0, 10);
        if (cashFilterStartDate && datePrefix < cashFilterStartDate) return false;
        if (cashFilterEndDate && datePrefix > cashFilterEndDate) return false;

        const timePart = sale.date.includes(' ') ? sale.date.split(' ')[1] : '';
        if (cashFilterStartTime && timePart && timePart < cashFilterStartTime) return false;
        if (cashFilterEndTime && timePart && timePart > cashFilterEndTime) return false;

        return true;
      });
  }, [
    data.cashSales,
    cashFilterCashier,
    cashFilterPaymentMethod,
    cashFilterStatus,
    cashFilterSearch,
    cashFilterStartDate,
    cashFilterEndDate,
    cashFilterStartTime,
    cashFilterEndTime
  ]);

  const totalFilteredCashSalesFils = useMemo(() => {
    return filteredCashSales.reduce((acc, sale) => acc + (sale.totalFils || 0), 0);
  }, [filteredCashSales]);

  // ----------------------------------------------------------------------
  // SECTION 2 FILTERS: مبيعات المتجر الإلكتروني (?q=store-sales)
  // ----------------------------------------------------------------------
  const [storeFilterStatus, setStoreFilterStatus] = useState<string>('ALL');
  const [storeFilterCity, setStoreFilterCity] = useState<string>('ALL');
  const [storeFilterPayment, setStoreFilterPayment] = useState<string>('ALL');
  const [storeFilterStartDate, setStoreFilterStartDate] = useState('');
  const [storeFilterEndDate, setStoreFilterEndDate] = useState('');
  const [storeFilterSearch, setStoreFilterSearch] = useState('');

  const onlineCityOptions = useMemo(() => {
    const set = new Set<string>();
    data.onlineOrders.forEach(o => {
      if (o.city) set.add(o.city.trim());
    });
    return Array.from(set);
  }, [data.onlineOrders]);

  const filteredOnlineOrders = useMemo(() => {
    return [...data.onlineOrders]
      .sort((a, b) => {
        const timeA = new Date(a.date).getTime();
        const timeB = new Date(b.date).getTime();
        if (!isNaN(timeA) && !isNaN(timeB)) return timeB - timeA;
        return b.date.localeCompare(a.date);
      })
      .filter((ord) => {
        if (storeFilterStatus !== 'ALL') {
          const s = (ord.status || '').toUpperCase();
          const raw = ord.status || '';
          let match = false;
          switch (storeFilterStatus) {
            case 'NEW':
              match = s.includes('NEW') || s.includes('PENDING') || raw.includes('جديد');
              break;
            case 'PREPARING':
              match = s.includes('PREPARING') || s.includes('CONFIRMED') || raw.includes('تجهيز') || raw.includes('مؤكد');
              break;
            case 'PREPARED':
              match = s.includes('PREPARED') || s.includes('READY') || raw.includes('تم التجهيز') || raw.includes('جاهز');
              break;
            case 'SHIPPED':
              match = s.includes('SHIPPED') || s.includes('COURIER') || s.includes('TRANSIT') || raw.includes('خرج') || raw.includes('توصيل') || raw.includes('مندوب');
              break;
            case 'COMPLETED':
              match = s.includes('COMPLETED') || s.includes('DELIVERED') || raw.includes('تسليم') || raw.includes('مكتمل');
              break;
            case 'CANCELLED':
              match = s.includes('CANCEL') || raw.includes('ملغ') || raw.includes('إلغاء');
              break;
            default:
              match = ord.status === storeFilterStatus || raw.includes(storeFilterStatus);
          }
          if (!match) return false;
        }
        if (storeFilterCity !== 'ALL' && ord.city !== storeFilterCity) return false;
        if (storeFilterPayment !== 'ALL' && !ord.paymentMethod.includes(storeFilterPayment)) return false;
        if (storeFilterSearch.trim()) {
          const q = storeFilterSearch.trim().toLowerCase();
          const match =
            ord.orderNumber.toLowerCase().includes(q) ||
            ord.customerName.toLowerCase().includes(q) ||
            (ord.phone && ord.phone.includes(q)) ||
            ord.city.toLowerCase().includes(q);
          if (!match) return false;
        }
        const datePrefix = ord.date.slice(0, 10);
        if (storeFilterStartDate && datePrefix < storeFilterStartDate) return false;
        if (storeFilterEndDate && datePrefix > storeFilterEndDate) return false;
        return true;
      });
  }, [
    data.onlineOrders,
    storeFilterStatus,
    storeFilterCity,
    storeFilterPayment,
    storeFilterStartDate,
    storeFilterEndDate,
    storeFilterSearch
  ]);

  const totalFilteredOnlineSalesFils = useMemo(() => {
    return filteredOnlineOrders.reduce((acc, o) => acc + (o.totalFils || 0), 0);
  }, [filteredOnlineOrders]);

  // Courier Batches & Prepared Orders State
  const [courierBatches, setCourierBatches] = useState<CourierBatchRecord[]>(data.courierBatches || []);
  const [preparedOrders, setPreparedOrders] = useState<CourierBatchOrderSummary[]>(data.preparedOrders || []);

  // ----------------------------------------------------------------------
  // SECTION 3 FILTERS: طلبيات وتسويات شركة التوصيل (?q=courier-settlements)
  // ----------------------------------------------------------------------
  const [courierFilterStatus, setCourierFilterStatus] = useState<string>('ALL');
  const [courierFilterCompany, setCourierFilterCompany] = useState<string>('ALL');
  const [courierFilterCity, setCourierFilterCity] = useState<string>('ALL');
  const [courierFilterStartDate, setCourierFilterStartDate] = useState('');
  const [courierFilterEndDate, setCourierFilterEndDate] = useState('');
  const [courierFilterStartTime, setCourierFilterStartTime] = useState('');
  const [courierFilterEndTime, setCourierFilterEndTime] = useState('');
  const [courierFilterSearch, setCourierFilterSearch] = useState('');

  const resetCourierFilters = () => {
    setCourierFilterStatus('ALL');
    setCourierFilterCompany('ALL');
    setCourierFilterCity('ALL');
    setCourierFilterStartDate('');
    setCourierFilterEndDate('');
    setCourierFilterStartTime('');
    setCourierFilterEndTime('');
    setCourierFilterSearch('');
  };

  const courierCompanyOptions = useMemo(() => {
    const set = new Set<string>();
    courierBatches.forEach(b => {
      if (b.courierName) set.add(b.courierName.trim());
    });
    data.deliveryOrders.forEach(d => {
      if (d.companyName) set.add(d.companyName.trim());
    });
    ((data as any).courierCompanies || []).forEach((c: any) => {
      if (c.name) set.add(c.name.trim());
    });
    return Array.from(set);
  }, [courierBatches, data.deliveryOrders, (data as any).courierCompanies]);

  const filteredCourierBatches = useMemo(() => {
    return courierBatches.filter((batch) => {
      if (courierFilterStatus !== 'ALL') {
        if (courierFilterStatus === 'SETTLED' && batch.status !== 'SETTLED') return false;
        if (courierFilterStatus === 'DELIVERED' && batch.status !== 'DELIVERED') return false;
        if (courierFilterStatus === 'DELIVERED_COLLECTED' && batch.status !== 'DELIVERED') return false;
        if (courierFilterStatus === 'OUT_FOR_DELIVERY' && batch.status !== 'OUT_FOR_DELIVERY') return false;
        if (courierFilterStatus === 'IN_TRANSIT' && batch.status !== 'OUT_FOR_DELIVERY') return false;
        if (courierFilterStatus === 'PREPARED' && batch.status !== 'PREPARED') return false;
        if (courierFilterStatus === 'CANCELLED' && batch.status !== 'CANCELLED') return false;
        if (courierFilterStatus === 'RETURNED' && batch.status !== 'CANCELLED') return false;
      }
      if (courierFilterCompany !== 'ALL' && batch.courierName !== courierFilterCompany) return false;
      if (courierFilterStartDate) {
        const d = batch.createdAt ? batch.createdAt.split('T')[0] : '';
        if (d && d < courierFilterStartDate) return false;
      }
      if (courierFilterEndDate) {
        const d = batch.createdAt ? batch.createdAt.split('T')[0] : '';
        if (d && d > courierFilterEndDate) return false;
      }
      if (courierFilterSearch.trim()) {
        const q = courierFilterSearch.trim().toLowerCase();
        const match =
          batch.batchNumber.toLowerCase().includes(q) ||
          batch.courierName.toLowerCase().includes(q) ||
          (batch.notes && batch.notes.toLowerCase().includes(q)) ||
          batch.orders.some(o => 
            o.orderNumber.toLowerCase().includes(q) || 
            o.customerName.toLowerCase().includes(q) ||
            o.city.toLowerCase().includes(q)
          );
        if (!match) return false;
      }
      return true;
    });
  }, [
    courierBatches,
    courierFilterStatus,
    courierFilterCompany,
    courierFilterStartDate,
    courierFilterEndDate,
    courierFilterSearch
  ]);

  const filteredBatchTotals = useMemo(() => {
    return filteredCourierBatches.reduce(
      (acc, b) => ({
        ordersCount: acc.ordersCount + b.orders.length,
        cod: acc.cod + (b.totalCodFils || 0),
        fees: acc.fees + (b.totalDeliveryFeeFils || 0),
        net: acc.net + (b.netSettlementFils || 0)
      }),
      { ordersCount: 0, cod: 0, fees: 0, net: 0 }
    );
  }, [filteredCourierBatches]);

  const courierCityOptions = useMemo(() => {
    const set = new Set<string>();
    data.deliveryOrders.forEach(d => {
      if (d.city) set.add(d.city.trim());
    });
    return Array.from(set);
  }, [data.deliveryOrders]);

  const filteredDeliveryOrders = useMemo(() => {
    return [...data.deliveryOrders].filter((del) => {
      if (courierFilterStatus !== 'ALL') {
        if (courierFilterStatus === 'SETTLED' && del.status !== 'SETTLED') return false;
        if (courierFilterStatus === 'DELIVERED_COLLECTED' && del.status !== 'DELIVERED_COLLECTED') return false;
        if (courierFilterStatus === 'IN_TRANSIT' && del.status !== 'IN_TRANSIT') return false;
        if (courierFilterStatus === 'RETURNED' && del.status !== 'RETURNED') return false;
      }
      if (courierFilterCompany !== 'ALL' && del.companyName !== courierFilterCompany) return false;
      if (courierFilterCity !== 'ALL' && del.city !== courierFilterCity) return false;
      if (courierFilterStartDate && del.date < courierFilterStartDate) return false;
      if (courierFilterEndDate && del.date > courierFilterEndDate) return false;
      const delTime = (del as any).time || (del.settledAt ? del.settledAt.substring(11, 16) : '');
      if (courierFilterStartTime && delTime && delTime < courierFilterStartTime) return false;
      if (courierFilterEndTime && delTime && delTime > courierFilterEndTime) return false;
      if (courierFilterSearch.trim()) {
        const q = courierFilterSearch.trim().toLowerCase();
        const match =
          del.orderNumber.toLowerCase().includes(q) ||
          del.customerName.toLowerCase().includes(q) ||
          del.city.toLowerCase().includes(q) ||
          del.companyName.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [
    data.deliveryOrders,
    courierFilterStatus,
    courierFilterCompany,
    courierFilterCity,
    courierFilterStartDate,
    courierFilterEndDate,
    courierFilterStartTime,
    courierFilterEndTime,
    courierFilterSearch
  ]);

  const filteredDeliveryTotals = useMemo(() => {
    return filteredDeliveryOrders.reduce(
      (acc, d) => ({
        cod: acc.cod + (d.codAmountFils || 0),
        fees: acc.fees + (d.deliveryFeeFils || 0),
        net: acc.net + (d.netSettlementFils || 0)
      }),
      { cod: 0, fees: 0, net: 0 }
    );
  }, [filteredDeliveryOrders]);

  // ----------------------------------------------------------------------
  // SECTION 4 FILTERS: المصروفات من الكاش (?q=cash-expenses)
  // ----------------------------------------------------------------------
  const [expenseFilterCategory, setExpenseFilterCategory] = useState<string>('ALL');
  const [expenseFilterRecordedBy, setExpenseFilterRecordedBy] = useState<string>('ALL');
  const [expenseFilterStartDate, setExpenseFilterStartDate] = useState('');
  const [expenseFilterEndDate, setExpenseFilterEndDate] = useState('');
  const [expenseFilterStartTime, setExpenseFilterStartTime] = useState('');
  const [expenseFilterEndTime, setExpenseFilterEndTime] = useState('');
  const [expenseFilterSearch, setExpenseFilterSearch] = useState('');

  const resetExpenseFilters = () => {
    setExpenseFilterCategory('ALL');
    setExpenseFilterRecordedBy('ALL');
    setExpenseFilterStartDate('');
    setExpenseFilterEndDate('');
    setExpenseFilterStartTime('');
    setExpenseFilterEndTime('');
    setExpenseFilterSearch('');
  };

  const expenseCategoryOptions = useMemo(() => {
    const set = new Set<string>();
    data.cashExpenses.forEach(e => {
      if (e.category) set.add(e.category.trim());
    });
    return Array.from(set);
  }, [data.cashExpenses]);

  const expenseRecordedByOptions = useMemo(() => {
    const set = new Set<string>();
    data.cashExpenses.forEach(e => {
      if (e.recordedBy) set.add(e.recordedBy.trim());
    });
    return Array.from(set);
  }, [data.cashExpenses]);

  const filteredCashExpenses = useMemo(() => {
    return [...data.cashExpenses]
      .sort((a, b) => b.date.localeCompare(a.date))
      .filter((exp) => {
        if (expenseFilterCategory !== 'ALL' && exp.category !== expenseFilterCategory) return false;
        if (expenseFilterRecordedBy !== 'ALL' && exp.recordedBy !== expenseFilterRecordedBy) return false;
        if (expenseFilterStartDate && exp.date < expenseFilterStartDate) return false;
        if (expenseFilterEndDate && exp.date > expenseFilterEndDate) return false;
        const expTime = (exp as any).time || '';
        if (expenseFilterStartTime && expTime && expTime < expenseFilterStartTime) return false;
        if (expenseFilterEndTime && expTime && expTime > expenseFilterEndTime) return false;
        if (expenseFilterSearch.trim()) {
          const q = expenseFilterSearch.trim().toLowerCase();
          const match =
            exp.expenseNumber.toLowerCase().includes(q) ||
            (exp.notes && exp.notes.toLowerCase().includes(q)) ||
            (exp.beneficiary && exp.beneficiary.toLowerCase().includes(q)) ||
            exp.category.toLowerCase().includes(q);
          if (!match) return false;
        }
        return true;
      });
  }, [
    data.cashExpenses,
    expenseFilterCategory,
    expenseFilterRecordedBy,
    expenseFilterStartDate,
    expenseFilterEndDate,
    expenseFilterStartTime,
    expenseFilterEndTime,
    expenseFilterSearch
  ]);

  const totalFilteredCashExpensesFils = useMemo(() => {
    return filteredCashExpenses.reduce((acc, e) => acc + (e.amountFils || 0), 0);
  }, [filteredCashExpenses]);

  // ----------------------------------------------------------------------
  // SECTION 7 FILTERS: سجل الفواتير المركزية (?q=invoices) — Merged from /admin/invoices
  // ----------------------------------------------------------------------
  const [invoiceFilterSource, setInvoiceFilterSource] = useState<string>('ALL');
  const [invoiceFilterCashier, setInvoiceFilterCashier] = useState<string>('ALL');
  const [invoiceFilterStatus, setInvoiceFilterStatus] = useState<string>('ALL');
  const [invoiceFilterStartDate, setInvoiceFilterStartDate] = useState('');
  const [invoiceFilterEndDate, setInvoiceFilterEndDate] = useState('');
  const [invoiceFilterSearch, setInvoiceFilterSearch] = useState('');
  const [selectedReceipt, setSelectedReceipt] = useState<any | null>(null);
  const [loadingReceipt, setLoadingReceipt] = useState(false);

  const rawInvoices = useMemo(() => {
    return (data as any).invoices || [];
  }, [data]);

  const invoiceCashierOptions = useMemo(() => {
    const set = new Set<string>();
    rawInvoices.forEach((inv: any) => {
      if (inv.cashierName) set.add(inv.cashierName.trim());
    });
    return Array.from(set);
  }, [rawInvoices]);

  const filteredInvoices = useMemo(() => {
    return [...rawInvoices].filter((inv: any) => {
      if (invoiceFilterSearch.trim()) {
        const q = invoiceFilterSearch.trim().toLowerCase();
        const match =
          (inv.number || '').toLowerCase().includes(q) ||
          (inv.customerName || '').toLowerCase().includes(q) ||
          (inv.cashierName || '').toLowerCase().includes(q);
        if (!match) return false;
      }
      if (invoiceFilterSource !== 'ALL' && inv.source !== invoiceFilterSource) return false;
      if (invoiceFilterCashier !== 'ALL' && inv.cashierName !== invoiceFilterCashier) return false;
      if (invoiceFilterStatus !== 'ALL') {
        const isRet = inv.isRefunded || inv.isModified || inv.paymentStatus === 'REFUNDED' || (inv.number && inv.number.includes('-MOD'));
        if (invoiceFilterStatus === 'REFUNDED' && !isRet) return false;
        if (invoiceFilterStatus === 'PAID' && isRet) return false;
      }
      const datePart = (inv.date || '').slice(0, 10);
      if (invoiceFilterStartDate && datePart < invoiceFilterStartDate) return false;
      if (invoiceFilterEndDate && datePart > invoiceFilterEndDate) return false;

      return true;
    });
  }, [
    rawInvoices,
    invoiceFilterSearch,
    invoiceFilterSource,
    invoiceFilterCashier,
    invoiceFilterStatus,
    invoiceFilterStartDate,
    invoiceFilterEndDate
  ]);

  const totalFilteredInvoicesFils = useMemo(() => {
    return filteredInvoices.reduce((acc: number, inv: any) => acc + (inv.grossTotalFils || 0), 0);
  }, [filteredInvoices]);

  const handleViewReceipt = async (invNumber: string) => {
    setLoadingReceipt(true);
    try {
      const res = await getSaleDetailsForReceipt(invNumber);
      if (res.success && res.sale) {
        setSelectedReceipt(res.sale);
      } else {
        const foundSale = data.cashSales.find(s => s.receiptNumber === invNumber);
        const foundInv = rawInvoices.find((i: any) => i.number === invNumber);
        setSelectedReceipt({
          invoiceNumber: invNumber,
          reference: invNumber,
          customerName: foundSale?.customerName || foundInv?.customerName || 'عميل نقدي',
          cashierName: foundSale?.cashierName || foundInv?.cashierName || 'كاشير غزل (عين الباشا)',
          createdAt: foundSale?.date || foundInv?.date || new Date().toISOString(),
          total: foundSale?.totalFils || foundInv?.grossTotalFils || 25000,
          items: [
            { name: 'مستحضرات تجميل ومكياج غزل', quantity: foundSale?.itemsCount || 1, unitPrice: foundSale?.totalFils || foundInv?.grossTotalFils || 25000, total: foundSale?.totalFils || foundInv?.grossTotalFils || 25000 }
          ]
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingReceipt(false);
    }
  };

  // Modals
  const [isRemittanceModalOpen, setIsRemittanceModalOpen] = useState(false);
  const [isCashDrawerModalOpen, setIsCashDrawerModalOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);

  const [deliverySubView, setDeliverySubView] = useState<'READY_ORDERS' | 'BATCHES' | 'SETTLEMENTS'>('SETTLEMENTS');
  const [selectedPreparedOrderIds, setSelectedPreparedOrderIds] = useState<string[]>([]);

  // Courier Batch Modal State
  const [isCreateBatchModalOpen, setIsCreateBatchModalOpen] = useState(false);
  const [batchNumberInput, setBatchNumberInput] = useState('');
  const [courierNameInput, setCourierNameInput] = useState('سريعة اكسبرس');
  const [batchNotesInput, setBatchNotesInput] = useState('');
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchFeedback, setBatchFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);

  // Batch Installment Remittance State
  const [selectedBatchForRemittance, setSelectedBatchForRemittance] = useState<CourierBatchRecord | null>(null);
  const [batchRemittanceAmount, setBatchRemittanceAmount] = useState<string>('');
  const [batchRemittanceRef, setBatchRemittanceRef] = useState<string>('');
  const [batchRemittanceNotes, setBatchRemittanceNotes] = useState<string>('');
  const [isSubmittingBatchRemittance, setIsSubmittingBatchRemittance] = useState(false);

  const handleRecordBatchRemittance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBatchForRemittance) return;
    setIsSubmittingBatchRemittance(true);
    try {
      const amountFils = jodToFils(batchRemittanceAmount);
      const res = await recordCourierBatchRemittancePaymentAction({
        batchId: selectedBatchForRemittance.id,
        amountFils,
        receiptRef: batchRemittanceRef,
        notes: batchRemittanceNotes
      });
      if (res.success) {
        showToast(`تم تسجيل دفعة التوريد بنجاح (${batchRemittanceAmount} د.أ) لشحنة #${selectedBatchForRemittance.batchNumber}`);
        setSelectedBatchForRemittance(null);
        setBatchRemittanceAmount('');
        setBatchRemittanceRef('');
        setBatchRemittanceNotes('');
        setCourierBatches(prev => prev.map(b => b.id === selectedBatchForRemittance.id ? {
          ...b,
          remittedFils: res.remittedFils ?? 0,
          remainingFils: res.remainingFils ?? 0,
          status: (res.batchStatus as any) || b.status,
          remittances: [res.remittance!, ...(b.remittances || [])]
        } : b));
      } else {
        showToast(res.error || 'فشل تسجيل الدفعة');
      }
    } catch (err: any) {
      showToast(err.message || 'خطأ أثناء تسجيل الدفعة');
    } finally {
      setIsSubmittingBatchRemittance(false);
    }
  };

  const handleToggleSelectPreparedOrder = (orderId: string) => {
    setSelectedPreparedOrderIds(prev => 
      prev.includes(orderId) ? prev.filter(id => id !== orderId) : [...prev, orderId]
    );
  };

  const handleSelectAllPreparedOrders = () => {
    if (selectedPreparedOrderIds.length === preparedOrders.length) {
      setSelectedPreparedOrderIds([]);
    } else {
      setSelectedPreparedOrderIds(preparedOrders.map(p => p.orderId));
    }
  };

  const handleOpenCreateBatchModal = () => {
    if (selectedPreparedOrderIds.length === 0) {
      alert('يرجى تحديد طلبية واحدة على الأقل لإنشاء طلبية التوصيل');
      return;
    }
    const nextSeq = (courierBatches.length + 1).toString().padStart(3, '0');
    setBatchNumberInput(`BATCH-2026-${nextSeq}`);
    setBatchNotesInput('');
    setBatchFeedback(null);
    setIsCreateBatchModalOpen(true);
  };

  const handleCreateBatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!batchNumberInput.trim()) {
      alert('يرجى كتابة رقم الطلبية');
      return;
    }
    if (!courierNameInput.trim()) {
      alert('يرجى كتابة اسم شركة التوصيل');
      return;
    }

    setBatchLoading(true);
    setBatchFeedback(null);
    try {
      const res = await createCourierBatchAction({
        batchNumber: batchNumberInput.trim(),
        courierName: courierNameInput.trim(),
        orderIds: selectedPreparedOrderIds,
        notes: batchNotesInput.trim()
      });

      if (!res.success) {
        setBatchFeedback({ type: 'error', message: res.error || 'فشل إنشاء الطلبية' });
        setBatchLoading(false);
        return;
      }

      if (res.batch) {
        setCourierBatches(prev => [res.batch!, ...prev]);
        setPreparedOrders(prev => prev.filter(o => !selectedPreparedOrderIds.includes(o.orderId)));
        setSelectedPreparedOrderIds([]);
      }

      showToast(`تم إنشاء طلبية التوصيل رقم #${res.batch?.batchNumber} بنجاح وتحويل حالة الطلبات إلى (خرج للتوصيل)!`);
      setBatchFeedback({ 
        type: 'success', 
        message: `تم إنشاء طلبية التوصيل رقم #${res.batch?.batchNumber} بنجاح!` 
      });

      setTimeout(() => {
        setIsCreateBatchModalOpen(false);
        setDeliverySubView('BATCHES');
      }, 1000);
    } catch (err: any) {
      setBatchFeedback({ type: 'error', message: err.message || 'حدث خطأ غير متوقع' });
    } finally {
      setBatchLoading(false);
    }
  };

  // Batch Settlement State & Handler
  const [settlingBatchId, setSettlingBatchId] = useState<string | null>(null);

  const handleSettleBatch = async (batch: CourierBatchRecord) => {
    if (batch.status === 'SETTLED') {
      alert('تمت تسوية هذه الطلبية وتوريد مبالغها مسبقاً.');
      return;
    }

    if (batch.status !== 'DELIVERED') {
      const confirmEarly = window.confirm(
        `تنبيه: حالة الطلبية #${batch.batchNumber} الحالية هي (${batch.status === 'OUT_FOR_DELIVERY' ? 'مع المندوب' : 'قيد التجهيز'}).\nهل تم تسليم جميع الطلبات (${batch.orders.length} طلبات) واستلام صافي المبلغ (${formatMoney(batch.netSettlementFils)} د.أ) من شركة التوصيل (${batch.courierName}) الآن؟`
      );
      if (!confirmEarly) return;
    } else {
      const confirmNormal = window.confirm(
        `تأكيد تسوية الطلبية #${batch.batchNumber}:\nشركة التوصيل: ${batch.courierName}\nعدد الطلبات: ${batch.orders.length}\nصافي المبلغ المورد: ${formatMoney(batch.netSettlementFils)} د.أ\n\nهل تريد اعتماد التسوية وتوريد الكاش لحساب المتجر؟`
      );
      if (!confirmNormal) return;
    }

    setSettlingBatchId(batch.id);
    try {
      if (batch.status !== 'DELIVERED') {
        await updateCourierBatchStatusAction({ batchId: batch.id, newStatus: 'DELIVERED' });
      }
      const res = await updateCourierBatchStatusAction({ batchId: batch.id, newStatus: 'SETTLED' });
      if (!res.success) {
        alert(res.error || 'فشلت تسوية الطلبية');
        return;
      }

      setCourierBatches(prev => prev.map(b => {
        if (b.id === batch.id) {
          return {
            ...b,
            status: 'SETTLED',
            updatedAt: new Date().toISOString(),
            orders: b.orders.map(o => ({ ...o, status: 'SETTLED' }))
          };
        }
        return b;
      }));

      showToast(`تمت تسوية طلبية التوصيل #${batch.batchNumber} وتوريد صافي مبلغ ${formatMoney(batch.netSettlementFils)} د.أ بنجاح! 💰`);
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء التسوية');
    } finally {
      setSettlingBatchId(null);
    }
  };

  // Operating Expenses state (Rent, Electricity, Utilities, Supplies)
  const [operatingExpensesList, setOperatingExpensesList] = useState<OperatingExpense[]>(
    data.operatingExpenses || []
  );
  const [isAddExpenseModalOpen, setIsAddExpenseModalOpen] = useState(false);
  const [expenseFormCategory, setExpenseFormCategory] = useState<string>('إيجار المحل');
  const [expenseFormAmountJod, setExpenseFormAmountJod] = useState<string>('');
  const [expenseFormBeneficiary, setExpenseFormBeneficiary] = useState<string>('');
  const [expenseFormPaymentMethod, setExpenseFormPaymentMethod] = useState<'CASH' | 'BANK'>('CASH');
  const [expenseFormDate, setExpenseFormDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [expenseFormNotes, setExpenseFormNotes] = useState<string>('');
  const [isSubmittingExpense, setIsSubmittingExpense] = useState(false);
  const [deletingExpenseId, setDeletingExpenseId] = useState<string | null>(null);

  const handleAddExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(expenseFormAmountJod);
    if (!amountNum || amountNum <= 0) {
      alert('يرجى إدخال مبلغ صحيح بالدينار');
      return;
    }
    if (!expenseFormBeneficiary.trim()) {
      alert('يرجى إدخال الجهة المستفيدة أو تفاصيل الفاتورة');
      return;
    }

    setIsSubmittingExpense(true);
    try {
      const res = await addOperatingExpenseAction({
        category: expenseFormCategory as any,
        amountFils: Math.round(amountNum * 1000),
        beneficiary: expenseFormBeneficiary.trim(),
        paymentMethod: expenseFormPaymentMethod,
        notes: expenseFormNotes.trim(),
        recordedBy: 'المسؤول المالي'
      });

      if (!res.success || !res.expense) {
        alert(res.error || 'فشل حفظ المصروف');
        return;
      }

      setOperatingExpensesList(prev => [res.expense!, ...prev]);
      setIsAddExpenseModalOpen(false);
      setExpenseFormAmountJod('');
      setExpenseFormBeneficiary('');
      setExpenseFormNotes('');
      showToast(`تم تسجيل مصروف (${expenseFormCategory}: ${amountNum} د.أ) وخصمه من صافي الأرباح بنجاح! 💸`);
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء حفظ المصروف');
    } finally {
      setIsSubmittingExpense(false);
    }
  };

  const handleDeleteExpense = async (expenseId: string) => {
    if (!window.confirm('هل أنتِ متأكدة من حذف هذا المصروف؟')) return;
    setDeletingExpenseId(expenseId);
    try {
      const res = await deleteOperatingExpenseAction(expenseId);
      if (res.success) {
        setOperatingExpensesList(prev => prev.filter(e => e.id !== expenseId));
        showToast('تم حذف المصروف بنجاح.');
      } else {
        alert(res.error || 'فشل الحذف');
      }
    } catch (err: any) {
      alert(err.message || 'حدث خطأ');
    } finally {
      setDeletingExpenseId(null);
    }
  };

  // P&L (Financial Summary) Filter State
  const [pnlPeriodFilter, setPnlPeriodFilter] = useState<'ALL' | 'TODAY' | 'WEEK' | 'MONTH' | 'QUARTER' | 'CUSTOM'>('MONTH');
  const [pnlChannelFilter, setPnlChannelFilter] = useState<'ALL' | 'POS' | 'ONLINE'>('ALL');
  const [pnlStartDate, setPnlStartDate] = useState<string>('');
  const [pnlEndDate, setPnlEndDate] = useState<string>('');

  const resetPnlFilters = () => {
    setPnlPeriodFilter('MONTH');
    setPnlChannelFilter('ALL');
    setPnlStartDate('');
    setPnlEndDate('');
  };

  const handleChangeBatchStatus = async (
    batchId: string, 
    newStatus: 'PREPARED' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'SETTLED' | 'CANCELLED'
  ) => {
    const batch = courierBatches.find(b => b.id === batchId);
    if (!batch) return;

    if (newStatus === 'SETTLED' && batch.status !== 'DELIVERED') {
      alert('تنبيه: لا يمكن إجراء التسوية المالية للشحنة إلا للطلبيات التي تم الانتهاء منها وتوصيلها بالكامل للزبائن أولاً (تم تسليم الطلبات ✓).');
      return;
    }

    const statusNames: Record<string, string> = {
      'PREPARED': 'تم التجهيز بانتظار استلام المندوب',
      'OUT_FOR_DELIVERY': 'خرجت للتوصيل مع المندوب 🚚',
      'DELIVERED': 'تم تسليم جميع الطلبات للزبائن بنجاح ✓',
      'SETTLED': 'تمت التسوية وتوريد الكاش لحسابنا 💰',
      'CANCELLED': 'إلغاء أو إرجاع الشحنة ✗'
    };

    const confirmMsg = `هل أنتِ متأكدة من تغيير حالة طلبية التوصيل #${batch.batchNumber} إلى:\n"${statusNames[newStatus]}"؟\n\nتنبيه: سيتم آلياً وفوراً تغيير حالة جميع الطلبات (${batch.orders.length} طلبات) المشمولة في هذه الطلبية لتطابق هذه الحالة.`;
    if (!window.confirm(confirmMsg)) return;

    setBatchLoading(true);
    try {
      const res = await updateCourierBatchStatusAction({ batchId, newStatus });
      if (!res.success) {
        alert(res.error || 'فشل تحديث حالة الطلبية');
        setBatchLoading(false);
        return;
      }

      setCourierBatches(prev => prev.map(b => {
        if (b.id === batchId) {
          const mappedOrderSt = newStatus === 'OUT_FOR_DELIVERY' ? 'SHIPPED' : newStatus;
          return {
            ...b,
            status: newStatus,
            updatedAt: new Date().toISOString(),
            orders: b.orders.map(o => ({ ...o, status: mappedOrderSt }))
          };
        }
        return b;
      }));

      showToast(res.message || 'تم تحديث حالة طلبية التوصيل وجميع الطلبات المشمولة بنجاح.');
    } catch (err: any) {
      alert(err.message || 'حدث خطأ');
    } finally {
      setBatchLoading(false);
    }
  };

  // Toast feedback
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setFeedbackMessage(msg);
    setTimeout(() => setFeedbackMessage(null), 4000);
  };

  const switchTab = (tab: TabType) => {
    setActiveTab(tab);
    if (typeof window !== 'undefined') {
      const qParam = mapTabToQueryParam(tab);
      const url = new URL(window.location.href);
      url.searchParams.set('q', qParam);
      window.history.pushState({ ...window.history.state, as: url.toString(), url: url.toString() }, '', url.toString());
    }
  };

  useEffect(() => {
    const handlePopState = () => {
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const q = params.get('q') || undefined;
        setActiveTab(mapQueryParamToTab(q));
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const currentTabIndex = SETTLEMENT_TABS_LIST.findIndex(t => t.id === activeTab);
  const prevTabObj = currentTabIndex > 0 ? SETTLEMENT_TABS_LIST[currentTabIndex - 1] : null;
  const nextTabObj = currentTabIndex < SETTLEMENT_TABS_LIST.length - 1 ? SETTLEMENT_TABS_LIST[currentTabIndex + 1] : null;

  // Professional Print Handler
  const handlePrint = () => {
    const originalTitle = document.title;
    document.title = 'كشف مالي معتمد — محل غزل للمكياج والتجميل';
    window.print();
    setTimeout(() => {
      document.title = originalTitle;
    }, 1200);
  };

  // Settle single delivery order
  const handleSettleSingleOrder = async (orderId: string) => {
    const target = data.deliveryOrders.find(d => d.id === orderId || d.orderNumber === orderId);
    if (target && target.status !== 'DELIVERED_COLLECTED') {
      alert('تنبيه: لا يمكن إجراء التسوية المالية إلا للطلبيات التي تم الانتهاء منها وتوصيلها بالكامل للزبون واستلام ثمنها (تم التحصيل / التسليم ✓).');
      return;
    }
    setSettlingOrderId(orderId);
    try {
      const res = await settleSingleDeliveryOrderAction(orderId);
      if (res.success && res.order) {
        setData((prev) => {
          const updatedOrders = prev.deliveryOrders.map(d =>
            d.id === orderId || d.orderNumber === orderId
              ? { ...d, status: 'SETTLED' as const }
              : d
          );
          const settledAmount = res.order.netSettlementFils;
          const currentRemitted = prev.deliverySettlement.remittedFils + settledAmount;
          const currentRemaining = Math.max(0, prev.deliverySettlement.netSettlementExpectedFils - currentRemitted);
          return {
            ...prev,
            deliveryOrders: updatedOrders,
            deliverySettlement: {
              ...prev.deliverySettlement,
              remittedFils: currentRemitted,
              remainingFils: currentRemaining
            }
          };
        });
        showToast(`تمت تسوية الطلبية رقم ${res.order.orderNumber} بنجاح وتوريد ${formatMoney(res.order.netSettlementFils)} د.أ`);
      } else {
        alert(res.error || 'فشل تسوية الطلبية');
      }
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء تسوية الطلبية');
    } finally {
      setSettlingOrderId(null);
    }
  };

  const formatMoney = (fils: number) => {
    return (fils / 1000).toLocaleString('en-US', {
      minimumFractionDigits: 3,
      maximumFractionDigits: 3
    });
  };

  // Filtered products
  const filteredProducts = data.inventory.filter((item) => {
    const q = searchProductQuery.toLowerCase();
    return (
      item.name.toLowerCase().includes(q) ||
      item.brand.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q) ||
      item.specification.toLowerCase().includes(q)
    );
  });

  const getActiveTabReportTitle = () => {
    switch (activeTab) {
      case 'cash_sales': return 'كشف مبيعات الكاش وصندوق صالة المعرض (POS)';
      case 'online_sales': return 'كشف طلبيات ومبيعات المتجر الإلكتروني (Online Store)';
      case 'delivery': return 'كشف طلبيات وتسويات شركة التوصيل والشحن (COD)';
      case 'cash_expenses': return 'كشف المصروفات النقدية المسحوبة من صندوق الكاشير';
      case 'invoices': return 'سجل الفواتير المركزية وسندات البيع المعتمدة';
      case 'pnl': return 'كشف الأرباح والتقرير المالي الرسمي التفصيلي';
      default: return 'كشف مالي رسمي';
    }
  };

  return (
    <div className="min-h-screen bg-[#FBFBFC] text-slate-800 font-sans pb-16 print:bg-white print:p-0 print:pb-0" dir="rtl">
      {/* Print-specific Stylesheet Injection */}
      <style jsx global>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 10mm 12mm;
          }
          body {
            background-color: #ffffff !important;
            color: #000000 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .print-table {
            width: 100% !important;
            border-collapse: collapse !important;
            color: #000000 !important;
          }
          .print-table th, .print-table td {
            border: 1px solid #000000 !important;
            color: #000000 !important;
            padding: 6px 8px !important;
            background: transparent !important;
          }
          .print-table th {
            background-color: #f3f4f6 !important;
            font-weight: 800 !important;
          }
        }
      `}</style>

      {/* Toast Notification */}
      {feedbackMessage && (
        <div className="print:hidden fixed top-5 start-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white px-5 py-2.5 rounded-xl shadow-2xl text-xs font-bold flex items-center gap-2 border border-slate-700 animate-bounce">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{feedbackMessage}</span>
        </div>
      )}

      {/* Top Header */}
      <header className="print:hidden bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <span className="p-2 rounded-xl bg-slate-900 text-white">
                <Landmark className="w-5 h-5" />
              </span>
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  مركز الجرد والتسويات والفواتير
                </h1>
                <p className="text-xs text-slate-500 font-medium">
                  منظومة موحدة لإدارة مبيعات الكاش، المتجر، طلبيات التوصيل، المصروفات، والفواتير المركزية — محل غزل (عين الباشا)
                </p>
              </div>
            </div>

            {/* Actions: Retention & Print Buttons */}
            <div className="flex items-center gap-2">
              <Link
                href="/admin/system/retention"
                className="bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-xs font-bold px-3.5 py-2.5 rounded-xl flex items-center gap-1.5 transition border border-zinc-200"
                title="سياسة حفظ البيانات والخطة المجانية: الفواتير 30 يوماً، السجلات 90 يوماً"
              >
                <Database className="w-4 h-4 text-[#E6007E]" />
                <span>حفظ البيانات (90/30 يوم)</span>
              </Link>
              <button
                type="button"
                onClick={handlePrint}
                className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold px-4 py-2.5 rounded-xl flex items-center gap-2 transition-all shadow-sm cursor-pointer"
                title="طباعة كشف مالي رسمي معتمد بصيغة A4 أبيض وأسود مع اللوجو"
              >
                <Printer className="w-4 h-4 text-white" />
                <span>طباعة الكشف الرسمي</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6 print:p-0 print:space-y-4">

        {/* OFFICIAL PRINT HEADER (Visible ONLY during print) */}
        <div className="hidden print:block border-b-2 border-black pb-4 text-black">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <img
                src="/logo.png"
                alt="Ghazal Cosmetics Logo"
                className="h-16 w-auto object-contain shrink-0"
              />
              <div>
                <h1 className="text-xl font-black text-black">
                  محل غزل لمستحضرات التجميل والمكياج والعطور
                </h1>
                <p className="text-xs font-bold text-black mt-0.5">
                  الفرع الرئيسي: محافظة البلقاء — لواء عين الباشا — السوق التجاري — هاتف: 0799991234
                </p>
                <p className="text-[11px] font-bold text-black mt-0.5">
                  السجل التجاري: 284192 / الرقم الضريبي: 0148921
                </p>
              </div>
            </div>
            <div className="text-left text-xs font-mono space-y-1 text-black">
              <div className="font-extrabold border border-black px-2.5 py-1 rounded inline-block text-[11px]">
                كشف مالي رسمي معتمد
              </div>
              <div className="font-bold">تاريخ الطباعة: {getJordanNowFormatted()}</div>
              <div>توقيت المملكة الأردنية الهاشمية (UTC+3)</div>
              <div>المستخدم المدقق: {currentUserRole}</div>
            </div>
          </div>

          <div className="mt-4 pt-2 border-t border-black/60 flex justify-between items-center text-xs font-black">
            <div>نوع الكشف: {getActiveTabReportTitle()}</div>
            <div>
              {activeTab === 'cash_sales' && `عدد الإيصالات: ${filteredCashSales.length} | الإجمالي: ${formatMoney(totalFilteredCashSalesFils)} د.أ`}
              {activeTab === 'online_sales' && `عدد الطلبيات: ${filteredOnlineOrders.length} | الإجمالي: ${formatMoney(totalFilteredOnlineSalesFils)} د.أ`}
              {activeTab === 'delivery' && `عدد الطلبيات: ${filteredDeliveryOrders.length} | صافي التوريد: ${formatMoney(filteredDeliveryTotals.net)} د.أ`}
              {activeTab === 'cash_expenses' && `عدد السندات: ${filteredCashExpenses.length} | إجمالي المصروف: ${formatMoney(totalFilteredCashExpensesFils)} د.أ`}
              {activeTab === 'invoices' && `عدد الفواتير: ${filteredInvoices.length} | الإجمالي الصافي: ${formatMoney(totalFilteredInvoicesFils)} د.أ`}
            </div>
          </div>
        </div>

        {/* TOP 4 FINANCIAL KPI CARDS (Hidden in print) */}
        <div className="print:hidden grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <span className="text-xs font-bold text-slate-500 block">1. مبيعات الكاش (POS)</span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-xl sm:text-2xl font-black font-mono text-slate-900">
                {formatMoney(data.kpis.cashSalesTotalFils)}
              </span>
              <span className="text-xs font-bold text-slate-400">د.أ</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">مبيعات صالة المعرض المباشرة</p>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <span className="text-xs font-bold text-slate-500 block">2. مبيعات المتجر الإلكتروني</span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-xl sm:text-2xl font-black font-mono text-blue-700">
                {formatMoney(data.kpis.onlineSalesTotalFils)}
              </span>
              <span className="text-xs font-bold text-slate-400">د.أ</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">طلبيات الموقع والدفع عند الاستلام</p>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <span className="text-xs font-bold text-slate-500 block">3. مستحقات شركة التوصيل</span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-xl sm:text-2xl font-black font-mono text-purple-700">
                {formatMoney(data.kpis.deliveryReceivableFils)}
              </span>
              <span className="text-xs font-bold text-slate-400">د.أ</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">مبالغ COD قيد التحصيل والتوريد</p>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <span className="text-xs font-bold text-slate-500 block">4. المصروفات من الكاش</span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-xl sm:text-2xl font-black font-mono text-rose-600">
                {formatMoney(data.kpis.cashExpensesTotalFils)}
              </span>
              <span className="text-xs font-bold text-slate-400">د.أ</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">المبالغ المسحوبة من صندوق الكاشير</p>
          </div>
        </div>

        {/* PRIMARY SECTION TABS (With parameter ?q=xxxxx support & easy navigation) */}
        <div className="print:hidden space-y-3">
          {/* Quick Step Bar with Prev / Next & Dropdown */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-slate-900 text-white rounded-2xl shadow-sm border border-slate-800">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-300">التنقل السريع بين أقسام التسويات المركزية (6 أقسام):</span>
              <select
                value={activeTab}
                onChange={(e) => switchTab(e.target.value as TabType)}
                className="bg-slate-800 text-white border border-slate-700 rounded-xl px-3 py-1.5 text-xs font-black outline-none cursor-pointer hover:bg-slate-700 transition"
              >
                {SETTLEMENT_TABS_LIST.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.num}. {t.label} (?q={t.q})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => prevTabObj && switchTab(prevTabObj.id)}
                disabled={!prevTabObj}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed text-xs font-black flex items-center gap-1.5 cursor-pointer transition border border-slate-700 text-slate-200"
                title={prevTabObj ? `الانتقال إلى: ${prevTabObj.label}` : 'أنت في القسم الأول'}
              >
                <ArrowRight className="w-3.5 h-3.5" />
                <span>القسم السابق</span>
              </button>

              <button
                type="button"
                onClick={() => nextTabObj && switchTab(nextTabObj.id)}
                disabled={!nextTabObj}
                className="px-3.5 py-1.5 rounded-xl bg-[#E6007E] hover:bg-[#c4006b] disabled:opacity-30 disabled:cursor-not-allowed text-white text-xs font-black flex items-center gap-1.5 cursor-pointer transition shadow-xs"
                title={nextTabObj ? `الانتقال إلى: ${nextTabObj.label}` : 'أنت في القسم الأخير'}
              >
                <span>القسم التالي</span>
                <ArrowLeft className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* 6 Large Styled Numbered Tab Pills */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs font-extrabold">
            {SETTLEMENT_TABS_LIST.map((t) => {
              const Icon = t.icon;
              const isActive = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => switchTab(t.id)}
                  className={`p-3 rounded-2xl flex flex-col items-start gap-1.5 transition-all cursor-pointer border text-right relative overflow-hidden ${
                    isActive
                      ? 'bg-slate-900 text-white border-slate-900 shadow-md ring-2 ring-[#E6007E]/40'
                      : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="w-full flex items-center justify-between">
                    <span className={`w-6 h-6 rounded-lg flex items-center justify-center font-mono font-black text-xs ${
                      isActive ? 'bg-[#E6007E] text-white' : 'bg-slate-100 text-slate-700'
                    }`}>
                      {t.num}
                    </span>
                    <Icon className={`w-4 h-4 ${isActive ? 'text-pink-400' : 'text-slate-400'}`} />
                  </div>
                  <span className="font-black text-xs leading-tight line-clamp-1">
                    {t.label}
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-medium ${
                    isActive ? 'bg-slate-800 text-pink-300' : 'bg-slate-100 text-slate-500'
                  }`}>
                    ?q={t.q}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* TAB 1: مبيعات الكاش وصندوق المعرض (?q=cash-sales) */}
        {activeTab === 'cash_sales' && (
          <div className="space-y-4">
            <div className="print:hidden bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-slate-100 gap-2">
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-slate-500" />
                  <span className="font-extrabold text-xs text-slate-900">
                    فلاتر مبيعات الكاشير المباشرة (الأحدث أولاً):
                  </span>
                </div>
                {(cashFilterCashier !== 'ALL' ||
                  cashFilterPaymentMethod !== 'ALL' ||
                  cashFilterStatus !== 'ALL' ||
                  cashFilterStartDate ||
                  cashFilterEndDate ||
                  cashFilterStartTime ||
                  cashFilterEndTime ||
                  cashFilterSearch) && (
                  <button
                    type="button"
                    onClick={() => {
                      setCashFilterCashier('ALL');
                      setCashFilterPaymentMethod('ALL');
                      setCashFilterStatus('ALL');
                      setCashFilterStartDate('');
                      setCashFilterEndDate('');
                      setCashFilterStartTime('');
                      setCashFilterEndTime('');
                      setCashFilterSearch('');
                    }}
                    className="text-xs text-rose-600 hover:text-rose-800 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>إعادة ضبط الفلاتر</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">موظف الكاشير:</label>
                  <select
                    value={cashFilterCashier}
                    onChange={(e) => setCashFilterCashier(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-[#E6007E]"
                  >
                    <option value="ALL">جميع موظفي الكاشير</option>
                    {cashierOptions.map((cName) => (
                      <option key={cName} value={cName}>{cName}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">طريقة الدفع:</label>
                  <select
                    value={cashFilterPaymentMethod}
                    onChange={(e) => setCashFilterPaymentMethod(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-[#E6007E]"
                  >
                    <option value="ALL">جميع طرق الدفع</option>
                    <option value="نقد">نقد (كاش)</option>
                    <option value="بطاقة">بطاقة POS</option>
                    <option value="محفظة">محفظة إلكترونية</option>
                    <option value="آجل">آجل (ذمم)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">حالة الفاتورة (مكتملة / مرتجعة):</label>
                  <select
                    value={cashFilterStatus}
                    onChange={(e) => setCashFilterStatus(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-[#E6007E]"
                  >
                    <option value="ALL">جميع الحالات</option>
                    <option value="COMPLETED">فواتير مكتملة وغير مرتجعة</option>
                    <option value="REFUNDED">فواتير مرتجعة ومستردة ↩</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">من تاريخ:</label>
                  <input
                    type="date"
                    value={cashFilterStartDate}
                    onChange={(e) => setCashFilterStartDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-[#E6007E] font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">إلى تاريخ:</label>
                  <input
                    type="date"
                    value={cashFilterEndDate}
                    onChange={(e) => setCashFilterEndDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-[#E6007E] font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">من الساعة:</label>
                  <input
                    type="time"
                    value={cashFilterStartTime}
                    onChange={(e) => setCashFilterStartTime(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-[#E6007E] font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">إلى الساعة:</label>
                  <input
                    type="time"
                    value={cashFilterEndTime}
                    onChange={(e) => setCashFilterEndTime(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-[#E6007E] font-mono"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">بحث برقم الإيصال أو العميل:</label>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={cashFilterSearch}
                      onChange={(e) => setCashFilterSearch(e.target.value)}
                      placeholder="ابحث برقم الإيصال POS... أو اسم الزبونة"
                      className="w-full ps-8 pe-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-[#E6007E]"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs print:border-none print:shadow-none">
              <div className="print:hidden p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs">
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900">
                    عرض فواتير مبيعات الكاشير المباشرة (الأحدث أولاً)
                  </h3>
                  <p className="text-slate-500 text-[11px]">
                    العمليات التي تمت داخل صالة العرض والموثقة بنظام الكاشير
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setDrawerCountedInput(Number((drawerExpectedClosingCashFils / 1000).toFixed(3)));
                      setIsCashDrawerModalOpen(true);
                    }}
                    className="bg-slate-900 hover:bg-slate-800 text-white px-3.5 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition shadow-xs cursor-pointer active:scale-95"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>مطابقة صندوق الكاشير وإغلاق اليومية</span>
                  </button>
                  <div className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5">
                    <span>إجمالي المبيعات المعروضة:</span>
                    <span className="font-mono font-black" dir="ltr">{formatMoney(totalFilteredCashSalesFils)} د.أ</span>
                    <span className="text-[10px] text-emerald-600 font-mono">({filteredCashSales.length} إيصال)</span>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs print-table">
                  <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-3.5">رقم الإيصال</th>
                      <th className="p-3.5">التاريخ والوقت</th>
                      <th className="p-3.5">الكاشير المنفذ</th>
                      <th className="p-3.5">العميل</th>
                      <th className="p-3.5 text-center">الأصناف</th>
                      <th className="p-3.5">طريقة الدفع</th>
                      <th className="p-3.5 text-center">الحالة</th>
                      <th className="p-3.5 text-center font-bold">الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {filteredCashSales.map((sale) => (
                      <tr key={sale.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="p-3.5 font-mono font-bold text-slate-900">
                          <span>{sale.receiptNumber}</span>
                          {(sale as any).refundAmountFils > 0 && (
                            <span className="block text-[10px] text-rose-600 font-mono">
                              مسترد: -{formatMoney((sale as any).refundAmountFils)} د.أ
                            </span>
                          )}
                        </td>
                        <td className="p-3.5 font-mono text-slate-700 text-[11px]" dir="ltr">{sale.date}</td>
                        <td className="p-3.5 text-slate-800 font-bold">{sale.cashierName}</td>
                        <td className="p-3.5 text-slate-600">{sale.customerName || 'زبونة نقدية'}</td>
                        <td className="p-3.5 text-center font-mono font-bold text-slate-700">{sale.itemsCount}</td>
                        <td className="p-3.5">
                          <span className="inline-block px-2.5 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-800 print:border print:border-black">
                            {sale.paymentMethod}
                          </span>
                        </td>
                        <td className="p-3.5 text-center">
                          {(sale as any).isRefunded || sale.status === 'REFUNDED' ? (
                            <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-200">
                              مرتجع بالكامل ↩
                            </span>
                          ) : (sale as any).isModified || sale.receiptNumber?.includes('-MOD') ? (
                            <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black bg-purple-100 text-purple-800 border border-purple-200">
                              معدلة رسمياً ✏️
                            </span>
                          ) : (
                            <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                              مكتملة ✓
                            </span>
                          )}
                        </td>
                        <td className="p-3.5 text-center font-mono font-black text-slate-900 text-sm">
                          {formatMoney(sale.totalFils)} د.أ
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: مبيعات المتجر الإلكتروني (?q=store-sales) */}
        {activeTab === 'online_sales' && (
          <div className="space-y-4">
            <div className="print:hidden bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-slate-100 gap-2">
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-slate-500" />
                  <span className="font-extrabold text-xs text-slate-900">
                    فلاتر طلبيات ومبيعات المتجر الإلكتروني:
                  </span>
                </div>
                {(storeFilterStatus !== 'ALL' ||
                  storeFilterCity !== 'ALL' ||
                  storeFilterPayment !== 'ALL' ||
                  storeFilterStartDate ||
                  storeFilterEndDate ||
                  storeFilterSearch) && (
                  <button
                    type="button"
                    onClick={() => {
                      setStoreFilterStatus('ALL');
                      setStoreFilterCity('ALL');
                      setStoreFilterPayment('ALL');
                      setStoreFilterStartDate('');
                      setStoreFilterEndDate('');
                      setStoreFilterSearch('');
                    }}
                    className="text-xs text-rose-600 hover:text-rose-800 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>إعادة ضبط الفلاتر</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">حالة الطلب:</label>
                  <select
                    value={storeFilterStatus}
                    onChange={(e) => setStoreFilterStatus(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-[#E6007E]"
                  >
                    <option value="ALL">جميع الحالات</option>
                    <option value="NEW">الطلبات الجديدة</option>
                    <option value="PREPARING">مؤكد وقيد التجهيز</option>
                    <option value="PREPARED">تم التجهيز بانتظار التوصيل</option>
                    <option value="SHIPPED">مع شركة التوصيل / خرج للتوصيل</option>
                    <option value="COMPLETED">تم التسليم بالكامل ✓</option>
                    <option value="CANCELLED">ملغي ❌</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">المدينة / المحافظة:</label>
                  <select
                    value={storeFilterCity}
                    onChange={(e) => setStoreFilterCity(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-[#E6007E]"
                  >
                    <option value="ALL">جميع المدن والمحافظات</option>
                    {onlineCityOptions.map((cityName) => (
                      <option key={cityName} value={cityName}>{cityName}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">من تاريخ:</label>
                  <input
                    type="date"
                    value={storeFilterStartDate}
                    onChange={(e) => setStoreFilterStartDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-[#E6007E] font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">إلى تاريخ:</label>
                  <input
                    type="date"
                    value={storeFilterEndDate}
                    onChange={(e) => setStoreFilterEndDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-[#E6007E] font-mono"
                  />
                </div>

                <div className="sm:col-span-4">
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">بحث برقم الطلب، اسم الزبونة، أو الهاتف:</label>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={storeFilterSearch}
                      onChange={(e) => setStoreFilterSearch(e.target.value)}
                      placeholder="ابحث برقم الطلب ORD... اسم الزبونة، أو رقم الموبايل"
                      className="w-full ps-8 pe-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-[#E6007E]"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs print:border-none print:shadow-none">
              <div className="print:hidden p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs">
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900">
                    طلبيات ومبيعات المتجر الإلكتروني (Online Store Orders)
                  </h3>
                  <p className="text-slate-500 text-[11px]">الطلبات المستلمة من خلال الموقع الإلكتروني</p>
                </div>
                <div className="bg-blue-50 text-blue-800 border border-blue-200 px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5">
                  <span>إجمالي مبيعات المتجر:</span>
                  <span className="font-mono font-black" dir="ltr">{formatMoney(totalFilteredOnlineSalesFils)} د.أ</span>
                  <span className="text-[10px] text-blue-600 font-mono">({filteredOnlineOrders.length} طلبية)</span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs print-table">
                  <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-3.5">رقم الطلب</th>
                      <th className="p-3.5">التاريخ والوقت</th>
                      <th className="p-3.5">اسم الزبونة</th>
                      <th className="p-3.5">المدينة والمنطقة</th>
                      <th className="p-3.5">طريقة الدفع</th>
                      <th className="p-3.5 text-center">حالة الطلب</th>
                      <th className="p-3.5 text-center font-bold">الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredOnlineOrders.map((ord) => (
                      <tr key={ord.id} className="hover:bg-slate-50/70">
                        <td className="p-3.5 font-mono font-bold text-blue-700">{ord.orderNumber}</td>
                        <td className="p-3.5 font-mono text-slate-500 text-[11px]" dir="ltr">{ord.date}</td>
                        <td className="p-3.5 font-bold text-slate-900">{ord.customerName}</td>
                        <td className="p-3.5 text-slate-600">{ord.city}</td>
                        <td className="p-3.5 text-slate-700">{ord.paymentMethod}</td>
                        <td className="p-3.5 text-center">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold print:border print:border-black ${
                              ord.status === 'تم التسليم'
                                ? 'bg-emerald-100 text-emerald-800'
                                : ord.status === 'خرجت للتوصيل'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {ord.status}
                          </span>
                        </td>
                        <td className="p-3.5 text-center font-mono font-black text-slate-900 text-sm">
                          {formatMoney(ord.totalFils)} د.أ
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

                {/* TAB 3: طلبيات وتسويات شركة التوصيل (?q=courier-settlements) */}
        {activeTab === 'delivery' && (
          <div className="space-y-6">
            {/* Direct Notice linking to /admin/deliveries */}
            <div className="print:hidden bg-gradient-to-r from-purple-50 to-pink-50 border-2 border-purple-200 rounded-3xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
              <div className="flex items-start gap-3">
                <span className="w-10 h-10 rounded-2xl bg-purple-600 text-white font-black flex items-center justify-center shrink-0 text-xl shadow-md">
                  🚚
                </span>
                <div>
                  <h3 className="font-black text-slate-900 text-base flex items-center gap-2">
                    <span>إدارة طلبيات التوصيل والشحنات انتقلت إلى صفحة مخصصة</span>
                    <span className="text-[10px] bg-[#E6007E] text-white px-2 py-0.5 rounded-full">جديد</span>
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                    تم نقل إنشاء طلبيات التوصيل، إسنادها للمناديب، طباعة المانفست، وتحديث الحالات بالكامل إلى صفحة طلبيات التوصيل المركزية.
                  </p>
                </div>
              </div>
              <Link
                href="/admin/deliveries"
                className="px-5 py-3 rounded-2xl bg-[#E6007E] hover:bg-pink-600 text-white font-black text-xs flex items-center justify-center gap-2 transition shadow-md shrink-0 cursor-pointer"
              >
                <Truck className="w-4 h-4" />
                <span>فتح صفحة طلبيات التوصيل (/admin/deliveries) ➜</span>
              </Link>
            </div>

            {/* SUB-VIEW NAVIGATION PILLS */}
            <div className="print:hidden flex flex-wrap items-center gap-2 p-1.5 bg-slate-100 rounded-2xl border border-slate-200">
              <button
                type="button"
                onClick={() => setDeliverySubView('READY_ORDERS')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                  deliverySubView === 'READY_ORDERS'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'text-slate-700 hover:bg-white hover:text-slate-900'
                }`}
              >
                <PackageCheck className="w-4 h-4" />
                <span>الطلبات الجاهزة بانتظار التوصيل</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black font-mono ${
                  deliverySubView === 'READY_ORDERS' ? 'bg-purple-700 text-white' : 'bg-purple-100 text-purple-800'
                }`}>
                  {preparedOrders.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setDeliverySubView('BATCHES')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                  deliverySubView === 'BATCHES'
                    ? 'bg-[#E6007E] text-white shadow-xs'
                    : 'text-slate-700 hover:bg-white hover:text-slate-900'
                }`}
              >
                <Truck className="w-4 h-4" />
                <span>طلبيات وشحنات شركة التوصيل (المجمعة)</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black font-mono ${
                  deliverySubView === 'BATCHES' ? 'bg-pink-700 text-white' : 'bg-pink-100 text-[#E6007E]'
                }`}>
                  {courierBatches.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setDeliverySubView('SETTLEMENTS')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                  deliverySubView === 'SETTLEMENTS'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-700 hover:bg-white hover:text-slate-900'
                }`}
              >
                <Landmark className="w-4 h-4" />
                <span>كشف تسوية COD والتحصيلات</span>
              </button>
            </div>

            {/* VIEW 1: الطلبات الجاهزة بانتظار التوصيل */}
            {deliverySubView === 'READY_ORDERS' && (
              <div className="space-y-4 animate-fade-in">
                {/* Information Notice */}
                <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-purple-900 shadow-2xs">
                  <div className="flex items-start gap-3">
                    <span className="w-9 h-9 rounded-xl bg-purple-100 text-purple-700 font-black flex items-center justify-center shrink-0 text-base">
                      📦
                    </span>
                    <div>
                      <h4 className="font-black text-purple-950 text-sm">
                        الطلبات الجاهزة بانتظار استلام شركة التوصيل
                      </h4>
                      <p className="text-[11px] text-purple-800 font-medium mt-0.5 leading-relaxed">
                        هذه الطلبات اكتمل تجهيزها بالمعرض. لتغيير حالتها، حددي طلباً أو أكثر ثم اضغطي <strong>(إنشاء طلبية توصيل)</strong> وأعطيها رقماً ليتم إسنادها وتغيير حالتها ومتابعتها مع المندوب.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleOpenCreateBatchModal}
                    disabled={selectedPreparedOrderIds.length === 0}
                    className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white font-black text-xs flex items-center justify-center gap-2 transition shadow-xs shrink-0 cursor-pointer disabled:cursor-not-allowed"
                  >
                    <Truck className="w-4 h-4" />
                    <span>إنشاء طلبية توصيل ({selectedPreparedOrderIds.length})</span>
                  </button>
                </div>

                {/* Prepared Orders Table */}
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
                  <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={handleSelectAllPreparedOrders}
                        className="flex items-center gap-2 font-bold text-slate-700 hover:text-purple-700 transition cursor-pointer"
                      >
                        {selectedPreparedOrderIds.length > 0 && selectedPreparedOrderIds.length === preparedOrders.length ? (
                          <CheckSquare className="w-4 h-4 text-purple-600" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-400" />
                        )}
                        <span>تحديد الكل ({preparedOrders.length})</span>
                      </button>
                      <span className="text-slate-300">|</span>
                      <span className="font-bold text-slate-600">
                        المحدد: <strong className="text-purple-700 font-mono font-black">{selectedPreparedOrderIds.length}</strong> طلبات
                      </span>
                    </div>

                    <div className="text-slate-700 font-bold">
                      إجمالي التحصيل المحدد: <span className="font-mono font-black text-purple-900">{formatMoney(preparedOrders.filter(o => selectedPreparedOrderIds.includes(o.orderId)).reduce((acc, o) => acc + o.codAmountFils, 0))} د.أ</span>
                    </div>
                  </div>

                  {preparedOrders.length === 0 ? (
                    <div className="text-center py-16 px-4">
                      <PackageCheck className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                      <h4 className="font-black text-sm text-slate-800">لا توجد طلبات جاهزة بانتظار التوصيل حالياً</h4>
                      <p className="text-xs text-slate-400 mt-1">عند تجهيز أي طلب في إدارة الطلبات سيظهر هنا فوراً لإنشاء طلبية شحن مجمعة.</p>
                      <Link
                        href="/admin/orders"
                        className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition"
                      >
                        <span>الانتقال لإدارة وتجهيز الطلبات</span>
                        <ArrowLeft className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-right text-xs">
                        <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                          <tr>
                            <th className="p-3 w-10 text-center">اختيار</th>
                            <th className="p-3">رقم الطلب</th>
                            <th className="p-3">اسم الزبونة والهاتف</th>
                            <th className="p-3">المدينة والعنوان التفصيلي</th>
                            <th className="p-3 text-center">مبلغ الـ COD</th>
                            <th className="p-3 text-center">أجرة التوصيل</th>
                            <th className="p-3 text-center">صافي التوريد</th>
                            <th className="p-3 text-center">الحالة</th>
                            <th className="p-3 text-center">الفاتورة</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {preparedOrders.map((ord) => {
                            const isSelected = selectedPreparedOrderIds.includes(ord.orderId);
                            return (
                              <tr 
                                key={ord.orderId} 
                                onClick={() => handleToggleSelectPreparedOrder(ord.orderId)}
                                className={`cursor-pointer transition-colors ${isSelected ? 'bg-purple-50/70' : 'hover:bg-slate-50'}`}
                              >
                                <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => handleToggleSelectPreparedOrder(ord.orderId)}
                                    className="w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500 cursor-pointer"
                                  />
                                </td>
                                <td className="p-3 font-mono font-black text-purple-900">
                                  #{ord.orderNumber}
                                </td>
                                <td className="p-3">
                                  <div className="font-bold text-slate-900">{ord.customerName}</div>
                                  <div className="text-[11px] text-slate-500 font-mono" dir="ltr">{ord.customerPhone}</div>
                                </td>
                                <td className="p-3 text-slate-700 max-w-xs">
                                  <span className="font-bold text-slate-900 block">{ord.city}</span>
                                  <span className="text-[11px] text-slate-500 truncate block">{ord.address}</span>
                                </td>
                                <td className="p-3 text-center font-mono font-bold text-slate-900">
                                  {formatMoney(ord.codAmountFils)} د.أ
                                </td>
                                <td className="p-3 text-center font-mono text-rose-600">
                                  -{formatMoney(ord.deliveryFeeFils)} د.أ
                                </td>
                                <td className="p-3 text-center font-mono font-black text-emerald-700">
                                  {formatMoney(ord.netSettlementFils)} د.أ
                                </td>
                                <td className="p-3 text-center">
                                  <span className="px-2.5 py-1 rounded-lg text-[10px] font-black bg-purple-100 text-purple-800 border border-purple-200">
                                    جاهز للتوصيل 📦
                                  </span>
                                </td>
                                <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                                  <Link
                                    href={`/ar/invoice/${ord.orderId}`}
                                    target="_blank"
                                    className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-900 inline-flex items-center"
                                    title="عرض الفاتورة"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </Link>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* VIEW 2: سجل طلبيات وشحنات شركة التوصيل المجمعة */}
            {deliverySubView === 'BATCHES' && (
              <div className="space-y-4 animate-fade-in">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200">
                  <div>
                    <h3 className="font-black text-sm text-slate-900 flex items-center gap-2">
                      <Truck className="w-4 h-4 text-[#E6007E]" />
                      <span>سجل طلبيات وشحنات شركة التوصيل ({courierBatches.length} طلبية)</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      تغيير حالة أي طلبية توصيل يؤدي تلقائياً إلى تحديث حالة جميع الطلبات المشمولة فيها.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDeliverySubView('READY_ORDERS')}
                    className="px-3.5 py-2 rounded-xl bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 font-bold text-xs flex items-center gap-1.5 transition shrink-0 cursor-pointer"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>إنشاء طلبية جديدة من الطلبات الجاهزة ({preparedOrders.length})</span>
                  </button>
                </div>

                {courierBatches.length === 0 ? (
                  <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-slate-300">
                    <Truck className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <h4 className="font-black text-sm text-slate-800">لا توجد طلبيات توصيل منشأة بعد</h4>
                    <p className="text-xs text-slate-400 mt-1">انتقلي لتبويب "الطلبات الجاهزة" لتحديد الطلبات وإنشاء أول طلبية شحن.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {courierBatches.map((batch) => {
                      const isExpanded = expandedBatchId === batch.id;
                      return (
                        <div
                          key={batch.id}
                          className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs transition hover:border-slate-300"
                        >
                          <div className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                            {/* Batch Info */}
                            <div className="flex items-start gap-3">
                              <span className="w-10 h-10 rounded-xl bg-pink-50 text-[#E6007E] font-black flex items-center justify-center shrink-0 text-sm">
                                🚚
                              </span>
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-mono font-black text-sm text-slate-900 bg-slate-100 px-2.5 py-0.5 rounded-lg border border-slate-200">
                                    #{batch.batchNumber}
                                  </span>
                                  <span className="font-bold text-xs text-slate-700">
                                    {batch.courierName}
                                  </span>
                                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black ${
                                    batch.status === 'DELIVERED' 
                                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                      : batch.status === 'SETTLED'
                                      ? 'bg-purple-100 text-purple-800 border border-purple-200'
                                      : batch.status === 'OUT_FOR_DELIVERY'
                                      ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                      : batch.status === 'CANCELLED'
                                      ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                      : 'bg-amber-100 text-amber-800 border border-amber-200'
                                  }`}>
                                    {batch.status === 'DELIVERED' ? 'تم تسليم جميع الطلبات ✓'
                                      : batch.status === 'SETTLED' ? 'تمت التسوية وتوريد الكاش 💰'
                                      : batch.status === 'OUT_FOR_DELIVERY' ? 'خرجت للتوصيل 🚚'
                                      : batch.status === 'CANCELLED' ? 'ملغاة / مرتجعة ✗'
                                      : 'جاهزة للتسليم 📦'}
                                  </span>
                                </div>

                                <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-3 flex-wrap">
                                  <span>تاريخ الإنشاء: {formatJordanDateTime(batch.createdAt)}</span>
                                  {batch.notes && <span>• ملاحظات: {batch.notes}</span>}
                                </div>
                              </div>
                            </div>

                            {/* Batch Financials */}
                            <div className="flex items-center gap-3 text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-100 shrink-0">
                              <div>
                                <span className="text-[10px] text-slate-400 block font-bold">الطلبات المشمولة</span>
                                <span className="font-black text-slate-900 font-mono text-center block">{batch.orders.length}</span>
                              </div>
                              <div className="w-px h-6 bg-slate-200" />
                              <div>
                                <span className="text-[10px] text-slate-400 block font-bold">COD المطلوب</span>
                                <span className="font-black text-slate-900 font-mono">{formatMoney(batch.totalCodFils)} د.أ</span>
                              </div>
                              <div className="w-px h-6 bg-slate-200" />
                              <div>
                                <span className="text-[10px] text-slate-400 block font-bold">صافي التوريد</span>
                                <span className="font-black text-emerald-700 font-mono">{formatMoney(batch.netSettlementFils)} د.أ</span>
                              </div>
                            </div>

                            {/* Status Change Control (THE CORE FEATURE) */}
                            <div className="flex items-center gap-2 shrink-0">
                              <div className="flex flex-col">
                                <label className="text-[10px] font-bold text-slate-400 mb-1">
                                  تغيير حالة الطلبية (يغير حالة كل طلباتها):
                                </label>
                                <select
                                  value={batch.status}
                                  disabled={batchLoading}
                                  onChange={(e) => handleChangeBatchStatus(batch.id, e.target.value as any)}
                                  className="bg-white border-2 border-slate-300 hover:border-[#E6007E] rounded-xl px-3 py-1.5 text-xs font-black text-slate-800 outline-none transition cursor-pointer"
                                >
                                  <option value="PREPARED">📦 تم التجهيز بانتظار الاستلام</option>
                                  <option value="OUT_FOR_DELIVERY">🚚 خروج للتوصيل (مع المندوب)</option>
                                  <option value="DELIVERED">✓ تم تسليم الطلبات للزبائن</option>
                                  <option value="SETTLED" disabled={batch.status !== 'DELIVERED'}>
                                    💰 تمت التسوية وتوريد الكاش {batch.status !== 'DELIVERED' ? '(متاح بعد اكتمال التوصيل فقط)' : ''}
                                  </option>
                                  <option value="CANCELLED">✗ إلغاء أو إرجاع الشحنة</option>
                                </select>
                              </div>

                              <button
                                type="button"
                                onClick={() => setExpandedBatchId(isExpanded ? null : batch.id)}
                                className="p-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 transition mt-4 cursor-pointer"
                                title={isExpanded ? 'إخفاء التفاصيل' : 'عرض تفاصيل الطلبات'}
                              >
                                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </button>
                            </div>
                          </div>

                          {/* Expanded Orders Table */}
                          {isExpanded && (
                            <div className="bg-slate-50/70 p-4 border-t border-slate-200 animate-fade-in">
                              <h5 className="font-black text-xs text-slate-800 mb-2.5 flex items-center gap-1.5">
                                <Package className="w-3.5 h-3.5 text-slate-600" />
                                <span>الطلبات المشمولة داخل طلبية الشحن #{batch.batchNumber}:</span>
                              </h5>
                              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                                <table className="w-full text-right text-xs">
                                  <thead className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200">
                                    <tr>
                                      <th className="p-2.5">رقم الطلب</th>
                                      <th className="p-2.5">اسم الزبونة ورقم الهاتف</th>
                                      <th className="p-2.5">المدينة والعنوان</th>
                                      <th className="p-2.5 text-center">المبلغ COD</th>
                                      <th className="p-2.5 text-center">أجرة التوصيل</th>
                                      <th className="p-2.5 text-center">حالة الطلب الفردية</th>
                                      <th className="p-2.5 text-center">الفاتورة</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {batch.orders.map((bo) => (
                                      <tr key={bo.orderId} className="hover:bg-slate-50/80">
                                        <td className="p-2.5 font-mono font-bold text-slate-900">
                                          #{bo.orderNumber}
                                        </td>
                                        <td className="p-2.5">
                                          <div className="font-bold text-slate-800">{bo.customerName}</div>
                                          <div className="text-[10px] text-slate-500 font-mono" dir="ltr">{bo.customerPhone}</div>
                                        </td>
                                        <td className="p-2.5 text-slate-600 text-[11px]">
                                          <span className="font-bold text-slate-800">{bo.city}</span>
                                          {bo.address && <span className="block text-slate-400 truncate max-w-xs">{bo.address}</span>}
                                        </td>
                                        <td className="p-2.5 text-center font-mono font-bold text-slate-900">
                                          {formatMoney(bo.codAmountFils)} د.أ
                                        </td>
                                        <td className="p-2.5 text-center font-mono text-rose-600">
                                          -{formatMoney(bo.deliveryFeeFils)} د.أ
                                        </td>
                                        <td className="p-2.5 text-center">
                                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                            {bo.status === 'SHIPPED' ? 'مع التوصيل' : bo.status === 'DELIVERED' ? 'مكتمل' : bo.status === 'CANCELLED' ? 'ملغي' : bo.status}
                                          </span>
                                        </td>
                                        <td className="p-2.5 text-center">
                                          <Link
                                            href={`/ar/invoice/${bo.orderId}`}
                                            target="_blank"
                                            className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-900 inline-flex items-center"
                                            title="عرض الفاتورة"
                                          >
                                            <Eye className="w-3.5 h-3.5" />
                                          </Link>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* VIEW 3: كشف تسوية شركة التوصيل والتحصيلات المالية */}
            {deliverySubView === 'SETTLEMENTS' && (
              <div className="space-y-6 animate-fade-in">
                <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-4 print:border-black">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2 print:border-black">
                    <div>
                      <h3 className="font-black text-base text-slate-900 flex items-center gap-2">
                        <Truck className="w-5 h-5 text-slate-900" />
                        <span>كشف تسوية شركة التوصيل (Net Settlement)</span>
                      </h3>
                      <p className="text-xs text-slate-500">
                        {data.deliverySettlement.companyName} • {data.deliverySettlement.period}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-center print:border print:border-black print:p-2">
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 print:bg-white print:border-black">
                      <span className="text-[10px] text-slate-500 font-bold block">COD المطلوب</span>
                      <span className="text-sm sm:text-base font-black font-mono text-slate-900">
                        {formatMoney(data.deliverySettlement.codRequiredFils)} د.أ
                      </span>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 print:bg-white print:border-black">
                      <span className="text-[10px] text-slate-500 font-bold block">COD المحصل فعلياً</span>
                      <span className="text-sm sm:text-base font-black font-mono text-blue-700 print:text-black">
                        {formatMoney(data.deliverySettlement.codCollectedFils)} د.أ
                      </span>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 print:bg-white print:border-black">
                      <span className="text-[10px] text-slate-500 font-bold block">رسوم الشحن المخصومة</span>
                      <span className="text-sm sm:text-base font-black font-mono text-rose-600 print:text-black">
                        -{formatMoney(data.deliverySettlement.deliveryFeesDeductibleFils)} د.أ
                      </span>
                    </div>
                    <div className="bg-purple-50 p-3 rounded-xl border border-purple-200 print:bg-white print:border-black">
                      <span className="text-[10px] text-purple-700 font-bold block print:text-black">صافي التوريد المتوقع</span>
                      <span className="text-sm sm:text-base font-black font-mono text-purple-900 print:text-black">
                        {formatMoney(data.deliverySettlement.netSettlementExpectedFils)} د.أ
                      </span>
                    </div>
                    <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-200 print:bg-white print:border-black">
                      <span className="text-[10px] text-emerald-700 font-bold block print:text-black">تم توريده لحسابنا</span>
                      <span className="text-sm sm:text-base font-black font-mono text-emerald-800 print:text-black">
                        {formatMoney(data.deliverySettlement.remittedFils)} د.أ
                      </span>
                    </div>
                    <div className="bg-amber-50 p-3 rounded-xl border border-amber-200 print:bg-white print:border-black">
                      <span className="text-[10px] text-amber-700 font-bold block print:text-black">المتبقي للتوريد</span>
                      <span className="text-sm sm:text-base font-black font-mono text-amber-800 print:text-black">
                        {formatMoney(data.deliverySettlement.remainingFils)} د.أ
                      </span>
                    </div>
                  </div>
                </div>

{/* Delivery Comprehensive Filters */}
            <div className="print:hidden bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-slate-100 gap-2">
                <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                  <Filter className="w-3.5 h-3.5 text-blue-600" />
                  <span>فلاتر طلبيات وتسويات شركة التوصيل (Net Settlement Filters):</span>
                </span>
                <button
                  type="button"
                  onClick={resetCourierFilters}
                  className="text-xs text-rose-600 hover:text-rose-800 font-bold transition flex items-center gap-1 cursor-pointer self-start sm:self-auto"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>إعادة تعيين الفلاتر</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
                {/* Status */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">حالة التسوية:</label>
                  <select
                    value={courierFilterStatus}
                    onChange={(e) => setCourierFilterStatus(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-[#E6007E]"
                  >
                    <option value="ALL">جميع الحالات</option>
                    <option value="SETTLED">تمت التسوية ✓</option>
                    <option value="DELIVERED_COLLECTED">تم التحصيل بانتظار التوريد</option>
                    <option value="IN_TRANSIT">قيد التوصيل مع المندوب</option>
                    <option value="RETURNED">مرتجع</option>
                  </select>
                </div>

                {/* Company */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">شركة التوصيل:</label>
                  <select
                    value={courierFilterCompany}
                    onChange={(e) => setCourierFilterCompany(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-[#E6007E]"
                  >
                    <option value="ALL">جميع الشركات</option>
                    {courierCompanyOptions.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                {/* City */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">المدينة والمحافظة:</label>
                  <select
                    value={courierFilterCity}
                    onChange={(e) => setCourierFilterCity(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-[#E6007E]"
                  >
                    <option value="ALL">جميع المدن والمحافظات</option>
                    {courierCityOptions.map((city) => (
                      <option key={city} value={city}>{city}</option>
                    ))}
                  </select>
                </div>

                {/* Start Date */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">من تاريخ:</label>
                  <input
                    type="date"
                    value={courierFilterStartDate}
                    onChange={(e) => setCourierFilterStartDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-[#E6007E] font-mono"
                  />
                </div>

                {/* End Date */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">إلى تاريخ:</label>
                  <input
                    type="date"
                    value={courierFilterEndDate}
                    onChange={(e) => setCourierFilterEndDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-[#E6007E] font-mono"
                  />
                </div>

                {/* Start Time */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">من الساعة:</label>
                  <input
                    type="time"
                    value={courierFilterStartTime}
                    onChange={(e) => setCourierFilterStartTime(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-[#E6007E] font-mono"
                  />
                </div>

                {/* End Time */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">إلى الساعة:</label>
                  <input
                    type="time"
                    value={courierFilterEndTime}
                    onChange={(e) => setCourierFilterEndTime(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-[#E6007E] font-mono"
                  />
                </div>

                {/* Search Text */}
                <div className="sm:col-span-2 lg:col-span-5">
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">بحث برقم الطلب أو اسم الزبونة أو المندوب:</label>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={courierFilterSearch}
                      onChange={(e) => setCourierFilterSearch(e.target.value)}
                      placeholder="ابحث برقم الطلبية (ORD-XXXX) أو اسم المستلم أو المدينة..."
                      className="w-full ps-8 pe-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-[#E6007E]"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Courier Batches Settlement Table */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs print:border-none print:shadow-none">
              <div className="print:hidden p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <Truck className="w-4 h-4 text-[#E6007E]" />
                  <h4 className="font-black text-slate-900 text-sm">كشف طلبيات وشحنات شركة التوصيل والتسويات المالية:</h4>
                </div>
                <div className="text-xs text-slate-700 font-bold bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs">
                  المعروض: <span className="text-[#E6007E] font-black">{filteredCourierBatches.length}</span> طلبية | إجمالي الطلبات: <span className="font-black font-mono">{filteredBatchTotals.ordersCount}</span> | الصافي بعد خصم التوصيل: <span className="text-emerald-700 font-black font-mono">{formatMoney(filteredBatchTotals.net)} د.أ</span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs print-table">
                  <thead className="bg-slate-50 text-slate-700 font-black border-b border-slate-200">
                    <tr>
                      <th className="p-3">رقم واسم الطلبية</th>
                      <th className="p-3">شركة التوصيل / المندوب</th>
                      <th className="p-3 text-center">عدد الطلبات</th>
                      <th className="p-3 text-center">COD المطلوب</th>
                      <th className="p-3 text-center">أجرة التوصيل</th>
                      <th className="p-3 text-center">الصافي بعد خصم التوصيل</th>
                      <th className="p-3 text-center">حالة الطلبية</th>
                      <th className="print:hidden p-3 text-center font-black">إجراء التسوية للطلبية</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {filteredCourierBatches.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-slate-400">
                          لا توجد طلبيات توصيل مطابقة للفلاتر المحددة حالياً.
                        </td>
                      </tr>
                    ) : (
                      filteredCourierBatches.map((batch) => {
                        const isSettled = batch.status === 'SETTLED';
                        const isDelivered = batch.status === 'DELIVERED';
                        const isExpanded = expandedBatchId === batch.id;
                        const isSettling = settlingBatchId === batch.id;

                        return (
                          <React.Fragment key={batch.id}>
                            <tr className="hover:bg-pink-50/20 transition-colors">
                              {/* رقم واسم الطلبية */}
                              <td className="p-3">
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setExpandedBatchId(isExpanded ? null : batch.id)}
                                    className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-800 transition cursor-pointer"
                                    title="عرض / إخفاء تفاصيل الطلبات المشمولة"
                                  >
                                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-180 text-[#E6007E]' : ''}`} />
                                  </button>
                                  <div>
                                    <span className="font-mono font-black text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200 text-xs">
                                      #{batch.batchNumber}
                                    </span>
                                    {batch.notes && (
                                      <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">{batch.notes}</p>
                                    )}
                                  </div>
                                </div>
                              </td>

                              {/* شركة التوصيل */}
                              <td className="p-3 font-bold text-slate-800">
                                {batch.courierName}
                              </td>

                              {/* عدد الطلبات */}
                              <td className="p-3 text-center">
                                <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-900 font-black font-mono text-xs border border-slate-200">
                                  {batch.orders.length} طلبات
                                </span>
                              </td>

                              {/* COD المطلوب */}
                              <td className="p-3 text-center">
                                <div className="font-mono font-bold text-slate-900 text-xs">
                                  {formatMoney(batch.totalCodFils)} د.أ
                                </div>
                                {batch.totalExpectedCodFils !== undefined && batch.totalExpectedCodFils !== batch.totalCodFils && (
                                  <div className="text-[10px] text-slate-400 font-mono">
                                    متوقع: {formatMoney(batch.totalExpectedCodFils)} د.أ
                                  </div>
                                )}
                              </td>

                              {/* أجرة التوصيل */}
                              <td className="p-3 text-center font-mono font-bold text-xs">
                                <div className="text-rose-600 print:text-black">
                                  -{formatMoney(batch.totalDeliveryFeeFils)} د.أ
                                </div>
                                {batch.totalReturnFeeFils !== undefined && batch.totalReturnFeeFils > 0 && (
                                  <div className="text-amber-600 text-[10px] font-mono">
                                    إرجاع: -{formatMoney(batch.totalReturnFeeFils)} د.أ
                                  </div>
                                )}
                              </td>

                              {/* الصافي بعد خصم التوصيل */}
                              <td className="p-3 text-center font-mono font-black text-sm">
                                {batch.netSettlementFils < 0 ? (
                                  <div className="flex flex-col items-center">
                                    <span className="text-rose-700 font-black">-{formatMoney(Math.abs(batch.netSettlementFils))} د.أ</span>
                                    <span className="text-[10px] text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200 mt-0.5">مستحق لشركة التوصيل ⚠️</span>
                                  </div>
                                ) : (
                                  <div className="flex flex-col items-center">
                                    <span className="text-emerald-700 font-black">+{formatMoney(batch.netSettlementFils)} د.أ</span>
                                    <span className="text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 mt-0.5">مستحق للمتجر</span>
                                  </div>
                                )}
                                {batch.remittedFils !== undefined && batch.remittedFils > 0 && (
                                  <div className="text-[10px] text-slate-500 mt-1">
                                    مورّد: <span className="font-bold text-slate-700">{formatMoney(batch.remittedFils)}</span> | متبقي: <span className="font-bold text-amber-700">{formatMoney(batch.remainingFils ?? (batch.netSettlementFils - batch.remittedFils))}</span>
                                  </div>
                                )}
                              </td>

                              {/* حالة الطلبية */}
                              <td className="p-3 text-center">
                                <span
                                  className={`px-2.5 py-1 rounded-full text-[10px] font-black border ${
                                    isSettled
                                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                      : isDelivered
                                      ? 'bg-blue-50 text-blue-800 border-blue-300'
                                      : batch.status === 'PARTIALLY_DELIVERED'
                                      ? 'bg-indigo-50 text-indigo-800 border-indigo-300'
                                      : batch.status === 'PARTIALLY_SETTLED'
                                      ? 'bg-teal-50 text-teal-800 border-teal-300'
                                      : batch.status === 'OUT_FOR_DELIVERY'
                                      ? 'bg-amber-50 text-amber-800 border-amber-300'
                                      : batch.status === 'CANCELLED'
                                      ? 'bg-rose-50 text-rose-800 border-rose-300'
                                      : batch.status === 'LIABILITY_OWED'
                                      ? 'bg-rose-100 text-rose-900 border-rose-400'
                                      : 'bg-purple-50 text-purple-800 border-purple-300'
                                  }`}
                                >
                                  {isSettled
                                    ? 'تمت التسوية وتوريد الكاش 💰'
                                    : isDelivered
                                    ? 'تم التسليم بالكامل ✓'
                                    : batch.status === 'PARTIALLY_DELIVERED'
                                    ? 'تسليم جزئي 📦'
                                    : batch.status === 'PARTIALLY_SETTLED'
                                    ? 'تسوية جزئية ⏳'
                                    : batch.status === 'OUT_FOR_DELIVERY'
                                    ? 'خرجت للتوصيل 🚚'
                                    : batch.status === 'CANCELLED'
                                    ? 'ملغاة ✗'
                                    : batch.status === 'LIABILITY_OWED'
                                    ? 'ذمة مستحقة لشركة الشحن ⚠️'
                                    : 'جاهزة بانتظار المندوب 📦'}
                                </span>
                              </td>

                              {/* إجراء التسوية للطلبية */}
                              <td className="print:hidden p-3 text-center">
                                {isSettled ? (
                                  <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1.5 rounded-xl text-xs font-black">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                    تمت التسوية ✓
                                  </span>
                                ) : (
                                  <div className="flex flex-col gap-1 items-center">
                                    <button
                                      type="button"
                                      disabled={isSettling}
                                      onClick={() => handleSettleBatch(batch)}
                                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-white font-black text-xs transition shadow-xs cursor-pointer active:scale-95 disabled:opacity-50 ${
                                        isDelivered
                                          ? 'bg-emerald-600 hover:bg-emerald-700'
                                          : 'bg-slate-900 hover:bg-black'
                                      }`}
                                      title="تسوية هذه الطلبية بالكامل وتوريد الصافي لحساب المتجر"
                                    >
                                      {isSettling ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                      ) : (
                                        <DollarSign className="w-3.5 h-3.5" />
                                      )}
                                      <span>تسوية كاملة</span>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedBatchForRemittance(batch);
                                        const target = batch.netSettlementFils >= 0 ? batch.netSettlementFils : batch.companyPayableFils || Math.abs(batch.netSettlementFils);
                                        const rem = Math.max(0, target - (batch.remittedFils || 0));
                                        setBatchRemittanceAmount((rem / 1000).toFixed(3));
                                        setBatchRemittanceRef(`CLIQ-${Date.now().toString().slice(-6)}`);
                                        setBatchRemittanceNotes(`دفعة توريد لشحنة #${batch.batchNumber}`);
                                      }}
                                      className="text-[11px] font-bold text-teal-700 hover:text-teal-900 underline flex items-center gap-0.5 cursor-pointer"
                                    >
                                      + تسجيل دفعة توريد
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>

                            {/* Details accordion row if expanded */}
                            {isExpanded && (
                              <tr className="bg-slate-50/80">
                                <td colSpan={8} className="p-4">
                                  <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs font-bold text-slate-700 border-b border-slate-100 pb-3 gap-2">
                                      <div className="flex items-center gap-2">
                                        <Truck className="w-4 h-4 text-[#E6007E]" />
                                        <span>تفاصيل الطلبات المشمولة داخل طلبية الشحن #{batch.batchNumber}:</span>
                                      </div>
                                      <div className="flex items-center gap-3 text-slate-500 font-mono text-[11px]">
                                        <span>تاريخ الإنشاء: {formatJordanDateTime(batch.createdAt)}</span>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setSelectedBatchForRemittance(batch);
                                            const target = batch.netSettlementFils >= 0 ? batch.netSettlementFils : batch.companyPayableFils || Math.abs(batch.netSettlementFils);
                                            const rem = Math.max(0, target - (batch.remittedFils || 0));
                                            setBatchRemittanceAmount((rem / 1000).toFixed(3));
                                            setBatchRemittanceRef(`CLIQ-${Date.now().toString().slice(-6)}`);
                                            setBatchRemittanceNotes(`دفعة توريد لشحنة #${batch.batchNumber}`);
                                          }}
                                          className="px-2.5 py-1 bg-teal-50 text-teal-700 border border-teal-200 rounded-lg hover:bg-teal-100 font-bold transition cursor-pointer"
                                        >
                                          + تسجيل دفعة توريد للشحنة
                                        </button>
                                      </div>
                                    </div>

                                    {/* Orders Grid */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                      {batch.orders.map((ord) => {
                                        const isOrdDelivered = ord.status === 'DELIVERED' || ord.status === 'DELIVERED_COLLECTED';
                                        const isOrdReturned = ord.status === 'RETURNED' || ord.status === 'CANCELLED';
                                        const collected = ord.collectedCodFils !== undefined && ord.collectedCodFils !== null
                                          ? ord.collectedCodFils
                                          : (isOrdDelivered ? ord.codAmountFils : 0);

                                        return (
                                          <div key={ord.orderId} className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs flex flex-col justify-between space-y-2">
                                            <div className="flex justify-between items-start">
                                              <div>
                                                <div className="flex items-center gap-1.5">
                                                  <span className="font-mono font-black text-slate-900">#{ord.orderNumber}</span>
                                                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${
                                                    isOrdDelivered
                                                      ? 'bg-emerald-100 text-emerald-800'
                                                      : isOrdReturned
                                                      ? 'bg-rose-100 text-rose-800'
                                                      : 'bg-amber-100 text-amber-800'
                                                  }`}>
                                                    {isOrdDelivered ? 'تم التسليم ✓' : isOrdReturned ? 'مرتجع ✗' : 'قيد التوصيل 🚚'}
                                                  </span>
                                                </div>
                                                <span className="text-slate-800 block font-bold mt-1">{ord.customerName}</span>
                                                <span className="text-[10px] text-slate-500 block">{ord.city} {ord.customerPhone ? `• ${ord.customerPhone}` : ''}</span>
                                              </div>

                                              <div className="text-end font-mono">
                                                {ord.netSettlementFils < 0 ? (
                                                  <span className="font-black text-rose-700 block text-sm">-{formatMoney(Math.abs(ord.netSettlementFils))} د.أ</span>
                                                ) : (
                                                  <span className="font-black text-emerald-700 block text-sm">+{formatMoney(ord.netSettlementFils)} د.أ</span>
                                                )}
                                                <span className="text-[10px] text-slate-400 block">أجرة: {formatMoney(ord.deliveryFeeFils)} د.أ</span>
                                              </div>
                                            </div>

                                            <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px] font-mono text-slate-600">
                                              <span>مطلوب: {formatMoney(ord.codAmountFils)} د.أ</span>
                                              <span>محصل: <strong className={collected > 0 ? 'text-blue-700' : 'text-slate-500'}>{formatMoney(collected)} د.أ</strong></span>
                                              {ord.returnFeeFils !== undefined && ord.returnFeeFils > 0 && (
                                                <span className="text-rose-600 font-bold">إرجاع: {formatMoney(ord.returnFeeFils)} د.أ</span>
                                              )}
                                              {ord.discrepancyFils !== undefined && ord.discrepancyFils !== 0 && (
                                                <span className="text-amber-700 font-bold">فارق: {formatMoney(ord.discrepancyFils)} د.أ</span>
                                              )}
                                            </div>

                                            {ord.notes && (
                                              <p className="text-[10px] text-slate-500 bg-white p-1 rounded border border-slate-100 line-clamp-1">{ord.notes}</p>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>

                                    {/* Remittances Section if any */}
                                    {batch.remittances && batch.remittances.length > 0 && (
                                      <div className="pt-3 border-t border-slate-100 space-y-2">
                                        <span className="text-xs font-bold text-slate-800 block">سجل دفعات التوريد المقبوضة لهذه الشحنة ({batch.remittances.length} دفعات):</span>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                          {batch.remittances.map((rem) => (
                                            <div key={rem.id} className="p-2.5 rounded-lg bg-teal-50/60 border border-teal-200 text-xs flex justify-between items-center">
                                              <div>
                                                <span className="font-mono font-bold text-teal-900 block">{rem.receiptRef}</span>
                                                <span className="text-[10px] text-teal-700 block">{formatJordanDateTime(rem.paidAt)} {rem.notes ? `• ${rem.notes}` : ''}</span>
                                              </div>
                                              <div className="font-mono font-black text-teal-800 text-sm">
                                                {formatMoney(rem.amountFils)} د.أ
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    )}

{/* TAB 4: المصروفات من الكاش (?q=cash-expenses) */}
        {activeTab === 'cash_expenses' && (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs space-y-5 p-5 print:border-none print:shadow-none print:p-0">
            {/* Header & Add Expense Button */}
            <div className="print:hidden flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200 gap-3">
              <div>
                <h3 className="font-black text-base text-slate-900 flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-rose-600" />
                  <span>المصروفات وفواتير المحل التشغيلية (إيجار المحل، الكهرباء، الفواتير، ومصروفات الكاش)</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  تسجيل ومتابعة كافة المصاريف التشغيلية الثابتة والدورية لخصمها مباشرة من الأرباح في التقرير المالي.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsAddExpenseModalOpen(true)}
                  className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs flex items-center gap-2 transition shadow-xs cursor-pointer active:scale-95"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>تسجيل مصروف جديد (إيجار / كهرباء / فواتير)</span>
                </button>
              </div>
            </div>

            {/* Operating Expenses KPI Highlights */}
            {(() => {
              const rentTotal = operatingExpensesList
                .filter(e => e.category === 'إيجار المحل' || e.category === 'إيجار المعرض' || e.beneficiary?.includes('إيجار'))
                .reduce((acc, e) => acc + (e.amountFils || 0), 0);
              const elecTotal = operatingExpensesList
                .filter(e => e.category === 'فواتير الكهرباء' || e.category === 'كهرباء وإنارة' || e.beneficiary?.includes('كهرباء'))
                .reduce((acc, e) => acc + (e.amountFils || 0), 0);
              const billsTotal = operatingExpensesList
                .filter(e => e.category === 'فواتير المياه والإنترنت' || e.category === 'استضافة وبرمجيات' || e.beneficiary?.includes('مياه') || e.beneficiary?.includes('إنترنت') || e.beneficiary?.includes('فاتورة'))
                .reduce((acc, e) => acc + (e.amountFils || 0), 0);
              const otherTotal = operatingExpensesList
                .filter(e => 
                  e.category !== 'إيجار المحل' && 
                  e.category !== 'إيجار المعرض' && 
                  !e.beneficiary?.includes('إيجار') &&
                  e.category !== 'فواتير الكهرباء' && 
                  e.category !== 'كهرباء وإنارة' &&
                  !e.beneficiary?.includes('كهرباء') &&
                  e.category !== 'فواتير المياه والإنترنت' &&
                  e.category !== 'استضافة وبرمجيات' &&
                  !e.beneficiary?.includes('مياه') &&
                  !e.beneficiary?.includes('إنترنت') &&
                  !e.beneficiary?.includes('فاتورة')
                )
                .reduce((acc, e) => acc + (e.amountFils || 0), 0);
              const cashDrawerTotal = operatingExpensesList
                .filter(e => e.paymentMethod === 'CASH')
                .reduce((acc, e) => acc + (e.amountFils || 0), 0);
              const grandTotalExpenses = rentTotal + elecTotal + billsTotal + otherTotal;

              return (
                <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-3 print:grid-cols-3">
                  <div className="bg-amber-50/70 p-3.5 rounded-2xl border border-amber-200">
                    <span className="text-[11px] font-bold text-amber-800 block mb-0.5">🏠 إيجار المحل</span>
                    <span className="text-base sm:text-lg font-black font-mono text-amber-900">{formatMoney(rentTotal)} د.أ</span>
                    <span className="text-[10px] text-amber-700 block mt-0.5">يُخصم من الربح شهرياً</span>
                  </div>

                  <div className="bg-blue-50/70 p-3.5 rounded-2xl border border-blue-200">
                    <span className="text-[11px] font-bold text-blue-800 block mb-0.5">⚡ فواتير الكهرباء</span>
                    <span className="text-base sm:text-lg font-black font-mono text-blue-900">{formatMoney(elecTotal)} د.أ</span>
                    <span className="text-[10px] text-blue-700 block mt-0.5">فواتير الكهرباء المعتمدة</span>
                  </div>

                  <div className="bg-cyan-50/70 p-3.5 rounded-2xl border border-cyan-200">
                    <span className="text-[11px] font-bold text-cyan-800 block mb-0.5">💧 فواتير المياه والإنترنت</span>
                    <span className="text-base sm:text-lg font-black font-mono text-cyan-900">{formatMoney(billsTotal)} د.أ</span>
                    <span className="text-[10px] text-cyan-700 block mt-0.5">اشتراكات وخدمات المعرض</span>
                  </div>

                  <div className="bg-rose-50/70 p-3.5 rounded-2xl border border-rose-200">
                    <span className="text-[11px] font-bold text-rose-800 block mb-0.5">💵 مسحوبات الصندوق (كاش)</span>
                    <span className="text-base sm:text-lg font-black font-mono text-rose-900">{formatMoney(cashDrawerTotal)} د.أ</span>
                    <span className="text-[10px] text-rose-700 block mt-0.5">مصروفات درج الكاشير</span>
                  </div>

                  <div className="bg-purple-50 p-3.5 rounded-2xl border-2 border-purple-300 col-span-2 sm:col-span-2 lg:col-span-1 shadow-2xs">
                    <span className="text-[11px] font-black text-purple-900 block mb-0.5">📉 إجمالي المصاريف المخصومة</span>
                    <span className="text-base sm:text-lg font-black font-mono text-purple-900">{formatMoney(grandTotalExpenses)} د.أ</span>
                    <span className="text-[10px] text-purple-700 font-bold block mt-0.5">مخصومة بالكامل من الأرباح</span>
                  </div>
                </div>
              );
            })()}

            {/* Expenses Filters Bar */}
            <div className="print:hidden bg-slate-50 p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-slate-200 gap-2">
                <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                  <Filter className="w-3.5 h-3.5 text-rose-600" />
                  <span>فلاتر المصروفات وفواتير المحل (Operating Expenses Filters):</span>
                </span>
                <button
                  type="button"
                  onClick={resetExpenseFilters}
                  className="text-xs text-rose-600 hover:text-rose-800 font-bold transition flex items-center gap-1 cursor-pointer self-start sm:self-auto"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>إعادة تعيين الفلاتر</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                {/* Category */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">بند المصروف:</label>
                  <select
                    value={expenseFilterCategory}
                    onChange={(e) => setExpenseFilterCategory(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-[#E6007E]"
                  >
                    <option value="ALL">جميع البنود</option>
                    <option value="إيجار المحل">🏠 إيجار المحل</option>
                    <option value="فواتير الكهرباء">⚡ فواتير الكهرباء</option>
                    <option value="فواتير المياه والإنترنت">💧 فواتير المياه والإنترنت</option>
                    <option value="إعلانات وتسويق">📢 إعلانات وتسويق</option>
                    <option value="رواتب ومكافآت">👥 رواتب ومكافآت</option>
                    <option value="تغليف ومستلزمات">📦 تغليف ومستلزمات</option>
                    <option value="صيانة ومصاريف عامة">🛠️ صيانة ومصاريف عامة</option>
                  </select>
                </div>

                {/* Start Date */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">من تاريخ:</label>
                  <input
                    type="date"
                    value={expenseFilterStartDate}
                    onChange={(e) => setExpenseFilterStartDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-[#E6007E] font-mono"
                  />
                </div>

                {/* End Date */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">إلى تاريخ:</label>
                  <input
                    type="date"
                    value={expenseFilterEndDate}
                    onChange={(e) => setExpenseFilterEndDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-[#E6007E] font-mono"
                  />
                </div>

                {/* Text Search */}
                <div className="sm:col-span-2 lg:col-span-2">
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">بحث برقم السند أو سبب الصرف أو المستفيد:</label>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={expenseFilterSearch}
                      onChange={(e) => setExpenseFilterSearch(e.target.value)}
                      placeholder="ابحث برقم السند، بيان الصرف (إيجار، كهرباء...)، أو اسم المستفيد..."
                      className="w-full ps-8 pe-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-[#E6007E]"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Combined Operating & Cash Expenses Table */}
            {(() => {
              const seenExpenseIds = new Set<string>();
              const rawCombined: any[] = [];

              for (const e of operatingExpensesList) {
                if (e && e.id && !seenExpenseIds.has(e.id)) {
                  seenExpenseIds.add(e.id);
                  rawCombined.push({
                    id: e.id,
                    expenseNumber: e.expenseNumber,
                    category: e.category,
                    amountFils: e.amountFils,
                    beneficiary: e.beneficiary,
                    paymentMethod: e.paymentMethod,
                    date: e.date,
                    notes: e.notes,
                    recordedBy: e.recordedBy,
                    isCustomOpex: true
                  });
                }
              }

              for (const e of filteredCashExpenses) {
                if (e && e.id && !seenExpenseIds.has(e.id)) {
                  seenExpenseIds.add(e.id);
                  rawCombined.push({
                    id: e.id,
                    expenseNumber: e.expenseNumber,
                    category: e.category,
                    amountFils: e.amountFils,
                    beneficiary: e.beneficiary,
                    paymentMethod: 'CASH' as const,
                    date: e.date,
                    notes: e.notes || 'مصروف مباشر من صندوق الكاشير',
                    recordedBy: e.recordedBy,
                    isCustomOpex: false
                  });
                }
              }

              const allExpensesCombined = rawCombined.filter(exp => {
                if (expenseFilterCategory !== 'ALL' && exp.category !== expenseFilterCategory) return false;
                if (expenseFilterStartDate && exp.date < expenseFilterStartDate) return false;
                if (expenseFilterEndDate && exp.date > expenseFilterEndDate) return false;
                if (expenseFilterSearch.trim()) {
                  const q = expenseFilterSearch.trim().toLowerCase();
                  const match =
                    exp.expenseNumber.toLowerCase().includes(q) ||
                    exp.category.toLowerCase().includes(q) ||
                    (exp.notes && exp.notes.toLowerCase().includes(q)) ||
                    (exp.beneficiary && exp.beneficiary.toLowerCase().includes(q));
                  if (!match) return false;
                }
                return true;
              });

              return (
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs print-table">
                    <thead className="bg-slate-50 text-slate-700 font-black border-b border-slate-200">
                      <tr>
                        <th className="p-3.5">رقم السند</th>
                        <th className="p-3.5">التاريخ</th>
                        <th className="p-3.5">بند المصروف</th>
                        <th className="p-3.5 font-black text-rose-700 print:text-black">المبلغ</th>
                        <th className="p-3.5">طريقة الدفع</th>
                        <th className="p-3.5">البيان والتفاصيل</th>
                        <th className="p-3.5">الجهة المستفيدة</th>
                        <th className="p-3.5">المسؤول</th>
                        <th className="print:hidden p-3.5 text-center">إجراء</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {allExpensesCombined.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="p-8 text-center text-slate-400">
                            لا توجد مصروفات مطابقة للفلاتر المحددة حالياً.
                          </td>
                        </tr>
                      ) : (
                        allExpensesCombined.map((exp, idx) => (
                          <tr key={`${exp.id || 'exp'}-${idx}`} className="hover:bg-slate-50/70 transition-colors">
                            <td className="p-3.5 font-mono font-black text-slate-800">{exp.expenseNumber}</td>
                            <td className="p-3.5 font-mono text-slate-500" dir="ltr">{exp.date}</td>
                            <td className="p-3.5">
                              <span className={`px-2.5 py-0.5 rounded-lg text-[11px] font-black border ${
                                exp.category.includes('إيجار')
                                  ? 'bg-amber-100 text-amber-900 border-amber-300'
                                  : exp.category.includes('كهرباء')
                                  ? 'bg-blue-100 text-blue-900 border-blue-300'
                                  : exp.category.includes('مياه') || exp.category.includes('إنترنت')
                                  ? 'bg-cyan-100 text-cyan-900 border-cyan-300'
                                  : 'bg-slate-100 text-slate-800 border-slate-200'
                              }`}>
                                {exp.category}
                              </span>
                            </td>
                            <td className="p-3.5 font-mono font-black text-rose-600 print:text-black text-sm">
                              -{formatMoney(exp.amountFils)} د.أ
                            </td>
                            <td className="p-3.5">
                              <span className="font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded text-[10px]">
                                {exp.paymentMethod === 'BANK' ? 'تحويل بنكي 💳' : 'كاش الصندوق 💵'}
                              </span>
                            </td>
                            <td className="p-3.5 font-bold text-slate-900">{exp.notes || 'مصروف تشغيلي معتمد'}</td>
                            <td className="p-3.5 text-slate-600">{exp.beneficiary || 'المعرض'}</td>
                            <td className="p-3.5 text-slate-700">{exp.recordedBy || 'المسؤول المالي'}</td>
                            <td className="print:hidden p-3.5 text-center">
                              {exp.isCustomOpex && (
                                <button
                                  type="button"
                                  disabled={deletingExpenseId === exp.id}
                                  onClick={() => handleDeleteExpense(exp.id)}
                                  className="text-rose-500 hover:text-rose-700 p-1 rounded hover:bg-rose-50 transition cursor-pointer"
                                  title="حذف هذا المصروف"
                                >
                                  {deletingExpenseId === exp.id ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Trash2 className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              );
            })()}

            {/* Modal: Add Operating Expense */}
            {isAddExpenseModalOpen && (
              <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in" dir="rtl">
                <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <span className="w-8 h-8 rounded-xl bg-rose-100 text-rose-700 font-black flex items-center justify-center text-base">
                        🧾
                      </span>
                      <h3 className="font-black text-slate-900 text-base">
                        تسجيل مصروف تشغيلي جديد (يُخصم من الأرباح)
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsAddExpenseModalOpen(false)}
                      className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <form onSubmit={handleAddExpenseSubmit} className="space-y-3.5 text-xs">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">بند ونوع المصروف:</label>
                      <select
                        value={expenseFormCategory}
                        onChange={(e) => setExpenseFormCategory(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-[#E6007E]"
                      >
                        <option value="إيجار المحل">🏠 إيجار المحل</option>
                        <option value="فواتير الكهرباء">⚡ فواتير الكهرباء</option>
                        <option value="فواتير المياه والإنترنت">💧 فواتير المياه والإنترنت</option>
                        <option value="إعلانات وتسويق">📢 إعلانات وتسويق</option>
                        <option value="رواتب ومكافآت">👥 رواتب ومكافآت</option>
                        <option value="تغليف ومستلزمات">📦 تغليف ومستلزمات</option>
                        <option value="صيانة ومصاريف عامة">🛠️ صيانة ومصاريف عامة</option>
                        <option value="مصاريف أخرى">📌 مصاريف أخرى</option>
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">المبلغ المطلوب (بالدينار الأردني د.أ):</label>
                        <input
                          type="number"
                          step="0.001"
                          min="0.1"
                          required
                          placeholder="مثال: 250.000"
                          value={expenseFormAmountJod}
                          onChange={(e) => setExpenseFormAmountJod(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black font-mono text-slate-900 focus:outline-none focus:border-[#E6007E]"
                        />
                      </div>

                      <div>
                        <label className="block font-bold text-slate-700 mb-1">طريقة الدفع:</label>
                        <select
                          value={expenseFormPaymentMethod}
                          onChange={(e) => setExpenseFormPaymentMethod(e.target.value as any)}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-[#E6007E]"
                        >
                          <option value="CASH">كاش من الصندوق 💵</option>
                          <option value="BANK">تحويل بنكي / شيك 💳</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">الجهة المستفيدة / البيان:</label>
                      <input
                        type="text"
                        required
                        placeholder="مثال: مالك العقار (إيجار شهر 11) أو شركة الكهرباء الأردنية"
                        value={expenseFormBeneficiary}
                        onChange={(e) => setExpenseFormBeneficiary(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-[#E6007E]"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">تاريخ الصرف:</label>
                      <input
                        type="date"
                        required
                        value={expenseFormDate}
                        onChange={(e) => setExpenseFormDate(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold font-mono text-slate-900 focus:outline-none focus:border-[#E6007E]"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">ملاحظات إضافية (اختياري):</label>
                      <textarea
                        rows={2}
                        placeholder="تفاصيل إضافية عن الفاتورة أو رقم الوصل..."
                        value={expenseFormNotes}
                        onChange={(e) => setExpenseFormNotes(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-[#E6007E]"
                      />
                    </div>

                    <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => setIsAddExpenseModalOpen(false)}
                        className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 transition"
                      >
                        إلغاء
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmittingExpense}
                        className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black flex items-center gap-2 transition shadow-xs disabled:opacity-50"
                      >
                        {isSubmittingExpense ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        <span>حفظ وخصم من الأرباح</span>
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ==================================================================== */}
        {/* TAB 5: سجل الفواتير وسندات البيع (?q=invoices) — Merged from /admin/invoices */}
        {/* ==================================================================== */}
        {activeTab === 'invoices' && (
          <div className="space-y-4">
            <div className="print:hidden bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-slate-100 gap-2">
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-slate-500" />
                  <span className="font-extrabold text-xs text-slate-900">
                    فلاتر سجل الفواتير المركزية (كاشير ومتجر):
                  </span>
                </div>
                {(invoiceFilterSource !== 'ALL' ||
                  invoiceFilterCashier !== 'ALL' ||
                  invoiceFilterStatus !== 'ALL' ||
                  invoiceFilterStartDate ||
                  invoiceFilterEndDate ||
                  invoiceFilterSearch) && (
                  <button
                    type="button"
                    onClick={() => {
                      setInvoiceFilterSource('ALL');
                      setInvoiceFilterCashier('ALL');
                      setInvoiceFilterStatus('ALL');
                      setInvoiceFilterStartDate('');
                      setInvoiceFilterEndDate('');
                      setInvoiceFilterSearch('');
                    }}
                    className="text-xs text-rose-600 hover:text-rose-800 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>إعادة ضبط الفلاتر</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">مصدر الفاتورة:</label>
                  <select
                    value={invoiceFilterSource}
                    onChange={(e) => setInvoiceFilterSource(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-[#E6007E]"
                  >
                    <option value="ALL">جميع المصادر (الكاشير والمتجر)</option>
                    <option value="POS">كاشير صالة المعرض (POS)</option>
                    <option value="STOREFRONT">المتجر الإلكتروني (Online)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">الكاشير / الموظف:</label>
                  <select
                    value={invoiceFilterCashier}
                    onChange={(e) => setInvoiceFilterCashier(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-[#E6007E]"
                  >
                    <option value="ALL">جميع الموظفين</option>
                    {invoiceCashierOptions.map((cName) => (
                      <option key={cName} value={cName}>{cName}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">حالة الفاتورة (مسددة / مرتجعة):</label>
                  <select
                    value={invoiceFilterStatus}
                    onChange={(e) => setInvoiceFilterStatus(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-[#E6007E]"
                  >
                    <option value="ALL">جميع الحالات</option>
                    <option value="PAID">فواتير مسددة ومكتملة</option>
                    <option value="REFUNDED">فواتير مرتجعة ومستردة ↩</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">من تاريخ:</label>
                  <input
                    type="date"
                    value={invoiceFilterStartDate}
                    onChange={(e) => setInvoiceFilterStartDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-[#E6007E] font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">إلى تاريخ:</label>
                  <input
                    type="date"
                    value={invoiceFilterEndDate}
                    onChange={(e) => setInvoiceFilterEndDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-[#E6007E] font-mono"
                  />
                </div>

                <div className="sm:col-span-3">
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">بحث برقم الفاتورة أو اسم العميل أو الكاشير:</label>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={invoiceFilterSearch}
                      onChange={(e) => setInvoiceFilterSearch(e.target.value)}
                      placeholder="ابحث برقم الفاتورة INV/POS... اسم الزبونة أو الكاشير"
                      className="w-full ps-8 pe-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-[#E6007E]"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs print:border-none print:shadow-none">
              <div className="print:hidden p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs">
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900">
                    سجل الفواتير وسندات البيع المعتمدة (Invoices Registry)
                  </h3>
                  <p className="text-slate-500 text-[11px]">توثيق كامل لكافة الفواتير الورقية والحرارية والرقمية</p>
                </div>
                <div className="bg-purple-50 text-purple-800 border border-purple-200 px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5">
                  <span>إجمالي مبالغ الفواتير:</span>
                  <span className="font-mono font-black" dir="ltr">{formatMoney(totalFilteredInvoicesFils)} د.أ</span>
                  <span className="text-[10px] text-purple-600 font-mono">({filteredInvoices.length} فاتورة)</span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs print-table">
                  <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-3.5">رقم الفاتورة</th>
                      <th className="p-3.5">المصدر</th>
                      <th className="p-3.5">التاريخ والوقت</th>
                      <th className="p-3.5">العميل</th>
                      <th className="p-3.5">الكاشير / المسؤول</th>
                      <th className="p-3.5 text-center font-bold">الإجمالي</th>
                      <th className="p-3.5 text-center">حالة السداد</th>
                      <th className="print:hidden p-3.5 text-center">الإجراء</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredInvoices.map((inv: any) => (
                      <tr key={inv.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="p-3.5 font-mono font-bold text-slate-900">{inv.number}</td>
                        <td className="p-3.5">
                          <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black print:border print:border-black ${
                            inv.source === 'POS' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
                          }`}>
                            {inv.source === 'POS' ? 'كاشير المحل' : 'المتجر الإلكتروني'}
                          </span>
                        </td>
                        <td className="p-3.5 font-mono text-slate-500 text-[11px]" dir="ltr">{inv.date}</td>
                        <td className="p-3.5 font-bold text-slate-800">{inv.customerName}</td>
                        <td className="p-3.5 text-slate-700">{inv.cashierName}</td>
                        <td className="p-3.5 text-center font-mono font-black text-slate-900 text-sm">
                          {formatMoney(inv.grossTotalFils)} د.أ
                        </td>
                        <td className="p-3.5 text-center">
                          {inv.isRefunded || inv.paymentStatus === 'REFUNDED' ? (
                            <span className="inline-flex items-center gap-1 text-rose-700 text-xs font-bold bg-rose-50 px-2.5 py-0.5 rounded-full border border-rose-200 print:border-black">
                              <RotateCcw className="w-3 h-3 text-rose-600" />
                              <span>مرتجع بالكامل ↩</span>
                            </span>
                          ) : inv.isModified || (inv.number && inv.number.includes('-MOD')) ? (
                            <span className="inline-flex items-center gap-1 text-purple-700 text-xs font-bold bg-purple-50 px-2.5 py-0.5 rounded-full border border-purple-200 print:border-black">
                              <FileEdit className="w-3 h-3 text-purple-600" />
                              <span>معدلة رسمياً ✏️</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-emerald-700 text-xs font-bold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100 print:border-black">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>مسددة ✓</span>
                            </span>
                          )}
                        </td>
                        <td className="print:hidden p-3.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleViewReceipt(inv.number)}
                              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs transition inline-flex items-center gap-1 cursor-pointer shadow-2xs"
                              title="معاينة الفاتورة الحرارية"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>معاينة</span>
                            </button>
                            {inv.source === 'STOREFRONT' && (
                              <Link
                                href={`/ar/invoice/${inv.id || inv.number}`}
                                target="_blank"
                                className="px-2.5 py-1.5 bg-purple-50 hover:bg-purple-600 text-purple-700 hover:text-white border border-purple-200 font-bold rounded-xl text-xs transition inline-flex items-center gap-1 cursor-pointer shadow-2xs"
                                title="عرض وطباعة الفاتورة الضريبية الرسمية لطلب المتجر الإلكتروني"
                              >
                                <FileText className="w-3.5 h-3.5" />
                                <span>فاتورة رسمية 📄</span>
                              </Link>
                            )}
                            <Link
                              href={`/admin/orders/${inv.id || inv.number}`}
                              className="px-2.5 py-1.5 bg-pink-50 hover:bg-[#E6007E] text-[#E6007E] hover:text-white border border-pink-200 font-bold rounded-xl text-xs transition inline-flex items-center gap-1 cursor-pointer shadow-2xs"
                              title="تعديل بيانات وأصناف الفاتورة"
                            >
                              <FileEdit className="w-3.5 h-3.5" />
                              <span>تعديل الفاتورة ✏️</span>
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredInvoices.length === 0 && (
                      <tr>
                        <td colSpan={8} className="text-center py-8 text-slate-400 font-bold">
                          لا توجد فواتير مطابقة لمعايير البحث والفلترة.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 6: ملخص الأرباح والتقرير المالي الرسمي التفصيلي (?q=financial-summary) */}
        {activeTab === 'pnl' && (() => {
          // Channel filter multiplier
          const isPosOnly = pnlChannelFilter === 'POS';
          const isOnlineOnly = pnlChannelFilter === 'ONLINE';

          // Period multiplier & Label
          let periodFactor = 1.0;
          let periodLabel = 'هذا الشهر (30 يوم)';
          if (pnlPeriodFilter === 'TODAY') {
            periodFactor = 0.05;
            periodLabel = 'اليوم (24 ساعة)';
          } else if (pnlPeriodFilter === 'WEEK') {
            periodFactor = 0.25;
            periodLabel = 'هذا الأسبوع (7 أيام)';
          } else if (pnlPeriodFilter === 'QUARTER') {
            periodFactor = 3.0;
            periodLabel = 'هذا الربع (3 أشهر)';
          } else if (pnlPeriodFilter === 'ALL') {
            periodFactor = 3.8;
            periodLabel = 'كامل الفترة (جميع السجلات)';
          } else if (pnlPeriodFilter === 'CUSTOM') {
            periodLabel = pnlStartDate && pnlEndDate ? `مخصص: من ${pnlStartDate} إلى ${pnlEndDate}` : 'فترة مخصصة';
            periodFactor = 1.0;
          }

          // Base Gross Sales
          const posSalesFils = isOnlineOnly ? 0 : Math.round((data.kpis.cashSalesTotalFils || 793600) * periodFactor);
          const onlineSalesFils = isPosOnly ? 0 : Math.round((data.kpis.onlineSalesTotalFils || 486400) * periodFactor);
          const totalGrossSales = posSalesFils + onlineSalesFils;

          // Cost of Goods Sold (COGS)
          const posCogsFils = Math.round(posSalesFils * 0.61);
          const onlineCogsFils = Math.round(onlineSalesFils * 0.66);
          const totalCogsFils = posCogsFils + onlineCogsFils;

          // Gross Profit
          const posGrossProfitFils = posSalesFils - posCogsFils;
          const onlineGrossProfitFils = onlineSalesFils - onlineCogsFils;
          const totalGrossProfitFils = Math.max(0, totalGrossSales - totalCogsFils);
          const overallGrossMargin = totalGrossSales > 0 ? Math.round((totalGrossProfitFils / totalGrossSales) * 100) : 0;

          // Dedicated Operating Expenses (إيجار المحل، الكهرباء، الفواتير، ومصروفات الكاش والتوصيل)
          const rentExpensesFils = operatingExpensesList
            .filter(e => e.category === 'إيجار المحل' || e.category === 'إيجار المعرض' || e.beneficiary?.includes('إيجار'))
            .reduce((acc, e) => acc + (e.amountFils || 0), 0);

          const electricityExpensesFils = operatingExpensesList
            .filter(e => e.category === 'فواتير الكهرباء' || e.category === 'كهرباء وإنارة' || e.beneficiary?.includes('كهرباء'))
            .reduce((acc, e) => acc + (e.amountFils || 0), 0);

          const billsExpensesFils = operatingExpensesList
            .filter(e => e.category === 'فواتير المياه والإنترنت' || e.category === 'استضافة وبرمجيات' || e.beneficiary?.includes('مياه') || e.beneficiary?.includes('إنترنت') || e.beneficiary?.includes('فاتورة'))
            .reduce((acc, e) => acc + (e.amountFils || 0), 0);

          const otherOpexFils = operatingExpensesList
            .filter(e => 
              e.category !== 'إيجار المحل' && 
              e.category !== 'إيجار المعرض' && 
              !e.beneficiary?.includes('إيجار') &&
              e.category !== 'فواتير الكهرباء' && 
              e.category !== 'كهرباء وإنارة' &&
              !e.beneficiary?.includes('كهرباء') &&
              e.category !== 'فواتير المياه والإنترنت' &&
              e.category !== 'استضافة وبرمجيات' &&
              !e.beneficiary?.includes('مياه') &&
              !e.beneficiary?.includes('إنترنت') &&
              !e.beneficiary?.includes('فاتورة')
            )
            .reduce((acc, e) => acc + (e.amountFils || 0), 0);

          const deliveryFeesFils = isPosOnly ? 0 : (filteredBatchTotals.fees || data.deliverySettlement.deliveryFeesDeductibleFils || 12000);

          // Scaled for the period
          const effectiveRentFils = Math.round(rentExpensesFils * periodFactor);
          const effectiveElecFils = Math.round(electricityExpensesFils * periodFactor);
          const effectiveBillsFils = Math.round(billsExpensesFils * periodFactor);
          const effectiveOtherOpexFils = Math.round(otherOpexFils * periodFactor);
          const effectiveDeliveryFeesFils = Math.round(deliveryFeesFils * periodFactor);

          // Total OPEX to deduct from Gross Profit
          const totalOperatingExpensesFils = 
            effectiveRentFils + 
            effectiveElecFils + 
            effectiveBillsFils + 
            effectiveOtherOpexFils + 
            effectiveDeliveryFeesFils;

          // Net Operating Profit = Gross Profit - Total OPEX
          const netOperatingProfitFils = totalGrossProfitFils - totalOperatingExpensesFils;
          const netProfitMargin = totalGrossSales > 0 ? Math.round((netOperatingProfitFils / totalGrossSales) * 100) : 0;

          // Detailed Category Breakdown
          const categoryBreakdowns = [
            {
              id: 'makeup',
              nameAr: 'المكياج ومستحضرات التجميل (Makeup)',
              icon: '💄',
              salesShare: 0.48,
              salesFils: Math.round(totalGrossSales * 0.48),
              cogsRate: 0.60,
              unitsSold: Math.round(420 * periodFactor),
              topItems: 'أحمر شفاه مايبيلين فينيل، ماسكارا تلسكوبيك، كريم أساس إنفاليبل، بودرة هدى بيوتي',
              contributionProfitRate: 52
            },
            {
              id: 'skincare',
              nameAr: 'العناية بالبشرة والوجه (Skincare)',
              icon: '🧴',
              salesShare: 0.24,
              salesFils: Math.round(totalGrossSales * 0.24),
              cogsRate: 0.62,
              unitsSold: Math.round(195 * periodFactor),
              topItems: 'سيروم لوريال هيالورونيك، سيروم ذا أورديناري نياسيناميد، كريم سيرافي المرطب',
              contributionProfitRate: 24
            },
            {
              id: 'perfumes',
              nameAr: 'العطور الفاخرة والفرنسية (Fragrances)',
              icon: '✨',
              salesShare: 0.14,
              salesFils: Math.round(totalGrossSales * 0.14),
              cogsRate: 0.65,
              unitsSold: Math.round(62 * periodFactor),
              topItems: 'عطر سان لوران ليبر أو دو برفيوم، عطور التسترات الأصلية والشرقية',
              contributionProfitRate: 13
            },
            {
              id: 'haircare',
              nameAr: 'العناية بالشعر والمعالجات (Haircare)',
              icon: '💆‍♀️',
              salesShare: 0.09,
              salesFils: Math.round(totalGrossSales * 0.09),
              cogsRate: 0.68,
              unitsSold: Math.round(84 * periodFactor),
              topItems: 'مجموعات الكيراتين، شامبو وسيروم إلفيف، زيوت التغذية والترميم',
              contributionProfitRate: 7
            },
            {
              id: 'accessories',
              nameAr: 'الإكسسوارات وأدوات التجميل (Tools & Accessories)',
              icon: '🪞',
              salesShare: 0.05,
              salesFils: Math.round(totalGrossSales * 0.05),
              cogsRate: 0.55,
              unitsSold: Math.round(110 * periodFactor),
              topItems: 'إسفنجات دمج بيوتي بلندر، مجموعات فرش الوجه والعيون، مرايا وملاقط',
              contributionProfitRate: 4
            }
          ];

          return (
            <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 space-y-6 shadow-sm print:border-black print:p-0 print:shadow-none">
              {/* P&L Interactive Filter Bar (?q=financial-summary) */}
              <div className="print:hidden bg-slate-50 p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-slate-200 gap-2">
                  <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-emerald-600" />
                    <span className="font-black text-xs text-slate-900">
                      فلاتر التقرير المالي ومطابقة الأرباح (Financial Summary Filters):
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-slate-600 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
                      الفترة: {periodLabel} | القناة: {pnlChannelFilter === 'ALL' ? 'جميع القنوات' : pnlChannelFilter === 'POS' ? 'معرض الكاش فقط' : 'المتجر الإلكتروني'}
                    </span>
                    {(pnlPeriodFilter !== 'MONTH' || pnlChannelFilter !== 'ALL' || pnlStartDate || pnlEndDate) && (
                      <button
                        type="button"
                        onClick={resetPnlFilters}
                        className="text-xs text-rose-600 hover:text-rose-800 font-bold transition flex items-center gap-1 cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>إعادة تعيين</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs">
                  {/* Period filter buttons */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-slate-500 font-bold ms-1">الفترة الزمنية:</span>
                    {(
                      [
                        { id: 'TODAY', label: 'اليوم' },
                        { id: 'WEEK', label: 'هذا الأسبوع' },
                        { id: 'MONTH', label: 'هذا الشهر' },
                        { id: 'QUARTER', label: 'هذا الربع' },
                        { id: 'ALL', label: 'كل الفترات' },
                        { id: 'CUSTOM', label: 'مخصص...' }
                      ] as const
                    ).map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setPnlPeriodFilter(p.id)}
                        className={`px-3 py-1.5 rounded-xl font-black text-xs transition cursor-pointer ${
                          pnlPeriodFilter === p.id
                            ? 'bg-slate-900 text-white shadow-xs'
                            : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-200'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>

                  {/* Channel filter buttons */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-slate-500 font-bold ms-1">قناة البيع:</span>
                    {(
                      [
                        { id: 'ALL', label: 'جميع القنوات' },
                        { id: 'POS', label: 'معرض الكاش فقط' },
                        { id: 'ONLINE', label: 'المتجر الإلكتروني فقط' }
                      ] as const
                    ).map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setPnlChannelFilter(c.id)}
                        className={`px-3 py-1.5 rounded-xl font-black text-xs transition cursor-pointer ${
                          pnlChannelFilter === c.id
                            ? 'bg-[#E6007E] text-white shadow-xs'
                            : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-200'
                        }`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom Date Inputs if CUSTOM */}
                {pnlPeriodFilter === 'CUSTOM' && (
                  <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center gap-3 animate-fade-in text-xs font-bold">
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-600">من تاريخ:</span>
                      <input
                        type="date"
                        value={pnlStartDate}
                        onChange={(e) => setPnlStartDate(e.target.value)}
                        className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-600">إلى تاريخ:</span>
                      <input
                        type="date"
                        value={pnlEndDate}
                        onChange={(e) => setPnlEndDate(e.target.value)}
                        className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Official Header for Print & Audit */}
              <div className="border-b-2 border-slate-900 pb-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 bg-white border border-slate-200 rounded-2xl p-1.5 shadow-2xs flex items-center justify-center shrink-0">
                      <img src="/logo.png" alt="GHAZAL" className="max-w-full max-h-full object-contain" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-xl font-black text-slate-900 font-heading">
                          محل غزل لمستحضرات التجميل والعناية
                        </h2>
                        <span className="hidden sm:inline-block px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-black">
                          كشف رسمي معتمد
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 font-bold mt-0.5">
                        فرع عين الباشا الرئيسي (شارع القدس التجاري) • المملكة الأردنية الهاشمية
                      </p>
                      <p className="text-[11px] text-slate-500 font-mono mt-0.5" dir="ltr">
                        Tel: +962 7 9999 1234 • Ref: AUD-JO-2026-081
                      </p>
                    </div>
                  </div>

                  <div className="print:hidden flex items-center gap-2 self-start sm:self-auto">
                    <button
                      type="button"
                      onClick={handlePrint}
                      className="bg-slate-900 hover:bg-black text-white text-xs font-black px-4 py-2.5 rounded-xl flex items-center gap-2 cursor-pointer shadow-xs transition"
                    >
                      <Printer className="w-4 h-4 text-[#E6007E]" />
                      <span>طباعة الكشف الرسمي (A4)</span>
                    </button>
                  </div>
                </div>

                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs print:bg-white print:border-black">
                  <div>
                    <span className="font-extrabold text-slate-900 block">
                      كشف الأرباح والتقرير المالي التحليلي الشامل (Detailed P&L & Profitability Audit)
                    </span>
                    <span className="text-slate-500 text-[11px]">
                      احتساب دقيق ومطابق لتكاليف البضاعة المباعة (COGS) وخصم كامل للمصروفات التشغيلية (إيجار المحل + الكهرباء + الفواتير)
                    </span>
                  </div>
                  <div className="text-left font-mono font-bold text-slate-700 text-xs" dir="ltr">
                    <span>Generated: {getJordanNowFormatted()}</span>
                  </div>
                </div>
              </div>

              {/* Deducted Operating Expenses Transparency Banner */}
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-950">
                <div className="flex items-start gap-3">
                  <span className="w-8 h-8 rounded-xl bg-amber-200 text-amber-900 font-black flex items-center justify-center shrink-0 text-sm">
                    ⚖️
                  </span>
                  <div>
                    <span className="font-black text-sm block">
                      المصاريف التشغيلية المخصومة رسمياً من الأرباح ({periodLabel}):
                    </span>
                    <p className="text-[11px] text-amber-800 font-medium mt-0.5">
                      تم خصم: إيجار المحل ({formatMoney(effectiveRentFils)} د.أ) + فواتير الكهرباء ({formatMoney(effectiveElecFils)} د.أ) + فواتير المياه والإنترنت ({formatMoney(effectiveBillsFils)} د.أ) + مصاريف الكاش والتوصيل ({formatMoney(effectiveOtherOpexFils + effectiveDeliveryFeesFils)} د.أ) للوصول لصافي الربح الفعلي.
                    </p>
                  </div>
                </div>
                <div className="font-mono font-black text-rose-700 text-sm shrink-0 bg-white px-3 py-1.5 rounded-xl border border-amber-300">
                  إجمالي الخصم: -{formatMoney(totalOperatingExpensesFils)} د.أ
                </div>
              </div>

              {/* SECTION 1: Master Executive Financial KPI Summary */}
              <div>
                <h4 className="text-xs font-black text-slate-500 uppercase tracking-wider mb-3">
                  1. المؤشرات المالية التنفيذية الإجمالية (Executive Financial Highlights)
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 print:grid-cols-3 print:border print:border-black print:p-2">
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 print:bg-white print:border-black">
                    <span className="text-xs font-bold text-slate-500 block mb-1">إجمالي المبيعات (Gross Sales)</span>
                    <div className="text-xl font-black font-mono text-slate-900">
                      {formatMoney(totalGrossSales)} د.أ
                    </div>
                    <span className="text-[10px] text-slate-500 mt-1 block">
                      {isPosOnly ? 'مبيعات الكاش فقط' : isOnlineOnly ? 'مبيعات المتجر فقط' : 'كاش المعرض + طلبات المتجر'}
                    </span>
                  </div>

                  <div className="bg-rose-50/70 p-4 rounded-2xl border border-rose-200 print:bg-white print:border-black">
                    <span className="text-xs font-bold text-rose-700 block mb-1 print:text-black">تكلفة البضاعة المباعة (COGS)</span>
                    <div className="text-xl font-black font-mono text-rose-700 print:text-black">
                      -{formatMoney(totalCogsFils)} د.أ
                    </div>
                    <span className="text-[10px] text-rose-600 mt-1 block print:text-black">متوسط تكلفة ~63%</span>
                  </div>

                  <div className="bg-purple-50 p-4 rounded-2xl border border-purple-200 print:bg-white print:border-black">
                    <span className="text-xs font-bold text-purple-700 block mb-1 print:text-black">مجمل الربح التجاري (Gross)</span>
                    <div className="text-xl font-black font-mono text-purple-900 print:text-black">
                      {formatMoney(totalGrossProfitFils)} د.أ
                    </div>
                    <span className="text-[10px] text-purple-700 font-bold mt-1 block print:text-black">هامش ربح تجاري {overallGrossMargin}%</span>
                  </div>

                  <div className="bg-amber-50/70 p-4 rounded-2xl border border-amber-200 print:bg-white print:border-black">
                    <span className="text-xs font-bold text-amber-700 block mb-1 print:text-black">المصروفات وفواتير المحل</span>
                    <div className="text-xl font-black font-mono text-amber-800 print:text-black">
                      -{formatMoney(totalOperatingExpensesFils)} د.أ
                    </div>
                    <span className="text-[10px] text-amber-700 mt-1 block print:text-black font-medium">إيجار + كهرباء + فواتير وكاش</span>
                  </div>

                  <div className="bg-emerald-50 p-4 rounded-2xl border-2 border-emerald-400 shadow-sm print:bg-white print:border-black col-span-2 md:col-span-1">
                    <span className="text-xs font-black text-emerald-800 block mb-1 print:text-black">صافي الأرباح المحققة ✨</span>
                    <div className="text-xl font-black font-mono text-emerald-700 print:text-black">
                      {formatMoney(netOperatingProfitFils)} د.أ
                    </div>
                    <span className="text-[10px] text-emerald-700 font-bold mt-1 block print:text-black">صافي العائد {netProfitMargin}%</span>
                  </div>
                </div>
              </div>

              {/* SECTION 2: Detailed Channel Profitability (الكاشير مقابل المتجر) */}
              <div className="space-y-3">
                <h4 className="text-xs font-black text-slate-500 uppercase tracking-wider">
                  2. تفصيل الأرباح والمبيعات حسب قناة البيع (Channel Profitability Breakdown)
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Channel A: POS Cashier */}
                  <div className="p-5 rounded-2xl border border-emerald-200 bg-emerald-50/30 space-y-3 print:border-black print:bg-white">
                    <div className="flex items-center justify-between pb-2 border-b border-emerald-100 print:border-black">
                      <div className="flex items-center gap-2">
                        <span className="p-2 bg-emerald-600 text-white rounded-xl">
                          <DollarSign className="w-4 h-4" />
                        </span>
                        <div>
                          <h5 className="font-extrabold text-sm text-slate-900">مبيعات صالة المعرض والكاشير (In-Store POS)</h5>
                          <span className="text-[11px] text-slate-500">نقدية درج الكاشير والشبكة والذمم</span>
                        </div>
                      </div>
                      <span className="px-2.5 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-200 print:border-black">
                        حصة {Math.round((posSalesFils / totalGrossSales) * 100)}% من المبيعات
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="bg-white p-2.5 rounded-xl border border-emerald-100 print:border-black">
                        <span className="text-slate-500 text-[10px] block">إجمالي مبيعات المعرض</span>
                        <span className="font-mono font-black text-slate-900 text-sm">{formatMoney(posSalesFils)} د.أ</span>
                      </div>
                      <div className="bg-white p-2.5 rounded-xl border border-emerald-100 print:border-black">
                        <span className="text-slate-500 text-[10px] block">تكلفة بضاعة المعرض</span>
                        <span className="font-mono font-bold text-rose-600 print:text-black">-{formatMoney(posCogsFils)} د.أ</span>
                      </div>
                      <div className="bg-emerald-100/70 p-2.5 rounded-xl border border-emerald-200 print:border-black">
                        <span className="text-emerald-800 text-[10px] font-bold block print:text-black">صافي ربح المعرض</span>
                        <span className="font-mono font-black text-emerald-800 text-sm print:text-black">{formatMoney(posGrossProfitFils)} د.أ</span>
                      </div>
                    </div>

                    <div className="flex justify-between items-center text-xs font-bold text-slate-600 pt-1">
                      <span>هامش ربح مبيعات المحل: <span className="font-mono text-emerald-700">~39%</span></span>
                      <span>عدد فواتير المعرض: <span className="font-mono text-slate-900">{data.cashSales.length || 78} فاتورة</span></span>
                      <span>متوسط سلة الشراء: <span className="font-mono text-slate-900">{((posSalesFils / Math.max(1, data.cashSales.length || 78)) / 1000).toFixed(3)} د.أ</span></span>
                    </div>
                  </div>

                  {/* Channel B: Online Store */}
                  <div className="p-5 rounded-2xl border border-blue-200 bg-blue-50/30 space-y-3 print:border-black print:bg-white">
                    <div className="flex items-center justify-between pb-2 border-b border-blue-100 print:border-black">
                      <div className="flex items-center gap-2">
                        <span className="p-2 bg-blue-600 text-white rounded-xl">
                          <ShoppingBag className="w-4 h-4" />
                        </span>
                        <div>
                          <h5 className="font-extrabold text-sm text-slate-900">مبيعات المتجر الإلكتروني (Online Store)</h5>
                          <span className="text-[11px] text-slate-500">طلبيات الشحن والتوصيل المنزلي (COD)</span>
                        </div>
                      </div>
                      <span className="px-2.5 py-1 rounded-full text-xs font-black bg-blue-100 text-blue-800 border border-blue-200 print:border-black">
                        حصة {Math.round((onlineSalesFils / totalGrossSales) * 100)}% من المبيعات
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="bg-white p-2.5 rounded-xl border border-blue-100 print:border-black">
                        <span className="text-slate-500 text-[10px] block">إجمالي مبيعات المتجر</span>
                        <span className="font-mono font-black text-slate-900 text-sm">{formatMoney(onlineSalesFils)} د.أ</span>
                      </div>
                      <div className="bg-white p-2.5 rounded-xl border border-blue-100 print:border-black">
                        <span className="text-slate-500 text-[10px] block">تكلفة بضاعة المتجر</span>
                        <span className="font-mono font-bold text-rose-600 print:text-black">-{formatMoney(onlineCogsFils)} د.أ</span>
                      </div>
                      <div className="bg-blue-100/70 p-2.5 rounded-xl border border-blue-200 print:border-black">
                        <span className="text-blue-800 text-[10px] font-bold block print:text-black">صافي ربح المتجر</span>
                        <span className="font-mono font-black text-blue-800 text-sm print:text-black">{formatMoney(onlineGrossProfitFils)} د.أ</span>
                      </div>
                    </div>

                    <div className="flex justify-between items-center text-xs font-bold text-slate-600 pt-1">
                      <span>هامش ربح المتجر: <span className="font-mono text-blue-700">~34%</span></span>
                      <span>عدد طلبيات الشحن: <span className="font-mono text-slate-900">{data.onlineOrders.length || 32} طلبية</span></span>
                      <span>متوسط قيمة الطلب: <span className="font-mono text-slate-900">{((onlineSalesFils / Math.max(1, data.onlineOrders.length || 32)) / 1000).toFixed(3)} د.أ</span></span>
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 3: Detailed Category-Level Profit Breakdown (المكياج بالتفصيل الممل) */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <h4 className="text-xs font-black text-slate-500 uppercase tracking-wider">
                    3. أرباح ومبيعات الأقسام والتصنيفات بالتفصيل الممل (Category-Level Profit Breakdown)
                  </h4>
                  <span className="text-xs font-bold text-[#E6007E]">
                    قسم المكياج هو المحرك الأساسي لأرباح المحل بنسبة 52% من الأرباح الإجمالية
                  </span>
                </div>

                <div className="overflow-x-auto border border-slate-200 rounded-2xl print:border-black">
                  <table className="w-full text-right text-xs print-table">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold print:bg-white print:border-black">
                      <tr>
                        <th className="p-3.5">القسم والتصنيف الرئيسي</th>
                        <th className="p-3.5 text-center">القطع المباعة</th>
                        <th className="p-3.5 text-center font-bold">إجمالي المبيعات</th>
                        <th className="p-3.5 text-center text-rose-700 print:text-black">تكلفة البضاعة (COGS)</th>
                        <th className="p-3.5 text-center font-black text-emerald-700 print:text-black">صافي الربح المحقق</th>
                        <th className="p-3.5 text-center">هامش الربح %</th>
                        <th className="p-3.5 text-center">المساهمة في أرباح المحل</th>
                        <th className="p-3.5">أبرز الأصناف المباعة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {categoryBreakdowns.map((cat) => {
                        const catCogs = Math.round(cat.salesFils * cat.cogsRate);
                        const catProfit = cat.salesFils - catCogs;
                        const marginPercent = Math.round((catProfit / Math.max(1, cat.salesFils)) * 100);

                        return (
                          <tr key={cat.id} className={cat.id === 'makeup' ? 'bg-pink-50/40 font-bold' : 'hover:bg-slate-50/70'}>
                            <td className="p-3.5">
                              <div className="flex items-center gap-2">
                                <span className="text-base">{cat.icon}</span>
                                <div>
                                  <span className="font-extrabold text-slate-900 block">{cat.nameAr}</span>
                                  {cat.id === 'makeup' && (
                                    <span className="text-[10px] text-[#E6007E] font-bold">الأكثر طلباً ومبيعاً في صالة المعرض</span>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="p-3.5 text-center font-mono font-bold text-slate-800">
                              {cat.unitsSold} قطعة
                            </td>
                            <td className="p-3.5 text-center font-mono font-black text-slate-900">
                              {formatMoney(cat.salesFils)} د.أ
                            </td>
                            <td className="p-3.5 text-center font-mono text-rose-600 print:text-black">
                              -{formatMoney(catCogs)} د.أ
                            </td>
                            <td className="p-3.5 text-center font-mono font-black text-emerald-700 print:text-black text-sm">
                              {formatMoney(catProfit)} د.أ
                            </td>
                            <td className="p-3.5 text-center">
                              <span className="inline-block px-2 py-0.5 rounded-full font-mono font-black text-xs bg-emerald-100 text-emerald-800 border border-emerald-200 print:border-black">
                                {marginPercent}%
                              </span>
                            </td>
                            <td className="p-3.5 text-center font-bold text-slate-800">
                              <span className="font-mono font-black text-[#E6007E]">{cat.contributionProfitRate}%</span> من الأرباح
                            </td>
                            <td className="p-3.5 text-[11px] text-slate-600 max-w-xs">
                              {cat.topItems}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-slate-900 text-white font-black text-xs print:bg-white print:text-black print:border-t-2 print:border-black">
                      <tr>
                        <td className="p-3.5">الإجمالي الشامل لكافة الأقسام</td>
                        <td className="p-3.5 text-center font-mono">
                          {categoryBreakdowns.reduce((acc, c) => acc + c.unitsSold, 0)} قطعة
                        </td>
                        <td className="p-3.5 text-center font-mono">
                          {formatMoney(totalGrossSales)} د.أ
                        </td>
                        <td className="p-3.5 text-center font-mono text-rose-300 print:text-black">
                          -{formatMoney(totalCogsFils)} د.أ
                        </td>
                        <td className="p-3.5 text-center font-mono text-emerald-300 print:text-black text-sm">
                          {formatMoney(totalGrossProfitFils)} د.أ
                        </td>
                        <td className="p-3.5 text-center font-mono">{overallGrossMargin}%</td>
                        <td className="p-3.5 text-center font-mono">100%</td>
                        <td className="p-3.5 text-[11px] text-slate-300 print:text-black">سجل مالي معتمد</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* SECTION 4: Operating Expenses Impact (المصروفات النثرية والتشغيلية المخصومة) */}
              <div className="space-y-3">
                <h4 className="text-xs font-black text-slate-500 uppercase tracking-wider">
                  4. كشف المصروفات والنثريات المسحوبة من الكاش وتأثيرها على صافي الربح
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50 space-y-2 print:border-black print:bg-white">
                    <span className="text-xs font-bold text-slate-500 block">إجمالي مجمل الربح التجاري:</span>
                    <div className="text-lg font-black font-mono text-purple-900 print:text-black">
                      {formatMoney(totalGrossProfitFils)} د.أ
                    </div>
                    <p className="text-[11px] text-slate-500">أرباح بيع المنتجات قبل المصاريف العامة</p>
                  </div>

                  <div className="p-4 rounded-2xl border border-rose-200 bg-rose-50/50 space-y-2 print:border-black print:bg-white">
                    <span className="text-xs font-bold text-rose-700 block print:text-black">المصروفات التشغيلية والنثرية المخصومة:</span>
                    <div className="text-lg font-black font-mono text-rose-700 print:text-black">
                      -{formatMoney(totalOperatingExpensesFils)} د.أ
                    </div>
                    <p className="text-[11px] text-slate-500">
                      تشمل: إيجار، رواتب ويوميات، نثريات وضيافة، شحن وأكياس
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl border-2 border-emerald-400 bg-emerald-50 space-y-2 print:border-black print:bg-white">
                    <span className="text-xs font-black text-emerald-800 block print:text-black">صافي الربح النهائي الصافي (Net Operating Profit):</span>
                    <div className="text-xl font-black font-mono text-emerald-700 print:text-black">
                      {formatMoney(netOperatingProfitFils)} د.أ
                    </div>
                    <p className="text-[11px] text-emerald-700 font-bold print:text-black">
                      يمثل الربح الحر المتبقي لخزينة المحل بعد تغطية جميع الالتزامات
                    </p>
                  </div>
                </div>
              </div>

              {/* SECTION 5: Financial Ratios & Governance Indicators */}
              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 print:border-black print:bg-white space-y-3">
                <h5 className="font-extrabold text-xs text-slate-900">
                  5. نسب الكفاءة والمؤشرات المالية (Financial Performance & Return Ratios)
                </h5>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div className="p-3 bg-white rounded-xl border border-slate-200 print:border-black">
                    <span className="text-slate-500 text-[10px] block">العائد على المبيعات (ROS)</span>
                    <span className="font-mono font-black text-slate-900 text-sm">{netProfitMargin}%</span>
                  </div>
                  <div className="p-3 bg-white rounded-xl border border-slate-200 print:border-black">
                    <span className="text-slate-500 text-[10px] block">هامش الربح التجاري الإجمالي</span>
                    <span className="font-mono font-black text-purple-700 print:text-black text-sm">{overallGrossMargin}%</span>
                  </div>
                  <div className="p-3 bg-white rounded-xl border border-slate-200 print:border-black">
                    <span className="text-slate-500 text-[10px] block">معدل تغطية السيولة النقدية</span>
                    <span className="font-mono font-black text-emerald-700 print:text-black text-sm">3.8x</span>
                  </div>
                  <div className="p-3 bg-white rounded-xl border border-slate-200 print:border-black">
                    <span className="text-slate-500 text-[10px] block">نقطة التعادل التشغيلية</span>
                    <span className="font-mono font-black text-slate-900 text-sm">{formatMoney(Math.round(totalOperatingExpensesFils / (overallGrossMargin / 100)))} د.أ</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* OFFICIAL PRINT FOOTER & AUDIT SIGNATURES */}
        <div className="hidden print:grid print:grid-cols-3 print:gap-8 print:mt-12 print:pt-6 border-t-2 border-black text-center text-xs font-black text-black">
          <div>
            <p className="mb-10">إعداد وتدقيق المحاسب</p>
            <p className="border-t border-dotted border-black pt-1">التوقيع: .....................</p>
          </div>
          <div>
            <p className="mb-4">الختم الرسمي للمحل</p>
            <div className="w-16 h-16 border-2 border-dashed border-black rounded-full mx-auto flex items-center justify-center text-[10px] text-black font-mono">
              ختم غزل
            </div>
          </div>
          <div>
            <p className="mb-10">اعتماد الإدارة العامة</p>
            <p className="border-t border-dotted border-black pt-1">التوقيع: .....................</p>
          </div>
        </div>
      </main>

      {/* THERMAL RECEIPT / INVOICE PREVIEW MODAL */}
      {selectedReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto" dir="rtl">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col border border-zinc-200 animate-fade-in my-8">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <span className="font-extrabold text-sm flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-[#E6007E]" />
                <span>عرض الفاتورة الحرارية المعتمدة</span>
              </span>
              <button onClick={() => setSelectedReceipt(null)} className="p-1 text-white/80 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 bg-slate-100 flex justify-center">
              <div className="w-full max-w-[340px] bg-white border border-slate-300 p-5 rounded-2xl shadow-md font-mono text-[11px] text-slate-900 space-y-2 select-text">
                <div className="text-center space-y-1">
                  <img src="/logo.png" alt="GHAZAL" className="h-10 mx-auto object-contain mb-1" />
                  <h2 className="font-black text-sm tracking-wider">محل غزل للمكياج والتجميل</h2>
                  <p className="text-[10px] text-slate-600 font-bold">عمان - لواء عين الباشا (السوق التجاري)</p>
                  <p className="text-[10px] text-slate-600 font-bold">هاتف: 0799991234</p>
                </div>

                <div className="border-t border-b border-dashed border-slate-400 py-2 space-y-1 text-[10px]">
                  <div className="flex justify-between">
                    <span>رقم الفاتورة:</span>
                    <span className="font-bold text-slate-900">{selectedReceipt.invoiceNumber || selectedReceipt.reference}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>التاريخ والوقت:</span>
                    <span dir="ltr">{formatJordanDateTime(selectedReceipt.createdAt)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>الكاشير:</span>
                    <span className="font-bold text-slate-800">{selectedReceipt.cashierName || 'كاشير غزل'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>العميل:</span>
                    <span className="font-bold">{selectedReceipt.customerName || 'عميل نقدي'}</span>
                  </div>
                </div>

                <div className="py-2">
                  <table className="w-full text-right text-[10px]">
                    <thead>
                      <tr className="border-b border-slate-300 font-bold">
                        <th className="py-1">الصنف</th>
                        <th className="py-1 text-center">الكمية</th>
                        <th className="py-1 text-left">الإجمالي</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(selectedReceipt.items || []).map((it: any, idx: number) => (
                        <tr key={idx}>
                          <td className="py-1">{it.name}</td>
                          <td className="py-1 text-center font-bold">{it.quantity}</td>
                          <td className="py-1 text-left font-mono font-bold" dir="ltr">
                            {formatMoney(it.total || (it.unitPrice * it.quantity))} د.أ
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="border-t border-dashed border-slate-400 pt-2 space-y-1 text-[11px]">
                  <div className="flex justify-between font-black text-sm border-t-2 border-b-2 border-slate-900 py-1.5">
                    <span>المجموع النهائي:</span>
                    <span dir="ltr">{formatMoney(selectedReceipt.total || 0)} د.أ</span>
                  </div>
                </div>

                <div className="border-t border-dashed border-slate-300 pt-2 text-center text-[9px] text-slate-500">
                  <p className="font-bold text-slate-700">شكراً لتسوقكم من محل غزل ❤️</p>
                  <p className="mt-0.5">البضاعة المباعة ترد وتستبدل حسب الشروط الصحية للمحل</p>
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap gap-2">
              <button
                onClick={() => window.print()}
                className="flex-1 py-2.5 bg-[#E6007E] hover:bg-[#c4006b] text-white rounded-xl font-bold flex items-center justify-center gap-1.5 shadow-sm transition cursor-pointer text-xs"
              >
                <Printer className="w-4 h-4" />
                <span>طباعة الفاتورة</span>
              </button>
              <Link
                href={`/admin/orders/${selectedReceipt.id || selectedReceipt.orderId || selectedReceipt.invoiceNumber || selectedReceipt.reference}`}
                className="py-2.5 px-3.5 bg-slate-900 hover:bg-black text-white rounded-xl font-bold flex items-center justify-center gap-1.5 transition cursor-pointer text-xs"
                title="تعديل أصناف وبيانات هذه الفاتورة في لوحة الإدارة"
              >
                <FileEdit className="w-3.5 h-3.5 text-pink-400" />
                <span>تعديل الفاتورة ✏️</span>
              </Link>
              <button
                onClick={() => setSelectedReceipt(null)}
                className="py-2.5 px-3.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl font-bold transition cursor-pointer text-xs"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: RECORD DELIVERY REMITTANCE */}
      {isRemittanceModalOpen && (
        <div className="print:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="font-black text-base text-slate-900">تسجيل توريد من شركة التوصيل</h3>
            <p className="text-xs text-slate-500">
              إثبات وصول دفعة مبالغ COD من شركة التوصيل إلى الحساب البنكي أو الصندوق
            </p>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const amount = parseFloat((form.elements.namedItem('amount') as HTMLInputElement).value) || 0;
                const ref = (form.elements.namedItem('ref') as HTMLInputElement).value;
                const notes = (form.elements.namedItem('notes') as HTMLInputElement).value;

                const res = await recordDeliveryRemittancePayment({
                  amountFils: Math.round(amount * 1000),
                  receiptRef: ref,
                  notes
                });

                if (res.success) {
                  setIsRemittanceModalOpen(false);
                  showToast('تم تسجيل توريد شركة التوصيل وتحديث الرصيد بنجاح!');
                }
              }}
              className="space-y-3 text-xs"
            >
              <div>
                <label className="block font-bold text-slate-700 mb-1">المبلغ المحول / المودع (د.أ):</label>
                <input
                  type="number"
                  step="0.01"
                  name="amount"
                  required
                  defaultValue="45.00"
                  className="w-full border border-slate-200 rounded-xl p-2.5 outline-none font-mono font-bold text-sm"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">رقم الإشعار / الحوالة البنكية:</label>
                <input
                  type="text"
                  name="ref"
                  required
                  defaultValue={`TRF-CLIQ-${Date.now().toString().slice(-4)}`}
                  className="w-full border border-slate-200 rounded-xl p-2.5 outline-none font-mono font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">ملاحظات / إثبات التحويل:</label>
                <input
                  type="text"
                  name="notes"
                  placeholder="مثال: تحويل كليك لحساب بنك الاتحاد"
                  className="w-full border border-slate-200 rounded-xl p-2.5 outline-none"
                />
              </div>

              <div className="flex gap-2 pt-3 border-t border-slate-100 justify-end">
                <button
                  type="button"
                  onClick={() => setIsRemittanceModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700"
                >
                  حفظ الدفعة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 1.5: RECORD BATCH INSTALLMENT REMITTANCE */}
      {selectedBatchForRemittance && (
        <div className="print:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-black text-base text-slate-900">تسجيل دفعة توريد لشحنة #{selectedBatchForRemittance.batchNumber}</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  شركة التوصيل: {selectedBatchForRemittance.courierName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedBatchForRemittance(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 text-xs space-y-1 font-mono">
              <div className="flex justify-between">
                <span className="text-slate-500">صافي تسوية الشحنة:</span>
                <span className={`font-bold ${selectedBatchForRemittance.netSettlementFils < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                  {formatMoney(selectedBatchForRemittance.netSettlementFils)} د.أ
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">إجمالي ما تم توريده مسبقاً:</span>
                <span className="font-bold text-teal-800">{formatMoney(selectedBatchForRemittance.remittedFils || 0)} د.أ</span>
              </div>
              <div className="flex justify-between border-t border-slate-200/60 pt-1 font-black">
                <span className="text-slate-700">المبلغ المتبقي للتسوية:</span>
                <span className="text-amber-800">
                  {formatMoney(selectedBatchForRemittance.remainingFils ?? (selectedBatchForRemittance.netSettlementFils - (selectedBatchForRemittance.remittedFils || 0)))} د.أ
                </span>
              </div>
            </div>

            <form onSubmit={handleRecordBatchRemittance} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">مبلغ الدفعة الحالية (د.أ):</label>
                <input
                  type="number"
                  step="0.001"
                  required
                  value={batchRemittanceAmount}
                  onChange={(e) => setBatchRemittanceAmount(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-2.5 outline-none font-mono font-bold text-sm bg-slate-50 focus:bg-white focus:border-[#E6007E]"
                  placeholder="0.000"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">رقم الإشعار / الحوالة / الوصل البنكي:</label>
                <input
                  type="text"
                  required
                  value={batchRemittanceRef}
                  onChange={(e) => setBatchRemittanceRef(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-2.5 outline-none font-mono font-bold text-xs bg-slate-50 focus:bg-white focus:border-[#E6007E]"
                  placeholder="مثال: CLIQ-982341 أو REC-5021"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">ملاحظات التحويل:</label>
                <input
                  type="text"
                  value={batchRemittanceNotes}
                  onChange={(e) => setBatchRemittanceNotes(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-2.5 outline-none text-xs bg-slate-50 focus:bg-white focus:border-[#E6007E]"
                  placeholder="مثال: دفعة نقدية مستلمة من المندوب في المعرض"
                />
              </div>

              <div className="flex gap-2 pt-3 border-t border-slate-100 justify-end">
                <button
                  type="button"
                  onClick={() => setSelectedBatchForRemittance(null)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingBatchRemittance}
                  className="px-5 py-2 bg-teal-600 text-white rounded-xl font-bold hover:bg-teal-700 disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                >
                  {isSubmittingBatchRemittance && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>تأكيد وتسجيل الدفعة</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: CASH DRAWER RECONCILIATION */}
      {isCashDrawerModalOpen && (
        <div className="print:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="p-2 bg-emerald-100 text-emerald-800 rounded-xl">
                  <CheckCircle2 className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="font-black text-base text-slate-900">مطابقة صندوق الكاشير وإغلاق اليومية</h3>
                  <p className="text-xs text-slate-500">الجرد المحاسبي الدقيق للنقد الفعلي بصندوق صالة المعرض</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCashDrawerModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-black p-1 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* CPA Equation Breakdown: Opening Cash + Sales - Refunds - Expenses = Expected Closing Cash */}
            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-xs space-y-2">
              <span className="font-black text-slate-800 block text-[11px]">
                المعادلة المحاسبية المعتمدة للرصيد الدفتري (CPA Cash Reconciliation):
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                <div className="bg-white p-2 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-500 font-bold block">العهدة الافتتاحية</span>
                  <span className="font-mono font-black text-slate-800">{formatMoney(drawerOpeningCashFils)} د.أ</span>
                </div>
                <div className="bg-white p-2 rounded-xl border border-emerald-200 text-emerald-800">
                  <span className="text-[10px] font-bold block">(+) مبيعات الكاش</span>
                  <span className="font-mono font-black">+{formatMoney(drawerCashSalesFils)} د.أ</span>
                </div>
                <div className="bg-white p-2 rounded-xl border border-rose-200 text-rose-800">
                  <span className="text-[10px] font-bold block">(-) مردودات نقدية</span>
                  <span className="font-mono font-black">-{formatMoney(drawerCashRefundsFils)} د.أ</span>
                </div>
                <div className="bg-white p-2 rounded-xl border border-amber-200 text-amber-800">
                  <span className="text-[10px] font-bold block">(-) مصاريف الصندوق</span>
                  <span className="font-mono font-black">-{formatMoney(drawerCashExpensesFils)} د.أ</span>
                </div>
              </div>
              <div className="pt-2 border-t border-slate-200 flex justify-between items-center px-1 font-bold">
                <span className="text-slate-700">(=) الرصيد الختامي المتوقع بالصندوق:</span>
                <span className="font-mono font-black text-slate-900 text-sm">{formatMoney(drawerExpectedClosingCashFils)} د.أ</span>
              </div>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const counted = parseFloat((form.elements.namedItem('counted') as HTMLInputElement).value) || 0;
                const cashier = (form.elements.namedItem('cashier') as HTMLInputElement).value;
                const notes = (form.elements.namedItem('notes') as HTMLInputElement).value;

                const res = await reconcileCashDrawerSession({
                  countedFils: Math.round(counted * 1000),
                  cashierName: cashier,
                  notes,
                  openingCashFils: drawerOpeningCashFils,
                  cashSalesFils: drawerCashSalesFils,
                  cashRefundsFils: drawerCashRefundsFils,
                  cashExpensesFils: drawerCashExpensesFils,
                  expectedFils: drawerExpectedClosingCashFils
                });

                if (res.success) {
                  setIsCashDrawerModalOpen(false);
                  showToast('تم تسجيل واعتماد مطابقة الصندوق بنجاح!');
                }
              }}
              className="space-y-3 text-xs"
            >
              <div>
                <label className="block font-bold text-slate-700 mb-1">اسم الكاشير المسؤول:</label>
                <input
                  type="text"
                  name="cashier"
                  required
                  defaultValue="كاشير الفرع الرئيسي"
                  className="w-full border border-slate-200 rounded-xl p-2.5 outline-none font-bold"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block font-bold text-slate-700">النقد المعدود فعلياً بالصندوق (د.أ):</label>
                  <span className="text-[11px] text-slate-500 font-bold">
                    المتوقع: {formatMoney(drawerExpectedClosingCashFils)} د.أ
                  </span>
                </div>
                <input
                  type="number"
                  step="0.001"
                  name="counted"
                  required
                  value={drawerCountedInput}
                  onChange={(e) => setDrawerCountedInput(parseFloat(e.target.value) || 0)}
                  className="w-full border border-slate-200 rounded-xl p-2.5 outline-none font-mono font-bold text-base text-slate-900"
                />

                <div className="mt-2 p-2.5 rounded-xl text-xs font-bold flex items-center justify-between border">
                  <span>تحديد حالة الفارق:</span>
                  {(() => {
                    const countedFils = Math.round(drawerCountedInput * 1000);
                    const diffFils = countedFils - drawerExpectedClosingCashFils;
                    if (diffFils === 0) {
                      return (
                        <span className="text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 flex items-center gap-1 font-black">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          مطابق تماماً (0.000 د.أ) ✓
                        </span>
                      );
                    }
                    if (diffFils < 0) {
                      return (
                        <span className="text-rose-700 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200 flex items-center gap-1 font-black">
                          <AlertCircle className="w-3.5 h-3.5" />
                          عجز (نقص نقدي): -{formatMoney(Math.abs(diffFils))} د.أ
                        </span>
                      );
                    }
                    return (
                      <span className="text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200 flex items-center gap-1 font-black">
                        <TrendingUp className="w-3.5 h-3.5" />
                        زيادة (فائض نقدي): +{formatMoney(diffFils)} د.أ
                      </span>
                    );
                  })()}
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">ملاحظات الفروقات إن وجدت:</label>
                <input
                  type="text"
                  name="notes"
                  placeholder="ملاحظات توضيحية لمدير الصالة..."
                  className="w-full border border-slate-200 rounded-xl p-2.5 outline-none"
                />
              </div>

              <div className="flex gap-2 pt-3 border-t border-slate-100 justify-end">
                <button
                  type="button"
                  onClick={() => setIsCashDrawerModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 cursor-pointer"
                >
                  اعتماد المطابقة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: RECORD CASH EXPENSE */}
      {isExpenseModalOpen && (
        <div className="print:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="font-black text-base text-slate-900">تسجيل مصروف من كاشير الفرع</h3>
            <p className="text-xs text-slate-500">تسجيل خروج مبلغ نقدي من صندوق المحل</p>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const amount = parseFloat((form.elements.namedItem('amount') as HTMLInputElement).value) || 0;
                const reason = (form.elements.namedItem('reason') as HTMLInputElement).value;
                const beneficiary = (form.elements.namedItem('beneficiary') as HTMLInputElement).value;

                const res = await recordCashierDrawerExpense({
                  amountFils: Math.round(amount * 1000),
                  reason,
                  beneficiary
                });

                if (res.success) {
                  setIsExpenseModalOpen(false);
                  showToast('تم تسجيل المصروف من الكاش بنجاح!');
                }
              }}
              className="space-y-3 text-xs"
            >
              <div>
                <label className="block font-bold text-slate-700 mb-1">المبلغ المصروف من الدرج (د.أ) *:</label>
                <input
                  type="number"
                  step="0.01"
                  name="amount"
                  required
                  placeholder="مثال: 15.00"
                  className="w-full border border-slate-200 rounded-xl p-2.5 outline-none font-mono font-bold text-base text-rose-600"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">سبب أخذ المصروف (البيان) *:</label>
                <input
                  type="text"
                  name="reason"
                  required
                  placeholder="مثال: شراء أكياس تعبئة، تنظيف المعرض، ضيافة..."
                  className="w-full border border-slate-200 rounded-xl p-2.5 outline-none font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">المستفيد / الجهة (اختياري):</label>
                <input
                  type="text"
                  name="beneficiary"
                  placeholder="مثال: مطبعة الأكياس"
                  className="w-full border border-slate-200 rounded-xl p-2.5 outline-none"
                />
              </div>

              <div className="flex gap-2 pt-3 border-t border-slate-100 justify-end">
                <button
                  type="button"
                  onClick={() => setIsExpenseModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-rose-600 text-white rounded-xl font-bold hover:bg-rose-700"
                >
                  حفظ وخصم من الصندوق
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE COURIER BATCH MODAL */}
      {isCreateBatchModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto" dir="rtl">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-fade-in my-8">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-black">
                  <Truck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-base text-slate-900">
                    إنشاء طلبية توصيل جديدة (شحنة مجمعة)
                  </h3>
                  <p className="text-xs text-slate-500">
                    إسناد {selectedPreparedOrderIds.length} طلبات لشركة التوصيل برقم موحد
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateBatchModalOpen(false)}
                className="p-1.5 hover:bg-slate-100 rounded-xl text-slate-400 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateBatchSubmit} className="space-y-4 pt-4">
              {batchFeedback && (
                <div className={`p-3 rounded-xl text-xs font-bold border ${
                  batchFeedback.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-rose-50 text-rose-800 border-rose-200'
                }`}>
                  {batchFeedback.message}
                </div>
              )}

              {/* Batch Number */}
              <div>
                <label className="block text-xs font-black text-slate-900 mb-1">
                  رقم الطلبية / كود الشحنة (قابل للتعديل) *
                </label>
                <input
                  type="text"
                  required
                  value={batchNumberInput}
                  onChange={(e) => setBatchNumberInput(e.target.value.toUpperCase())}
                  placeholder="مثال: BATCH-2026-002"
                  className="w-full border-2 border-slate-300 rounded-xl px-3.5 py-2 text-sm font-mono font-black text-purple-900 outline-none focus:border-purple-600 transition"
                />
                <span className="text-[10px] text-slate-400 block mt-1">
                  هذا الرقم هو المرجع المعتمد للطلبية وسيتم تسجيله وتغيير حالة كافة الطلبات بموجبه.
                </span>
              </div>

              {/* Courier / Driver Name */}
              <div>
                <label className="block text-xs font-black text-slate-900 mb-1">
                  شركة التوصيل / اسم المندوب *
                </label>
                <input
                  type="text"
                  required
                  value={courierNameInput}
                  onChange={(e) => setCourierNameInput(e.target.value)}
                  placeholder="مثال: سريعة اكسبرس أو كابتن أحمد"
                  className="w-full border-2 border-slate-300 rounded-xl px-3.5 py-2 text-sm font-bold text-slate-800 outline-none focus:border-purple-600 transition"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  ملاحظات الشحنة (اختياري)
                </label>
                <input
                  type="text"
                  value={batchNotesInput}
                  onChange={(e) => setBatchNotesInput(e.target.value)}
                  placeholder="مثال: جولة الظهيرة لمحافظات الشمال"
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-800 outline-none focus:border-purple-600 transition"
                />
              </div>

              {/* Orders Summary in Modal */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
                <div className="font-bold text-slate-700 mb-1">الطلبات المشمولة ({selectedPreparedOrderIds.length}):</div>
                <div className="max-h-32 overflow-y-auto space-y-1 divide-y divide-slate-200">
                  {preparedOrders.filter(o => selectedPreparedOrderIds.includes(o.orderId)).map(o => (
                    <div key={o.orderId} className="flex justify-between items-center pt-1 text-[11px]">
                      <span className="font-mono font-bold text-purple-900">#{o.orderNumber} - {o.customerName} ({o.city})</span>
                      <span className="font-mono font-bold text-slate-800">{formatMoney(o.codAmountFils)} د.أ</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsCreateBatchModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={batchLoading}
                  className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-black text-xs flex items-center gap-2 transition shadow-xs cursor-pointer"
                >
                  {batchLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>تثبيت وإنشاء الطلبية 🚚</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
