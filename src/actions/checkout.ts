'use server';

import { prisma } from '@/lib/db';
import { z } from 'zod';
import crypto from 'crypto';
import { getShippingZoneById, JORDAN_GOVERNORATES_SHIPPING_ZONES } from '@/lib/shipping-zones';
import { getShippingZonesList } from '@/actions/shipping';
import { COSMETICS_CATALOG } from '@/lib/cosmetics-catalog';
import { recordRewardRedemptionForOrderAction, evaluateCartRewardsAction } from '@/actions/rewards';
import { saveDemoOrder, getDemoOrders, DemoOrder } from '@/lib/orders-catalog';
import { sendNewOrderNotificationEmail } from '@/lib/email';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';

const checkoutSchema = z.object({
  customerName: z.string().min(2, 'يرجى إدخال اسم المستلم الكامل (حرفين على الأقل)'),
  customerPhone: z.string().min(8, 'يرجى إدخال رقم هاتف صحيح للتواصل والتوصيل (مثال: 07XXXXXXXX)'),
  detailedAddress: z.string().min(3, 'يرجى إدخال العنوان التفصيلي للتوصيل').optional(),
  addressStreet: z.string().optional(),
  addressBuilding: z.string().optional(),
  addressApartment: z.string().optional(),
  shippingZoneId: z.string().optional(),
  idempotencyKey: z.string().optional(),
  appliedRewards: z.string().optional(),
  items: z.string() // JSON string of [{ productId, variantId, quantity }]
});

export async function processCheckout(prevState: any, formData: FormData) {
  let ipAddress = '127.0.0.1';
  try {
    const headersList = await headers();
    ipAddress = getClientIp(headersList);
  } catch {}
  const isAllowed = await checkRateLimit(ipAddress, 'web_checkout', 15, 15);
  if (!isAllowed) {
    return { error: 'تم تجاوز الحد المسموح به من الطلبات مؤقتاً. يرجى الانتظار دقيقتين والمحاولة مجدداً.' };
  }

  const rawData = Object.fromEntries(formData);
  const parsed = checkoutSchema.safeParse(rawData);
  
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    let customMsg = 'يرجى التحقق من صحة البيانات المدخلة';
    if (firstIssue) {
      if (firstIssue.path.includes('customerName')) customMsg = 'يرجى إدخال الاسم الكامل للمستلم';
      else if (firstIssue.path.includes('customerPhone')) customMsg = 'يرجى إدخال رقم هاتف أردني صحيح (07XXXXXXXX)';
      else if (firstIssue.path.includes('detailedAddress')) customMsg = 'يرجى كتابة العنوان التفصيلي (المنطقة، الشارع، أو علامة مميزة)';
      else customMsg = firstIssue.message || 'يرجى التحقق من صحة المدخلات';
    }
    return { error: customMsg };
  }

  const { customerName, customerPhone, detailedAddress, addressStreet, addressBuilding, addressApartment, shippingZoneId, idempotencyKey, appliedRewards: appliedRewardsJson, items: itemsJson } = parsed.data;
  
  // Resolve address fields cleanly
  const finalStreet = detailedAddress || addressStreet || 'العنوان التفصيلي مسجل';
  const finalBuilding = addressBuilding || 'المنزل / البناية';
  const finalApartment = addressApartment || '';

  let appliedRewardsData: any = null;
  if (appliedRewardsJson) {
    try {
      appliedRewardsData = JSON.parse(appliedRewardsJson);
    } catch (e) {}
  }
  
  let parsedItems;
  try {
    parsedItems = JSON.parse(itemsJson);
    if (!Array.isArray(parsedItems) || parsedItems.length === 0) {
      throw new Error();
    }
  } catch (e) {
    return { error: 'السلة فارغة أو غير صالحة' };
  }

  // Idempotency check: Look for matching order by unique key
  if (idempotencyKey) {
    let existing: any = null;
    try {
      existing = await prisma.order.findUnique({
        where: { idempotencyKey },
        include: { items: true }
      });
    } catch (e) {
      // Prisma offline: check memory catalog
      const demoOrders = getDemoOrders();
      existing = demoOrders.find((o: any) => o.idempotencyKey === idempotencyKey || o.reference === idempotencyKey);
    }

    if (existing) {
      let number = '962785050655';
      try {
        const setting = await prisma.siteSettings.findUnique({ where: { key: 'whatsapp_number' } });
        if (setting) {
          const config = JSON.parse(setting.value);
          if (config.number) number = config.number;
        }
      } catch (e) {}
      
      // Rebuild the exact original message from the persisted snapshots (with accurate 3-decimal JOD math)
      let msg = `مرحباً غزل (GHAZAL) للمكياج والتجميل،\nأود تأكيد طلبي الجديد رقم: ${existing.reference}\n\n`;
      msg += `الاسم: ${existing.customerName}\n`;
      msg += `رقم الهاتف: ${existing.customerPhone}\n`;
      if (existing.notes && existing.notes.includes('العنوان:')) {
        const addressLines = existing.notes.split('\n').filter((l: string) => l.startsWith('العنوان:'));
        if (addressLines.length > 0) {
          msg += `${addressLines[0]}\n`;
        }
      }
      msg += `\nتفاصيل الطلب:\n`;
      
      for (const it of (existing.items || [])) {
        if (it.unitPrice === 0) {
          msg += `- ${it.name} x${it.quantity} = مجاناً 0.000 د.أ 🎁\n`;
        } else {
          msg += `- ${it.name} (${it.size}) x${it.quantity} = ${((it.total || 0) / 1000).toFixed(3)} د.أ\n`;
        }
      }
      
      msg += `\nرسوم التوصيل: ${((existing.shippingCost || 0) / 1000).toFixed(3)} د.أ\n`;
      msg += `الإجمالي: ${((existing.totalAmount || 0) / 1000).toFixed(3)} د.أ\n\n`;
      msg += `شكراً لكم.`;

      const encodedMsg = encodeURIComponent(msg);
      return {
        success: true,
        reference: existing.reference,
        whatsappUrl: `https://wa.me/${number}?text=${encodedMsg}`
      };
    }
  }

  // 1. جلب كل التباينات دفعة واحدة (مع دعم Fallback للكتالوج عند عدم اتصال قاعدة البيانات)
  const variantIds = parsedItems.map((item: { variantId: string }) => item.variantId);
  let variants: any[] = [];
  try {
    variants = await prisma.productVariant.findMany({
      where: { id: { in: variantIds }, isActive: true },
      include: { product: { select: { nameAr: true, nameEn: true, id: true } } },
    });
  } catch (err) {
    // Database fallback to COSMETICS_CATALOG
  }

  // إنشاء Map سريع للبحث من قاعدة البيانات
  const variantMap = new Map(variants.map(v => [v.id, v]));

  let totalAmount = 0;
  const orderItemsData: {
    productId: string;
    variantId: string;
    sku: string;
    name: string;
    size: string;
    quantity: number;
    unitPrice: number;
    total: number;
    costPrice?: number | null;
    discount?: number;
    taxAmount?: number;
  }[] = [];

  for (const item of parsedItems) {
    const { productId, variantId, quantity } = item;

    if (quantity <= 0) continue;

    let variant = variantMap.get(variantId);

    // Fallback: ابحث في الكتالوج الاحتياطي إذا لم نجد التباين في قاعدة البيانات
    if (!variant) {
      for (const prod of COSMETICS_CATALOG) {
        const foundV = prod.variants.find(v => v.id === variantId);
        if (foundV) {
          variant = {
            id: foundV.id,
            productId: prod.id,
            sku: foundV.sku,
            size: foundV.size || foundV.shade || 'قياسي',
            price: foundV.price,
            product: {
              id: prod.id,
              nameAr: prod.nameAr,
              nameEn: prod.nameEn || prod.nameAr
            }
          };
          break;
        }
      }
    }

    if (!variant) {
      return { error: 'أحد المنتجات غير متوفر حالياً' };
    }

    const unitPrice = variant.price;
    const total = unitPrice * quantity;
    totalAmount += total;

    orderItemsData.push({
      productId: variant.productId,
      variantId: variant.id,
      sku: variant.sku,
      name: variant.product.nameAr,
      size: variant.size,
      quantity,
      unitPrice,
      total,
      costPrice: (variant as any).costPriceFils || (variant as any).costPrice || null,
      discount: 0,
      taxAmount: 0
    });
  }

  // Calculate Shipping (دعم جميع محافظات الأردن الـ 12)
  let shippingCost = 0;
  let zoneName = 'غير محدد';
  
  if (shippingZoneId) {
    let zone: any = null;
    try {
      const allZones = await getShippingZonesList();
      zone = allZones.find(z => z.id === shippingZoneId);
    } catch (e) {
      // fallback
    }

    if (!zone) {
      try {
        zone = await prisma.shippingZone.findUnique({
          where: { id: shippingZoneId }
        });
      } catch (e) {
        // Prisma offline
      }
    }

    if (!zone) {
      zone = getShippingZoneById(shippingZoneId);
    }

    if (zone && (zone.isEnabled ?? true)) {
      shippingCost = zone.fee;
      zoneName = zone.nameAr;
      if (zone.freeShippingThreshold && totalAmount >= zone.freeShippingThreshold) {
        shippingCost = 0;
      }
    } else {
      // Unrecognized or disabled shipping zone: Flag for admin review
      return { error: 'منطقة التوصيل المحددة غير صالحة' };
    }
  } else {
    // If no shipping zone is supplied: Shipping cost remains 0 and flags for admin review
    return { error: 'يرجى تحديد منطقة التوصيل' };
  }

  // Authoritative server-side evaluation of rewards to prevent client-side parameter tampering
  let rewardDiscountFils = 0;
  let verifiedFreeShipping = false;
  let verifiedGifts: any[] = [];

  try {
    const serverRewards = await evaluateCartRewardsAction({
      subtotalFils: totalAmount,
      shippingFeeFils: shippingCost,
      selectedGiftId: appliedRewardsData?.selectedGiftId || appliedRewardsData?.appliedGift?.id
    });

    if (serverRewards.freeShippingApplied) {
      verifiedFreeShipping = true;
      shippingCost = 0;
    }
    if (serverRewards.discountAmountFils > 0) {
      rewardDiscountFils = serverRewards.discountAmountFils;
    }
    if (serverRewards.appliedGiftsList && serverRewards.appliedGiftsList.length > 0) {
      verifiedGifts = serverRewards.appliedGiftsList;
    } else if (serverRewards.appliedGift) {
      verifiedGifts = [serverRewards.appliedGift];
    }
  } catch (err) {
    console.warn('Rewards evaluation fallback:', err);
  }

  // Add verified free gifts to order items
  for (const g of verifiedGifts) {
    orderItemsData.push({
      productId: g.id,
      variantId: g.id,
      sku: g.sku || 'GHZ-GIFT',
      name: `🎁 [هدية مجانية] ${g.nameAr}`,
      size: 'هدية مجانية 0.000 د.أ',
      quantity: 1,
      unitPrice: 0,
      total: 0,
      costPrice: (g as any).costPriceFils || 500,
      discount: 0,
      taxAmount: 0
    });
  }

  // Allocate reward discount across items for historical integrity
  if (rewardDiscountFils > 0 && totalAmount > 0) {
    let runningDiscount = 0;
    const paidItems = orderItemsData.filter(it => it.unitPrice > 0);
    for (let i = 0; i < paidItems.length; i++) {
      const it = paidItems[i];
      const isLast = i === paidItems.length - 1;
      const itDiscount = isLast ? (rewardDiscountFils - runningDiscount) : Math.round((it.total / totalAmount) * rewardDiscountFils);
      runningDiscount += itDiscount;
      it.discount = itDiscount;
    }
  }

  const grandTotal = Math.max(0, totalAmount - rewardDiscountFils) + shippingCost;
  const addressNote = detailedAddress ? `العنوان: ${detailedAddress}` : `العنوان: الشارع (${finalStreet})، البناية (${finalBuilding})${finalApartment ? `، الشقة/الطابق (${finalApartment})` : ''}`;

  // 2. Create AWAITING_WHATSAPP order inside a transaction (مع معالجة استباقية عند عدم توفر قاعدة البيانات)
  const reference = `ORD-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

  // Always save order to memory/catalog cache so it is instantly retrievable on invoice and tracking pages
  try {
    const demoOrderRecord: DemoOrder = {
      id: reference,
      reference,
      customerName,
      customerPhone,
      status: 'AWAITING_WHATSAPP',
      totalAmount: grandTotal,
      shippingCost,
      notes: addressNote,
      addressStreet: finalStreet || detailedAddress,
      addressBuilding: finalBuilding,
      addressApartment: finalApartment,
      items: orderItemsData.map((item: any, idx: number) => ({
        id: `item-${reference}-${idx}`,
        orderId: reference,
        productId: item.productId,
        variantId: item.variantId,
        sku: item.sku,
        name: item.name,
        size: item.size,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        total: item.total,
        costPrice: item.costPrice ?? null,
        discount: item.discount ?? 0,
        taxAmount: item.taxAmount ?? 0
      })),
      statusHistory: [
        {
          id: `hist-${reference}-1`,
          orderId: reference,
          status: 'AWAITING_WHATSAPP',
          notes: `تم إنشاء الطلب عبر المتجر الإلكتروني. منطقة التوصيل: ${zoneName}. ${detailedAddress}`,
          createdAt: new Date().toISOString()
        }
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    saveDemoOrder(demoOrderRecord);
  } catch (err) {
    console.warn('saveDemoOrder failed:', err);
  }

  // Ensure all items and gifts in orderItemsData satisfy PostgreSQL foreign key constraint to Product(id)
  try {
    const fallbackProduct = await prisma.product.findFirst({ select: { id: true } });
    if (fallbackProduct) {
      for (const item of orderItemsData) {
        let exists = false;
        try {
          const p = await prisma.product.findUnique({
            where: { id: item.productId },
            select: { id: true }
          });
          if (p) exists = true;
        } catch {}

        if (!exists) {
          try {
            const foundBySlugOrSku = await prisma.product.findFirst({
              where: {
                OR: [
                  { slug: item.productId },
                  { sku: item.sku }
                ]
              },
              select: { id: true }
            });
            item.productId = foundBySlugOrSku ? foundBySlugOrSku.id : fallbackProduct.id;
          } catch {
            item.productId = fallbackProduct.id;
          }
        }
      }
    }
  } catch (lookupErr) {
    console.warn('Product FK resolution fallback warning:', lookupErr);
  }

  let order: any = null;
  try {
    order = await prisma.$transaction(async (tx) => {
      const newOrder = await tx.order.create({
        data: {
          reference,
          customerName,
          customerPhone,
          status: 'AWAITING_WHATSAPP',
          totalAmount: grandTotal,
          shippingCost,
          notes: addressNote,
          idempotencyKey: idempotencyKey || undefined,
          items: {
            create: orderItemsData
          },
          statusHistory: {
            create: {
              status: 'AWAITING_WHATSAPP',
              notes: `Order initiated via Web Checkout. Zone: ${zoneName}. ${detailedAddress}`
            }
          }
        }
      });
      return newOrder;
    });

    try {
      revalidatePath('/admin/orders');
      revalidatePath('/[locale]', 'layout');
    } catch {}
  } catch (dbErr) {
    console.warn('Prisma order creation failed, proceeding with WhatsApp message generation:', dbErr);
  }

  // Record Reward Redemption in rewards engine
  if (appliedRewardsData && (appliedRewardsData.appliedGift || (appliedRewardsData.appliedGiftsList && appliedRewardsData.appliedGiftsList.length > 0) || appliedRewardsData.freeShippingApplied || rewardDiscountFils > 0)) {
    try {
      await recordRewardRedemptionForOrderAction({
        orderId: reference,
        orderNumber: reference.replace('ORD-', ''),
        customerName,
        customerPhone,
        basketTotalFils: grandTotal,
        appliedGift: appliedRewardsData.appliedGift || (appliedRewardsData.appliedGiftsList && appliedRewardsData.appliedGiftsList[0]),
        freeShippingApplied: Boolean(appliedRewardsData.freeShippingApplied),
        freeShippingFeeFils: 2000,
        discountAmountFils: rewardDiscountFils
      });
    } catch (err) {
      console.error('Error recording reward redemption:', err);
    }
  }

  // Send Email Notification to Store Admin via Resend
  sendNewOrderNotificationEmail({
    reference,
    customerName,
    customerPhone,
    zoneName,
    address: detailedAddress || finalStreet,
    items: orderItemsData.map((item: any) => ({
      name: item.name,
      size: item.size,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      total: item.total,
      sku: item.sku
    })),
    subtotalFils: totalAmount,
    shippingCostFils: shippingCost,
    rewardDiscountFils,
    grandTotalFils: grandTotal,
    notes: addressNote
  }).catch((emailErr) => {
    console.error('Non-blocking: Failed to send new order email notification:', emailErr);
  });

  // Get WhatsApp official number from database setting or default
  let whatsappNumber = '962785050655';
  try {
    const setting = await prisma.siteSettings.findUnique({ where: { key: 'whatsapp_number' } });
    if (setting) {
      const config = JSON.parse(setting.value);
      if (config.number) whatsappNumber = config.number;
    }
  } catch (e) {}

  // 3. Generate secure WhatsApp message
  let message = `مرحباً غزل (GHAZAL) للمكياج والتجميل،\nأود تأكيد طلبي الجديد رقم: ${reference}\n\n`;
  message += `الاسم: ${customerName}\n`;
  message += `رقم الهاتف: ${customerPhone}\n`;
  message += `منطقة التوصيل: ${zoneName}\n`;
  message += `${detailedAddress}\n\n`;
  message += `تفاصيل الطلب:\n`;
  
  for (const item of orderItemsData) {
    if (item.unitPrice === 0) {
      message += `- ${item.name} x${item.quantity} = مجاناً 0.000 د.أ 🎁\n`;
    } else {
      message += `- ${item.name} (${item.size}) x${item.quantity} = ${(item.total / 1000).toFixed(3)} د.أ\n`;
    }
  }
  
  if (verifiedFreeShipping) {
    message += `\nرسوم التوصيل: مجاني (مكافأة سلة غزل 🎉)\n`;
  } else {
    message += `\nرسوم التوصيل: ${(shippingCost / 1000).toFixed(3)} د.أ\n`;
  }

  if (rewardDiscountFils > 0) {
    message += `خصم المكافأة: -${(rewardDiscountFils / 1000).toFixed(3)} د.أ\n`;
  }

  message += `الإجمالي النهائي: ${(grandTotal / 1000).toFixed(3)} د.أ\n\n`;
  message += `شكراً لكم.`;

  const encodedMessage = encodeURIComponent(message);
  const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodedMessage}`;

  return {
    success: true,
    reference,
    whatsappUrl
  };
}
