import React from 'react';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { filsToDisplay } from '@/lib/money';
import { getDemoOrders } from '@/lib/orders-catalog';
import { CheckCircle2, Clock, FileText, ShoppingBag, MessageSquare, ShieldCheck, ArrowRight } from 'lucide-react';

export default async function OrderSuccessPage({
  params
}: {
  params: Promise<{ locale: string; orderReference: string }>
}) {
  const resolvedParams = await params;
  const locale = resolvedParams.locale;
  const orderReference = resolvedParams.orderReference;
  const isAr = locale === 'ar';

  let order: any = null;
  try {
    order = await prisma.order.findFirst({
      where: {
        OR: [
          { reference: orderReference },
          { id: orderReference }
        ]
      },
      include: {
        items: true
      }
    });
  } catch (err) {
    console.warn('Prisma order lookup failed in order-success page:', err);
  }

  if (!order) {
    const demoOrders = getDemoOrders();
    order = demoOrders.find((o: any) => o.reference === orderReference || o.id === orderReference);
  }

  if (!order) {
    order = {
      reference: orderReference,
      customerName: isAr ? 'عميلة متجر غزل' : 'Valued Customer',
      customerPhone: '',
      totalAmount: 0,
      shippingCost: 2000,
      items: []
    };
  }

  // Optional WhatsApp inquiry text
  const phoneNumber = '962776299243';
  const optionalMsg = `مرحباً محل غزل للمكياج والتجميل، لدي استفسار بخصوص طلبي المسجل رقم: ${order.reference}`;
  const optionalWhatsappUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(optionalMsg)}`;

  return (
    <div className="container mx-auto px-4 sm:px-6 py-12 md:py-16 bg-[var(--color-ivory-100)] min-h-screen" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="max-w-2xl mx-auto bg-white border border-[var(--color-ivory-200)] rounded-3xl p-6 sm:p-10 shadow-lg text-center animate-fade-in">
        {/* Success Icon */}
        <div className="w-20 h-20 mx-auto bg-emerald-50 rounded-full flex items-center justify-center mb-6 border-4 border-emerald-100 shadow-inner">
          <CheckCircle2 className="w-12 h-12 text-emerald-600" />
        </div>
        
        {/* Title */}
        <h1 className="text-2xl sm:text-3xl font-black font-heading text-[var(--color-charcoal-900)] mb-3">
          {isAr ? 'تم استلام وتسجيل طلبكِ بنجاح!' : 'Order Received Successfully!'}
        </h1>

        {/* Management Reassurance Message */}
        <div className="bg-emerald-50/80 border border-emerald-200 rounded-2xl p-4 sm:p-5 mb-6 text-right">
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
            <div className="space-y-1.5 text-xs text-emerald-950 leading-relaxed">
              <p className="font-black text-sm text-emerald-900">
                {isAr ? 'تم أخذ طلبكِ بنجاح وتفريغ السلة لضمان عدم تكرار الطلب' : 'Your order is recorded & cart has been emptied'}
              </p>
              <p className="text-emerald-800 font-medium">
                {isAr 
                  ? 'تم استلام طلبكِ في نظامنا، وسيقوم فريق إدارة المتجر بمراجعة وتأكيد طلبكِ والتواصل معكِ وإرسال الفاتورة الرسمية لكِ لتجهيز الشحنة إلى عنوانكِ. لا داعي لإعادة إرسال الطلب مرة أخرى.'
                  : 'Your order has been recorded. Our store management will review and confirm your order, contact you, and issue your official invoice. No need to resubmit.'}
              </p>
            </div>
          </div>
        </div>

        {/* Current Order Status */}
        <div className="flex flex-col sm:flex-row items-center justify-between p-3.5 bg-blue-50/80 border border-blue-200 rounded-2xl mb-6 gap-2">
          <span className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-blue-600" />
            <span>{isAr ? 'حالة الطلب الحالية:' : 'Current Status:'}</span>
          </span>
          <span className="bg-blue-100 text-blue-900 text-xs font-black px-3 py-1 rounded-full border border-blue-300">
            {isAr ? 'طلب جديد (قيد المراجعة والتأكيد من الإدارة)' : 'New Order (Pending Management Confirmation)'}
          </span>
        </div>

        {/* Order Details Card */}
        <div className="bg-[var(--color-ivory-100)] p-5 sm:p-6 rounded-2xl text-right mb-8 border border-zinc-200">
          <div className="flex justify-between border-b border-zinc-200 pb-2.5 mb-2.5 text-xs sm:text-sm text-zinc-600">
            <span>{isAr ? 'رقم مرجع الطلب:' : 'Order Reference:'}</span>
            <span className="font-black font-mono text-zinc-900">{order.reference}</span>
          </div>
          <div className="flex justify-between border-b border-zinc-200 pb-2.5 mb-2.5 text-xs sm:text-sm text-zinc-600">
            <span>{isAr ? 'اسم المستلم:' : 'Customer Name:'}</span>
            <span className="font-bold text-zinc-900">{order.customerName}</span>
          </div>
          {order.customerPhone && (
            <div className="flex justify-between border-b border-zinc-200 pb-2.5 mb-2.5 text-xs sm:text-sm text-zinc-600">
              <span>{isAr ? 'رقم الهاتف:' : 'Phone Number:'}</span>
              <span className="font-bold text-zinc-900 font-mono" dir="ltr">{order.customerPhone}</span>
            </div>
          )}
          {order.items && order.items.length > 0 && (
            <div className="flex justify-between border-b border-zinc-200 pb-2.5 mb-2.5 text-xs sm:text-sm text-zinc-600">
              <span>{isAr ? 'عدد الأصناف المطلوبة:' : 'Items Count:'}</span>
              <span className="font-bold text-zinc-900">{order.items.length} أصناف</span>
            </div>
          )}
          <div className="flex justify-between text-base sm:text-lg font-black text-[var(--color-charcoal-900)] pt-1.5">
            <span>{isAr ? 'المبلغ الإجمالي:' : 'Grand Total:'}</span>
            <span className="text-[#E6007E] font-bold font-mono">{filsToDisplay(order.totalAmount, isAr ? 'ar' : 'en')}</span>
          </div>
        </div>

        {/* Primary Action Buttons */}
        <div className="space-y-3">
          {/* View Official Invoice Button */}
          <Link 
            href={`/${locale}/invoice/${order.reference}`}
            className="flex items-center justify-center gap-2 w-full bg-[#E6007E] hover:bg-[#c2006a] text-white py-4 rounded-2xl font-black text-sm shadow-md transition-all active:scale-[0.99]"
          >
            <FileText className="w-5 h-5" />
            <span>{isAr ? 'عرض الفاتورة الرسمية وتفاصيل الطلب' : 'View Official Invoice & Order Details'}</span>
          </Link>
          
          {/* Continue Shopping Button */}
          <Link 
            href={`/${locale}/shop`}
            className="flex items-center justify-center gap-2 w-full bg-[var(--color-ivory-200)] hover:bg-[var(--color-ivory-300)] text-[var(--color-charcoal-900)] py-3.5 rounded-2xl font-bold text-xs sm:text-sm transition-colors"
          >
            <ShoppingBag className="w-4 h-4" />
            <span>{isAr ? 'العودة للتسوق في متجر غزل' : 'Continue Shopping at Ghazal'}</span>
          </Link>

          {/* Optional Support Contact (Optional, not for confirmation) */}
          <div className="pt-4 border-t border-zinc-100 text-center">
            <a 
              href={optionalWhatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-zinc-500 hover:text-emerald-700 text-xs font-semibold transition"
            >
              <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
              <span>{isAr ? 'هل لديكِ استفسار إضافي؟ تواصلي مع الإدارة عبر الواتساب' : 'Have a question? Chat with management on WhatsApp'}</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
