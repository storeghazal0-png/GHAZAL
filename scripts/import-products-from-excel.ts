import XLSX from 'xlsx';
import { prisma } from '../src/lib/db';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const workbookPath = `${root}ghazal.xlsx`;
const wb = XLSX.readFile(workbookPath, { cellDates: true });

const productsSheet = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets.Products, { defval: null });
const variantsSheet = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets.Variants, { defval: null });

const categorySlugByName: Record<string, string> = {
  'العناية بالجسم': 'bodycare',
  'العناية بالشعر': 'haircare',
  'العناية بالبشرة': 'skincare',
  'الهدايا والبكجات': 'gifts-sets',
  'العطور والبخور': 'fragrances',
};

function numberValue(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value ?? '').replace(',', '.').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function fils(value: unknown) {
  return Math.max(0, Math.round(numberValue(value) * 1000));
}

function cleanText(value: unknown) {
  if (!value) return null;
  let text = String(value).trim();
  // Public descriptions must never contain internal cost, selling-price, margin, or store-supplier notes.
  text = text
    .replace(/^.*(?:التكلفة|سعر البيع|سعر الشراء|هامش الربح|فرق السعر|المورد|مصدر معلومات المنتج).*$/gim, '')
    .replace(/(?:التكلفة|سعر البيع|سعر الشراء|هامش الربح|فرق السعر)\s*[:：]?\s*[\d.,]+\s*(?:د\.أ|دينار)?/gim, '')
    .replace(/(?:محل غزل للمكياجات|محل غزل للمكياج والتجميل|متجر غزل)/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text || null;
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, '-').replace(/^-|-$/g, '');
}

const variantsByRef = new Map<string, Record<string, unknown>[]>();
for (const row of variantsSheet) {
  const ref = String(row['المعرف المرجعي للمنتج'] ?? '').trim();
  if (!ref) continue;
  const sale = numberValue(row['بيع الخيار د.أ']);
  const cost = numberValue(row['تكلفة الخيار د.أ']);
  if (sale <= 0 || cost <= 0) continue;
  const list = variantsByRef.get(ref) ?? [];
  list.push(row);
  variantsByRef.set(ref, list);
}

async function main() {
  let imported = 0;
  let skipped = 0;
  const importedSkus: string[] = [];

  try {
  for (const row of productsSheet) {
    const sku = String(row['المعرف المرجعي'] ?? '').trim();
    const nameAr = String(row['اسم المنتج بالعربية'] ?? '').trim();
    const nameEn = String(row['اسم المنتج بالإنجليزية'] ?? nameAr).trim() || nameAr;
    const cost = numberValue(row['سعر التكلفة د.أ']);
    const sale = numberValue(row['سعر البيع د.أ']);
    if (!sku || !nameAr || cost <= 0 || sale <= 0) {
      skipped++;
      continue;
    }

    const mainCategory = String(row['التصنيف الرئيسي'] ?? 'العناية بالجسم').trim();
    const categorySlug = categorySlugByName[mainCategory] ?? 'bodycare';
    const category = await prisma.category.findFirst({ where: { slug: categorySlug } });
    if (!category) throw new Error(`الفئة غير موجودة في المشروع: ${mainCategory} (${categorySlug})`);

    const brandName = String(row['العلامة التجارية'] ?? '').trim();
    const brand = brandName
      ? await prisma.brand.upsert({
          where: { slug: slugify(brandName) || `brand-${sku.toLowerCase()}` },
          update: { name: brandName, nameAr: brandName },
          create: { slug: slugify(brandName) || `brand-${sku.toLowerCase()}`, name: brandName, nameAr: brandName },
        })
      : null;

    const product = await prisma.product.upsert({
      where: { sku },
      update: {
        nameAr,
        nameEn,
        shortDescription: cleanText(row['الوصف المختصر']),
        longDescription: cleanText(row['الوصف التفصيلي']),
        categoryId: category.id,
        brandId: brand?.id ?? null,
        channel: 'ONLINE',
        isVisible: true,
        needsReview: false,
        notesStatus: 'VERIFIED',
      },
      create: {
        slug: `online-${slugify(sku)}`,
        nameAr,
        nameEn,
        sku,
        shortDescription: cleanText(row['الوصف المختصر']),
        longDescription: cleanText(row['الوصف التفصيلي']),
        categoryId: category.id,
        brandId: brand?.id ?? null,
        channel: 'ONLINE',
        isVisible: true,
        needsReview: false,
        notesStatus: 'VERIFIED',
        stockStatus: 'UNVERIFIED',
        stockLiters: 0,
      },
    });

    const sourceVariants = variantsByRef.get(sku) ?? [];
    const rowsToImport = sourceVariants.length > 0 ? sourceVariants : [{
      'اسم الخيار بالعربية': null,
      'اسم الخيار بالإنجليزية': null,
      'الحجم': row['الحجم أو الوزن'] || 'Standard',
      'تكلفة الخيار د.أ': cost,
      'بيع الخيار د.أ': sale,
      'SKU': `${sku}-STD`,
      'صورة الخيار': null,
    }];

    await prisma.productVariant.updateMany({ where: { productId: product.id }, data: { isActive: false } });
    for (let index = 0; index < rowsToImport.length; index++) {
      const variant = rowsToImport[index];
      const variantSku = String(variant['SKU'] ?? `${sku}-${String(index + 1).padStart(2, '0')}`).trim();
      await prisma.productVariant.upsert({
        where: { sku: variantSku },
        update: {
          productId: product.id,
          size: String(variant['الحجم'] ?? 'Standard').trim() || 'Standard',
          colorName: String(variant['اسم الخيار بالعربية'] ?? '').trim() || null,
          price: fils(variant['بيع الخيار د.أ']),
          costPrice: fils(variant['تكلفة الخيار د.أ']),
          isActive: true,
          usesGlobalPricing: true,
        },
        create: {
          productId: product.id,
          size: String(variant['الحجم'] ?? 'Standard').trim() || 'Standard',
          colorName: String(variant['اسم الخيار بالعربية'] ?? '').trim() || null,
          sku: variantSku,
          price: fils(variant['بيع الخيار د.أ']),
          costPrice: fils(variant['تكلفة الخيار د.أ']),
          isActive: true,
          usesGlobalPricing: true,
        },
      });
    }

    imported++;
    importedSkus.push(sku);
  }

  const onlineCount = await prisma.product.count({ where: { channel: 'ONLINE', isVisible: true } });
  const leakedVisiblePos = await prisma.product.count({ where: { channel: 'POS', isVisible: true } });
  console.log(JSON.stringify({ imported, skipped, onlineCount, leakedVisiblePos, importedSkus }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
