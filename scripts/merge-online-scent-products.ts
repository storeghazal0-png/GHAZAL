import 'dotenv/config';
import { prisma } from '../src/lib/db';

type MergeGroup = {
  canonicalSku: string;
  memberSkus: string[];
  nameAr: string;
  nameEn: string;
};

const groups: MergeGroup[] = [
  {
    canonicalSku: 'GHAZ-REXONA-MOTIONSENSE-SPRAY-238',
    memberSkus: Array.from({ length: 7 }, (_, i) => `GHAZ-REXONA-MOTIONSENSE-SPRAY-${232 + i}`),
    nameAr: 'بخاخ مزيل عرق ريكسونا موشن سينس',
    nameEn: 'Rexona MotionSense Antiperspirant Spray',
  },
  {
    canonicalSku: 'GHAZ-VASELINE-GLUTAVIT-HIJAB-180',
    memberSkus: ['GHAZ-VASELINE-GLUTAVIT-HIJAB-180', 'GHAZ-VASELINE-GLUTAVIT-FIRM-180'],
    nameAr: 'سيروم جسم فازلين غلوتا فيتامين 180 مل',
    nameEn: 'Vaseline Gluta Vitamin Body Serum 180 ml',
  },
  {
    canonicalSku: 'GHAZ-EMPER-TWIST-SPRAY',
    memberSkus: [
      'GHAZ-EMPER-TWIST-SPRAY',
      'GHAZ-EMPER-SALGA-SPRAY',
      'GHAZ-EMPER-CHIFON-SPRAY',
      'GHAZ-EMPER-FASIO-SPRAY',
      'GHAZ-FASIO-SPRAY',
      'GHAZ-EMPER-LEGEND-SPRAY',
    ],
    nameAr: 'بخاخ جسم إمبير',
    nameEn: 'Emper Body Spray',
  },
  {
    canonicalSku: 'GHAZ-DOVE-INVISIBLE-SPRAY',
    memberSkus: [
      'GHAZ-DOVE-INVISIBLE-SPRAY',
      'GHAZ-DOVE-ORIGINAL-SPRAY',
      'GHAZ-DOVE-GOFRESH-SPRAY',
      'GHAZ-DOVE-NOURISH-SPRAY',
    ],
    nameAr: 'بخاخ مزيل عرق دوف',
    nameEn: 'Dove Deodorant Spray',
  },
  {
    canonicalSku: 'GHAZ-BOUTIQUE-ROLLON-299',
    memberSkus: Array.from({ length: 10 }, (_, i) => `GHAZ-BOUTIQUE-ROLLON-${299 + i}`),
    nameAr: 'رول مزيل عرق بوتيك',
    nameEn: 'Boutique Roll-On Deodorant',
  },
  {
    canonicalSku: 'GHAZ-ELEGANCE-HAIR-SERUM-300-311',
    memberSkus: ['GHAZ-ELEGANCE-HAIR-SERUM-300-311', 'GHAZ-ELEGANCE-HAIR-SERUM-300-312'],
    nameAr: 'سيروم شعر إليغانس بلس 300 مل',
    nameEn: 'Elegance Plus Hair Serum 300 ml',
  },
  {
    canonicalSku: 'GHAZ-AGRADO-BODY-MILK-400-331',
    memberSkus: Array.from({ length: 5 }, (_, i) => `GHAZ-AGRADO-BODY-MILK-400-${331 + i}`),
    nameAr: 'لوشن جسم أغرادو بودي ميلك 400 مل',
    nameEn: 'Agrado Body Milk 400 ml',
  },
  {
    canonicalSku: 'GHAZ-VASELINE-INTENSIVE-400-337',
    memberSkus: Array.from({ length: 4 }, (_, i) => `GHAZ-VASELINE-INTENSIVE-400-${337 + i}`),
    nameAr: 'لوشن جسم فازلين إنتنسيف كير 400 مل',
    nameEn: 'Vaseline Intensive Care Body Lotion 400 ml',
  },
  {
    canonicalSku: 'GHAZ-MBC-BODY-LOTION-500-342',
    memberSkus: Array.from({ length: 4 }, (_, i) => `GHAZ-MBC-BODY-LOTION-500-${342 + i}`),
    nameAr: 'لوشن يدين وجسم إم بي سي 500 مل',
    nameEn: 'MBC Ultra Hand & Body Lotion 500 ml',
  },
  {
    canonicalSku: 'GHAZ-BOUTIQUE-SCRUB-600-347',
    memberSkus: Array.from({ length: 5 }, (_, i) => `GHAZ-BOUTIQUE-SCRUB-600-${347 + i}`),
    nameAr: 'مقشر الوجه والجسم بوتيك 600 مل',
    nameEn: 'Boutique Face & Body Scrub 600 ml',
  },
];

async function mergeGroup(group: MergeGroup) {
  const products = await prisma.product.findMany({
    where: { sku: { in: group.memberSkus }, channel: 'ONLINE' },
    include: { variants: true, images: true },
    orderBy: { sku: 'asc' },
  });
  const canonical = products.find((product) => product.sku === group.canonicalSku);
  if (!canonical || products.length < 2) return { group: group.canonicalSku, merged: 0, variants: 0, images: 0 };

  let merged = 0;
  let movedVariants = 0;
  let movedImages = 0;
  await prisma.$transaction(async (tx) => {
    await tx.product.update({
      where: { id: canonical.id },
      data: {
        nameAr: group.nameAr,
        nameEn: group.nameEn,
        shortDescription: `${group.nameAr} متوفر بعدة خيارات وروائح، مع صورة مستقلة لكل خيار.`,
        longDescription: `${group.nameAr} متوفر بعدة خيارات وروائح. اختاري الخيار المناسب من القائمة لمشاهدة صورته وسعره.`,
        channel: 'ONLINE',
        isVisible: true,
      },
    });

    for (const duplicate of products.filter((product) => product.id !== canonical.id)) {
      // Preserve historical references before removing the duplicate product shell.
      await tx.orderItem.updateMany({ where: { productId: duplicate.id }, data: { productId: canonical.id } });
      await tx.homepageHeroSlide.updateMany({ where: { productId: duplicate.id }, data: { productId: canonical.id } });
      await tx.productSimilar.deleteMany({ where: { OR: [{ productId: duplicate.id }, { similarId: duplicate.id }] } });
      await tx.productAccord.deleteMany({ where: { productId: duplicate.id } });
      await tx.productNote.deleteMany({ where: { productId: duplicate.id } });

      if (duplicate.variants.length > 0) {
        await tx.productVariant.updateMany({ where: { productId: duplicate.id }, data: { productId: canonical.id } });
        movedVariants += duplicate.variants.length;
      }
      if (duplicate.images.length > 0) {
        await tx.productImage.updateMany({ where: { productId: duplicate.id }, data: { productId: canonical.id, isMain: false } });
        movedImages += duplicate.images.length;
      }
      await tx.product.delete({ where: { id: duplicate.id } });
      merged++;
    }

    const allImages = await tx.productImage.findMany({ where: { productId: canonical.id }, orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] });
    const seenUrls = new Set<string>();
    for (let index = 0; index < allImages.length; index++) {
      const image = allImages[index];
      if (seenUrls.has(image.url)) {
        await tx.productImage.delete({ where: { id: image.id } });
        continue;
      }
      seenUrls.add(image.url);
      await tx.productImage.update({ where: { id: image.id }, data: { isMain: index === 0, order: index } });
    }
  }, { maxWait: 15000, timeout: 60000 });

  return { group: group.canonicalSku, merged, variants: movedVariants, images: movedImages };
}

async function main() {
  const results = [];
  for (const group of groups) results.push(await mergeGroup(group));

  const onlineCount = await prisma.product.count({ where: { channel: 'ONLINE', isVisible: true } });
  const imageCount = await prisma.productImage.count({ where: { product: { channel: 'ONLINE', isVisible: true } } });
  const optionCount = await prisma.productVariant.count({ where: { product: { channel: 'ONLINE', isVisible: true }, isActive: true } });
  const missingImages = await prisma.product.count({
    where: {
      channel: 'ONLINE',
      isVisible: true,
      images: { none: {} },
      variants: { none: { imageUrl: { not: null } } },
    },
  });
  console.log(JSON.stringify({ results, onlineCount, imageCount, optionCount, missingImages }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
