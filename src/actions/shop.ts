'use server';

import { prisma } from '@/lib/db';
import { COSMETICS_CATALOG } from '@/lib/cosmetics-catalog';
import { getActivePromotions, computeProductPromotionPricing, findActivePromotionForProduct } from '@/lib/promotions';

export async function getPaginatedProducts({
  skip = 0,
  take = 40,
  categoryId = '',
  genderId = '',
  familyId = '',
  q = '',
  filter = '',
  orderBy = 'createdAt_desc'
}: {
  skip?: number;
  take?: number;
  categoryId?: string;
  genderId?: string;
  familyId?: string;
  q?: string;
  filter?: string;
  orderBy?: string;
}) {
  try {
    const where: any = { 
      isVisible: true, 
      channel: { in: ['ONLINE', 'SHARED'] },
      category: {
        isActive: true
      }
    };
    
    const cleanCategory = (categoryId === '*' || categoryId === 'all') ? '' : categoryId;
    if (cleanCategory) {
      const normalizedCategory = 
        cleanCategory === 'perfumes' ? 'fragrances' :
        cleanCategory === 'tools' ? 'beauty-tools' :
        cleanCategory;

      where.category = {
        isActive: true,
        OR: [
          { slug: normalizedCategory },
          { slug: cleanCategory },
          { id: cleanCategory }
        ]
      };
    }

    const activePromos = getActivePromotions('STOREFRONT');
    const promoTargetIds = activePromos.map(p => p.targetProductId).filter(Boolean) as string[];

    if (filter === 'offers') {
      if (promoTargetIds.length > 0) {
        where.OR = [
          { id: { in: promoTargetIds } },
          { slug: { in: promoTargetIds } }
        ];
      } else {
        where.id = 'NO_ACTIVE_PROMOTIONS';
      }
    }

    if (genderId) where.genderId = genderId;
    if (familyId) where.familyId = familyId;
    
    if (q) {
      where.OR = [
        { nameAr: { contains: q, mode: 'insensitive' } },
        { nameEn: { contains: q, mode: 'insensitive' } },
        { sku: { contains: q, mode: 'insensitive' } }
      ];
    }

    let products: any[] = [];
    let total = 0;
    let dbSuccess = false;

    try {
      const [dbProducts, dbTotal] = await Promise.all([
        prisma.product.findMany({
          where,
          skip,
          take,
          select: {
            id: true,
            slug: true,
            nameAr: true,
            nameEn: true,
            shortDescription: true,
            rating: true,
            reviewsCount: true,
            reviewReasons: true,
            category: { select: { id: true, name: true, slug: true } },
            brand: { select: { id: true, name: true, nameAr: true } },
            variants: {
              where: { isActive: true },
              orderBy: { price: 'asc' },
              select: {
                id: true,
                size: true,
                shade: true,
                colorHex: true,
                price: true,
                compareAt: true,
                isActive: true,
              }
            },
            images: {
              orderBy: { order: 'asc' },
              select: { id: true, url: true, isMain: true, order: true }
            },
          },
          orderBy: { createdAt: 'desc' }
        }),
        prisma.product.count({ where })
      ]);

      products = dbProducts.map((p: any) => {
        const publicVariants = (p.variants || []).map((v: any) => {
          const { costPrice: _costPrice, ...safeVariant } = v;
          return safeVariant;
        });
        const lowestPrice = publicVariants.length > 0 ? Math.min(...publicVariants.map((v: any) => v.price)) : 0;
        const pricing = computeProductPromotionPricing({ ...p, variants: publicVariants, priceFils: lowestPrice }, 'STOREFRONT', activePromos);

        return {
          ...p,
          variants: publicVariants,
          priceFils: pricing.priceFils,
          originalPriceFils: pricing.originalPriceFils,
          compareAtPriceFils: pricing.compareAtPriceFils,
          discountPercent: pricing.discountPercent,
          hasOffer: pricing.hasOffer,
        };
      });
      total = dbTotal;
      dbSuccess = true;
    } catch (e) {
      // Prisma offline or schema fallback
      dbSuccess = false;
    }

    // Only use mock catalog fallback if the database connection failed
    if (!dbSuccess) {
      let filtered = COSMETICS_CATALOG.filter(p => !p.isPOSOnly && p.channel !== 'POS');

      if (categoryId) {
        const normalizedCategory = 
          categoryId === 'perfumes' ? 'fragrances' :
          categoryId === 'tools' ? 'beauty-tools' :
          categoryId;
        filtered = filtered.filter(p => 
          p.categorySlug === normalizedCategory || 
          p.categorySlug === categoryId || 
          p.categoryId === categoryId
        );
      }

      if (filter === 'offers') {
        filtered = filtered.filter(p => findActivePromotionForProduct(p.id, p.slug, 'STOREFRONT', activePromos) !== null);
      }

      if (q) {
        const lowerQ = q.toLowerCase();
        filtered = filtered.filter(p => 
          p.nameAr.toLowerCase().includes(lowerQ) || 
          p.nameEn.toLowerCase().includes(lowerQ) ||
          p.brandName.toLowerCase().includes(lowerQ)
        );
      }

      total = filtered.length;
      products = filtered.slice(skip, skip + take).map(p => {
        const pricing = computeProductPromotionPricing(p, 'STOREFRONT', activePromos);
        const publicVariants = (p.variants || []).map((v: any) => {
          const { costPrice: _costPrice, ...safeVariant } = v;
          return safeVariant;
        });

        return {
          id: p.id,
          slug: p.slug,
          nameAr: p.nameAr,
          nameEn: p.nameEn,
          category: { id: p.categoryId, name: p.categoryName, slug: p.categorySlug },
          categoryId: p.categoryId,
          brand: { name: p.brandName === 'غزل' ? '' : p.brandName },
          variants: publicVariants,
          images: p.images,
          rating: p.rating,
          isFeatured: p.isFeatured,
          tag: pricing.hasOffer && pricing.discountPercent ? `خصم -${pricing.discountPercent}%` : p.tag,
          priceFils: pricing.priceFils,
          originalPriceFils: pricing.originalPriceFils,
          compareAtPriceFils: pricing.compareAtPriceFils,
          discountPercent: pricing.discountPercent,
          hasOffer: pricing.hasOffer,
        };
      });
    }

    return { success: true, products, total };
  } catch (error: any) {
    console.error('Error fetching paginated products:', error);
    return { success: false, products: [], total: 0 };
  }
}
