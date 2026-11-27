'use server';

import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/dal';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';

// Helper to validate origin/host for security
async function validateOriginAndHost() {
  const headersList = await headers();
  const host = headersList.get('host');
  const origin = headersList.get('origin');
  
  if (origin && host) {
    const originUrl = new URL(origin);
    // Ignore port mismatch in development/test environments
    if (process.env.NODE_ENV !== 'test' && originUrl.hostname !== host.split(':')[0]) {
      throw new Error('فشل التحقق من أصل الطلب (Origin Mismatch)');
    }
  }
}

// Helper to validate URLs safely (no javascript:, data:, etc.)
function validateSafeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const clean = url.trim().toLowerCase();
  if (
    clean.startsWith('javascript:') ||
    clean.startsWith('data:') ||
    clean.startsWith('file:') ||
    clean.startsWith('vbscript:')
  ) {
    throw new Error('الرابط غير آمن أو غير مدعوم');
  }
  return url.trim();
}

// Zod schemas for input validation
const carouselSettingsSchema = z.object({
  enabled: z.boolean(),
  autoplayEnabled: z.boolean(),
  autoplayIntervalMs: z.number().min(3000).max(15000),
  pauseOnHover: z.boolean(),
  showIndicators: z.boolean(),
  showNavigation: z.boolean(),
  transitionType: z.enum(['FADE', 'SLIDE'])
});

const slideInputSchema = z.object({
  titleAr: z.string().min(1, 'يرجى إدخال عنوان الإعلان'),
  titleEn: z.string().optional().default(''),
  descriptionAr: z.string().optional().default(''),
  descriptionEn: z.string().optional().default(''),
  eyebrowAr: z.string().nullable().optional(),
  eyebrowEn: z.string().nullable().optional(),
  ctaAr: z.string().nullable().optional(),
  ctaEn: z.string().nullable().optional(),
  imageDesktopPath: z.string().min(1, 'يرجى رفع صورة أو فيديو الإعلان'),
  imageMobilePath: z.string().optional().default(''),
  altAr: z.string().optional().default(''),
  altEn: z.string().optional().default(''),
  destinationType: z.enum(['COLLECTION', 'CATEGORY', 'PRODUCT', 'INTERNAL_ROUTE', 'EXTERNAL_URL', 'NONE']),
  productId: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  internalPath: z.string().nullable().optional(),
  externalUrl: z.string().nullable().optional(),
  displayOrder: z.number().int().default(0),
  isEnabled: z.boolean().default(true),
  startsAt: z.string().nullable().optional(),
  endsAt: z.string().nullable().optional(),
  openInNewTab: z.boolean().default(false),
  overlayStrength: z.number().min(0.0).max(1.0).default(0.4),
  textPosition: z.enum(['LEFT', 'RIGHT', 'CENTER']).default('CENTER')
});

const locationSettingsSchema = z.object({
  storeName: z.string().min(1),
  addressAr: z.string().min(1),
  addressEn: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  mapPlaceUrl: z.string().optional().nullable(),
  mapEmbedUrl: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  whatsapp: z.string().optional().nullable(),
  openingHours: z.string().min(1),
  locationSectionEnabled: z.boolean(),
  directionsButtonEnabled: z.boolean(),
  mapZoom: z.number().min(1).max(21),
  mapLabelAr: z.string().nullable().optional(),
  mapLabelEn: z.string().nullable().optional(),
  sectionOrder: z.number().int().default(10)
});

// ----------------------------------------------------------------------
// IN-MEMORY RESILIENT CACHE & DEFAULTS
// ----------------------------------------------------------------------

const defaultCarouselSettings = {
  id: 'default',
  enabled: true,
  autoplayEnabled: true,
  autoplayIntervalMs: 4000,
  pauseOnHover: true,
  showIndicators: true,
  showNavigation: false,
  transitionType: 'FADE'
};

const defaultSlides: any[] = [
  {
    id: 'slide-1',
    titleAr: 'تألقي بجمال طبيعي وأناقة لا تضاهى',
    titleEn: 'Radiate Natural Beauty & Unmatched Elegance',
    descriptionAr: 'اكتشفي تشكيلة غزل الحصرية من مستحضرات التجميل والعناية بالبشرة والعطور الفاخرة في الأردن.',
    descriptionEn: 'Discover Ghazal exclusive collection of cosmetics, skincare, and luxury perfumes in Jordan.',
    eyebrowAr: 'غزل لمستحضرات التجميل والعطور',
    eyebrowEn: 'Ghazal Cosmetics & Perfumes',
    ctaAr: 'تسوقي الآن',
    ctaEn: 'Shop Now',
    imageDesktopPath: '/images/hero-1.webp',
    imageMobilePath: '/images/hero-1.webp',
    altAr: 'غزل لمستحضرات التجميل',
    altEn: 'Ghazal Cosmetics',
    destinationType: 'COLLECTION',
    productId: null,
    categoryId: null,
    internalPath: '/shop',
    externalUrl: null,
    displayOrder: 0,
    isEnabled: true,
    startsAt: null,
    endsAt: null,
    openInNewTab: false,
    overlayStrength: 0.35,
    textPosition: 'CENTER'
  },
  {
    id: 'slide-2',
    titleAr: 'عناية متكاملة وإشراقة تدوم طويلاً',
    titleEn: 'Complete Skincare & Lasting Radiance',
    descriptionAr: 'أفضل منتجات العناية بالوجه والبشرة المختارة بعناية لأجلكِ من غزل بالأردن.',
    descriptionEn: 'Finest skincare and facial care products selected for you from Ghazal in Jordan.',
    eyebrowAr: 'العناية بالبشرة والوجه',
    eyebrowEn: 'Skincare & Facial Care',
    ctaAr: 'تسوقي قسم العناية',
    ctaEn: 'Shop Skincare',
    imageDesktopPath: '/images/hero-2.webp',
    imageMobilePath: '/images/hero-2.webp',
    altAr: 'منتجات العناية بالبشرة والوجه',
    altEn: 'Skincare products',
    destinationType: 'INTERNAL_ROUTE',
    productId: null,
    categoryId: null,
    internalPath: '/shop?category=skincare',
    externalUrl: null,
    displayOrder: 1,
    isEnabled: true,
    startsAt: null,
    endsAt: null,
    openInNewTab: false,
    overlayStrength: 0.35,
    textPosition: 'CENTER'
  },
  {
    id: 'slide-3',
    titleAr: 'سحر العطور الشرقية والفرنسية الفاخرة',
    titleEn: 'Enchanting Luxury Perfumes & Fragrances',
    descriptionAr: 'تشكيلة حصرية من أرقى العطور وثبات يدوم لأطول فترة مع توصيل سريع لكافة المحافظات.',
    descriptionEn: 'Exclusive collection of premium fragrances with lasting scent across Jordan.',
    eyebrowAr: 'العطور الفاخرة',
    eyebrowEn: 'Luxury Perfumes',
    ctaAr: 'اكتشفي العطور',
    ctaEn: 'Explore Perfumes',
    imageDesktopPath: '/images/hero-3.webp',
    imageMobilePath: '/images/hero-3.webp',
    altAr: 'العطور الفاخرة والروائح الساحرة',
    altEn: 'Luxury Fragrances',
    destinationType: 'INTERNAL_ROUTE',
    productId: null,
    categoryId: null,
    internalPath: '/shop?category=perfumes',
    externalUrl: null,
    displayOrder: 2,
    isEnabled: true,
    startsAt: null,
    endsAt: null,
    openInNewTab: false,
    overlayStrength: 0.35,
    textPosition: 'CENTER'
  }
];

const defaultLocationSettings = {
  id: 'default',
  storeName: 'غزل لمستحضرات التجميل والعطور',
  addressAr: 'عمان، البلقاء - عين الباشا - شارع القدس',
  addressEn: 'Amman / Balqa - Ain Al-Basha - Al-Quds Street',
  latitude: 32.0673,
  longitude: 35.8344,
  mapPlaceUrl: 'https://maps.app.goo.gl/8cZjT3BHFBCq9r5aA',
  mapEmbedUrl: '',
  phone: '+962776299243',
  whatsapp: '962776299243',
  openingHours: '10:00 AM - 11:00 PM',
  locationSectionEnabled: true,
  directionsButtonEnabled: true,
  mapZoom: 15,
  mapLabelAr: 'موقع فرعنا في عين الباشا - شارع القدس',
  mapLabelEn: 'Our Ain Al-Basha - Al-Quds Street Store',
  sectionOrder: 10
};

let memoryCarouselSettings: any = (globalThis as any).__ghazal_hero_carousel_settings || defaultCarouselSettings;
(globalThis as any).__ghazal_hero_carousel_settings = memoryCarouselSettings;
let carouselSettingsExpiresAt = 0;

let memoryHeroSlides: any[] = (globalThis as any).__ghazal_hero_slides || defaultSlides;
(globalThis as any).__ghazal_hero_slides = memoryHeroSlides;
let heroSlidesExpiresAt = 0;

let memoryLocationSettings: any = (globalThis as any).__ghazal_location_settings || defaultLocationSettings;
(globalThis as any).__ghazal_location_settings = memoryLocationSettings;

// ----------------------------------------------------------------------
// CAROUSEL SETTINGS
// ----------------------------------------------------------------------

export async function getHeroCarouselSettings() {
  const now = Date.now();
  if (carouselSettingsExpiresAt > now && memoryCarouselSettings) {
    return memoryCarouselSettings;
  }
  try {
    const settings = await prisma.homepageHeroCarouselSettings.findUnique({
      where: { id: 'default' }
    });
    if (settings) {
      memoryCarouselSettings = settings;
      (globalThis as any).__ghazal_hero_carousel_settings = settings;
      carouselSettingsExpiresAt = now + 60_000;
      return settings;
    }
  } catch (err) {
    console.warn('Prisma getHeroCarouselSettings fallback active');
  }
  carouselSettingsExpiresAt = now + 15_000;
  return memoryCarouselSettings;
}

export async function updateHeroCarouselSettings(data: z.infer<typeof carouselSettingsSchema>) {
  const session = await requirePermission('manage:settings');
  await validateOriginAndHost();
  carouselSettingsExpiresAt = 0;
  
  const parsed = carouselSettingsSchema.parse(data);
  memoryCarouselSettings = { ...parsed, id: 'default', updatedByEmployeeId: session.employeeId };
  (globalThis as any).__ghazal_hero_carousel_settings = memoryCarouselSettings;

  let updated = memoryCarouselSettings;
  try {
    updated = await prisma.homepageHeroCarouselSettings.upsert({
      where: { id: 'default' },
      update: { ...parsed, updatedByEmployeeId: session.employeeId },
      create: { ...parsed, id: 'default', updatedByEmployeeId: session.employeeId }
    });

    await prisma.auditLog.create({
      data: {
        employeeId: session.employeeId,
        action: 'UPDATE_HERO_CAROUSEL_SETTINGS',
        entityType: 'HomepageHeroCarouselSettings',
        entityId: 'default',
        details: JSON.stringify(parsed)
      }
    });
  } catch (err) {
    console.warn('Prisma updateHeroCarouselSettings db write skipped, updated in memory');
  }

  revalidatePath('/', 'layout');
  return { success: true, settings: updated };
}

// ----------------------------------------------------------------------
// HERO SLIDES
// ----------------------------------------------------------------------

export async function getHeroSlides() {
  const now = Date.now();
  if (heroSlidesExpiresAt > now && memoryHeroSlides && memoryHeroSlides.length > 0) {
    return memoryHeroSlides;
  }
  try {
    const slides = await prisma.homepageHeroSlide.findMany({
      orderBy: { displayOrder: 'asc' },
      include: {
        product: true,
        category: true
      }
    });
    if (slides && slides.length > 0) {
      memoryHeroSlides = slides;
      (globalThis as any).__ghazal_hero_slides = slides;
      heroSlidesExpiresAt = now + 60_000;
      return slides;
    }
  } catch (err) {
    console.warn('Prisma getHeroSlides fallback active');
  }
  heroSlidesExpiresAt = now + 15_000;
  return memoryHeroSlides;
}

export async function createHeroSlide(data: z.infer<typeof slideInputSchema>) {
  const session = await requirePermission('manage:settings');
  await validateOriginAndHost();
  heroSlidesExpiresAt = 0;

  const parsed = slideInputSchema.parse(data);

  const titleEn = parsed.titleEn || parsed.titleAr || '';
  const descriptionEn = parsed.descriptionEn || parsed.descriptionAr || '';
  const altAr = parsed.altAr || parsed.titleAr || '';
  const altEn = parsed.altEn || titleEn || altAr;
  const imageMobilePath = parsed.imageMobilePath || parsed.imageDesktopPath;

  const normalized = {
    ...parsed,
    titleEn,
    descriptionEn,
    altAr,
    altEn,
    imageMobilePath
  };

  // Validate URL properties
  validateSafeUrl(normalized.imageDesktopPath);
  validateSafeUrl(normalized.imageMobilePath);
  validateSafeUrl(normalized.internalPath);
  validateSafeUrl(normalized.externalUrl);

  const startsAt = normalized.startsAt ? new Date(normalized.startsAt) : null;
  const endsAt = normalized.endsAt ? new Date(normalized.endsAt) : null;

  const newSlide = {
    ...normalized,
    id: 'slide-' + Date.now(),
    startsAt,
    endsAt,
    createdByEmployeeId: session.employeeId,
    updatedByEmployeeId: session.employeeId,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  try {
    const slide = await prisma.homepageHeroSlide.create({
      data: {
        ...normalized,
        startsAt,
        endsAt,
        createdByEmployeeId: session.employeeId,
        updatedByEmployeeId: session.employeeId
      }
    });

    await prisma.auditLog.create({
      data: {
        employeeId: session.employeeId,
        action: 'CREATE_HERO_SLIDE',
        entityType: 'HomepageHeroSlide',
        entityId: slide.id,
        details: JSON.stringify(slide)
      }
    });

    memoryHeroSlides.push(slide);
    (globalThis as any).__ghazal_hero_slides = memoryHeroSlides;
    revalidatePath('/', 'layout');
    return { success: true, slide };
  } catch (err) {
    console.warn('Prisma createHeroSlide db write skipped, saved in memory');
    memoryHeroSlides.push(newSlide);
    (globalThis as any).__ghazal_hero_slides = memoryHeroSlides;
    revalidatePath('/', 'layout');
    return { success: true, slide: newSlide };
  }
}

export async function updateHeroSlide(id: string, data: z.infer<typeof slideInputSchema>) {
  const session = await requirePermission('manage:settings');
  await validateOriginAndHost();
  heroSlidesExpiresAt = 0;

  const parsed = slideInputSchema.parse(data);

  const titleEn = parsed.titleEn || parsed.titleAr || '';
  const descriptionEn = parsed.descriptionEn || parsed.descriptionAr || '';
  const altAr = parsed.altAr || parsed.titleAr || '';
  const altEn = parsed.altEn || titleEn || altAr;
  const imageMobilePath = parsed.imageMobilePath || parsed.imageDesktopPath;

  const normalized = {
    ...parsed,
    titleEn,
    descriptionEn,
    altAr,
    altEn,
    imageMobilePath
  };

  validateSafeUrl(normalized.imageDesktopPath);
  validateSafeUrl(normalized.imageMobilePath);
  validateSafeUrl(normalized.internalPath);
  validateSafeUrl(normalized.externalUrl);

  const startsAt = normalized.startsAt ? new Date(normalized.startsAt) : null;
  const endsAt = normalized.endsAt ? new Date(normalized.endsAt) : null;

  try {
    const slide = await prisma.homepageHeroSlide.update({
      where: { id },
      data: {
        ...normalized,
        startsAt,
        endsAt,
        updatedByEmployeeId: session.employeeId
      }
    });

    await prisma.auditLog.create({
      data: {
        employeeId: session.employeeId,
        action: 'UPDATE_HERO_SLIDE',
        entityType: 'HomepageHeroSlide',
        entityId: id,
        details: JSON.stringify(slide)
      }
    });

    const idx = memoryHeroSlides.findIndex(s => s.id === id);
    if (idx !== -1) memoryHeroSlides[idx] = slide;
    (globalThis as any).__ghazal_hero_slides = memoryHeroSlides;

    revalidatePath('/', 'layout');
    return { success: true, slide };
  } catch (err) {
    console.warn('Prisma updateHeroSlide db write skipped, saved in memory');
    const idx = memoryHeroSlides.findIndex(s => s.id === id);
    if (idx !== -1) {
      memoryHeroSlides[idx] = { ...memoryHeroSlides[idx], ...normalized, startsAt, endsAt, updatedAt: new Date() };
    }
    (globalThis as any).__ghazal_hero_slides = memoryHeroSlides;
    revalidatePath('/', 'layout');
    return { success: true, slide: memoryHeroSlides[idx] || normalized };
  }
}

export async function deleteHeroSlide(id: string) {
  const session = await requirePermission('manage:settings');
  await validateOriginAndHost();
  heroSlidesExpiresAt = 0;

  try {
    await prisma.homepageHeroSlide.delete({
      where: { id }
    });

    await prisma.auditLog.create({
      data: {
        employeeId: session.employeeId,
        action: 'DELETE_HERO_SLIDE',
        entityType: 'HomepageHeroSlide',
        entityId: id
      }
    });
  } catch (err) {
    console.warn('Prisma deleteHeroSlide db write skipped, deleted in memory');
  }

  memoryHeroSlides = memoryHeroSlides.filter(s => s.id !== id);
  (globalThis as any).__ghazal_hero_slides = memoryHeroSlides;

  revalidatePath('/', 'layout');
  return { success: true };
}

export async function reorderHeroSlides(ids: string[]) {
  const session = await requirePermission('manage:settings');
  await validateOriginAndHost();
  heroSlidesExpiresAt = 0;

  try {
    await prisma.$transaction(
      ids.map((id, index) =>
        prisma.homepageHeroSlide.update({
          where: { id },
          data: { displayOrder: index }
        })
      )
    );

    await prisma.auditLog.create({
      data: {
        employeeId: session.employeeId,
        action: 'REORDER_HERO_SLIDES',
        entityType: 'HomepageHeroSlide',
        entityId: 'bulk',
        details: JSON.stringify(ids)
      }
    });
  } catch (err) {
    console.warn('Prisma reorderHeroSlides db write skipped, reordered in memory');
  }

  memoryHeroSlides.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  (globalThis as any).__ghazal_hero_slides = memoryHeroSlides;

  revalidatePath('/', 'layout');
  return { success: true };
}

// ----------------------------------------------------------------------
// STORE LOCATION SETTINGS
// ----------------------------------------------------------------------

export async function getStoreLocationSettings() {
  try {
    const settings = await prisma.storeLocationSettings.findUnique({
      where: { id: 'default' }
    });
    if (settings) {
      memoryLocationSettings = settings;
      return settings;
    }

    // Persist the existing location once so the CMS editor always works from
    // the database instead of relying on an in-memory default.
    const seeded = await prisma.storeLocationSettings.create({
      data: defaultLocationSettings
    });
    memoryLocationSettings = seeded;
    return seeded;
  } catch (err) {
    console.warn('Prisma getStoreLocationSettings fallback active');
  }
  return memoryLocationSettings;
}

export async function updateStoreLocationSettings(data: z.infer<typeof locationSettingsSchema>) {
  const session = await requirePermission('manage:settings');
  await validateOriginAndHost();

  const parsed = locationSettingsSchema.parse(data);

  if (parsed.mapPlaceUrl) validateSafeUrl(parsed.mapPlaceUrl);
  if (parsed.mapEmbedUrl) validateSafeUrl(parsed.mapEmbedUrl);

  const fallbackUpdated = {
    ...parsed,
    id: 'default',
    mapPlaceUrl: parsed.mapPlaceUrl || '',
    mapEmbedUrl: parsed.mapEmbedUrl || '',
    phone: parsed.phone || '',
    whatsapp: parsed.whatsapp || ''
  };
  memoryLocationSettings = fallbackUpdated;
  (globalThis as any).__ghazal_location_settings = memoryLocationSettings;

  let updated = fallbackUpdated;
  try {
    updated = await prisma.storeLocationSettings.upsert({
      where: { id: 'default' },
      update: fallbackUpdated,
      create: fallbackUpdated
    });

    await prisma.auditLog.create({
      data: {
        employeeId: session.employeeId,
        action: 'UPDATE_STORE_LOCATION_SETTINGS',
        entityType: 'StoreLocationSettings',
        entityId: 'default',
        details: JSON.stringify(parsed)
      }
    });
  } catch (err) {
    console.warn('Prisma updateStoreLocationSettings db write skipped, saved in memory');
  }

  revalidatePath('/', 'layout');
  return { success: true, settings: updated };
}

export interface PromoBannerSettings {
  badgeTitle: string;
  yearLabel: string;
  title: string;
  subtitle: string;
  linkUrl: string;
  buttonText: string;
  isActive: boolean;
}

let memoryPromoBanner: PromoBannerSettings = {
  badgeTitle: 'GHAZAL EDIT',
  yearLabel: '2026 COLLECTION',
  title: 'تشكيلة التألق والجمال',
  subtitle: 'أحدث مستحضرات المكياج والعناية والعطور المختارة بعناية فائقة لأجلكِ في الأردن.',
  linkUrl: '/shop',
  buttonText: 'تسوقي التشكيلة',
  isActive: true
};

export async function getPromoBannerSettings(): Promise<PromoBannerSettings> {
  try {
    const record = await prisma.siteSettings.findUnique({
      where: { key: 'homepage_promo_banner_2026' }
    });
    if (record) {
      return JSON.parse(record.value);
    }
  } catch {}
  return memoryPromoBanner;
}

export async function updatePromoBannerSettings(data: PromoBannerSettings) {
  await requirePermission('manage:settings');
  memoryPromoBanner = data;
  try {
    await prisma.siteSettings.upsert({
      where: { key: 'homepage_promo_banner_2026' },
      create: { key: 'homepage_promo_banner_2026', value: JSON.stringify(data) },
      update: { value: JSON.stringify(data) }
    });
  } catch {}
  revalidatePath('/', 'layout');
  revalidatePath('/[locale]', 'page');
  return { success: true, settings: data };
}
