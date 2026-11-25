import React from 'react';
import Link from 'next/link';
import { getCMSContent } from '@/lib/cms';
import { RefreshCw, ShieldAlert, CheckCircle2, Clock, Sparkles, Store, MessageCircle } from 'lucide-react';

export default async function ReturnsPage({ params }: { params: Promise<{ locale: string }> }) {
  const resolvedParams = await params;
  const locale = resolvedParams.locale;
  const isAr = locale === 'ar';

  const defaultReturns = {
    titleAr: 'سياسة الاستبدال والاسترجاع',
    titleEn: 'Returns & Exchanges Policy',
    introAr: 'في محل غزل للمكياجات ومستحضرات التجميل (عين الباشا)، نضع رضاكِ وسلامتكِ على رأس أولوياتنا. يسعدنا تقديم خدمة استبدال واسترجاع مرنة وسريعة وفقاً للضوابط الصحية ومعايير حماية المستهلك الأردنية.',
    introEn: 'At Ghazal Cosmetics (Ain Al-Basha), your satisfaction and safety come first. We are pleased to provide a transparent and flexible return and exchange service complying with Jordan health and consumer protection guidelines.'
  };

  const cms = await getCMSContent('returns_policy', defaultReturns);

  return (
    <div className="bg-white min-h-screen py-12 md:py-16" style={{ backgroundColor: '#ffffff', colorScheme: 'only light' }}>
      <div className="container mx-auto px-4 sm:px-6 max-w-4xl">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#FADAE6] text-[#E6007E] text-xs md:text-sm font-bold mb-4">
            <RefreshCw className="w-4 h-4" />
            <span>{isAr ? 'ضمان غزل للرضا والسلامة الصحية' : 'Ghazal Satisfaction Guarantee'}</span>
          </div>
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-black text-[#1A1A1A] tracking-tight mb-4">
            {isAr ? cms.titleAr : cms.titleEn}
          </h1>
          <p className="text-zinc-600 max-w-2xl mx-auto text-sm md:text-base leading-relaxed">
            {isAr ? cms.introAr : cms.introEn}
          </p>
        </div>

        {/* Quick Highlights Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
          <div className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-pink-50 text-[#E6007E] flex items-center justify-center shrink-0">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-zinc-900">{isAr ? 'مهلة 3 أيام' : '3 Days Window'}</h3>
              <p className="text-xs text-zinc-500">{isAr ? 'من تاريخ استلام الطلبية' : 'From delivery receipt'}</p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-pink-50 text-[#E6007E] flex items-center justify-center shrink-0">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-zinc-900">{isAr ? 'الغلاف الأصلي محكم' : 'Sealed & Unused'}</h3>
              <p className="text-xs text-zinc-500">{isAr ? 'حرصاً على السلامة الصحية' : 'Hygiene compliance'}</p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-pink-50 text-[#E6007E] flex items-center justify-center shrink-0">
              <Store className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-zinc-900">{isAr ? 'استبدال بالفرع فوراً' : 'Instant Store Swap'}</h3>
              <p className="text-xs text-zinc-500">{isAr ? 'في معرضنا بعين الباشا' : 'At Ain Al-Basha shop'}</p>
            </div>
          </div>
        </div>

        {/* Policy Body Content */}
        <div className="bg-white rounded-2xl p-6 sm:p-10 shadow-sm border border-zinc-200 space-y-8 mb-10 text-zinc-800">
          {/* Section 1 */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-[#E6007E] text-white text-xs font-bold flex items-center justify-center">1</span>
              <h2 className="text-xl font-bold text-[#1A1A1A]">
                {isAr ? 'شروط استبدال واسترجاع مستحضرات التجميل' : 'General Cosmetic Return Terms'}
              </h2>
            </div>
            <p className="text-sm md:text-base leading-relaxed text-zinc-600 ps-9">
              {isAr
                ? 'نظراً لأن منتجات المكياج، البودرة، أحمر الشفاه، وأمصال العناية بالبشرة تعتبر منتجات ذات استخدام شخصي حساس وتخضع للاشتراطات الصحية الوقائية؛ يُشترط لإتمام الاسترجاع أو الاستبدال ما يلي:'
                : 'Because cosmetic and skincare products are intimate personal care items governed by strict public hygiene codes, the following requirements apply:'}
            </p>
            <ul className="space-y-2 ps-9 text-sm text-zinc-700">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>{isAr ? 'أن يكون المنتج غير مفتوح نهائياً ومحتفظاً بغلاف السيلوفان، اللواصق الأمنية، والكرتونة الأصلية بحالتها الجديدة.' : 'Products must remain completely unopened with factory cellophane seals intact.'}</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>{isAr ? 'إبراز الفاتورة المرفقة مع الطلب (سواء كانت فاتورة إلكترونية أو فاتورة ورقية من الكاشير).' : 'Presentation of the sales receipt or electronic invoice.'}</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>{isAr ? 'تقديم طلب الإرجاع أو الاستبدال خلال فترة أقصاها 3 أيام تقويمية من تاريخ استلام الشحنة.' : 'Submitting the request within 3 calendar days of receipt.'}</span>
              </li>
            </ul>
          </section>

          <hr className="border-zinc-100" />

          {/* Section 2 */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-[#E6007E] text-white text-xs font-bold flex items-center justify-center">2</span>
              <h2 className="text-xl font-bold text-[#1A1A1A]">
                {isAr ? 'حالات التلف المصنعي أو إرسال منتج غير مطابق (ضمان غزل الذهبي)' : 'Damaged or Incorrect Items (Ghazal Guarantee)'}
              </h2>
            </div>
            <p className="text-sm md:text-base leading-relaxed text-zinc-600 ps-9">
              {isAr
                ? 'إذا استلمتِ طلبيتكِ ووجدتِ أي تضرر ناجم عن الشحن (مثل كسر باليتة ظلال أو تسرب عطر)، أو وصلكِ منتج بدرجة لونية غير التي قمتِ بطلبها:'
                : 'If you receive an item damaged during transit (broken palette, leaking bottle) or receive a shade differing from your order:'}
            </p>
            <div className="ps-9 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm space-y-1">
              <p className="font-bold">{isAr ? '✔ استبدال فوري ومجاني:' : '✔ Free Instant Replacement:'}</p>
              <p>
                {isAr
                  ? 'يتحمل محل غزل كافة تكاليف إعادة الشحن وإرسال بديل فوري لكِ، أو استرداد كامل المبلغ دون أي اقتطاعات.'
                  : 'Ghazal covers all shipping fees to replace the item or refund your full payment.'}
              </p>
            </div>
          </section>

          <hr className="border-zinc-100" />

          {/* Section 3 */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-[#E6007E] text-white text-xs font-bold flex items-center justify-center">3</span>
              <h2 className="text-xl font-bold text-[#1A1A1A]">
                {isAr ? 'الاستبدال المباشر في معرض عين الباشا' : 'In-Store Exchange at Ain Al-Basha'}
              </h2>
            </div>
            <p className="text-sm md:text-base leading-relaxed text-zinc-600 ps-9">
              {isAr
                ? 'لتوفير وقتكِ ورسوم التوصيل، يسعدنا جداً استقبالكِ في معرضنا الرئيسي في عين الباشا (السوق التجاري)، حيث يمكنكِ استبدال أي منتج فورياً واختيار الدرجات المناسبة لبشرتكِ بمساعدة خبيرات التجميل المتواجدات في المحل.'
                : 'Save time and delivery fees by visiting our Ain Al-Basha showroom in the commercial market. You can swap shades instantly on the spot with guidance from our beauty advisors.'}
            </p>
          </section>

          <hr className="border-zinc-100" />

          {/* Section 4 */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-[#E6007E] text-white text-xs font-bold flex items-center justify-center">4</span>
              <h2 className="text-xl font-bold text-[#1A1A1A]">
                {isAr ? 'خطوات تقديم طلب الاستبدال أو الاسترجاع' : 'How to Initiate an Exchange/Return'}
              </h2>
            </div>
            <ol className="space-y-3 ps-9 text-sm text-zinc-700">
              <li className="flex items-start gap-3">
                <span className="font-bold text-[#E6007E]">أ.</span>
                <span>{isAr ? 'التقاط صورة واضحة للمنتج وحالته مع رقم الفاتورة أو إيصال الشراء.' : 'Take a clear photo of the product in its packaging along with the receipt.'}</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="font-bold text-[#E6007E]">ب.</span>
                <span>{isAr ? 'مراسلتنا عبر تطبيق واتساب على الرقم +962776299243 موضحةً سبب الاستبدال ورقم الطلب.' : 'Send a WhatsApp message to +962776299243 stating your order number and request reason.'}</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="font-bold text-[#E6007E]">ج.</span>
                <span>{isAr ? 'سيقوم فريق الدعم بالتأكيد معكِ خلال ساعتين وترتيب مندوب الاستبدال أو تجهيز البديل للاستلام من فرع عين الباشا.' : 'Our team confirms within 2 hours to arrange a courier swap or branch pick-up.'}</span>
              </li>
            </ol>
          </section>
        </div>

        {/* WhatsApp & Location Banner */}
        <div className="bg-gradient-to-r from-[#1A1A1A] to-[#2D0F21] rounded-2xl p-6 sm:p-8 text-white text-center border border-[#E6007E]/30 shadow-lg">
          <Sparkles className="w-8 h-8 text-[#E6007E] mx-auto mb-3" />
          <h3 className="text-xl md:text-2xl font-bold mb-2">
            {isAr ? 'جاهزون لمساعدتكِ في أي وقت' : 'We Are Here to Assist You'}
          </h3>
          <p className="text-zinc-300 text-xs md:text-sm max-w-xl mx-auto mb-6 leading-relaxed">
            {isAr
              ? 'رضاكِ هو غايتنا. إذا واجهتِ أي صعوبة في اختيار الدرجة أو المنتجات المناسبة لبشرتكِ، تواصلي مع خبيراتنا مباشرة.'
              : 'Our beauty consultants are ready to assist with shade matching and product advice on WhatsApp.'}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <a
              href="https://wa.me/962776299243?text=%D9%85%D8%B1%D8%AD%D8%A8%D8%A7%D8%8C%20%D8%A3%D8%B1%D8%BA%D8%A8%20%D8%A8%D8%A7%D8%B3%D8%AA%D8%A8%D8%AF%D8%A7%D9%84%20%D8%A3%D9%88%20%D8%A7%D8%B3%D8%AA%D8%B1%D8%AC%D8%A7%D8%B9%20%D9%85%D9%86%D8%AA%D8%AC%20%D9%85%D9%86%20%D9%85%D8%AD%D9%84%20%D8%BA%D8%B2%D9%84"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#25D366] text-white font-bold text-sm hover:bg-[#20ba5a] transition-all shadow-md"
            >
              <MessageCircle className="w-5 h-5" />
              <span>{isAr ? 'مراسلة خدمة العملاء عبر واتساب' : 'WhatsApp Customer Service'}</span>
            </a>
            <Link
              href={`/${locale}/store-location`}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-sm transition-all border border-white/20"
            >
              <Store className="w-4 h-4" />
              <span>{isAr ? 'زيارة فرع عين الباشا' : 'Visit Ain Al-Basha Store'}</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
