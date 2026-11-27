'use server';

import { prisma } from '@/lib/db';
import { requireAuth, requirePermission } from '@/lib/dal';
import { revalidatePath } from 'next/cache';

export type RewardType = 'FREE_GIFT' | 'FREE_SHIPPING' | 'FIXED_DISCOUNT' | 'PERCENTAGE_DISCOUNT';
export type RewardScope = 'ALL_PRODUCTS' | 'SPECIFIC_PRODUCTS';
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
  barcode?: string;
  imageUrl?: string;
  price: number; // in fils
  costPrice?: number; // in fils
  stock: number;
}

export type RewardProductInfo = GiftProductInfo;

export interface RewardRule {
  id: string;
  title: string;
  rewardType: RewardType;
  channel?: 'ONLINE' | 'POS' | 'BOTH';

  // Target products scope for discounts
  targetScope?: RewardScope;
  targetProductIds?: string[];
  targetProductsInfo?: RewardProductInfo[];
  
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

// Fetch products info directly from PostgreSQL database
async function getCatalogProductsInfo(ids: string[]): Promise<RewardProductInfo[]> {
  if (!ids || ids.length === 0) return [];
  try {
    const products = await prisma.product.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        nameAr: true,
        sku: true,
        images: { select: { url: true }, orderBy: { isMain: 'desc' }, take: 1 },
        variants: { select: { price: true, costPrice: true, barcode: true } }
      }
    });
    return products.map((prod: any) => {
      const variantBarcodes = (prod.variants || [])
        .map((v: any) => v.barcode)
        .filter((b: any): b is string => Boolean(b && typeof b === 'string' && b.trim().length > 0));
      const primaryBarcode = variantBarcodes[0] || '';
      const minPrice = prod.variants?.length ? Math.min(...prod.variants.map((v: any) => v.price)) : 0;
      const costPrice = prod.variants?.[0]?.costPrice || Math.round(minPrice * 0.55);

      return {
        id: prod.id,
        nameAr: prod.nameAr,
        sku: prod.sku || '',
        barcode: primaryBarcode,
        imageUrl: prod.images?.[0]?.url || '/product-placeholder.png',
        price: minPrice,
        costPrice,
        stock: 99
      };
    });
  } catch (err) {
    console.warn('Error fetching products info from DB:', err);
    return [];
  }
}

const getCatalogGiftProducts = getCatalogProductsInfo;

// Synchronize targeted product discount rules with ghazal_promotions (so they appear in POS Cashier and Storefront)
async function syncRewardPromotions(rules: RewardRule[]): Promise<void> {
  try {
    let currentPromotions: any[] = [];
    const setting = await prisma.siteSettings.findUnique({
      where: { key: 'ghazal_promotions' }
    });
    if (setting?.value) {
      try {
        const parsed = JSON.parse(setting.value);
        if (Array.isArray(parsed)) currentPromotions = parsed;
      } catch {}
    }

    // Remove old promotions synced from rewards
    currentPromotions = currentPromotions.filter(p => !p.id.startsWith('rew-promo-'));

    // Add active targeted promotions
    for (const rule of rules) {
      if (
        (rule.rewardType === 'FIXED_DISCOUNT' || rule.rewardType === 'PERCENTAGE_DISCOUNT') &&
        rule.targetScope === 'SPECIFIC_PRODUCTS' &&
        rule.targetProductIds &&
        rule.targetProductIds.length > 0 &&
        rule.isActive &&
        rule.status === 'ACTIVE'
      ) {
        const promoChannel: 'STOREFRONT' | 'POS' | 'BOTH' = 
          rule.channel === 'ONLINE' ? 'STOREFRONT' : 
          rule.channel === 'POS' ? 'POS' : 'BOTH';
        const discountType: 'FIXED' | 'PERCENTAGE' = rule.rewardType === 'FIXED_DISCOUNT' ? 'FIXED' : 'PERCENTAGE';

        for (const prodId of rule.targetProductIds) {
          const prodInfo = rule.targetProductsInfo?.find(p => p.id === prodId);
          currentPromotions.push({
            id: `rew-promo-${rule.id}-${prodId}`,
            code: `REW-${rule.id.slice(-4)}-${prodId.slice(-4)}`,
            title: rule.title,
            targetProductId: prodId,
            targetProductName: prodInfo?.nameAr || '',
            channel: promoChannel,
            discountType,
            discountValue: rule.discountValue,
            calculatedPercentage: rule.rewardType === 'PERCENTAGE_DISCOUNT' ? rule.discountValue : undefined,
            maxDiscountFils: rule.maxDiscountFils,
            minOrderTotalFils: rule.minSpendFils,
            startsAt: rule.startsAt,
            endsAt: rule.endsAt || new Date(Date.now() + 86400000 * 365).toISOString(),
            usageCount: rule.currentUsageCount,
            usageLimit: rule.totalUsageLimit,
            isActive: true,
            createdAt: rule.createdAt || new Date().toISOString()
          });
        }
      }
    }

    await prisma.siteSettings.upsert({
      where: { key: 'ghazal_promotions' },
      update: { value: JSON.stringify(currentPromotions) },
      create: { key: 'ghazal_promotions', value: JSON.stringify(currentPromotions) }
    });

    (globalThis as any).__ghazal_resilient_promotions = currentPromotions;
  } catch (err) {
    console.warn('Failed to sync reward promotions with ghazal_promotions:', err);
  }
}

const INITIAL_REWARD_RULES: RewardRule[] = [];
const INITIAL_REDEMPTIONS: RewardRedemptionRecord[] = [];

const INITIAL_REWARD_SETTINGS: RewardSystemSettings = {
  multiGiftResolution: 'HIGHEST_TIER_ONLY',
  freeShippingStacking: 'ALLOW_WITH_GIFTS',
  allowDiscountWithGift: true,
  minSpendCalculation: 'ITEMS_ONLY'
};

// Database persistence helpers via SiteSettings
async function getRulesStore(): Promise<RewardRule[]> {
  try {
    const record = await prisma.siteSettings.findUnique({
      where: { key: 'ghazal_reward_rules' }
    });
    if (record?.value) {
      const parsed = JSON.parse(record.value);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    console.warn('Failed to load ghazal_reward_rules from DB:', err);
  }
  return [];
}

async function saveRulesStore(rules: RewardRule[]): Promise<void> {
  try {
    await prisma.siteSettings.upsert({
      where: { key: 'ghazal_reward_rules' },
      update: { value: JSON.stringify(rules) },
      create: { key: 'ghazal_reward_rules', value: JSON.stringify(rules) }
    });
  } catch (err) {
    console.warn('Failed to save ghazal_reward_rules to DB:', err);
  }
  (globalThis as any).__ghazal_reward_rules = rules;
}

async function getRedemptionsStore(): Promise<RewardRedemptionRecord[]> {
  try {
    const record = await prisma.siteSettings.findUnique({
      where: { key: 'ghazal_reward_redemptions' }
    });
    if (record?.value) {
      const parsed = JSON.parse(record.value);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    console.warn('Failed to load ghazal_reward_redemptions from DB:', err);
  }
  return [];
}

async function saveRedemptionsStore(redemptions: RewardRedemptionRecord[]): Promise<void> {
  try {
    await prisma.siteSettings.upsert({
      where: { key: 'ghazal_reward_redemptions' },
      update: { value: JSON.stringify(redemptions) },
      create: { key: 'ghazal_reward_redemptions', value: JSON.stringify(redemptions) }
    });
  } catch (err) {
    console.warn('Failed to save ghazal_reward_redemptions to DB:', err);
  }
  (globalThis as any).__ghazal_reward_redemptions = redemptions;
}

async function getSettingsStore(): Promise<RewardSystemSettings> {
  try {
    const record = await prisma.siteSettings.findUnique({
      where: { key: 'ghazal_reward_settings' }
    });
    if (record?.value) {
      const parsed = JSON.parse(record.value);
      return { ...INITIAL_REWARD_SETTINGS, ...parsed };
    }
  } catch (err) {
    console.warn('Failed to load ghazal_reward_settings from DB:', err);
  }
  return INITIAL_REWARD_SETTINGS;
}

async function saveSettingsStore(settings: RewardSystemSettings): Promise<void> {
  try {
    await prisma.siteSettings.upsert({
      where: { key: 'ghazal_reward_settings' },
      update: { value: JSON.stringify(settings) },
      create: { key: 'ghazal_reward_settings', value: JSON.stringify(settings) }
    });
  } catch (err) {
    console.warn('Failed to save ghazal_reward_settings to DB:', err);
  }
  (globalThis as any).__ghazal_reward_settings = settings;
}

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
  // For FREE_GIFT rules: inventory is not tracked for promotional gifts, so gift rules are never paused due to zero stock
  return { status: 'ACTIVE', reasonAr: 'القاعدة نشطة ومؤهلة للتطبيق فوراً في السلة' };
}

export async function getAllRewardRulesAction(): Promise<RewardRule[]> {
  const rules = await getRulesStore();
  return rules.map(rule => {
    const { status, reasonAr } = computeRuleStatus(rule);
    return { ...rule, status, statusReasonAr: reasonAr };
  });
}

export async function createOrUpdateRewardRuleAction(data: {
  id?: string;
  title: string;
  rewardType: RewardType;
  channel?: 'ONLINE' | 'POS' | 'BOTH';
  targetScope?: RewardScope;
  targetProductIds?: string[];
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

  const rules = await getRulesStore();
  const giftProductIds = data.giftProductIds || [];
  const giftProductsInfo = await getCatalogGiftProducts(giftProductIds);

  const targetScope = data.targetScope || 'ALL_PRODUCTS';
  const targetProductIds = data.targetProductIds || [];
  const targetProductsInfo = targetScope === 'SPECIFIC_PRODUCTS' ? await getCatalogProductsInfo(targetProductIds) : [];

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
        channel: data.channel || existing.channel || 'ONLINE',
        targetScope,
        targetProductIds,
        targetProductsInfo,
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
      channel: data.channel || 'ONLINE',
      targetScope,
      targetProductIds,
      targetProductsInfo,
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

  await saveRulesStore(rules);
  await syncRewardPromotions(rules);
  revalidatePath('/admin/rewards');
  revalidatePath('/admin/promotions');
  revalidatePath('/pos/cashier');
  revalidatePath('/[locale]/shop', 'page');
  return { success: true, rules: await getAllRewardRulesAction() };
}

export async function toggleRewardRuleStatusAction(ruleId: string) {
  await requirePermission('manage:products');
  const rules = await getRulesStore();
  const rule = rules.find(r => r.id === ruleId);
  if (!rule) return { success: false, error: 'قاعدة المكافأة غير موجودة' };

  rule.isActive = !rule.isActive;
  const { status, reasonAr } = computeRuleStatus(rule);
  rule.status = status;
  rule.statusReasonAr = reasonAr;

  await saveRulesStore(rules);
  await syncRewardPromotions(rules);
  revalidatePath('/admin/rewards');
  revalidatePath('/admin/promotions');
  revalidatePath('/pos/cashier');
  return { success: true, rule };
}

export async function deleteRewardRuleAction(ruleId: string) {
  await requirePermission('manage:products');
  const rules = await getRulesStore();
  const idx = rules.findIndex(r => r.id === ruleId);
  if (idx !== -1) {
    rules.splice(idx, 1);
    await saveRulesStore(rules);
    await syncRewardPromotions(rules);
  }
  revalidatePath('/admin/rewards');
  revalidatePath('/admin/promotions');
  revalidatePath('/pos/cashier');
  return { success: true };
}

export async function getRewardsDashboardDataAction(periodFilter: string = 'LAST_30_DAYS') {
  const rules = await getAllRewardRulesAction();
  const redemptions = await getRedemptionsStore();

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
  const store = await getSettingsStore();
  return { ...store };
}

export async function updateRewardSystemSettingsAction(
  updates: Partial<RewardSystemSettings>
): Promise<{ success: boolean; settings: RewardSystemSettings }> {
  await requirePermission('manage:products');
  const store = await getSettingsStore();
  const updated: RewardSystemSettings = {
    ...store,
    ...updates
  };
  await saveSettingsStore(updated);
  revalidatePath('/admin/rewards');
  revalidatePath('/ar/checkout');
  revalidatePath('/en/checkout');
  return { success: true, settings: updated };
}

export async function evaluateCartRewardsAction(params: {
  subtotalFils: number;
  shippingFeeFils: number;
  selectedGiftId?: string;
  channel?: 'ONLINE' | 'POS';
  items?: Array<{ productId?: string; priceFils?: number; price?: number; quantity?: number }>;
}): Promise<RewardEvaluationResult> {
  const { subtotalFils, shippingFeeFils, selectedGiftId, channel = 'ONLINE', items = [] } = params;
  const settings = await getRewardSystemSettingsAction();
  const allRules = await getAllRewardRulesAction();

  // Filter only ACTIVE rules matching target channel (ONLINE vs POS vs BOTH)
  const activeRules = allRules.filter(r => {
    if (r.status !== 'ACTIVE' || !r.isActive) return false;
    if (r.channel && r.channel !== 'BOTH' && r.channel !== channel) return false;
    return true;
  });

  // Determine qualified rules based directly on product items value (subtotalFils)
  const qualifiedRules: RewardRule[] = [];
  for (const rule of activeRules) {
    const thresholdSpend = subtotalFils;

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

      // Check gift selection from the top rule (inventory not tracked for gifts, never blocked by zero stock)
      const topGifts = topRule.giftProductsInfo;
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
        const available = rule.giftProductsInfo[0];
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
    const shippingRule = qualifiedShippingRules[0];
    const canStackWithGift = shippingRule.isStackable || settings.freeShippingStacking === 'ALLOW_WITH_GIFTS' || qualifiedGiftRules.length === 0;

    if (canStackWithGift) {
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
    // Sort discounts by calculated discount value descending
    const evaluatedDiscounts = qualifiedDiscountRules.map(rule => {
      let val = 0;
      let eligibleSpendFils = subtotalFils;

      // If this rule targets specific products, calculate only on matching items in the cart
      if (rule.targetScope === 'SPECIFIC_PRODUCTS' && rule.targetProductIds && rule.targetProductIds.length > 0) {
        if (items && items.length > 0) {
          const matchingItems = items.filter(item => 
            item.productId && rule.targetProductIds!.includes(item.productId)
          );
          eligibleSpendFils = matchingItems.reduce((sum, item) => {
            const p = item.priceFils !== undefined ? item.priceFils : (item.price || 0);
            return sum + (p * (item.quantity || 1));
          }, 0);
        }
      }

      if (eligibleSpendFils > 0) {
        if (rule.rewardType === 'FIXED_DISCOUNT') {
          val = Math.min(eligibleSpendFils, rule.discountValue);
        } else {
          val = Math.round(eligibleSpendFils * (rule.discountValue / 100));
          if (rule.maxDiscountFils) val = Math.min(val, rule.maxDiscountFils);
        }
      }
      return { rule, val };
    }).sort((a, b) => b.val - a.val);

    const topDiscount = evaluatedDiscounts[0];
    if (topDiscount && topDiscount.val > 0) {
      const canStackDiscountWithGift = topDiscount.rule.isStackable || settings.allowDiscountWithGift || appliedGift === null;
      if (canStackDiscountWithGift) {
        appliedDiscountRule = topDiscount.rule;
        discountAmountFils = topDiscount.val;
        notificationMessages.push(`تم تطبيق خصم مكافأة بقيمة ${(discountAmountFils / 1000).toFixed(3)} د.أ`);
      } else {
        // Compare discount value vs gift value
        const giftValue = appliedGift ? appliedGift.price : 0;
        if (topDiscount.val > giftValue) {
          appliedDiscountRule = topDiscount.rule;
          discountAmountFils = topDiscount.val;
          appliedGift = null;
          appliedGiftsList.length = 0;
          notificationMessages.push(`تم تطبيق خصم مكافأة بقيمة ${(discountAmountFils / 1000).toFixed(3)} د.أ`);
        }
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
    const redemptions = await getRedemptionsStore();
    const rules = await getRulesStore();
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

    await saveRulesStore(rules);
    await saveRedemptionsStore(redemptions);
    revalidatePath('/admin/rewards');
    return { success: true };
  } catch (err) {
    console.error('recordRewardRedemptionForOrderAction error:', err);
    return { success: false };
  }
}

export async function reverseRedemptionForOrderAction(orderId: string, reason: string) {
  await requirePermission('manage:orders');
  const redemptions = await getRedemptionsStore();
  const item = redemptions.find(r => r.orderId === orderId || r.orderNumber === orderId);
  if (!item) return { success: false, error: 'سجل الاستبدال غير موجود' };

  item.isReversed = true;
  item.reversalReason = reason || 'تم إلغاء الطلبية وعكس أثر المكافأة والتكلفة';
  item.orderStatus = 'CANCELLED';

  // Reduce rule usage count
  const rules = await getRulesStore();
  const rule = rules.find(r => r.id === item.ruleId);
  if (rule && rule.currentUsageCount > 0) {
    rule.currentUsageCount -= 1;
    const { status, reasonAr } = computeRuleStatus(rule);
    rule.status = status;
    rule.statusReasonAr = reasonAr;
  }

  await saveRulesStore(rules);
  await saveRedemptionsStore(redemptions);
  revalidatePath('/admin/rewards');
  return { success: true };
}
