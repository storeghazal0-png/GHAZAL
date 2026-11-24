/**
 * GHAZAL COSMETICS ERP & POS - FINANCIAL INTEGRITY & MONEY MODULE
 * Currency: Jordanian Dinar (JOD) / Jordanian Fils (1 JOD = 1,000 fils)
 *
 * ACCOUNTING INTEGRITY RULES:
 * 1. Integer Fils Math: All database storage and internal financial arithmetic
 *    are conducted in integer fils to avoid IEEE 754 floating-point inaccuracies.
 * 2. Half-Up Rounding: Fractional fils >= 0.5 round away from zero to the nearest integer.
 * 3. Identity Invariant: For any transaction: Gross Total = Net Subtotal + Tax Amount.
 * 4. Subtotal Non-negativity: Discounts and coupons cannot create negative subtotals.
 * 5. Audit Traceability: Cash reconciliation and courier batch net payouts follow exact formulas.
 */

export type CurrencyLocale = 'ar' | 'en';

/**
 * Converts a JOD decimal (number or string representation, e.g. 10.500 or "10.500")
 * to integer Fils (e.g. 10500) without binary floating-point drift.
 */
export function jodToFils(jod: number | string): number {
  if (typeof jod === 'string') {
    const clean = jod.trim();
    if (!clean) return 0;
    const isNegative = clean.startsWith('-');
    const unsigned = isNegative ? clean.slice(1) : clean;
    const parts = unsigned.split('.');
    const whole = parseInt(parts[0] || '0', 10);
    if (isNaN(whole)) return 0;

    let fraction = 0;
    if (parts.length > 1) {
      const rawFraction = parts[1];
      const fractionStr = rawFraction.padEnd(3, '0').slice(0, 3);
      fraction = parseInt(fractionStr, 10) || 0;
      // Half-up rounding on the 4th decimal place if present
      if (rawFraction.length > 3) {
        const fourthDigit = parseInt(rawFraction[3], 10);
        if (fourthDigit >= 5) {
          fraction += 1;
        }
      }
    }
    const total = whole * 1000 + fraction;
    return isNegative ? -total : total;
  }

  if (typeof jod !== 'number' || isNaN(jod) || !isFinite(jod)) {
    return 0;
  }

  // Multiply by 1000 and apply half-up arithmetic rounding
  return Math.round(jod * 1000);
}

/**
 * Converts integer Fils back to decimal JOD number.
 */
export function filsToJod(fils: number): number {
  if (fils === undefined || fils === null || isNaN(fils) || !isFinite(fils)) {
    return 0;
  }
  return Math.round(fils) / 1000;
}

/**
 * Formats integer Fils to user-friendly Arabic/English JOD 3-decimal strings.
 * Uses integer math to eliminate floating-point string formatting quirks.
 * e.g. 10500 fils -> "10.500 د.أ" or "10.500 JOD"
 *      -5000 fils -> "-5.000 د.أ" or "-5.000 JOD"
 */
export function filsToDisplay(fils: number, locale: CurrencyLocale = 'ar'): string {
  if (fils === undefined || fils === null || isNaN(fils) || !isFinite(fils)) {
    return locale === 'ar' ? '0.000 د.أ' : '0.000 JOD';
  }

  const roundedFils = Math.round(fils);
  const isNegative = roundedFils < 0;
  const absFils = Math.abs(roundedFils);
  const jodWhole = Math.floor(absFils / 1000);
  const remainderFils = absFils % 1000;
  const formatted = `${isNegative ? '-' : ''}${jodWhole}.${remainderFils.toString().padStart(3, '0')}`;

  return locale === 'ar' ? `${formatted} د.أ` : `${formatted} JOD`;
}

/**
 * Calculates a percentage value in fils with explicit Half-Up rounding.
 */
export function calculatePercentage(amount: number, percentage: number): number {
  if (!amount || !percentage || isNaN(amount) || isNaN(percentage)) return 0;
  return Math.round(amount * (percentage / 100));
}

/**
 * Extracts inclusive tax (VAT) from a gross total.
 * taxAmount = grossTotal - (grossTotal / (1 + rate / 100))
 * Rounded Half-Up to integer fils.
 */
export function calculateInclusiveTax(grossTotal: number, rate: number): number {
  if (rate <= 0 || grossTotal <= 0 || isNaN(rate) || isNaN(grossTotal)) return 0;
  const tax = grossTotal - grossTotal / (1 + rate / 100);
  return Math.max(0, Math.round(tax));
}

/**
 * Calculates exclusive tax (VAT) from a net subtotal.
 * taxAmount = netSubtotal * (rate / 100)
 * Rounded Half-Up to integer fils.
 */
export function calculateExclusiveTax(netSubtotal: number, rate: number): number {
  if (rate <= 0 || netSubtotal <= 0 || isNaN(rate) || isNaN(netSubtotal)) return 0;
  const tax = netSubtotal * (rate / 100);
  return Math.max(0, Math.round(tax));
}

/**
 * Calculates discount amount based on percentage or absolute fils values.
 * Enforces accounting boundaries:
 * 1. Discount cannot be negative.
 * 2. Discount cannot exceed subtotal (prevents negative subtotal anomalies).
 * 3. Percentage discounts are clamped between 0% and 100%.
 */
export function calculateDiscount(
  subtotal: number,
  discountValue: number,
  isPercentage: boolean
): number {
  if (subtotal <= 0 || discountValue <= 0 || isNaN(subtotal) || isNaN(discountValue)) {
    return 0;
  }

  const cleanSubtotal = Math.round(subtotal);

  if (isPercentage) {
    const clampedPercent = Math.min(100, Math.max(0, discountValue));
    const computed = calculatePercentage(cleanSubtotal, clampedPercent);
    return Math.min(cleanSubtotal, Math.max(0, computed));
  }

  const cleanDiscount = Math.round(discountValue);
  return Math.min(cleanSubtotal, Math.max(0, cleanDiscount));
}

/**
 * Comprehensive Tax & Discount Totals Calculation.
 * Guarantees exact accounting identity: netSubtotalFils + taxFils === grossTotalFils.
 */
export function calculateTaxAndTotals(
  subtotalFils: number,
  taxRate: number,
  pricesIncludeTax: boolean,
  discountValue: number = 0,
  isDiscountPercentage: boolean = false
): {
  subtotalBeforeDiscountFils: number;
  discountFils: number;
  subtotalAfterDiscountFils: number;
  netSubtotalFils: number;
  taxFils: number;
  grossTotalFils: number;
} {
  const subtotalBeforeDiscountFils = Math.max(0, Math.round(subtotalFils || 0));
  const discountFils = calculateDiscount(subtotalBeforeDiscountFils, discountValue, isDiscountPercentage);
  const subtotalAfterDiscountFils = Math.max(0, subtotalBeforeDiscountFils - discountFils);

  if (taxRate <= 0 || isNaN(taxRate)) {
    return {
      subtotalBeforeDiscountFils,
      discountFils,
      subtotalAfterDiscountFils,
      netSubtotalFils: subtotalAfterDiscountFils,
      taxFils: 0,
      grossTotalFils: subtotalAfterDiscountFils
    };
  }

  if (pricesIncludeTax) {
    // Inclusive VAT: Shelf price includes tax
    const grossTotalFils = subtotalAfterDiscountFils;
    const taxFils = calculateInclusiveTax(grossTotalFils, taxRate);
    const netSubtotalFils = grossTotalFils - taxFils;
    return {
      subtotalBeforeDiscountFils,
      discountFils,
      subtotalAfterDiscountFils,
      netSubtotalFils,
      taxFils,
      grossTotalFils
    };
  } else {
    // Exclusive VAT: Tax added on top of net subtotal
    const netSubtotalFils = subtotalAfterDiscountFils;
    const taxFils = calculateExclusiveTax(netSubtotalFils, taxRate);
    const grossTotalFils = netSubtotalFils + taxFils;
    return {
      subtotalBeforeDiscountFils,
      discountFils,
      subtotalAfterDiscountFils,
      netSubtotalFils,
      taxFils,
      grossTotalFils
    };
  }
}

/**
 * Validates payment allocation constraints:
 * 1. Total applied payments === invoiceTotal
 * 2. Every payment amount must be non-negative
 * 3. For cash payments: cashTendered >= cashApplied
 * 4. changeDue = cashTendered - cashApplied
 */
export function validatePaymentAllocation(
  invoiceTotal: number,
  payments: Array<{
    method: 'CASH' | 'CARD' | 'WALLET' | 'CREDIT' | string;
    amount: number;
    amountTendered?: number;
  }>
): {
  cashApplied: number;
  cardApplied: number;
  walletApplied: number;
  creditApplied: number;
  cashTendered: number;
  changeDue: number;
  totalApplied: number;
} {
  if (invoiceTotal < 0) {
    throw new Error('إجمالي الفاتورة لا يمكن أن يكون سالباً');
  }

  let cashApplied = 0;
  let cashTendered = 0;
  let cardApplied = 0;
  let walletApplied = 0;
  let creditApplied = 0;

  let totalApplied = 0;

  for (const p of payments) {
    if (p.amount < 0 || isNaN(p.amount)) {
      throw new Error('مبلغ الدفعة لا يمكن أن يكون سالباً');
    }

    const applied = Math.round(p.amount);
    totalApplied += applied;

    if (p.method === 'CASH') {
      const tendered = p.amountTendered !== undefined && p.amountTendered !== null ? Math.round(p.amountTendered) : applied;
      if (tendered < applied) {
        throw new Error('المبلغ النقدي المستلم أقل من قيمة الدفعة المطلوبة');
      }
      cashApplied += applied;
      cashTendered += tendered;
    } else if (p.method === 'CARD') {
      cardApplied += applied;
    } else if (p.method === 'WALLET') {
      walletApplied += applied;
    } else if (p.method === 'CREDIT') {
      creditApplied += applied;
    }
  }

  if (totalApplied !== invoiceTotal) {
    throw new Error(
      `مجموع المبالغ المدفوعة (${filsToDisplay(totalApplied)}) لا يساوي إجمالي الفاتورة المطلوب (${filsToDisplay(invoiceTotal)})`
    );
  }

  const changeDue = Math.max(0, cashTendered - cashApplied);

  return {
    cashApplied,
    cardApplied,
    walletApplied,
    creditApplied,
    cashTendered,
    changeDue,
    totalApplied
  };
}

/**
 * Cash Drawer Reconciliation Accounting Formula:
 * Expected Closing Cash = Opening Cash + Cash Sales - Cash Refunds - Cash Expenses + Cash In - Cash Out
 * Variance = Counted Cash - Expected Closing Cash
 */
export function calculateCashDrawerReconciliation(params: {
  openingCashFils: number;
  cashSalesFils: number;
  cashRefundsFils?: number;
  cashExpensesFils?: number;
  cashInFils?: number;
  cashOutFils?: number;
  countedCashFils: number;
}): {
  openingCashFils: number;
  cashSalesFils: number;
  cashRefundsFils: number;
  cashExpensesFils: number;
  cashInFils: number;
  cashOutFils: number;
  expectedClosingCashFils: number;
  countedCashFils: number;
  varianceFils: number;
  status: 'MATCH' | 'SHORTAGE' | 'SURPLUS';
} {
  const openingCashFils = Math.round(params.openingCashFils || 0);
  const cashSalesFils = Math.round(params.cashSalesFils || 0);
  const cashRefundsFils = Math.round(params.cashRefundsFils || 0);
  const cashExpensesFils = Math.round(params.cashExpensesFils || 0);
  const cashInFils = Math.round(params.cashInFils || 0);
  const cashOutFils = Math.round(params.cashOutFils || 0);
  const countedCashFils = Math.round(params.countedCashFils || 0);

  const expectedClosingCashFils =
    openingCashFils + cashSalesFils - cashRefundsFils - cashExpensesFils + cashInFils - cashOutFils;

  const varianceFils = countedCashFils - expectedClosingCashFils;

  let status: 'MATCH' | 'SHORTAGE' | 'SURPLUS' = 'MATCH';
  if (varianceFils < 0) {
    status = 'SHORTAGE';
  } else if (varianceFils > 0) {
    status = 'SURPLUS';
  }

  return {
    openingCashFils,
    cashSalesFils,
    cashRefundsFils,
    cashExpensesFils,
    cashInFils,
    cashOutFils,
    expectedClosingCashFils,
    countedCashFils,
    varianceFils,
    status
  };
}

/**
 * Courier Batch Settlements Accounting:
 * Total COD = Sum of COD for delivered/shipped active orders.
 * Total Delivery Fees = Sum of delivery fees for delivered orders (+ store-borne cancelled orders).
 * Net Payout = Total COD - Total Delivery Fees.
 */
/**
 * Pure Accounting Engine for Courier Delivery Batch Settlements:
 * 
 * Accurately handles:
 * 1. Per-order settlement states: DELIVERED, PARTIALLY_DELIVERED, RETURNED, CANCELLED, IN_TRANSIT, FAILED_ATTEMPT
 * 2. Partial settlements when some orders are delivered and others are in-transit
 * 3. Return fees for returned orders
 * 4. Actual collected COD vs expected COD (with collection discrepancy tracking)
 * 5. Negative net balance (when total fees exceed COD collection, creating a store liability payable to the courier)
 * 6. Multi-installment remittance tracking with remaining balance reconciliation
 */
export interface CourierBatchOrderInput {
  orderId?: string;
  orderNumber?: string;
  codAmountFils: number; // Expected COD
  collectedCodFils?: number | null; // Actual COD collected by courier (defaults to codAmountFils if DELIVERED)
  deliveryFeeFils: number; // Standard shipping fee
  returnFeeFils?: number; // Return fee if order was returned
  status: 'DELIVERED' | 'DELIVERED_COLLECTED' | 'PARTIALLY_DELIVERED' | 'RETURNED' | 'CANCELLED' | 'IN_TRANSIT' | 'OUT_FOR_DELIVERY' | 'FAILED_ATTEMPT' | 'PREPARED' | 'PENDING' | string;
  storeBearsDeliveryCost?: boolean;
}

export interface CourierRemittanceInput {
  id?: string;
  batchId?: string;
  receiptRef?: string;
  amountFils: number;
  date?: string;
  paymentMethod?: string;
  notes?: string;
  status?: 'CONFIRMED' | 'PENDING' | 'CANCELLED' | string;
}

export interface SingleOrderSettlementResult {
  orderId?: string;
  orderNumber?: string;
  status: string;
  expectedCodFils: number;
  collectedCodFils: number;
  deliveryFeeFils: number;
  returnFeeFils: number;
  totalCourierFeesFils: number;
  netSettlementFils: number;
  storeReceivableFils: number;
  companyPayableFils: number;
  discrepancyFils: number;
  isFinalized: boolean;
}

export interface DetailedCourierSettlementResult {
  totalExpectedCodFils: number;
  totalCollectedCodFils: number;
  totalCodFils: number; // Backward-compatible alias to totalCollectedCodFils
  totalDeliveryFeeFils: number;
  totalReturnFeeFils: number;
  totalCourierFeesFils: number;
  netSettlementFils: number;
  storeReceivableFils: number; // Amount courier owes the store (if net > 0)
  companyPayableFils: number; // Liability amount store owes the courier (if net < 0)
  codDiscrepancyFils: number; // Actual collected - Expected for delivered/partially delivered orders
  deliveredOrdersCount: number;
  returnedOrdersCount: number;
  cancelledOrdersCount: number; // Backward-compatible alias to returnedOrdersCount
  inTransitOrdersCount: number;
  totalOrdersCount: number;
  isPartialSettlement: boolean;
  settlementStatus: 'SETTLED' | 'PARTIALLY_SETTLED' | 'OUT_FOR_DELIVERY' | 'LIABILITY_OWED';
  totalRemittedFils: number;
  remainingBalanceFils: number;
}

/**
 * Calculates net settlement between store and courier without Math.max(0) clipping.
 * Preserves true mathematical signed value:
 * Positive = Store Receivable (courier owes store)
 * Negative = Company Payable (store owes courier for delivery/return fees)
 */
export function calculateNetSettlement(
  totalCodFils: number,
  deliveryFeeFils: number,
  returnFeeFils: number = 0
): {
  netSettlementFils: number;
  storeReceivableFils: number;
  companyPayableFils: number;
} {
  const net = Math.round(totalCodFils || 0) - Math.round(deliveryFeeFils || 0) - Math.round(returnFeeFils || 0);
  return {
    netSettlementFils: net,
    storeReceivableFils: Math.max(0, net),
    companyPayableFils: Math.max(0, -net)
  };
}

/**
 * Computes single order settlement details inside a courier batch.
 */
export function calculateOrderNetSettlement(order: CourierBatchOrderInput): SingleOrderSettlementResult {
  const rawStatus = (order.status || '').toUpperCase();
  const isDelivered = rawStatus === 'DELIVERED' || rawStatus === 'DELIVERED_COLLECTED';
  const isPartiallyDelivered = rawStatus === 'PARTIALLY_DELIVERED';
  const isReturned = rawStatus === 'RETURNED' || rawStatus === 'CANCELLED';
  const isFinalized = isDelivered || isPartiallyDelivered || isReturned;

  const expectedCodFils = Math.max(0, Math.round(order.codAmountFils || 0));
  const rawFee = Math.max(0, Math.round(order.deliveryFeeFils || 0));
  const returnFeeFils = Math.max(0, Math.round(order.returnFeeFils || 0));

  let collectedCodFils = 0;
  let deliveryFeeFils = 0;
  let discrepancyFils = 0;

  if (isDelivered) {
    collectedCodFils = typeof order.collectedCodFils === 'number' && !isNaN(order.collectedCodFils)
      ? Math.max(0, Math.round(order.collectedCodFils))
      : expectedCodFils;
    deliveryFeeFils = rawFee;
    discrepancyFils = collectedCodFils - expectedCodFils;
  } else if (isPartiallyDelivered) {
    collectedCodFils = typeof order.collectedCodFils === 'number' && !isNaN(order.collectedCodFils)
      ? Math.max(0, Math.round(order.collectedCodFils))
      : 0;
    deliveryFeeFils = rawFee;
    discrepancyFils = collectedCodFils - expectedCodFils;
  } else if (isReturned) {
    collectedCodFils = typeof order.collectedCodFils === 'number' && !isNaN(order.collectedCodFils)
      ? Math.max(0, Math.round(order.collectedCodFils))
      : 0;
    deliveryFeeFils = order.storeBearsDeliveryCost ? rawFee : 0;
    discrepancyFils = 0;
  } else {
    // In transit or prepared
    collectedCodFils = 0;
    deliveryFeeFils = 0;
    discrepancyFils = 0;
  }

  const effectiveReturnFee = (isReturned || isPartiallyDelivered) ? returnFeeFils : 0;
  const totalCourierFeesFils = deliveryFeeFils + effectiveReturnFee;
  const netSettlementFils = isFinalized ? (collectedCodFils - totalCourierFeesFils) : 0;
  const storeReceivableFils = Math.max(0, netSettlementFils);
  const companyPayableFils = Math.max(0, -netSettlementFils);

  return {
    orderId: order.orderId,
    orderNumber: order.orderNumber,
    status: order.status,
    expectedCodFils,
    collectedCodFils,
    deliveryFeeFils,
    returnFeeFils: effectiveReturnFee,
    totalCourierFeesFils,
    netSettlementFils,
    storeReceivableFils,
    companyPayableFils,
    discrepancyFils,
    isFinalized
  };
}

/**
 * Computes batch-level courier settlement with per-order precision,
 * unmasked negative liabilities, collection discrepancies, and multi-installment remittances.
 */
export function calculateCourierBatchSettlement(
  orders: CourierBatchOrderInput[],
  remittances?: CourierRemittanceInput[]
): DetailedCourierSettlementResult {
  let totalExpectedCodFils = 0;
  let totalCollectedCodFils = 0;
  let totalDeliveryFeeFils = 0;
  let totalReturnFeeFils = 0;
  let codDiscrepancyFils = 0;
  let deliveredOrdersCount = 0;
  let returnedOrdersCount = 0;
  let inTransitOrdersCount = 0;

  for (const order of orders) {
    const rawStatus = (order.status || '').toUpperCase();
    const isDelivered = rawStatus === 'DELIVERED' || rawStatus === 'DELIVERED_COLLECTED';
    const isPartiallyDelivered = rawStatus === 'PARTIALLY_DELIVERED';
    const isReturned = rawStatus === 'RETURNED' || rawStatus === 'CANCELLED';

    const expectedCod = Math.max(0, Math.round(order.codAmountFils || 0));
    totalExpectedCodFils += expectedCod;

    const deliveryFee = Math.max(0, Math.round(order.deliveryFeeFils || 0));
    const returnFee = Math.max(0, Math.round(order.returnFeeFils || 0));

    if (isDelivered) {
      deliveredOrdersCount++;
      const actualCollected = typeof order.collectedCodFils === 'number' && !isNaN(order.collectedCodFils)
        ? Math.max(0, Math.round(order.collectedCodFils))
        : expectedCod;
      totalCollectedCodFils += actualCollected;
      totalDeliveryFeeFils += deliveryFee;
      codDiscrepancyFils += (actualCollected - expectedCod);
    } else if (isPartiallyDelivered) {
      deliveredOrdersCount++;
      const actualCollected = typeof order.collectedCodFils === 'number' && !isNaN(order.collectedCodFils)
        ? Math.max(0, Math.round(order.collectedCodFils))
        : 0;
      totalCollectedCodFils += actualCollected;
      totalDeliveryFeeFils += deliveryFee;
      totalReturnFeeFils += returnFee;
      codDiscrepancyFils += (actualCollected - expectedCod);
    } else if (isReturned) {
      returnedOrdersCount++;
      totalReturnFeeFils += returnFee;
      if (order.storeBearsDeliveryCost) {
        totalDeliveryFeeFils += deliveryFee;
      }
      if (typeof order.collectedCodFils === 'number' && order.collectedCodFils > 0) {
        totalCollectedCodFils += Math.round(order.collectedCodFils);
      }
    } else {
      inTransitOrdersCount++;
    }
  }

  const totalCourierFeesFils = totalDeliveryFeeFils + totalReturnFeeFils;
  const netSettlementFils = totalCollectedCodFils - totalCourierFeesFils;
  const storeReceivableFils = Math.max(0, netSettlementFils);
  const companyPayableFils = Math.max(0, -netSettlementFils);

  // Multi-installment remittance aggregation
  let totalRemittedFils = 0;
  if (Array.isArray(remittances)) {
    for (const rem of remittances) {
      if (rem && rem.status !== 'CANCELLED' && typeof rem.amountFils === 'number' && !isNaN(rem.amountFils)) {
        totalRemittedFils += Math.round(rem.amountFils);
      }
    }
  }

  const targetSettlementFils = netSettlementFils >= 0 ? netSettlementFils : companyPayableFils;
  const remainingBalanceFils = Math.max(0, targetSettlementFils - totalRemittedFils);

  const isPartialSettlement = inTransitOrdersCount > 0 && deliveredOrdersCount > 0;
  let settlementStatus: 'SETTLED' | 'PARTIALLY_SETTLED' | 'OUT_FOR_DELIVERY' | 'LIABILITY_OWED' = 'OUT_FOR_DELIVERY';

  if (inTransitOrdersCount === 0 && orders.length > 0) {
    if (netSettlementFils < 0) {
      settlementStatus = remainingBalanceFils === 0 ? 'SETTLED' : 'LIABILITY_OWED';
    } else {
      settlementStatus = remainingBalanceFils === 0 ? 'SETTLED' : 'PARTIALLY_SETTLED';
    }
  } else if (isPartialSettlement) {
    settlementStatus = 'PARTIALLY_SETTLED';
  }

  return {
    totalExpectedCodFils,
    totalCollectedCodFils,
    totalCodFils: totalCollectedCodFils,
    totalDeliveryFeeFils,
    totalReturnFeeFils,
    totalCourierFeesFils,
    netSettlementFils,
    storeReceivableFils,
    companyPayableFils,
    codDiscrepancyFils,
    deliveredOrdersCount,
    returnedOrdersCount,
    cancelledOrdersCount: returnedOrdersCount,
    inTransitOrdersCount,
    totalOrdersCount: orders.length,
    isPartialSettlement,
    settlementStatus,
    totalRemittedFils,
    remainingBalanceFils
  };
}

/**
 * Comprehensive Operating Profit & Loss (P&L) Calculation:
 * Gross Profit = Gross Sales - COGS
 * Net Operating Profit = Gross Profit - Total Operating Expenses (Rent + Electricity + Water & Internet + Other OPEX + Delivery Fees)
 */
export function calculateProfitAndLoss(params: {
  grossSalesFils: number;
  cogsFils: number;
  operatingExpenses: {
    rentFils: number;
    electricityFils: number;
    waterAndInternetFils: number;
    otherOpexFils: number;
    deliveryFeesFils: number;
  };
}): {
  grossSalesFils: number;
  cogsFils: number;
  grossProfitFils: number;
  grossMarginPercent: number;
  operatingExpensesBreakdown: {
    rentFils: number;
    electricityFils: number;
    waterAndInternetFils: number;
    otherOpexFils: number;
    deliveryFeesFils: number;
  };
  totalOperatingExpensesFils: number;
  netOperatingProfitFils: number;
  netMarginPercent: number;
  isLoss: boolean;
} {
  const grossSalesFils = Math.round(params.grossSalesFils || 0);
  const cogsFils = Math.round(params.cogsFils || 0);
  const grossProfitFils = grossSalesFils - cogsFils;
  const grossMarginPercent = grossSalesFils > 0 ? Math.round((grossProfitFils / grossSalesFils) * 100) : 0;

  const rentFils = Math.round(params.operatingExpenses.rentFils || 0);
  const electricityFils = Math.round(params.operatingExpenses.electricityFils || 0);
  const waterAndInternetFils = Math.round(params.operatingExpenses.waterAndInternetFils || 0);
  const otherOpexFils = Math.round(params.operatingExpenses.otherOpexFils || 0);
  const deliveryFeesFils = Math.round(params.operatingExpenses.deliveryFeesFils || 0);

  const totalOperatingExpensesFils =
    rentFils + electricityFils + waterAndInternetFils + otherOpexFils + deliveryFeesFils;

  const netOperatingProfitFils = grossProfitFils - totalOperatingExpensesFils;
  const netMarginPercent = grossSalesFils > 0 ? Math.round((netOperatingProfitFils / grossSalesFils) * 100) : 0;
  const isLoss = netOperatingProfitFils < 0;

  return {
    grossSalesFils,
    cogsFils,
    grossProfitFils,
    grossMarginPercent,
    operatingExpensesBreakdown: {
      rentFils,
      electricityFils,
      waterAndInternetFils,
      otherOpexFils,
      deliveryFeesFils
    },
    totalOperatingExpensesFils,
    netOperatingProfitFils,
    netMarginPercent,
    isLoss
  };
}

/**
 * Normalizes and sanitizes user input for numeric currency / price fields.
 * Converts Arabic-Indic digits (٠١٢٣٤٥٦٧٨٩) to standard Western digits (0123456789),
 * converts commas (, or ،) to decimal points (.), strips disallowed characters,
 * and preserves a single valid decimal point during active typing.
 */
export function sanitizePriceInput(val: string): string {
  if (!val) return '';
  // Convert Arabic-Indic numerals to ASCII
  const western = val.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString());
  // Normalize commas to decimal dot
  const dotted = western.replace(/[,،]/g, '.');
  // Strip any characters that are not digits or dot
  const clean = dotted.replace(/[^0-9.]/g, '');
  // Keep only the first decimal point if multiple are entered
  const parts = clean.split('.');
  if (parts.length > 2) {
    return parts[0] + '.' + parts.slice(1).join('');
  }
  return clean;
}

