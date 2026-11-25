import React from 'react';
import Link from 'next/link';
import { getCMSContent } from '@/lib/cms';
import { HelpCircle, ChevronDown, Sparkles, MessageCircle, Store, ShieldCheck } from 'lucide-react';

export default async function FAQPage({ params }: { params: Promise<{ locale: string }> }) {
  const resolvedParams = await params;
  const locale = resolvedParams.locale;
  const isAr = locale === 'ar';

  const defaultFaqs = [
    {
      category: isAr ? 'الجودة والموثوقية' : 'Quality & Authenticity',
      qAr: 'هل جميع مستحضرات التجميل والمكياج لديكم موثوقة المصدر؟',
      qEn: 'Are all cosmetics and makeup products from verified sources?',
      aAr: 'نعم بكل تأكيد! نحن في محل غزل نلتزم بأعلى معايير الجودة والأمانة. جميع مستحضرات التجميل والمكياج والعناية بالبشرة والشعر والعطور مستوردة مباشرة من الوكلاء الرسميين والموزعين المعتمدين في الأردن.',
      aEn: 'Absolutely yes! At Ghazal Cosmetics, all products from global and local brands are sourced directly from certified authorized distributors in Jordan.'
    },
    {
      category: isAr ? 'موقع الفرع والاستلام' : 'Store Location & Pickup',
      qAr: 'أين يقع محل غزل في عين الباشا؟ وما هي أوقات الدوام؟',
      qEn: 'Where is Ghazal Cosmetics located in Ain Al-Basha? What are opening hours?',
      aAr: 'يقع معرضنا في لواء عين الباشا - الشارع الرئيسي / السوق التجاري (بالقرب من مركز الخدمات والبلدية، ومجاور لمناطق صويلح ومخيم البقعة)، محافظة البلقاء. نستقبلكم يومياً من السبت إلى الخميس: 10:00 صباحاً حتى 10:00 مساءً، ويوم الجمعة من 2:00 ظهراً حتى 10:00 مساءً.',
      aEn: 'Our showroom is located on Main Commercial Street in Ain Al-Basha (Balqa Governorate, neighboring Sweileh & Baqaa). Open Saturday to Thursday 10:00 AM - 10:00 PM, and Friday 2:00 PM - 10:00 PM.'
    },
    {
      category: isAr ? 'الشحن والتوصيل' : 'Delivery & Logistics',
      qAr: 'كم يستغرق توصيل الطلب إلى منزلي؟',
      qEn: 'How long does home delivery take?',
      aAr: 'تستغرق مدة العمل وتجهيز وتوصيل الطلبات لكافة مناطق ومحافظات المملكة بين يومين إلى 3 أيام (2 - 3 أيام). علماً بأنه لا يتوفر توصيل فوري لأي منطقة إلا عند الاتصال الهاتفي والتنسيق المسبق المباشر مع إدارة المحل.',
      aEn: 'Order processing and delivery across all Jordan governorates takes between 2 to 3 business days. Please note that instant delivery is only available upon prior phone contact and direct coordination with the store.'
    },
    {
      category: isAr ? 'الاستلام المباشر' : 'Store Pickup',
      qAr: 'هل يمكنني حجز المنتجات أونلاين واستلامها مباشرة من المعرض؟',
      qEn: 'Can I order online and pick up from the showroom?',
      aAr: 'نعم! خدمة الاستلام من المحل (Click & Collect) متاحة ومجانية تماماً بدون أي رسوم. بمجرد تأكيد طلبكِ، يتم تجهيزه وتغليفه ليكون جاهزاً للاستلام خلال ساعة واحدة من فرع عين الباشا.',
      aEn: 'Yes! Our Click & Collect service is completely free. Your package is prepared within 1 hour for quick pickup at our Ain Al-Basha branch.'
    },
    {
      category: isAr ? 'استشارات المكياج' : 'Beauty Advice',
      qAr: 'كيف أختار درجة الفاونديشن أو الكونسيلر المناسبة لبشرتي؟',
      qEn: 'How can I choose the right foundation or concealer shade for my skin?',
      aAr: 'خبراء وخبيرات التجميل في محل غزل جاهزون دائماً لتقديم استشارة تجميلية فورية ومجانية! يمكنكِ مراسلتنا عبر الواتساب وتزويدنا بنوع بشرتكِ أو الدرجات التي تناسبكِ عادة، وسنرشح لكِ الدرجة والتركيبة الأنسب بدقة تامة.',
      aEn: 'Our beauty consultants are available on WhatsApp to assist you with free shade matching and skincare advice tailored to your skin tone and type.'
    },
    {
      category: isAr ? 'طرق الدفع' : 'Payment Methods',
      qAr: 'ما هي طرق الدفع المتاحة عند الطلب؟',
      qEn: 'What payment methods do you accept?',
      aAr: 'نوفر لكِ كافة وسائل الدفع المريحة: الدفع نقداً عند استلام الطلبية (COD)، التحويل الفوري عبر نظام CliQ لأي حساب بنكي، الدفع عبر المحافظ الإلكترونية (زين كاش، أورانج موني، دينارك)، بالإضافة لبطاقات الدفع الإلكتروني في المعرض.',
      aEn: 'We accept Cash on Delivery (COD), instant bank transfers via CliQ, mobile wallets (Zain Cash, Orange Money, Dinarak), and card payments in-store.'
    },
    {
      category: isAr ? 'الاستبدال والاسترجاع' : 'Returns & Exchanges',
      qAr: 'ما هي شروط استبدال أو إرجاع مستحضرات التجميل؟',
      qEn: 'What is the return policy for cosmetics?',
      aAr: 'نظراً للطبيعة الصحية الخاصة بمستحضرات التجميل، يمكن الاستبدال أو الإرجاع خلال 3 أيام من الاستلام بشرط أن تكون العبوة مغلقة تماماً بغلاف السيلوفان واللاصق المصنعي ولم يتم فتحها أو استخدامها. وفي حال وجود أي كسر أو خطأ في الطلب، يتم الاستبدال فوراً مجاناً.',
      aEn: 'Cosmetics can be returned or exchanged within 3 days provided they are strictly unopened with original seals intact. Damaged or wrong items are replaced immediately for free.'
    },
    {
      category: isAr ? 'العروض والخصومات' : 'Deals & Offers',
      qAr: 'هل تقدمون عروضاً وتخفيضات وبكجات خاصة؟',
      qEn: 'Do you offer special deals, discounts, and cosmetic bundles?',
      aAr: 'نعم! نطلق بانتظام عروضاً حصرية، خصومات موسمية، وبكجات توفيرية مميزة للعرائس والمكياج اليومي. يمكنكِ تصفح تبويب "عروض خاصة" في المتجر أو متابعة صفحاتنا على مواقع التواصل الاجتماعي لتكوني أول من يعلم بالعروض الجديدة.',
      aEn: 'Yes! We regularly launch exclusive offers, seasonal discounts, and curated makeup/skincare bundles. Check the "Offers" tab on our website or follow our social accounts.'
    }
  ];

  const faqs = await getCMSContent('faq_content', defaultFaqs);
  const activeFaqs = Array.isArray(faqs) && faqs.length > 0 ? faqs : defaultFaqs;

  return (
    <div className="bg-white min-h-screen py-12 md:py-16" style={{ backgroundColor: '#ffffff', colorScheme: 'only light' }}>
      <div className="container mx-auto px-4 sm:px-6 max-w-4xl">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#FADAE6] text-[#E6007E] text-xs md:text-sm font-bold mb-4">
            <HelpCircle className="w-4 h-4" />
            <span>{isAr ? 'دليلكِ الشامل والشامل لكل ما يخص متجرنا' : 'Everything You Need to Know'}</span>
          </div>
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-black text-[#1A1A1A] tracking-tight mb-4">
            {isAr ? 'الأسئلة الشائعة' : 'Frequently Asked Questions'}
          </h1>
          <p className="text-zinc-600 max-w-2xl mx-auto text-sm md:text-base leading-relaxed">
            {isAr
              ? 'جمّعنا لكِ أهم الأسئلة التي يطرحها عملاؤنا الكرام حول الأصالة، فرع عين الباشا، مواعيد التوصيل، طرق الدفع وسياسة الاستبدال.'
              : 'Find answers to frequently asked questions regarding our authentic beauty catalog, Ain Al-Basha showroom, shipping timeframes, and policies.'}
          </p>
        </div>

        {/* FAQs List */}
        <div className="space-y-4 mb-12">
          {activeFaqs.map((faq: any, idx: number) => {
            const question = isAr ? (faq.qAr || faq.q) : (faq.qEn || faq.q);
            const answer = isAr ? (faq.aAr || faq.a) : (faq.aEn || faq.a);
            const category = faq.category;

            return (
              <details
                key={idx}
                className="group bg-white rounded-2xl border border-zinc-200 overflow-hidden shadow-sm transition-all hover:border-[#E6007E]/40"
                open={idx === 0 || idx === 1}
              >
                <summary className="flex items-center justify-between p-5 md:p-6 cursor-pointer list-none select-none font-bold text-base md:text-lg text-zinc-900 group-open:text-[#E6007E] transition-colors">
                  <div className="flex items-center gap-3 pe-4">
                    <span className="w-6 h-6 rounded-full bg-[#FADAE6] text-[#E6007E] text-xs flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <span>{question}</span>
                  </div>
                  <ChevronDown className="w-5 h-5 text-zinc-400 group-open:rotate-180 group-open:text-[#E6007E] transition-transform shrink-0" />
                </summary>
                <div className="px-5 pb-6 pt-1 text-zinc-600 text-sm md:text-base leading-relaxed ps-14 border-t border-zinc-100/60">
                  {category && (
                    <span className="inline-block px-2.5 py-0.5 rounded text-[11px] font-bold bg-zinc-100 text-zinc-600 mb-2">
                      {category}
                    </span>
                  )}
                  <p>{answer}</p>
                </div>
              </details>
            );
          })}
        </div>

        {/* Still have questions CTA */}
        <div className="bg-white rounded-2xl p-6 sm:p-8 border border-zinc-200 shadow-sm text-center">
          <div className="w-12 h-12 rounded-xl bg-pink-50 text-[#E6007E] flex items-center justify-center mx-auto mb-3">
            <Sparkles className="w-6 h-6" />
          </div>
          <h3 className="text-xl font-bold text-[#1A1A1A] mb-2">
            {isAr ? 'لم تجدي إجابة لسؤالكِ؟' : 'Still have questions?'}
          </h3>
          <p className="text-zinc-600 text-xs md:text-sm max-w-md mx-auto mb-6">
            {isAr
              ? 'فريق خدمة عملاء محل غزل في عين الباشا يسعد بالرد على كافة أسئلتكِ واستفساراتكِ التجميلية عبر الواتساب مباشرة.'
              : 'Our Ghazal customer care team in Ain Al-Basha is available to help answer any questions directly on WhatsApp.'}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <a
              href="https://wa.me/962776299243?text=%D9%85%D8%B1%D8%AD%D8%A8%D8%A7%20%D9%85%D8%AD%D9%84%20%D8%BA%D8%B2%D9%84%D8%8C%20%D9%84%D8%AF%D9%8A%20%D8%A7%D8%B3%D8%AA%D9%81%D8%B3%D8%A7%D8%B1"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#25D366] text-white font-bold text-sm hover:bg-[#20ba5a] transition-all shadow-sm"
            >
              <MessageCircle className="w-4 h-4" />
              <span>{isAr ? 'تحدثي معنا عبر واتساب' : 'Chat on WhatsApp'}</span>
            </a>
            <Link
              href={`/${locale}/contact`}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#1A1A1A] hover:bg-[#E6007E] text-white font-bold text-sm transition-colors"
            >
              <span>{isAr ? 'صفحة التواصل ومعلومات الفرع' : 'Contact Us Page'}</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
