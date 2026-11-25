'use server';

import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/dal';
import { revalidatePath } from 'next/cache';
import { formatJordanDateTime } from '@/lib/date';
import { getDemoOrderById } from '@/lib/orders-catalog';
import {
  calculateCashDrawerReconciliation,
  calculateCourierBatchSettlement,
  calculateNetSettlement,
  calculateOrderNetSettlement,
  calculateProfitAndLoss,
  filsToDisplay,
  jodToFils
} from '@/lib/money';

// ====================================================================
// TYPES & DATA STRUCTURES FOR SINGLE-STORE INVENTORY & SETTLEMENTS
// ====================================================================

export type StoreChannel = 'ALL' | 'POS' | 'ONLINE';

export interface StoreInventoryItem {
  id: string;
  productId: string;
  name: string;
  sku: string;
  barcode: string;
  imageUrl?: string;
  brand: string;
  category: string;
  specification: string; // Color, Shade, or Size
  physicalStock: number; // الموجود فعلياً بالمحل
  reservedStock: number; // المحجوز للطلبات المعلقة
  availableStock: number; // المتاح للبيع = الموجود - المحجوز
  unitCostFils: number; // تكلفة الشراء للقطعة بالفلس
  sellingPriceFils: number; // سعر البيع للجمهور بالفلس
  reorderLevel: number; // حد إعادة الطلب
  channel: StoreChannel; // كاش وصالة العرض، المتجر الإلكتروني، أو كلاهما
  isLowStock: boolean; // تنبيه الكمية منخفضة
  isVisible: boolean; // حالة الظهور في المتجر والكاشير (زر الإخفاء)
}

export interface CashSaleRecord {
  id: string;
  receiptNumber: string;
  date: string;
  cashierName: string;
  totalFils: number;
  itemsCount: number;
  paymentMethod: string;
  customerName?: string;
  status?: string;
  isRefunded?: boolean;
  isModified?: boolean;
  refundAmountFils?: number;
  notes?: string | null;
}

export interface CourierCompany {
  id: string;
  name: string;
  phone: string;
  type: 'COMPANY' | 'DELEGATE';
  active: boolean;
  defaultFeeFils?: number;
  isDefaultStoreCourier?: boolean;
  notes?: string;
  createdAt: string;
}

export interface OnlineOrderRecord {
  id: string;
  orderNumber: string;
  date: string;
  customerName: string;
  city: string;
  phone: string;
  totalFils: number;
  status: string;
  paymentMethod: string;
}

export interface DeliveryOrderRecord {
  id: string;
  orderNumber: string;
  companyName: string;
  customerName: string;
  city: string;
  codAmountFils: number;
  deliveryFeeFils: number;
  netSettlementFils: number;
  status: 'DELIVERED_COLLECTED' | 'IN_TRANSIT' | 'RETURNED' | 'SETTLED';
  date: string;
  settledAt?: string;
  settledBy?: string;
}

export interface CourierBatchOrderSummary {
  orderId: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  city: string;
  address?: string;
  codAmountFils: number; // المبلغ المطلوب تحصيله (Expected COD)
  collectedCodFils?: number | null; // المبلغ المحصل فعلياً (Actual Collected COD)
  deliveryFeeFils: number; // أجور التوصيل
  returnFeeFils?: number; // أجور إرجاع الطلب عند فشل التوصيل أو الارتجاع
  discrepancyFils?: number; // فروقات التحصيل = المحصل فعلياً - المتوقع
  netSettlementFils: number; // صافي تسوية الطلب = المحصل - أجور التوصيل - أجور الإرجاع
  status: 'DELIVERED' | 'DELIVERED_COLLECTED' | 'RETURNED' | 'CANCELLED' | 'IN_TRANSIT' | 'OUT_FOR_DELIVERY' | 'FAILED_ATTEMPT' | 'SHIPPED' | string;
  settledAt?: string;
  notes?: string;
}

export interface CourierBatchRemittance {
  id: string;
  amountFils: number;
  receiptRef: string;
  paidAt: string;
  paidBy?: string;
  notes?: string;
}

export interface CourierBatchRecord {
  id: string;
  batchNumber: string; // رقم الطلبية (قابل للتعديل)
  courierName: string; // شركة التوصيل أو اسم المندوب
  status: 'PREPARED' | 'OUT_FOR_DELIVERY' | 'PARTIALLY_DELIVERED' | 'DELIVERED' | 'PARTIALLY_SETTLED' | 'SETTLED' | 'CANCELLED' | 'LIABILITY_OWED' | string;
  orders: CourierBatchOrderSummary[];
  totalExpectedCodFils: number; // إجمالي التحصيل المتوقع لجميع طلبات الشحنة
  totalCollectedCodFils: number; // التحصيل الفعلي للطلبات المسلمة
  totalCodFils: number; // التحصيل الفعلي (للتوافق)
  totalDeliveryFeeFils: number; // أجور التوصيل للطلبات المسلمة
  totalReturnFeeFils: number; // أجور إرجاع الطلبات المرتجعة
  totalCourierFeesFils: number; // مجموع الأجور المستحقة لشركة التوصيل
  netSettlementFils: number; // صافي المبلغ المستحق (يمكن أن يكون سالباً عند زيادة الأجور عن التحصيل)
  storeReceivableFils: number; // مستحق للمحل
  companyPayableFils: number; // التزام مستحق لشركة التوصيل
  remittedFils: number; // ما تم توريده عبر دفعات
  remainingFils: number; // المتبقي للتوريد
  remittances?: CourierBatchRemittance[];
  deliveredOrdersCount: number;
  returnedOrdersCount: number;
  inTransitOrdersCount: number;
  isPartialSettlement: boolean;
  createdAt: string;
  updatedAt: string;
  notes?: string;
}

export type AuditSessionStatus = 
  | 'DRAFT'            // مسودة: تم فتح الجرد ولم يبدأ العد
  | 'IN_PROGRESS'      // قيد الجرد: الموظف يعدّ المنتجات
  | 'NEEDS_REVIEW'     // يحتاج مراجعة: ظهر اختلاف في الكميات
  | 'PENDING_APPROVAL' // بانتظار الاعتماد: تمت مراجعة الفروقات وتحتاج موافقة الإدارة
  | 'COMPLETED';       // مكتمل: اعتمدت النتائج وسُجلت التصحيحات اللازمة

export interface AuditSessionItem {
  id: string;
  sku: string;
  name: string;
  specification: string;
  channel: StoreChannel;
  bookStock: number; // الكمية المسجلة بالنظام
  countedStock?: number; // الكمية التي عُدّت فعلياً
  variance: number; // countedStock - bookStock
  unitCostFils: number;
  varianceValueFils: number; // الأثر المالي للفارق
  reason?: string; // سبب الفرق: عجز، تلف، عينات تجربة، حركة غير مقيدة
  status: 'MATCH' | 'SHORTAGE' | 'SURPLUS' | 'UNCOUNTED';
  recounted: boolean; // هل تمت إعادة العد للتأكد؟
  auditorNotes?: string;
}

export interface AuditSession {
  id: string;
  sessionNumber: string; // e.g., AUD-2026-001
  channel: StoreChannel;
  status: AuditSessionStatus;
  auditorName: string;
  approverName?: string;
  createdAt: string;
  approvedAt?: string;
  totalItemsCount: number;
  uncountedCount: number;
  variancesCount: number;
  totalBookValueFils: number;
  totalCountedValueFils: number;
  netVarianceFils: number;
  items: AuditSessionItem[];
}

export type GoodsMovementType = 
  | 'PURCHASE_RECEIPT'   // استلام مشتريات (دخول)
  | 'ORDER_RESERVATION'  // حجز لطلب زبونة (حجز)
  | 'ORDER_DISPATCH'     // خروج طلب للتوصيل (خروج)
  | 'RESERVATION_RELEASE'// إلغاء حجز لطلب ملغى (تحرير)
  | 'RETURN_RESTOCKED'   // مرتجع صالح وتمت إعادته للبيع (دخول)
  | 'RETURN_DAMAGED'     // مرتجع تالف غير صالح للبيع (إتلاف)
  | 'AUDIT_ADJUSTMENT';  // تسوية جرد بعد الاعتماد (تصحيح)

export interface GoodsMovement {
  id: string;
  sku: string;
  productName: string;
  specification: string;
  channel: StoreChannel;
  type: GoodsMovementType;
  reference: string; // رقم الطلب #ORD-101 أو فاتورة الشراء #PO-501 أو محضر الجرد
  qtyBefore: number;
  qtyChange: number; // موجب للدخول وتحرير الحجز، سالب للخروج والتلف
  qtyAfter: number;
  employeeName: string;
  createdAt: string;
  notes?: string;
}

export interface DeliverySettlementStatement {
  companyName: string;
  period: string;
  codRequiredFils: number; // COD المطلوب من الزبائن (200.000)
  codCollectedFils: number; // COD المحصل فعلياً (180.000)
  deliveryFeesDeductibleFils: number; // رسوم التوصيل القابلة للخصم (15.000)
  netSettlementExpectedFils: number; // صافي التوريد المتوقع (165.000)
  remittedFils: number; // تم توريده فعلياً للحساب (120.000)
  remainingFils: number; // المتبقي للتوريد (45.000)
  remittances: Array<{
    id: string;
    receiptRef: string;
    amountFils: number;
    date: string;
    notes?: string;
    status: 'CONFIRMED' | 'PENDING';
  }>;
}

export interface CashDrawerSettlement {
  id: string;
  date: string;
  shiftName: string;
  cashierName: string;
  openingCashFils?: number; // رصيد بداية الوردية (العهدة الافتتاحية)
  cashSalesFils?: number; // إجمالي مبيعات الكاش المقبوضة
  cashRefundsFils?: number; // إجمالي المردودات النقدية
  cashExpensesFils?: number; // إجمالي المصروفات النقدية من الصندوق
  expectedCashFils: number; // النقد المتوقع بالصندوق = افتتاح + مبيعات - مردودات - مصروفات
  countedCashFils: number; // النقد المعدود فعلياً
  varianceFils: number; // الفرق: موجب (زيادة) أو سالب (عجز)
  status: 'RECONCILED' | 'VARIANCE_PENDING' | 'APPROVED';
  notes?: string;
  approvedBy?: string;
}

export interface BankSettlement {
  id: string;
  date: string;
  source: 'POS_CARD' | 'ONLINE_GATEWAY';
  systemRecordedFils: number;
  bankDepositedFils: number;
  varianceFils: number;
  referenceNumber: string;
  status: 'SETTLED' | 'PENDING_CLEARING';
  notes?: string;
}

export interface PurchaseInvoice {
  id: string;
  invoiceNumber: string;
  supplierName: string;
  supplierPhone?: string;
  items: Array<{
    sku: string;
    name: string;
    quantity: number;
    unitCostFils: number;
    totalFils: number;
  }>;
  totalCostFils: number;
  paymentStatus: 'PAID' | 'CREDIT' | 'PARTIAL';
  deliveryStatus: 'RECEIVED' | 'IN_TRANSIT';
  paidAmountFils: number;
  remainingAmountFils: number;
  createdAt: string;
  notes?: string;
}

export interface OperatingExpense {
  id: string;
  expenseNumber: string;
  category: 'إيجار المحل' | 'فواتير الكهرباء' | 'فواتير المياه والإنترنت' | 'إعلانات وتسويق' | 'إيجار المعرض' | 'رواتب ومكافآت' | 'تغليف ومستلزمات' | 'استضافة وبرمجيات' | 'صيانة ومصاريف عامة' | string;
  amountFils: number;
  beneficiary: string;
  paymentMethod: 'CASH' | 'BANK';
  paymentStatus: 'PAID' | 'DUE';
  date: string;
  recordedBy: string;
  proofAttachment?: string;
  notes?: string;
}

// ====================================================================
// DATABASE-DRIVEN SETTLEMENTS & INVENTORY STATE
// ====================================================================

interface StoreSettlementsState {
  inventory: Record<string, {
    physicalStock: number;
    reservedStock: number;
    unitCostFils: number;
    reorderLevel: number;
    channel: StoreChannel;
  }>;
  auditSessions: AuditSession[];
  goodsMovements: GoodsMovement[];
  deliverySettlement: DeliverySettlementStatement;
  cashDrawerSettlements: CashDrawerSettlement[];
  bankSettlements: BankSettlement[];
  purchaseInvoices: PurchaseInvoice[];
  operatingExpenses: OperatingExpense[];
  deliveryOrders: DeliveryOrderRecord[];
  courierBatches?: CourierBatchRecord[];
  courierCompanies?: CourierCompany[];
}

const memoryStoreState: StoreSettlementsState = (globalThis as any).__ghazal_store_settlements_state || {
  inventory: {},
  auditSessions: [],
  goodsMovements: [],
  deliverySettlement: {
    companyName: 'شبلي',
    period: 'الفترة الحالية',
    codRequiredFils: 0,
    codCollectedFils: 0,
    deliveryFeesDeductibleFils: 0,
    netSettlementExpectedFils: 0,
    remittedFils: 0,
    remainingFils: 0,
    remittances: []
  },
  cashDrawerSettlements: [],
  bankSettlements: [],
  purchaseInvoices: [],
  operatingExpenses: [],
  deliveryOrders: [],
  courierBatches: [],
  courierCompanies: []
};

(globalThis as any).__ghazal_store_settlements_state = memoryStoreState;

// Database helpers for persistent settlements configuration
async function getOperatingExpensesFromDb(): Promise<OperatingExpense[]> {
  try {
    const s = await prisma.siteSettings.findUnique({ where: { key: 'ghazal_operating_expenses' } });
    if (s?.value) {
      const parsed = JSON.parse(s.value);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    console.warn('Error loading operating expenses from DB:', err);
  }
  return [];
}

async function saveOperatingExpensesToDb(expenses: OperatingExpense[]): Promise<void> {
  try {
    await prisma.siteSettings.upsert({
      where: { key: 'ghazal_operating_expenses' },
      update: { value: JSON.stringify(expenses) },
      create: { key: 'ghazal_operating_expenses', value: JSON.stringify(expenses) }
    });
  } catch (err) {
    console.warn('Error saving operating expenses to DB:', err);
  }
  memoryStoreState.operatingExpenses = expenses;
}

async function getCourierBatchesFromDb(): Promise<CourierBatchRecord[]> {
  try {
    const s = await prisma.siteSettings.findUnique({ where: { key: 'ghazal_courier_batches' } });
    if (s?.value) {
      const parsed = JSON.parse(s.value);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    console.warn('Error loading courier batches from DB:', err);
  }
  return [];
}

async function saveCourierBatchesToDb(batches: CourierBatchRecord[]): Promise<void> {
  try {
    await prisma.siteSettings.upsert({
      where: { key: 'ghazal_courier_batches' },
      update: { value: JSON.stringify(batches) },
      create: { key: 'ghazal_courier_batches', value: JSON.stringify(batches) }
    });
  } catch (err) {
    console.warn('Error saving courier batches to DB:', err);
  }
  memoryStoreState.courierBatches = batches;
}

async function getCourierCompaniesFromDb(): Promise<CourierCompany[]> {
  try {
    const s = await prisma.siteSettings.findUnique({ where: { key: 'ghazal_courier_companies' } });
    if (s?.value) {
      const parsed = JSON.parse(s.value);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (err) {
    console.warn('Error loading courier companies from DB:', err);
  }
  return [
    {
      id: 'comp-shibli',
      name: 'شبلي',
      phone: '0790000000',
      type: 'COMPANY',
      active: true,
      isDefaultStoreCourier: true,
      defaultFeeFils: 2000,
      notes: 'شركة التوصيل المعتمدة الرئيسية للتوصيل لكافة محافظات المملكة',
      createdAt: '2026-01-01'
    }
  ];
}

async function saveCourierCompaniesToDb(companies: CourierCompany[]): Promise<void> {
  try {
    await prisma.siteSettings.upsert({
      where: { key: 'ghazal_courier_companies' },
      update: { value: JSON.stringify(companies) },
      create: { key: 'ghazal_courier_companies', value: JSON.stringify(companies) }
    });
  } catch (err) {
    console.warn('Error saving courier companies to DB:', err);
  }
  memoryStoreState.courierCompanies = companies;
}

// ====================================================================
// CORE GETTER FOR DASHBOARD & ALL 6 SECTIONS
// ====================================================================

export async function getSettlementsDashboardData(channelFilter?: string) {
  const currentChannel: StoreChannel = (channelFilter === 'POS' || channelFilter === 'ONLINE') ? channelFilter : 'ALL';

  // 1. Compile inventory list from real database products
  const inventoryList: StoreInventoryItem[] = [];

  try {
    const dbProducts = await prisma.product.findMany({
      include: {
        brand: true,
        category: true,
        variants: true,
        images: { orderBy: { isMain: 'desc' }, take: 1 }
      },
      orderBy: { createdAt: 'desc' }
    });

    for (const prod of dbProducts as any[]) {
      for (const v of (prod.variants || [])) {
        const itemChannel: StoreChannel = (prod.channel as StoreChannel) || 'ALL';

        if (currentChannel !== 'ALL' && itemChannel !== 'ALL' && itemChannel !== currentChannel) {
          continue;
        }

        const physicalStock = (v as any).stock ?? 0;
        const reservedStock = 0;
        const availableStock = Math.max(0, physicalStock - reservedStock);
        const isLowStock = availableStock <= 4;
        const isVisible = (prod as any).isActive !== false && (prod as any).isVisible !== false;

        inventoryList.push({
          id: v.id,
          productId: prod.id,
          name: prod.nameAr,
          sku: v.sku,
          barcode: v.barcode || '',
          imageUrl: prod.images?.[0]?.url || '/logo.png',
          brand: prod.brand?.nameAr || prod.brand?.nameEn || 'غزل',
          category: prod.category?.nameAr || prod.category?.nameEn || 'مستحضرات تجميل',
          specification: v.size || v.shade || v.colorName || 'قياسي',
          physicalStock,
          reservedStock,
          availableStock,
          unitCostFils: Math.round(((v as any).price || (prod as any).basePrice || 0) * 0.55),
          sellingPriceFils: (v as any).price || (prod as any).basePrice || 0,
          reorderLevel: 4,
          channel: itemChannel,
          isLowStock,
          isVisible
        });
      }
    }
  } catch (err) {
    console.warn('Error fetching inventory for settlements from DB:', err);
  }

  // 2. Fetch real POS sales from DB
  let realCashSalesList: CashSaleRecord[] = [];
  let dbSalesTotalFils = 0;

  try {
    const dbSales = await prisma.sale.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        items: true,
        payments: true,
        employee: { select: { name: true } },
        invoice: { select: { number: true } }
      }
    });

    if (dbSales && dbSales.length > 0) {
      realCashSalesList = dbSales.map(s => {
        const pm = s.payments[0]?.method || 'CASH';
        let methodLabel = 'نقد (كاش)';
        if (pm === 'CARD') methodLabel = 'بطاقة POS';
        else if (pm === 'WALLET') methodLabel = 'محفظة إلكترونية';
        else if (pm === 'CREDIT') methodLabel = 'آجل (ذمم)';

        const dateStr = formatJordanDateTime(s.completedAt || s.createdAt);
        return {
          id: s.id,
          receiptNumber: s.invoice?.number || s.reference,
          date: dateStr,
          cashierName: s.sellerNameSnapshot || s.employee?.name || 'كاشير غزل (عين الباشا)',
          totalFils: s.total,
          itemsCount: s.items.reduce((sum, it) => sum + (it.quantity || 1), 0),
          paymentMethod: methodLabel,
          customerName: s.customerName || 'عميل نقدي',
          status: s.status,
          isRefunded: s.status === 'REFUNDED',
          isModified: ((s as any).notes && (s as any).notes.includes('تعديل')) || false,
          refundAmountFils: s.status === 'REFUNDED' ? s.total : 0,
          notes: (s as any).notes || null
        };
      });
      dbSalesTotalFils = dbSales.reduce((acc, s) => acc + s.total, 0);
    }
  } catch (err) {
    console.warn('Prisma sales lookup fallback for settlements:', err);
  }

  // Ensure cash sales are strictly ordered newest first
  realCashSalesList.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Load real online orders
  let realOnlineOrders: OnlineOrderRecord[] = [];
  let onlineSalesTotalFils = 0;

  try {
    const dbOrders = await prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    if (dbOrders && dbOrders.length > 0) {
      realOnlineOrders = dbOrders.map(o => ({
        id: o.id,
        orderNumber: o.reference,
        date: formatJordanDateTime(o.createdAt),
        customerName: o.customerName,
        city: (o as any).city || 'عمّان',
        phone: o.customerPhone,
        totalFils: o.totalAmount,
        status: o.status,
        paymentMethod: (o as any).paymentMethod === 'CARD' ? 'بطاقة دفع إلكتروني' : 'دفع عند الاستلام COD'
      }));
    }
  } catch (e) {}

  // Recalculate total online sales
  onlineSalesTotalFils = realOnlineOrders.reduce((acc, o) => acc + o.totalFils, 0);

  // Load persistent operating expenses, courier batches, and courier companies from database
  const operatingExpenses = await getOperatingExpensesFromDb();
  const courierBatches = await getCourierBatchesFromDb();
  const courierCompanies = await getCourierCompaniesFromDb();

  // Calculate Financial KPI Cards
  const cashExpensesList = operatingExpenses.filter(e => e.paymentMethod === 'CASH');
  const cashExpensesTotalFils = cashExpensesList.reduce((acc, e) => acc + e.amountFils, 0);
  const cashSalesTotalFils = dbSalesTotalFils;
  const deliveryReceivableFils = courierBatches.reduce((acc, b) => acc + (b.remainingFils || 0), 0);

  // 3. Filter Goods Movements
  const goodsMovements = memoryStoreState.goodsMovements.filter(m => {
    if (currentChannel === 'ALL') return true;
    return m.channel === 'ALL' || m.channel === currentChannel;
  });

  // 4. Financial Reports & Profit/Loss (P&L) Calculation
  const totalGrossSalesFils = cashSalesTotalFils + onlineSalesTotalFils;
  const cogsFils = Math.round(totalGrossSalesFils * 0.65);
  const grossProfitFils = totalGrossSalesFils - cogsFils;
  
  const directOperatingExpensesFils = operatingExpenses.reduce((acc, e) => acc + e.amountFils, 0);
  const deliveryFeesFils = memoryStoreState.deliverySettlement.deliveryFeesDeductibleFils;
  const totalExpensesFils = directOperatingExpensesFils + deliveryFeesFils;
  
  const netOperatingProfitFils = grossProfitFils - totalExpensesFils;

  const cashSalesList: CashSaleRecord[] = realCashSalesList;
  const onlineOrdersList: OnlineOrderRecord[] = realOnlineOrders;

  // Real delivery orders from database
  const deliveryOrdersList: DeliveryOrderRecord[] = [];
  try {
    const dbOrdersWithDelivery = await prisma.order.findMany({
      where: {
        status: { in: ['SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED'] }
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    for (const ord of dbOrdersWithDelivery) {
      const isDelivered = ord.status === 'DELIVERED';
      const isCancelled = ord.status === 'CANCELLED';
      const fee = (ord as any).shippingCost || 2000;
      const cod = isCancelled ? 0 : ord.totalAmount;
      const net = isCancelled ? 0 : Math.max(0, cod - fee);
      const city = (ord as any).city || 'عمّان';

      deliveryOrdersList.push({
        id: ord.id,
        orderNumber: ord.reference,
        companyName: 'شبلي',
        customerName: ord.customerName,
        city,
        codAmountFils: cod,
        deliveryFeeFils: fee,
        netSettlementFils: net,
        status: isDelivered ? 'DELIVERED_COLLECTED' : isCancelled ? 'RETURNED' : 'IN_TRANSIT',
        date: ord.createdAt.toISOString().split('T')[0]
      });
    }
  } catch (err) {
    console.warn('Error fetching delivery orders from DB:', err);
  }

  // 5. Central Invoices List (Fully includes both POS and all Online Store Demo Orders)
  let centralInvoicesList: any[] = [];
  try {
    const dbInvoices = await prisma.invoice.findMany({
      include: {
        sale: {
          include: {
            employee: { select: { name: true } },
            items: true
          }
        },
        order: true
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    });

    if (dbInvoices && dbInvoices.length > 0) {
      centralInvoicesList = dbInvoices.map(inv => ({
        id: inv.id,
        number: inv.number,
        source: inv.saleId ? 'POS' : 'STOREFRONT',
        customerName: inv.sale?.customerName || inv.order?.customerName || 'عميل نقدي',
        cashierName: inv.sale?.employee?.name || inv.cashierNameSnapshot || 'كاشير غزل (عين الباشا)',
        grossTotalFils: inv.grossTotalFils || inv.sale?.total || inv.order?.totalAmount || 0,
        paymentStatus: inv.paymentStatus || 'PAID',
        taxSubmissionStatus: inv.taxSubmissionStatus || 'ACCEPTED',
        printed: inv.printed,
        date: formatJordanDateTime(inv.createdAt)
      }));
    }
  } catch (err) {
    console.warn('Prisma invoices lookup in settlements:', err);
  }

  // Ensure POS cash sales invoices are present
  for (const s of realCashSalesList) {
    if (!centralInvoicesList.some(inv => inv.id === `inv-${s.id}` || inv.number === s.receiptNumber)) {
      centralInvoicesList.push({
        id: `inv-${s.id}`,
        number: s.receiptNumber,
        source: 'POS' as const,
        customerName: s.customerName || 'زبونة نقدية',
        cashierName: s.cashierName,
        grossTotalFils: s.totalFils,
        paymentStatus: 'PAID',
        taxSubmissionStatus: 'ACCEPTED',
        printed: 1,
        date: s.date
      });
    }
  }

  // Ensure real online orders have invoices represented in central invoices registry
  for (const ord of realOnlineOrders) {
    if (!centralInvoicesList.some(inv => inv.id === ord.id || inv.number === ord.orderNumber)) {
      centralInvoicesList.push({
        id: ord.id,
        number: ord.orderNumber,
        source: 'STOREFRONT' as const,
        customerName: ord.customerName,
        cashierName: 'متجر غزل الإلكتروني',
        grossTotalFils: ord.totalFils,
        paymentStatus: ord.status === 'DELIVERED' ? 'PAID' : ord.status === 'CANCELLED' ? 'CANCELLED' : 'PAID',
        taxSubmissionStatus: 'ACCEPTED',
        printed: 1,
        date: ord.date
      });
    }
  }

  // Sort invoices newest first
  centralInvoicesList.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // 6. Collect all orders in PREPARED status waiting for courier batch assignment from DB
  const preparedOrdersList: CourierBatchOrderSummary[] = [];

  try {
    const dbPrepared = await prisma.order.findMany({
      where: { status: { in: ['PREPARED', 'READY_FOR_DELIVERY'] } },
      orderBy: { createdAt: 'desc' }
    });
    for (const ord of dbPrepared) {
      const cod = ord.totalAmount;
      const fee = ord.shippingCost || 2000;
      preparedOrdersList.push({
        orderId: ord.id,
        orderNumber: ord.reference,
        customerName: ord.customerName,
        customerPhone: ord.customerPhone,
        city: (ord as any).city || 'عمّان',
        address: ord.notes || 'العنوان مسجل',
        codAmountFils: cod,
        deliveryFeeFils: fee,
        netSettlementFils: Math.max(0, cod - fee),
        status: ord.status
      });
    }
  } catch (e) {
    console.warn('Error fetching prepared orders from DB:', e);
  }

  const totalStockCostFils = inventoryList.reduce((acc, i) => acc + (i.physicalStock * i.unitCostFils), 0);
  const reorderNeededCount = inventoryList.filter(i => i.physicalStock <= i.reorderLevel).length;

  return {
    channelFilter: currentChannel,
    kpis: {
      cashSalesTotalFils,
      onlineSalesTotalFils,
      deliveryReceivableFils,
      cashExpensesTotalFils,
      totalStockCostFils,
      reorderNeededCount,
      openVariancesFils: 0
    },
    inventory: inventoryList,
    cashSales: cashSalesList,
    onlineOrders: onlineOrdersList,
    deliveryOrders: deliveryOrdersList,
    preparedOrders: preparedOrdersList,
    courierBatches,
    courierCompanies,
    cashExpenses: cashExpensesList,
    invoices: centralInvoicesList,
    auditSessions: memoryStoreState.auditSessions,
    goodsMovements,
    deliverySettlement: memoryStoreState.deliverySettlement,
    cashDrawerSettlements: memoryStoreState.cashDrawerSettlements,
    bankSettlements: memoryStoreState.bankSettlements,
    purchaseInvoices: memoryStoreState.purchaseInvoices,
    operatingExpenses,
    pnlReport: {
      grossSalesFils: totalGrossSalesFils,
      cogsFils: cogsFils,
      grossProfitFils: grossProfitFils,
      operatingExpensesFils: totalExpensesFils,
      netOperatingProfitFils: netOperatingProfitFils,
      inventoryCostValuationFils: totalStockCostFils
    }
  };
}

// ====================================================================
// SECTION 2: PHYSICAL AUDIT (الجرد الفعلي والعد والفروقات)
// ====================================================================

export async function startNewAuditSession(channel: StoreChannel = 'ALL', auditorName: string = 'أمين المستودع') {
  try {
    const nextSeq = (memoryStoreState.auditSessions.length + 1).toString().padStart(3, '0');
    const sessionNumber = `AUD-2026-${nextSeq}`;

    // Generate items to count from real database products
    const sessionItems: AuditSessionItem[] = [];
    let dbProducts: any[] = [];
    try {
      dbProducts = await prisma.product.findMany({
        include: { variants: true }
      });
    } catch (e) {
      console.warn('Prisma products lookup for audit session:', e);
    }

    for (const prod of dbProducts) {
      const variants = prod.variants && prod.variants.length > 0 ? prod.variants : [
        { sku: prod.sku || `SKU-${prod.id}`, price: prod.price || 0, size: null, shade: null }
      ];
      for (const v of variants) {
        const itemState = memoryStoreState.inventory[v.sku] || {
          physicalStock: 0,
          reservedStock: 0,
          unitCostFils: Math.round(v.price * 0.7),
          reorderLevel: 4,
          channel: 'ALL'
        };

        if (channel !== 'ALL' && itemState.channel !== 'ALL' && itemState.channel !== channel) {
          continue;
        }

        sessionItems.push({
          id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          sku: v.sku,
          name: prod.nameAr,
          specification: v.size || v.shade || 'قياسي',
          channel: itemState.channel,
          bookStock: itemState.physicalStock,
          countedStock: undefined,
          variance: 0,
          unitCostFils: itemState.unitCostFils,
          varianceValueFils: 0,
          status: 'UNCOUNTED',
          recounted: false
        });
      }
    }

    const newSession: AuditSession = {
      id: `aud-${Date.now()}`,
      sessionNumber,
      channel,
      status: 'IN_PROGRESS',
      auditorName,
      createdAt: new Date().toISOString(),
      totalItemsCount: sessionItems.length,
      uncountedCount: sessionItems.length,
      variancesCount: 0,
      totalBookValueFils: sessionItems.reduce((acc, it) => acc + (it.bookStock * it.unitCostFils), 0),
      totalCountedValueFils: 0,
      netVarianceFils: 0,
      items: sessionItems
    };

    memoryStoreState.auditSessions.unshift(newSession);
    revalidatePath('/admin/settlements');
    return { success: true, session: newSession };
  } catch (error: any) {
    return { success: false, error: error.message || 'فشل فتح جلسة جرد جديدة' };
  }
}

export async function recordAuditItemCount(data: {
  sessionId: string;
  itemId: string;
  countedStock: number;
  reason?: string;
  recounted?: boolean;
}) {
  try {
    const session = memoryStoreState.auditSessions.find(s => s.id === data.sessionId);
    if (!session) return { success: false, error: 'جلسة الجرد غير موجودة' };
    if (session.status === 'COMPLETED') return { success: false, error: 'الجلسة معتمدة ومغلقة ولا يمكن تعديلها' };

    const item = session.items.find(i => i.id === data.itemId);
    if (!item) return { success: false, error: 'الصنف غير موجود بالجلسة' };

    item.countedStock = data.countedStock;
    item.variance = item.countedStock - item.bookStock;
    item.varianceValueFils = item.variance * item.unitCostFils;
    item.reason = data.reason || (item.variance === 0 ? 'مطابق تماماً' : item.reason || '');
    item.recounted = !!data.recounted;

    if (item.variance === 0) {
      item.status = 'MATCH';
    } else if (item.variance < 0) {
      item.status = 'SHORTAGE';
    } else {
      item.status = 'SURPLUS';
    }

    // Recompute session totals
    const uncounted = session.items.filter(i => i.status === 'UNCOUNTED').length;
    const variances = session.items.filter(i => i.variance !== 0 && i.status !== 'UNCOUNTED').length;
    session.uncountedCount = uncounted;
    session.variancesCount = variances;
    session.netVarianceFils = session.items.reduce((acc, it) => acc + it.varianceValueFils, 0);

    if (variances > 0) {
      session.status = 'NEEDS_REVIEW';
    } else if (uncounted === 0) {
      session.status = 'PENDING_APPROVAL';
    } else {
      session.status = 'IN_PROGRESS';
    }

    revalidatePath('/admin/settlements');
    return { success: true, item, sessionStatus: session.status };
  } catch (error: any) {
    return { success: false, error: error.message || 'فشل تسجيل كمية الجرد' };
  }
}

export async function requestAuditApproval(sessionId: string) {
  try {
    const session = memoryStoreState.auditSessions.find(s => s.id === sessionId);
    if (!session) return { success: false, error: 'جلسة الجرد غير موجودة' };
    session.status = 'PENDING_APPROVAL';
    revalidatePath('/admin/settlements');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function approveAndCommitAuditSession(sessionId: string, approverName: string = 'المدير العام') {
  try {
    const session = memoryStoreState.auditSessions.find(s => s.id === sessionId);
    if (!session) return { success: false, error: 'جلسة الجرد غير موجودة' };
    if (session.status === 'COMPLETED') return { success: false, error: 'هذه الجلسة تم اعتمادها مسبقاً' };

    // Apply adjustments to inventory and record in goodsMovements and DB AuditLog
    for (const item of session.items) {
      if (item.countedStock !== undefined && item.variance !== 0) {
        // 1. Update in-memory physical stock
        if (memoryStoreState.inventory[item.sku]) {
          const oldStock = memoryStoreState.inventory[item.sku].physicalStock;
          memoryStoreState.inventory[item.sku].physicalStock = item.countedStock;

          // 2. Add Goods Movement
          memoryStoreState.goodsMovements.unshift({
            id: `mov-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            sku: item.sku,
            productName: item.name,
            specification: item.specification,
            channel: item.channel,
            type: 'AUDIT_ADJUSTMENT',
            reference: session.sessionNumber,
            qtyBefore: oldStock,
            qtyChange: item.variance,
            qtyAfter: item.countedStock,
            employeeName: `${approverName} (اعتماد جرد)`,
            createdAt: new Date().toISOString(),
            notes: item.reason || `تسوية جرد دوري معتمد بموجب ${session.sessionNumber}`
          });
        }

        // 3. Try logging to DB AuditLog and StockAdjustment
        try {
          await prisma.stockAdjustment.create({
            data: {
              sku: item.sku,
              oldStock: item.bookStock,
              newStock: item.countedStock,
              reason: `${session.sessionNumber}: ${item.reason || 'تسوية جرد'}`
            }
          });
          await prisma.auditLog.create({
            data: {
              action: 'INVENTORY_AUDIT_ADJUSTMENT',
              entityType: 'ProductVariant',
              entityId: item.sku,
              details: JSON.stringify({
                sessionNumber: session.sessionNumber,
                variance: item.variance,
                costVarianceFils: item.varianceValueFils,
                reason: item.reason,
                approvedBy: approverName
              })
            }
          });
        } catch {}
      }
    }

    session.status = 'COMPLETED';
    session.approverName = approverName;
    session.approvedAt = new Date().toISOString();

    revalidatePath('/admin/settlements');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'فشل اعتماد جلسة الجرد' };
  }
}

// ====================================================================
// SECTION 4: FINANCIAL SETTLEMENTS (التسويات المالية)
// ====================================================================

export async function recordDeliveryRemittancePayment(data: {
  amountFils: number;
  receiptRef: string;
  notes?: string;
}) {
  try {
    if (!data.amountFils || data.amountFils <= 0 || isNaN(data.amountFils)) {
      return { success: false, error: 'المبلغ المورد يجب أن يكون رقماً موجباً أكبر من صفر' };
    }
    if (!data.receiptRef || !data.receiptRef.trim()) {
      return { success: false, error: 'يرجى إدخال رقم أو مرجع إيصال التوريد' };
    }
    const cleanAmountFils = Math.round(data.amountFils);

    const ds = memoryStoreState.deliverySettlement;
    const newRemittance = {
      id: `rem-${Date.now()}`,
      receiptRef: data.receiptRef.trim(),
      amountFils: cleanAmountFils,
      date: new Date().toISOString().split('T')[0],
      notes: data.notes || 'تسجيل توريد نقدي/بنكي من شركة التوصيل',
      status: 'CONFIRMED' as const
    };

    ds.remittances.unshift(newRemittance);
    ds.remittedFils += cleanAmountFils;
    ds.remainingFils = Math.max(0, ds.netSettlementExpectedFils - ds.remittedFils);

    revalidatePath('/admin/settlements');
    return { success: true, remittance: newRemittance };
  } catch (error: any) {
    return { success: false, error: error.message || 'فشل تسجيل توريد شركة التوصيل' };
  }
}

export async function settleSingleDeliveryOrderAction(orderId: string, notes?: string) {
  try {
    if (!memoryStoreState.deliveryOrders) {
      memoryStoreState.deliveryOrders = [];
    }
    const target = memoryStoreState.deliveryOrders.find(d => d.id === orderId || d.orderNumber === orderId);
    if (!target) {
      return { success: false, error: 'الطلبية غير موجودة في سجل التوصيل' };
    }

    if (target.status !== 'DELIVERED_COLLECTED') {
      return {
        success: false,
        error: 'لا يمكن إجراء التسوية المالية إلا للطلبيات التي تم الانتهاء منها وتوصيلها بالكامل للزبون واستلام ثمنها (تم التحصيل / التسليم ✓).'
      };
    }

    target.status = 'SETTLED';
    target.settledAt = new Date().toISOString();
    target.settledBy = 'مدير النظام (غزل)';

    // Add individual remittance record
    const ds = memoryStoreState.deliverySettlement;
    const newRemittance = {
      id: `rem-order-${target.id}-${Date.now()}`,
      receiptRef: `تسوية-${target.orderNumber}`,
      amountFils: target.netSettlementFils,
      date: new Date().toISOString().split('T')[0],
      notes: notes || `تسوية طلبية التوصيل ${target.orderNumber} (${target.customerName} - ${target.city})`,
      status: 'CONFIRMED' as const
    };

    ds.remittances.unshift(newRemittance);
    ds.remittedFils += target.netSettlementFils;
    ds.remainingFils = Math.max(0, ds.netSettlementExpectedFils - ds.remittedFils);

    revalidatePath('/admin/settlements');
    return { success: true, order: target, remittance: newRemittance };
  } catch (error: any) {
    return { success: false, error: error.message || 'فشل تسوية الطلبية' };
  }
}

export async function reconcileCashDrawerSession(data: {
  countedFils: number;
  cashierName: string;
  notes?: string;
  shiftName?: string;
  openingCashFils?: number;
  cashSalesFils?: number;
  cashRefundsFils?: number;
  cashExpensesFils?: number;
  expectedFils?: number;
}) {
  try {
    const openingCash = data.openingCashFils !== undefined ? Math.round(data.openingCashFils) : 50000;

    const cashExpenses = data.cashExpensesFils !== undefined
      ? Math.round(data.cashExpensesFils)
      : memoryStoreState.operatingExpenses
          .filter(e => e.paymentMethod === 'CASH')
          .reduce((sum, e) => sum + (e.amountFils || 0), 0);

    const cashSales = data.cashSalesFils !== undefined
      ? Math.round(data.cashSalesFils)
      : 155000;

    const cashRefunds = data.cashRefundsFils !== undefined
      ? Math.round(data.cashRefundsFils)
      : 0;

    // Use pure CPA reconciliation math: opening + sales - refunds - expenses
    const recon = calculateCashDrawerReconciliation({
      openingCashFils: openingCash,
      cashSalesFils: cashSales,
      cashRefundsFils: cashRefunds,
      cashExpensesFils: cashExpenses,
      countedCashFils: data.countedFils
    });

    const expected = data.expectedFils !== undefined
      ? Math.round(data.expectedFils)
      : recon.expectedClosingCashFils;

    const variance = data.countedFils - expected;

    const newEntry: CashDrawerSettlement = {
      id: `csh-${Date.now()}`,
      date: new Date().toISOString().split('T')[0],
      shiftName: data.shiftName || 'الوردية الحالية (الكاشير)',
      cashierName: data.cashierName,
      openingCashFils: recon.openingCashFils,
      cashSalesFils: recon.cashSalesFils,
      cashRefundsFils: recon.cashRefundsFils,
      cashExpensesFils: recon.cashExpensesFils,
      expectedCashFils: expected,
      countedCashFils: data.countedFils,
      varianceFils: variance,
      status: variance === 0 ? 'APPROVED' : 'VARIANCE_PENDING',
      notes: data.notes || (
        variance === 0
          ? 'مطابقة ممتازة بدون أي فروقات (مطابق تماماً)'
          : variance < 0
            ? `عجز نقدي بقيمة ${filsToDisplay(Math.abs(variance))} (نقص بالصندوق)`
            : `فائض نقدي بقيمة ${filsToDisplay(variance)} (زيادة بالصندوق)`
      ),
      approvedBy: 'مدير الصالة'
    };

    memoryStoreState.cashDrawerSettlements.unshift(newEntry);
    revalidatePath('/admin/settlements');
    return { success: true, settlement: newEntry };
  } catch (error: any) {
    return { success: false, error: error.message || 'فشل تسجيل مطابقة صندوق الكاشير' };
  }
}

// ====================================================================
// SECTION 5: PURCHASES & EXPENSES (المشتريات والمصاريف)
// ====================================================================

export async function recordNewPurchaseInvoice(data: {
  supplierName: string;
  supplierPhone?: string;
  invoiceNumber: string;
  paymentStatus: 'PAID' | 'CREDIT' | 'PARTIAL';
  paidAmountFils: number;
  items: Array<{ sku: string; name: string; quantity: number; unitCostFils: number }>;
  notes?: string;
}) {
  try {
    if (!data.invoiceNumber || !data.invoiceNumber.trim()) {
      return { success: false, error: 'يرجى إدخال رقم فاتورة الشراء' };
    }
    if (!data.supplierName || !data.supplierName.trim()) {
      return { success: false, error: 'يرجى إدخال اسم المورد' };
    }
    if (!data.items || data.items.length === 0) {
      return { success: false, error: 'يرجى إدراج صنف واحد على الأقل في الفاتورة' };
    }

    const items = data.items.map(it => {
      const quantity = Math.max(1, Math.round(it.quantity || 1));
      const unitCostFils = Math.max(0, Math.round(it.unitCostFils || 0));
      return {
        ...it,
        quantity,
        unitCostFils,
        totalFils: quantity * unitCostFils
      };
    });

    const totalCostFils = items.reduce((acc, it) => acc + it.totalFils, 0);
    const paidAmountFils = Math.min(totalCostFils, Math.max(0, Math.round(data.paidAmountFils || 0)));
    const remainingAmountFils = Math.max(0, totalCostFils - paidAmountFils);

    const paymentStatus: 'PAID' | 'CREDIT' | 'PARTIAL' =
      remainingAmountFils === 0 ? 'PAID' : (paidAmountFils > 0 ? 'PARTIAL' : 'CREDIT');

    const newInvoice: PurchaseInvoice = {
      id: `po-${Date.now()}`,
      invoiceNumber: data.invoiceNumber.trim(),
      supplierName: data.supplierName.trim(),
      supplierPhone: data.supplierPhone?.trim(),
      items,
      totalCostFils,
      paymentStatus,
      deliveryStatus: 'RECEIVED',
      paidAmountFils,
      remainingAmountFils,
      createdAt: new Date().toISOString(),
      notes: data.notes
    };

    // Increase stock for each purchased item and record movement
    for (const item of data.items) {
      if (!memoryStoreState.inventory[item.sku]) {
        memoryStoreState.inventory[item.sku] = {
          physicalStock: 0,
          reservedStock: 0,
          unitCostFils: item.unitCostFils,
          reorderLevel: 4,
          channel: 'ALL'
        };
      }

      const before = memoryStoreState.inventory[item.sku].physicalStock;
      memoryStoreState.inventory[item.sku].physicalStock += item.quantity;
      memoryStoreState.inventory[item.sku].unitCostFils = item.unitCostFils; // Update unit cost

      memoryStoreState.goodsMovements.unshift({
        id: `mov-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        sku: item.sku,
        productName: item.name,
        specification: 'استلام مشتريات',
        channel: 'ALL',
        type: 'PURCHASE_RECEIPT',
        reference: data.invoiceNumber,
        qtyBefore: before,
        qtyChange: item.quantity,
        qtyAfter: before + item.quantity,
        employeeName: 'أمين المستودع',
        createdAt: new Date().toISOString(),
        notes: `توريد من المورد: ${data.supplierName}`
      });
    }

    memoryStoreState.purchaseInvoices.unshift(newInvoice);
    revalidatePath('/admin/settlements');
    return { success: true, invoice: newInvoice };
  } catch (error: any) {
    return { success: false, error: error.message || 'فشل تسجيل فاتورة الشراء' };
  }
}

export const addOperatingExpenseAction = recordNewOperatingExpense;

export async function recordNewOperatingExpense(data: {
  category: 'إيجار المحل' | 'فواتير الكهرباء' | 'فواتير المياه والإنترنت' | 'إعلانات وتسويق' | 'إيجار المعرض' | 'رواتب ومكافآت' | 'تغليف ومستلزمات' | 'استضافة وبرمجيات' | 'صيانة ومصاريف عامة' | string;
  amountFils: number;
  beneficiary: string;
  paymentMethod: 'CASH' | 'BANK';
  notes?: string;
  recordedBy?: string;
}) {
  try {
    if (!data.amountFils || data.amountFils <= 0 || isNaN(data.amountFils)) {
      return { success: false, error: 'مبلغ المصروف التشغيلي يجب أن يكون أكبر من صفر' };
    }
    if (!data.beneficiary || !data.beneficiary.trim()) {
      return { success: false, error: 'يرجى تحديد الجهة المستفيدة من المصروف' };
    }
    const cleanAmountFils = Math.round(data.amountFils);
    const expenses = await getOperatingExpensesFromDb();

    const nextSeq = (expenses.length + 101).toString();
    const newExpense: OperatingExpense = {
      id: `exp-${Date.now()}`,
      expenseNumber: `EXP-${nextSeq}`,
      category: data.category,
      amountFils: cleanAmountFils,
      beneficiary: data.beneficiary.trim(),
      paymentMethod: data.paymentMethod,
      paymentStatus: 'PAID',
      date: new Date().toISOString().split('T')[0],
      recordedBy: data.recordedBy || 'المسؤول المالي',
      notes: data.notes
    };

    expenses.unshift(newExpense);
    await saveOperatingExpensesToDb(expenses);

    revalidatePath('/admin/settlements');
    return { success: true, expense: newExpense };
  } catch (error: any) {
    return { success: false, error: error.message || 'فشل تسجيل المصروف التشغيلي' };
  }
}

export async function deleteOperatingExpenseAction(expenseId: string) {
  try {
    const expenses = await getOperatingExpensesFromDb();
    const filtered = expenses.filter(e => e.id !== expenseId);
    await saveOperatingExpensesToDb(filtered);
    revalidatePath('/admin/settlements');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'فشل حذف المصروف التشغيلي' };
  }
}

/**
 * Toggle Product Visibility (إخفاء / إظهار المنتج مباشرة إذا انتهى)
 */
export async function toggleProductVisibilityAction(productId: string, isVisible: boolean) {
  try {
    const hiddenSet: Set<string> = (globalThis as any).__ghazal_hidden_products || new Set<string>();
    if (!isVisible) {
      hiddenSet.add(productId);
    } else {
      hiddenSet.delete(productId);
    }
    (globalThis as any).__ghazal_hidden_products = hiddenSet;

    try {
      await prisma.product.update({
        where: { id: productId },
        data: { isVisible }
      });
    } catch {}

    revalidatePath('/admin/settlements');
    revalidatePath('/admin/products');
    revalidatePath('/pos/cashier');
    return { success: true, isVisible };
  } catch (error: any) {
    return { success: false, error: error.message || 'فشل تحديث حالة المنتج' };
  }
}

/**
 * Record Cash Drawer Expense / Withdrawal from POS Cashier
 */
export async function recordCashierDrawerExpense(data: {
  amountFils: number;
  reason: string;
  cashierName?: string;
  beneficiary?: string;
}) {
  try {
    if (!data.amountFils || data.amountFils <= 0 || isNaN(data.amountFils)) {
      return { success: false, error: 'مبلغ المصروف النقدي يجب أن يكون أكبر من صفر' };
    }
    const cleanAmount = Math.round(data.amountFils);
    const expenseNum = `CSH-EXP-${Date.now().toString().slice(-4)}`;
    const newExp: OperatingExpense = {
      id: `exp-${Date.now()}`,
      expenseNumber: expenseNum,
      category: 'صيانة ومصاريف عامة',
      amountFils: cleanAmount,
      beneficiary: data.beneficiary || 'كاشير الفرع',
      paymentMethod: 'CASH',
      paymentStatus: 'PAID',
      date: new Date().toISOString().split('T')[0],
      recordedBy: data.cashierName || 'كاشير المعرض',
      notes: data.reason
    };

    const expenses = await getOperatingExpensesFromDb();
    expenses.unshift(newExp);
    await saveOperatingExpensesToDb(expenses);

    revalidatePath('/admin/settlements');
    revalidatePath('/pos/cashier');
    return { success: true, expense: newExp };
  } catch (err: any) {
    return { success: false, error: err.message || 'فشل تسجيل المصروف' };
  }
}

// ====================================================================
// REAL-TIME INVENTORY MOVEMENT SYNCHRONIZATION FROM POS
// ====================================================================

export async function recordPOSSaleGoodsMovements(
  saleReference: string,
  items: Array<{ name: string; sku?: string; quantity: number }>,
  cashierName: string
) {
  try {
    for (const item of items) {
      const sku = item.sku || 'GENERAL';
      const existingInv = memoryStoreState.inventory[sku];
      const qtyBefore = existingInv ? existingInv.physicalStock : 20;
      const qtyChange = -item.quantity;
      const qtyAfter = Math.max(0, qtyBefore + qtyChange);

      if (existingInv) {
        existingInv.physicalStock = qtyAfter;
      }

      memoryStoreState.goodsMovements.unshift({
        id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        sku,
        productName: item.name,
        specification: 'صالة المعرض',
        channel: 'POS',
        type: 'ORDER_DISPATCH',
        reference: saleReference,
        qtyBefore,
        qtyChange,
        qtyAfter,
        employeeName: cashierName,
        createdAt: new Date().toISOString().replace('T', ' ').slice(0, 16),
        notes: `مبيعات كاشير مباشرة بموجب إيصال رقم ${saleReference}`
      });
    }

    try {
      revalidatePath('/admin/settlements');
      revalidatePath('/admin/reports');
      revalidatePath('/admin/dashboard');
    } catch {}
  } catch (e) {
    console.warn('Error recording POS sale goods movement:', e);
  }
}

// ====================================================================
// SECTION 7: COURIER BATCHES & SHIPMENTS (طلبيات شركة التوصيل المجمعة)
// ====================================================================

export async function createCourierBatchAction(data: {
  batchNumber: string;
  courierName: string;
  orderIds: string[];
  notes?: string;
}) {
  try {
    const { batchNumber, courierName, orderIds, notes } = data;
    if (!batchNumber || !batchNumber.trim()) {
      return { success: false, error: 'يرجى إدخال رقم الطلبية / الشحنة' };
    }
    if (!courierName || !courierName.trim()) {
      return { success: false, error: 'يرجى إدخال أو تحديد شركة التوصيل / المندوب' };
    }
    if (!orderIds || orderIds.length === 0) {
      return { success: false, error: 'يرجى تحديد طلب واحد على الأقل لإدراجه في الطلبية' };
    }

    const batches = await getCourierBatchesFromDb();

    // Check if batch number already exists
    const cleanNum = batchNumber.trim();
    if (batches.some(b => b.batchNumber.toLowerCase() === cleanNum.toLowerCase())) {
      return { success: false, error: `رقم الطلبية (${cleanNum}) مسجل مسبقاً، يرجى اختيار رقم آخر` };
    }

    const batchOrders: CourierBatchOrderSummary[] = [];
    let totalCodFils = 0;
    let totalDeliveryFeeFils = 0;

    for (const orderId of orderIds) {
      // Find order in DB or fallback
      let orderObj: any = null;
      try {
        orderObj = await prisma.order.findUnique({ where: { id: orderId } });
      } catch (e) {}

      if (!orderObj) {
        orderObj = getDemoOrderById(orderId);
      }

      if (orderObj) {
        const cod = orderObj.totalAmount || 0;
        const fee = orderObj.shippingCost || 2000;
        const net = Math.max(0, cod - fee);
        totalCodFils += cod;
        totalDeliveryFeeFils += fee;

        batchOrders.push({
          orderId: orderObj.id,
          orderNumber: orderObj.reference,
          customerName: orderObj.customerName,
          customerPhone: orderObj.customerPhone,
          city: (orderObj as any).city || 'عمّان',
          address: orderObj.notes || 'العنوان مسجل',
          codAmountFils: cod,
          deliveryFeeFils: fee,
          netSettlementFils: net,
          status: 'SHIPPED'
        });

        // Update in DB
        try {
          await prisma.order.update({
            where: { id: orderId },
            data: {
              status: 'SHIPPED',
              notes: notes ? `ضمن طلبية الشحن #${cleanNum} (${courierName}) | ${notes}` : `ضمن طلبية الشحن #${cleanNum} (${courierName})`
            }
          });
          await prisma.orderStatusHistory.create({
            data: {
              orderId,
              status: 'SHIPPED',
              notes: `تم تسليم الطلب لشركة التوصيل ${courierName} ضمن طلبية الشحن #${cleanNum}`
            }
          });
        } catch (e) {}
      }
    }

    const net = totalCodFils - totalDeliveryFeeFils;
    const newBatch: CourierBatchRecord = {
      id: `batch-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      batchNumber: cleanNum,
      courierName: courierName.trim(),
      status: 'OUT_FOR_DELIVERY',
      orders: batchOrders,
      totalExpectedCodFils: totalCodFils,
      totalCollectedCodFils: 0,
      totalCodFils,
      totalDeliveryFeeFils,
      totalReturnFeeFils: 0,
      totalCourierFeesFils: totalDeliveryFeeFils,
      netSettlementFils: net,
      storeReceivableFils: Math.max(0, net),
      companyPayableFils: Math.max(0, -net),
      remittedFils: 0,
      remainingFils: net,
      deliveredOrdersCount: 0,
      returnedOrdersCount: 0,
      inTransitOrdersCount: batchOrders.length,
      isPartialSettlement: false,
      remittances: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      notes: notes || ''
    };

    batches.unshift(newBatch);
    await saveCourierBatchesToDb(batches);

    await saveCourierBatchesToDb(batches);

    revalidatePath('/admin/settlements');
    revalidatePath('/admin/orders');
    revalidatePath('/admin/deliveries');
    return { success: true, batch: newBatch };
  } catch (error: any) {
    console.error('createCourierBatchAction error:', error);
    return { success: false, error: error.message || 'حدث خطأ أثناء إنشاء طلبية التوصيل' };
  }
}

export async function updateCourierBatchStatusAction(data: {
  batchId: string;
  newStatus: 'PREPARED' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'SETTLED' | 'CANCELLED';
  storeBearsDeliveryCost?: boolean;
}) {
  try {
    const { batchId, newStatus, storeBearsDeliveryCost = false } = data;
    const batches = await getCourierBatchesFromDb();

    const batch = batches.find(b => b.id === batchId || b.batchNumber === batchId);
    if (!batch) {
      return { success: false, error: 'طلبية التوصيل غير موجودة' };
    }

    // CRITICAL RULES FOR STATUS TRANSITIONS:
    // 1. Once SETTLED or CANCELLED, it can never be changed!
    if (batch.status === 'SETTLED' || batch.status === 'CANCELLED') {
      return {
        success: false,
        error: `لا يمكن تعديل حالة هذه الطلبية إطلاقاً لأنها بحالة نهائية مقفلة (${batch.status === 'CANCELLED' ? 'ملغاة نهائياً' : 'تمت التسوية وتوريد الكاش نهائياً'}).`
      };
    }

    // 2. Settlement (SETTLED) is strictly restricted to fully delivered batches!
    if (newStatus === 'SETTLED' && batch.status !== 'DELIVERED') {
      return {
        success: false,
        error: 'لا يمكن إجراء التسوية المالية للشحنة إلا للطلبيات التي تم الانتهاء منها وتوصيلها بالكامل للزبائن أولاً (تم تسليم الطلبات ✓).'
      };
    }

    // 3. Once DELIVERED, the only permitted transition is to SETTLED!
    if (batch.status === 'DELIVERED' && newStatus !== 'SETTLED') {
      return {
        success: false,
        error: 'هذه الطلبية تم تسليمها بالكامل للزبائن، الإجراء الوحيد المسموح به بعد اكتمال التوصيل هو إجراء التسوية وتوريد الكاش (SETTLED).'
      };
    }

    batch.status = newStatus;
    batch.updatedAt = new Date().toISOString();

    // Map batch status to individual order status
    let targetOrderStatus = 'SHIPPED';
    let targetDeliveryRecordStatus: 'IN_TRANSIT' | 'DELIVERED_COLLECTED' | 'SETTLED' | 'RETURNED' = 'IN_TRANSIT';
    let statusLabelArabic = '';

    switch (newStatus) {
      case 'PREPARED':
        targetOrderStatus = 'PREPARED';
        targetDeliveryRecordStatus = 'IN_TRANSIT';
        statusLabelArabic = 'جاهز للتسليم لشركة التوصيل';
        break;
      case 'OUT_FOR_DELIVERY':
        targetOrderStatus = 'SHIPPED';
        targetDeliveryRecordStatus = 'IN_TRANSIT';
        statusLabelArabic = 'خرج للتوصيل مع المندوب';
        break;
      case 'DELIVERED':
        targetOrderStatus = 'DELIVERED';
        targetDeliveryRecordStatus = 'DELIVERED_COLLECTED';
        statusLabelArabic = 'تم تسليم الطلب للزبونة بنجاح وتحصيل الـ COD';
        break;
      case 'SETTLED':
        targetOrderStatus = 'DELIVERED';
        targetDeliveryRecordStatus = 'SETTLED';
        statusLabelArabic = 'تمت تسوية وتوريد الحساب بالكامل لحساب المعرض';
        break;
      case 'CANCELLED':
        targetOrderStatus = 'CANCELLED';
        targetDeliveryRecordStatus = 'RETURNED';
        statusLabelArabic = storeBearsDeliveryCost
          ? 'ملغي مع تحمل المتجر لتكلفة التوصيل لشركة الشحن'
          : 'ملغي بدون أي تكلفة توصيل على المتجر (إعفاء كامل)';
        
        batch.totalCodFils = 0;
        if (!storeBearsDeliveryCost) {
          batch.totalDeliveryFeeFils = 0;
          batch.netSettlementFils = 0;
          for (const bo of batch.orders) {
            bo.deliveryFeeFils = 0;
            bo.codAmountFils = 0;
            bo.netSettlementFils = 0;
          }
        } else {
          batch.netSettlementFils = -batch.totalDeliveryFeeFils;
          for (const bo of batch.orders) {
            bo.codAmountFils = 0;
            bo.netSettlementFils = -bo.deliveryFeeFils;
          }
        }
        break;
    }

    // Cascade update to EVERY order in this batch (تغيير حالة جميع الطلبات التابعة للطلبية)
    for (const batchOrder of batch.orders) {
      batchOrder.status = targetOrderStatus;

      // 1. Update in GHAZAL_DEMO_ORDERS
      const demo = getDemoOrderById(batchOrder.orderId) || getDemoOrderById(batchOrder.orderNumber);
      if (demo) {
        demo.status = targetOrderStatus;
        demo.updatedAt = new Date().toISOString();
        demo.statusHistory.unshift({
          id: `hist-batch-update-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
          orderId: demo.id,
          status: targetOrderStatus,
          notes: `[تحديث آلي عبر طلبية الشحن #${batch.batchNumber}] تم تغيير الحالة إلى: ${statusLabelArabic}`,
          createdAt: new Date().toISOString()
        });
      }

      // 2. Update in DB if available
      try {
        await prisma.order.update({
          where: { id: batchOrder.orderId },
          data: {
            status: targetOrderStatus,
            ...(newStatus === 'SETTLED' ? { paymentStatus: 'PAID' } : {})
          }
        });
        await prisma.orderStatusHistory.create({
          data: {
            orderId: batchOrder.orderId,
            status: targetOrderStatus,
            notes: `[تحديث آلي عبر طلبية الشحن #${batch.batchNumber}] ${statusLabelArabic}`
          }
        });
      } catch (e) {}

      // 3. Update in memoryStoreState.deliveryOrders
      if (memoryStoreState.deliveryOrders) {
        const delRec = memoryStoreState.deliveryOrders.find(
          d => d.orderNumber === batchOrder.orderNumber || d.id === batchOrder.orderId
        );
        if (delRec) {
          delRec.status = targetDeliveryRecordStatus;
          if (newStatus === 'SETTLED') {
            delRec.settledAt = new Date().toISOString();
            delRec.settledBy = 'مدير النظام (تسوية مجمعة)';
          }
        }
      }
    }

    // If settled, update the overall deliverySettlement statement as well
    if (newStatus === 'SETTLED') {
      const ds = memoryStoreState.deliverySettlement;
      const alreadyRemitted = ds.remittances.some(r => r.receiptRef === `تسوية-طلبية-${batch.batchNumber}`);
      if (!alreadyRemitted) {
        ds.remittances.unshift({
          id: `rem-batch-${batch.id}-${Date.now()}`,
          receiptRef: `تسوية-طلبية-${batch.batchNumber}`,
          amountFils: batch.netSettlementFils,
          date: new Date().toISOString().split('T')[0],
          notes: `تسوية كاملة لطلبية الشحن المجمعة #${batch.batchNumber} (${batch.courierName}) تشمل ${batch.orders.length} طلبات`,
          status: 'CONFIRMED'
        });
        ds.remittedFils += batch.netSettlementFils;
        ds.remainingFils = Math.max(0, ds.netSettlementExpectedFils - ds.remittedFils);
      }
    }

    await saveCourierBatchesToDb(batches);

    await saveCourierBatchesToDb(batches);

    revalidatePath('/admin/settlements');
    revalidatePath('/admin/orders');
    revalidatePath('/admin/deliveries');
    return {
      success: true,
      message: `تم تحديث حالة طلبية الشحن #${batch.batchNumber} بنجاح، وتحديث حالة جميع الطلبات (${batch.orders.length}) المشمولة بها.`
    };
  } catch (error: any) {
    console.error('updateCourierBatchStatusAction error:', error);
    return { success: false, error: error.message || 'حدث خطأ أثناء تحديث حالة طلبية التوصيل' };
  }
}

export async function cancelOrderInCourierBatchAction(data: {
  batchId: string;
  orderId: string;
  storeBearsDeliveryCost: boolean;
  reason?: string;
}) {
  try {
    const { batchId, orderId, storeBearsDeliveryCost, reason } = data;
    const batches = await getCourierBatchesFromDb();

    const batch = batches.find(b => b.id === batchId || b.batchNumber === batchId);
    if (!batch) {
      return { success: false, error: 'طلبية التوصيل غير موجودة' };
    }

    // Lock check: once delivered or cancelled, batch cannot be modified
    if (batch.status === 'DELIVERED' || batch.status === 'SETTLED' || batch.status === 'CANCELLED') {
      return {
        success: false,
        error: `لا يمكن تعديل أو إلغاء طلب من هذه الطلبية لأن حالة الإرسالية مقفلة نهائياً (${batch.status === 'CANCELLED' ? 'ملغاة' : 'تم التوصيل بالكامل'}).`
      };
    }

    const orderIndex = batch.orders.findIndex(o => o.orderId === orderId || o.orderNumber === orderId);
    if (orderIndex === -1) {
      return { success: false, error: 'الطلب المحدد غير موجود داخل هذه الطلبية' };
    }

    const batchOrder = batch.orders[orderIndex];
    if (batchOrder.status === 'CANCELLED') {
      return { success: false, error: 'هذا الطلب ملغي مسبقاً' };
    }

    // Update order status and financials
    batchOrder.status = 'CANCELLED';
    batchOrder.codAmountFils = 0; // Customer is not charged COD

    if (!storeBearsDeliveryCost) {
      batchOrder.deliveryFeeFils = 0; // Store does not pay delivery fee
      batchOrder.netSettlementFils = 0;
    } else {
      batchOrder.netSettlementFils = -batchOrder.deliveryFeeFils;
    }

    // Recalculate batch totals using pure accounting function
    const batchSettlement = calculateCourierBatchSettlement(
      batch.orders.map(o => ({
        codAmountFils: o.codAmountFils,
        deliveryFeeFils: o.deliveryFeeFils,
        status: o.status,
        storeBearsDeliveryCost: o.status === 'CANCELLED' && o.deliveryFeeFils > 0
      }))
    );

    batch.totalCodFils = batchSettlement.totalCodFils;
    batch.totalDeliveryFeeFils = batchSettlement.totalDeliveryFeeFils;
    batch.netSettlementFils = batchSettlement.netSettlementFils;
    batch.updatedAt = new Date().toISOString();

    const note = `[إلغاء طلب من إرسالية #${batch.batchNumber}] ${storeBearsDeliveryCost ? 'المتجر يتحمل تكلفة التوصيل لشركة الشحن' : 'المتجر لا يتحمل أي تكلفة توصيل (إعفاء)'}${reason ? ` — ملاحظة: ${reason}` : ''}`;

    // 1. Update in GHAZAL_DEMO_ORDERS
    const demo = getDemoOrderById(batchOrder.orderId) || getDemoOrderById(batchOrder.orderNumber);
    if (demo) {
      demo.status = 'CANCELLED';
      demo.updatedAt = new Date().toISOString();
      demo.statusHistory.unshift({
        id: `hist-order-cancel-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
        orderId: demo.id,
        status: 'CANCELLED',
        notes: note,
        createdAt: new Date().toISOString()
      });
    }

    // 2. Update DB
    try {
      await prisma.order.update({
        where: { id: batchOrder.orderId },
        data: { status: 'CANCELLED' }
      });
      await prisma.orderStatusHistory.create({
        data: {
          orderId: batchOrder.orderId,
          status: 'CANCELLED',
          notes: note
        }
      });
    } catch (e) {}

    // 3. Update deliveryOrders
    if (memoryStoreState.deliveryOrders) {
      const delRec = memoryStoreState.deliveryOrders.find(
        d => d.orderNumber === batchOrder.orderNumber || d.id === batchOrder.orderId
      );
      if (delRec) {
        delRec.status = 'RETURNED';
      }
    }

    await saveCourierBatchesToDb(batches);

    await saveCourierBatchesToDb(batches);

    revalidatePath('/admin/settlements');
    revalidatePath('/admin/orders');
    revalidatePath('/admin/deliveries');

    return {
      success: true,
      batch,
      message: `تم إلغاء الطلب #${batchOrder.orderNumber} بنجاح (${storeBearsDeliveryCost ? 'المتجر يتحمل تكلفة التوصيل' : 'المتجر لا يتحمل أي تكلفة توصيل'}).`
    };
  } catch (error: any) {
    console.error('cancelOrderInCourierBatchAction error:', error);
    return { success: false, error: error.message || 'حدث خطأ أثناء إلغاء الطلب من الطلبية' };
  }
}

/**
 * إلغاء بعض الطلبات من إرسالية التوصيل مع تحديد تحمّل تكلفة التوصيل لكل طلب على حدة
 */
export async function cancelMultipleOrdersInCourierBatchAction(data: {
  batchId: string;
  cancelledOrders: Array<{
    orderId: string;
    storeBearsDeliveryCost: boolean;
    reason?: string;
  }>;
}) {
  try {
    const { batchId, cancelledOrders } = data;
    const batches = await getCourierBatchesFromDb();

    const batch = batches.find(b => b.id === batchId || b.batchNumber === batchId);
    if (!batch) {
      return { success: false, error: 'طلبية التوصيل غير موجودة' };
    }

    if (batch.status === 'DELIVERED' || batch.status === 'SETTLED' || batch.status === 'CANCELLED') {
      return {
        success: false,
        error: `لا يمكن تعديل أو إلغاء طلبات من هذه الطلبية لأن حالة الإرسالية مقفلة نهائياً (${batch.status === 'CANCELLED' ? 'ملغاة' : 'تم التوصيل بالكامل'}).`
      };
    }

    if (!cancelledOrders || cancelledOrders.length === 0) {
      return { success: false, error: 'يرجى تحديد طلب واحد على الأقل للإلغاء' };
    }

    let cancelledCount = 0;

    for (const item of cancelledOrders) {
      const orderIndex = batch.orders.findIndex(o => o.orderId === item.orderId || o.orderNumber === item.orderId);
      if (orderIndex === -1) continue;

      const batchOrder = batch.orders[orderIndex];
      if (batchOrder.status === 'CANCELLED') continue;

      batchOrder.status = 'CANCELLED';
      batchOrder.codAmountFils = 0;

      if (!item.storeBearsDeliveryCost) {
        batchOrder.deliveryFeeFils = 0;
        batchOrder.netSettlementFils = 0;
      } else {
        batchOrder.netSettlementFils = -batchOrder.deliveryFeeFils;
      }

      cancelledCount++;

      const note = `[إلغاء بعض الطلبات من إرسالية #${batch.batchNumber}] ${item.storeBearsDeliveryCost ? 'المتجر يتحمل تكلفة التوصيل لشركة الشحن' : 'المتجر لا يتحمل أي تكلفة توصيل (إعفاء كامل)'}${item.reason ? ` — سبب الإلغاء: ${item.reason}` : ''}`;

      // 1. Update in GHAZAL_DEMO_ORDERS
      const demo = getDemoOrderById(batchOrder.orderId) || getDemoOrderById(batchOrder.orderNumber);
      if (demo) {
        demo.status = 'CANCELLED';
        demo.updatedAt = new Date().toISOString();
        demo.statusHistory.unshift({
          id: `hist-partial-cancel-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
          orderId: demo.id,
          status: 'CANCELLED',
          notes: note,
          createdAt: new Date().toISOString()
        });
      }

      // 2. Update DB
      try {
        await prisma.order.update({
          where: { id: batchOrder.orderId },
          data: { status: 'CANCELLED' }
        });
        await prisma.orderStatusHistory.create({
          data: {
            orderId: batchOrder.orderId,
            status: 'CANCELLED',
            notes: note
          }
        });
      } catch (e) {}

      // 3. Update deliveryOrders
      if (memoryStoreState.deliveryOrders) {
        const delRec = memoryStoreState.deliveryOrders.find(
          d => d.orderNumber === batchOrder.orderNumber || d.id === batchOrder.orderId
        );
        if (delRec) {
          delRec.status = 'RETURNED';
        }
      }
    }

    // Recalculate batch totals using pure accounting function
    const batchSettlement = calculateCourierBatchSettlement(
      batch.orders.map(o => ({
        codAmountFils: o.codAmountFils,
        deliveryFeeFils: o.deliveryFeeFils,
        status: o.status,
        storeBearsDeliveryCost: o.status === 'CANCELLED' && o.deliveryFeeFils > 0
      }))
    );

    batch.totalCodFils = batchSettlement.totalCodFils;
    batch.totalDeliveryFeeFils = batchSettlement.totalDeliveryFeeFils;
    batch.netSettlementFils = batchSettlement.netSettlementFils;
    batch.updatedAt = new Date().toISOString();

    // If all orders in batch are now cancelled, mark batch as CANCELLED
    const allCancelled = batch.orders.every(o => o.status === 'CANCELLED');
    if (allCancelled) {
      batch.status = 'CANCELLED';
    }

    await saveCourierBatchesToDb(batches);

    revalidatePath('/admin/settlements');
    revalidatePath('/admin/orders');
    revalidatePath('/admin/deliveries');

    return {
      success: true,
      batch,
      message: `تم إلغاء ${cancelledCount} طلب بنجاح من إرسالية التوصيل #${batch.batchNumber} وتحديث الحسابات.`
    };
  } catch (error: any) {
    console.error('cancelMultipleOrdersInCourierBatchAction error:', error);
    return { success: false, error: error.message || 'حدث خطأ أثناء إلغاء الطلبات المحددة' };
  }
}

// ====================================================================
// COURIER COMPANIES MANAGEMENT (إدارة شركات التوصيل والمناديب)
// ====================================================================

export async function getCourierCompaniesAction(): Promise<CourierCompany[]> {
  const companies = await getCourierCompaniesFromDb();
  if (companies.length === 0) {
    const defaultShibli: CourierCompany[] = [
      {
        id: 'comp-shibli',
        name: 'شبلي',
        phone: '0790000000',
        type: 'COMPANY',
        active: true,
        isDefaultStoreCourier: true,
        defaultFeeFils: 2000,
        notes: 'شركة التوصيل المعتمدة لجميع محافظات المملكة',
        createdAt: new Date().toISOString()
      }
    ];
    await saveCourierCompaniesToDb(defaultShibli);
    return defaultShibli;
  }
  return companies;
}

export async function setDefaultCourierCompanyAction(companyId: string) {
  try {
    const list = await getCourierCompaniesAction();
    let found = false;
    for (const c of list) {
      if (c.id === companyId) {
        c.isDefaultStoreCourier = true;
        found = true;
      } else {
        c.isDefaultStoreCourier = false;
      }
    }
    if (!found) return { success: false, error: 'شركة التوصيل غير موجودة' };
    await saveCourierCompaniesToDb(list);
    (globalThis as any).__ghazal_default_courier_id = companyId;
    revalidatePath('/admin/deliveries');
    revalidatePath('/admin/settlements');
    revalidatePath('/[locale]/checkout', 'page');
    return { success: true, defaultCompanyId: companyId };
  } catch (err: any) {
    return { success: false, error: err.message || 'فشل اعتماد الشركة للمتجر' };
  }
}

export async function saveCourierCompanyAction(data: {
  id?: string;
  name: string;
  phone: string;
  type: 'COMPANY' | 'DELEGATE';
  active?: boolean;
  defaultFeeFils?: number;
  isDefaultStoreCourier?: boolean;
  notes?: string;
}) {
  try {
    if (!data.name || !data.name.trim()) {
      return { success: false, error: 'اسم شركة التوصيل أو المندوب مطلوب' };
    }
    const list = await getCourierCompaniesAction();
    if (data.id) {
      const idx = list.findIndex(c => c.id === data.id);
      if (idx !== -1) {
        list[idx] = {
          ...list[idx],
          name: data.name.trim(),
          phone: data.phone.trim(),
          type: data.type,
          active: data.active ?? list[idx].active,
          defaultFeeFils: data.defaultFeeFils ?? list[idx].defaultFeeFils,
          isDefaultStoreCourier: data.isDefaultStoreCourier ?? list[idx].isDefaultStoreCourier,
          notes: data.notes?.trim()
        };
      }
    } else {
      const newComp: CourierCompany = {
        id: `comp-${Date.now()}`,
        name: data.name.trim(),
        phone: data.phone.trim(),
        type: data.type,
        active: data.active ?? true,
        defaultFeeFils: data.defaultFeeFils ?? 2000,
        isDefaultStoreCourier: data.isDefaultStoreCourier ?? false,
        notes: data.notes?.trim(),
        createdAt: new Date().toISOString()
      };
      list.push(newComp);
    }
    await saveCourierCompaniesToDb(list);
    revalidatePath('/admin/deliveries');
    revalidatePath('/admin/settlements');
    return { success: true, companies: list };
  } catch (error: any) {
    return { success: false, error: error.message || 'فشل حفظ شركة التوصيل' };
  }
}

export async function toggleCourierCompanyStatusAction(id: string) {
  try {
    const list = await getCourierCompaniesAction();
    const comp = list.find(c => c.id === id);
    if (!comp) return { success: false, error: 'شركة التوصيل غير موجودة' };
    comp.active = !comp.active;
    await saveCourierCompaniesToDb(list);
    revalidatePath('/admin/deliveries');
    revalidatePath('/admin/settlements');
    return { success: true, active: comp.active };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function deleteCourierCompanyAction(id: string) {
  try {
    const list = await getCourierCompaniesAction();
    const filtered = list.filter(c => c.id !== id);
    await saveCourierCompaniesToDb(filtered);
    revalidatePath('/admin/deliveries');
    revalidatePath('/admin/settlements');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Updates individual order settlement state within a delivery batch.
 * Supports partial deliveries, returns with return fees, delivery retries, and actual collection discrepancies.
 */
export async function updateBatchOrderDeliveryStatusAction(data: {
  batchId: string;
  orderId: string;
  newStatus: 'DELIVERED' | 'RETURNED' | 'IN_TRANSIT' | 'FAILED_ATTEMPT';
  collectedCodFils?: number | null;
  deliveryFeeFils?: number;
  returnFeeFils?: number;
  notes?: string;
}) {
  try {
    const { batchId, orderId, newStatus, collectedCodFils, deliveryFeeFils, returnFeeFils, notes } = data;
    const batches = await getCourierBatchesFromDb();

    const batch = batches.find(b => b.id === batchId || b.batchNumber === batchId);
    if (!batch) {
      return { success: false, error: 'طلبية التوصيل غير موجودة' };
    }

    const orderIndex = batch.orders.findIndex(o => o.orderId === orderId || o.orderNumber === orderId);
    if (orderIndex === -1) {
      return { success: false, error: 'الطلب غير موجود داخل هذه الطلبية' };
    }

    const batchOrder = batch.orders[orderIndex];
    batchOrder.status = newStatus;

    if (typeof deliveryFeeFils === 'number') {
      batchOrder.deliveryFeeFils = Math.max(0, Math.round(deliveryFeeFils));
    }
    if (typeof returnFeeFils === 'number') {
      batchOrder.returnFeeFils = Math.max(0, Math.round(returnFeeFils));
    }

    if (newStatus === 'DELIVERED') {
      batchOrder.collectedCodFils = typeof collectedCodFils === 'number'
        ? Math.max(0, Math.round(collectedCodFils))
        : batchOrder.codAmountFils;
      batchOrder.returnFeeFils = 0;
      batchOrder.settledAt = new Date().toISOString();
    } else if (newStatus === 'RETURNED') {
      batchOrder.collectedCodFils = typeof collectedCodFils === 'number' ? Math.max(0, Math.round(collectedCodFils)) : 0;
      batchOrder.returnFeeFils = typeof returnFeeFils === 'number' ? Math.max(0, Math.round(returnFeeFils)) : 2000;
      batchOrder.settledAt = new Date().toISOString();
    } else if (newStatus === 'IN_TRANSIT' || newStatus === 'FAILED_ATTEMPT') {
      batchOrder.collectedCodFils = null;
      batchOrder.returnFeeFils = 0;
    }

    // Calculate individual order settlement math using pure accounting engine
    const orderCalc = calculateOrderNetSettlement({
      orderId: batchOrder.orderId,
      orderNumber: batchOrder.orderNumber,
      codAmountFils: batchOrder.codAmountFils,
      collectedCodFils: batchOrder.collectedCodFils,
      deliveryFeeFils: batchOrder.deliveryFeeFils,
      returnFeeFils: batchOrder.returnFeeFils || 0,
      status: batchOrder.status,
      storeBearsDeliveryCost: true
    });

    batchOrder.netSettlementFils = orderCalc.netSettlementFils;
    batchOrder.discrepancyFils = orderCalc.discrepancyFils;

    if (notes) {
      batchOrder.notes = notes;
    }

    // Recalculate batch-level aggregates using pure accounting engine
    const batchCalculations = calculateCourierBatchSettlement(
      batch.orders.map(o => ({
        orderId: o.orderId,
        orderNumber: o.orderNumber,
        codAmountFils: o.codAmountFils,
        collectedCodFils: o.collectedCodFils,
        deliveryFeeFils: o.deliveryFeeFils,
        returnFeeFils: o.returnFeeFils || 0,
        status: o.status,
        storeBearsDeliveryCost: o.status === 'RETURNED' || o.status === 'CANCELLED'
      })),
      batch.remittances?.map(r => ({ amountFils: r.amountFils }))
    );

    batch.totalExpectedCodFils = batchCalculations.totalExpectedCodFils;
    batch.totalCollectedCodFils = batchCalculations.totalCollectedCodFils;
    batch.totalCodFils = batchCalculations.totalCollectedCodFils;
    batch.totalDeliveryFeeFils = batchCalculations.totalDeliveryFeeFils;
    batch.totalReturnFeeFils = batchCalculations.totalReturnFeeFils;
    batch.totalCourierFeesFils = batchCalculations.totalCourierFeesFils;
    batch.netSettlementFils = batchCalculations.netSettlementFils;
    batch.storeReceivableFils = batchCalculations.storeReceivableFils;
    batch.companyPayableFils = batchCalculations.companyPayableFils;
    batch.deliveredOrdersCount = batchCalculations.deliveredOrdersCount;
    batch.returnedOrdersCount = batchCalculations.returnedOrdersCount;
    batch.inTransitOrdersCount = batchCalculations.inTransitOrdersCount;
    batch.isPartialSettlement = batchCalculations.isPartialSettlement;
    batch.remainingFils = batchCalculations.remainingBalanceFils;

    if (batchCalculations.inTransitOrdersCount === 0) {
      if (batch.netSettlementFils < 0) {
        batch.status = batch.remainingFils <= 0 ? 'SETTLED' : 'CANCELLED';
      } else {
        batch.status = batch.remainingFils <= 0 ? 'SETTLED' : 'DELIVERED';
      }
    } else if (batchCalculations.deliveredOrdersCount > 0 || batchCalculations.returnedOrdersCount > 0) {
      batch.status = 'PARTIALLY_DELIVERED';
    }

    batch.updatedAt = new Date().toISOString();

    await saveCourierBatchesToDb(batches);

    revalidatePath('/admin/settlements');
    revalidatePath('/admin/deliveries');
    revalidatePath('/admin/orders');

    return { success: true, batch, updatedOrder: batchOrder };
  } catch (error: any) {
    console.error('updateBatchOrderDeliveryStatusAction error:', error);
    return { success: false, error: error.message || 'فشل تحديث حالة الطلب في الشحنة' };
  }
}

/**
 * Records an installment remittance payment from the courier company against a batch.
 * Supports multiple partial payments.
 */
export async function recordCourierBatchRemittancePaymentAction(data: {
  batchId: string;
  amountFils: number;
  receiptRef: string;
  paidBy?: string;
  notes?: string;
}) {
  try {
    const { batchId, amountFils, receiptRef, paidBy, notes } = data;

    if (!amountFils || amountFils <= 0) {
      return { success: false, error: 'يرجى إدخال مبلغ توريد صحيح أكبر من صفر' };
    }
    if (!receiptRef || !receiptRef.trim()) {
      return { success: false, error: 'يرجى إدخال رقم إشعار أو وصل التحويل البنكي' };
    }

    const batches = await getCourierBatchesFromDb();

    const batch = batches.find(b => b.id === batchId || b.batchNumber === batchId);
    if (!batch) {
      return { success: false, error: 'طلبية التوصيل غير موجودة' };
    }

    if (!batch.remittances) {
      batch.remittances = [];
    }

    const remittance: CourierBatchRemittance = {
      id: `rem-batch-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      amountFils: Math.round(amountFils),
      receiptRef: receiptRef.trim(),
      paidAt: new Date().toISOString(),
      paidBy: paidBy || 'محاسب المعرض',
      notes
    };

    batch.remittances.push(remittance);
    batch.remittedFils = (batch.remittedFils || 0) + remittance.amountFils;

    // Remaining balance accounting (handles positive store receivables and negative courier liabilities)
    const targetSettlementFils = batch.netSettlementFils >= 0 ? batch.netSettlementFils : batch.companyPayableFils;
    batch.remainingFils = Math.max(0, targetSettlementFils - batch.remittedFils);

    if (batch.remainingFils <= 0 && batch.inTransitOrdersCount === 0) {
      batch.status = 'SETTLED';
    } else if (batch.remittedFils > 0) {
      batch.status = 'PARTIALLY_SETTLED';
    }

    // Sync with central delivery settlement statement
    if (memoryStoreState.deliverySettlement) {
      const ds = memoryStoreState.deliverySettlement;
      ds.remittances.unshift({
        id: remittance.id,
        receiptRef: `تسوية-شحنة-${batch.batchNumber}-${remittance.receiptRef}`,
        amountFils: remittance.amountFils,
        date: remittance.paidAt.split('T')[0],
        notes: notes || `توريد دفعة من شركة التوصيل (${batch.courierName}) لشحنة #${batch.batchNumber}`,
        status: 'CONFIRMED'
      });
      ds.remittedFils += remittance.amountFils;
      ds.remainingFils = Math.max(0, ds.netSettlementExpectedFils - ds.remittedFils);
    }

    batch.updatedAt = new Date().toISOString();

    await saveCourierBatchesToDb(batches);

    revalidatePath('/admin/settlements');
    revalidatePath('/admin/deliveries');

    return {
      success: true,
      remittance,
      remittedFils: batch.remittedFils,
      remainingFils: batch.remainingFils,
      batchStatus: batch.status
    };
  } catch (error: any) {
    console.error('recordCourierBatchRemittancePaymentAction error:', error);
    return { success: false, error: error.message || 'فشل تسجيل دفعة التوريد' };
  }
}
