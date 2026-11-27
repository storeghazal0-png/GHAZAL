import { prisma } from '@/lib/db';
import { notFound } from 'next/navigation';
import { filsToDisplay } from '@/lib/money';
import Image from 'next/image';
import Link from 'next/link';
import { PrintInvoiceButton } from '@/components/PrintInvoiceButton';
import { getDemoOrderById } from '@/lib/orders-catalog';
import { COSMETICS_CATALOG } from '@/lib/cosmetics-catalog';
import { Clock, PackageCheck, Truck, CheckCircle2, XCircle, ShoppingBag, MapPin, Check, FileEdit, ShieldCheck, ArrowLeftRight, AlertCircle } from 'lucide-react';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface StatusDetails {
  key: string;
  label: string;
  description: string;
  badgeClass: string;
  borderClass: string;
  bgClass: string;
  textClass: string;
  stepIndex: number;
}

interface ParsedModification {
  raw: string;
  actionTitle: string;
  actionType: 'ADD' | 'REMOVE' | 'UPDATE';
  itemName: string;
  quantity?: string;
  unitPrice?: string;
  amountImpact?: string;
  priceChange?: string;
  reason?: string;
}

function parseModificationAudit(rawNote: string): ParsedModification {
  const parts = rawNote.split('|').map(p => p.trim());
  let actionTitle = 'تعديل فاتورة معتمد';
  let actionType: 'ADD' | 'REMOVE' | 'UPDATE' = 'UPDATE';
  let itemName = '';
  let quantity = '';
  let unitPrice = '';
  let amountImpact = '';
  let priceChange = '';
  let reason = '';

  for (const part of parts) {
    if (part.includes('[تعديل فاتورة') || part.includes('تم إضافة') || part.includes('تم حذف')) {
      const titleMatch = part.match(/\[(.*?)\]/);
      if (titleMatch) {
        actionTitle = titleMatch[1];
      }
      if (part.includes('إضافة')) actionType = 'ADD';
      else if (part.includes('حذف')) actionType = 'REMOVE';

      const withoutBracket = part.replace(/\[.*?\]/, '').trim();
      itemName = withoutBracket.replace(/^(تم إضافة:\s*|تم حذف:\s*)/, '').trim();
    } else if (part.startsWith('الكمية:')) {
      quantity = part.replace('الكمية:', '').trim();
    } else if (part.startsWith('السعر:') || part.startsWith('السعر الإفرادي:')) {
      unitPrice = part.replace(/^(السعر:|السعر الإفرادي:)/, '').trim();
    } else if (part.startsWith('المبلغ المضاف:') || part.startsWith('الإجمالي المضاف:')) {
      amountImpact = '+' + part.replace(/^(المبلغ المضاف:|الإجمالي المضاف:)/, '').trim();
    } else if (part.startsWith('المبلغ المخصوم:')) {
      amountImpact = '-' + part.replace('المبلغ المخصوم:', '').trim();
    } else if (part.includes('تغير السعر') || part.includes('تغيّر السعر')) {
      priceChange = part.trim();
    } else if (part.startsWith('سبب التعديل:')) {
      reason = part.replace('سبب التعديل:', '').trim();
    }
  }

  return {
    raw: rawNote,
    actionTitle,
    actionType,
    itemName,
    quantity,
    unitPrice,
    amountImpact,
    priceChange,
    reason
  };
}

function getDetailedOrderStatus(rawStatus: string): StatusDetails {
  const status = (rawStatus || 'PENDING').toUpperCase();

  switch (status) {
    case 'AWAITING_WHATSAPP':
    case 'PENDING':
    case 'NEW':
      return {
        key: 'NEW',
        label: 'طلب جديد (بانتظار التأكيد)',
        description: 'تم تسجيل طلبكِ بنجاح، ويقوم فريق المتجر بمراجعته وتجهيزه للتوصيل.',
        badgeClass: 'bg-blue-100 text-blue-900 border-blue-300',
        borderClass: 'border-blue-200',
        bgClass: 'bg-blue-50/80',
        textClass: 'text-blue-950',
        stepIndex: 1
      };

    case 'CONFIRMED':
    case 'PREPARING':
    case 'CONFIRMED_PREPARING':
      return {
        key: 'PREPARING',
        label: 'مؤكد وقيد التجهيز',
        description: 'تم تأكيد طلبكِ بنجاح، ويجري الآن فحص المنتجات وتغليفها وتجهيزها للشحن.',
        badgeClass: 'bg-amber-100 text-amber-900 border-amber-300',
        borderClass: 'border-amber-200',
        bgClass: 'bg-amber-50/80',
        textClass: 'text-amber-950',
        stepIndex: 2
      };

    case 'PREPARED':
    case 'READY_FOR_DELIVERY':
    case 'AWAITING_DELIVERY':
      return {
        key: 'PREPARED',
        label: 'تم التجهيز (بانتظار شركة التوصيل)',
        description: 'الطلب مغلف وجاهز بالكامل ومسجل في قائمة الاستلام لمندوب شركة التوصيل.',
        badgeClass: 'bg-purple-100 text-purple-900 border-purple-300',
        borderClass: 'border-purple-200',
        bgClass: 'bg-purple-50/80',
        textClass: 'text-purple-950',
        stepIndex: 2
      };

    case 'SHIPPED':
    case 'OUT_FOR_DELIVERY':
    case 'WITH_COURIER':
    case 'IN_TRANSIT':
      return {
        key: 'SHIPPED',
        label: 'مع شركة التوصيل (في الطريق إليكِ)',
        description: 'شحنتكِ الآن بحوزة مندوب التوصيل وهي في طريقها إلى عنوانكِ المسجل.',
        badgeClass: 'bg-orange-100 text-orange-900 border-orange-300',
        borderClass: 'border-orange-200',
        bgClass: 'bg-orange-50/80',
        textClass: 'text-orange-950',
        stepIndex: 3
      };

    case 'DELIVERED':
    case 'COMPLETED':
      return {
        key: 'DELIVERED',
        label: 'تم التسليم بنجاح ✓',
        description: 'تم استلام الشحنة وتسليم المبلغ بنجاح. شكراً لتسوقكِ وثقتكِ بمحل غزل للمكياج والتجميل 🌟',
        badgeClass: 'bg-emerald-100 text-emerald-900 border-emerald-300',
        borderClass: 'border-emerald-200',
        bgClass: 'bg-emerald-50/90',
        textClass: 'text-emerald-950',
        stepIndex: 4
      };

    case 'CANCELLED':
      return {
        key: 'CANCELLED',
        label: 'طلب ملغي',
        description: 'تم إلغاء هذا الطلب بناءً على رغبة العميل أو لعدم توفر الأصناف المطلوبة.',
        badgeClass: 'bg-rose-100 text-rose-900 border-rose-300',
        borderClass: 'border-rose-200',
        bgClass: 'bg-rose-50/80',
        textClass: 'text-rose-950',
        stepIndex: 0
      };

    default:
      return {
        key: 'OTHER',
        label: status,
        description: 'الطلب قيد المتابعة والتجهيز مع فريق العمل.',
        badgeClass: 'bg-zinc-100 text-zinc-900 border-zinc-300',
        borderClass: 'border-zinc-200',
        bgClass: 'bg-zinc-50',
        textClass: 'text-zinc-900',
        stepIndex: 1
      };
  }
}

export default async function InvoicePage({ params }: { params: Promise<{ orderId: string; locale: string }> }) {
  const { orderId, locale } = await params;

  let order: any = null;
  try {
    order = await prisma.order.findFirst({
      where: {
        OR: [
          { id: orderId },
          { reference: orderId }
        ]
      },
      include: {
        items: {
          include: {
            product: {
              include: {
                images: true,
                variants: true
              }
            }
          }
        },
        statusHistory: { orderBy: { createdAt: 'desc' } }
      }
    });
  } catch (err) {
    console.warn('InvoicePage Prisma query failed, using demo fallback');
  }

  if (!order) {
    const demo = getDemoOrderById(orderId);
    if (demo) {
      order = {
        ...demo,
        createdAt: new Date(demo.createdAt)
      };
    }
  }

  if (!order) {
    notFound();
  }

  const statusInfo = getDetailedOrderStatus(order.status);

  // 1. Filter from statusHistory
  const statusModifications = (order.statusHistory || []).filter((h: any) =>
    h.notes && (
      h.notes.includes('تعديل فاتورة') ||
      h.notes.includes('تعديل') ||
      h.notes.includes('تغير السعر') ||
      h.notes.includes('تغيّر السعر') ||
      h.notes.includes('النزاهة') ||
      h.notes.includes('إضافة منتج') ||
      h.notes.includes('حذف منتج') ||
      h.notes.includes('إضافة صنف') ||
      h.notes.includes('حذف صنف') ||
      h.notes.includes('سبب التعديل')
    )
  );

  // 2. Also check order.notes if it contains modification info not in statusHistory
  const orderNotesModification = order.notes && (
    order.notes.includes('تعديل') ||
    order.notes.includes('إضافة') ||
    order.notes.includes('حذف')
  ) && !statusModifications.some((m: any) => m.notes === order.notes)
    ? [{
        id: 'order-notes-mod',
        orderId: order.id,
        status: order.status,
        notes: order.notes,
        createdAt: order.updatedAt || order.createdAt
      }]
    : [];

  const allModifications = [...statusModifications, ...orderNotesModification];

  // Format Date with English numerals
  const dateStr = (order.createdAt instanceof Date ? order.createdAt : new Date(order.createdAt)).toLocaleDateString('ar-JO-u-nu-latn', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  return (
    <div className="min-h-screen bg-zinc-100 py-12 px-4" dir="rtl">
      <div className="max-w-2xl mx-auto bg-white shadow-xl rounded-2xl overflow-hidden border border-zinc-200">
        
        {/* Invoice Header */}
        <div className="bg-[var(--color-charcoal-900)] text-white p-6 sm:p-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b-4 border-[var(--color-champagne-600)] relative">
          {/* Logo */}
          <div className="flex items-center gap-3.5">
            <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center p-2 shadow-md shrink-0">
              <img src="/logo.png" alt="غزل للمكياج والتجميل" className="max-w-full max-h-full object-contain" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black font-heading mb-0.5">غزل للمكياج والتجميل</h1>
              <p className="text-zinc-300 text-xs sm:text-sm">Ghazal Cosmetics — عين الباشا (شارع القدس)</p>
            </div>
          </div>

          {/* Reference & Prominent Header Status Badge */}
          <div className="bg-white/10 p-3 rounded-xl border border-white/20 self-stretch sm:self-auto text-right sm:text-left">
            <div className="flex items-center justify-between sm:justify-end gap-2 mb-1">
              <span className="text-xs font-bold text-[var(--color-champagne-400)]">رقم الطلب</span>
              <span className="text-lg font-mono font-black text-white">#{order.reference}</span>
            </div>
            <div className="pt-1">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-black border ${statusInfo.badgeClass}`}>
                <span>الحالة:</span>
                <span>{statusInfo.label}</span>
              </span>
            </div>
          </div>
        </div>

        {/* ==============================================================
            ORDER PROGRESS TRACKER (متابعة مسار الطلب)
        ============================================================== */}
        <div className={`p-5 sm:p-6 border-b ${statusInfo.borderClass} ${statusInfo.bgClass}`}>
          <div className="flex items-center gap-2 mb-4">
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                statusInfo.stepIndex === 4 ? 'bg-emerald-400' : statusInfo.stepIndex === 0 ? 'bg-rose-400' : 'bg-pink-400'
              }`}></span>
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                statusInfo.stepIndex === 4 ? 'bg-emerald-600' : statusInfo.stepIndex === 0 ? 'bg-rose-600' : 'bg-pink-600'
              }`}></span>
            </span>
            <span className="text-xs sm:text-sm font-extrabold text-zinc-800">متابعة مسار الطلب:</span>
          </div>

          {/* Stepper Progress Bar (4 Steps) */}
          {statusInfo.key !== 'CANCELLED' ? (
            <div className="pt-1 pb-1">
              <div className="grid grid-cols-4 gap-2 relative">
                {/* Step 1: تم الطلب */}
                <div className="flex flex-col items-center text-center group">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition-all mb-1.5 ${
                    statusInfo.stepIndex >= 1 ? 'bg-black text-white shadow-xs' : 'bg-zinc-200 text-zinc-500'
                  }`}>
                    {statusInfo.stepIndex > 1 ? <Check className="w-4 h-4 text-emerald-400" /> : '1'}
                  </div>
                  <span className={`text-[11px] font-bold ${statusInfo.stepIndex >= 1 ? 'text-zinc-900' : 'text-zinc-400'}`}>
                    تم الطلب
                  </span>
                </div>

                {/* Step 2: قيد التجهيز */}
                <div className="flex flex-col items-center text-center group">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition-all mb-1.5 ${
                    statusInfo.stepIndex >= 2 ? 'bg-black text-white shadow-xs' : 'bg-zinc-200 text-zinc-500'
                  }`}>
                    {statusInfo.stepIndex > 2 ? <Check className="w-4 h-4 text-emerald-400" /> : '2'}
                  </div>
                  <span className={`text-[11px] font-bold ${statusInfo.stepIndex >= 2 ? 'text-zinc-900' : 'text-zinc-400'}`}>
                    التجهيز والتغليف
                  </span>
                </div>

                {/* Step 3: مع التوصيل */}
                <div className="flex flex-col items-center text-center group">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition-all mb-1.5 ${
                    statusInfo.stepIndex >= 3 ? 'bg-black text-white shadow-xs' : 'bg-zinc-200 text-zinc-500'
                  }`}>
                    {statusInfo.stepIndex > 3 ? <Check className="w-4 h-4 text-emerald-400" /> : '3'}
                  </div>
                  <span className={`text-[11px] font-bold ${statusInfo.stepIndex >= 3 ? 'text-zinc-900' : 'text-zinc-400'}`}>
                    مع التوصيل
                  </span>
                </div>

                {/* Step 4: تم التسليم */}
                <div className="flex flex-col items-center text-center group">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition-all mb-1.5 ${
                    statusInfo.stepIndex >= 4 ? 'bg-emerald-600 text-white shadow-xs ring-4 ring-emerald-100' : 'bg-zinc-200 text-zinc-500'
                  }`}>
                    {statusInfo.stepIndex >= 4 ? <Check className="w-4 h-4 text-white" /> : '4'}
                  </div>
                  <span className={`text-[11px] font-bold ${statusInfo.stepIndex >= 4 ? 'text-emerald-700' : 'text-zinc-400'}`}>
                    تم التسليم
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-3 bg-rose-100/80 border border-rose-300 rounded-xl text-rose-900 text-xs font-bold flex items-center gap-2">
              <XCircle className="w-4 h-4 text-rose-700 shrink-0" />
              <span>هذا الطلب ملغي. إذا كان لديكِ أي استفسار يرجى التواصل مع فريق خدمة العملاء.</span>
            </div>
          )}
        </div>

        {/* Invoice Meta */}
        <div className="p-6 sm:p-8 grid grid-cols-1 sm:grid-cols-2 gap-6 border-b border-zinc-100 bg-white">
          <div className="space-y-1">
            <h3 className="text-xs font-bold text-zinc-400 uppercase">معلومات المستلم والتوصيل</h3>
            <p className="font-black text-zinc-900 text-base">{order.customerName}</p>
            <p className="text-zinc-600 font-mono text-sm" dir="ltr">{order.customerPhone}</p>
            {order.addressStreet && (
              <p className="text-xs text-zinc-600 flex items-center gap-1.5 pt-1">
                <MapPin className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                <span>{order.addressStreet}</span>
              </p>
            )}
          </div>
          <div className="space-y-1 sm:text-left">
            <h3 className="text-xs font-bold text-zinc-400 uppercase">تفاصيل الإصدار والحالة</h3>
            <p className="font-bold text-zinc-900 text-sm">{dateStr}</p>
            <div className="pt-1.5">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black border ${statusInfo.badgeClass}`}>
                <span>الحالة الحالية:</span>
                <strong>{statusInfo.label}</strong>
              </span>
            </div>
          </div>
        </div>

        {/* Invoice Items */}
        <div className="p-6 sm:p-8">
          <table className="w-full text-right mb-8">
            <thead>
              <tr className="border-b-2 border-zinc-200 text-zinc-600 text-sm">
                <th className="pb-3 font-bold">المنتج</th>
                <th className="pb-3 font-bold text-center">الكمية</th>
                <th className="pb-3 font-bold">سعر الوحدة</th>
                <th className="pb-3 font-bold">المجموع</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {(order.items || []).map((item: any) => {
                const isModifiedItem = allModifications.some((m: any) => 
                  m.notes && (m.notes.includes(item.name) || (item.sku && m.notes.includes(item.sku)))
                );

                let itemImage = item.imageUrl || item.image || null;
                if (!itemImage && item.product?.images?.length > 0) {
                  const main = item.product.images.find((img: any) => img.isMain);
                  itemImage = main?.url || item.product.images[0]?.url || null;
                }
                if (!itemImage && item.product?.variants?.length > 0) {
                  const matchingVariant = item.product.variants.find((v: any) => v.id === item.variantId || v.sku === item.sku);
                  itemImage = matchingVariant?.imageUrl || item.product.variants[0]?.imageUrl || null;
                }
                if (!itemImage) {
                  const catalogItem = COSMETICS_CATALOG.find(p => 
                    p.id === item.productId || 
                    p.sku === item.sku || 
                    p.nameAr === item.name || 
                    p.nameEn === item.name
                  );
                  if (catalogItem) {
                    itemImage = catalogItem.images?.find(i => i.isMain)?.url || catalogItem.images?.[0]?.url || null;
                  }
                }

                return (
                  <tr key={item.id} className="border-b border-zinc-100 hover:bg-zinc-50/50 transition-colors">
                    <td className="py-4">
                      <div className="flex items-center gap-3">
                        {itemImage ? (
                          <div className="w-12 h-12 rounded-xl overflow-hidden border border-zinc-200 bg-white shrink-0">
                            <img src={itemImage} alt={item.name} className="w-full h-full object-cover" />
                          </div>
                        ) : (
                          <div className="w-12 h-12 rounded-xl border border-dashed border-zinc-200 bg-zinc-50 flex items-center justify-center shrink-0 text-pink-400">
                            <ShoppingBag className="w-5 h-5" />
                          </div>
                        )}
                        <div>
                          <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                            <p className="font-bold text-[var(--color-charcoal-900)]">{item.name}</p>
                            {isModifiedItem && (
                              <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-black shrink-0">
                                صنف مضاف بالتعديل ✨
                              </span>
                            )}
                          </div>
                          {(item.colorName || item.shade) && (
                            <div className="my-1 flex items-center gap-1.5">
                              <span className="text-[11px] font-bold px-2 py-0.5 bg-pink-50 border border-pink-200 text-[#E6007E] rounded-md">
                                {item.colorName ? `الرائحة / الخيار: ${item.colorName}` : ''} {item.shade ? `(الدرجة: ${item.shade})` : ''}
                              </span>
                            </div>
                          )}
                          <p className="text-xs text-zinc-500">
                            {item.size ? `${item.size} - ` : ''}
                            {item.barcode ? `باركود: ${item.barcode}` : `SKU: ${item.sku}`}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 text-center font-bold">{item.quantity}</td>
                    <td className="py-4 text-zinc-700">{filsToDisplay(item.unitPrice, 'ar')}</td>
                    <td className="py-4 font-bold text-[var(--color-charcoal-900)]">{filsToDisplay(item.total, 'ar')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Totals */}
          <div className="flex justify-end">
            <div className="w-64 space-y-3 text-sm">
              <div className="flex justify-between text-zinc-600">
                <span>المجموع الفرعي</span>
                <span>{filsToDisplay(Math.max(0, (order.totalAmount || 0) - (order.shippingCost || 0)), 'ar')}</span>
              </div>
              <div className="flex justify-between text-zinc-600">
                <span>رسوم التوصيل</span>
                <span>{filsToDisplay(order.shippingCost || 0, 'ar')}</span>
              </div>
              <div className="flex justify-between items-baseline font-bold text-xl text-[var(--color-charcoal-900)] pt-3 border-t-2 border-zinc-200">
                <div>
                  <span>الإجمالي</span>
                  {allModifications.length > 0 && (
                    <span className="text-[10px] font-bold text-amber-700 block">معدل رسمياً</span>
                  )}
                </div>
                <span className="text-[var(--color-champagne-600)]">{filsToDisplay(order.totalAmount || 0, 'ar')}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Official Transparency & Price Change Audit Notice */}
        {allModifications.length > 0 && (
          <div className="mx-6 sm:mx-8 mb-6 p-4 sm:p-5 rounded-2xl border-2 border-amber-300 bg-amber-50/90 text-amber-950 shadow-xs space-y-3.5">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-amber-200">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-xl bg-amber-200 text-amber-900 flex items-center justify-center font-bold text-sm shrink-0">
                  ⚖️
                </span>
                <div>
                  <h3 className="font-black text-amber-950 text-sm sm:text-base">
                    سجل وتفاصيل تعديل الفاتورة (الشفافية والنزاهة)
                  </h3>
                  <p className="text-[11px] text-amber-800/80 font-medium">
                    توثيق كامل لكافة التعديلات والأصناف المضافة/المحذوفة وتغيرات السعر المعتمدة على هذا الطلب
                  </p>
                </div>
              </div>
              <span className="self-start sm:self-auto px-2.5 py-1 rounded-full bg-amber-200 text-amber-900 font-extrabold text-[11px] border border-amber-300 shrink-0">
                {allModifications.length} {allModifications.length === 1 ? 'تعديل مسجل' : 'تعديلات مسجلة'}
              </span>
            </div>

            {/* List of modifications */}
            <div className="space-y-3">
              {allModifications.map((mod: any, idx: number) => {
                const parsed = parseModificationAudit(mod.notes || '');
                const modDate = mod.createdAt ? new Date(mod.createdAt).toLocaleString('ar-JO-u-nu-latn', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit'
                }) : '';

                return (
                  <div key={mod.id || idx} className="p-3.5 sm:p-4 bg-white rounded-xl border border-amber-200 shadow-2xs space-y-2.5">
                    {/* Entry Header: Badge & Date */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-100 pb-2">
                      <div className="flex items-center gap-2">
                        <span className={`px-2.5 py-0.5 rounded-md font-black text-[11px] flex items-center gap-1.5 ${
                          parsed.actionType === 'ADD' 
                            ? 'bg-emerald-100 text-emerald-900 border border-emerald-200' 
                            : parsed.actionType === 'REMOVE'
                            ? 'bg-rose-100 text-rose-900 border border-rose-200'
                            : 'bg-amber-100 text-amber-900 border border-amber-200'
                        }`}>
                          <FileEdit className="w-3 h-3" />
                          <span>{parsed.actionTitle || `تعديل فاتورة #${idx + 1}`}</span>
                        </span>
                      </div>

                      {modDate && (
                        <div className="flex items-center gap-1.5 text-[11px] font-bold text-zinc-500 font-mono" dir="ltr">
                          <Clock className="w-3 h-3 text-zinc-400" />
                          <span>{modDate}</span>
                        </div>
                      )}
                    </div>

                    {/* Parsed Breakdown */}
                    {parsed.itemName && (
                      <div className="bg-amber-50/50 p-2.5 rounded-lg border border-amber-200/60 text-xs space-y-1.5">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                          <div className="font-extrabold text-zinc-900 flex items-center gap-1.5">
                            <span className="text-amber-700">📦</span>
                            <span>{parsed.itemName}</span>
                          </div>
                          {(parsed.quantity || parsed.unitPrice || parsed.amountImpact) && (
                            <div className="flex items-center gap-2 text-[11px] font-bold">
                              {parsed.quantity && <span className="text-zinc-600">الكمية: {parsed.quantity}</span>}
                              {parsed.unitPrice && <span className="text-zinc-600">| السعر: {parsed.unitPrice}</span>}
                              {parsed.amountImpact && (
                                <span className={parsed.actionType === 'ADD' ? 'text-emerald-700 font-black' : 'text-rose-700 font-black'}>
                                  {parsed.amountImpact}
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Price Change Banner */}
                        {parsed.priceChange && (
                          <div className="p-2 rounded bg-white border border-amber-200 text-amber-900 font-bold text-[11px] flex items-center gap-1.5">
                            <ArrowLeftRight className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <span>{parsed.priceChange}</span>
                          </div>
                        )}

                        {/* Reason */}
                        {parsed.reason && (
                          <div className="text-[11px] text-zinc-800 font-bold flex items-center gap-1 pt-0.5">
                            <span className="text-amber-800 font-black">📌 سبب التعديل:</span>
                            <span className="text-zinc-900">{parsed.reason}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Full Raw Note Display */}
                    <div className="text-[11px] text-zinc-800 bg-zinc-50 p-2.5 rounded-lg border border-zinc-200 leading-relaxed font-medium">
                      <span className="font-bold text-zinc-900 block mb-0.5">ملاحظة التعديل المسجلة:</span>
                      <p className="font-mono text-[11px] text-zinc-700 break-words">{mod.notes}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Official Assurance Footer */}
            <div className="pt-1 flex items-center gap-2 text-[11px] text-amber-900 font-bold">
              <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>
                توثيق نظام النزاهة الرسمي: كافة التعديلات مسجلة إلكترونياً بالتاريخ الدقيق وسبب التعديل لضمان حقوق العميل ومحل غزل.
              </span>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="bg-zinc-50 p-6 text-center border-t border-zinc-200">
          <p className="text-zinc-600 font-bold mb-2">شكراً لثقتكم بمحل غزل للمكياج والتجميل 🌟</p>
          <p className="text-xs text-zinc-400">للاستفسارات، يرجى التواصل معنا عبر وسائل التواصل المعتمدة.</p>
        </div>
      </div>
      
      {/* Print Button (Hidden on print) */}
      <div className="max-w-2xl mx-auto mt-6 text-center print:hidden">
        <PrintInvoiceButton />
      </div>

      {/* Global Print Styles */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page { margin: 0; }
          body { 
            margin: 1.6cm; 
            -webkit-print-color-adjust: exact !important; 
            print-color-adjust: exact !important; 
          }
        }
      ` }} />
    </div>
  );
}
