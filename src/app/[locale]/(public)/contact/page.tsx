import React from 'react';
import { getCMSContent } from '@/lib/cms';
import { MapPin, Phone, Clock, MessageCircle, Navigation, ExternalLink, Building2 } from 'lucide-react';

export default async function ContactPage({ params }: { params: Promise<{ locale: string }> }) {
  const resolvedParams = await params;
  const locale = resolvedParams.locale;
  const isAr = locale === 'ar';

  const GOOGLE_MAPS_URL = 'https://maps.app.goo.gl/8cZjT3BHFBCq9r5aA';

  const locationInfo = await getCMSContent('store_location_info', {
    addressAr: 'المملكة الأردنية الهاشمية — عين الباشا - شارع القدس',
    addressEn: 'Hashemite Kingdom of Jordan — Ain Al-Basha - Al-Quds Street',
    hoursAr: 'السبت إلى الخميس: 10:00 صباحاً – 10:00 مساءً | الجمعة: 2:00 ظهراً – 10:00 مساءً',
    hoursEn: 'Saturday – Thursday: 10:00 AM – 10:00 PM | Friday: 2:00 PM – 10:00 PM',
    phone: '+962776299243'
  });

  const socialLinks = await getCMSContent('social_links', {
    instagram: 'https://instagram.com',
    whatsapp: 'https://wa.me/962776299243',
    facebook: 'https://facebook.com',
    tiktok: 'https://tiktok.com'
  });

  // Normalize URLs to ensure safe, direct links even if user enters handles or plain numbers
  const whatsappHref = socialLinks.whatsapp?.startsWith('http')
    ? socialLinks.whatsapp
    : `https://wa.me/${socialLinks.whatsapp?.replace(/[^0-9]/g, '') || '962776299243'}`;

  const instagramHref = socialLinks.instagram?.startsWith('http')
    ? socialLinks.instagram
    : `https://instagram.com/${socialLinks.instagram?.replace('@', '') || ''}`;

  const facebookHref = socialLinks.facebook?.startsWith('http')
    ? socialLinks.facebook
    : (socialLinks.facebook ? `https://facebook.com/${socialLinks.facebook}` : 'https://facebook.com');

  return (
    <div className="bg-white min-h-screen py-8 md:py-12" style={{ backgroundColor: '#ffffff', colorScheme: 'only light' }}>
      <div className="container mx-auto px-4 sm:px-6 max-w-4xl">
        
        {/* Header - Serious & Official Tone */}
        <div className="text-center mb-8 border-b border-zinc-200 pb-6">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-md bg-zinc-200 text-zinc-800 text-xs font-bold mb-3">
            <Building2 className="w-3.5 h-3.5 text-[#E6007E]" />
            <span>{isAr ? 'المقر والمعرض التجاري الرسمي' : 'Official Commercial Showroom'}</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-black text-[#1A1A1A] tracking-tight mb-2">
            {isAr ? 'معلومات الاتصال والموقع الرسمي' : 'Official Contact & Store Information'}
          </h1>
          <p className="text-zinc-600 max-w-xl mx-auto text-xs sm:text-sm font-medium">
            {isAr
              ? 'معرض ومستودع غزل لمستحضرات التجميل والعناية — عين الباشا - شارع القدس'
              : 'GHAZAL Cosmetics & Skincare — Ain Al-Basha - Al-Quds Street'}
          </p>
        </div>

        {/* Main Content Card */}
        <div className="bg-white rounded-2xl p-6 sm:p-8 border border-zinc-200/90 shadow-xs space-y-6">

          {/* 3 Prominent Official Buttons: WhatsApp, Instagram, Facebook */}
          <div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              
              {/* WhatsApp Button */}
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center justify-between gap-3 p-4 rounded-xl bg-[#25D366] hover:bg-[#20ba5a] text-white transition-all shadow-xs active:scale-[0.99]"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
                    <MessageCircle className="w-5 h-5" />
                  </div>
                  <div className="text-start">
                    <div className="text-xs font-bold opacity-90">{isAr ? 'تواصل فوري' : 'Direct Chat'}</div>
                    <div className="text-sm font-black">{isAr ? 'زر الواتساب' : 'WhatsApp'}</div>
                  </div>
                </div>
                <ExternalLink className="w-4 h-4 opacity-75 group-hover:opacity-100 shrink-0" />
              </a>

              {/* Instagram Button */}
              <a
                href={instagramHref}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center justify-between gap-3 p-4 rounded-xl bg-linear-to-r from-[#833ab4] via-[#fd1d1d] to-[#fcb045] hover:opacity-95 text-white transition-all shadow-xs active:scale-[0.99]"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                    </svg>
                  </div>
                  <div className="text-start">
                    <div className="text-xs font-bold opacity-90">{isAr ? 'الصفحة الرسمية' : 'Official Page'}</div>
                    <div className="text-sm font-black">{isAr ? 'زر الإنستغرام' : 'Instagram'}</div>
                  </div>
                </div>
                <ExternalLink className="w-4 h-4 opacity-75 group-hover:opacity-100 shrink-0" />
              </a>

              {/* Facebook Button */}
              <a
                href={facebookHref}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center justify-between gap-3 p-4 rounded-xl bg-[#1877F2] hover:bg-[#166fe5] text-white transition-all shadow-xs active:scale-[0.99]"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                      <path d="M9 8h-3v4h3v12h5v-12h3.642l.358-4h-4v-1.667c0-.955.192-1.333 1.115-1.333h2.885v-5h-3.808c-3.596 0-5.192 1.583-5.192 4.615v3.385z"/>
                    </svg>
                  </div>
                  <div className="text-start">
                    <div className="text-xs font-bold opacity-90">{isAr ? 'الصفحة الرسمية' : 'Official Page'}</div>
                    <div className="text-sm font-black">{isAr ? 'زر الفيسبوك' : 'Facebook'}</div>
                  </div>
                </div>
                <ExternalLink className="w-4 h-4 opacity-75 group-hover:opacity-100 shrink-0" />
              </a>

            </div>
          </div>

          {/* Official Location & Contact Details Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-zinc-100">
            {/* Address */}
            <div className="flex items-center gap-3 p-3.5 rounded-xl bg-zinc-50 border border-zinc-200/60">
              <div className="w-9 h-9 rounded-lg bg-zinc-100 text-[#E6007E] flex items-center justify-center shrink-0">
                <MapPin className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="text-[11px] font-bold text-zinc-500 block uppercase tracking-wider">
                  {isAr ? 'الموقع والمعرض' : 'Store Location'}
                </span>
                <p className="text-xs font-black text-zinc-800 truncate">
                  {isAr ? 'عين الباشا - شارع القدس' : 'Ain Al-Basha - Al-Quds Street'}
                </p>
              </div>
            </div>

            {/* Hours */}
            <div className="flex items-center gap-3 p-3.5 rounded-xl bg-zinc-50 border border-zinc-200/60">
              <div className="w-9 h-9 rounded-lg bg-zinc-100 text-[#E6007E] flex items-center justify-center shrink-0">
                <Clock className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="text-[11px] font-bold text-zinc-500 block uppercase tracking-wider">
                  {isAr ? 'ساعات الدوام' : 'Working Hours'}
                </span>
                <p className="text-xs font-bold text-zinc-800 truncate">
                  {isAr ? 'السبت - الخميس: 10ص – 10م' : 'Sat – Thu: 10AM – 10PM'}
                </p>
              </div>
            </div>

            {/* Direct Phone */}
            <div className="flex items-center gap-3 p-3.5 rounded-xl bg-zinc-50 border border-zinc-200/60">
              <div className="w-9 h-9 rounded-lg bg-zinc-100 text-[#E6007E] flex items-center justify-center shrink-0">
                <Phone className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="text-[11px] font-bold text-zinc-500 block uppercase tracking-wider">
                  {isAr ? 'الاتصال المباشر' : 'Direct Phone'}
                </span>
                <a 
                  href={`tel:${locationInfo.phone.replace(/\s+/g, '')}`}
                  className="text-xs font-black text-[#E6007E] hover:underline block truncate" 
                  dir="ltr"
                >
                  {locationInfo.phone}
                </a>
              </div>
            </div>
          </div>

          {/* Compact Google Maps Container (smaller and elegant) */}
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between">
              <h2 className="text-xs sm:text-sm font-bold text-zinc-800">
                {isAr ? 'الموقع الجغرافي على الخريطة (Google Maps)' : 'Map Location (Google Maps)'}
              </h2>
              <a
                href={GOOGLE_MAPS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-[#E6007E] hover:underline"
              >
                <span>{isAr ? 'عرض بالخريطة الكاملة' : 'View Full Map'}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            <div className="w-full h-52 sm:h-60 rounded-xl border border-zinc-200 overflow-hidden relative bg-zinc-100">
              <iframe
                title="موقع معرض غزل على خرائط جوجل"
                src="https://maps.google.com/maps?q=32.0673,35.8344&hl=ar&z=15&output=embed"
                className="w-full h-full border-0"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
              
              <div className="absolute bottom-3 start-3 end-3 bg-white/95 backdrop-blur-xs p-2.5 sm:p-3 rounded-xl border border-zinc-200/80 shadow-md flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-black text-zinc-900 truncate">
                    {isAr ? 'معرض غزل — عين الباشا - شارع القدس' : 'Ghazal Showroom — Ain Al-Basha - Al-Quds Street'}
                  </p>
                  <p className="text-[11px] text-zinc-500 truncate">
                    {isAr ? 'المملكة الأردنية الهاشمية' : 'Hashemite Kingdom of Jordan'}
                  </p>
                </div>
                <a
                  href={GOOGLE_MAPS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-[#1A1A1A] hover:bg-[#E6007E] text-white px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 transition flex items-center gap-1.5 shadow-2xs"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  <span>{isAr ? 'الاتجاهات' : 'Directions'}</span>
                </a>
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
