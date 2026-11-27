'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { WishlistHeart } from '@/components/WishlistHeart';
import { ShoppingBag, ChevronDown, ChevronUp, ArrowLeft, ArrowRight, Tag, SlidersHorizontal, Grid } from 'lucide-react';

export interface ShowcaseProduct {
  id: string;
  slug: string;
  nameAr: string;
  nameEn: string;
  brand: string;
  priceFils: number;
  originalPriceFils?: number; // for offers
  discountPercent?: number; // for offers
  rating: number;
  reviewsCount: number;
  shade?: string;
  tag?: string;
  imageUrl: string;
  variantCount?: number;
}

interface HomeProductShowcaseProps {
  title: string;
  subtitle: string;
  badge?: string;
  viewAllHref: string;
  viewAllLabel?: string;
  products: ShowcaseProduct[];
  locale?: string;
  isOfferSection?: boolean;
}

export function HomeProductShowcase({
  title,
  subtitle,
  badge,
  viewAllHref,
  viewAllLabel,
  products = [],
  locale = 'ar',
  isOfferSection = false,
}: HomeProductShowcaseProps) {
  const isAr = locale === 'ar';
  const [isExpanded, setIsExpanded] = useState(false);
  const [layoutMode, setLayoutMode] = useState<'grid' | 'scroll'>('grid');

  if (isOfferSection && (!products || products.length === 0)) {
    return null;
  }

  // Initial 4 products for 2x2 view (كل 2 بسطر وهم سطرين)
  const displayedProducts = isExpanded ? products : products.slice(0, 4);
  const hasMore = products.length > 4;

  return (
    <section className="py-12 sm:py-16 bg-white border-b border-zinc-100">
      <div className="container mx-auto px-4 sm:px-6">
        {/* Section Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 sm:mb-10 gap-4">
          <div>
            {badge && (
              <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-pink-50 border border-pink-200 text-[#E6007E] text-[11px] font-bold mb-2">
                <span>{badge}</span>
              </div>
            )}
            
            <h2 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-[#1A1A1A] font-heading tracking-tight">
              {title}
            </h2>
            <p className="text-xs sm:text-sm text-zinc-500 mt-1 font-medium">
              {subtitle}
            </p>
          </div>

          {/* Action Header & View Switcher */}
          <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
            {/* View Switcher: 2x2 Grid vs Horizontal Scroll */}
            <div className="flex items-center bg-zinc-100 p-1 rounded-xl text-xs font-bold text-zinc-600">
              <button
                type="button"
                onClick={() => setLayoutMode('grid')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg transition-all ${
                  layoutMode === 'grid' 
                    ? 'bg-white text-[#E6007E] shadow-2xs font-extrabold' 
                    : 'hover:text-zinc-900'
                }`}
                title="عرض شبكي (2 بسطر)"
              >
                <Grid className="w-3.5 h-3.5" />
                <span className="text-[11px]">{isAr ? 'شبكة' : 'Grid'}</span>
              </button>

              <button
                type="button"
                onClick={() => setLayoutMode('scroll')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg transition-all ${
                  layoutMode === 'scroll' 
                    ? 'bg-white text-[#E6007E] shadow-2xs font-extrabold' 
                    : 'hover:text-zinc-900'
                }`}
                title="تمرير أفقي"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span className="text-[11px]">{isAr ? 'تمرير أفقي' : 'Scroll'}</span>
              </button>
            </div>

            <Link
              href={viewAllHref}
              prefetch={false}
              className="text-xs font-bold text-[#E6007E] hover:underline flex items-center gap-1 shrink-0"
            >
              <span>{viewAllLabel || (isAr ? 'عرض الكل' : 'View All')}</span>
              <span>{isAr ? '←' : '→'}</span>
            </Link>
          </div>
        </div>

        {/* 1. GRID MODE: Exact 2 products per row (كل 2 بسطر وهم سطرين = 4 منتجات) */}
        {layoutMode === 'grid' && (
          <div className="space-y-8">
            <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-6 max-w-6xl mx-auto">
              {displayedProducts.map((prod) => (
                <ProductCardItem 
                  key={prod.id} 
                  prod={prod} 
                  locale={locale} 
                  isAr={isAr} 
                  isOffer={isOfferSection} 
                />
              ))}
            </div>

            {/* "عرض المزيد" Toggle Button */}
            {hasMore && (
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsExpanded(prev => !prev)}
                  className="w-full sm:w-auto px-6 py-2.5 bg-pink-50 hover:bg-pink-100 text-[#E6007E] border border-pink-200 font-bold rounded-xl text-xs transition-all shadow-2xs flex items-center justify-center gap-2 active:scale-95"
                >
                  {isExpanded ? (
                    <>
                      <span>{isAr ? 'عرض أقل' : 'Show Less'}</span>
                      <ChevronUp className="w-4 h-4" />
                    </>
                  ) : (
                    <>
                      <span>{isAr ? `عرض المزيد (+${products.length - 4} منتجات)` : `Show More (+${products.length - 4})`}</span>
                      <ChevronDown className="w-4 h-4" />
                    </>
                  )}
                </button>

                <Link
                  href={viewAllHref}
                  prefetch={false}
                  className="w-full sm:w-auto px-6 py-2.5 bg-white hover:bg-zinc-50 text-zinc-700 border border-zinc-200 font-bold rounded-xl text-xs transition-all text-center"
                >
                  {isAr ? 'تصفح جميع المنتجات في المتجر ←' : 'Browse All Products →'}
                </Link>
              </div>
            )}
          </div>
        )}

        {/* 2. HORIZONTAL SCROLL MODE (تمرير أفقي بسطرين أو سطر متدفق) */}
        {layoutMode === 'scroll' && (
          <div className="space-y-4">
            <div 
              className="grid grid-rows-2 grid-flow-col auto-cols-[calc(50%-8px)] sm:auto-cols-[260px] gap-3.5 sm:gap-5 overflow-x-auto pb-4 pt-1 snap-x snap-mandatory no-scrollbar"
              style={{ scrollbarWidth: 'thin' }}
            >
              {products.map((prod) => (
                <div key={prod.id} className="snap-start h-full">
                  <ProductCardItem 
                    prod={prod} 
                    locale={locale} 
                    isAr={isAr} 
                    isOffer={isOfferSection} 
                  />
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between text-xs text-zinc-400 px-1">
              <span className="flex items-center gap-1 text-[11px]">
                <span>👉</span>
                <span>{isAr ? 'اسحبي أفقياً لرؤية المزيد من المنتجات' : 'Swipe horizontally to view more products'}</span>
              </span>

              <Link href={viewAllHref} className="text-xs font-bold text-[#E6007E] hover:underline">
                {isAr ? 'عرض كافة المنتجات في المتجر' : 'View Full Catalog'}
              </Link>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function ProductCardItem({ 
  prod, 
  locale, 
  isAr,
  isOffer 
}: { 
  prod: ShowcaseProduct; 
  locale: string; 
  isAr: boolean;
  isOffer?: boolean;
}) {
  const lowestPrice = prod.priceFils;
  const originalPrice = prod.originalPriceFils;
  const hasDiscount = Boolean(originalPrice && originalPrice > lowestPrice);
  const discountAmount = hasDiscount ? ((originalPrice || 0) - lowestPrice) : 0;
  const discountPercent = prod.discountPercent || (hasDiscount && originalPrice ? Math.round((discountAmount / originalPrice) * 100) : 0);

  return (
    <div className={`bg-white rounded-2xl border p-3 sm:p-4 flex flex-col justify-between transition-all duration-300 hover:shadow-xl group relative h-full ${
      hasDiscount ? 'border-rose-200 hover:border-[#E6007E] ring-1 ring-rose-50' : 'border-zinc-200 hover:border-[#E6007E]'
    }`}>
      {/* Wishlist Button */}
      <div className="absolute top-2.5 start-2.5 z-10">
        <WishlistHeart
          product={{
            id: prod.id,
            nameAr: prod.nameAr,
            nameEn: prod.nameEn,
            slug: prod.slug,
            imageUrl: prod.imageUrl,
            price: lowestPrice,
            stockStatus: 'IN_STOCK',
          }}
        />
      </div>

      {/* Product Visual Container */}
      <div>
        <Link href={`/${locale}/products/${prod.slug}`} prefetch={false} className="block">
          <div className="aspect-square bg-zinc-100 rounded-xl mb-2.5 sm:mb-3 relative overflow-hidden group-hover:scale-102 transition-transform">
            <Image
              src={prod.imageUrl || '/logo.png'}
              unoptimized
              alt={prod.nameAr}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              className="object-cover w-full h-full"
            />
            
            {/* Discount Badge on Top Corner */}
            {hasDiscount && discountPercent > 0 && (
              <span className="absolute top-2 end-2 bg-gradient-to-r from-rose-600 to-[#E6007E] text-white text-[10px] sm:text-[11px] font-black px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg shadow-sm border border-white/30 tracking-tight z-10 flex items-center gap-0.5 pointer-events-none">
                <span>{isAr ? 'خصم' : 'OFF'}</span>
                <span dir="ltr">-{discountPercent}%</span>
              </span>
            )}

            {/* Custom Product Badge (مثل الأكثر مبيعاً أو موصى به من الأطباء) */}
            {prod.tag && (
              <span className="absolute bottom-2 start-2 bg-white/95 backdrop-blur-xs text-[9px] sm:text-[10px] font-black text-[#E6007E] px-2 py-0.5 rounded-md shadow-2xs border border-pink-100 z-10">
                {prod.tag}
              </span>
            )}
          </div>
        </Link>

        {/* Brand */}
        <span className="text-[9px] sm:text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">
          {prod.brand}
        </span>

        {/* Title */}
        <Link href={`/${locale}/products/${prod.slug}`} prefetch={false}>
          <h3 className="text-xs sm:text-sm font-bold text-zinc-900 line-clamp-2 hover:text-[#E6007E] transition-colors mb-1.5 leading-snug">
            {isAr ? prod.nameAr : (prod.nameEn || prod.nameAr)}
          </h3>
        </Link>

        {(prod.variantCount || 0) > 1 && (
          <p className="text-[10px] sm:text-xs text-[#E6007E] font-bold mb-2">
            {isAr ? 'يتوفر بعدة خيارات' : 'Available in multiple options'}
          </p>
        )}

        {prod.shade && (
          <p className="text-[9px] sm:text-[10px] text-zinc-500 font-mono mb-2 truncate">
            {prod.shade}
          </p>
        )}
      </div>

      {/* Price & Action - Clean Numbers Before & After */}
      <div className="pt-2 border-t border-zinc-100 flex items-center justify-between gap-1.5 mt-auto">
        <div>
          <div className="flex items-baseline gap-1.5 flex-wrap">
            {/* السعر الحالي */}
            <span className="text-xs sm:text-sm md:text-base font-black text-[#E6007E] font-mono">
              {(lowestPrice / 1000).toFixed(2)}{' '}
              <span className="text-[10px] font-normal font-sans text-zinc-600">د.أ</span>
            </span>

            {/* السعر قبل الخصم (أرقام مشطوبة فقط) */}
            {hasDiscount && (
              <span className="text-[10px] sm:text-xs text-zinc-400 line-through font-mono">
                {originalPrice ? (originalPrice / 1000).toFixed(2) : ''}
              </span>
            )}
          </div>
        </div>

        <Link
          href={`/${locale}/products/${prod.slug}`}
          prefetch={false}
          className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-[#E6007E] hover:bg-[#C5006C] text-white flex items-center justify-center transition-colors shadow-xs active:scale-95 shrink-0"
          title={isAr ? 'عرض المنتج' : 'View Product'}
        >
          <ShoppingBag className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </Link>
      </div>
    </div>
  );
}
