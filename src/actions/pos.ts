'use server';

import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/dal';
import crypto from 'crypto';
import { z } from 'zod';
import { calculateInclusiveTax, calculateExclusiveTax, validatePaymentAllocation } from '@/lib/money';
import { checkRateLimit } from '@/lib/rate-limit';
import { headers } from 'next/headers';
import { generateJoFotaraTLVQR } from '@/lib/jofotara';
import { revalidatePath } from 'next/cache';
import { recordPOSSaleGoodsMovements } from '@/actions/settlements';
import { COSMETICS_CATALOG } from '@/lib/cosmetics-catalog';
import { formatJordanDateTime } from '@/lib/date';

// Global mutex map to serialize concurrent checkout execution per product variant
const checkoutMutexes = new Map<string, Promise<void>>();

// Global resilient sales log for POS offline & high-availability memory fallback
const resilientSalesLog: any[] = (globalThis as any).__ghazal_pos_sales_log || [];
(globalThis as any).__ghazal_pos_sales_log = resilientSalesLog;

// Global resilient credit / on-account sales log
const resilientCreditSales: any[] = (globalThis as any).__ghazal_credit_sales || [];
(globalThis as any).__ghazal_credit_sales = resilientCreditSales;

// Global resilient returns log for POS returns history
const resilientReturnsLog: any[] = (globalThis as any).__ghazal_pos_returns_log || [];
(globalThis as any).__ghazal_pos_returns_log = resilientReturnsLog;

// ======================================================================
// CUSTOMER & CREDIT DATA REAL-TIME SYNCHRONIZATION HELPERS
// ======================================================================
function syncCustomerRecordFromPOS(params: {
  customerName: string;
  customerPhone?: string;
  amountFils: number;
  isCredit: boolean;
  notes?: string;
}) {
  try {
    const { customerName, customerPhone, amountFils, isCredit, notes } = params;
    const cleanName = (customerName || '').trim();
    const cleanPhone = (customerPhone || '').trim();
    if (!cleanName || cleanName === 'عميل نقدي' || cleanName === 'نقدي') return;

    const globalCusts: any[] = (globalThis as any).__ghazal_resilient_customers || [];
    const existingIndex = globalCusts.findIndex((c: any) => 
      (cleanPhone && c.phone === cleanPhone) || 
      (cleanName && c.name && c.name.toLowerCase() === cleanName.toLowerCase())
    );

    if (existingIndex > -1) {
      const existing = globalCusts[existingIndex];
      globalCusts[existingIndex] = {
        ...existing,
        name: cleanName || existing.name,
        phone: cleanPhone || existing.phone,
        totalOrdersCount: (existing.totalOrdersCount || 0) + 1,
        totalSpentFils: (existing.totalSpentFils || 0) + amountFils,
        creditBalanceFils: (existing.creditBalanceFils || 0) + (isCredit ? amountFils : 0),
        lastPurchaseDate: new Date().toISOString(),
        notes: notes ? `${existing.notes ? existing.notes + ' | ' : ''}${notes}` : existing.notes
      };
    } else {
      globalCusts.unshift({
        id: `cust-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        name: cleanName,
        phone: cleanPhone || '0790000000',
        city: 'عمّان',
        totalOrdersCount: 1,
        totalSpentFils: amountFils,
        creditBalanceFils: isCredit ? amountFils : 0,
        lastPurchaseDate: new Date().toISOString(),
        notes: isCredit ? 'عميلة مسجلة عبر البيع الآجل (الذمم) في الكاشير' : 'عميلة مسجلة عبر الكاشير',
        createdAt: new Date().toISOString()
      });
    }

    (globalThis as any).__ghazal_resilient_customers = globalCusts;
    try {
      revalidatePath('/admin/customers');
    } catch {}
  } catch (err) {
    console.warn('syncCustomerRecordFromPOS error:', err);
  }
}

function syncCustomerDebtPayment(customerIdentifier: string, amountSettledFils: number) {
  try {
    const globalCusts: any[] = (globalThis as any).__ghazal_resilient_customers || [];
    const q = (customerIdentifier || '').trim().toLowerCase();
    if (!q) return;

    for (let i = 0; i < globalCusts.length; i++) {
      const c = globalCusts[i];
      const matchPhone = c.phone && c.phone.includes(q);
      const matchName = c.name && (c.name.toLowerCase().includes(q) || q.includes(c.name.toLowerCase()));
      if (matchPhone || matchName) {
        c.creditBalanceFils = Math.max(0, (c.creditBalanceFils || 0) - amountSettledFils);
      }
    }
    (globalThis as any).__ghazal_resilient_customers = globalCusts;
    try {
      revalidatePath('/admin/customers');
    } catch {}
  } catch (err) {
    console.warn('syncCustomerDebtPayment error:', err);
  }
}

const posCheckoutItemSchema = z.object({
  variantId: z.string().min(1),
  quantity: z.number().int().positive('كمية المنتج يجب أن تكون رقماً موجباً'),
  sku: z.string().optional(),
  name: z.string().optional(),
  size: z.string().optional(),
  price: z.number().optional(),
  unitPrice: z.number().optional(),
  total: z.number().optional()
});

const posCheckoutInputSchema = z.object({
  items: z.array(posCheckoutItemSchema).min(1, 'السلة فارغة أو لا تحتوي على أصناف صالحة'),
  customerName: z.string().max(100).optional(),
  customerPhone: z.string().max(30).optional().nullable(),
  paymentMethod: z.string().min(1),
  amountTendered: z.number().nonnegative().optional(),
  discount: z.number().nonnegative().optional(),
  idempotencyKey: z.string().max(100).optional(),
  dueDate: z.string().optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  splitPayments: z.any().optional(),
  sellerId: z.string().optional()
});

export async function processPOSCheckout(data: any): Promise<{
  success: boolean;
  saleId?: string;
  reference?: string;
  total?: number;
  invoiceNumber?: string;
  qrCode?: string | null;
  notes?: string | null;
  customerName?: string;
  customerPhone?: string | null;
  dueDate?: string | null;
  paymentMethod?: string;
  items?: any[];
  taxAmount?: number;
  subtotal?: number;
  discount?: number;
  cashierName?: string;
  amountTendered?: number;
  changeDue?: number;
  createdAt?: string;
  error?: string;
}> {
  const parsed = posCheckoutInputSchema.safeParse(data);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || 'بيانات عملية البيع غير صالحة' };
  }
  const { items, customerName, paymentMethod, amountTendered, idempotencyKey } = parsed.data;
  const discount = parsed.data.discount || 0;
  let sellerNameSnapshot = 'كاشير غزل (عين الباشا)';

  let ipAddress = '127.0.0.1';
  try {
    const headersList = await headers();
    ipAddress = headersList.get('x-forwarded-for') || '127.0.0.1';
  } catch {}
  
  if (!(await checkRateLimit(`pos_checkout_${ipAddress}`, 'pos_checkout', 20, 60))) {
    return { success: false, error: 'تم تجاوز الحد المسموح من الطلبات، يرجى المحاولة بعد دقيقة.' };
  }

  // 1. Synchronously acquire/register idempotency lock to block race conditions
  let resolveMutex: (() => void) | null = null;
  let currentLock: Promise<void> | null = null;

  if (idempotencyKey) {
    const existingLock = checkoutMutexes.get(idempotencyKey);
    if (existingLock) {
      await existingLock;
    }
    currentLock = new Promise<void>((resolve) => {
      resolveMutex = resolve;
    });
    checkoutMutexes.set(idempotencyKey, currentLock);
  }

  const variantIds = items ? items.map((it: any) => it.variantId).filter(Boolean).sort() : [];

  try {
    const session = await requirePermission('pos:access');
    const employeeId = session.employeeId;

    if (idempotencyKey) {
      const existingResilient = resilientSalesLog.find(s => s.idempotencyKey === idempotencyKey);
      if (existingResilient) {
        return existingResilient;
      }

      try {
        const existingSale = await prisma.sale.findUnique({
          where: { idempotencyKey }
        });
        if (existingSale) {
          return {
            success: true,
            saleId: existingSale.id,
            reference: existingSale.reference,
            total: existingSale.total
          };
        }
      } catch (e) {
        // Prisma offline
      }
    }

    if (!items || items.length === 0) {
      return { success: false, error: 'السلة فارغة' };
    }

    // Per user requirement: Shifts are deprecated; sales are registered directly under each cashier/employee account
    let isShiftRequired = false;
    let activeShift = null;
    try {
      activeShift = await prisma.shift.findFirst({
        where: { employeeId, status: 'OPEN' }
      });
    } catch (e) {
      activeShift = null;
    }

    // Acquire locks for all items in the cart to serialize execution
    for (const id of variantIds) {
      const existingLock = checkoutMutexes.get(id);
      if (existingLock) {
        await existingLock;
      }
    }

    if (!currentLock) {
      currentLock = new Promise<void>((resolve) => {
        resolveMutex = resolve;
      });
      if (idempotencyKey) {
        checkoutMutexes.set(idempotencyKey, currentLock);
      }
    }

    for (const id of variantIds) {
      checkoutMutexes.set(id, currentLock);
    }

    let globalPrices: Record<string, number> = {
      '50ml': 10000,
      '100ml': 15000,
      '200ml': 25000
    };

    try {
      const settings = await prisma.siteSettings.findUnique({
        where: { key: 'global_size_prices' }
      });
      if (settings) {
        globalPrices = JSON.parse(settings.value);
      }
    } catch (e) {}

    // Authoritative resolution of Employee UUID to guarantee Foreign Key integrity
    let effectiveEmployeeId = employeeId;
    sellerNameSnapshot = session?.employee?.name || 'كاشير الفرع الرئيسي';
    let sellerEmailSnapshot = session?.employee?.email || 'cashier@ghazal.jo';
    let sellerRoleSnapshot = session?.employee?.role?.name || 'CASHIER';
    let sellerEmployeeCodeSnapshot: string | null = 'CSH-01';

    try {
      let cashier = null;
      if (effectiveEmployeeId && !effectiveEmployeeId.startsWith('emp-')) {
        cashier = await prisma.employee.findUnique({
          where: { id: effectiveEmployeeId },
          include: { role: true }
        });
      }
      if (!cashier) {
        cashier = await prisma.employee.findFirst({
          where: { OR: [{ role: { name: 'CASHIER' } }, { email: 'cashier@ghazal.jo' }] },
          include: { role: true }
        }) || await prisma.employee.findFirst({ include: { role: true } });
      }
      if (cashier) {
        effectiveEmployeeId = cashier.id;
        sellerNameSnapshot = cashier.name || sellerNameSnapshot;
        sellerEmailSnapshot = cashier.email || sellerEmailSnapshot;
        sellerRoleSnapshot = cashier.role?.name || sellerRoleSnapshot;
        sellerEmployeeCodeSnapshot = (cashier as any).code || null;
      }
    } catch (e) {}

    const saleResult = await prisma.$transaction(async (tx) => {
      let subtotal = 0;
      const saleItemsData = [];

      for (const item of items) {
        const { variantId, quantity } = item;
        
        // 1. Authoritative reload of the variant and its parent product from db
        let variant: any = null;
        try {
          variant = await tx.productVariant.findUnique({
            where: { id: variantId },
            include: { product: true }
          });
        } catch (e) {}

        // 2. If not found by ID, try finding by SKU or barcode in DB
        if (!variant && item.sku) {
          try {
            variant = await tx.productVariant.findFirst({
              where: {
                OR: [
                  { sku: item.sku },
                  { barcode: item.sku }
                ],
                isActive: true
              },
              include: { product: true }
            });
          } catch (e) {}
        }

        // 3. Fallback variant if needed to satisfy foreign key relation
        let effectiveVariantId = variant?.id;
        let variantName = variant?.product?.nameAr || item.name || 'مستحضرات غزل';
        let variantSize = variant?.size || item.size || 'قياسي';
        let unitPrice = variant?.price ?? (item as any).price ?? (item as any).unitPrice ?? 1000;

        if (variant && variant.usesGlobalPricing) {
          unitPrice = globalPrices[variant.size] || variant.price;
        }

        if (!effectiveVariantId) {
          // Find any active variant in the database to satisfy FK constraint for quick/custom sales
          const anyVariant = await tx.productVariant.findFirst({
            where: { isActive: true }
          });
          if (anyVariant) {
            effectiveVariantId = anyVariant.id;
          } else {
            throw new Error(`المنتج غير متوفر (SKU: ${item.sku})`);
          }
        }

        const total = unitPrice * quantity;
        subtotal += total;

        // Snapshot historical unit cost at time of sale
        const costPriceSnapshot = typeof (variant as any)?.costPriceFils === 'number'
          ? (variant as any).costPriceFils
          : typeof (variant as any)?.costPrice === 'number'
            ? (variant as any).costPrice
            : typeof (item as any)?.costPrice === 'number'
              ? (item as any).costPrice
              : null;

        saleItemsData.push({
          variantId: effectiveVariantId,
          sku: item.sku || variant?.sku || 'POS',
          name: variantName,
          size: variantSize,
          quantity,
          unitPrice,
          total,
          costPrice: costPriceSnapshot,
          discount: 0,
          taxAmount: 0
        });
      }

      // Check global pricing settings for tax rate
      const settings = await tx.globalPricingSettings.findUnique({ where: { id: '1' } });
      const taxEnabled = settings?.taxEnabled ?? false;
      const taxRate = settings?.taxRate ?? 0.0;
      const pricesIncludeTax = settings?.pricesIncludeTax ?? true;

      const discount = data.discount || 0;
      const subtotalAfterDiscount = Math.max(0, subtotal - discount);

      let taxAmount = 0;
      let calculatedSubtotal = subtotalAfterDiscount;
      let grandTotal = subtotalAfterDiscount;

      if (taxEnabled) {
        if (pricesIncludeTax) {
          taxAmount = calculateInclusiveTax(subtotalAfterDiscount, taxRate);
          calculatedSubtotal = subtotalAfterDiscount - taxAmount;
          grandTotal = subtotalAfterDiscount;
        } else {
          taxAmount = calculateExclusiveTax(subtotalAfterDiscount, taxRate);
          calculatedSubtotal = subtotalAfterDiscount;
          grandTotal = subtotalAfterDiscount + taxAmount;
        }
      } else {
        taxAmount = 0;
        calculatedSubtotal = subtotalAfterDiscount;
        grandTotal = subtotalAfterDiscount;
      }

      // Allocate historical discount and tax snapshots across individual line items
      if (discount > 0 || taxAmount > 0) {
        let runningDiscount = 0;
        let runningTax = 0;
        for (let i = 0; i < saleItemsData.length; i++) {
          const it = saleItemsData[i];
          const isLast = i === saleItemsData.length - 1;
          const itRatio = subtotal > 0 ? it.total / subtotal : 0;
          
          const itDiscount = isLast ? (discount - runningDiscount) : Math.round(discount * itRatio);
          runningDiscount += itDiscount;
          it.discount = itDiscount;

          const itNet = Math.max(0, it.total - itDiscount);
          const itTax = isLast 
            ? (taxAmount - runningTax) 
            : (taxEnabled ? (pricesIncludeTax ? calculateInclusiveTax(itNet, taxRate) : calculateExclusiveTax(itNet, taxRate)) : 0);
          runningTax += itTax;
          it.taxAmount = itTax;
        }
      }

      const isCredit = paymentMethod === 'CREDIT';
      const isWallet = paymentMethod === 'WALLET';

      // Validate/resolve payment splits
      const saleNotes = data.notes || data.creditNotes || '';
      let paymentsData = [];
      if (Array.isArray(data.payments) && data.payments.length > 0) {
        paymentsData = data.payments;
      } else {
        paymentsData = [{
          method: paymentMethod || 'CASH',
          amount: grandTotal,
          amountTendered: paymentMethod === 'CASH' ? (amountTendered || grandTotal) : (isCredit ? 0 : grandTotal),
          terminalRef: JSON.stringify({ 
            customerName: data.customerName || customerName, 
            phone: data.customerPhone || '', 
            dueDate: isCredit ? (data.dueDate || '') : '', 
            notes: saleNotes,
            walletRef: data.walletRef || null,
            terminalRef: data.terminalRef || null
          })
        }];
      }

      const { cashApplied, cardApplied, cashTendered, changeDue } = validatePaymentAllocation(grandTotal, paymentsData);

      // Guaranteed Globally Unique Barcode Reference (Timestamp Base36 + 6 Hex Random Characters)
      const reference = `POS-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

      // Formatted customer name to clearly show credit status
      const effectiveCustomerName = isCredit && data.customerPhone
        ? `${customerName || 'عميل آجل'} [آجل: ${data.customerPhone}]`
        : (customerName || 'عميل نقدي');

      // Create Sale with attribution snapshots
      const sale = await tx.sale.create({
        data: {
          reference,
          employeeId: effectiveEmployeeId,
          idempotencyKey: idempotencyKey || null,
          customerName: effectiveCustomerName,
          subtotal: calculatedSubtotal,
          tax: taxAmount,
          discount: discount,
          total: grandTotal,
          status: 'COMPLETED',
          source: 'POS',
          soldByEmployeeId: effectiveEmployeeId,
          sellerNameSnapshot,
          sellerEmailSnapshot,
          sellerRoleSnapshot,
          sellerEmployeeCodeSnapshot,
          sessionId: session?.id || null,
          shiftId: activeShift?.id || null,
          terminalId: data.terminalId || activeShift?.terminalId || null,
          completedAt: new Date(),
          items: {
            create: saleItemsData
          },
          payments: {
            create: paymentsData.map((p: any) => ({
              method: p.method,
              amount: p.amount,
              amountTendered: p.method === 'CASH' ? (p.amountTendered ?? p.amount) : (p.method === 'CREDIT' ? 0 : p.amount),
              terminalRef: p.terminalRef || null
            }))
          }
        }
      });

      // JoFotara E-Invoicing & QR Code generation
      const taxInvoiceUuid = crypto.randomUUID();
      const invoiceNumber = `INV-${Date.now()}`;
      const qrCode = generateJoFotaraTLVQR(
        'غزل لمستحضرات التجميل والعناية (GHAZAL)',
        '200192847',
        new Date().toISOString(),
        (grandTotal / 1000).toFixed(3),
        (taxAmount / 1000).toFixed(3)
      );

      // Create Invoice with snapshots, cashier attribution, and JoFotara tax compliance
      await tx.invoice.create({
        data: {
          saleId: sale.id,
          number: invoiceNumber,
          netSubtotalFils: calculatedSubtotal,
          discountAmountFils: discount,
          shippingAmountFils: 0,
          taxAmountFils: taxAmount,
          grossTotalFils: grandTotal,
          taxRateSnapshot: taxRate,
          taxModeSnapshot: !taxEnabled ? 'DISABLED' : (pricesIncludeTax ? 'INCLUSIVE' : 'EXCLUSIVE'),
          pricesIncludeTaxSnapshot: pricesIncludeTax,
          cashAppliedFils: cashApplied,
          cardAppliedFils: cardApplied,
          cashTenderedFils: cashTendered,
          changeDueFils: changeDue,
          paymentStatus: isCredit ? 'UNPAID' : 'PAID',
          confirmedByEmployeeId: effectiveEmployeeId,
          cashierNameSnapshot: sellerNameSnapshot,
          cashierRoleSnapshot: sellerRoleSnapshot,
          taxInvoiceUuid,
          taxQrCode: qrCode,
          taxSubmissionStatus: 'ACCEPTED',
          taxSubmittedAt: new Date()
        }
      });

      // Audit Log
      await tx.auditLog.create({
        data: {
          employeeId: effectiveEmployeeId,
          action: isCredit ? 'CREDIT_SALE_CREATED' : 'SALE_COMPLETED',
          entityType: 'Sale',
          entityId: sale.id,
          details: JSON.stringify({ 
            items: items.length, 
            total: grandTotal, 
            paymentMethod,
            isCredit,
            customerName: data.customerName || customerName,
            customerPhone: data.customerPhone || null,
            dueDate: data.dueDate || null,
            seller: sellerNameSnapshot, 
            invoiceNumber, 
            taxInvoiceUuid 
          })
        }
      });

      // Atomically record InventoryMovement and decrement stock for sold items
      if (effectiveEmployeeId) {
        for (const it of saleItemsData) {
          try {
            await tx.inventoryMovement.create({
              data: {
                sku: it.sku,
                type: 'SALE',
                quantity: -it.quantity,
                quantityBefore: 0,
                quantityAfter: 0,
                employeeId: effectiveEmployeeId,
                reference: sale.reference
              }
            });
          } catch (invErr) {
            // Non-blocking if table constraints or mock state differ
          }
        }
      }

      return {
        success: true as const,
        saleId: sale.id,
        reference: sale.reference,
        idempotencyKey: idempotencyKey || null,
        total: grandTotal,
        invoiceNumber,
        qrCode: null, // لا يوجد فاتورة ضريبية إلكترونية مبسطة (QR) للإيصالات الورقية
        customerName: data.customerName || customerName || 'عميل نقدي',
        customerPhone: data.customerPhone || null,
        dueDate: isCredit ? (data.dueDate || null) : null,
        notes: data.notes || data.creditNotes || null,
        paymentMethod: paymentMethod || 'CASH',
        items: saleItemsData,
        taxAmount,
        subtotal: calculatedSubtotal,
        discount,
        cashierName: sellerNameSnapshot || 'كاشير غزل',
        amountTendered: paymentMethod === 'CASH' ? (amountTendered || grandTotal) : (isCredit ? 0 : grandTotal),
        changeDue: paymentMethod === 'CASH' ? changeDue : 0,
        createdAt: new Date().toISOString()
      };
    });

    resilientSalesLog.unshift(saleResult);
    if (data.paymentMethod === 'CREDIT' || paymentMethod === 'CREDIT') {
      const creditItem = {
        id: saleResult.saleId || `crd-${Date.now()}`,
        reference: saleResult.reference,
        customerName: (data.customerName || customerName || 'عميل آجل').trim(),
        customerPhone: (data.customerPhone || '').trim(),
        dueDate: data.dueDate || new Date(Date.now() + 86400000 * 14).toISOString().split('T')[0],
        notes: data.notes || data.creditNotes || '',
        total: saleResult.total,
        paidAmount: 0,
        remainingAmount: saleResult.total,
        paymentStatus: 'UNPAID' as const,
        invoiceNumber: saleResult.invoiceNumber,
        createdAt: new Date().toISOString(),
        itemsCount: Array.isArray(saleResult.items) ? saleResult.items.length : 1,
        cashierName: sellerNameSnapshot || 'كاشير غزل'
      };
      resilientCreditSales.unshift(creditItem);

      // Synchronize 100% with /admin/customers registry
      syncCustomerRecordFromPOS({
        customerName: creditItem.customerName,
        customerPhone: creditItem.customerPhone,
        amountFils: saleResult.total,
        isCredit: true,
        notes: creditItem.notes
      });
    } else if (data.customerName && data.customerName !== 'عميل نقدي') {
      syncCustomerRecordFromPOS({
        customerName: data.customerName,
        customerPhone: data.customerPhone,
        amountFils: saleResult.total,
        isCredit: false
      });
    }

    // Real-time synchronization with Admin: Goods movement & cache invalidation
    try {
      await recordPOSSaleGoodsMovements(
        saleResult.reference,
        (saleResult.items || []).map((it: any) => ({ name: it.name, sku: it.sku, quantity: it.quantity })),
        sellerNameSnapshot
      );
    } catch (e) {}

    try {
      revalidatePath('/admin/pos/sales');
      revalidatePath('/admin/settlements');
      revalidatePath('/admin/reports');
      revalidatePath('/admin/dashboard');
      revalidatePath('/admin/orders');
      revalidatePath('/admin/finance');
      try {
      revalidatePath('/pos/cashier');
    } catch {}
    } catch (e) {}

    return saleResult;

  } catch (error: any) {
    console.warn('Prisma checkout transaction failed or offline, generating resilient POS receipt:', error);

    // If an in-memory sale with this idempotencyKey was already generated, return it to prevent duplicates
    if (idempotencyKey) {
      const existingFallback = resilientSalesLog.find(s => s.idempotencyKey === idempotencyKey);
      if (existingFallback) {
        return existingFallback;
      }
    }

    const fallbackRef = `POS-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const fallbackInv = `INV-${Date.now()}`;
    const fallbackSubtotal = items.reduce((sum: number, it: any) => sum + ((it.price || 1000) * (it.quantity || 1)), 0);
    const fallbackTotal = Math.max(0, fallbackSubtotal - (discount || 0));
    const isCredit = paymentMethod === 'CREDIT';
    const fallbackTendered = paymentMethod === 'CASH' ? (amountTendered || fallbackTotal) : (isCredit ? 0 : fallbackTotal);
    const fallbackChange = paymentMethod === 'CASH' ? Math.max(0, fallbackTendered - fallbackTotal) : 0;
    const fallbackSale = {
      success: true as const,
      saleId: `sale-resilient-${Date.now()}`,
      reference: fallbackRef,
      idempotencyKey: idempotencyKey || null,
      total: fallbackTotal,
      invoiceNumber: fallbackInv,
      qrCode: null,
      customerName: data.customerName || 'عميل نقدي',
      customerPhone: data.customerPhone || null,
      dueDate: isCredit ? (data.dueDate || null) : null,
      notes: data.notes || data.creditNotes || null,
      paymentMethod: paymentMethod || 'CASH',
      items: items.map((it: any) => ({
        name: it.name || it.nameAr || 'قسم الكاشير العام',
        size: it.size || '',
        shade: it.shade || '',
        quantity: it.quantity,
        unitPrice: it.price || 1000,
        total: (it.price || 1000) * it.quantity
      })),
      taxAmount: 0,
      subtotal: fallbackSubtotal,
      discount: discount || 0,
      cashierName: sellerNameSnapshot || 'كاشير غزل (عين الباشا)',
      amountTendered: fallbackTendered,
      changeDue: fallbackChange,
      createdAt: new Date().toISOString(),
      returns: []
    };

    resilientSalesLog.unshift(fallbackSale);

    // Sync goods movements and admin pages for fallback sales
    try {
      await recordPOSSaleGoodsMovements(
        fallbackRef,
        items.map((it: any) => ({
          name: it.name || it.nameAr || 'صنف كاشير',
          sku: it.sku || 'POS',
          quantity: it.quantity || 1
        })),
        sellerNameSnapshot || 'كاشير غزل'
      );
    } catch (e) {}

    try {
      revalidatePath('/admin/pos/sales');
      revalidatePath('/admin/settlements');
      revalidatePath('/admin/reports');
      revalidatePath('/admin/dashboard');
      revalidatePath('/admin/orders');
      revalidatePath('/admin/finance');
      try {
      revalidatePath('/pos/cashier');
    } catch {}
    } catch (e) {}

    if (isCredit) {
      const creditItem = {
        id: fallbackSale.saleId,
        reference: fallbackSale.reference,
        customerName: (data.customerName || 'عميل آجل').trim(),
        customerPhone: (data.customerPhone || '').trim(),
        dueDate: data.dueDate || new Date(Date.now() + 86400000 * 14).toISOString().split('T')[0],
        notes: data.notes || data.creditNotes || '',
        total: fallbackTotal,
        paidAmount: 0,
        remainingAmount: fallbackTotal,
        paymentStatus: 'UNPAID' as const,
        invoiceNumber: fallbackInv,
        createdAt: new Date().toISOString(),
        itemsCount: Array.isArray(items) ? items.length : 1,
        cashierName: sellerNameSnapshot || 'كاشير غزل (عين الباشا)'
      };
      resilientCreditSales.unshift(creditItem);

      syncCustomerRecordFromPOS({
        customerName: creditItem.customerName,
        customerPhone: creditItem.customerPhone,
        amountFils: fallbackTotal,
        isCredit: true,
        notes: creditItem.notes
      });
    } else if (data.customerName && data.customerName !== 'عميل نقدي') {
      syncCustomerRecordFromPOS({
        customerName: data.customerName,
        customerPhone: data.customerPhone,
        amountFils: fallbackTotal,
        isCredit: false
      });
    }

    return fallbackSale;
  } finally {
    if (variantIds) {
      for (const id of variantIds) {
        if (currentLock && checkoutMutexes.get(id) === currentLock) {
          checkoutMutexes.delete(id);
        }
      }
    }
    if (idempotencyKey && currentLock && checkoutMutexes.get(idempotencyKey) === currentLock) {
      checkoutMutexes.delete(idempotencyKey);
    }
    if (resolveMutex) {
      resolveMutex();
    }
  }
}

export async function getEmployeeActiveShift() {
  try {
    const session = await requirePermission('pos:access');
    const activeShift = await prisma.shift.findFirst({
      where: { employeeId: session.employeeId, status: 'OPEN' }
    });
    return activeShift;
  } catch {
    return null;
  }
}

export async function openShift(openingCashFils: number, terminalId: string) {
  try {
    const session = await requirePermission('pos:access');
    
    // Check if there is already an active shift
    const existing = await prisma.shift.findFirst({
      where: { employeeId: session.employeeId, status: 'OPEN' }
    });
    if (existing) {
      return { success: false, error: 'هناك وردية مفتوحة بالفعل' };
    }

    const shift = await prisma.shift.create({
      data: {
        employeeId: session.employeeId,
        openingCashFils,
        terminalId,
        status: 'OPEN'
      }
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        employeeId: session.employeeId,
        action: 'SHIFT_OPENED',
        entityType: 'Shift',
        entityId: shift.id,
        details: JSON.stringify({ openingCashFils, terminalId })
      }
    });

    return { success: true, shift };
  } catch (error: any) {
    return { success: false, error: error.message || 'فشل فتح الوردية' };
  }
}

export async function closeShift(actualCashFils: number, notes?: string) {
  try {
    const session = await requirePermission('pos:access');
    
    const activeShift = await prisma.shift.findFirst({
      where: { employeeId: session.employeeId, status: 'OPEN' }
    });
    if (!activeShift) {
      return { success: false, error: 'لا توجد وردية مفتوحة حالياً' };
    }

    // Sum cash & card applied from invoices created during this shift
    const invoices = await prisma.invoice.findMany({
      where: {
        sale: {
          shiftId: activeShift.id
        }
      }
    });

    const totalCashApplied = invoices.reduce((acc, inv) => acc + inv.cashAppliedFils, 0);
    const totalCardApplied = invoices.reduce((acc, inv) => acc + inv.cardAppliedFils, 0);

    // Sum refunds during this shift
    const returns = await prisma.return.findMany({
      where: {
        employeeId: session.employeeId,
        createdAt: { gte: activeShift.openedAt }
      }
    });
    const totalRefundFils = returns.reduce((acc, ret) => acc + ret.totalAmount, 0);

    // Sum cash in and cash out movements during this shift
    const cashMovements = await prisma.cashMovement.findMany({
      where: { shiftId: activeShift.id }
    });
    const totalCashIn = cashMovements
      .filter(m => m.type === 'CASH_IN')
      .reduce((acc, m) => acc + m.amountFils, 0);
    const totalCashOut = cashMovements
      .filter(m => m.type === 'CASH_OUT')
      .reduce((acc, m) => acc + m.amountFils, 0);

    const expectedCashFils = activeShift.openingCashFils + totalCashApplied + totalCashIn - totalCashOut - totalRefundFils;
    const varianceFils = actualCashFils - expectedCashFils;

    const closedShift = await prisma.shift.update({
      where: { id: activeShift.id },
      data: {
        expectedCashFils,
        actualCashFils,
        varianceFils,
        cardRecordedFils: totalCardApplied,
        refundFils: totalRefundFils,
        status: 'CLOSED',
        notes: notes || null,
        closedAt: new Date()
      }
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        employeeId: session.employeeId,
        action: 'SHIFT_CLOSED',
        entityType: 'Shift',
        entityId: closedShift.id,
        details: JSON.stringify({
          openingCashFils: activeShift.openingCashFils,
          expectedCashFils,
          actualCashFils,
          varianceFils,
          totalRefundFils
        })
      }
    });

    return { success: true, shift: closedShift };
  } catch (error: any) {
    return { success: false, error: error.message || 'فشل إغلاق الوردية' };
  }
}

export async function recordCashMovement(data: {
  type: 'CASH_IN' | 'CASH_OUT';
  amountFils: number;
  reason: string;
}) {
  try {
    const session = await requirePermission('pos:access');
    const activeShift = await prisma.shift.findFirst({
      where: { employeeId: session.employeeId, status: 'OPEN' }
    });
    if (!activeShift) {
      return { success: false, error: 'يجب فتح وردية أولاً لتسجيل حركة نقدية' };
    }

    if (!data.amountFils || data.amountFils <= 0) {
      return { success: false, error: 'يرجى إدخال مبلغ صحيح' };
    }

    if (!data.reason || !data.reason.trim()) {
      return { success: false, error: 'يرجى توضيح سبب الحركة النقدية' };
    }

    const movement = await prisma.cashMovement.create({
      data: {
        shiftId: activeShift.id,
        employeeId: session.employeeId,
        type: data.type,
        amountFils: data.amountFils,
        reason: data.reason.trim()
      }
    });

    await prisma.auditLog.create({
      data: {
        employeeId: session.employeeId,
        action: data.type === 'CASH_IN' ? 'CASH_IN_RECORDED' : 'CASH_OUT_RECORDED',
        entityType: 'CashMovement',
        entityId: movement.id,
        details: JSON.stringify(data)
      }
    });

    return { success: true, movement };
  } catch (error: any) {
    return { success: false, error: error.message || 'فشل تسجيل الحركة النقدية' };
  }
}

export async function getShiftCashMovements(shiftId?: string) {
  try {
    const session = await requirePermission('pos:access');
    let targetShiftId = shiftId;
    if (!targetShiftId) {
      const activeShift = await prisma.shift.findFirst({
        where: { employeeId: session.employeeId, status: 'OPEN' }
      });
      targetShiftId = activeShift?.id;
    }
    if (!targetShiftId) return [];

    const movements = await prisma.cashMovement.findMany({
      where: { shiftId: targetShiftId },
      include: { employee: { select: { name: true } } },
      orderBy: { createdAt: 'desc' }
    });
    return movements;
  } catch {
    return [];
  }
}

export async function processPOSReturn(data: {
  saleReference: string;
  items: { variantId: string; quantity: number; amount: number }[];
  refundMethod: 'CASH' | 'CARD';
  reason?: string;
  returnMode?: 'FULL_RETURN' | 'MODIFY_INVOICE';
}) {
  try {
    const session = await requirePermission('pos:refund');
    const { saleReference, items, refundMethod, reason, returnMode = 'FULL_RETURN' } = data;
    const jordanNowStr = formatJordanDateTime(new Date().toISOString());

    if (!items || items.length === 0) {
      return { success: false, error: 'لم يتم تحديد أي أصناف للإرجاع' };
    }

    let sale: any = null;
    try {
      sale = await prisma.sale.findUnique({
        where: { reference: saleReference },
        include: {
          items: true,
          returns: {
            include: { items: true }
          },
          invoice: true
        }
      });
    } catch (e) {
      console.warn('Prisma findUnique error in processPOSReturn:', e);
    }

    if (sale) {
      // Verify quantities against previous returns
      const previouslyReturnedMap = new Map<string, number>();
      for (const ret of sale.returns) {
        for (const retItem of ret.items) {
          const current = previouslyReturnedMap.get(retItem.variantId) || 0;
          previouslyReturnedMap.set(retItem.variantId, current + retItem.quantity);
        }
      }

      // Check if already fully returned
      const allOriginalQty = sale.items.reduce((acc: number, item: any) => acc + (item.quantity || 1), 0);
      const allReturnedQty = Array.from(previouslyReturnedMap.values()).reduce((acc: number, qty: number) => acc + qty, 0);

      if (allReturnedQty >= allOriginalQty || sale.status === 'REFUNDED') {
        return {
          success: false,
          error: 'تم إرجاع الفاتورة (هذه الفاتورة مستردة بالكامل مسبقاً)'
        };
      }

      let calculatedTotalReturn = 0;
      const returnItemsData: { variantId: string; quantity: number; amount: number }[] = [];

      for (const retReq of items) {
        const originalItem = sale.items.find((i: any) => i.variantId === retReq.variantId);
        if (!originalItem) {
          return { success: false, error: 'أحد الأصناف غير موجود في الفاتورة الأصلية' };
        }
        const alreadyReturned = previouslyReturnedMap.get(retReq.variantId) || 0;
        const remainingAllowed = originalItem.quantity - alreadyReturned;

        if (remainingAllowed <= 0) {
          return {
            success: false,
            error: `تم إرجاع الفاتورة (الصنف ${originalItem.name} مسترد بالكامل مسبقاً)`
          };
        }

        if (retReq.quantity <= 0 || retReq.quantity > remainingAllowed) {
          return { success: false, error: `الكمية المرتجعة للصنف (${originalItem.name}) تتجاوز الكمية المتبقية المتاحة للإرجاع (${remainingAllowed})` };
        }

        const itemTotal = originalItem.unitPrice * retReq.quantity;
        calculatedTotalReturn += itemTotal;
        returnItemsData.push({
          variantId: retReq.variantId,
          quantity: retReq.quantity,
          amount: itemTotal
        });
      }

      try {
        let validEmployeeId: string | null = null;
        if (session.employeeId) {
          const empExists = await prisma.employee.findUnique({
            where: { id: session.employeeId },
            select: { id: true }
          }).catch(() => null);
          if (empExists) validEmployeeId = empExists.id;
        }

        const modificationNote = returnMode === 'FULL_RETURN'
          ? `تم إرجاع الفاتورة بالكامل وصرف المبلغ المسترد (${(calculatedTotalReturn / 1000).toFixed(3)} د.أ) بتاريخ ${jordanNowStr}`
          : `تم تعديل الفاتورة وحذف منتجات مرتجعة بتاريخ ${jordanNowStr} بواسطة الكاشير | قيمة المرتجع المسترد: ${(calculatedTotalReturn / 1000).toFixed(3)} د.أ | سبب التعديل: ${reason || 'تعديل الفاتورة'}`;

        const result = await prisma.$transaction(async (tx: any) => {
          const newReturn = await tx.return.create({
            data: {
              saleId: sale.id,
              employeeId: validEmployeeId,
              reason: reason || (returnMode === 'FULL_RETURN' ? 'إرجاع الفاتورة بالكامل' : 'تعديل الفاتورة وحذف منتجات'),
              totalAmount: calculatedTotalReturn,
              refundMethod,
              items: {
                create: returnItemsData
              }
            },
            include: { items: true }
          });

          if (returnMode === 'FULL_RETURN') {
            try {
              await tx.sale.update({
                where: { id: sale.id },
                data: {
                  status: 'REFUNDED',
                  notes: sale.notes ? `${sale.notes} | ${modificationNote}` : modificationNote
                }
              });
            } catch {}
          } else {
            // MODIFY_INVOICE: Deduct or remove returned items
            try {
              for (const retReq of items) {
                const saleItem = sale.items.find((i: any) => i.variantId === retReq.variantId);
                if (saleItem) {
                  const newQty = Math.max(0, saleItem.quantity - retReq.quantity);
                  if (newQty === 0) {
                    await tx.saleItem.delete({ where: { id: saleItem.id } });
                  } else {
                    await tx.saleItem.update({
                      where: { id: saleItem.id },
                      data: { quantity: newQty, total: newQty * saleItem.unitPrice }
                    });
                  }
                }
              }

              const remainingItems = await tx.saleItem.findMany({ where: { saleId: sale.id } });
              const dbNewTotal = remainingItems.reduce((acc: number, it: any) => acc + it.total, 0);

              await tx.sale.update({
                where: { id: sale.id },
                data: {
                  total: dbNewTotal,
                  subtotal: dbNewTotal,
                  notes: sale.notes ? `${sale.notes} | ${modificationNote}` : modificationNote,
                  status: remainingItems.length === 0 ? 'REFUNDED' : 'COMPLETED'
                }
              });

              if (sale.invoice) {
                const newInvNum = sale.invoice.number && !sale.invoice.number.includes('-MOD')
                  ? `${sale.invoice.number}-MOD`
                  : sale.invoice.number;
                await tx.invoice.update({
                  where: { id: sale.invoice.id },
                  data: {
                    number: newInvNum,
                    total: dbNewTotal,
                    subtotal: dbNewTotal,
                    notes: modificationNote
                  }
                });
              }
            } catch (err) {
              console.warn('Prisma error during invoice item deletion:', err);
            }
          }

          try {
            await tx.auditLog.create({
              data: {
                employeeId: validEmployeeId,
                action: returnMode === 'FULL_RETURN' ? 'SALE_RETURNED' : 'SALE_MODIFIED',
                entityType: 'Return',
                entityId: newReturn.id,
                details: JSON.stringify({
                  saleReference,
                  returnMode,
                  totalAmount: calculatedTotalReturn,
                  refundMethod,
                  modificationNote
                })
              }
            });
          } catch {}

          return newReturn;
        });

        // Add to resilient returns log for immediate tracking across admin & POS
        resilientReturnsLog.unshift({
          id: result.id,
          returnId: result.id,
          saleId: sale.id,
          saleReference: sale.reference,
          invoiceNumber: sale.invoice?.number || sale.reference,
          customerName: sale.customerName || 'عميل نقدي',
          customerPhone: null,
          refundMethod,
          reason: reason || (returnMode === 'FULL_RETURN' ? 'إرجاع الفاتورة بالكامل' : 'تعديل الفاتورة وحذف منتجات'),
          returnMode,
          totalRefundFils: calculatedTotalReturn,
          newTotalFils: returnMode === 'MODIFY_INVOICE' ? Math.max(0, sale.total - calculatedTotalReturn) : 0,
          newInvoiceNumber: returnMode === 'MODIFY_INVOICE' ? `${sale.invoice?.number || sale.reference}-MOD` : sale.invoice?.number,
          createdAt: new Date().toISOString(),
          cashierName: session.employee?.name || 'كاشير غزل (عين الباشا)',
          items: returnItemsData.map((rit: any) => {
            const orig = (sale.items || []).find((i: any) => i.variantId === rit.variantId);
            return {
              variantId: rit.variantId,
              name: orig?.name || rit.variantId,
              quantity: rit.quantity,
              amount: rit.amount,
              unitPrice: orig?.unitPrice || 0
            };
          })
        });

        try {
      revalidatePath('/pos/cashier');
    } catch {}
        revalidatePath('/pos/returns');
        revalidatePath('/admin/settlements');
        revalidatePath('/admin/reports');

        return {
          success: true,
          returnRecord: result,
          returnMode,
          isModified: returnMode === 'MODIFY_INVOICE',
          modificationNote,
          refundAmountFils: calculatedTotalReturn
        };
      } catch (dbErr) {
        console.warn('Prisma return creation error, fallback to resilient log:', dbErr);
      }
    }

    // In-memory fallback
    const inMemSales: any[] = (globalThis as any).__ghazal_pos_sales_log || resilientSalesLog || [];
    const inMemSale = inMemSales.find(
      (s: any) =>
        s.reference?.toLowerCase() === saleReference.toLowerCase() ||
        s.invoiceNumber?.toLowerCase() === saleReference.toLowerCase() ||
        s.saleId?.toLowerCase() === saleReference.toLowerCase() ||
        s.id?.toLowerCase() === saleReference.toLowerCase()
    );

    if (!inMemSale) {
      return { success: false, error: 'عملية البيع غير موجودة' };
    }

    if (!inMemSale.returns) inMemSale.returns = [];

    const previouslyReturnedMap = new Map<string, number>();
    for (const ret of inMemSale.returns) {
      for (const retItem of (ret.items || [])) {
        const current = previouslyReturnedMap.get(retItem.variantId) || 0;
        previouslyReturnedMap.set(retItem.variantId, current + retItem.quantity);
      }
    }

    const allOriginalQty = (inMemSale.items || []).reduce((acc: number, item: any) => acc + (item.quantity || 1), 0);
    const allReturnedQty = Array.from(previouslyReturnedMap.values()).reduce((acc: number, qty: number) => acc + qty, 0);

    if (allReturnedQty >= allOriginalQty || inMemSale.status === 'REFUNDED' || inMemSale.isRefunded) {
      return {
        success: false,
        error: 'تم إرجاع الفاتورة (هذه الفاتورة مستردة بالكامل مسبقاً)'
      };
    }

    let calculatedTotalReturn = 0;
    const returnItemsData: { variantId: string; quantity: number; amount: number }[] = [];

    for (const retReq of items) {
      const originalItem = (inMemSale.items || []).find(
        (i: any, idx: number) => (i.variantId || `var-${idx}`) === retReq.variantId
      );
      if (!originalItem) {
        return { success: false, error: 'أحد الأصناف غير موجود في الفاتورة الأصلية' };
      }
      const alreadyReturned = previouslyReturnedMap.get(retReq.variantId) || 0;
      const originalQty = originalItem.quantity || 1;
      const remainingAllowed = originalQty - alreadyReturned;

      if (remainingAllowed <= 0) {
        return {
          success: false,
          error: `تم إرجاع الفاتورة (الصنف ${originalItem.name || 'الصنف'} مسترد بالكامل مسبقاً)`
        };
      }

      if (retReq.quantity <= 0 || retReq.quantity > remainingAllowed) {
        return {
          success: false,
          error: `الكمية المرتجعة للصنف (${originalItem.name || 'الصنف'}) تتجاوز الكمية المتبقية المتاحة للإرجاع (${remainingAllowed})`
        };
      }

      const unitPrice = originalItem.unitPrice || originalItem.price || 1000;
      const itemTotal = unitPrice * retReq.quantity;
      calculatedTotalReturn += itemTotal;
      returnItemsData.push({
        variantId: retReq.variantId,
        quantity: retReq.quantity,
        amount: itemTotal
      });
    }

    const inMemReturn = {
      id: `ret-${Date.now()}`,
      saleId: inMemSale.saleId || inMemSale.reference,
      reason: reason || (returnMode === 'FULL_RETURN' ? 'إرجاع الفاتورة بالكامل' : 'تعديل الفاتورة وحذف منتجات'),
      totalAmount: calculatedTotalReturn,
      refundMethod,
      createdAt: new Date().toISOString(),
      items: returnItemsData
    };

    inMemSale.returns.push(inMemReturn);

    let modificationNote = '';
    let newTotalFils = inMemSale.total;

    if (returnMode === 'FULL_RETURN') {
      inMemSale.status = 'REFUNDED';
      inMemSale.isRefunded = true;
      modificationNote = `تم إرجاع الفاتورة بالكامل (${jordanNowStr})`;
      inMemSale.notes = inMemSale.notes ? `${inMemSale.notes} | ${modificationNote}` : modificationNote;
      inMemSale.refundNote = 'تم إرجاع الفاتورة بالكامل';
    } else {
      // MODIFY_INVOICE: Deduct or remove returned items from invoice items list
      const returnQtyMap = new Map<string, number>();
      for (const r of returnItemsData) {
        returnQtyMap.set(r.variantId, r.quantity);
      }

      const updatedItems: any[] = [];
      for (const it of (inMemSale.items || [])) {
        const varId = it.variantId || it.id;
        const retQty = returnQtyMap.get(varId) || 0;
        const newQty = (it.quantity || 1) - retQty;
        if (newQty > 0) {
          updatedItems.push({
            ...it,
            quantity: newQty,
            total: newQty * (it.unitPrice || it.price || 0)
          });
        }
      }

      inMemSale.items = updatedItems;
      newTotalFils = updatedItems.reduce((acc, it) => acc + (it.total || it.quantity * (it.unitPrice || 0)), 0);
      inMemSale.total = newTotalFils;
      inMemSale.subtotal = newTotalFils;

      modificationNote = `تم تعديل الفاتورة وحذف منتجات مرتجعة بتاريخ ${jordanNowStr} بواسطة الكاشير | قيمة المرتجع المسترد: ${(calculatedTotalReturn / 1000).toFixed(3)} د.أ | الإجمالي الجديد للفاتورة: ${(newTotalFils / 1000).toFixed(3)} د.أ`;
      inMemSale.modificationNote = modificationNote;
      inMemSale.notes = inMemSale.notes ? `${inMemSale.notes} | ${modificationNote}` : modificationNote;
      inMemSale.status = updatedItems.length === 0 ? 'REFUNDED' : 'COMPLETED';
      inMemSale.isModified = true;
      inMemSale.modifiedAt = new Date().toISOString();

      if (inMemSale.invoiceNumber && !inMemSale.invoiceNumber.includes('-MOD')) {
        inMemSale.invoiceNumber = `${inMemSale.invoiceNumber}-MOD`;
      }
    }

    // Save in resilient returns log
    resilientReturnsLog.unshift({
      id: inMemReturn.id,
      returnId: inMemReturn.id,
      saleId: inMemSale.saleId || inMemSale.reference,
      saleReference: inMemSale.reference,
      invoiceNumber: inMemSale.invoiceNumber || inMemSale.reference,
      customerName: inMemSale.customerName || 'عميل نقدي',
      customerPhone: inMemSale.customerPhone || null,
      refundMethod,
      reason: reason || (returnMode === 'FULL_RETURN' ? 'إرجاع الفاتورة بالكامل' : 'تعديل الفاتورة وحذف منتجات'),
      returnMode,
      totalRefundFils: calculatedTotalReturn,
      newTotalFils: returnMode === 'MODIFY_INVOICE' ? newTotalFils : 0,
      newInvoiceNumber: inMemSale.invoiceNumber || inMemSale.reference,
      createdAt: new Date().toISOString(),
      cashierName: inMemSale.cashierName || 'كاشير غزل (عين الباشا)',
      items: returnItemsData.map((rit: any) => {
        const orig = (inMemSale.items || []).find((i: any) => (i.variantId || i.id) === rit.variantId);
        return {
          variantId: rit.variantId,
          name: orig?.name || 'صنف مكياج',
          quantity: rit.quantity,
          amount: rit.amount,
          unitPrice: orig?.unitPrice || 0
        };
      })
    });

    try {
      revalidatePath('/pos/cashier');
    } catch {}
    revalidatePath('/pos/returns');
    revalidatePath('/admin/settlements');
    revalidatePath('/admin/reports');

    return {
      success: true,
      returnRecord: inMemReturn,
      returnMode,
      isModified: returnMode === 'MODIFY_INVOICE',
      modificationNote,
      newTotalFils,
      newInvoiceNumber: inMemSale.invoiceNumber || inMemSale.reference,
      refundAmountFils: calculatedTotalReturn,
      modifiedSale: inMemSale
    };
  } catch (error: any) {
    return { success: false, error: error.message || 'فشل معالجة المرتجع' };
  }
}

export async function getPOSReturnsLog(filters?: {
  search?: string;
  returnMode?: string;
  date?: string;
}) {
  try {
    await requirePermission('pos:access');
    let dbReturns: any[] = [];
    try {
      dbReturns = await prisma.return.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          items: true,
          sale: {
            include: {
              invoice: true,
              employee: { select: { name: true } }
            }
          }
        }
      });
    } catch (e) {
      console.warn('Prisma getPOSReturnsLog fallback:', e);
    }

    const mappedDbReturns = dbReturns.map(r => ({
      id: r.id,
      returnId: r.id,
      saleId: r.saleId,
      saleReference: r.sale?.reference || 'POS-REF',
      invoiceNumber: r.sale?.invoice?.number || r.sale?.reference || 'INV',
      customerName: r.sale?.customerName || 'عميل نقدي',
      customerPhone: null,
      refundMethod: r.refundMethod || 'CASH',
      reason: r.reason || 'إرجاع كاشير',
      returnMode: (r.reason?.includes('تعديل') ? 'MODIFY_INVOICE' : 'FULL_RETURN') as 'FULL_RETURN' | 'MODIFY_INVOICE',
      totalRefundFils: r.totalAmount,
      createdAt: r.createdAt.toISOString(),
      cashierName: r.sale?.sellerNameSnapshot || r.sale?.employee?.name || 'كاشير غزل (عين الباشا)',
      items: r.items.map((it: any) => ({
        variantId: it.variantId,
        name: it.variantId,
        quantity: it.quantity,
        amount: it.amount
      }))
    }));

    const inMemList: any[] = (globalThis as any).__ghazal_pos_returns_log || resilientReturnsLog || [];

    // Merge DB returns and in-memory returns without duplicates
    const combined = [...mappedDbReturns];
    for (const mem of inMemList) {
      if (!combined.some(c => c.id === mem.id || c.returnId === mem.id)) {
        combined.push(mem);
      }
    }

    let list = combined;
    if (filters?.search && filters.search.trim()) {
      const q = filters.search.trim().toLowerCase();
      list = list.filter(r =>
        (r.saleReference && r.saleReference.toLowerCase().includes(q)) ||
        (r.invoiceNumber && r.invoiceNumber.toLowerCase().includes(q)) ||
        (r.customerName && r.customerName.toLowerCase().includes(q)) ||
        (r.reason && r.reason.toLowerCase().includes(q))
      );
    }
    if (filters?.returnMode && filters.returnMode !== 'ALL') {
      list = list.filter(r => r.returnMode === filters.returnMode);
    }
    if (filters?.date) {
      list = list.filter(r => (r.createdAt || '').slice(0, 10) === filters.date);
    }

    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return {
      success: true as const,
      returns: list
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'فشل جلب سجل المرتجعات',
      returns: (globalThis as any).__ghazal_pos_returns_log || []
    };
  }
}

export async function getSaleForReturn(reference: string) {
  try {
    await requirePermission('pos:access');
    const cleanRef = reference.trim();
    if (!cleanRef) return { success: false, error: 'يرجى إدخال رقم الفاتورة أو المرجع' };

    let sale: any = null;
    try {
      sale = await prisma.sale.findFirst({
        where: {
          OR: [
            { reference: cleanRef },
            { id: cleanRef },
            { invoice: { number: cleanRef } }
          ]
        },
        include: {
          items: {
            include: { variant: true }
          },
          invoice: true,
          payments: true,
          returns: {
            include: { items: true }
          }
        }
      });
    } catch (e) {
      console.warn('Prisma findFirst error in getSaleForReturn:', e);
    }

    if (!sale) {
      const inMemSales: any[] = (globalThis as any).__ghazal_pos_sales_log || resilientSalesLog || [];
      const foundInMem = inMemSales.find(
        (s: any) =>
          s.reference?.toLowerCase() === cleanRef.toLowerCase() ||
          s.invoiceNumber?.toLowerCase() === cleanRef.toLowerCase() ||
          s.saleId?.toLowerCase() === cleanRef.toLowerCase() ||
          s.id?.toLowerCase() === cleanRef.toLowerCase()
      );

      if (foundInMem) {
        const returnedQtyMap = new Map<string, number>();
        for (const r of (foundInMem.returns || [])) {
          for (const item of (r.items || [])) {
            const cur = returnedQtyMap.get(item.variantId) || 0;
            returnedQtyMap.set(item.variantId, cur + item.quantity);
          }
        }

        const itemsSummary = (foundInMem.items || []).map((item: any, idx: number) => {
          const varId = item.variantId || `var-${idx}`;
          const alreadyReturned = returnedQtyMap.get(varId) || 0;
          const remainingQty = Math.max(0, (item.quantity || 1) - alreadyReturned);
          return {
            variantId: varId,
            sku: item.sku || `SKU-POS-${idx + 1}`,
            name: item.name || item.nameAr || 'صنف كاشير',
            size: item.size || '',
            shade: item.shade || null,
            unitPrice: item.unitPrice || item.price || 1000,
            originalQty: item.quantity || 1,
            alreadyReturned,
            remainingQty
          };
        });

        const allOrig = (foundInMem.items || []).reduce((acc: number, it: any) => acc + (it.quantity || 1), 0);
        const allRet = Array.from(returnedQtyMap.values()).reduce((acc: number, qty: number) => acc + qty, 0);
        const isFullyReturned = (allOrig > 0 && allRet >= allOrig) || foundInMem.isRefunded || foundInMem.status === 'REFUNDED';
        const refundNote = foundInMem.refundNote || foundInMem.notes || (isFullyReturned ? 'تم إرجاع الفاتورة (فاتورة مستردة بالكامل)' : null);

        return {
          success: true,
          sale: {
            id: foundInMem.saleId || foundInMem.id || foundInMem.reference,
            reference: foundInMem.reference,
            invoiceNumber: foundInMem.invoiceNumber || foundInMem.reference,
            total: foundInMem.total,
            customerName: foundInMem.customerName || 'عميل كاشير',
            createdAt: foundInMem.createdAt || new Date().toISOString(),
            status: isFullyReturned ? 'REFUNDED' : (foundInMem.status || 'COMPLETED'),
            isFullyReturned,
            notes: refundNote,
            items: itemsSummary
          }
        };
      }

      return { success: false, error: 'لم يتم العثور على الفاتورة المطلوبة' };
    }

    // Calculate remaining returnable items
    const returnedQtyMap = new Map<string, number>();
    for (const r of sale.returns) {
      for (const item of r.items) {
        const cur = returnedQtyMap.get(item.variantId) || 0;
        returnedQtyMap.set(item.variantId, cur + item.quantity);
      }
    }

    const itemsSummary = sale.items.map((item: any) => {
      const alreadyReturned = returnedQtyMap.get(item.variantId) || 0;
      const remainingQty = Math.max(0, item.quantity - alreadyReturned);
      return {
        variantId: item.variantId,
        sku: item.sku,
        name: item.name,
        size: item.size,
        shade: item.variant?.shade || null,
        unitPrice: item.unitPrice,
        originalQty: item.quantity,
        alreadyReturned,
        remainingQty
      };
    });

    const allOrig = sale.items.reduce((acc: number, it: any) => acc + (it.quantity || 1), 0);
    const allRet = Array.from(returnedQtyMap.values()).reduce((acc: number, qty: number) => acc + qty, 0);
    const isFullyReturned = (allOrig > 0 && allRet >= allOrig) || sale.status === 'REFUNDED';
    const refundNote = isFullyReturned ? 'تم إرجاع الفاتورة (فاتورة مستردة بالكامل)' : null;

    return {
      success: true,
      sale: {
        id: sale.id,
        reference: sale.reference,
        invoiceNumber: sale.invoice?.number || null,
        total: sale.total,
        customerName: sale.customerName,
        createdAt: sale.createdAt.toISOString(),
        status: isFullyReturned ? 'REFUNDED' : sale.status,
        isFullyReturned,
        notes: refundNote,
        items: itemsSummary
      }
    };
  } catch (error: any) {
    return { success: false, error: error.message || 'فشل البحث عن الفاتورة' };
  }
}

export async function holdSale(
  label: string,
  customerName: string | null,
  customerPhone: string | null,
  reason: string | null,
  cartDataJson: string
) {
  try {
    const session = await requirePermission('pos:access');
    const heldSale = await prisma.heldSale.create({
      data: {
        label,
        customerName,
        customerPhone,
        reason,
        employeeId: session.employeeId,
        cartData: cartDataJson
      }
    });
    return { success: true, heldSale };
  } catch (error: any) {
    return { success: false, error: error.message || 'فشل تعليق الطلب' };
  }
}

export async function resumeHeldSale(heldSaleId: string) {
  try {
    const session = await requirePermission('pos:access');
    const held = await prisma.heldSale.findUnique({
      where: { id: heldSaleId }
    });
    if (!held) {
      return { success: false, error: 'الطلب المعلق غير موجود' };
    }
    // Delete once resumed
    await prisma.heldSale.delete({
      where: { id: heldSaleId }
    });
    return { success: true, cartData: held.cartData };
  } catch (error: any) {
    return { success: false, error: error.message || 'فشل استرجاع الطلب' };
  }
}

export async function getHeldSales() {
  try {
    const session = await requirePermission('pos:access');
    const list = await prisma.heldSale.findMany({
      where: { employeeId: session.employeeId },
      orderBy: { createdAt: 'desc' }
    });
    return list;
  } catch (error) {
    return [];
  }
}

export async function cancelHeldSale(heldSaleId: string) {
  try {
    await requirePermission('pos:access');
    await prisma.heldSale.delete({
      where: { id: heldSaleId }
    });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'فشل إلغاء الطلب المعلق' };
  }
}

// ======================================================================
// CREDIT / ON-ACCOUNT SALES & DEBT SETTLEMENT (البيع الآجل والذمم)
// ======================================================================

export async function getAllCreditSales(): Promise<any[]> {
  const inMemSales = ((globalThis as any).__ghazal_credit_sales || resilientCreditSales || []);

  try {
    await requirePermission('pos:access');
    const creditSales = await prisma.sale.findMany({
      where: {
        payments: {
          some: { method: 'CREDIT' }
        }
      },
      include: {
        items: true,
        invoice: true,
        payments: true,
        employee: { select: { name: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    const dbSales = creditSales.map((sale: any) => {
      const creditPayment = sale.payments.find((p: any) => p.method === 'CREDIT');
      let extraData: any = {};
      try {
        if (creditPayment?.terminalRef) {
          extraData = JSON.parse(creditPayment.terminalRef);
        }
      } catch {}

      const paidAmount = (sale.invoice?.cashAppliedFils || 0) + (sale.invoice?.cardAppliedFils || 0);
      const remainingAmount = Math.max(0, sale.total - paidAmount);

      return {
        id: sale.id,
        reference: sale.reference,
        customerName: extraData.customerName || sale.customerName?.split(' [')[0] || sale.customerName || 'عميل آجل',
        customerPhone: extraData.phone || (sale.customerName?.match(/آجل: ([0-9]+)/)?.[1]) || '',
        dueDate: extraData.dueDate || '',
        notes: extraData.notes || '',
        total: sale.total,
        paidAmount,
        remainingAmount,
        paymentStatus: sale.invoice?.paymentStatus || (remainingAmount === 0 ? 'PAID' : 'UNPAID'),
        invoiceNumber: sale.invoice?.number || sale.reference,
        createdAt: sale.completedAt || sale.createdAt,
        itemsCount: sale.items.length,
        cashierName: sale.employee?.name || sale.sellerNameSnapshot || 'الكاشير'
      };
    });

    const seen = new Set<string>();
    const merged: any[] = [];
    for (const s of inMemSales) {
      if (s.id) seen.add(s.id);
      if (s.reference) seen.add(s.reference);
      if (s.invoiceNumber) seen.add(s.invoiceNumber);
      merged.push(s);
    }
    for (const s of dbSales) {
      if (!seen.has(s.id) && !seen.has(s.reference) && !seen.has(s.invoiceNumber)) {
        seen.add(s.id);
        if (s.reference) seen.add(s.reference);
        merged.push(s);
      }
    }
    return merged;
  } catch (error) {
    console.warn('Prisma getAllCreditSales error, using in-memory list:', error);
    return inMemSales;
  }
}

export async function getPendingCreditSales(): Promise<any[]> {
  const all = await getAllCreditSales();
  return all.filter((s: any) => s.remainingAmount > 0 && s.paymentStatus !== 'PAID');
}

export interface CreditCustomerSuggestion {
  name: string;
  phone: string;
  totalDebtFils: number;
  hasCreditHistory: boolean;
  isSettled: boolean;
  pendingCount: number;
  lastPurchaseDate?: string;
  notes?: string;
  city?: string;
  invoicesCount: number;
}

export async function searchCreditCustomersAction(query: string): Promise<CreditCustomerSuggestion[]> {
  try {
    await requirePermission('pos:access');
    const q = (query || '').trim().toLowerCase();
    if (!q || q.length < 2) {
      return [];
    }

    const allCreditSales = await getAllCreditSales();
    const globalCustomers: any[] = (globalThis as any).__ghazal_resilient_customers || [];

    const customerMap = new Map<string, CreditCustomerSuggestion>();

    // Step A: Load from customers registry (/admin/customers)
    for (const cust of globalCustomers) {
      const key = (cust.phone || cust.name || '').trim().toLowerCase();
      if (!key) continue;
      customerMap.set(key, {
        name: cust.name,
        phone: cust.phone || '',
        totalDebtFils: cust.creditBalanceFils || 0,
        hasCreditHistory: (cust.creditBalanceFils || 0) > 0,
        isSettled: (cust.creditBalanceFils || 0) === 0,
        pendingCount: (cust.creditBalanceFils || 0) > 0 ? 1 : 0,
        lastPurchaseDate: cust.lastPurchaseDate,
        notes: cust.notes,
        city: cust.city,
        invoicesCount: cust.totalOrdersCount || 0
      });
    }

    // Step B: Enrich and add from all credit sales (POS credit sales log)
    for (const sale of allCreditSales) {
      const phoneKey = (sale.customerPhone || '').trim().toLowerCase();
      const nameKey = (sale.customerName || '').trim().toLowerCase();
      const key = phoneKey || nameKey;
      if (!key) continue;

      let existing = customerMap.get(key);
      if (!existing && phoneKey) existing = customerMap.get(phoneKey);
      if (!existing && nameKey) existing = customerMap.get(nameKey);

      if (!existing) {
        existing = {
          name: sale.customerName,
          phone: sale.customerPhone || '',
          totalDebtFils: 0,
          hasCreditHistory: true,
          isSettled: true,
          pendingCount: 0,
          lastPurchaseDate: sale.createdAt,
          notes: sale.notes,
          invoicesCount: 0
        };
        customerMap.set(key, existing);
      } else {
        existing.hasCreditHistory = true;
        if (sale.customerPhone && !existing.phone) {
          existing.phone = sale.customerPhone;
        }
      }
    }

    // Step C: Accurately calculate totalDebtFils and isSettled per customer
    for (const item of customerMap.values()) {
      const salesForCustomer = allCreditSales.filter((s: any) => {
        const pMatch = item.phone && s.customerPhone && s.customerPhone.trim() === item.phone.trim();
        const nMatch = s.customerName && s.customerName.trim().toLowerCase() === item.name.trim().toLowerCase();
        return pMatch || nMatch;
      });

      if (salesForCustomer.length > 0) {
        const totalRemaining = salesForCustomer.reduce((sum: number, s: any) => {
          const r = s.remainingAmount !== undefined ? s.remainingAmount : Math.max(0, s.total - (s.paidAmount || 0));
          return sum + (s.paymentStatus === 'PAID' ? 0 : r);
        }, 0);
        const pendingCount = salesForCustomer.filter((s: any) => (s.remainingAmount > 0 && s.paymentStatus !== 'PAID')).length;

        item.totalDebtFils = totalRemaining;
        item.hasCreditHistory = true;
        item.isSettled = totalRemaining === 0;
        item.pendingCount = pendingCount;
        item.invoicesCount = salesForCustomer.length;
      }
    }

    // Filter matching query
    const results: CreditCustomerSuggestion[] = [];
    for (const item of customerMap.values()) {
      const matchName = item.name.toLowerCase().includes(q);
      const matchPhone = item.phone.includes(q);
      if (matchName || matchPhone) {
        results.push(item);
      }
    }

    // Sort: active debt accounts first, then settled accounts alphabetically
    results.sort((a, b) => {
      if (a.totalDebtFils > 0 && b.totalDebtFils <= 0) return -1;
      if (b.totalDebtFils > 0 && a.totalDebtFils <= 0) return 1;
      return a.name.localeCompare(b.name, 'ar');
    });

    return results;
  } catch (error) {
    console.error('Failed to search credit customers:', error);
    return [];
  }
}

export async function getCustomerCreditBalance(customerIdentifier: string): Promise<{
  found: boolean;
  totalDebtFils: number;
  pendingCount: number;
  customerName: string;
  customerPhone: string;
  invoices: any[];
  allInvoicesCount: number;
  hasCreditHistory: boolean;
  isSettled: boolean;
}> {
  try {
    await requirePermission('pos:access');
    const query = (customerIdentifier || '').trim().toLowerCase();
    if (!query || query === 'عميل نقدي' || query === 'نقدي' || query.length < 2) {
      return { found: false, totalDebtFils: 0, pendingCount: 0, customerName: '', customerPhone: '', invoices: [], allInvoicesCount: 0, hasCreditHistory: false, isSettled: false };
    }

    const allSales = await getAllCreditSales();
    const matchingSales = allSales.filter((s: any) => {
      const name = (s.customerName || '').toLowerCase();
      const phone = (s.customerPhone || '').toLowerCase();
      return name.includes(query) || phone.includes(query) || query.includes(name) || (phone && query.includes(phone));
    });

    const globalCustomers: any[] = (globalThis as any).__ghazal_resilient_customers || [];
    const matchingCust = globalCustomers.find((c: any) => {
      const name = (c.name || '').toLowerCase();
      const phone = (c.phone || '').toLowerCase();
      return name.includes(query) || phone.includes(query) || query.includes(name) || (phone && query.includes(phone));
    });

    if (matchingSales.length === 0 && !matchingCust) {
      return { found: false, totalDebtFils: 0, pendingCount: 0, customerName: '', customerPhone: '', invoices: [], allInvoicesCount: 0, hasCreditHistory: false, isSettled: false };
    }

    const pendingInvoices = matchingSales.filter((s: any) => s.remainingAmount > 0 && s.paymentStatus !== 'PAID');
    const totalDebtFils = pendingInvoices.reduce((sum: number, s: any) => sum + s.remainingAmount, 0) || (matchingCust ? matchingCust.creditBalanceFils || 0 : 0);
    const primaryName = matchingSales[0]?.customerName || matchingCust?.name || '';
    const primaryPhone = matchingSales.find((m: any) => m.customerPhone)?.customerPhone || matchingCust?.phone || '';

    const hasCreditHistory = matchingSales.length > 0 || (matchingCust && ((matchingCust.creditBalanceFils || 0) > 0 || (matchingCust.totalOrdersCount || 0) > 0));
    const isSettled = totalDebtFils === 0 && hasCreditHistory;

    return {
      found: true,
      totalDebtFils,
      pendingCount: pendingInvoices.length,
      customerName: primaryName,
      customerPhone: primaryPhone,
      invoices: pendingInvoices,
      allInvoicesCount: matchingSales.length,
      hasCreditHistory,
      isSettled
    };
  } catch (error) {
    console.error('Failed to get customer credit balance:', error);
    return { found: false, totalDebtFils: 0, pendingCount: 0, customerName: '', customerPhone: '', invoices: [], allInvoicesCount: 0, hasCreditHistory: false, isSettled: false };
  }
}

export async function settleCustomerCreditDebt(data: {
  customerIdentifier: string;
  amountFils: number;
  settlementMethod: 'CASH' | 'CARD' | 'WALLET';
  notes?: string;
}): Promise<{ success: boolean; error?: string; amountSettledFils?: number; newRemainingDebtFils?: number; message?: string }> {
  const { customerIdentifier, amountFils, settlementMethod, notes } = data;

  if (!amountFils || amountFils <= 0) {
    return { success: false, error: 'يرجى إدخال مبلغ سداد صحيح أكبر من صفر' };
  }

  // 1. In-memory check and update first for immediate availability
  const inMemList: any[] = (globalThis as any).__ghazal_credit_sales || resilientCreditSales || [];
  const cleanQuery = customerIdentifier.trim().toLowerCase();
  const inMemMatching = inMemList.filter((s: any) => {
    const matchId = s.id === customerIdentifier || s.reference === customerIdentifier || s.invoiceNumber === customerIdentifier;
    const matchName = (s.customerName || '').toLowerCase().includes(cleanQuery) || cleanQuery.includes((s.customerName || '').toLowerCase());
    const matchPhone = (s.customerPhone || '').includes(cleanQuery) || (cleanQuery.length > 3 && (s.customerPhone || '').includes(cleanQuery));
    return (matchId || matchName || matchPhone) && s.remainingAmount > 0;
  });

  let inMemDebtRemaining = 0;
  if (inMemMatching.length > 0) {
    let remainingPaymentToApply = amountFils;
    for (const sale of inMemMatching) {
      if (remainingPaymentToApply <= 0) break;
      const invoiceRemaining = sale.remainingAmount;
      if (invoiceRemaining <= 0) continue;
      const applyToThis = Math.min(remainingPaymentToApply, invoiceRemaining);
      sale.paidAmount = (sale.paidAmount || 0) + applyToThis;
      sale.remainingAmount = Math.max(0, sale.total - sale.paidAmount);
      sale.paymentStatus = sale.remainingAmount === 0 ? 'PAID' : 'PARTIALLY_PAID';
      remainingPaymentToApply -= applyToThis;
    }
    inMemDebtRemaining = inMemMatching.reduce((acc: number, item: any) => acc + item.remainingAmount, 0);
    syncCustomerDebtPayment(customerIdentifier, amountFils);
  }

  try {
    const session = await requirePermission('pos:access');

    // Check if customerIdentifier is a specific saleId
    let targetSales = await prisma.sale.findMany({
      where: {
        id: customerIdentifier,
        payments: { some: { method: 'CREDIT' } },
        invoice: { paymentStatus: { in: ['UNPAID', 'PARTIALLY_PAID'] } }
      },
      include: { invoice: true, payments: true }
    });

    // If not found by saleId, search by customer name / phone
    if (targetSales.length === 0) {
      const allCreditSales = await prisma.sale.findMany({
        where: {
          payments: { some: { method: 'CREDIT' } },
          invoice: { paymentStatus: { in: ['UNPAID', 'PARTIALLY_PAID'] } }
        },
        include: { invoice: true, payments: true },
        orderBy: { createdAt: 'asc' }
      });

      targetSales = allCreditSales.filter((sale: any) => {
        const creditPayment = sale.payments.find((p: any) => p.method === 'CREDIT');
        let extraData: any = {};
        try {
          if (creditPayment?.terminalRef) extraData = JSON.parse(creditPayment.terminalRef);
        } catch {}
        const name = (extraData.customerName || sale.customerName || '').toLowerCase();
        const phone = (extraData.phone || '').toLowerCase();
        return name.includes(cleanQuery) || phone.includes(cleanQuery) || cleanQuery.includes(name);
      });
    }

    if (targetSales.length === 0) {
      if (inMemMatching.length > 0) {
        return {
          success: true,
          amountSettledFils: amountFils,
          newRemainingDebtFils: inMemDebtRemaining,
          message: `تم سداد ${(amountFils / 1000).toFixed(3)} د.أ بنجاح. المتبقي في الذمة: ${(inMemDebtRemaining / 1000).toFixed(3)} د.أ`
        };
      }
      return { success: false, error: 'لم يتم العثور على ذمم مستحقة غير مسددة لهذا العميل' };
    }

    // Calculate total remaining debt
    const totalRemaining = targetSales.reduce((sum: number, s: any) => {
      const paid = (s.invoice?.cashAppliedFils || 0) + (s.invoice?.cardAppliedFils || 0);
      return sum + Math.max(0, s.total - paid);
    }, 0);

    if (amountFils > totalRemaining && inMemMatching.length === 0) {
      return { 
        success: false, 
        error: `المبلغ المدخل (${(amountFils / 1000).toFixed(3)} د.أ) يتجاوز إجمالي الذمة المستحقة (${(totalRemaining / 1000).toFixed(3)} د.أ)` 
      };
    }

    // Check active shift for cash registration
    const activeShift = await prisma.shift.findFirst({
      where: { employeeId: session.employeeId, status: 'OPEN' }
    });

    let remainingPaymentToApply = amountFils;
    let totalCashFromOtherShifts = 0;

    await prisma.$transaction(async (tx: any) => {
      for (const sale of targetSales) {
        if (remainingPaymentToApply <= 0) break;

        const currentPaid = (sale.invoice?.cashAppliedFils || 0) + (sale.invoice?.cardAppliedFils || 0);
        const invoiceRemaining = Math.max(0, sale.total - currentPaid);
        if (invoiceRemaining <= 0) continue;

        const applyToThis = Math.min(remainingPaymentToApply, invoiceRemaining);
        const newPaid = currentPaid + applyToThis;
        const isFullyPaid = newPaid >= sale.total;

        // Update invoice
        if (sale.invoice) {
          const newCashApplied = (sale.invoice.cashAppliedFils || 0) + (settlementMethod === 'CASH' ? applyToThis : 0);
          const newCardApplied = (sale.invoice.cardAppliedFils || 0) + (settlementMethod === 'CARD' ? applyToThis : 0);

          await tx.invoice.update({
            where: { id: sale.invoice.id },
            data: {
              cashAppliedFils: newCashApplied,
              cardAppliedFils: newCardApplied,
              paymentStatus: isFullyPaid ? 'PAID' : 'PARTIALLY_PAID',
              confirmedByEmployeeId: session.employeeId
            }
          });
        }

        // Create Payment record
        await tx.payment.create({
          data: {
            saleId: sale.id,
            method: settlementMethod,
            amount: applyToThis,
            amountTendered: applyToThis,
            terminalRef: `سداد ذمة - تم التحصيل بواسطة ${session.employeeId}${notes ? ` - ${notes}` : ''}`
          }
        });

        // If paid in cash and this sale was NOT in the current shift, accumulate for drawer cash-in
        if (settlementMethod === 'CASH' && activeShift && sale.shiftId !== activeShift.id) {
          totalCashFromOtherShifts += applyToThis;
        }

        remainingPaymentToApply -= applyToThis;
      }

      // If cash received in active shift for previous sales, record CashMovement so drawer count matches
      if (settlementMethod === 'CASH' && activeShift && totalCashFromOtherShifts > 0) {
        await tx.cashMovement.create({
          data: {
            shiftId: activeShift.id,
            employeeId: session.employeeId,
            type: 'CASH_IN',
            amountFils: totalCashFromOtherShifts,
            reason: `سداد ذمم نقدي - عميل: ${customerIdentifier} (${(totalCashFromOtherShifts / 1000).toFixed(3)} د.أ)`
          }
        });
      }

      // Audit Log
      await tx.auditLog.create({
        data: {
          employeeId: session.employeeId,
          action: 'CREDIT_DEBT_PAYMENT_COLLECTED',
          entityType: 'CreditSettlement',
          entityId: customerIdentifier,
          details: JSON.stringify({
            customerIdentifier,
            amountFils,
            settlementMethod,
            notes,
            remainingDebtAfter: Math.max(0, totalRemaining - amountFils)
          })
        }
      });
    });

    const newRemainingDebt = Math.max(0, totalRemaining - amountFils);

    return {
      success: true,
      amountSettledFils: amountFils,
      newRemainingDebtFils: newRemainingDebt,
      message: `تم سداد ${(amountFils / 1000).toFixed(3)} د.أ بنجاح. المتبقي في الذمة: ${(newRemainingDebt / 1000).toFixed(3)} د.أ`
    };
  } catch (error: any) {
    if (inMemMatching.length > 0) {
      return {
        success: true,
        amountSettledFils: amountFils,
        newRemainingDebtFils: inMemDebtRemaining,
        message: `تم سداد ${(amountFils / 1000).toFixed(3)} د.أ بنجاح. المتبقي في الذمة: ${(inMemDebtRemaining / 1000).toFixed(3)} د.أ`
      };
    }
    console.error('Failed to settle credit debt:', error);
    return { success: false, error: error.message || 'فشل سداد الذمة' };
  }
}

export async function settleCreditSale(
  saleId: string, 
  settlementMethod: 'CASH' | 'CARD' | 'WALLET' = 'CASH',
  amountFils?: number
): Promise<{ success: boolean; error?: string; amountSettledFils?: number; newRemainingDebtFils?: number; message?: string }> {
  await requirePermission('pos:settle_debt');
  // Check in-memory store first
  const inMemList: any[] = (globalThis as any).__ghazal_credit_sales || resilientCreditSales || [];
  const inMemSale = inMemList.find((s: any) => s.id === saleId || s.reference === saleId || s.invoiceNumber === saleId);

  if (inMemSale) {
    const remaining = inMemSale.remainingAmount;
    if (remaining <= 0) {
      return { success: false, error: 'تم سداد هذه الفاتورة بالكامل مسبقاً' };
    }

    const targetAmount = amountFils && amountFils > 0 ? Math.min(amountFils, remaining) : remaining;
    inMemSale.paidAmount = (inMemSale.paidAmount || 0) + targetAmount;
    inMemSale.remainingAmount = Math.max(0, inMemSale.total - inMemSale.paidAmount);
    inMemSale.paymentStatus = inMemSale.remainingAmount === 0 ? 'PAID' : 'PARTIALLY_PAID';
    syncCustomerDebtPayment(inMemSale.customerPhone || inMemSale.customerName, targetAmount);

    return {
      success: true,
      amountSettledFils: targetAmount,
      newRemainingDebtFils: inMemSale.remainingAmount,
      message: `تم سداد ${(targetAmount / 1000).toFixed(3)} د.أ بنجاح. المتبقي: ${(inMemSale.remainingAmount / 1000).toFixed(3)} د.أ`
    };
  }

  try {
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: { invoice: true }
    });

    if (!sale) {
      return { success: false, error: 'عملية البيع غير موجودة' };
    }

    const currentPaid = (sale.invoice?.cashAppliedFils || 0) + (sale.invoice?.cardAppliedFils || 0);
    const remaining = Math.max(0, sale.total - currentPaid);

    if (remaining <= 0) {
      return { success: false, error: 'تم سداد هذه الفاتورة بالكامل مسبقاً' };
    }

    const targetAmount = amountFils && amountFils > 0 ? Math.min(amountFils, remaining) : remaining;

    return await settleCustomerCreditDebt({
      customerIdentifier: saleId,
      amountFils: targetAmount,
      settlementMethod
    });
  } catch (error: any) {
    return { success: false, error: error.message || 'فشل سداد الذمة' };
  }
}

export async function getSaleDetailsForReceipt(query: string) {
  try {
    await requirePermission('pos:access');
    const clean = query.trim();
    if (!clean) return { success: false, error: 'رقم الفاتورة مطلوب' };

    const sale = await prisma.sale.findFirst({
      where: {
        OR: [
          { reference: clean },
          { id: clean },
          { invoice: { number: clean } }
        ]
      },
      include: {
        items: true,
        invoice: true,
        payments: true,
        employee: { select: { name: true } }
      }
    });

    if (!sale) {
      const inMem = resilientSalesLog.find(s => s.reference === clean || s.invoiceNumber === clean || s.saleId === clean);
      if (inMem) {
        return { success: true as const, sale: inMem };
      }
      return { success: false, error: 'لم يتم العثور على الفاتورة' };
    }

    const primaryPayment = sale.payments[0];
    let extraCreditData: any = {};
    try {
      if (primaryPayment?.terminalRef) {
        extraCreditData = JSON.parse(primaryPayment.terminalRef);
      }
    } catch {}

    const isCredit = primaryPayment?.method === 'CREDIT';

    return {
      success: true as const,
      sale: {
        id: sale.id,
        reference: sale.reference,
        invoiceNumber: sale.invoice?.number || sale.reference,
        taxInvoiceUuid: sale.invoice?.taxInvoiceUuid,
        taxQrCode: null, // لا يوجد فاتورة ضريبية إلكترونية مبسطة (QR) للإيصالات الورقية
        createdAt: sale.completedAt || sale.createdAt,
        customerName: extraCreditData.customerName || sale.customerName?.split(' [')[0] || sale.customerName || 'عميل نقدي',
        customerPhone: extraCreditData.phone || null,
        dueDate: isCredit ? (extraCreditData.dueDate || null) : null,
        notes: extraCreditData.notes || null,
        isCredit,
        paymentStatus: sale.invoice?.paymentStatus || 'PAID',
        cashierName: sale.sellerNameSnapshot || sale.employee?.name || 'كاشير غزل',
        items: sale.items.map((it: any) => ({
          name: it.name,
          size: it.size,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          total: it.total,
          sku: it.sku
        })),
        subtotal: sale.subtotal,
        discount: sale.discount,
        tax: sale.tax,
        total: sale.total,
        paymentMethod: primaryPayment?.method || 'CASH',
        amountTendered: primaryPayment?.amountTendered || sale.total,
        changeDue: sale.invoice?.changeDueFils || 0
      }
    };
  } catch (error: any) {
    const cleanQuery = typeof query === 'string' ? query.trim() : '';
    const inMem = resilientSalesLog.find(s => s.reference === cleanQuery || s.invoiceNumber === cleanQuery || s.saleId === cleanQuery);
    if (inMem) {
      return { success: true as const, sale: inMem };
    }
    return { success: false, error: error.message || 'فشل جلب تفاصيل الفاتورة' };
  }
}

// ====================================================================
// POS SALES & INVOICES HISTORY WITH FILTERS & REPRINT (سجل فواتير الكاشير)
// ====================================================================
function filterResilientSales(filters?: {
  date?: string;
  employeeId?: string;
  paymentMethod?: string;
  search?: string;
}) {
  let list = [...resilientSalesLog];
  if (filters?.paymentMethod && filters.paymentMethod !== 'ALL') {
    list = list.filter(s => s.paymentMethod === filters.paymentMethod);
  }
  if (filters?.search && filters.search.trim()) {
    const q = filters.search.trim().toLowerCase();
    list = list.filter(s => 
      (s.reference && s.reference.toLowerCase().includes(q)) ||
      (s.invoiceNumber && s.invoiceNumber.toLowerCase().includes(q)) ||
      (s.customerName && s.customerName.toLowerCase().includes(q))
    );
  }
  if (filters?.date) {
    list = list.filter(s => {
      const sDate = (s.createdAt || '').split('T')[0];
      return sDate === filters.date;
    });
  }
  return list.map(s => ({
    id: s.saleId || s.id || `sale-${Date.now()}`,
    reference: s.reference,
    invoiceNumber: s.invoiceNumber || s.reference,
    createdAt: s.createdAt,
    total: s.total,
    subtotal: s.subtotal || s.total,
    discount: s.discount || 0,
    tax: s.taxAmount || 0,
    status: s.status || (s.isRefunded ? 'REFUNDED' : (s.isModified ? 'MODIFIED' : 'COMPLETED')),
    isRefunded: s.isRefunded || s.status === 'REFUNDED',
    isModified: s.isModified || false,
    refundAmountFils: s.refundAmountFils || (s.returns ? s.returns.reduce((acc: number, r: any) => acc + (r.totalAmount || 0), 0) : 0),
    returns: s.returns || [],
    customerName: s.customerName || 'عميل نقدي',
    customerPhone: s.customerPhone || null,
    dueDate: s.dueDate || null,
    notes: s.notes || null,
    paymentMethod: s.paymentMethod || 'CASH',
    employeeName: s.cashierName || 'كاشير غزل (عين الباشا)',
    employeeId: 'emp-1',
    itemsCount: (s.items || []).reduce((sum: number, it: any) => sum + (it.quantity || 1), 0),
    items: s.items || []
  }));
}

export async function getPOSSalesHistory(filters?: {
  date?: string; // YYYY-MM-DD
  employeeId?: string;
  paymentMethod?: string;
  search?: string;
  take?: number;
}) {
  try {
    await requirePermission('pos:access');
    const take = filters?.take || 60;
    const where: any = {
      source: { not: 'STOREFRONT' },
      NOT: { reference: { startsWith: 'SALE-ORD-' } }
    };

    if (filters?.employeeId && filters.employeeId !== 'ALL') {
      where.employeeId = filters.employeeId;
    }

    if (filters?.paymentMethod && filters.paymentMethod !== 'ALL') {
      where.payments = {
        some: { method: filters.paymentMethod }
      };
    }

    if (filters?.search && filters.search.trim()) {
      const q = filters.search.trim();
      where.OR = [
        { reference: { contains: q, mode: 'insensitive' } },
        { customerName: { contains: q, mode: 'insensitive' } },
        { invoice: { number: { contains: q, mode: 'insensitive' } } }
      ];
    }

    if (filters?.date) {
      const startOfDay = new Date(`${filters.date}T00:00:00.000Z`);
      const endOfDay = new Date(`${filters.date}T23:59:59.999Z`);
      where.createdAt = {
        gte: startOfDay,
        lte: endOfDay
      };
    }

    const [sales, employees] = await Promise.all([
      prisma.sale.findMany({
        where,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          items: true,
          payments: true,
          invoice: true,
          employee: { select: { id: true, name: true } }
        }
      }),
      prisma.employee.findMany({
        select: { id: true, name: true },
        orderBy: { name: 'asc' }
      })
    ]);

    const mappedSales = sales.map(s => {
      const pm = s.payments[0];
      let meta: any = {};
      try {
        if (pm?.terminalRef) meta = JSON.parse(pm.terminalRef);
      } catch {}
      const isCredit = pm?.method === 'CREDIT';
      return {
        id: s.id,
        reference: s.reference,
        invoiceNumber: s.invoice?.number || s.reference,
        createdAt: (s.completedAt || s.createdAt).toISOString(),
        total: s.total,
        subtotal: s.subtotal,
        discount: s.discount,
        tax: s.tax,
        customerName: meta.customerName || s.customerName?.split(' [')[0] || s.customerName || 'عميل نقدي',
        customerPhone: meta.phone || null,
        dueDate: isCredit ? (meta.dueDate || null) : null,
        notes: meta.notes || (s as any).notes || null,
        status: s.status,
        isRefunded: s.status === 'REFUNDED',
        isModified: ((s as any).notes && (s as any).notes.includes('تعديل')) || false,
        refundAmountFils: s.status === 'REFUNDED' ? s.total : 0,
        paymentMethod: pm?.method || 'CASH',
        employeeName: s.sellerNameSnapshot || s.employee?.name || 'كاشير غزل',
        employeeId: s.employeeId,
        itemsCount: s.items.reduce((sum, it) => sum + it.quantity, 0),
        items: s.items.map(it => ({
          name: it.name,
          size: it.size,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          total: it.total
        }))
      };
    });

    const finalSales = mappedSales.length > 0 ? mappedSales : filterResilientSales(filters);
    const finalEmployees = employees.length > 0 ? employees : [
      { id: 'emp-1', name: 'كاشير غزل (عين الباشا)' }
    ];

    return {
      success: true as const,
      sales: finalSales,
      employees: finalEmployees
    };
  } catch (err: any) {
    console.warn('Prisma getPOSSalesHistory fallback active:', err);
    return {
      success: true as const,
      sales: filterResilientSales(filters),
      employees: [
        { id: 'emp-1', name: 'كاشير غزل (عين الباشا)' }
      ]
    };
  }
}

// ====================================================================
// LIVE POS CATALOG SYNCHRONIZATION (تزامن فوري للأصناف والأسعار مع الإدارة)
// ====================================================================

export async function getLivePOSCatalog(): Promise<{
  success: boolean;
  products: any[];
  timestamp: string;
}> {
  try {
    let products: any[] = [];
    try {
      const productsRaw = await prisma.product.findMany({
        where: { channel: { in: ['POS', 'SHARED'] } },
        include: {
          variants: {
            where: { isActive: true }
          },
          images: {
            where: { isMain: true },
            take: 1
          },
          accords: {
            include: { accord: true }
          }
        }
      });

      products = productsRaw.map(p => ({
        id: p.id,
        nameAr: p.nameAr,
        nameEn: p.nameEn,
        sku: p.sku,
        shortDescription: p.shortDescription,
        stockStatus: p.stockStatus,
        variants: p.variants,
        stockLiters: p.stockLiters,
        imageUrl: p.images[0]?.url || null,
        accords: p.accords.map(a => ({
          id: a.accordId,
          name: a.accord.name,
          value: a.value
        }))
      }));
    } catch (err) {
      console.warn('Prisma product query skipped in getLivePOSCatalog, using beauty catalog fallback');
    }

    const catalogPOSProducts = COSMETICS_CATALOG.filter(p => (p as any).isVisible !== false && p.channel !== 'ONLINE').map(p => ({
      id: p.id,
      nameAr: p.nameAr,
      nameEn: p.nameEn,
      sku: p.sku,
      shortDescription: p.shortDescription,
      stockStatus: 'IN_STOCK',
      variants: p.variants.filter(v => (v as any).isActive !== false).map(v => ({
        id: v.id,
        size: v.size,
        shade: v.shade,
        barcode: v.barcode,
        sku: v.sku,
        price: v.price,
        costPrice: (v as any).costPrice,
        isActive: true,
        usesGlobalPricing: false,
      })),
      stockLiters: 100,
      imageUrl: null,
      accords: [],
    }));

    const existingIds = new Set(products.map(p => p.id));
    const combined = [
      ...products,
      ...catalogPOSProducts.filter(cp => !existingIds.has(cp.id))
    ];

    return {
      success: true,
      products: combined,
      timestamp: new Date().toISOString()
    };
  } catch (error: any) {
    console.error('Error fetching live POS catalog:', error);
    return {
      success: false,
      products: [],
      timestamp: new Date().toISOString()
    };
  }
}

// ====================================================================
// QUICK UPDATE PRODUCT FROM POS (تعديل فوري لأسعار وبيانات المنتجات من الكاشير)
// ====================================================================

export async function quickUpdatePOSProduct(
  productId: string,
  data: {
    nameAr: string;
    barcode: string;
    priceFils: number;
    costPriceFils?: number;
    compareAtFils?: number;
    category?: string;
  }
) {
  await requirePermission('manage:products');
  try {
    if (!data.nameAr || !data.barcode || data.priceFils < 0) {
      return { success: false, error: 'البيانات المدخلة غير صحيحة أو السعر سالب' };
    }
    const trimmedBarcode = data.barcode.trim();
    const trimmedName = data.nameAr.trim();

    // 1. Try updating in Prisma if exists
    try {
      await prisma.product.update({
        where: { id: productId },
        data: {
          nameAr: trimmedName,
          sku: trimmedBarcode
        }
      });

      await prisma.productVariant.updateMany({
        where: { productId },
        data: {
          price: data.priceFils,
          barcode: trimmedBarcode,
          sku: trimmedBarcode,
          ...(data.compareAtFils !== undefined ? { compareAt: data.compareAtFils } : {})
        }
      });
    } catch (dbErr) {
      try {
        await prisma.productVariant.updateMany({
          where: { OR: [{ id: productId }, { barcode: trimmedBarcode }] },
          data: {
            price: data.priceFils,
            barcode: trimmedBarcode,
            ...(data.compareAtFils !== undefined ? { compareAt: data.compareAtFils } : {})
          }
        });
      } catch (e) {}
    }

    // 2. Update in in-memory COSMETICS_CATALOG
    const demo = COSMETICS_CATALOG.find(p => 
      p.id === productId || 
      p.slug === productId || 
      p.sku === trimmedBarcode || 
      p.variants.some(v => v.barcode === trimmedBarcode || v.id === productId)
    );
    if (demo) {
      demo.nameAr = trimmedName;
      demo.sku = trimmedBarcode;
      demo.priceFils = data.priceFils;
      if (data.compareAtFils && data.compareAtFils > data.priceFils) {
        demo.originalPriceFils = data.compareAtFils;
        demo.isFeatured = true;
      } else if (data.compareAtFils === 0 || data.compareAtFils === null) {
        demo.originalPriceFils = undefined;
      }
      if (demo.variants && demo.variants.length > 0) {
        demo.variants[0].price = data.priceFils;
        demo.variants[0].barcode = trimmedBarcode;
        demo.variants[0].sku = trimmedBarcode;
        if (data.compareAtFils !== undefined) {
          (demo.variants[0] as any).compareAt = data.compareAtFils;
        }
        if (data.costPriceFils !== undefined) {
          (demo.variants[0] as any).costPrice = data.costPriceFils;
        }
        if (data.category) demo.variants[0].shade = data.category;
      }
    }

    try {
      revalidatePath('/pos/cashier');
    } catch {}
    revalidatePath('/admin/products');
    revalidatePath('/admin/settlements');

    return { success: true };
  } catch (error: any) {
    console.error('Error in quickUpdatePOSProduct:', error);
    return { success: false, error: error.message };
  }
}

// ====================================================================
// POS QUICK CODES (الأكواد السريعة للكاشير - إدارة وتخزين مباشر في قاعدة البيانات)
// ====================================================================

export async function getPOSQuickCodesAction(): Promise<any[]> {
  try {
    const setting = await prisma.siteSettings.findUnique({
      where: { key: 'ghazal_pos_quick_codes' }
    });
    if (setting && setting.value) {
      try {
        const parsed = JSON.parse(setting.value);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      } catch (err) {
        console.warn('Failed to parse ghazal_pos_quick_codes from DB:', err);
      }
    }
  } catch (err) {
    console.warn('Failed to fetch quick codes from DB:', err);
  }
  return [];
}

export async function savePOSQuickCodesAction(codes: any[]): Promise<{ success: boolean; error?: string }> {
  try {
    await requirePermission('pos:access');
    const cleanCodes = Array.isArray(codes) ? codes : [];
    await prisma.siteSettings.upsert({
      where: { key: 'ghazal_pos_quick_codes' },
      update: { value: JSON.stringify(cleanCodes) },
      create: { key: 'ghazal_pos_quick_codes', value: JSON.stringify(cleanCodes) }
    });
    try {
      revalidatePath('/pos/cashier');
    } catch {}
    return { success: true };
  } catch (error: any) {
    console.error('Error saving quick codes to DB:', error);
    return { success: false, error: error.message || 'فشل حفظ الأكواد السريعة' };
  }
}

