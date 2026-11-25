'use server';

import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/dal';

export interface ProductSalesPerformanceItem {
  id: string;
  name: string;
  brand: string;
  category: string;
  imageUrl: string;
  sku: string;
  priceFils: number;
  posCount: number; // كم مرة تم بيعه بالكاش (صالة المعرض POS)
  onlineCount: number; // كم مرة تم بيعه بالمتجر الإلكتروني
  totalSold: number; // مجموع المبيعات
  posRevenueFils: number;
  onlineRevenueFils: number;
  totalRevenueFils: number;
  performanceTier: 'BESTSELLER' | 'HIGH' | 'MEDIUM' | 'LOW' | 'SLOW_MOVING';
}

export interface ProductSalesAnalyticsResult {
  bestSellers: ProductSalesPerformanceItem[];
  leastSellers: ProductSalesPerformanceItem[];
  allProducts: ProductSalesPerformanceItem[];
  totalUnitsSold: number;
  totalPosUnits: number;
  totalOnlineUnits: number;
  totalRevenueFils: number;
}

export async function getProductSalesAnalytics(): Promise<ProductSalesAnalyticsResult> {
  await requirePermission('manage:reports');
  // 1. Gather real DB POS sales items
  const posItemCounts = new Map<string, { qty: number; revenue: number }>();
  try {
    const saleItems = await prisma.saleItem.findMany({
      include: { sale: true }
    });
    for (const item of saleItems) {
      const key = (item.sku || item.name || '').toLowerCase().trim();
      const existing = posItemCounts.get(key) || { qty: 0, revenue: 0 };
      existing.qty += item.quantity || 1;
      existing.revenue += (item.total != null) ? item.total : ((item.quantity || 1) * (item.unitPrice || 0));
      posItemCounts.set(key, existing);
    }
  } catch (err) {
    console.warn('Prisma saleItem lookup fallback:', err);
  }

  // 2. Gather real DB Online order items
  const onlineItemCounts = new Map<string, { qty: number; revenue: number }>();
  try {
    const orderItems = await prisma.orderItem.findMany({
      include: { order: true }
    });
    for (const item of orderItems) {
      const key = (item.sku || item.name || '').toLowerCase().trim();
      const existing = onlineItemCounts.get(key) || { qty: 0, revenue: 0 };
      existing.qty += item.quantity || 1;
      existing.revenue += (item.total != null) ? item.total : ((item.quantity || 1) * (item.unitPrice || 0));
      onlineItemCounts.set(key, existing);
    }
  } catch (err) {
    console.warn('Prisma orderItem lookup fallback:', err);
  }

  // 3. Query all authentic products from database
  let dbProducts: any[] = [];
  try {
    dbProducts = await prisma.product.findMany({
      include: {
        brand: true,
        category: true,
        variants: true,
        images: { orderBy: { isMain: 'desc' } }
      },
      orderBy: { createdAt: 'desc' }
    });
  } catch (err) {
    console.warn('Prisma products lookup error:', err);
  }

  const performanceList: ProductSalesPerformanceItem[] = [];

  for (const prod of dbProducts) {
    const keySku = (prod.sku || '').toLowerCase().trim();
    const keyName = (prod.nameAr || '').toLowerCase().trim();

    // Actual DB counts
    const dbPos = (keySku && posItemCounts.get(keySku)) || (keyName && posItemCounts.get(keyName)) || { qty: 0, revenue: 0 };
    const dbOnline = (keySku && onlineItemCounts.get(keySku)) || (keyName && onlineItemCounts.get(keyName)) || { qty: 0, revenue: 0 };

    const posCount = dbPos.qty;
    const onlineCount = dbOnline.qty;
    const totalSold = posCount + onlineCount;

    const unitPrice = prod.basePrice || prod.variants?.[0]?.price || 0;
    const posRevenueFils = dbPos.revenue || (posCount * unitPrice);
    const onlineRevenueFils = dbOnline.revenue || (onlineCount * unitPrice);
    const totalRevenueFils = posRevenueFils + onlineRevenueFils;

    let performanceTier: ProductSalesPerformanceItem['performanceTier'] = 'MEDIUM';
    if (totalSold >= 30) performanceTier = 'BESTSELLER';
    else if (totalSold >= 20) performanceTier = 'HIGH';
    else if (totalSold >= 10) performanceTier = 'MEDIUM';
    else if (totalSold >= 1) performanceTier = 'LOW';
    else performanceTier = 'SLOW_MOVING';

    const mainImg = prod.images?.[0]?.url || '/logo.png';

    performanceList.push({
      id: prod.id,
      name: prod.nameAr,
      brand: prod.brand?.nameAr || prod.brand?.nameEn || 'غزل',
      category: prod.category?.nameAr || prod.category?.nameEn || 'مستحضرات تجميل',
      imageUrl: mainImg,
      sku: prod.sku || '',
      priceFils: unitPrice,
      posCount,
      onlineCount,
      totalSold,
      posRevenueFils,
      onlineRevenueFils,
      totalRevenueFils,
      performanceTier
    });
  }

  // Sort best sellers: Highest totalSold first
  const bestSellers = [...performanceList].sort((a, b) => b.totalSold - a.totalSold);

  // Sort least sellers: Lowest totalSold first (or slow-moving)
  const leastSellers = [...performanceList].sort((a, b) => a.totalSold - b.totalSold);

  const totalUnitsSold = performanceList.reduce((acc, p) => acc + p.totalSold, 0);
  const totalPosUnits = performanceList.reduce((acc, p) => acc + p.posCount, 0);
  const totalOnlineUnits = performanceList.reduce((acc, p) => acc + p.onlineCount, 0);
  const totalRevenueFils = performanceList.reduce((acc, p) => acc + p.totalRevenueFils, 0);

  return {
    bestSellers,
    leastSellers,
    allProducts: bestSellers,
    totalUnitsSold,
    totalPosUnits,
    totalOnlineUnits,
    totalRevenueFils
  };
}
