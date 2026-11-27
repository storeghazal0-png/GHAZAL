export interface PromotionRecord {
  id: string;
  code: string;
  title: string;
  targetProductId?: string; // Product ID or slug (تحديد صنف معين)
  targetProductName?: string;
  channel: 'STOREFRONT' | 'POS' | 'BOTH';
  discountType: 'PERCENTAGE' | 'FIXED';
  discountValue: number; // e.g. 15 for 15% or 2000 for 2.000 JOD
  calculatedPercentage?: number;
  maxDiscountFils?: number;
  minOrderTotalFils?: number;
  startsAt: string;
  endsAt: string;
  usageCount: number;
  usageLimit?: number;
  isActive: boolean;
  createdAt: string;
}

/**
 * Returns all resilient promotions stored in the global registry.
 * Managed exclusively via /admin/promotions
 */
export function getStoredPromotions(): PromotionRecord[] {
  if (typeof globalThis !== 'undefined' && (globalThis as any).__ghazal_resilient_promotions) {
    return (globalThis as any).__ghazal_resilient_promotions as PromotionRecord[];
  }
  return [];
}

/**
 * Returns active promotions for a specific channel ('STOREFRONT' | 'POS').
 */
export function getActivePromotions(channel: 'STOREFRONT' | 'POS' = 'STOREFRONT'): PromotionRecord[] {
  const promos = getStoredPromotions();
  const now = new Date();

  return promos.filter(p => {
    if (!p.isActive) return false;
    if (p.channel !== 'BOTH' && p.channel !== channel) return false;
    if (p.startsAt && new Date(p.startsAt) > now) return false;
    if (p.endsAt && new Date(p.endsAt) < now) return false;
    return true;
  });
}

/**
 * Finds an active promotion for a given product (by id or slug).
 * ONLY returns a promotion if explicitly targeted in /admin/promotions.
 */
export function findActivePromotionForProduct(
  productId?: string,
  productSlug?: string,
  channel: 'STOREFRONT' | 'POS' = 'STOREFRONT',
  activePromos?: PromotionRecord[]
): PromotionRecord | null {
  const promos = activePromos || getActivePromotions(channel);
  if (!promos || promos.length === 0) return null;

  const pid = (productId || '').trim().toLowerCase();
  const pslug = (productSlug || '').trim().toLowerCase();

  return promos.find(p => {
    if (!p.targetProductId) return false;
    const targets = p.targetProductId.split(',').map(s => s.trim().toLowerCase());
    return (pid && targets.includes(pid)) || (pslug && targets.includes(pslug));
  }) || null;
}

/**
 * Computes promotional pricing for a product.
 * CRITICAL RULE: If no active promotion exists for this product in /admin/promotions,
 * hasOffer is FALSE and NO discount or original price is returned.
 */
export function computeProductPromotionPricing<T extends {
  id: string;
  slug?: string;
  priceFils?: number;
  variants?: any[];
}>(
  product: T,
  channel: 'STOREFRONT' | 'POS' = 'STOREFRONT',
  activePromos?: PromotionRecord[]
): T & {
  hasOffer: boolean;
  effectivePriceFils: number;
  originalPriceFils?: number;
  compareAtPriceFils?: number;
  discountPercent?: number;
  promotion: PromotionRecord | null;
} {
  const basePrice = product.priceFils 
    ? product.priceFils 
    : (product.variants?.length ? Math.min(...product.variants.map((v: any) => v.price)) : 10000);

  const promo = findActivePromotionForProduct(product.id, product.slug, channel, activePromos);

  // If no active promotion applied from /admin/promotions, return regular price without discount
  if (!promo) {
    return {
      ...product,
      hasOffer: false,
      effectivePriceFils: basePrice,
      priceFils: basePrice,
      originalPriceFils: undefined,
      compareAtPriceFils: undefined,
      discountPercent: undefined,
      promotion: null,
    };
  }

  // Calculate discount based on active promotion from /admin/promotions
  let discountedPrice = basePrice;
  let discountPercent = 0;

  if (promo.discountType === 'PERCENTAGE') {
    discountPercent = Math.min(99, Math.max(1, Math.round(promo.discountValue)));
    const discountAmount = Math.round(basePrice * (discountPercent / 100));
    discountedPrice = Math.max(500, basePrice - discountAmount);
  } else {
    // FIXED discount in fils
    const fixedDiscountFils = promo.discountValue > 100 ? promo.discountValue : Math.round(promo.discountValue * 1000);
    discountedPrice = Math.max(500, basePrice - fixedDiscountFils);
    discountPercent = Math.min(99, Math.max(1, Math.round(((basePrice - discountedPrice) / basePrice) * 100)));
  }

  return {
    ...product,
    hasOffer: true,
    effectivePriceFils: discountedPrice,
    priceFils: discountedPrice,
    originalPriceFils: basePrice, // Price before discount
    compareAtPriceFils: basePrice,
    discountPercent,
    promotion: promo,
  };
}
