import XLSX from 'xlsx';
import { fileURLToPath } from 'node:url';
import { prisma } from '../src/lib/db';

const workbook = XLSX.readFile(fileURLToPath(new URL('../../ghazal.xlsx', import.meta.url)));
const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets.Products, { defval: null });

const requestedCategories = [
  { slug: 'fragrances', name: 'العطور', sortOrder: 1 },
  { slug: 'haircare', name: 'العناية بالشعر', sortOrder: 2 },
  { slug: 'skincare', name: 'العناية بالبشرة', sortOrder: 3 },
  { slug: 'face-care', name: 'العناية بالوجه', sortOrder: 4 },
  { slug: 'deodorants', name: 'مزيلات عرق', sortOrder: 5 },
  { slug: 'makeup', name: 'المكياج', sortOrder: 6 },
  { slug: 'accessories', name: 'الإكسسوارات', sortOrder: 7 },
  { slug: 'beauty-tools', name: 'أدوات التجميل', sortOrder: 8 },
  { slug: 'offers-gifts', name: 'هدايا وعروض', sortOrder: 9 },
] as const;

function text(...values: unknown[]) {
  return values.filter(Boolean).map((value) => String(value).toLowerCase()).join(' ');
}

function chooseCategory(row: Record<string, unknown>) {
  const main = String(row['التصنيف الرئيسي'] ?? '').trim();
  const sub = String(row['التصنيف الفرعي'] ?? '').trim();
  const name = String(row['اسم المنتج بالعربية'] ?? '').trim();
  const haystack = text(main, sub, name, row['الوصف المختصر'], row['الوصف التفصيلي']);

  if (/هدايا|بكج|باكج|مجموعة|set|gift/.test(haystack)) return 'offers-gifts';
  if (/مزيل|رول|roll.?on|deodorant|antiperspirant/.test(haystack)) return 'deodorants';
  if (/أدوات|فرش|إسفنجة|اسفنجة|brush|tool/.test(haystack)) return 'beauty-tools';
  if (/إكسسوار|اكسسوار|محفظ|شال|accessor/.test(haystack)) return 'accessories';
  if (/مكياج|مناكير|أظافر|رموش|حواجب|lipstick|mascara|foundation|makeup/.test(haystack)) return 'makeup';
  if (/عطر|عطور|بخور|مسك|سبلاش|body splash|perfume|fragrance/.test(haystack) || main.includes('العطور')) return 'fragrances';
  if (/شعر|شامبو|بلسم|سيروم شعر|hair|shampoo|conditioner/.test(haystack) || main.includes('الشعر')) return 'haircare';
  if (/وجه|فك|facial|face|غسول وجه|ماسك الوجه|كريم ترطيب الوجه/.test(haystack)) return 'face-care';
  if (/بشرة|جسم|لوشن|زبدة|مقشر|كريم|جل استحمام|body|skin|lotion|scrub|cream/.test(haystack)) return 'skincare';
  return 'skincare';
}

async function main() {
  const categories = new Map<string, { id: string; slug: string }>();
  for (const config of requestedCategories) {
    const category = await prisma.category.upsert({
      where: { slug: config.slug },
      update: { name: config.name, channel: 'ONLINE', isActive: true, sortOrder: config.sortOrder },
      create: { slug: config.slug, name: config.name, channel: 'ONLINE', isActive: true, sortOrder: config.sortOrder },
      select: { id: true, slug: true },
    });
    categories.set(config.slug, category);
  }

  const onlineProducts = await prisma.product.findMany({
    where: { channel: 'ONLINE', isVisible: true },
    select: { id: true, sku: true },
  });
  const bySku = new Map(rows.map((row) => [String(row['المعرف المرجعي'] ?? '').trim(), row]));
  const counts: Record<string, number> = {};
  const unclassified: string[] = [];

  for (const product of onlineProducts) {
    const row = bySku.get(product.sku);
    const slug = row ? chooseCategory(row) : 'skincare';
    const category = categories.get(slug) ?? categories.get('skincare')!;
    await prisma.product.update({ where: { id: product.id }, data: { categoryId: category.id, channel: 'ONLINE', isVisible: true } });
    counts[slug] = (counts[slug] ?? 0) + 1;
    if (!row) unclassified.push(product.sku);
  }

  // Keep legacy POS inventory isolated from storefront sections.
  const legacy = await prisma.category.findUnique({ where: { slug: 'old-cash-category' }, select: { id: true } });
  if (legacy) await prisma.category.update({ where: { id: legacy.id }, data: { channel: 'POS', isActive: true } });

  const verification = await prisma.product.groupBy({
    by: ['categoryId', 'channel'],
    where: { channel: 'ONLINE', isVisible: true },
    _count: { _all: true },
  });
  const result = requestedCategories.map((category) => ({
    ...category,
    count: verification.find((row) => row.categoryId === categories.get(category.slug)?.id)?._count._all ?? 0,
  }));
  console.log(JSON.stringify({ onlineProducts: onlineProducts.length, counts: result, unclassified }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
