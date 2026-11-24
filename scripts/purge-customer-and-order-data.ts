import 'dotenv/config';
import { prisma } from '../src/lib/db';

async function purge() {
  console.log('--- بدء عملية تفريغ بيانات العملاء والطلبات والتسويات مع الحفاظ التام على المنتجات والموظفين ---');

  // تنظيف العمليات المالية وطلبات الشراء والعملاء
  const [
    delOrderHistories,
    delOrderItems,
    delInvoices,
    delOrders,
    delReturnItems,
    delReturns,
    delPayments,
    delSaleItems,
    delSales,
    delHeldSales,
    delRateLimits
  ] = await prisma.$transaction([
    prisma.orderStatusHistory.deleteMany({}),
    prisma.orderItem.deleteMany({}),
    prisma.invoice.deleteMany({}),
    prisma.order.deleteMany({}),
    prisma.returnItem.deleteMany({}),
    prisma.return.deleteMany({}),
    prisma.payment.deleteMany({}),
    prisma.saleItem.deleteMany({}),
    prisma.sale.deleteMany({}),
    prisma.heldSale.deleteMany({}),
    prisma.rateLimitEvent.deleteMany({}),
  ]);

  console.log('نتائج التنظيف:');
  console.log({
    deletedOrderHistories: delOrderHistories.count,
    deletedOrderItems: delOrderItems.count,
    deletedInvoices: delInvoices.count,
    deletedOrders: delOrders.count,
    deletedReturnItems: delReturnItems.count,
    deletedReturns: delReturns.count,
    deletedPayments: delPayments.count,
    deletedSaleItems: delSaleItems.count,
    deletedSales: delSales.count,
    deletedHeldSales: delHeldSales.count,
    deletedRateLimits: delRateLimits.count,
  });

  // التحقق من الحفاظ على المنتجات والأصناف والمستخدمين
  const [productCount, variantCount, categoryCount, brandCount, employeeCount] = await Promise.all([
    prisma.product.count(),
    prisma.productVariant.count(),
    prisma.category.count(),
    prisma.brand.count(),
    prisma.employee.count(),
  ]);

  console.log('بيانات المتجر المحفوظة بنجاح:');
  console.log({
    products: productCount,
    variants: variantCount,
    categories: categoryCount,
    brands: brandCount,
    employees: employeeCount,
  });
}

purge()
  .catch((e) => {
    console.error('خطأ أثناء التفريغ:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
