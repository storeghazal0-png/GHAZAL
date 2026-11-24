'use server';

import { prisma } from '@/lib/db';
import { requireAuth, requirePermission } from '@/lib/dal';
import { revalidatePath } from 'next/cache';
import { COSMETICS_CATALOG } from '@/lib/cosmetics-catalog';

export type RewardType = 'FREE_GIFT' | 'FREE_SHIPPING' | 'FIXED_DISCOUNT' | 'PERCENTAGE_DISCOUNT';
export type GiftMode = 'FIXED_PRODUCT' | 'CUSTOMER_CHOICE';
export type OutOfStockPolicy = 'AUTO_PAUSE' | 'FALLBACK_COSMETIC_GIFT';
export type SpendCalculationBasis = 'ITEMS_BEFORE_DISCOUNT' | 'ITEMS_AFTER_DISCOUNT';
export type StackingBehavior = 'APPLY_HIGHEST_ONLY' | 'STACK_ALL_QUALIFIED';
export type RuleStatus = 'ACTIVE' | 'MANUALLY_PAUSED' | 'SCHEDULED' | 'EXPIRED' | 'LIMIT_REACHED' | 'GIFT_OUT_OF_STOCK';

export type MultiGiftResolutionMode = 'HIGHEST_TIER_ONLY' | 'CUSTOMER_CHOICE' | 'STACK_ALL_GIFTS';
export type FreeShippingStackingMode = 'ALLOW_WITH_GIFTS' | 'STANDALONE_ONLY';

export interface RewardSystemSettings {
  multiGiftResolution: MultiGiftResolutionMode;
  freeShippingStacking: FreeShippingStackingMode;
  allowDiscountWithGift: boolean;
  minSpendCalculation: 'ITEMS_ONLY' | 'ITEMS_AND_SHIPPING';
}

export interface RewardEvaluationResult {
  qualifiedRules: RewardRule[];
  appliedGift: GiftProductInfo | null;
  allQualifiedGifts: GiftProductInfo[];
  appliedGiftsList: GiftProductInfo[];
  freeShippingApplied: boolean;
  freeShippingSavingsFils: number;
  discountAmountFils: number;
  appliedDiscountRule: RewardRule | null;
  finalShippingFeeFils: number;
  finalTotalFils: number;
  upgradedGiftNote: string | null;
  notificationMessages: string[];
  settings: RewardSystemSettings;
}

export interface GiftProductInfo {
  id: string;
  nameAr: string;
  sku: string;
  imageUrl?: string;
  price: number; // in fils
  costPrice?: number; // in fils
  stock: number;
}

export interface RewardRule {
  id: string;
  title: string;
  rewardType: RewardType;
  
  // Gift settings
  giftMode?: GiftMode;
  giftProductIds: string[];
  giftProductsInfo: GiftProductInfo[];
  outOfStockPolicy: OutOfStockPolicy;

  // Discount settings
  discountValue: number; // fils for FIXED, percentage number (e.g. 10) for PERCENTAGE
  maxDiscountFils?: number; // Cap for percentage discount

  // Minimum Spend calculation
  minSpendFils: number;
  spendCalculationBasis: SpendCalculationBasis;
  includesShippingInThreshold: boolean;

  // Stacking & Priority
  isStackable: boolean;
  priority: number;
  stackingBehavior: StackingBehavior;

  // Usage limits
  totalUsageLimit?: number;
  perCustomerLimit?: number;
  currentUsageCount: number;

  // Validity period
  startsAt: string;
  endsAt?: string;
  isActive: boolean;
  status: RuleStatus;
  statusReasonAr: string;
  createdAt: string;
}

export interface RewardRedemptionRecord {
  id: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  ruleId: string;
  ruleTitle: string;
  rewardType: RewardType;
  rewardDetailAr: string;
  discountCostFils: number;
  estimatedGiftCostFils: number;
  basketTotalFils: number;
  orderStatus: 'DELIVERED' | 'PREPARED' | 'IN_TRANSIT' | 'CANCELLED' | 'REFUNDED';
  redeemedAt: string;
  isReversed: boolean;
  reversalReason?: string;
}

// Initial sample catalog products for gifts
const getCatalogGiftProducts = (ids: string[]): GiftProductInfo[] => {
  return ids.map(id => {
    const prod = COSMETICS_CATALOG.find(p => p.id === id || p.slug === id);
    if (prod) {
      const v = prod.variants[0];
      return {
        id: prod.id,
        nameAr: prod.nameAr,
        sku: prod.sku,
        imageUrl: prod.images[0]?.url,
        price: v?.price || prod.priceFils,
        costPrice: Math.round((v?.price || prod.priceFils) * 0.55),
        stock: v?.stock ?? 45
      };
    }
    return {
      id,
      nameAr: 'مستحضر تجميل هدية من غزل',
      sku: 'GHZ-GIFT',
      price: 12000,
      costPrice: 6500,
      stock: 30
    };
  });
};

const INITIAL_REWARD_RULES: RewardRule[] = [
  {
    id: 'rew-rule-1',
    title: 'هدية أحمر شفاه مايبيلين سوبر ستاي عند الشراء بأكثر من 35 د.أ',
    rewardType: 'FREE_GIFT',
    giftMode: 'FIXED_PRODUCT',
    giftProductIds: ['ghaz-prod-1'],
    giftProductsInfo: getCatalogGiftProducts(['ghaz-prod-1']),
    outOfStockPolicy: 'AUTO_PAUSE',
    discountValue: 0,
    minSpendFils: 35000,
    spendCalculationBasis: 'ITEMS_BEFORE_DISCOUNT',
    includesShippingInThreshold: false,
    isStackable: false,
    priority: 1,
    stackingBehavior: 'APPLY_HIGHEST_ONLY',
    totalUsageLimit: 100,
    perCustomerLimit: 1,
    currentUsageCount: 0,
    startsAt: new Date(Date.now() - 86400000 * 15).toISOString(),
    endsAt: new Date(Date.now() + 86400000 * 45).toISOString(),
    isActive: true,
    status: 'ACTIVE',
    statusReasonAr: 'القاعدة نشطة وتطبق تلقائياً على السلات المؤهلة',
    createdAt: new Date(Date.now() - 86400000 * 15).toISOString()
  },
  {
    id: 'rew-rule-2',
    title: 'اختاري هديتكِ من تشكيلة العناية بالبشرة للطلبات فوق 50 د.أ',
    rewardType: 'FREE_GIFT',
    giftMode: 'CUSTOMER_CHOICE',
    giftProductIds: ['ghaz-prod-3', 'ghaz-prod-4', 'ghaz-prod-6'],
    giftProductsInfo: getCatalogGiftProducts(['ghaz-prod-3', 'ghaz-prod-4', 'ghaz-prod-6']),
    outOfStockPolicy: 'FALLBACK_COSMETIC_GIFT',
    discountValue: 0,
    minSpendFils: 50000,
    spendCalculationBasis: 'ITEMS_AFTER_DISCOUNT',
    includesShippingInThreshold: false,
    isStackable: true,
    priority: 2,
    stackingBehavior: 'STACK_ALL_QUALIFIED',
    totalUsageLimit: 50,
    perCustomerLimit: 1,
    currentUsageCount: 0,
    startsAt: new Date(Date.now() - 86400000 * 10).toISOString(),
    endsAt: new Date(Date.now() + 86400000 * 20).toISOString(),
    isActive: true,
    status: 'ACTIVE',
    statusReasonAr: 'القاعدة نشطة - العميلة تختار هديتها بالسلة',
    createdAt: new Date(Date.now() - 86400000 * 10).toISOString()
  },
  {
    id: 'rew-rule-3',
    title: 'توصيل مجاني لكافة محافظات المملكة للطلبات 25 د.أ فأكثر',
    rewardType: 'FREE_SHIPPING',
    giftProductIds: [],
    giftProductsInfo: [],
    outOfStockPolicy: 'AUTO_PAUSE',
    discountValue: 2000, // standard delivery fee covered
    minSpendFils: 25000,
    spendCalculationBasis: 'ITEMS_AFTER_DISCOUNT',
    includesShippingInThreshold: false,
    isStackable: true,
    priority: 3,
    stackingBehavior: 'STACK_ALL_QUALIFIED',
    totalUsageLimit: 500,
    perCustomerLimit: 5,
    currentUsageCount: 0,
    startsAt: new Date(Date.now() - 86400000 * 30).toISOString(),
    endsAt: new Date(Date.now() + 86400000 * 60).toISOString(),
    isActive: true,
    status: 'ACTIVE',
    statusReasonAr: 'القاعدة نشطة لجميع المحافظات',
    createdAt: new Date(Date.now() - 86400000 * 30).toISOString()
  },
  {
    id: 'rew-rule-4',
    title: 'خصم نقدي 5.000 د.أ عند الشراء بقيمة 40 د.أ فما فوق',
    rewardType: 'FIXED_DISCOUNT',
    giftProductIds: [],
    giftProductsInfo: [],
    outOfStockPolicy: 'AUTO_PAUSE',
    discountValue: 5000,
    minSpendFils: 40000,
    spendCalculationBasis: 'ITEMS_BEFORE_DISCOUNT',
    includesShippingInThreshold: false,
    isStackable: false,
    priority: 4,
    stackingBehavior: 'APPLY_HIGHEST_ONLY',
    totalUsageLimit: 30,
    perCustomerLimit: 1,
    currentUsageCount: 0,
    startsAt: new Date(Date.now() - 86400000 * 20).toISOString(),
    endsAt: new Date(Date.now() + 86400000 * 10).toISOString(),
    isActive: false,
    status: 'LIMIT_REACHED',
    statusReasonAr: 'استُنفد حد الاستخدام الإجمالي للحملة (30/30 استبدال)',
    createdAt: new Date(Date.now() - 86400000 * 20).toISOString()
  },
  {
    id: 'rew-rule-5',
    title: 'خصم 15% على السلة عند الشراء بقيمة 60 د.أ (بحد أقصى 10 دنانير)',
    rewardType: 'PERCENTAGE_DISCOUNT',
    giftProductIds: [],
    giftProductsInfo: [],
    outOfStockPolicy: 'AUTO_PAUSE',
    discountValue: 15,
    maxDiscountFils: 10000,
    minSpendFils: 60000,
    spendCalculationBasis: 'ITEMS_BEFORE_DISCOUNT',
    includesShippingInThreshold: false,
    isStackable: false,
    priority: 5,
    stackingBehavior: 'APPLY_HIGHEST_ONLY',
    totalUsageLimit: 100,
    perCustomerLimit: 1,
    currentUsageCount: 0,
    startsAt: new Date(Date.now() - 86400000 * 5).toISOString(),
    endsAt: new Date(Date.now() - 86400000 * 1).toISOString(),
    isActive: false,
    status: 'EXPIRED',
    statusReasonAr: 'انتهت فترة سريان الحملة بتاريخ الأمس',
    createdAt: new Date(Date.now() - 86400000 * 10).toISOString()
  }
];

const INITIAL_REDEMPTIONS: RewardRedemptionRecord[] = [];

// In-Memory store
if (!(globalThis as any).__ghazal_reward_rules) {
  (globalThis as any).__ghazal_reward_rules = INITIAL_REWARD_RULES;
}
(globalThis as any).__ghazal_reward_redemptions = [];

const INITIAL_REWARD_SETTINGS: RewardSystemSettings = {
  multiGiftResolution: 'HIGHEST_TIER_ONLY', // اعتماد هدية الشريحة الأعلى فقط تلقائياً (مثلاً 50د تحل محل 35د)
  freeShippingStacking: 'ALLOW_WITH_GIFTS',   // دمج التوصيل المجاني مع الهدية
  allowDiscountWithGift: true,
  minSpendCalculation: 'ITEMS_ONLY'
};

if (!(globalThis as any).__ghazal_reward_settings) {
  (globalThis as any).__ghazal_reward_settings = { ...INITIAL_REWARD_SETTINGS };
}

const getRulesStore = (): RewardRule[] => (globalThis as any).__ghazal_reward_rules;
const getRedemptionsStore = (): RewardRedemptionRecord[] => (globalThis as any).__ghazal_reward_redemptions;
const getSettingsStore = (): RewardSystemSettings => (globalThis as any).__ghazal_reward_settings;

// Dynamic status resolution
function computeRuleStatus(rule: RewardRule): { status: RuleStatus; reasonAr: string } {
  if (!rule.isActive) {
    return { status: 'MANUALLY_PAUSED', reasonAr: 'متوقفة يدوياً من قبل إدارة المتجر' };
  }
  const now = Date.now();
  if (rule.startsAt && new Date(rule.startsAt).getTime() > now) {
    return { status: 'SCHEDULED', reasonAr: `مجدولة - يبدأ سريانها بتاريخ ${new Date(rule.startsAt).toLocaleDateString('ar-JO')}` };
  }
  if (rule.endsAt && new Date(rule.endsAt).getTime() < now) {
    return { status: 'EXPIRED', reasonAr: `منتهية - انتهت فترة السريان بتاريخ ${new Date(rule.endsAt).toLocaleDateString('ar-JO')}` };
  }
  if (rule.totalUsageLimit && rule.currentUsageCount >= rule.totalUsageLimit) {
    return { status: 'LIMIT_REACHED', reasonAr: `استُنفد حد الاستخدام الإجمالي للحملة (${rule.currentUsageCount}/${rule.totalUsageLimit})` };
  }
  if (rule.rewardType === 'FREE_GIFT') {
    const hasAnyStock = rule.giftProductsInfo.some(p => p.stock > 0);
    if (!hasAnyStock) {
      return { status: 'GIFT_OUT_OF_STOCK', reasonAr: 'متوقفة تلقائياً بسبب نفاد مخزون جميع الهدايا المرتبطة' };
    }
  }
  return { status: 'ACTIVE', reasonAr: 'القاعدة نشطة ومؤهلة للتطبيق فوراً في السلة' };
}

export async function getAllRewardRulesAction(): Promise<RewardRule[]> {
  const rules = getRulesStore();
  return rules.map(rule => {
    const { status, reasonAr } = computeRuleStatus(rule);
    return { ...rule, status, statusReasonAr: reasonAr };
  });
}

export async function createOrUpdateRewardRuleAction(data: {
  id?: string;
  title: string;
  rewardType: RewardType;
  giftMode?: GiftMode;
  giftProductIds?: string[];
  outOfStockPolicy?: OutOfStockPolicy;
  discountValue?: number;
  maxDiscountFils?: number;
  minSpendFils: number;
  spendCalculationBasis: SpendCalculationBasis;
  includesShippingInThreshold: boolean;
  isStackable: boolean;
  priority?: number;
  stackingBehavior?: StackingBehavior;
  totalUsageLimit?: number;
  perCustomerLimit?: number;
  startsAt?: string;
  endsAt?: string;
  isActive?: boolean;
}) {
  await requirePermission('manage:products');

  const rules = getRulesStore();
  const giftProductIds = data.giftProductIds || [];
  const giftProductsInfo = getCatalogGiftProducts(giftProductIds);

  const cleanStartsAt = data.startsAt ? new Date(data.startsAt).toISOString() : new Date().toISOString();
  const cleanEndsAt = data.endsAt ? new Date(data.endsAt).toISOString() : undefined;

  if (data.id) {
    const idx = rules.findIndex(r => r.id === data.id);
    if (idx !== -1) {
      const existing = rules[idx];
      const updated: RewardRule = {
        ...existing,
        title: data.title.trim(),
        rewardType: data.rewardType,
        giftMode: data.rewardType === 'FREE_GIFT' ? (data.giftMode || 'FIXED_PRODUCT') : undefined,
        giftProductIds,
        giftProductsInfo,
        outOfStockPolicy: data.outOfStockPolicy || 'AUTO_PAUSE',
        discountValue: data.discountValue || 0,
        maxDiscountFils: data.maxDiscountFils,
        minSpendFils: data.minSpendFils,
        spendCalculationBasis: data.spendCalculationBasis,
        includesShippingInThreshold: data.includesShippingInThreshold,
        isStackable: data.isStackable,
        priority: data.priority || existing.priority,
        stackingBehavior: data.stackingBehavior || 'APPLY_HIGHEST_ONLY',
        totalUsageLimit: data.totalUsageLimit,
        perCustomerLimit: data.perCustomerLimit || 1,
        startsAt: cleanStartsAt,
        endsAt: cleanEndsAt,
        isActive: data.isActive !== undefined ? data.isActive : existing.isActive,
        status: 'ACTIVE',
        statusReasonAr: ''
      };
      const { status, reasonAr } = computeRuleStatus(updated);
      updated.status = status;
      updated.statusReasonAr = reasonAr;
      rules[idx] = updated;
    }
  } else {
    const newRule: RewardRule = {
      id: `rew-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
      title: data.title.trim(),
      rewardType: data.rewardType,
      giftMode: data.rewardType === 'FREE_GIFT' ? (data.giftMode || 'FIXED_PRODUCT') : undefined,
      giftProductIds,
      giftProductsInfo,
      outOfStockPolicy: data.outOfStockPolicy || 'AUTO_PAUSE',
      discountValue: data.discountValue || 0,
      maxDiscountFils: data.maxDiscountFils,
      minSpendFils: data.minSpendFils,
      spendCalculationBasis: data.spendCalculationBasis,
      includesShippingInThreshold: data.includesShippingInThreshold,
      isStackable: data.isStackable,
      priority: data.priority || (rules.length + 1),
      stackingBehavior: data.stackingBehavior || 'APPLY_HIGHEST_ONLY',
      totalUsageLimit: data.totalUsageLimit,
      perCustomerLimit: data.perCustomerLimit || 1,
      currentUsageCount: 0,
      startsAt: cleanStartsAt,
      endsAt: cleanEndsAt,
      isActive: data.isActive !== undefined ? data.isActive : true,
      status: 'ACTIVE',
      statusReasonAr: '',
      createdAt: new Date().toISOString()
    };
    const { status, reasonAr } = computeRuleStatus(newRule);
    newRule.status = status;
    newRule.statusReasonAr = reasonAr;
    rules.unshift(newRule);
  }

  revalidatePath('/admin/rewards');
  return { success: true, rules: await getAllRewardRulesAction() };
}

export async function toggleRewardRuleStatusAction(ruleId: string) {
  await requirePermission('manage:products');
  const rules = getRulesStore();
  const rule = rules.find(r => r.id === ruleId);
  if (!rule) return { success: false, error: 'قاعدة المكافأة غير موجودة' };

  rule.isActive = !rule.isActive;
  const { status, reasonAr } = computeRuleStatus(rule);
  rule.status = status;
  rule.statusReasonAr = reasonAr;

  revalidatePath('/admin/rewards');
  return { success: true, rule };
}

export async function deleteRewardRuleAction(ruleId: string) {
  await requirePermission('manage:products');
  const rules = getRulesStore();
  const idx = rules.findIndex(r => r.id === ruleId);
  if (idx !== -1) {
    rules.splice(idx, 1);
  }
  revalidatePath('/admin/rewards');
  return { success: true };
}

export async function getRewardsDashboardDataAction(periodFilter: string = 'LAST_30_DAYS') {
  const rules = await getAllRewardRulesAction();
  const redemptions = getRedemptionsStore();

  const now = Date.now();
  let filterStartDate = 0;
  if (periodFilter === 'LAST_7_DAYS') {
    filterStartDate = now - 86400000 * 7;
  } else if (periodFilter === 'LAST_30_DAYS') {
    filterStartDate = now - 86400000 * 30;
  } else if (periodFilter === 'THIS_MONTH') {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    filterStartDate = d.getTime();
  }

  const filteredRedemptions = redemptions.filter(r => {
    if (filterStartDate > 0) {
      return new Date(r.redeemedAt).getTime() >= filterStartDate;
    }
    return true;
  });

  // Calculate metrics
  const activeRedemptions = filteredRedemptions.filter(r => !r.isReversed && r.orderStatus !== 'CANCELLED' && r.orderStatus !== 'REFUNDED');
  
  const totalRewardSalesFils = activeRedemptions.reduce((sum, r) => sum + r.basketTotalFils, 0);
  const totalDiscountCostFils = activeRedemptions.reduce((sum, r) => sum + r.discountCostFils, 0);
  const totalGiftCostFils = activeRedemptions.reduce((sum, r) => sum + r.estimatedGiftCostFils, 0);
  const totalFreeShippingCostFils = activeRedemptions.filter(r => r.rewardType === 'FREE_SHIPPING').reduce((sum, r) => sum + r.discountCostFils, 0);
  
  // Unique customers
  const uniquePhones = new Set(activeRedemptions.map(r => r.customerPhone));
  const uniqueBeneficiariesCount = uniquePhones.size;

  // Repeat orders count
  const customerCounts: Record<string, number> = {};
  for (const r of activeRedemptions) {
    customerCounts[r.customerPhone] = (customerCounts[r.customerPhone] || 0) + 1;
  }
  const repeatCustomersCount = Object.values(customerCounts).filter(c => c > 1).length;
  const repeatRatePct = uniqueBeneficiariesCount > 0 ? Math.round((repeatCustomersCount / uniqueBeneficiariesCount) * 100) : 0;

  // AOV with reward
  const avgBasketWithRewardFils = activeRedemptions.length > 0 ? Math.round(totalRewardSalesFils / activeRedemptions.length) : 0;

  // Net Profitability Estimation (assuming standard ~45% gross margin on cosmetic basket minus costs)
  const estimatedGrossProfitFils = Math.round(totalRewardSalesFils * 0.45);
  const totalRewardsCostFils = totalDiscountCostFils + totalGiftCostFils;
  const netRewardProfitFils = Math.max(0, estimatedGrossProfitFils - totalRewardsCostFils);

  return {
    periodFilter,
    rules,
    redemptions: filteredRedemptions,
    settings: await getRewardSystemSettingsAction(),
    kpis: {
      totalRewardSalesFils,
      totalDiscountCostFils,
      totalGiftCostFils,
      totalFreeShippingCostFils,
      totalRewardsCostFils,
      uniqueBeneficiariesCount,
      repeatCustomersCount,
      repeatRatePct,
      avgBasketWithRewardFils,
      netRewardProfitFils,
      activeRulesCount: rules.filter(r => r.status === 'ACTIVE').length,
      totalRedemptionsCount: activeRedemptions.length
    }
  };
}

export async function getRewardSystemSettingsAction(): Promise<RewardSystemSettings> {
  const store = getSettingsStore();
  return { ...store };
}

export async function updateRewardSystemSettingsAction(
  updates: Partial<RewardSystemSettings>
): Promise<{ success: boolean; settings: RewardSystemSettings }> {
  await requirePermission('manage:products');
  const store = getSettingsStore();
  const updated: RewardSystemSettings = {
    ...store,
    ...updates
  };
  (globalThis as any).__ghazal_reward_settings = updated;
  revalidatePath('/admin/rewards');
  revalidatePath('/ar/checkout');
  revalidatePath('/en/checkout');
  return { success: true, settings: updated };
}

export async function evaluateCartRewardsAction(params: {
  subtotalFils: number;
  shippingFeeFils: number;
  selectedGiftId?: string;
}): Promise<RewardEvaluationResult> {
  const { subtotalFils, shippingFeeFils, selectedGiftId } = params;
  const settings = await getRewardSystemSettingsAction();
  const allRules = await getAllRewardRulesAction();

  // Filter only ACTIVE rules
  const activeRules = allRules.filter(r => r.status === 'ACTIVE' && r.isActive);

  // Determine qualified rules
  const qualifiedRules: RewardRule[] = [];
  for (const rule of activeRules) {
    const thresholdSpend = rule.includesShippingInThreshold || settings.minSpendCalculation === 'ITEMS_AND_SHIPPING'
      ? subtotalFils + shippingFeeFils
      : subtotalFils;

    if (thresholdSpend >= rule.minSpendFils) {
      qualifiedRules.push(rule);
    }
  }

  const notificationMessages: string[] = [];
  let upgradedGiftNote: string | null = null;
  let appliedGift: GiftProductInfo | null = null;
  const allQualifiedGifts: GiftProductInfo[] = [];
  const appliedGiftsList: GiftProductInfo[] = [];
  let freeShippingApplied = false;
  let freeShippingSavingsFils = 0;
  let discountAmountFils = 0;
  let appliedDiscountRule: RewardRule | null = null;

  // 1. Evaluate FREE_GIFT rules
  const qualifiedGiftRules = qualifiedRules.filter(r => r.rewardType === 'FREE_GIFT');
  if (qualifiedGiftRules.length > 0) {
    // Collect all gifts from all qualified gift rules
    for (const rule of qualifiedGiftRules) {
      for (const g of rule.giftProductsInfo) {
        if (!allQualifiedGifts.some(existing => existing.id === g.id || existing.sku === g.sku)) {
          allQualifiedGifts.push(g);
        }
      }
    }

    if (settings.multiGiftResolution === 'HIGHEST_TIER_ONLY') {
      // Sort by minSpendFils descending (highest threshold first, e.g. 50 JOD tier beats 35 JOD tier)
      qualifiedGiftRules.sort((a, b) => b.minSpendFils - a.minSpendFils);
      const topRule = qualifiedGiftRules[0];

      if (qualifiedGiftRules.length > 1) {
        upgradedGiftNote = `تم ترقية هديتكِ تلقائياً إلى شريحة (${(topRule.minSpendFils / 1000).toFixed(0)} د.أ) كأعلى شريحة مؤهلة في سلتكِ! 🎁`;
        notificationMessages.push(upgradedGiftNote);
      }

      // Check gift selection from the top rule
      const topGifts = topRule.giftProductsInfo.filter(g => g.stock > 0);
      if (topGifts.length > 0) {
        if (selectedGiftId) {
          const chosen = topGifts.find(g => g.id === selectedGiftId || g.sku === selectedGiftId);
          appliedGift = chosen || topGifts[0];
        } else {
          appliedGift = topGifts[0];
        }
        appliedGiftsList.push(appliedGift);
      }
    } else if (settings.multiGiftResolution === 'STACK_ALL_GIFTS') {
      // Add a gift from every qualified rule
      for (const rule of qualifiedGiftRules) {
        const available = rule.giftProductsInfo.find(g => g.stock > 0);
        if (available) {
          appliedGiftsList.push(available);
        }
      }
      appliedGift = appliedGiftsList[0] || null;
      notificationMessages.push(`مؤهلة لـ ${appliedGiftsList.length} هدايا مجانية ترحيبية مع طلبكِ!`);
    } else {
      // CUSTOMER_CHOICE
      if (selectedGiftId) {
        const chosen = allQualifiedGifts.find(g => g.id === selectedGiftId || g.sku === selectedGiftId);
        appliedGift = chosen || allQualifiedGifts[0];
      } else {
        appliedGift = allQualifiedGifts[0] || null;
      }
      if (appliedGift) appliedGiftsList.push(appliedGift);
    }
  }

  // 2. Evaluate FREE_SHIPPING rules
  const qualifiedShippingRules = qualifiedRules.filter(r => r.rewardType === 'FREE_SHIPPING');
  if (qualifiedShippingRules.length > 0) {
    if (settings.freeShippingStacking === 'ALLOW_WITH_GIFTS' || qualifiedGiftRules.length === 0) {
      freeShippingApplied = true;
      freeShippingSavingsFils = shippingFeeFils;
      notificationMessages.push('✓ مؤهلة لخصم التوصيل المجاني لكافة محافظات المملكة!');
    } else {
      // STANDALONE_ONLY: Compare value between free shipping and gift product
      const giftValue = appliedGift ? appliedGift.price : 0;
      if (shippingFeeFils >= giftValue) {
        freeShippingApplied = true;
        freeShippingSavingsFils = shippingFeeFils;
        appliedGift = null;
        appliedGiftsList.length = 0;
        notificationMessages.push('تم تطبيق عرض التوصيل المجاني كأعلى فائدة لطلبكِ');
      }
    }
  }

  // 3. Evaluate DISCOUNT rules
  const qualifiedDiscountRules = qualifiedRules.filter(r => r.rewardType === 'FIXED_DISCOUNT' || r.rewardType === 'PERCENTAGE_DISCOUNT');
  if (qualifiedDiscountRules.length > 0) {
    if (settings.allowDiscountWithGift || appliedGift === null) {
      // Sort discounts by calculated discount value descending
      const evaluatedDiscounts = qualifiedDiscountRules.map(rule => {
        let val = 0;
        if (rule.rewardType === 'FIXED_DISCOUNT') {
          val = rule.discountValue;
        } else {
          val = Math.round(subtotalFils * (rule.discountValue / 100));
          if (rule.maxDiscountFils) val = Math.min(val, rule.maxDiscountFils);
        }
        return { rule, val };
      }).sort((a, b) => b.val - a.val);

      if (evaluatedDiscounts.length > 0 && evaluatedDiscounts[0].val > 0) {
        appliedDiscountRule = evaluatedDiscounts[0].rule;
        discountAmountFils = evaluatedDiscounts[0].val;
        notificationMessages.push(`تم تطبيق خصم مكافأة بقيمة ${(discountAmountFils / 1000).toFixed(3)} د.أ`);
      }
    }
  }

  const finalShippingFeeFils = freeShippingApplied ? 0 : shippingFeeFils;
  const finalTotalFils = Math.max(0, subtotalFils - discountAmountFils) + finalShippingFeeFils;

  return {
    qualifiedRules,
    appliedGift,
    allQualifiedGifts,
    appliedGiftsList,
    freeShippingApplied,
    freeShippingSavingsFils,
    discountAmountFils,
    appliedDiscountRule,
    finalShippingFeeFils,
    finalTotalFils,
    upgradedGiftNote,
    notificationMessages,
    settings
  };
}

export async function recordRewardRedemptionForOrderAction(params: {
  orderId: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  basketTotalFils: number;
  appliedGift?: GiftProductInfo | null;
  freeShippingApplied?: boolean;
  freeShippingFeeFils?: number;
  discountAmountFils?: number;
}): Promise<{ success: boolean }> {
  try {
    const redemptions = getRedemptionsStore();
    const rules = getRulesStore();
    const { orderId, orderNumber, customerName, customerPhone, basketTotalFils, appliedGift, freeShippingApplied, freeShippingFeeFils, discountAmountFils } = params;

    // 1. Record Gift Redemption if gift applied
    if (appliedGift) {
      const giftRule = rules.find(r => r.rewardType === 'FREE_GIFT' && r.giftProductIds.includes(appliedGift.id)) ||
                       rules.find(r => r.rewardType === 'FREE_GIFT' && r.status === 'ACTIVE');
      
      const newRdm: RewardRedemptionRecord = {
        id: `rdm-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
        orderId: orderId || `ord-${Date.now()}`,
        orderNumber: orderNumber || `${Date.now()}`.slice(-4),
        customerName: customerName || 'عميلة المتجر',
        customerPhone: customerPhone || '',
        ruleId: giftRule?.id || 'gift-rule',
        ruleTitle: giftRule?.title || 'هدية مجانية مع الطلب',
        rewardType: 'FREE_GIFT',
        rewardDetailAr: `هدية مجانية: ${appliedGift.nameAr}`,
        discountCostFils: 0,
        estimatedGiftCostFils: appliedGift.costPrice || Math.round(appliedGift.price * 0.55),
        basketTotalFils,
        orderStatus: 'DELIVERED',
        redeemedAt: new Date().toISOString(),
        isReversed: false
      };
      redemptions.unshift(newRdm);
      if (giftRule) {
        giftRule.currentUsageCount = (giftRule.currentUsageCount || 0) + 1;
      }
    }

    // 2. Record Free Shipping Redemption if applied
    if (freeShippingApplied) {
      const shippingRule = rules.find(r => r.rewardType === 'FREE_SHIPPING' && r.status === 'ACTIVE') ||
                           rules.find(r => r.rewardType === 'FREE_SHIPPING');
      const newRdm: RewardRedemptionRecord = {
        id: `rdm-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
        orderId: orderId || `ord-${Date.now()}`,
        orderNumber: orderNumber || `${Date.now()}`.slice(-4),
        customerName: customerName || 'عميلة المتجر',
        customerPhone: customerPhone || '',
        ruleId: shippingRule?.id || 'shipping-rule',
        ruleTitle: shippingRule?.title || 'توصيل مجاني للطلب',
        rewardType: 'FREE_SHIPPING',
        rewardDetailAr: 'إعفاء كامل من رسوم التوصيل',
        discountCostFils: freeShippingFeeFils || 2000,
        estimatedGiftCostFils: 0,
        basketTotalFils,
        orderStatus: 'DELIVERED',
        redeemedAt: new Date().toISOString(),
        isReversed: false
      };
      redemptions.unshift(newRdm);
      if (shippingRule) {
        shippingRule.currentUsageCount = (shippingRule.currentUsageCount || 0) + 1;
      }
    }

    // 3. Record Discount Redemption if applied
    if (discountAmountFils && discountAmountFils > 0) {
      const discountRule = rules.find(r => (r.rewardType === 'FIXED_DISCOUNT' || r.rewardType === 'PERCENTAGE_DISCOUNT') && r.status === 'ACTIVE');
      const newRdm: RewardRedemptionRecord = {
        id: `rdm-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
        orderId: orderId || `ord-${Date.now()}`,
        orderNumber: orderNumber || `${Date.now()}`.slice(-4),
        customerName: customerName || 'عميلة المتجر',
        customerPhone: customerPhone || '',
        ruleId: discountRule?.id || 'discount-rule',
        ruleTitle: discountRule?.title || 'خصم نقدي على السلة',
        rewardType: discountRule?.rewardType || 'FIXED_DISCOUNT',
        rewardDetailAr: `خصم مكافأة بقيمة ${(discountAmountFils / 1000).toFixed(3)} د.أ`,
        discountCostFils: discountAmountFils,
        estimatedGiftCostFils: 0,
        basketTotalFils,
        orderStatus: 'DELIVERED',
        redeemedAt: new Date().toISOString(),
        isReversed: false
      };
      redemptions.unshift(newRdm);
      if (discountRule) {
        discountRule.currentUsageCount = (discountRule.currentUsageCount || 0) + 1;
      }
    }

    revalidatePath('/admin/rewards');
    return { success: true };
  } catch (err) {
    console.error('recordRewardRedemptionForOrderAction error:', err);
    return { success: false };
  }
}

export async function reverseRedemptionForOrderAction(orderId: string, reason: string) {
  await requirePermission('manage:orders');
  const redemptions = getRedemptionsStore();
  const item = redemptions.find(r => r.orderId === orderId || r.orderNumber === orderId);
  if (!item) return { success: false, error: 'سجل الاستبدال غير موجود' };

  item.isReversed = true;
  item.reversalReason = reason || 'تم إلغاء الطلبية وعكس أثر المكافأة والتكلفة';
  item.orderStatus = 'CANCELLED';

  // Reduce rule usage count
  const rules = getRulesStore();
  const rule = rules.find(r => r.id === item.ruleId);
  if (rule && rule.currentUsageCount > 0) {
    rule.currentUsageCount -= 1;
    const { status, reasonAr } = computeRuleStatus(rule);
    rule.status = status;
    rule.statusReasonAr = reasonAr;
  }

  revalidatePath('/admin/rewards');
  return { success: true };
}
