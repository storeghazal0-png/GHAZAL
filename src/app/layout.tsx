import type { Metadata } from "next";
import "./globals.css";

const BASE_URL = 'https://ghazal.jo';

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: 'غزل لمستحضرات التجميل والعناية | GHAZAL – Cosmetics & More',
    template: '%s | غزل للتجميل والعناية',
  },
  description:
    'غزل لمستحضرات التجميل والعناية — وجهتك الأولى لأفضل منتجات المكياج، العناية بالبشرة والشعر والعطور الفاخرة في عمّان والأردن. Cosmetics, Skincare & Fragrances in Jordan.',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-48x48.png', sizes: '48x48', type: 'image/png' },
      { url: '/favicon-96x96.png', sizes: '96x96', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { url: '/icon.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: ['/favicon.ico'],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  manifest: '/site.webmanifest',
  keywords: [
    'غزل للمكياج',
    'محل غزل عين الباشا',
    'مكياج الأردن',
    'مستحضرات تجميل عين الباشا',
    'عناية بالبشرة الأردن',
    'Ghazal Cosmetics',
    'Jordan Makeup',
    'Ain Al-Basha Cosmetics',
  ],
  authors: [{ name: 'محل غزل للمكياج والتجميل', url: BASE_URL }],
  creator: 'غزل للمكياج والتجميل والعناية — عين الباشا',
  publisher: 'غزل للمكياج والتجميل والعناية — عين الباشا',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  openGraph: {
    type: 'website',
    locale: 'ar_JO',
    alternateLocale: ['en_US'],
    url: BASE_URL,
    siteName: 'غزل للمكياج والتجميل | GHAZAL Cosmetics',
    title: 'محل غزل للمكياج والتجميل والعناية — عين الباشا',
    description:
      'وجهتكِ الأولى لأفضل ماركات المكياج، مستحضرات التجميل، العناية بالبشرة والشعر، والعطور في عين الباشا - شارع القدس.',
    images: [
      {
        url: `${BASE_URL}/logo.png`,
        width: 1200,
        height: 630,
        alt: 'غزل للمكياج والتجميل — عين الباشا',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'غزل للمكياج والتجميل | GHAZAL Cosmetics',
    description: 'أفضل ماركات المكياج والعناية والتجميل في عين الباشا - شارع القدس',
    images: [`${BASE_URL}/logo.png`],
  },
  // تحقق Google Search Console — أضف verification code هنا عند الربط
  // verification: {
  //   google: 'YOUR_GOOGLE_VERIFICATION_CODE',
  // },
  alternates: {
    canonical: BASE_URL,
    languages: {
      'ar': `${BASE_URL}/ar`,
      'en': `${BASE_URL}/en`,
    },
  },
};

export const viewport = {
  themeColor: '#ffffff',
  colorScheme: 'only light',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html 
      lang="ar" 
      dir="rtl" 
      suppressHydrationWarning
      className="light" 
      style={{ colorScheme: 'only light', backgroundColor: '#ffffff' }}
    >
      <head>
        <meta name="color-scheme" content="only light" />
        <meta name="theme-color" content="#ffffff" />
        <meta name="supported-color-schemes" content="light" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&family=Tajawal:wght@400;500;700;800;900&display=swap" rel="stylesheet" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" type="image/png" sizes="48x48" href="/favicon-48x48.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/site.webmanifest" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              "name": "غزل لمستحضرات التجميل والعناية — GHAZAL",
              "alternateName": "GHAZAL Cosmetics",
              "url": "https://ghazal.jo",
              "logo": "https://ghazal.jo/logo.png",
              "image": "https://ghazal.jo/icon-512.png",
              "description": "محل ومتجر غزل لمستحضرات التجميل والمكياج والعناية والعطور في عين الباشا — المملكة الأردنية الهاشمية",
              "address": {
                "@type": "PostalAddress",
                "streetAddress": "شارع القدس",
                "addressLocality": "عين الباشا",
                "addressCountry": "JO"
              }
            }),
          }}
        />
      </head>
      <body 
        suppressHydrationWarning
        className="antialiased min-h-screen flex flex-col bg-white text-zinc-900" 
        style={{ colorScheme: 'only light', backgroundColor: '#ffffff' }}
      >
        {children}
      </body>
    </html>
  );
}
