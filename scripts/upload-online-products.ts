import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import { prisma } from '../src/lib/db';

const workspaceRoot = fileURLToPath(new URL('../../', import.meta.url));
const workbookPath = path.join(workspaceRoot, 'ghazal.xlsx');
const readyDir = path.join(workspaceRoot, 'جاهز للرفع');
const bucket = 'product-uploads';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY;
if (!supabaseUrl || !supabaseKey) throw new Error('Supabase admin environment is not configured');
const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

function basename(value: unknown) {
  if (!value) return null;
  const normalized = String(value).replace(/\\/g, '/').split('?')[0];
  return path.posix.basename(normalized);
}

function inferScreenHunter(description: string, variantRow: Record<string, unknown>, allVariantRows: Record<string, unknown>[]) {
  const label = String(variantRow['اسم الخيار بالعربية'] ?? '').trim();
  if (!label) return null;
  const start = description.indexOf(label);
  if (start < 0) return null;
  const nextPositions = allVariantRows
    .map((candidate) => String(candidate['اسم الخيار بالعربية'] ?? '').trim())
    .filter((candidate) => candidate && candidate !== label)
    .map((candidate) => description.indexOf(candidate, start + label.length))
    .filter((position) => position > start);
  const end = nextPositions.length > 0 ? Math.min(...nextPositions) : description.length;
  const segment = description.slice(start, end);
  const match = segment.match(/ScreenHunter\s*0*(\d+)/i);
  return match ? `ScreenHunter ${match[1].padStart(2, '0')}.webp` : null;
}

async function ensureBucket() {
  const { data, error } = await supabase.storage.listBuckets();
  if (error) throw error;
  if (!data?.some((b) => b.name === bucket)) {
    const created = await supabase.storage.createBucket(bucket, { public: true, fileSizeLimit: 10 * 1024 * 1024 });
    if (created.error) throw created.error;
  }
}

async function main() {
  await ensureBucket();
  const workbook = XLSX.readFile(workbookPath, { cellDates: true });
  const products = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets.Products, { defval: null });
  const variants = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets.Variants, { defval: null });
  const readyFiles = new Set(await fs.readdir(readyDir));
  const uploaded = new Map<string, string>();
  const uploadedSources = new Map<string, string>();
  let uploadedFiles = 0;

  const onlineSkus = products
    .map((row) => String(row['المعرف المرجعي'] ?? '').trim())
    .filter(Boolean);
  if (onlineSkus.length === 0) throw new Error('لم يتم العثور على معرفات منتجات في Excel');

  // Re-assert the storefront boundary from the source of truth before linking media.
  await prisma.product.updateMany({
    where: { sku: { in: onlineSkus } },
    data: { channel: 'ONLINE', isVisible: true },
  });
  await prisma.product.updateMany({
    where: { channel: 'POS', sku: { notIn: onlineSkus } },
    data: { isVisible: false },
  });

  // Upload the prepared image set once. Product records are linked only below for ONLINE products.
  for (const filename of [...readyFiles].sort()) {
    const fullPath = path.join(readyDir, filename);
    const stat = await fs.stat(fullPath);
    if (!stat.isFile()) continue;
    const storagePath = `products/online/${filename}`;
    const content = await fs.readFile(fullPath);
    const result = await supabase.storage.from(bucket).upload(storagePath, content, {
      contentType: 'image/webp',
      upsert: true,
      cacheControl: '31536000',
    });
    if (result.error) throw new Error(`فشل رفع ${filename}: ${result.error.message}`);
    const publicUrl = supabase.storage.from(bucket).getPublicUrl(storagePath).data.publicUrl;
    uploaded.set(filename, publicUrl);
    uploadedFiles++;
  }

  async function resolveImage(value: unknown) {
    if (!value) return null;
    const source = String(value).trim();
    const localName = basename(source);
    if (localName && uploaded.has(localName)) return uploaded.get(localName)!;
    if (!/^https?:\/\//i.test(source)) return null;
    if (uploadedSources.has(source)) return uploadedSources.get(source)!;

    const response = await fetch(source);
    if (!response.ok) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    const hash = createHash('sha1').update(source).digest('hex').slice(0, 12);
    const safeName = localName || `source-${hash}.webp`;
    const storagePath = `products/online/legacy/${hash}-${safeName}`;
    const result = await supabase.storage.from(bucket).upload(storagePath, buffer, {
      contentType: response.headers.get('content-type') || 'image/webp',
      upsert: true,
      cacheControl: '31536000',
    });
    if (result.error) throw new Error(`فشل رفع الصورة المرجعية ${safeName}: ${result.error.message}`);
    const publicUrl = supabase.storage.from(bucket).getPublicUrl(storagePath).data.publicUrl;
    uploadedSources.set(source, publicUrl);
    uploadedFiles++;
    return publicUrl;
  }

  const onlineProducts = await prisma.product.findMany({
    where: { channel: 'ONLINE', isVisible: true },
    select: { id: true, sku: true, nameAr: true },
  });
  const onlineBySku = new Map(onlineProducts.map((p) => [p.sku, p]));
  const variantsByProduct = new Map<string, Record<string, unknown>[]>();
  for (const row of variants) {
    const ref = String(row['المعرف المرجعي للمنتج'] ?? '').trim();
    if (!ref) continue;
    const list = variantsByProduct.get(ref) ?? [];
    list.push(row);
    variantsByProduct.set(ref, list);
  }

  let linkedProducts = 0;
  let linkedVariants = 0;
  let linkedImages = 0;
  for (const row of products) {
    const sku = String(row['المعرف المرجعي'] ?? '').trim();
    const product = onlineBySku.get(sku);
    if (!product) continue;

    const candidateUrls: string[] = [];
    for (const value of [row['الصورة الرئيسية'], row['الصور الإضافية']]) {
      const url = await resolveImage(value);
      if (url) candidateUrls.push(url);
    }
    const variantRows = variantsByProduct.get(sku) ?? [];
    const description = String(row['الوصف التفصيلي'] ?? '');
    for (const variantRow of variantRows) {
      const filename = basename(variantRow['صورة الخيار']) || inferScreenHunter(description, variantRow, variantRows);
      const variantSku = String(variantRow['SKU'] ?? '').trim();
      const publicUrl = (filename && uploaded.get(filename)) || await resolveImage(variantRow['صورة الخيار']);
      if (!publicUrl || !variantSku) continue;
      const updated = await prisma.productVariant.updateMany({
        where: { productId: product.id, sku: variantSku },
        data: { imageUrl: publicUrl, isActive: true },
      });
      if (updated.count > 0) linkedVariants += updated.count;
      if (!candidateUrls.includes(publicUrl)) candidateUrls.push(publicUrl);
    }

    const urls = [...new Set(candidateUrls)];
    if (urls.length > 0) {
      await prisma.productImage.deleteMany({ where: { productId: product.id } });
      for (let index = 0; index < urls.length; index++) {
        await prisma.productImage.create({
          data: {
            productId: product.id,
            url: urls[index],
            alt: product.nameAr,
            isMain: index === 0,
            order: index,
          },
        });
        linkedImages++;
      }
      linkedProducts++;
    }
  }

  // Defensive storefront/POS boundary check.
  const posVisible = await prisma.product.count({ where: { channel: 'POS', isVisible: true } });
  const online = await prisma.product.count({ where: { channel: 'ONLINE', isVisible: true } });
  console.log(JSON.stringify({ uploadedFiles, online, linkedProducts, linkedVariants, linkedImages, posVisible }, null, 2));
  if (posVisible !== 0) throw new Error(`POS products visible in storefront flag: ${posVisible}`);
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
