'use client';

import React, { useRef } from 'react';
import Link from 'next/link';
import { filsToDisplay } from '@/lib/money';
import { ChevronRight, ChevronLeft } from 'lucide-react';

interface SuggestedProduct {
  id: string;
  slug: string;
  nameAr: string;
  nameEn: string;
  imageUrl: string | null;
  lowestPrice: number;
}

interface SuggestedProductsProps {
  products: SuggestedProduct[];
  locale: string;
}

export default function SuggestedProducts({ products, locale }: SuggestedProductsProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  if (!products || products.length === 0) return null;

  const isAr = locale === 'ar';

  const handleScroll = (direction: 'prev' | 'next') => {
    if (!scrollContainerRef.current) return;
    const container = scrollContainerRef.current;
    const scrollAmount = 260;

    if (isAr) {
      // In RTL: next moves left (-), prev moves right (+)
      container.scrollBy({
        left: direction === 'next' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    } else {
      // In LTR: next moves right (+), prev moves left (-)
      container.scrollBy({
        left: direction === 'next' ? scrollAmount : -scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  return (
    <section className="mt-14 pt-10 border-t border-zinc-200">
      {/* Section Header with Navigation Controls */}
      <div className="flex items-end justify-between mb-5">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-[#1A1A1A]">
            {isAr ? 'منتجات قد تنال إعجابكِ' : 'You May Also Like'}
          </h2>
          <p className="text-zinc-500 text-xs sm:text-sm mt-1">
            {isAr ? 'تشكيلة مختارة من أرقى مستحضرات التجميل والعناية' : 'Curated cosmetics & skincare picks for you'}
          </p>
        </div>

        {/* Scroll Action Arrows */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => handleScroll('prev')}
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-full border border-zinc-200 bg-white text-zinc-700 hover:bg-[#E6007E] hover:text-white hover:border-[#E6007E] flex items-center justify-center transition-all shadow-2xs active:scale-95 cursor-pointer"
            aria-label={isAr ? 'السابق' : 'Previous'}
          >
            {isAr ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={() => handleScroll('next')}
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-full border border-zinc-200 bg-white text-zinc-700 hover:bg-[#E6007E] hover:text-white hover:border-[#E6007E] flex items-center justify-center transition-all shadow-2xs active:scale-95 cursor-pointer"
            aria-label={isAr ? 'التالي' : 'Next'}
          >
            {isAr ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Horizontal Scroll Track */}
      <div
        ref={scrollContainerRef}
        className="flex gap-3 sm:gap-4 overflow-x-auto pb-4 pt-1 snap-x snap-mandatory scroll-smooth"
        style={{ scrollbarWidth: 'thin' }}
      >
        {products.map((product) => {
          const imageUrl = product.imageUrl?.startsWith('local://')
            ? '/logo.png'
            : product.imageUrl || '/logo.png';

          const productName = isAr ? product.nameAr : product.nameEn;

          return (
            <Link
              key={product.id}
              href={`/${locale}/products/${product.slug}`}
              prefetch={false}
              className="group shrink-0 w-36 sm:w-44 md:w-48 bg-white rounded-xl border border-zinc-200/90 overflow-hidden hover:shadow-md hover:border-[#E6007E]/50 transition-all duration-200 snap-start flex flex-col justify-between"
            >
              {/* Image filling square */}
              <div className="w-full aspect-square bg-zinc-100 relative overflow-hidden">
                <img
                  src={imageUrl}
                  alt={productName}
                  className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                />
              </div>

              {/* Details */}
              <div className="p-2.5 sm:p-3 flex flex-col justify-between flex-1">
                <h3 className="font-bold text-[#1A1A1A] text-xs sm:text-sm line-clamp-2 leading-snug group-hover:text-[#E6007E] transition-colors mb-2">
                  {productName}
                </h3>
                <div className="flex items-center justify-between pt-1 border-t border-zinc-100">
                  <span className="text-[10px] sm:text-xs text-zinc-400 font-medium">
                    {isAr ? 'السعر' : 'Price'}
                  </span>
                  <span className="text-xs sm:text-sm font-black text-[#E6007E]">
                    {filsToDisplay(product.lowestPrice, locale === 'ar' ? 'ar' : 'en')}
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
