import React, { cache } from 'react';
import { prisma } from '@/lib/db';
import { notFound } from 'next/navigation';
import { filsToDisplay } from '@/lib/money';
import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getProductBySlug, COSMETICS_CATALOG, DemoProduct } from '@/lib/cosmetics-catalog';
import { getActivePromotions, computeProductPromotionPricing } from '@/lib/promotions';
import { getProductCustomBadges } from '@/actions/products';
import { ProductShowcase } from '@/components/ProductShowcase';
import { ProductBackButton } from '@/components/ProductBackButton';
import SuggestedProducts from '@/components/SuggestedProducts';
import { ShieldCheck, Truck, RotateCcw, Heart, Share2, CheckCircle2 } from 'lucide-react';

export const revalidate = 60;
export const dynamicParams = true;

/**
 * Request-scoped deduplicated product query via React cache().
 * Eliminates duplicate database roundtrips between generateMetadata and ProductPage.
 */
const getProductBySlugCached = cache(async (cleanSlug: string) => {
  try {
    return await prisma.product.findFirst({
      where: {
        isVisible: true,
        channel: { in: ['ONLINE', 'SHARED'] },
        OR: [
          { slug: cleanSlug },
          { id: cleanSlug },
        ],
      },
      include: {
        variants: {
          where: { isActive: true },
          orderBy: { price: 'asc' },
          select: {
            id: true,
            size: true,
            shade: true,
            colorName: true,
            colorHex: true,
            imageUrl: true,
            sku: true,
            price: true,
            compareAt: true,
            isActive: true,
          },
        },
        images: { orderBy: { order: 'asc' } },
        category: true,
        brand: true,
      },
    });
  } catch (err) {
    console.warn('Prisma lookup failed in product page, using fallback catalog:', err);
    return null;
  }
});

export async function generateStaticParams() {
  return COSMETICS_CATALOG.filter(p => !p.isPOSOnly).map(p => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; locale: string }>;
}): Promise<Metadata> {
  const { slug, locale } = await params;
  const isAr = locale === 'ar';
  const cleanSlug = decodeURIComponent(slug || '').trim();

  const product = await getProductBySlugCached(cleanSlug);

  const demo = getProductBySlug(cleanSlug);
  const name = product ? (isAr ? product.nameAr : product.nameEn) : (demo ? (isAr ? demo.nameAr : demo.nameEn) : 'منتج غزل');
  const description = product?.shortDescription || demo?.shortDescription || (isAr
    ? `${name} — مستحضرات تجميل ومكياج من محل غزل (عين الباشا)`
    : `${name} — Quality Cosmetics from Ghazal Cosmetics`);

  return {
    title: `${name} | محل غزل للمكياج والتجميل`,
    description,
    keywords: [name, 'محل غزل', 'مكياج', 'عين الباشا', 'مستحضرات تجميل الأردن'],
  };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string; locale: string }> }) {
  const { slug, locale } = await params;
  const isAr = locale === 'ar';
  const cleanSlug = decodeURIComponent(slug || '').trim();

  const dbProduct = await getProductBySlugCached(cleanSlug);

  // Fallback to rich demo catalog if not in database
  const demoProduct = getProductBySlug(cleanSlug);

  if (!dbProduct && !demoProduct) {
    notFound();
  }

  const customBadges = await getProductCustomBadges();
  const assignedTag = (dbProduct?.reviewReasons?.startsWith('TAG:') ? dbProduct.reviewReasons.replace('TAG:', '') : null) || 
    customBadges[cleanSlug] || 
    (dbProduct?.id ? customBadges[dbProduct.id] : null) || 
    demoProduct?.tag || 
    undefined;

  // Normalize product data
  const product: any = dbProduct ? {
    ...dbProduct,
    tag: assignedTag,
  } : {
    id: demoProduct!.id,
    slug: demoProduct!.slug,
    nameAr: demoProduct!.nameAr,
    nameEn: demoProduct!.nameEn,
    shortDescription: demoProduct!.shortDescription,
    fullDescription: demoProduct!.fullDescription,
    howToUse: demoProduct!.howToUse,
    features: demoProduct!.features,
    category: {
      id: demoProduct!.categoryId,
      name: demoProduct!.categoryName,
      slug: demoProduct!.categorySlug,
    },
    brand: {
      name: demoProduct!.brandName,
    },
    tag: assignedTag,
    rating: demoProduct!.rating,
    reviewsCount: demoProduct!.reviewsCount,
    images: (demoProduct!.images || []).map(img => ({ id: img.id, url: img.url, isMain: img.isMain })),
    variants: (demoProduct!.variants || []).map(v => ({
      id: v.id,
      size: v.size,
      shade: v.shade,
      price: v.price,
      compareAt: null,
      stock: v.stock,
      colorHex: v.colorHex || '#E6007E',
      imageUrl: (v as any).imageUrl || (v as any).image || null,
    })),
  };

  // Evaluate promotion pricing strictly from /admin/promotions
  const activePromos = getActivePromotions('STOREFRONT');
  const promoPricing = computeProductPromotionPricing(product, 'STOREFRONT', activePromos);

  if (promoPricing.hasOffer) {
    product.originalPriceFils = promoPricing.originalPriceFils;
    product.priceFils = promoPricing.priceFils;
    // Keep product.tag strictly as the individual promotional badge assigned from admin
    if (product.variants && product.variants.length > 0) {
      product.variants = product.variants.map((v: any) => {
        const vBase = v.price;
        let vDiscounted = vBase;
        if (promoPricing.promotion?.discountType === 'PERCENTAGE') {
          const pct = promoPricing.discountPercent || 0;
          vDiscounted = Math.max(500, Math.round(vBase * (1 - pct / 100)));
        } else {
          const fixedFils = (promoPricing.promotion?.discountValue || 0) > 100 
            ? promoPricing.promotion!.discountValue 
            : Math.round((promoPricing.promotion?.discountValue || 0) * 1000);
          vDiscounted = Math.max(500, vBase - fixedFils);
        }
        return {
          ...v,
          price: vDiscounted,
          compareAt: vBase,
        };
      });
    }
  } else {
    product.originalPriceFils = undefined;
    if (product.variants) {
      product.variants = product.variants.map((v: any) => ({ ...v, compareAt: null }));
    }
  }

  const mainImage = product.images?.find((img: any) => img.isMain) || product.images?.[0] || { url: '/logo.png' };
  const productName = isAr ? product.nameAr : (product.nameEn || product.nameAr);
  const lowestPrice = product.variants && product.variants.length > 0
    ? Math.min(...product.variants.map((v: any) => v.price))
    : (promoPricing.priceFils || 12000);

  // Suggested products (up to 10 products for horizontal scrolling)
  const suggestedProductsData = COSMETICS_CATALOG
    .filter(p => p.slug !== slug && !p.isPOSOnly)
    .slice(0, 10)
    .map(p => ({
      id: p.id,
      slug: p.slug,
      nameAr: p.nameAr,
      nameEn: p.nameEn,
      imageUrl: p.images[0]?.url || '/logo.png',
      lowestPrice: p.priceFils,
    }));

  return (
    <div className="bg-white min-h-screen py-8 md:py-12" dir={isAr ? 'rtl' : 'ltr'} style={{ backgroundColor: '#ffffff', colorScheme: 'only light' }}>
      <div className="container mx-auto px-4 sm:px-6 max-w-6xl">
        {/* Top Bar: Back Button & Breadcrumbs */}
        <div className="flex items-center gap-3 mb-6">
          <ProductBackButton locale={locale} />
          <nav className="flex items-center gap-2 text-xs text-zinc-500 font-semibold overflow-x-auto whitespace-nowrap">
            <Link href={`/${locale}`} className="hover:text-[#E6007E] transition-colors">{isAr ? 'الرئيسية' : 'Home'}</Link>
            <span>/</span>
            <Link href={`/${locale}/shop`} className="hover:text-[#E6007E] transition-colors">{isAr ? 'المتجر' : 'Shop'}</Link>
            <span>/</span>
            <span className="text-[#1A1A1A] font-bold truncate max-w-xs">{productName}</span>
          </nav>
        </div>

        {/* Product Showcase (Compact, Scaled Down, Dynamic Variant Imagery, No Tag Spam) */}
        <ProductShowcase
          product={product}
          locale={locale}
          initialImage={mainImage.url || '/logo.png'}
          demoProduct={demoProduct}
          lowestPrice={lowestPrice}
        />

        {/* Suggested Beauty Products */}
        <div className="mt-12">
          <SuggestedProducts products={suggestedProductsData} locale={locale} />
        </div>
      </div>
    </div>
  );
}
