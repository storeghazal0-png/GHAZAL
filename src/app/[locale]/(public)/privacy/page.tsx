import React from 'react';
import Link from 'next/link';
import { getCMSContent } from '@/lib/cms';
import { ShieldCheck, Lock, Eye, FileText, CheckCircle2 } from 'lucide-react';

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const resolvedParams = await params;
  const locale = resolvedParams.locale;
  const isAr = locale === 'ar';

  const defaultPrivacy = {
    titleAr: 'سياسة الخصوصية وحماية البيانات',
    titleEn: 'Privacy & Data Protection Policy',
    introAr: 'نحن في محل غزل للمكياجات ومستحضرات التجميل (عين الباشا - الأردن) نلتزم التزاماً كاملاً بحماية خصوصيتكِ وسرية بياناتكِ الشخصية وفق أعلى المعايير القانونية والأخلاقية.',
    introEn: 'At Ghazal Cosmetics & More (Ain Al-Basha, Jordan), we are deeply committed to safeguarding your privacy and personal data in accordance with the highest legal standards.'
  };

  const cms = await getCMSContent('privacy_policy', defaultPrivacy);

  return (
    <div className="bg-white min-h-screen py-12 md:py-16" style={{ backgroundColor: '#ffffff', colorScheme: 'only light' }}>
      <div className="container mx-auto px-4 sm:px-6 max-w-4xl">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#FADAE6] text-[#E6007E] text-xs md:text-sm font-bold mb-4">
            <Lock className="w-4 h-4" />
            <span>{isAr ? 'حماية وأمان بياناتكِ أولويتنا المطلقة' : 'Your Privacy is Protected'}</span>
          </div>
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-black text-[#1A1A1A] tracking-tight mb-4">
            {isAr ? cms.titleAr : cms.titleEn}
          </h1>
          <p className="text-zinc-600 max-w-2xl mx-auto text-sm md:text-base leading-relaxed">
            {isAr ? cms.introAr : cms.introEn}
          </p>
        </div>

        {/* Content Card */}
        <div className="bg-white rounded-2xl p-6 sm:p-10 shadow-sm border border-zinc-200 space-y-8 text-zinc-800 mb-10">
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-[#E6007E] text-white text-xs font-bold flex items-center justify-center">1</span>
              <h2 className="text-xl font-bold text-[#1A1A1A]">
                {isAr ? 'البيانات التي نقوم بجمعها' : 'Information We Collect'}
              </h2>
            </div>
            <p className="text-sm md:text-base leading-relaxed text-zinc-600 ps-9">
              {isAr
                ? 'عند قيامكِ بالطلب أو التواصل معنا عبر متجر غزل الإلكتروني أو من خلال واتساب، نقوم بجمع البيانات الأساسية الضرورية فقط لتنفيذ الخدمة:'
                : 'When you place an order or contact us via our website or WhatsApp, we collect only necessary details to fulfill your request:'}
            </p>
            <ul className="space-y-2 ps-9 text-sm text-zinc-700">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>{isAr ? 'الاسم الكريم ورقم الهاتف المحمول لغايات تأكيد الطلب والتواصل.' : 'Name and mobile phone number for order confirmation and contact.'}</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>{isAr ? 'عنوان التوصيل في الأردن (المحافظة، المنطقة، الحي، المعالم البارزة) لإيصال الشحنة بدقة.' : 'Delivery address in Jordan (Governorate, Area, Street, Landmark) for accurate shipping.'}</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>{isAr ? 'سجل المنتجات والطلبات السابقة للمساعدة في تقديم توصيات مخصصة واقتراح درجات الألوان المناسبة لكِ.' : 'Purchase history to provide tailored beauty recommendations.'}</span>
              </li>
            </ul>
          </section>

          <hr className="border-zinc-100" />

          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-[#E6007E] text-white text-xs font-bold flex items-center justify-center">2</span>
              <h2 className="text-xl font-bold text-[#1A1A1A]">
                {isAr ? 'كيف نستخدم بياناتكِ' : 'How We Use Your Data'}
              </h2>
            </div>
            <p className="text-sm md:text-base leading-relaxed text-zinc-600 ps-9">
              {isAr
                ? 'تُستخدم بياناتكِ حصرياً للأغراض التالية وبشكل مباشر:'
                : 'Your data is strictly utilized for the following core operations:'}
            </p>
            <ul className="space-y-2 ps-9 text-sm text-zinc-700">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>{isAr ? 'معالجة وتجهيز طلبات المكياج ومستحضرات التجميل وإصدار الفواتير الرسمية.' : 'Processing and packing cosmetic orders and issuing official invoices.'}</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>{isAr ? 'تزويد مناديب التوصيل المعتمدين بالعنوان ورقم الهاتف لضمان وصول الشحنة في الموعد المحدد.' : 'Sharing dispatch information with authorized couriers for delivery.'}</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>{isAr ? 'إرسال إشعارات حالة الطلب أو العروض الحصرية (في حال موافقتكِ على ذلك).' : 'Sending order updates or exclusive promotion notifications.'}</span>
              </li>
            </ul>
          </section>

          <hr className="border-zinc-100" />

          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-[#E6007E] text-white text-xs font-bold flex items-center justify-center">3</span>
              <h2 className="text-xl font-bold text-[#1A1A1A]">
                {isAr ? 'أمان وسرية المدفوعات والبطاقات البنكية' : 'Payment Security'}
              </h2>
            </div>
            <p className="text-sm md:text-base leading-relaxed text-zinc-600 ps-9">
              {isAr
                ? 'نحن لا نقوم بحفظ أو تسجيل أرقام بطاقات الائتمان أو البيانات البنكية الحساسة على خوادمنا نهائياً. تتم كافة العمليات المالية عبر بوابات دفع بنكية معتمدة ومحمية بأعلى بروتوكولات التشفير العالمية، أو عند الاستلام كاش/CliQ مباشرة.'
                : 'We never store credit card details or bank passwords on our servers. All transactions adhere to PCI-DSS standards or direct cash/CliQ settlement.'}
            </p>
          </section>

          <hr className="border-zinc-100" />

          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-[#E6007E] text-white text-xs font-bold flex items-center justify-center">4</span>
              <h2 className="text-xl font-bold text-[#1A1A1A]">
                {isAr ? 'حقوقكِ وخياراتكِ' : 'Your Rights'}
              </h2>
            </div>
            <p className="text-sm md:text-base leading-relaxed text-zinc-600 ps-9">
              {isAr
                ? 'يحق لكِ في أي وقت مراجعة بياناتكِ المسجلة لدينا، تعديلها، أو طلب حذف حسابكِ ورقم هاتفكِ من قوائم الاتصال بمجرد التواصل مع فريق خدمة العملاء في فرع عين الباشا عبر الواتساب على الرقم +962776299243.'
                : 'You have the right at any time to request review, update, or deletion of your registered data by contacting our Ain Al-Basha team via WhatsApp at +962776299243.'}
            </p>
          </section>
        </div>

        {/* Footer note */}
        <div className="text-center text-xs text-zinc-500">
          <p>{isAr ? 'محل غزل للمكياجات ومستحضرات التجميل - عين الباشا، محافظة البلقاء، الأردن.' : 'Ghazal Cosmetics & More - Ain Al-Basha, Balqa, Jordan.'}</p>
          <p className="mt-1">{isAr ? 'تاريخ آخر تحديث: نوفمبر 2026' : 'Last updated: November 2026'}</p>
        </div>
      </div>
    </div>
  );
}
