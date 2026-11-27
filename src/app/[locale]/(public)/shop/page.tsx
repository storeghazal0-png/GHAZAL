import { prisma } from '@/lib/db';
import Link from 'next/link';
import { filsToDisplay } from '@/lib/money';
import { ShopFilters } from '@/components/ShopFilters';
import { MobileCategoriesFeed } from '@/components/MobileCategoriesFeed';
import { PaginatedProductGrid } from '@/components/PaginatedProductGrid';
import type { Metadata } from 'next';
import { Sparkles, ShoppingBag, ArrowLeft, Tag } from 'lucide-react';
import { getActivePromotions, computeProductPromotionPricing, findActivePromotionForProduct } from '@/lib/promotions';
import { getProductCustomBadges } from '@/actions/products';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const BASE_URL = 'https://ghazal.jo';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const isAr = locale === 'ar';
  return {
    title: isAr
      ? 'متجر غزل للمكياج والعناية | عين الباشا — GHAZAL'
      : 'GHAZAL Cosmetics Shop | Ain Al-Basha, Jordan',
    description: isAr
      ? 'تسوقي أفضل الماركات لمستحضرات التجميل، المكياج، العناية بالبشرة والشعر، والعطور في محل غزل للمكياجات - عين الباشا مع توصيل لجميع المحافظات.'
      : 'Shop cosmetics, makeup, skincare, haircare and perfumes from Ghazal Cosmetics in Ain Al-Basha with delivery across Jordan.',
    alternates: {
      canonical: `${BASE_URL}/${locale}/shop`,
      languages: { ar: `${BASE_URL}/ar/shop`, en: `${BASE_URL}/en/shop` },
    },
    openGraph: {
      title: isAr ? 'متجر غزل للمكياج والعناية' : 'GHAZAL Cosmetics Shop',
      description: isAr ? 'جمالك في مكان واحد • ماركات عالمية ومحلية مختارة' : 'Your beauty in one place',
      url: `${BASE_URL}/${locale}/shop`,
      locale: isAr ? 'ar_JO' : 'en_US',
    },
  };
}

// Fallback beauty catalog if DB is empty or during local dev
const fallbackCatalog: any[] = [];

export default async function ShopPage({ 
  params, 
  searchParams 
}: { 
  params: Promise<{ locale: string }>; 
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { locale = 'ar' } = await params;
  const isAr = locale === 'ar';
  const sp = await searchParams;
  
  const q = typeof sp.q === 'string' ? sp.q : typeof sp.search === 'string' ? sp.search : '';
  const rawCategory = typeof sp.category === 'string' ? sp.category.trim() : '';
  const isAllCategory = !rawCategory || rawCategory === '*' || rawCategory.toLowerCase() === 'all';
  const categoryParam = isAllCategory ? '' : rawCategory;
  const filterParam = typeof sp.filter === 'string' ? sp.filter : '';
  const genderStr = typeof sp.gender === 'string' ? sp.gender : '';
  const familyStr = typeof sp.family === 'string' ? sp.family : '';

  // Normalized category slug
  const normalizedCategory = 
    categoryParam === 'perfumes' ? 'fragrances' :
    categoryParam === 'tools' ? 'beauty-tools' :
    categoryParam;

  // Active storefront promotions from /admin/promotions
  const activePromos = getActivePromotions('STOREFRONT');
  const promoTargetIds = activePromos.map(p => p.targetProductId).filter(Boolean) as string[];

  let products: any[] = [];
  let totalCount = 0;
  let categories: any[] = [];
  let genders: any[] = [];
  let families: any[] = [];
  let customBadges: Record<string, string> = {};

  let dbSuccess = false;

  try {
    // Build prisma where clause (Online storefront only queries ONLINE and SHARED channels)
    const where: any = { 
      isVisible: true,
      channel: { in: ['ONLINE', 'SHARED'] },
      category: {
        isActive: true,
        channel: { in: ['ONLINE', 'SHARED'] }
      }
    };
    
    if (categoryParam) {
      where.category = {
        isActive: true,
        channel: { in: ['ONLINE', 'SHARED'] },
        OR: [
          { slug: normalizedCategory },
          { slug: categoryParam },
          { id: categoryParam },
          { parent: { slug: normalizedCategory } }
        ]
      };
    }

    if (filterParam === 'offers') {
      if (promoTargetIds.length > 0) {
        where.OR = [
          { id: { in: promoTargetIds } },
          { slug: { in: promoTargetIds } }
        ];
      } else {
        where.id = 'NO_ACTIVE_PROMOTIONS';
      }
    }

    if (genderStr) where.genderId = genderStr;
    if (familyStr) where.familyId = familyStr;
    
    if (q) {
      where.OR = [
        { nameAr: { contains: q, mode: 'insensitive' } },
        { nameEn: { contains: q, mode: 'insensitive' } },
        { sku: { contains: q, mode: 'insensitive' } }
      ];
    }

    const [dbProducts, dbTotal, dbCats, dbGenders, dbFamilies, fetchedBadges] = await Promise.all([
      prisma.product.findMany({
        where,
        take: 40,
        skip: 0,
        include: {
          variants: { orderBy: { size: 'asc' } },
          images: { orderBy: { order: 'asc' } },
          category: true,
          brand: true,
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.product.count({ where }),
      prisma.category.findMany({ 
        where: { 
          isActive: true, 
          channel: { in: ['ONLINE', 'SHARED'] } 
        },
        include: {
          children: {
            where: {
              isActive: true,
              channel: { in: ['ONLINE', 'SHARED'] },
            },
            orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          },
        },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] 
      }),
      prisma.gender.findMany({ orderBy: { name: 'asc' } }),
      prisma.fragranceFamily.findMany({ orderBy: { name: 'asc' } }),
      getProductCustomBadges(),
    ]);

    customBadges = fetchedBadges || {};

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
        tag: (p.reviewReasons?.startsWith('TAG:') ? p.reviewReasons.replace('TAG:', '') : null) || customBadges[p.id] || customBadges[p.slug] || p.tag || undefined,
        priceFils: pricing.priceFils,
        originalPriceFils: pricing.originalPriceFils,
        compareAtPriceFils: pricing.compareAtPriceFils,
        discountPercent: pricing.discountPercent,
        hasOffer: pricing.hasOffer,
      };
    });

    totalCount = dbTotal;
    categories = dbCats;
    genders = dbGenders;
    families = dbFamilies;
    dbSuccess = true;
  } catch (error) {
    console.error('[ShopPage] Database query failed:', error instanceof Error ? error.message : error);
    dbSuccess = false;
  }

  if (!dbSuccess && categories.length === 0) {
    categories = [
      { id: 'cat-makeup', name: 'المكياج', slug: 'makeup' },
      { id: 'cat-skincare', name: 'العناية بالبشرة', slug: 'skincare' },
      { id: 'cat-haircare', name: 'العناية بالشعر', slug: 'haircare' },
      { id: 'cat-fragrances', name: 'العطور', slug: 'fragrances' },
      { id: 'cat-beauty-tools', name: 'أدوات التجميل', slug: 'beauty-tools' },
      { id: 'cat-accessories', name: 'الإكسسوارات', slug: 'accessories' },
    ];
  }

  // Category-specific rich content headers (كلام مناسب لكل قسم)
  const categoryHeaders: Record<string, { title: string; subtitle: string; badge: string }> = {
    all: {
      badge: isAr ? 'تشكيلة الجمال والأناقة' : 'Complete Beauty Catalog',
      title: isAr ? 'متجر غزل لمستحضرات التجميل والعناية' : 'Ghazal Beauty Collection',
      subtitle: isAr 
        ? 'تسوقي أحدث صيحات المكياج، العناية بالبشرة والشعر، وأرقى العطور مع خدمة التوصيل لكافة المحافظات والدفع عند الاستلام.'
        : 'Discover cosmetics, skincare, haircare, and fragrances with fast delivery across Jordan.',
    },
    makeup: {
      badge: isAr ? 'إشراقة وإطلالة ساحرة' : 'Radiant Glamour',
      title: isAr ? 'عالم المكياج ومستحضرات التجميل' : 'Makeup & Cosmetics',
      subtitle: isAr
        ? 'أحدث كريمات الأساس، أحمر الشفاه، الماسكارا، وباليتات الظلال من أشهر الماركات العالمية لإبراز جمالكِ الطبيعي وتألقكِ في كل مناسبة.'
        : 'Explore foundations, lipsticks, mascaras, and eyeshadow palettes from top global beauty brands.',
    },
    skincare: {
      badge: isAr ? 'نضارة وصحة البشرة' : 'Healthy Radiant Skin',
      title: isAr ? 'العناية الفائقة بالبشرة' : 'Skincare & Essentials',
      subtitle: isAr
        ? 'سيرومات علاجية مركزة، غسولات لطيفة، ومرطبات طبية معتمدة لحماية وتجديد خلايا بشرتكِ ومنحها الإشراقة والصفاء الدائم.'
        : 'Targeted serums, gentle cleansers, and dermatologist-tested moisturizers for glowing skin.',
    },
    haircare: {
      badge: isAr ? 'حيوية ولمعان الشعر' : 'Hair Health & Vitality',
      title: isAr ? 'العناية وترميم الشعر' : 'Haircare & Treatments',
      subtitle: isAr
        ? 'أفضل الزيوت المغذية، الشامبوهات المعالجة، وماسكات الأرغان لترميم التلف وفك التشابك لشعر ناعم، صحي، وحريري الملمس.'
        : 'Nourishing oils, restorative shampoos, and intensive hair masks for healthy hair.',
    },
    fragrances: {
      badge: isAr ? 'عبير وأناقة تدوم' : 'Long-Lasting Scents',
      title: isAr ? 'العطور الفاخرة والنفحات الشرقية' : 'Luxury Perfumes & Scents',
      subtitle: isAr
        ? 'باقة عطرية مميزة تجمع بين الفواحان العالي والثبات الطويل بتركيزات راقية تلائم جميع الأوقات والمناسبات الخاصة.'
        : 'Exquisite fragrance compositions with exceptional sillage and longevity.',
    },
    perfumes: {
      badge: isAr ? 'عبير وأناقة تدوم' : 'Long-Lasting Scents',
      title: isAr ? 'العطور الفاخرة والنفحات الشرقية' : 'Luxury Perfumes & Scents',
      subtitle: isAr
        ? 'باقة عطرية مميزة تجمع بين الفواحان العالي والثبات الطويل بتركيزات راقية تلائم جميع الأوقات والمناسبات الخاصة.'
        : 'Exquisite fragrance compositions with exceptional sillage and longevity.',
    },
    accessories: {
      badge: isAr ? 'لمسات أنيقة وهدايا' : 'Chic Accents & Gifts',
      title: isAr ? 'الإكسسوارات وبكجات الهدايا' : 'Accessories & Gift Sets',
      subtitle: isAr
        ? 'حقائب مكياج مخملية، إكسسوارات أنيقة، وبكجات هدايا صممت لتضفي لمسة رقي وجمال على كل تفاصيلكِ وتكون هدية مثالية لمن تحبين.'
        : 'Cosmetic pouches, elegant accessories, and curated gift boxes for all occasions.',
    },
    'beauty-tools': {
      badge: isAr ? 'تطبيق احترافي دقيق' : 'Pro Application Tools',
      title: isAr ? 'أدوات وفرش المكياج الاحترافية' : 'Beauty & Makeup Tools',
      subtitle: isAr
        ? 'فرش ناعمة عالية الجودة وإسفنجات دمج متطورة تمنحكِ توزيعاً متجانساً واحترافياً لمكياجكِ دون أي تكتل أو هدر للمنتج.'
        : 'Professional blenders, ultra-soft brushes, and precision tools for flawless application.',
    },
    tools: {
      badge: isAr ? 'تطبيق احترافي دقيق' : 'Pro Application Tools',
      title: isAr ? 'أدوات وفرش المكياج الاحترافية' : 'Beauty & Makeup Tools',
      subtitle: isAr
        ? 'فرش ناعمة عالية الجودة وإسفنجات دمج متطورة تمنحكِ توزيعاً متجانساً واحترافياً لمكياجكِ دون أي تكتل أو هدر للمنتج.'
        : 'Professional blenders, ultra-soft brushes, and precision tools for flawless application.',
    },
    offers: {
      badge: isAr ? 'العروض والتخفيضات' : 'Special Offers',
      title: isAr ? 'العروض والتخفيضات' : 'Offers & Discounts',
      subtitle: isAr
        ? 'خصومات وعروض على أفضل منتجات التجميل والمكياج بأسعار خاصة ولفترة محدودة.'
        : 'Discounts on top beauty products for a limited time.',
    },
  };

  const currentHeaderKey = filterParam === 'offers' 
    ? 'offers' 
    : (categoryParam ? normalizedCategory : 'all');
  const activeHeader = categoryHeaders[currentHeaderKey] || categoryHeaders['all'];

  const displayTitle = q ? (isAr ? `نتائج البحث عن: "${q}"` : `Search results for: "${q}"`) : activeHeader.title;
  const displaySubtitle = q ? (isAr ? `وجدنا ${totalCount} منتج يطابق معايير بحثكِ` : `Found ${totalCount} matching items`) : activeHeader.subtitle;
  const displayBadge = q ? (isAr ? 'البحث في المتجر' : 'Store Search') : activeHeader.badge;

  // Group filtered products by category for the mobile feed
  const categoriesMap = new Map();
  for (const product of products) {
    const catId = product.categoryId || product.category?.id || 'general';
    const catName = product.category?.name || 'المنتجات';
    const catSlug = product.category?.slug || 'shop';
    if (!categoriesMap.has(catId)) {
      categoriesMap.set(catId, {
        id: catId,
        name: catName,
        slug: catSlug,
        products: []
      });
    }
    categoriesMap.get(catId).products.push(product);
  }
  const groupedCategories = Array.from(categoriesMap.values());

  return (
    <div className="bg-white min-h-screen pb-20 font-sans" dir={isAr ? 'rtl' : 'ltr'} style={{ backgroundColor: '#ffffff', colorScheme: 'only light' }}>
      {/* Header Banner - Hot Pink Accent */}
      <div className="bg-gradient-to-r from-[#1A1A1A] via-[#2A1020] to-[#1A1A1A] text-white py-12 md:py-16 text-center border-b-4 border-[#E6007E] relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(#E6007E_1px,transparent_1px)] [background-size:24px_24px] opacity-15" />
        
        <div className="container mx-auto px-6 relative z-10 max-w-3xl">
          <h1 className="text-3xl md:text-5xl font-extrabold font-heading mb-3 text-white tracking-tight">
            {displayTitle}
          </h1>
          <p className="text-zinc-300 text-sm md:text-base leading-relaxed max-w-2xl mx-auto">
            {displaySubtitle}
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 md:px-6 mt-8 flex flex-col gap-6">
        
        {/* Inline Top Filters */}
        <div className="mb-6">
          <ShopFilters 
            categories={categories} 
            genders={genders}
            families={families}
            initialCategory={categoryParam}
            initialGender={genderStr}
            initialFamily={familyStr}
          />
        </div>

        {/* Product Grid */}
        <main className="w-full overflow-hidden">
          <PaginatedProductGrid 
            key={`${categoryParam}-${q}-${filterParam}-${genderStr}-${familyStr}`}
            initialProducts={products}
            totalCount={totalCount}
            locale={locale}
            filters={{ categoryId: categoryParam, genderId: genderStr, familyId: familyStr, q }}
          />
        </main>
      </div>
    </div>
  );
}
