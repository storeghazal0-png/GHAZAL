'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Search, Heart, ShoppingBag, User, Phone, MapPin, Truck, Menu, X, Sparkles, Flame, ArrowLeft, ArrowRight } from 'lucide-react';

export function Header() {
  const pathname = usePathname() || '/ar';
  const router = useRouter();
  const locale = pathname.startsWith('/en') ? 'en' : 'ar';
  const isAr = locale === 'ar';

  const [cartCount, setCartCount] = useState(0);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const checkCart = () => {
      try {
        const saved = localStorage.getItem('ghazal_cart') || localStorage.getItem('dahab_cart');
        if (saved) {
          const items = JSON.parse(saved);
          const count = items.reduce((acc: number, item: any) => acc + (item.quantity || 1), 0);
          setCartCount(count);
        }
      } catch {}
    };
    checkCart();
    window.addEventListener('storage', checkCart);
    return () => window.removeEventListener('storage', checkCart);
  }, []);

  const toggleLocale = () => {
    const newLocale = locale === 'ar' ? 'en' : 'ar';
    let pathWithoutLocale = pathname;
    if (pathname === `/${locale}` || pathname.startsWith(`/${locale}/`)) {
      pathWithoutLocale = pathname.slice(locale.length + 1);
    }
    router.push(`/${newLocale}${pathWithoutLocale}`);
    setIsMobileMenuOpen(false);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/${locale}/shop?search=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const navCategories = [
    { labelAr: 'الرئيسية', labelEn: 'Home', href: `/${locale}` },
    { labelAr: 'المكياج', labelEn: 'Makeup', href: `/${locale}/shop?category=makeup` },
    { labelAr: 'العناية بالبشرة', labelEn: 'Skincare', href: `/${locale}/shop?category=skincare` },
    { labelAr: 'العناية بالوجه', labelEn: 'Face Care', href: `/${locale}/shop?category=face-care` },
    { labelAr: 'مزيلات عرق', labelEn: 'Deodorants', href: `/${locale}/shop?category=deodorants` },
    { labelAr: 'العناية بالشعر', labelEn: 'Haircare', href: `/${locale}/shop?category=haircare` },
    { labelAr: 'العطور', labelEn: 'Fragrances', href: `/${locale}/shop?category=perfumes` },
    { labelAr: 'الإكسسوارات', labelEn: 'Accessories', href: `/${locale}/shop?category=accessories` },
    { labelAr: 'أدوات التجميل', labelEn: 'Beauty Tools', href: `/${locale}/shop?category=tools` },
    { labelAr: 'عروض خاصة', labelEn: 'Special Offers', href: `/${locale}/shop?filter=offers` },
  ];

  return (
    <header className="w-full bg-white border-b border-zinc-200 sticky top-0 z-50">
      {/* ==============================================================
          1. MAIN BRANDING & SEARCH BAR (الشريط الرئيسي)
      ============================================================== */}
      <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-4">
        {/* Mobile menu toggle */}
        <button
          className="lg:hidden text-zinc-800 p-1"
          onClick={() => setIsMobileMenuOpen(true)}
          aria-label="Open Menu"
        >
          <Menu className="w-6 h-6" />
        </button>

        {/* Brand Logo */}
        <Link href={`/${locale}`} className="flex items-center gap-2 shrink-0">
          <Image
            src="/logo.png"
            unoptimized
            alt="GHAZAL Cosmetics & More - Ain Al-Basha"
            width={160}
            height={50}
            className="object-contain h-11 md:h-12 w-auto"
            priority
          />
        </Link>

        {/* Global Live Search Bar */}
        <form
          onSubmit={handleSearchSubmit}
          className="hidden md:flex flex-1 max-w-xl mx-4 relative items-center"
        >
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={isAr ? 'ابحثي عن منتج، ماركة، روج، فاونديشن، أو عناية...' : 'Search product, brand, lipstick, foundation...'}
            className="w-full bg-[#F2F2F2] border border-transparent rounded-full py-2.5 px-11 text-sm text-zinc-900 placeholder:text-zinc-400 focus:bg-white focus:border-[#E6007E] outline-none transition-all"
          />
          <Search className="w-4 h-4 text-zinc-400 absolute start-4 pointer-events-none" />
        </form>

        {/* Action Controls */}
        <div className="flex items-center gap-2 sm:gap-3 text-zinc-800">
          <button
            onClick={toggleLocale}
            className="text-[11px] font-bold text-zinc-600 hover:text-[#E6007E] px-2 py-1 rounded-lg border border-zinc-200 hover:border-pink-300 transition"
            title={isAr ? 'Switch to English' : 'التحويل للعربية'}
          >
            {isAr ? 'EN' : 'عربي'}
          </button>

          <Link
            href={`/${locale}/shop`}
            className="md:hidden p-2 hover:text-[#E6007E] transition-colors"
            aria-label="Search"
          >
            <Search className="w-5 h-5" />
          </Link>

          <Link
            href={`/${locale}/wishlist`}
            className="hover:text-[#E6007E] transition-colors relative p-1.5"
            aria-label="Wishlist"
          >
            <Heart className="w-5 h-5" />
          </Link>

          <Link
            href={`/${locale}/cart`}
            className="hover:text-[#E6007E] transition-colors relative p-1.5"
            aria-label="Cart"
          >
            <ShoppingBag className="w-5 h-5" />
            {cartCount > 0 && (
              <span className="absolute -top-1 -end-1 bg-[#E6007E] text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                {cartCount}
              </span>
            )}
          </Link>
        </div>
      </div>

      {/* ==============================================================
          3. CATEGORY NAVIGATION RIBBON (الأقسام المعتمدة - يظهر فقط على الكمبيوتر ومخفي على الهاتف)
      ============================================================== */}
      <nav className="hidden lg:block border-t border-zinc-100 bg-white">
        <div className="container mx-auto px-4 flex items-center justify-center gap-8 py-2.5 text-sm font-bold text-zinc-700">
          {navCategories.map((cat, idx) => {
            const isActive = pathname === cat.href || (cat.href.includes('?') && pathname + (typeof window !== 'undefined' ? window.location.search : '') === cat.href);
            const isOffer = cat.href.includes('offers');

            return (
              <Link
                key={idx}
                href={cat.href}
                className={`hover:text-[#E6007E] transition-colors pb-0.5 flex items-center gap-1 ${
                  isActive ? 'text-[#E6007E] border-b-2 border-[#E6007E]' : ''
                } ${isOffer ? 'text-[#E6007E] font-black' : ''}`}
              >
                {isOffer && <Flame className="w-3.5 h-3.5 text-[#E6007E] fill-current" />}
                <span>{isAr ? cat.labelAr : cat.labelEn}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* ==============================================================
          4. MOBILE DRAWER MENU
      ============================================================== */}
      {isMobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-[100] flex" dir={isAr ? 'rtl' : 'ltr'}>
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          <div className="relative w-4/5 max-w-sm bg-white h-full shadow-2xl flex flex-col z-10">
            <div className="p-4 flex items-center justify-between border-b border-zinc-100">
              <Image
                src="/logo.png"
                unoptimized
                alt="GHAZAL"
                width={120}
                height={38}
                className="object-contain h-9 w-auto"
              />
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-1.5 text-zinc-500 hover:text-zinc-900 rounded-full"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-3 bg-pink-50 border-b border-pink-100 text-xs font-bold text-[#E6007E] flex items-center gap-1.5">
              <MapPin className="w-4 h-4 shrink-0" />
              <span>عين الباشا - شارع القدس</span>
            </div>

            <nav className="flex-1 overflow-y-auto p-4 flex flex-col gap-2 text-sm font-bold text-zinc-800">
              {navCategories.map((cat, idx) => (
                <Link
                  key={idx}
                  href={cat.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`py-2.5 px-3 rounded-xl hover:bg-[#FADAE6]/30 hover:text-[#E6007E] transition-colors flex items-center justify-between ${
                    cat.href.includes('offers') ? 'bg-pink-50 text-[#E6007E]' : ''
                  }`}
                >
                  <span>{isAr ? cat.labelAr : cat.labelEn}</span>
                  {cat.href.includes('offers') && <span className="text-[10px] bg-[#E6007E] text-white px-2 py-0.5 rounded-full">خصومات</span>}
                </Link>
              ))}
            </nav>

            <div className="p-4 border-t border-zinc-100 bg-[#F2F2F2] space-y-2">
              <a
                href="tel:+962776299243"
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 text-xs transition"
              >
                <Phone className="w-4 h-4" />
                <span>اتصال بمحل عين الباشا: +962776299243</span>
              </a>

              <button
                onClick={toggleLocale}
                className="w-full py-2 bg-white text-zinc-800 border border-zinc-200 font-bold rounded-xl text-xs"
              >
                {isAr ? 'Switch to English' : 'التبديل إلى العربية'}
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
