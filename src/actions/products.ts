'use server';

import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/dal';
import { uploadMedia } from '@/actions/upload';
import { revalidatePath } from 'next/cache';
import { COSMETICS_CATALOG } from '@/lib/cosmetics-catalog';
import { getSynchronizedCategories } from '@/actions/categories';

// In-memory fallback and quick lookup cache for product custom badges
const inMemoryProductBadges: Record<string, string> = {};

export async function getProductCustomBadges(): Promise<Record<string, string>> {
  try {
    const setting = await prisma.siteSettings.findUnique({
      where: { key: 'product_custom_badges' }
    });
    if (setting?.value) {
      const parsed = JSON.parse(setting.value);
      return { ...inMemoryProductBadges, ...parsed };
    }
  } catch {}
  return inMemoryProductBadges;
}

export async function setProductCustomBadge(productIdOrSlug: string, badge: string | null) {
  await requirePermission('manage:products');
  const cleanBadge = badge?.trim() || '';
  if (cleanBadge) {
    inMemoryProductBadges[productIdOrSlug] = cleanBadge;
  } else {
    delete inMemoryProductBadges[productIdOrSlug];
  }

  // Update in COSMETICS_CATALOG
  const catalogMatches = COSMETICS_CATALOG.filter(p => p.id === productIdOrSlug || p.slug === productIdOrSlug);
  for (const match of catalogMatches) {
    match.tag = cleanBadge || undefined;
  }

  // Persist to siteSettings
  try {
    let currentMap: Record<string, string> = {};
    const setting = await prisma.siteSettings.findUnique({
      where: { key: 'product_custom_badges' }
    });
    if (setting?.value) {
      try { currentMap = JSON.parse(setting.value); } catch {}
    }
    if (cleanBadge) {
      currentMap[productIdOrSlug] = cleanBadge;
    } else {
      delete currentMap[productIdOrSlug];
    }
    await prisma.siteSettings.upsert({
      where: { key: 'product_custom_badges' },
      update: { value: JSON.stringify(currentMap) },
      create: { key: 'product_custom_badges', value: JSON.stringify(currentMap) }
    });
  } catch {}

  // Also update in Prisma Product reviewReasons if table exists
  try {
    await prisma.product.updateMany({
      where: {
        OR: [
          { id: productIdOrSlug },
          { slug: productIdOrSlug }
        ]
      },
      data: {
        reviewReasons: cleanBadge ? `TAG:${cleanBadge}` : null
      }
    });
  } catch {}
}

export async function updateProductBadgeAction(productIdOrSlug: string, badge: string | null) {
  await requirePermission('manage:products');
  await setProductCustomBadge(productIdOrSlug, badge);
  revalidatePath('/admin/products');
  revalidatePath('/[locale]/products/[slug]', 'page');
  revalidatePath('/[locale]/shop', 'page');
  revalidatePath('/[locale]', 'page');
  return { success: true, badge: badge?.trim() || null };
}

async function saveUploadedImage(imageFile: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', imageFile);
  const result = await uploadMedia(formData);
  if (!result.success || !result.url) {
    throw new Error(result.error || 'فشل رفع الصورة');
  }
  return result.url;
}

export async function createProduct(formData: FormData) {
  await requirePermission('manage:products');

  try {
    const nameAr = formData.get('nameAr') as string;
    const nameEn = formData.get('nameEn') as string;
    const sku = (formData.get('sku') as string) || `GHZ-${Math.floor(1000 + Math.random() * 9000)}`;
    const shortDescription = (formData.get('shortDescription') as string) || null;
    const longDescription = (formData.get('longDescription') as string) || null;
    
    // Dedicated channel parameter: 'ONLINE' | 'POS' | 'SHARED'
    const rawChannel = (formData.get('channel') as string || formData.get('targetChannel') as string || '').toUpperCase().trim();
    const channel: 'ONLINE' | 'POS' | 'SHARED' = 
      (rawChannel === 'ONLINE' || rawChannel === 'STOREFRONT') ? 'ONLINE' :
      (rawChannel === 'POS') ? 'POS' : 'SHARED';

    const isVisible = channel !== 'POS' && formData.get('isVisible') !== 'false';
    const isFeatured = formData.get('isFeatured') === 'true';
    const tag = (formData.get('tag') as string)?.trim() || null;
    const categoryId = formData.get('categoryId') as string;
    const brandId = (formData.get('brandId') as string) || null;
    const genderId = (formData.get('genderId') as string) || null;
    const seasonId = (formData.get('seasonId') as string) || null;
    const familyId = (formData.get('familyId') as string) || null;
    const slug = sku.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now();

    if (!categoryId) throw new Error('التصنيف مطلوب');

    let variants: any[] = [];
    const variantsJson = formData.get('variants') as string;
    if (variantsJson) {
      try { variants = JSON.parse(variantsJson); } catch {}
    }
    if (variants.length === 0) {
      variants = [{ size: 'Standard', sku: `${sku}-STD`, price: 15000, isActive: true }];
    }

    // Handle image
    let imageUrl = '';
    const imageFile = formData.get('image') as File;
    if (imageFile && imageFile.size > 0) {
      imageUrl = await saveUploadedImage(imageFile);
    }

    let productId = `prod-${Date.now()}`;
    try {
      const product = await prisma.product.create({
        data: {
          slug,
          nameAr,
          nameEn,
          sku,
          shortDescription,
          longDescription,
          channel,
          isVisible,
          isFeatured,
          reviewReasons: tag ? `TAG:${tag}` : null,
          categoryId,
          brandId: null,
          genderId,
          seasonId,
          familyId,
          stockLiters: 0,
          variants: {
            create: variants.map((v: any) => ({
              size: v.size || 'Standard',
              shade: v.shade || null,
              colorName: v.colorName || null,
              colorHex: v.colorHex || null,
              imageUrl: v.imageUrl || null,
              barcode: v.barcode || null,
              sku: v.sku || `${sku}-${Math.floor(100 + Math.random() * 900)}`,
              price: Number(v.price),
              costPrice: v.costPrice ? Number(v.costPrice) : Math.round(Number(v.price) * 0.55),
              compareAt: v.compareAt ? Number(v.compareAt) : null,
              isActive: v.isActive ?? true,
              usesGlobalPricing: v.usesGlobalPricing ?? true,
            }))
          },
          ...(imageUrl ? {
            images: {
              create: [{ url: imageUrl, isMain: true, alt: nameAr }]
            }
          } : {})
        }
      });
      productId = product.id;
    } catch (e) {
      console.warn('Prisma createProduct offline fallback');
    }

    const allCats = await getSynchronizedCategories();
    const matchedCat = allCats.find(c => c.id === categoryId);

    // In-memory catalog update for instant POS & storefront sync
    if (tag) {
      await setProductCustomBadge(productId, tag);
      await setProductCustomBadge(slug, tag);
    }
    const firstVariantCompareAt = variants[0]?.compareAt ? Number(variants[0].compareAt) : undefined;
    (COSMETICS_CATALOG as any[]).unshift({
      id: productId,
      slug: productId,
      sku,
      barcode: sku,
      nameAr,
      nameEn: nameEn || nameAr,
      brandName: 'غزل',
      categoryId: categoryId || 'cat-makeup',
      categorySlug: matchedCat?.slug || 'makeup',
      categoryName: matchedCat?.name || 'المكياج ومستحضرات التجميل',
      channel,
      isPOSOnly: channel === 'POS',
      priceFils: variants[0]?.price ? Number(variants[0].price) : 1000,
      originalPriceFils: firstVariantCompareAt && firstVariantCompareAt > Number(variants[0]?.price) ? firstVariantCompareAt : undefined,
      rating: 5,
      reviewsCount: 1,
      tag: tag || undefined,
      isFeatured: isFeatured || Boolean(firstVariantCompareAt && firstVariantCompareAt > Number(variants[0]?.price)),
      shortDescription: shortDescription || '',
      fullDescription: longDescription || shortDescription || '',
      howToUse: '',
      features: [],
      images: imageUrl ? [{ id: `img-${Date.now()}`, url: imageUrl, isMain: true }] : [],
      variants: variants.map((v: any, idx: number) => ({
        id: `v-${productId}-${idx}`,
        size: v.size || '1 قطعة',
        shade: v.shade || '',
        barcode: v.sku || sku,
        sku: v.sku || sku,
        price: Number(v.price),
        costPrice: v.costPrice ? Number(v.costPrice) : Math.round(Number(v.price) * 0.55),
        stock: 50
      }))
    });

    revalidatePath('/admin/products');
    revalidatePath('/pos/cashier');
    revalidatePath('/admin/settlements');
    revalidatePath('/[locale]', 'layout');

    return { success: true, productId };
  } catch (error: any) {
    console.error('Error creating product:', error);
    if (error.code === 'P2002' && error.meta?.target?.includes('sku')) {
      return { success: false, error: 'رقم المنتج (SKU) مستخدم مسبقاً. يرجى المحاولة مرة أخرى للحصول على رقم جديد.' };
    }
    return { success: false, error: error.message };
  }
}

export async function updateProduct(productId: string, formData: FormData) {
  await requirePermission('manage:products');

  try {
    const nameAr = formData.get('nameAr') as string;
    const nameEn = formData.get('nameEn') as string;
    const sku = formData.get('sku') as string;
    const shortDescription = (formData.get('shortDescription') as string) || null;
    const longDescription = (formData.get('longDescription') as string) || null;
    
    // Dedicated channel parameter: 'ONLINE' | 'POS' | 'SHARED'
    const rawChannel = (formData.get('channel') as string || formData.get('targetChannel') as string || '').toUpperCase().trim();
    const channel: 'ONLINE' | 'POS' | 'SHARED' = 
      (rawChannel === 'ONLINE' || rawChannel === 'STOREFRONT') ? 'ONLINE' :
      (rawChannel === 'POS') ? 'POS' : 'SHARED';

    const isVisible = channel !== 'POS' && formData.get('isVisible') !== 'false';
    const isFeatured = formData.get('isFeatured') === 'true';
    const tag = (formData.get('tag') as string)?.trim() || null;
    const categoryId = formData.get('categoryId') as string;
    const brandId = (formData.get('brandId') as string) || null;
    const genderId = (formData.get('genderId') as string) || null;
    const seasonId = (formData.get('seasonId') as string) || null;
    const familyId = (formData.get('familyId') as string) || null;

    if (!categoryId) throw new Error('التصنيف مطلوب');

    let variants: any[] = [];
    const variantsJson = formData.get('variants') as string;
    if (variantsJson) {
      try { variants = JSON.parse(variantsJson); } catch {}
    }

    // Handle accords
    let accords: Array<{ accordId: string; value: number; order: number }> = [];
    const accordsJson = formData.get('accords') as string;
    if (accordsJson) {
      try {
        const parsed = JSON.parse(accordsJson);
        accords = parsed.map((a: any, idx: number) => ({
          accordId: a.accordId,
          value: Number(a.value),
          order: idx,
        }));
      } catch {}
    }

    // Handle similar products
    let similarProductIds: string[] = [];
    const similarJson = formData.get('similarProductIds') as string;
    if (similarJson) {
      try { similarProductIds = JSON.parse(similarJson); } catch {}
    }

    // Handle image
    let imageUrl = '';
    const imageFile = formData.get('image') as File;
    if (imageFile && imageFile.size > 0) {
      imageUrl = await saveUploadedImage(imageFile);
    }

    try {
      // Upsert product
      await prisma.product.update({
        where: { id: productId },
        data: {
          nameAr,
          nameEn,
          sku,
          shortDescription,
          longDescription,
          channel,
          isVisible,
          isFeatured,
          reviewReasons: tag ? `TAG:${tag}` : null,
          categoryId,
          brandId: null,
          genderId,
          seasonId,
          familyId,
        }
      });

      // Safe variant update/reconciliation: avoid cascade FK deletions on SaleItem
      if (variants.length > 0) {
        const existingVariants = await prisma.productVariant.findMany({
          where: { productId },
          include: { saleItems: { select: { id: true }, take: 1 } },
          orderBy: { createdAt: 'asc' }
        });

        const updatedVariantIds = new Set<string>();

        for (let idx = 0; idx < variants.length; idx++) {
          const v = variants[idx];
          const existing = (v.id ? existingVariants.find(ev => ev.id === v.id) : null) || existingVariants[idx];

          const variantData = {
            size: v.size || 'Standard',
            shade: v.shade || null,
            colorName: v.colorName || null,
            colorHex: v.colorHex || null,
            imageUrl: v.imageUrl || null,
            barcode: v.barcode || null,
            sku: v.sku || (existing?.sku || `${sku}-${(idx + 1).toString().padStart(2, '0')}`),
            price: Number(v.price),
            costPrice: v.costPrice ? Number(v.costPrice) : Math.round(Number(v.price) * 0.55),
            compareAt: v.compareAt ? Number(v.compareAt) : null,
            isActive: v.isActive ?? true,
            usesGlobalPricing: v.usesGlobalPricing ?? true,
          };

          if (existing) {
            await prisma.productVariant.update({
              where: { id: existing.id },
              data: variantData
            });
            updatedVariantIds.add(existing.id);
          } else {
            const created = await prisma.productVariant.create({
              data: {
                productId,
                ...variantData
              }
            });
            updatedVariantIds.add(created.id);
          }
        }

        // Handle leftover variants (e.g. when converted from multiple variants to single simple variant)
        const leftoverVariants = existingVariants.filter(ev => !updatedVariantIds.has(ev.id));
        for (const leftover of leftoverVariants) {
          if (leftover.saleItems.length > 0) {
            // Cannot delete because it is referenced in sale receipts: safely deactivate it
            await prisma.productVariant.update({
              where: { id: leftover.id },
              data: { isActive: false, shade: null, colorName: null }
            });
          } else {
            // Safe to delete unused variant
            try {
              await prisma.productVariant.delete({ where: { id: leftover.id } });
            } catch {
              await prisma.productVariant.update({
                where: { id: leftover.id },
                data: { isActive: false }
              });
            }
          }
        }
      }

      // Update accords: delete all and re-create
      await prisma.productAccord.deleteMany({ where: { productId } });
      if (accords.length > 0) {
        await prisma.productAccord.createMany({
          data: accords.map((a) => ({
            productId,
            accordId: a.accordId,
            value: a.value,
            order: a.order,
          }))
        });
      }

      // Update similar products
      await prisma.productSimilar.deleteMany({ where: { productId } });
      if (similarProductIds.length > 0) {
        // Filter out self-references
        const validIds = similarProductIds.filter(id => id !== productId);
        if (validIds.length > 0) {
          await prisma.productSimilar.createMany({
            data: validIds.map((similarId, idx) => ({
              productId,
              similarId,
              order: idx,
            }))
          });
        }
      }

      // Update image if provided
      if (imageUrl) {
        await prisma.productImage.deleteMany({ where: { productId } });
        await prisma.productImage.create({
          data: { productId, url: imageUrl, isMain: true, alt: nameAr }
        });
      }
    } catch (e) {
      console.warn('Prisma updateProduct offline fallback');
    }

    // Update in-memory catalog for immediate POS & storefront synchronization
    const demo = COSMETICS_CATALOG.find(p => p.id === productId || p.slug === productId);
    if (demo) {
      demo.categoryId = categoryId;
      const allCats = await getSynchronizedCategories();
      const matchedCat = allCats.find(c => c.id === categoryId);
      if (matchedCat) {
        demo.categoryName = matchedCat.name;
        demo.categorySlug = matchedCat.slug || matchedCat.id.replace('cat-', '');
      }
      demo.tag = tag || undefined;
      demo.nameAr = nameAr;
      demo.nameEn = nameEn || nameAr;
      demo.sku = sku;
      if (shortDescription) demo.shortDescription = shortDescription;
      if (imageUrl) demo.images = [{ id: `img-${Date.now()}`, url: imageUrl, isMain: true }];
      if (variants && variants.length > 0) {
        demo.variants = variants.map((v: any, idx: number) => ({
          id: demo.variants[idx]?.id || `v-${productId}-${idx}`,
          size: v.size || '1 قطعة',
          shade: v.shade || '',
          barcode: v.sku || sku,
          sku: v.sku || sku,
          price: Number(v.price),
          costPrice: v.costPrice ? Number(v.costPrice) : Math.round(Number(v.price) * 0.55),
          stock: demo.variants[idx]?.stock ?? 50
        }));
        demo.priceFils = Number(variants[0].price);
        const firstVariantCompareAt = variants[0].compareAt ? Number(variants[0].compareAt) : undefined;
        if (firstVariantCompareAt && firstVariantCompareAt > Number(variants[0].price)) {
          demo.originalPriceFils = firstVariantCompareAt;
          demo.isFeatured = true;
        } else if (variants[0].compareAt === null || variants[0].compareAt === 0) {
          demo.originalPriceFils = undefined;
        }
      }
    }

    await setProductCustomBadge(productId, tag);
    if (demo?.slug) {
      await setProductCustomBadge(demo.slug, tag);
    }

    revalidatePath('/admin/products');
    revalidatePath(`/admin/products/${productId}`);
    revalidatePath(`/admin/products/${productId}/edit`);
    revalidatePath('/pos/cashier');
    revalidatePath('/admin/settlements');
    revalidatePath('/[locale]', 'layout');
    revalidatePath('/[locale]/shop', 'page');
    revalidatePath('/[locale]/products/[slug]', 'page');

    return { success: true };
  } catch (error: any) {
    console.error('Error updating product:', error);
    return { success: false, error: error.message };
  }
}

export async function getProductsByIds(ids: string[]) {
  if (!ids || ids.length === 0) return [];
  try {
    const products = await prisma.product.findMany({
      where: { id: { in: ids }, isVisible: true },
      include: {
        variants: { orderBy: { size: 'asc' } },
        images: { orderBy: { order: 'asc' } },
        category: true,
      }
    });
    return products;
  } catch (error) {
    console.error('Error fetching products by ids:', error);
    return [];
  }
}

export async function deleteProduct(productId: string) {
  try {
    await requirePermission('manage:products');
    try {
      await prisma.$transaction([
        prisma.productVariant.deleteMany({ where: { productId } }),
        prisma.productImage.deleteMany({ where: { productId } }),
        prisma.productAccord.deleteMany({ where: { productId } }),
        prisma.productSimilar.deleteMany({ where: { productId } }),
        prisma.product.delete({ where: { id: productId } })
      ]);
    } catch (dbErr) {
      console.warn('Prisma delete fallback for deleteProduct:', dbErr);
    }

    // In-memory catalog update
    const idx = COSMETICS_CATALOG.findIndex(p => p.id === productId || p.slug === productId);
    if (idx !== -1) {
      COSMETICS_CATALOG.splice(idx, 1);
    }

    revalidatePath('/admin/products');
    revalidatePath('/[locale]', 'layout');
    revalidatePath('/pos/cashier');
    revalidatePath('/admin/settlements');
    return { success: true };
  } catch (error: any) {
    console.error('Error deleting product:', error);
    return { success: false, error: error.message };
  }
}

export async function toggleProductStoreVisibility(productId: string, isVisible: boolean) {
  try {
    await requirePermission('manage:products');
    try {
      await prisma.product.update({
        where: { id: productId },
        data: { isVisible }
      });
    } catch (dbErr) {
      console.warn('Prisma update fallback for toggleProductStoreVisibility:', dbErr);
    }

    const demo = COSMETICS_CATALOG.find(p => p.id === productId || p.slug === productId);
    if (demo) {
      (demo as any).isVisible = isVisible;
    }

    revalidatePath('/admin/products');
    revalidatePath('/[locale]', 'layout');
    revalidatePath('/pos/cashier');
    revalidatePath('/admin/settlements');
    return { success: true, isVisible };
  } catch (error: any) {
    console.error('Error toggling store visibility:', error);
    return { success: false, error: error.message };
  }
}

export async function toggleProductPOSVisibility(productId: string, isPOSAvailable: boolean) {
  try {
    await requirePermission('manage:products');
    try {
      await prisma.productVariant.updateMany({
        where: { productId },
        data: { isActive: isPOSAvailable }
      });
    } catch (dbErr) {
      console.warn('Prisma update fallback for toggleProductPOSVisibility:', dbErr);
    }

    const demo = COSMETICS_CATALOG.find(p => p.id === productId || p.slug === productId);
    if (demo) {
      (demo as any).isPOSAvailable = isPOSAvailable;
      demo.variants.forEach(v => {
        (v as any).isActive = isPOSAvailable;
      });
    }

    revalidatePath('/admin/products');
    revalidatePath('/pos/cashier');
    revalidatePath('/admin/settlements');
    return { success: true, isPOSAvailable };
  } catch (error: any) {
    console.error('Error toggling POS visibility:', error);
    return { success: false, error: error.message };
  }
}

/**
 * تحديث فوري لقناة عرض وبيع المنتج:
 * ONLINE: متجر إلكتروني فقط
 * POS: كاشير المحل فقط
 * SHARED: منتج مشترك بين المتجر والكاشير
 */
export async function updateProductChannelAction(productId: string, channel: 'ONLINE' | 'POS' | 'SHARED') {
  try {
    await requirePermission('manage:products');
    const isVisible = channel !== 'POS';
    const isPOSAvailable = channel !== 'ONLINE';

    // 1. Update in Prisma PostgreSQL
    try {
      await prisma.product.update({
        where: { id: productId },
        data: {
          channel,
          isVisible
        }
      });
      await prisma.productVariant.updateMany({
        where: { productId },
        data: { isActive: isPOSAvailable }
      });
    } catch (dbErr) {
      console.warn('Prisma update fallback for updateProductChannelAction:', dbErr);
    }

    // 2. Update in-memory cosmetics catalog
    const demo = COSMETICS_CATALOG.find(p => p.id === productId || p.slug === productId);
    if (demo) {
      demo.channel = channel;
      demo.isPOSOnly = channel === 'POS';
      (demo as any).isPOSAvailable = isPOSAvailable;
      demo.variants.forEach(v => {
        (v as any).isActive = isPOSAvailable;
      });
    }

    revalidatePath('/admin/products');
    revalidatePath('/pos/cashier');
    revalidatePath('/[locale]/shop', 'page');
    revalidatePath('/[locale]', 'layout');
    revalidatePath('/admin/settlements');

    return { success: true, channel };
  } catch (error: any) {
    console.error('Error updating product channel:', error);
    return { success: false, error: error.message };
  }
}

/**
 * البحث عن منتج بواسطة الباركود أو الـ SKU للتعديل السريع عبر كاميرا الهاتف
 */
export async function findProductByBarcodeOrSkuAction(code: string) {
  try {
    const clean = code.trim();
    if (!clean) return { success: false, error: 'الباركود فارغ' };

    // Search in DB by variant barcode, variant SKU, or product SKU
    const product = await prisma.product.findFirst({
      where: {
        OR: [
          { sku: { equals: clean, mode: 'insensitive' } },
          { id: clean },
          { variants: { some: { barcode: clean } } },
          { variants: { some: { barcode: { equals: clean, mode: 'insensitive' } } } },
          { variants: { some: { sku: { equals: clean, mode: 'insensitive' } } } },
          { variants: { some: { barcode: { contains: clean, mode: 'insensitive' } } } }
        ]
      },
      select: {
        id: true,
        nameAr: true,
        nameEn: true,
        sku: true,
        channel: true,
        images: {
          select: { url: true, isMain: true },
          take: 2
        },
        variants: {
          select: {
            id: true,
            barcode: true,
            sku: true,
            price: true,
            costPrice: true,
            size: true,
            shade: true,
            imageUrl: true
          }
        }
      }
    });

    if (product) {
      const mainImage = (product as any).images?.find((img: any) => img.isMain)?.url || (product as any).images?.[0]?.url || (product as any).variants?.[0]?.imageUrl || null;
      return { 
        success: true, 
        product: {
          ...product,
          imageUrl: mainImage
        }
      };
    }

    return { success: false, notFound: true };
  } catch (error: any) {
    console.error('findProductByBarcodeOrSkuAction error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * جلب قائمة سريعة بالمنتجات المتاحة لإضافتها لفواتير وطلبات الزبائن
 */
export async function getAvailableProductsForOrderEditor() {
  try {
    const products = await prisma.product.findMany({
      where: { isVisible: true },
      take: 100,
      select: {
        id: true,
        nameAr: true,
        nameEn: true,
        sku: true,
        images: {
          select: { url: true, isMain: true },
          take: 2
        },
        variants: {
          select: { id: true, size: true, price: true, barcode: true, sku: true, imageUrl: true },
          take: 5
        }
      },
      orderBy: { nameAr: 'asc' }
    });

    return {
      success: true,
      products: products.map((p) => ({
        id: p.id,
        nameAr: p.nameAr,
        name: p.nameEn || p.nameAr,
        sku: p.sku,
        imageUrl: (p as any).variants?.[0]?.imageUrl || (p as any).images?.find((i: any) => i.isMain)?.url || (p as any).images?.[0]?.url || null,
        variants: p.variants.map((v) => ({
          id: v.id,
          size: v.size,
          price: v.price,
          barcode: v.barcode,
          sku: v.sku,
          imageUrl: v.imageUrl
        }))
      }))
    };
  } catch (err: any) {
    console.warn('getAvailableProductsForOrderEditor error:', err);
    return { success: false, products: [] };
  }
}


