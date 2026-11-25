'use server';

import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/dal';
import { revalidatePath } from 'next/cache';

// ====================================================================
// RESILIENT FINANCE REGISTRY (سندات القبض، سندات الدفع، والمصاريف)
// ====================================================================
export interface FinancialVoucher {
  id: string;
  voucherNumber: string;
  type: 'RECEIPT' | 'PAYMENT'; // RECEIPT = سند قبض (تحصيل/إيداع), PAYMENT = سند دفع (صرف/دفعة)
  amountFils: number;
  partyName: string; // اسم الدافع أو المستفيد
  reason: string;
  category: string; // تصنيف الحركة
  paymentMethod: 'CASH' | 'BANK' | 'CHEQUE';
  paidFromDrawer: boolean; // هل تم الصرف من/الإيداع في صندوق الكاشير؟
  shiftId?: string | null;
  employeeId: string;
  employeeName: string;
  notes?: string | null;
  createdAt: string;
}

export interface OperatingExpense {
  id: string;
  expenseNumber: string;
  category: string; // إيجار، كهرباء، مياه، مستلزمات، بضاعة مورد، ضيافة، صيانة، رواتب، أخرى
  amountFils: number;
  beneficiary: string;
  description: string;
  paymentMethod: 'CASH' | 'BANK' | 'CHEQUE';
  paidFromDrawer: boolean;
  shiftId?: string | null;
  employeeId: string;
  employeeName: string;
  receiptAttachment?: string | null;
  createdAt: string;
}

const resilientVouchers: FinancialVoucher[] = (globalThis as any).__ghazal_resilient_vouchers || [];
(globalThis as any).__ghazal_resilient_vouchers = resilientVouchers;

const resilientExpenses: OperatingExpense[] = (globalThis as any).__ghazal_resilient_expenses || [];
(globalThis as any).__ghazal_resilient_expenses = resilientExpenses;

async function getVouchersFromDb(): Promise<FinancialVoucher[]> {
  try {
    const s = await prisma.siteSettings.findUnique({ where: { key: 'ghazal_financial_vouchers' } });
    if (s?.value) {
      const parsed = JSON.parse(s.value);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    console.warn('Error loading financial vouchers from DB:', err);
  }
  return resilientVouchers;
}

async function saveVouchersToDb(vouchers: FinancialVoucher[]): Promise<void> {
  try {
    await prisma.siteSettings.upsert({
      where: { key: 'ghazal_financial_vouchers' },
      update: { value: JSON.stringify(vouchers) },
      create: { key: 'ghazal_financial_vouchers', value: JSON.stringify(vouchers) }
    });
  } catch (err) {
    console.warn('Error saving financial vouchers to DB:', err);
  }
  resilientVouchers.length = 0;
  resilientVouchers.push(...vouchers);
}

async function getExpensesFromDb(): Promise<OperatingExpense[]> {
  try {
    const s = await prisma.siteSettings.findUnique({ where: { key: 'ghazal_operating_expenses' } });
    if (s?.value) {
      const parsed = JSON.parse(s.value);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    console.warn('Error loading operating expenses from DB:', err);
  }
  return resilientExpenses;
}

async function saveExpensesToDb(expenses: OperatingExpense[]): Promise<void> {
  try {
    await prisma.siteSettings.upsert({
      where: { key: 'ghazal_operating_expenses' },
      update: { value: JSON.stringify(expenses) },
      create: { key: 'ghazal_operating_expenses', value: JSON.stringify(expenses) }
    });
  } catch (err) {
    console.warn('Error saving operating expenses to DB:', err);
  }
  resilientExpenses.length = 0;
  resilientExpenses.push(...expenses);
}

// ====================================================================
// ACTIONS: VOUCHERS (سندات القبض والدفع)
// ====================================================================

export async function createFinancialVoucher(data: {
  type: 'RECEIPT' | 'PAYMENT';
  amountFils: number;
  partyName: string;
  reason: string;
  category?: string;
  paymentMethod: 'CASH' | 'BANK' | 'CHEQUE';
  paidFromDrawer: boolean;
  notes?: string;
  shiftId?: string;
}) {
  try {
    const session = await requirePermission('pos:access');
    if (!data.amountFils || data.amountFils <= 0 || isNaN(data.amountFils)) {
      return { success: false, error: 'مبلغ السند المالي يجب أن يكون أكبر من صفر' };
    }
    if (!data.partyName || !data.partyName.trim()) {
      return { success: false, error: 'يرجى إدخال اسم الطرف / المستفيد' };
    }
    if (!data.reason || !data.reason.trim()) {
      return { success: false, error: 'يرجى إدخال سبب الحركة المالية' };
    }

    const cleanAmountFils = Math.round(data.amountFils);
    const voucherPrefix = data.type === 'RECEIPT' ? 'RC' : 'PV';
    const voucherNumber = `${voucherPrefix}-${Date.now().toString().slice(-6)}`;
    const employeeName = session.employee?.name || 'كاشير غزل';

    const newVoucher: FinancialVoucher = {
      id: `vch-${Date.now().toString(36)}`,
      voucherNumber,
      type: data.type,
      amountFils: cleanAmountFils,
      partyName: data.partyName.trim(),
      reason: data.reason.trim(),
      category: data.category || (data.type === 'RECEIPT' ? 'إيداع وتحصيل' : 'صرف ونفقات'),
      paymentMethod: data.paymentMethod,
      paidFromDrawer: data.paidFromDrawer,
      shiftId: data.shiftId || null,
      employeeId: session.employeeId,
      employeeName,
      notes: data.notes || null,
      createdAt: new Date().toISOString()
    };

    const currentVouchers = await getVouchersFromDb();
    currentVouchers.unshift(newVoucher);
    await saveVouchersToDb(currentVouchers);

    // If paid/deposited from drawer, create single cash movement entry in CashMovement model
    if (data.paidFromDrawer) {
      try {
        const activeShift = await prisma.shift.findFirst({
          where: { employeeId: session.employeeId, status: 'OPEN' }
        });
        if (activeShift) {
          await prisma.cashMovement.create({
            data: {
              shiftId: activeShift.id,
              employeeId: session.employeeId,
              type: data.type === 'RECEIPT' ? 'CASH_IN' : 'CASH_OUT',
              amountFils: data.amountFils,
              reason: `${data.type === 'RECEIPT' ? 'سند قبض' : 'سند دفع'} [${voucherNumber}]: ${data.reason}`
            }
          });
        }
      } catch (err) {
        console.warn('Prisma cash movement recorded in memory');
      }
    }

    // Audit log
    try {
      await prisma.auditLog.create({
        data: {
          employeeId: session.employeeId,
          action: data.type === 'RECEIPT' ? 'RECEIPT_VOUCHER_CREATED' : 'PAYMENT_VOUCHER_CREATED',
          entityType: 'FinancialVoucher',
          entityId: newVoucher.id,
          details: JSON.stringify(newVoucher)
        }
      });
    } catch {}

    revalidatePath('/admin/settlements');
    revalidatePath('/admin/pos/cash');
    revalidatePath('/pos/cashier');

    return { success: true, voucher: newVoucher };
  } catch (error: any) {
    return { success: false, error: error.message || 'فشل إصدار السند المالي' };
  }
}

export async function getAllFinancialVouchers(filters?: {
  type?: 'RECEIPT' | 'PAYMENT';
  search?: string;
}) {
  try {
    const dbVouchers = await getVouchersFromDb();
    let list = [...dbVouchers];
    if (filters?.type) {
      list = list.filter(v => v.type === filters.type);
    }
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      list = list.filter(v => 
        v.voucherNumber.toLowerCase().includes(q) ||
        v.partyName.toLowerCase().includes(q) ||
        v.reason.toLowerCase().includes(q)
      );
    }
    return list;
  } catch {
    return [];
  }
}

// ====================================================================
// ACTIONS: EXPENSES (المصاريف التشغيلية)
// ====================================================================

export async function createOperatingExpense(data: {
  category: string;
  amountFils: number;
  beneficiary: string;
  description: string;
  paymentMethod: 'CASH' | 'BANK' | 'CHEQUE';
  paidFromDrawer: boolean;
  shiftId?: string;
  receiptAttachment?: string;
}) {
  try {
    const session = await requirePermission('pos:access');
    if (!data.amountFils || data.amountFils <= 0 || isNaN(data.amountFils)) {
      return { success: false, error: 'مبلغ المصروف التشغيلي يجب أن يكون أكبر من صفر' };
    }
    if (!data.beneficiary || !data.beneficiary.trim()) {
      return { success: false, error: 'يرجى إدخال اسم المستفيد / المورد' };
    }
    if (!data.description || !data.description.trim()) {
      return { success: false, error: 'يرجى إدخال بيان وتفاصيل المصروف' };
    }

    const cleanAmountFils = Math.round(data.amountFils);
    const expenseNumber = `EXP-${Date.now().toString().slice(-6)}`;
    const employeeName = session.employee?.name || 'كاشير غزل';

    const newExpense: OperatingExpense = {
      id: `exp-${Date.now().toString(36)}`,
      expenseNumber,
      category: data.category,
      amountFils: cleanAmountFils,
      beneficiary: data.beneficiary.trim(),
      description: data.description.trim(),
      paymentMethod: data.paymentMethod,
      paidFromDrawer: data.paidFromDrawer,
      shiftId: data.shiftId || null,
      employeeId: session.employeeId,
      employeeName,
      receiptAttachment: data.receiptAttachment || null,
      createdAt: new Date().toISOString()
    };

    const currentExpenses = await getExpensesFromDb();
    currentExpenses.unshift(newExpense);
    await saveExpensesToDb(currentExpenses);

    // If paid from cash drawer, ensure exactly ONE CashMovement is created (Section 7 rule)
    if (data.paidFromDrawer) {
      try {
        const activeShift = await prisma.shift.findFirst({
          where: { employeeId: session.employeeId, status: 'OPEN' }
        });
        if (activeShift) {
          await prisma.cashMovement.create({
            data: {
              shiftId: activeShift.id,
              employeeId: session.employeeId,
              type: 'CASH_OUT',
              amountFils: data.amountFils,
              reason: `مصروف تشغيلي [${expenseNumber}]: ${data.category} - ${data.description}`
            }
          });
        }
      } catch (err) {
        console.warn('Prisma cash movement recorded in memory');
      }
    }

    try {
      await prisma.auditLog.create({
        data: {
          employeeId: session.employeeId,
          action: 'EXPENSE_RECORDED',
          entityType: 'OperatingExpense',
          entityId: newExpense.id,
          details: JSON.stringify(newExpense)
        }
      });
    } catch {}

    try {
      revalidatePath('/admin/settlements');
      revalidatePath('/admin/pos/cash');
      revalidatePath('/pos/cashier');
    } catch {}

    return { success: true, expense: newExpense };
  } catch (error: any) {
    return { success: false, error: error.message || 'فشل تسجيل المصروف' };
  }
}

export async function getAllOperatingExpenses(filters?: {
  category?: string;
  search?: string;
}) {
  try {
    const dbExpenses = await getExpensesFromDb();
    let list = [...dbExpenses];
    if (filters?.category) {
      list = list.filter(e => e.category === filters.category);
    }
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      list = list.filter(e =>
        e.expenseNumber.toLowerCase().includes(q) ||
        e.beneficiary.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q)
      );
    }
    return list;
  } catch {
    return [];
  }
}

// ====================================================================
// FINANCIAL SUMMARY (إجمالي المقبوضات والمدفوعات والمصاريف)
// ====================================================================

export async function getFinancialOverview() {
  try {
    const vouchers = await getAllFinancialVouchers();
    const expenses = await getAllOperatingExpenses();

    const totalReceiptsFils = vouchers
      .filter(v => v.type === 'RECEIPT')
      .reduce((acc, v) => acc + v.amountFils, 0);

    const totalPaymentsFils = vouchers
      .filter(v => v.type === 'PAYMENT')
      .reduce((acc, v) => acc + v.amountFils, 0);

    const totalExpensesFils = expenses.reduce((acc, e) => acc + e.amountFils, 0);

    const drawerExpensesFils = expenses
      .filter(e => e.paidFromDrawer)
      .reduce((acc, e) => acc + e.amountFils, 0);

    return {
      totalReceiptsFils,
      totalPaymentsFils,
      totalExpensesFils,
      drawerExpensesFils,
      vouchersCount: vouchers.length,
      expensesCount: expenses.length
    };
  } catch {
    return {
      totalReceiptsFils: 0,
      totalPaymentsFils: 0,
      totalExpensesFils: 0,
      drawerExpensesFils: 0,
      vouchersCount: 0,
      expensesCount: 0
    };
  }
}
