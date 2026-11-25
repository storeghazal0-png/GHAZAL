import React from 'react';
import Link from 'next/link';
import { filsToDisplay } from '@/lib/money';
import { getCMSContent } from '@/lib/cms';
import { Truck, Clock, ShieldCheck, MapPin, Store, CheckCircle2, PhoneCall, AlertCircle } from 'lucide-react';
import { getShippingZonesList } from '@/actions/shipping';

export default async function ShippingPage({ params }: { params: Promise<{ locale: string }> }) {
  const resolvedParams = await params;
  const locale = resolvedParams.locale;
  const isAr = locale === 'ar';

  const defaultIntro = {
    titleAr: 'معلومات وسياسة الشحن والتوصيل',
    titleEn: 'Shipping & Delivery Policy',
    introAr: 'نوفر في محل غزل لمستحضرات التجميل والمكياج (عين الباشا) خدمة توصيل آمنة ومغلفة بعناية لكافة مناطق ومحافظات المملكة الأردنية الهاشمية.',
    introEn: 'At Ghazal Cosmetics (Ain Al-Basha), we offer secure, carefully packaged delivery across all Jordan governorates.'
  };

  const cms = await getCMSContent('shipping_policy', defaultIntro);

  // Canonical 12 Jordanian Governorates Shipping Zones (100% synchronized with admin & checkout)
  const displayZones = await getShippingZonesList();

  return (
    <div className="bg-white min-h-screen py-12 md:py-16" style={{ backgroundColor: '#ffffff', colorScheme: 'only light' }}>
      <div className="container mx-auto px-4 sm:px-6 max-w-5xl">
        {/* Header Breadcrumb & Title */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#FADAE6] text-[#E6007E] text-xs md:text-sm font-bold mb-4">
            <Truck className="w-4 h-4" />
            <span>{isAr ? 'توصيل موثوق وتغليف محكم لكافة المحافظات' : 'Reliable Delivery Across Jordan'}</span>
          </div>
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-black text-[#1A1A1A] tracking-tight mb-4">
            {isAr ? cms.titleAr : cms.titleEn}
          </h1>
          <p className="text-zinc-600 max-w-2xl mx-auto text-sm md:text-base leading-relaxed">
            {isAr ? cms.introAr : cms.introEn}
          </p>
        </div>

        {/* IMPORTANT POLICY ALERT: 2 to 3 days delivery + No instant delivery without direct phone contact */}
        <div className="bg-amber-50 border-2 border-amber-300/80 rounded-2xl p-6 md:p-7 mb-10 text-amber-950 shadow-xs">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-amber-200 text-amber-900 flex items-center justify-center shrink-0">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div className="space-y-2 text-xs md:text-sm leading-relaxed">
              <h3 className="text-base font-extrabold text-amber-950">
                {isAr ? 'سياسة مواعيد التوصيل والتوصيل الفوري — تنبيه هام للزبائن الكرام:' : 'Delivery Lead Time & Instant Delivery Notice:'}
              </h3>
              <p className="font-bold text-amber-900">
                {isAr
                  ? '• مدة العمل وتجهيز وشحن الطلبيات لكافة المناطق والمحافظات تتراوح بين يومين إلى 3 أيام (2 - 3 أيام).'
                  : '• Order preparation and delivery lead time for all areas is 2 to 3 business days.'}
              </p>
              <p className="font-semibold text-amber-900">
                {isAr
                  ? '• لا يوجد توصيل فوري لأي منطقة (بما في ذلك المناطق القريبة من المحل كعين الباشا وصويلح وصافوط والبقعة) إلا عند الاتصال الهاتفي والتنسيق المسبق المباشر مع إدارة المحل.'
                  : '• There is no instant or same-day delivery to any region (including nearby areas) except upon prior telephone call and direct coordination with our store management.'}
              </p>
            </div>
          </div>
        </div>

        {/* Click & Collect Banner */}
        <div className="bg-gradient-to-r from-[#1A1A1A] to-[#2D0F21] rounded-2xl p-6 md:p-8 text-white shadow-lg mb-10 border border-[#E6007E]/30 relative overflow-hidden">
          <div className="absolute top-0 end-0 w-64 h-64 bg-[#E6007E]/10 rounded-full blur-3xl -translate-y-12 translate-x-12 pointer-events-none" />
          <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#E6007E] text-white flex items-center justify-center shrink-0 shadow-md">
                <Store className="w-6 h-6" />
              </div>
              <div>
                <div className="inline-block px-2.5 py-0.5 rounded text-[11px] font-bold bg-[#E6007E] text-white mb-1">
                  {isAr ? 'خدمة مجانية بالكامل' : 'Free Service'}
                </div>
                <h2 className="text-xl md:text-2xl font-bold mb-1">
                  {isAr ? 'الاستلام المباشر من معرضنا في عين الباشا (Click & Collect)' : 'Store Pickup in Ain Al-Basha'}
                </h2>
                <p className="text-zinc-300 text-xs md:text-sm leading-relaxed">
                  {isAr
                    ? 'اطلبي منتجاتكِ عبر الموقع واستلميها جاهزة ومغلفة مباشرة من معرضنا في عين الباشا (السوق التجاري) دون أي رسوم توصيل!'
                    : 'Order online and pick up directly from our Ain Al-Basha showroom with zero shipping fees.'}
                </p>
              </div>
            </div>
            <a
              href="https://wa.me/962776299243?text=%D9%85%D8%B1%D8%AD%D8%A8%D8%A7%D8%8C%20%D8%A3%D8%B1%D8%BA%D8%A8%20%D8%A8%D8%A7%D9%84%D8%AA%D9%86%D8%B3%D9%8A%D9%82%20%D9%84%D8%A7%D8%B3%D8%AA%D9%84%D8%A7%D9%85%20%D8%B7%D9%84%D8%A8%20%D9%85%D9%86%20%D8%A7%D9%84%D9%85%D8%AD%D9%84"
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 px-6 py-3 rounded-xl bg-white text-[#1A1A1A] font-bold text-sm hover:bg-[#FADAE6] hover:text-[#E6007E] transition-colors shadow"
            >
              {isAr ? 'تنسيق الاستلام عبر واتساب' : 'Coordinate Pickup via WhatsApp'}
            </a>
          </div>
        </div>

        {/* Delivery Rates & Working Schedules Table */}
        <div className="bg-white rounded-2xl p-6 md:p-8 shadow-sm border border-zinc-200 mb-10">
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-zinc-100">
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-[#1A1A1A]">
                {isAr ? 'جدول رسوم وفترات التوصيل' : 'Delivery Rates & Schedules'}
              </h2>
              <p className="text-xs md:text-sm text-zinc-500 mt-1">
                {isAr ? 'الأسعار محددة بالدينار الأردني (JOD) مع مدة التوصيل الفعلية (2 - 3 أيام)' : 'Prices in Jordanian Dinar with actual delivery time (2 - 3 days)'}
              </p>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-slate-100 px-3 py-1.5 rounded-lg">
              <Clock className="w-4 h-4 text-slate-500" />
              <span>{isAr ? 'خلال 2 إلى 3 أيام عمل' : '2 - 3 Business Days'}</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-start border-collapse">
              <thead>
                <tr className="bg-zinc-50 text-zinc-700 text-xs md:text-sm font-bold border-b border-zinc-200">
                  <th className="py-3.5 px-4 text-start">{isAr ? 'المحافظة / المنطقة المشمولة' : 'Governorate / Area'}</th>
                  <th className="py-3.5 px-4 text-start">{isAr ? 'رسوم التوصيل المعتمدة' : 'Delivery Fee'}</th>
                  <th className="py-3.5 px-4 text-start">{isAr ? 'الوقت المتوقع للتوصيل' : 'Est. Delivery Time'}</th>
                  <th className="py-3.5 px-4 text-start">{isAr ? 'حالة التغطية' : 'Coverage Status'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 text-xs md:text-sm">
                {displayZones.map((zone: any, idx: number) => {
                  const feeDisplay = typeof zone.fee === 'number' ? filsToDisplay(zone.fee, isAr ? 'ar' : 'en') : `${zone.fee} د.أ`;

                  return (
                    <tr
                      key={zone.id || idx}
                      className="hover:bg-[#FADAE6]/10 transition-colors"
                    >
                      <td className="py-4 px-4 text-zinc-900 font-bold">
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-[#E6007E] shrink-0" />
                          <span>{isAr ? (zone.nameAr || zone.name) : (zone.nameEn || zone.name)}</span>
                        </div>
                      </td>
                      <td className="py-4 px-4 text-[#E6007E] font-bold font-mono">{feeDisplay}</td>
                      <td className="py-4 px-4 text-zinc-800 font-semibold">{zone.estimatedDeliveryTime}</td>
                      <td className="py-4 px-4 font-semibold text-emerald-700">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 text-xs font-bold border border-emerald-200">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          {isAr ? 'مشمولة بالتوصيل' : 'Active Delivery'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Packaging & Safety Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-xl bg-pink-50 text-[#E6007E] flex items-center justify-center mb-4">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-base text-zinc-900 mb-2">
              {isAr ? 'تغليف آمن ومقاوم للكسر' : 'Secure Bubble Packaging'}
            </h3>
            <p className="text-zinc-600 text-xs md:text-sm leading-relaxed">
              {isAr
                ? 'تُغلف باليتات الظلال وزجاجات العطور والفاونديشن بطبقات حماية هوائية لضمان وصولها بسلامة تامة دون أي تضرر.'
                : 'Delicate palettes, powders, and fragrance bottles are bubble-wrapped to withstand handling.'}
            </p>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-xl bg-pink-50 text-[#E6007E] flex items-center justify-center mb-4">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-base text-zinc-900 mb-2">
              {isAr ? 'الدفع عند الاستلام وCliQ' : 'Cash on Delivery & CliQ'}
            </h3>
            <p className="text-zinc-600 text-xs md:text-sm leading-relaxed">
              {isAr
                ? 'يمكنكِ الدفع نقداً عند استلام طلبيتكِ ومعاينتها، أو الدفع الفوري عبر المحافظ الإلكترونية ونظام CliQ الأردني.'
                : 'Pay cash upon arrival or transfer via CliQ / mobile wallets safely when receiving your package.'}
            </p>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-xl bg-pink-50 text-[#E6007E] flex items-center justify-center mb-4">
              <PhoneCall className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-base text-zinc-900 mb-2">
              {isAr ? 'تنسيق مسبق للتوصيل الفوري' : 'Direct Phone Coordination'}
            </h3>
            <p className="text-zinc-600 text-xs md:text-sm leading-relaxed">
              {isAr
                ? 'في الحالات المستعجلة، يمكن التنسيق هاتفياً مع المحل للتحقق من إمكانية تجهيز التوصيل الفوري وفق الجدول المتاح.'
                : 'For urgent requirements, call our shop directly to arrange potential express dispatch.'}
            </p>
          </div>
        </div>

        {/* CTA Question box */}
        <div className="bg-[#FADAE6]/30 border border-[#E6007E]/30 rounded-2xl p-6 md:p-8 text-center">
          <h3 className="text-lg md:text-xl font-bold text-[#1A1A1A] mb-2">
            {isAr ? 'هل ترغبين في التنسيق لتوصيل فوري أو الاستفسار عن طلبيتكِ؟' : 'Need urgent delivery or order tracking?'}
          </h3>
          <p className="text-zinc-600 text-xs md:text-sm mb-6 max-w-xl mx-auto">
            {isAr
              ? 'تذكري أن التوصيل الفوري يتطلب اتصالاً وتنسيقاً مسبقاً مع المحل. فريق غزل في عين الباشا جاهز لمساعدتكِ فوراً عبر الواتساب.'
              : 'Instant delivery requires prior coordination. Our team in Ain Al-Basha is available on WhatsApp.'}
          </p>
          <a
            href="https://wa.me/962776299243?text=%D9%85%D8%B1%D8%AD%D8%A8%D8%A7%D8%8C%20%D8%A3%D8%B1%D8%BA%D8%A8%20%D8%A8%D8%A7%D9%84%D8%A7%D8%B3%D8%AA%D9%81%D8%B3%D8%A7%D8%B1%20%D8%B9%D9%86%20%D8%AE%D8%AF%D9%85%D8%A9%20%D8%A7%D9%84%D8%AA%D9%88%D8%B5%D9%8A%D9%84%20%D8%A3%D9%88%20%D8%A7%D9%84%D8%AA%D9%86%D8%B3%D9%8A%D9%82%20%D9%84%D8%B7%D9%84%D8%A8%20%D9%81%D9%88%D8%B1%D9%8A"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#25D366] text-white font-bold text-sm hover:bg-[#20ba5a] transition-all shadow-md"
          >
            <span>{isAr ? 'الاتصال والتنسيق المباشر عبر واتساب' : 'Coordinate on WhatsApp'}</span>
          </a>
        </div>
      </div>
    </div>
  );
}
