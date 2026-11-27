import React from 'react';
import { requireAuth, requirePermission } from '@/lib/dal';
import { getCMSContent, updateCMSContent } from '@/lib/cms';
import { AdminSidebar } from '@/components/AdminSidebar';
import { revalidatePath } from 'next/cache';
import Link from 'next/link';

export default async function AdminPagesCMS() {
  const session = await requireAuth();

  // Fetch all current CMS texts for the pages with rich Ghazal Cosmetics defaults
  const about = await getCMSContent('brand_story', {
    titleAr: 'عن محل غزل للمكياج والتجميل',
    titleEn: 'About Ghazal Cosmetics & Beauty',
    contentAr: 'مرحباً بكم في محل غزل للمكياج والتجميل في عين الباشا — وجهتكم الموثوقة الأولى لكل ما يخص عالم الأناقة والجمال. تأسس متجرنا ليلبي شغف كل سيدة وصبية تبحث عن التميز، حيث نوفر تشكيلة واسعة ومتجددة من مستحضرات التجميل والمكياج الأصلي 100% من أشهر الماركات العالمية (مايبيلين، لوريال باريس، ذا أورديناري، لانيج، كيكو، ريفلوشن، وغيرها الكثير).\n\nكما نتميز بتقديم أفضل منتجات العناية بالبشرة والشعر المختارة بعناية فائقة، بالإضافة إلى تشكيلة فريدة من العطور الشرقية والفرنسية، وأدوات التجميل الاحترافية، وإكسسوارات الجمال العصرية.\n\nرسالتنا في غزل هي إبراز جمالك الطبيعي بمنتجات آمنة ومضمونة وبأفضل الأسعار المنافسة، مع تقديم استشارات جمالية وتوصيل سريع وموثوق لكافة محافظات المملكة الأردنية الهاشمية.',
    contentEn: 'Welcome to Ghazal Cosmetics & Beauty Store in Ain Al-Basha — your premier destination for genuine cosmetics, advanced skincare, luxury haircare, and signature fragrances. We are committed to offering 100% authentic products from leading international beauty brands at unbeatable prices.'
  });

  const ingredients = await getCMSContent('ingredients_page', {
    titleAr: 'الأصالة وضمان الجودة العالية',
    titleEn: 'Authenticity & Quality Guarantee',
    contentAr: 'في محل غزل، نضع صحة وسلامة عملائنا فوق كل اعتبار:\n\n• أصالة مضمونة 100%: جميع مستحضرات التجميل والمكياج والعناية مستوردة من الموزعين الرسميين والوكلاء المعتمدين.\n• تركيبات معتمدة وآمنة: ننتقي مستحضرات العناية بالبشرة والشعر الخالية من المواد الكيميائية الضارة، والمدعمة بأقوى المكونات الفعالة مثل حمض الهيالورونيك، النياسيناميد، فيتامين C، والكولاجين.\n• فحص دقيق ومطابقة: تخضع جميع المنتجات في مستودعاتنا ومعرضنا لشروط التخزين المثالية في درجات حرارة مناسبة للحفاظ على جودتها وفعاليتها حتى وصولها إلى يديك.',
    contentEn: 'At Ghazal Cosmetics, we guarantee 100% authentic beauty and skincare products sourced exclusively from certified brand distributors and authorized agents.'
  });

  const privacy = await getCMSContent('privacy_policy', {
    titleAr: 'سياسة الخصوصية وأمان البيانات',
    titleEn: 'Privacy Policy',
    contentAr: 'نحن في محل غزل للمكياج والتجميل نلتزم التزاماً تاماً بحماية خصوصية بياناتكم وسريتها وفقاً للأنظمة المتبعة:\n\n1. البيانات التي نجمعها: تقتصر على البيانات الضرورية لتنفيذ وتوصيل الطلبات (الاسم، رقم الهاتف للتواصل، عنوان التوصيل بالتفصيل).\n2. سرية المعلومات: لا يتم بيع أو مشاركة بياناتك الشخصية مع أي طرف ثالث لأغراض دعائية، ويقتصر تزويد شركة التوصيل بمعلومات العنوان ورقم الهاتف فقط لتسليم طلبك بدقة.\n3. أمان المعاملات: كافة البيانات والمعاملات المالية محمية ومشفرة بأعلى معايير الأمان.',
    contentEn: 'We value your privacy. All customer data collected at Ghazal Cosmetics is strictly utilized for order fulfillment and seamless delivery across Jordan.'
  });

  const terms = await getCMSContent('terms_of_service', {
    titleAr: 'الشروط والأحكام العامة',
    titleEn: 'Terms of Service',
    contentAr: 'أهلاً بك في متجر غزل الإلكتروني. استخدامك للموقع وإتمام الطلبات يعني موافقتك على البنود التالية:\n\n• الأسعار والعملة: جميع الأسعار المعروضة في المتجر بالدينار الأردني (د.أ) وهي نهائية.\n• توفر المنتجات: نسعى لتحديث المخزون بشكل فوري، وفي حال نفاد أي صنف يتم التواصل معك لاقتراح البديل المناسب أو إلغاء البند حسب رغبتك.\n• الشحن والتسليم: يتم تجهيز الطلبيات خلال 24 ساعة وتسليمها لشركة التوصيل المعتمدة.\n• الدفع: يتاح الدفع نقداً عند الاستلام (COD) في كافة محافظات الأردن أو الدفع الإلكتروني المعتمد.',
    contentEn: 'By shopping at Ghazal Cosmetics online, you agree to our standard terms and conditions governing authentic sales, transparent pricing in JOD, and express delivery.'
  });

  const returns = await getCMSContent('returns_policy', {
    titleAr: 'سياسة الاستبدال والاسترجاع',
    titleEn: 'Returns & Exchange Policy',
    contentAr: 'حرصاً على السلامة الصحية العامة لزبوناتنا ولمستحضرات التجميل:\n\n• مدة الاستبدال: يمكن استبدال أو إرجاع المنتجات خلال 3 أيام من تاريخ الشراء من المحل أو استلام الطلب من المندوب.\n• شرط الحالة الأصلية: يجب أن يكون المنتج بحالته الأصلية غير مفتوح نهائياً، وفي غلافه المصنعي مع وجود لاصق الأمان والفاتورة الأصلية.\n• الاستثناءات الصحية: لا يمكن استبدال أو إرجاع أي مستحضر تجميلي تم فتحه أو تجربته (مثل أحمر الشفاه، الماسكارا، كريمات الأساس، العطور المفتوحة) حفاظاً على الصحة العامة.\n• التلف والعيوب: في حال وصول أي منتج تالف أو بخلل مصنعي، نتكفل بتبديله فوراً مجاناً دون تحميلك أي أجور توصيل إضافية.',
    contentEn: 'For personal hygiene and cosmetic safety, unopened items with factory seals intact can be returned or exchanged within 3 days accompanied by the original receipt.'
  });

  const faq = await getCMSContent('faq_content', {
    titleAr: 'الأسئلة الشائعة والمساعدة',
    titleEn: 'Frequently Asked Questions',
    contentAr: '1. أين يقع محل غزل؟ وما هي أوقات الدوام؟\nيقع معرضنا في عين الباشا — الشارع الرئيسي، ونرحب بكم طيلة أيام الأسبوع من الساعة 9:30 صباحاً حتى الساعة 11:00 مساءً.\n\n2. هل جميع منتجات المكياج والعناية لديكم أصلية؟\nنعم وبكل فخر! نلتزم في محل غزل بتوفير منتجات أصلية 100% ونضمن جودتها ومصدرها مباشرة.\n\n3. ما هي مدة وتكلفة التوصيل داخل الأردن؟\nمدة العمل وتجهيز وشحن الطلبيات لكافة مناطق ومحافظات المملكة تتراوح بين يومين إلى 3 أيام (2 - 3 أيام). علماً بأنه لا يتوفر توصيل فوري لأي منطقة إلا عند الاتصال والتنسيق المسبق المباشر مع إدارة المحل.\n\n4. كيف يمكنني اختيار درجة كريم الأساس أو الكونسيلر المناسبة لي؟\nفريق خبيرات التجميل في غزل جاهز دائماً لمساعدتك عبر الواتساب لاختيار الدرجة المثالية لنوع ولون بشرتك بدقة.\n\n5. هل يمكن تجهيز بكجات هدايا وتوزيعات؟\nنعم بكل سرور، نقوم بتنسيق بوكسات هدايا فاخرة للمكياج والعطور مع كروت إهداء وتغليف راقي.',
    contentEn: 'Find answers to common questions about Ghazal Cosmetics location in Ain Al-Basha, authentic beauty sourcing, nationwide delivery, and personalized customer care.'
  });

  const shipping = await getCMSContent('shipping_policy', {
    titleAr: 'سياسة الشحن والتوصيل السريع',
    titleEn: 'Shipping & Delivery Policy',
    introAr: 'نوفر في محل غزل خدمة التوصيل السريع لجميع مناطق ومحافظات المملكة الأردنية الهاشمية (عين الباشا، عمان، البلقاء، الزرقاء، إربد، وكافة المحافظات) مع إمكانية الدفع عند الاستلام والمعاينة.',
    introEn: 'Fast and reliable delivery across all Jordan governorates with Cash on Delivery.'
  });

  async function handleSavePageCMS(formData: FormData) {
    'use server';
    await requirePermission('manage:settings');
    const key = formData.get('cmsKey') as string;
    
    if (key === 'shipping_policy') {
      await updateCMSContent(key, {
        titleAr: formData.get('titleAr'),
        titleEn: formData.get('titleEn'),
        introAr: formData.get('introAr'),
        introEn: formData.get('introEn'),
      });
    } else {
      await updateCMSContent(key, {
        titleAr: formData.get('titleAr'),
        titleEn: formData.get('titleEn'),
        contentAr: formData.get('contentAr'),
        contentEn: formData.get('contentEn'),
      });
    }

    // Force Next.js to re-fetch the new content on public pages
    revalidatePath('/', 'layout');
    revalidatePath('/admin/content/pages');
  }

  const pages = [
    { key: 'brand_story', label: 'عن غزل / قصتنا', data: about },
    { key: 'ingredients_page', label: 'مكوناتنا', data: ingredients },
    { key: 'privacy_policy', label: 'سياسة الخصوصية', data: privacy },
    { key: 'terms_of_service', label: 'الشروط والأحكام', data: terms },
    { key: 'returns_policy', label: 'الاسترجاع والاستبدال', data: returns },
    { key: 'faq_content', label: 'الأسئلة الشائعة', data: faq },
  ];

  return (
    <div className="flex flex-col md:flex-row h-screen bg-[var(--color-ivory-100)] overflow-hidden" dir="rtl">
      <AdminSidebar employeeName={session.employee.name} roleName={session?.employee?.role?.name || "ADMIN"} />

      <main className="flex-1 overflow-y-auto p-4 md:p-8 font-sans w-full max-w-full">
        <div className="flex justify-between items-center mb-8 border-b border-[var(--color-ivory-200)] pb-4">
          <div className="flex items-center gap-4">
            <Link href="/admin/content" className="bg-white border border-zinc-200 hover:bg-zinc-100 text-zinc-700 p-2 rounded-lg transition-colors flex items-center justify-center shadow-sm shrink-0" title="الرجوع للصفحة السابقة">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
            </Link>
            <div>
              <h1 className="text-3xl font-bold font-heading text-[var(--color-charcoal-900)]">
                إدارة صفحات الموقع (الفوتر)
              </h1>
              <p className="text-zinc-650 mt-1">
                تعديل النصوص والشروط للصفحات الثابتة المعروضة في أسفل الموقع. يمكنك استخدام Markdown في الحقول النصية لإضافة نقاط أو خط غامق.
              </p>
            </div>
          </div>
        </div>

        <div className="max-w-4xl space-y-8">
          {pages.map((page) => (
            <form key={page.key} action={handleSavePageCMS} className="bg-white p-6 rounded-lg border border-[var(--color-ivory-200)] shadow-sm space-y-6">
              <div className="flex justify-between items-center border-b pb-2 mb-4">
                <h2 className="text-xl font-bold text-[var(--color-charcoal-900)]">{page.label}</h2>
                <button type="submit" className="bg-[var(--color-charcoal-900)] text-white px-6 py-2 rounded text-sm font-bold hover:bg-[var(--color-charcoal-800)] transition-colors">
                  حفظ ({page.label})
                </button>
              </div>

              <input type="hidden" name="cmsKey" value={page.key} />
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">العنوان بالعربية</label>
                  <input type="text" name="titleAr" defaultValue={page.data.titleAr} required className="w-full border border-zinc-300 rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-champagne-600)]" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">العنوان بالإنجليزية</label>
                  <input type="text" name="titleEn" defaultValue={page.data.titleEn} required className="w-full border border-zinc-300 rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-champagne-600)]" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-zinc-700 mb-1">المحتوى بالعربية</label>
                  <textarea name="contentAr" rows={6} defaultValue={page.data.contentAr} required className="w-full border border-zinc-300 rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-champagne-600)]" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-zinc-700 mb-1">المحتوى بالإنجليزية</label>
                  <textarea name="contentEn" rows={6} defaultValue={page.data.contentEn} required className="w-full border border-zinc-300 rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-champagne-600)]" />
                </div>
              </div>
            </form>
          ))}

          {/* Shipping Policy Form (Different Schema) */}
          <form action={handleSavePageCMS} className="bg-white p-6 rounded-lg border border-[var(--color-ivory-200)] shadow-sm space-y-6">
            <div className="flex justify-between items-center border-b pb-2 mb-4">
              <h2 className="text-xl font-bold text-[var(--color-charcoal-900)]">الشحن والتوصيل (مقدمة الصفحة)</h2>
              <button type="submit" className="bg-[var(--color-charcoal-900)] text-white px-6 py-2 rounded text-sm font-bold hover:bg-[var(--color-charcoal-800)] transition-colors">
                حفظ (الشحن)
              </button>
            </div>
            
            <input type="hidden" name="cmsKey" value="shipping_policy" />
            <p className="text-xs text-zinc-500 mb-4">ملاحظة: جدول أسعار التوصيل يتم إدارته من صفحة &quot;أسعار التوصيل&quot; الخاصة في الإدارة.</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">العنوان بالعربية</label>
                <input type="text" name="titleAr" defaultValue={shipping.titleAr} required className="w-full border border-zinc-300 rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-champagne-600)]" />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">العنوان بالإنجليزية</label>
                <input type="text" name="titleEn" defaultValue={shipping.titleEn} required className="w-full border border-zinc-300 rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-champagne-600)]" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-zinc-700 mb-1">النص التعريفي بالعربية</label>
                <textarea name="introAr" rows={4} defaultValue={shipping.introAr} required className="w-full border border-zinc-300 rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-champagne-600)]" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-zinc-700 mb-1">النص التعريفي بالإنجليزية</label>
                <textarea name="introEn" rows={4} defaultValue={shipping.introEn} required className="w-full border border-zinc-300 rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-champagne-600)]" />
              </div>
            </div>
          </form>

        </div>
      </main>
    </div>
  );
}
