import 'dotenv/config';
import { prisma } from '../src/lib/db';

type VariantType = 'SHADE' | 'SCENT' | 'SIZE' | 'NONE';

function detectVariantType(variants: Array<{ shade: string | null; colorHex: string | null; colorName: string | null; size: string }>): VariantType {
  if (variants.some((variant) => Boolean(variant.shade || variant.colorHex))) return 'SHADE';
  if (variants.some((variant) => Boolean(variant.size && !['Standard', 'قياسي', 'افتراضي'].includes(variant.size)))) return 'SIZE';
  if (variants.some((variant) => Boolean(variant.colorName))) return 'SCENT';
  return 'NONE';
}

async function main() {
  const products = await prisma.product.findMany({
    select: {
      id: true,
      sku: true,
      variantType: true,
      variants: { select: { shade: true, colorHex: true, colorName: true, size: true } },
    },
  });

  const counts: Record<VariantType, number> = { SHADE: 0, SCENT: 0, SIZE: 0, NONE: 0 };
  for (const product of products) {
    const variantType = detectVariantType(product.variants);
    await prisma.product.update({ where: { id: product.id }, data: { variantType } });
    counts[variantType]++;
  }

  console.log(JSON.stringify({ updated: products.length, counts }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
