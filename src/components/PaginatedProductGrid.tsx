'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { WishlistHeart } from '@/components/WishlistHeart';
import { getPaginatedProducts } from '@/actions/shop';
import { ShoppingBag, Eye, Tag } from 'lucide-react';

export function PaginatedProductGrid({ 
  initialProducts, 
  totalCount, 
  locale,
  filters 
}: { 
  initialProducts: any[]; 
  totalCount: number; 
  locale: string;
  filters: { categoryId: string, genderId: string, familyId: string, q: string }
}) {
  const [products, setProducts] = useState(initialProducts);
  const [loading, setLoading] = useState(false);
  const [skip, setSkip] = useState(initialProducts.length);
  const [sortBy, setSortBy] = useState('featured');

  // CRITICAL FIX: Ensure state updates whenever server filters or initialProducts change!
  useEffect(() => {
    setProducts(initialProducts);
    setSkip(initialProducts.length);
  }, [initialProducts]);

  // Sort products locally for instant response
  const sortedProducts = useMemo(() => {
    const list = [...products];
    if (sortBy === 'price_asc') {
      return list.sort((a, b) => {
        const priceA = a.priceFils || (a.variants?.[0]?.price) || 0;
        const priceB = b.priceFils || (b.variants?.[0]?.price) || 0;
        return priceA - priceB;
      });
    }
    if (sortBy === 'price_desc') {
      return list.sort((a, b) => {
        const priceA = a.priceFils || (a.variants?.[0]?.price) || 0;
        const priceB = b.priceFils || (b.variants?.[0]?.price) || 0;
        return priceB - priceA;
      });
    }
    if (sortBy === 'rating') {
      return list.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    }
    return list;
  }, [products, sortBy]);

  const hasMore = skip < totalCount;

  const handleLoadMore = async () => {
    if (loading || !hasMore) return;
    setLoading(true);

    const res = await getPaginatedProducts({
      skip,
      take: 40,
      ...filters
    });

    if (res.success && res.products) {
      setProducts(prev => [...prev, ...res.products]);
      setSkip(prev => prev + res.products.length);
    }
    
    setLoading(false);
  };

  const isAr = locale === 'ar';

  return (
    <div className="w-full">
      {/* Products Grid - Optimized for Mobile & Desktop */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-4 md:gap-6">
        {sortedProducts.map((product) => {
          const mainImage = product.images?.find((img: any) => img.isMain) || product.images?.[0];
          const lowestPrice = product.priceFils 
            ? product.priceFils 
            : (product.variants?.length > 0 ? Math.min(...product.variants.map((v: any) => v.price)) : 0);

          const originalPrice = product.originalPriceFils || product.compareAtPriceFils;
          const hasDiscount = Boolean(originalPrice && originalPrice > lowestPrice);
          const discountPercent = product.discountPercent || (hasDiscount && originalPrice ? Math.round(((originalPrice - lowestPrice) / originalPrice) * 100) : 0);

          const imgUrl = mainImage?.url?.startsWith('local://') ? '/product-placeholder.png' : (mainImage?.url || '/logo.png');

          return (
            <div
              key={product.id}
              className={`bg-white rounded-2xl border p-2.5 sm:p-4 flex flex-col justify-between transition-all duration-300 hover:shadow-lg group relative ${
                hasDiscount ? 'border-pink-200 hover:border-[#E6007E]' : 'border-zinc-200 hover:border-[#E6007E]'
              }`}
            >
              {/* Wishlist Heart */}
              <div className="absolute top-2.5 start-2.5 z-10">
                <WishlistHeart product={{
                  id: product.id,
                  nameAr: product.nameAr,
                  nameEn: product.nameEn,
                  slug: product.slug,
                  imageUrl: imgUrl,
                  price: lowestPrice,
                  stockStatus: product.stockStatus || 'IN_STOCK'
                }} />
              </div>

              {/* Product Visual Container */}
              <div>
                <Link href={`/${locale}/products/${product.slug}`} className="block">
                  <div className="aspect-square bg-zinc-100 rounded-xl mb-2 sm:mb-3 relative overflow-hidden group-hover:scale-102 transition-transform">
                    <Image
                      src={imgUrl}
                      unoptimized
                      alt={product.nameAr || 'منتج غزل'}
                      fill
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                      className="object-cover w-full h-full"
                    />

                    {/* Discount Badge on Top Head Corner */}
                    {hasDiscount && discountPercent > 0 && (
                      <span className="absolute top-2 end-2 bg-gradient-to-r from-rose-600 to-[#E6007E] text-white text-[10px] sm:text-[11px] font-black px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg shadow-sm border border-white/30 tracking-tight z-10 flex items-center gap-0.5 pointer-events-none">
                        <span>{isAr ? 'خصم' : 'OFF'}</span>
                        <span dir="ltr">-{discountPercent}%</span>
                      </span>
                    )}

                    {/* Custom Product Badge (مثل الأكثر مبيعاً أو موصى به من الأطباء) */}
                    {product.tag && (
                      <span className="absolute bottom-2 start-2 bg-white/95 backdrop-blur-xs text-[9px] font-black text-[#E6007E] px-2 py-0.5 rounded shadow-2xs border border-pink-100 z-10">
                        {product.tag}
                      </span>
                    )}
                  </div>
                </Link>

                {/* Brand & Category */}
                <div className="flex items-center justify-between text-[9px] sm:text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-1">
                  <span className="truncate max-w-[50%]">{product.brand?.name || (product.brandName === 'غزل' ? '' : product.brandName) || ''}</span>
                  <span className="truncate max-w-[50%]">{product.category?.name || product.categoryName}</span>
                </div>

                {/* Title */}
                <Link href={`/${locale}/products/${product.slug}`}>
                  <h3 className="text-xs sm:text-sm font-bold text-zinc-900 line-clamp-2 hover:text-[#E6007E] transition-colors mb-2 leading-snug">
                    {isAr ? product.nameAr : (product.nameEn || product.nameAr)}
                  </h3>
                </Link>
                {product.variants?.filter((variant: any) => variant.isActive !== false).length > 1 && (
                  <p className="text-[10px] sm:text-xs text-[#E6007E] font-bold mb-2">
                    {isAr ? 'يتوفر بعدة خيارات' : 'Available in multiple options'}
                  </p>
                )}
              </div>

              {/* Price & Action - Clean Numbers Before & After without extra text */}
              <div className="pt-2 border-t border-zinc-100 flex items-center justify-between gap-1.5 mt-auto">
                <div>
                  <div className="flex items-baseline gap-1.5 flex-wrap">
                    {/* السعر الحالي بعد الخصم */}
                    <span className="text-xs sm:text-sm md:text-base font-black text-[#E6007E] font-mono">
                      {(lowestPrice / 1000).toFixed(2)}{' '}
                      <span className="text-[10px] font-normal font-sans text-zinc-600">د.أ</span>
                    </span>

                    {/* السعر قبل الخصم (أرقام مشطوبة فقط بدون أي نصوص شرح) */}
                    {hasDiscount && (
                      <span className="text-[10px] sm:text-xs text-zinc-400 line-through font-mono">
                        {(originalPrice / 1000).toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>

                {/* زر عرض فقط */}
                <Link
                  href={`/${locale}/products/${product.slug}`}
                  className="px-2.5 py-1.5 rounded-lg bg-[#E6007E] hover:bg-[#C5006C] text-white text-[11px] font-bold flex items-center gap-1 transition-all shadow-xs active:scale-95 shrink-0"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>{isAr ? 'عرض' : 'View'}</span>
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination Load More */}
      {hasMore && (
        <div className="mt-12 flex justify-center">
          <button 
            onClick={handleLoadMore}
            disabled={loading}
            className="px-8 py-3 bg-white border-2 border-[#E6007E] text-[#E6007E] hover:bg-[#E6007E] hover:text-white font-bold rounded-xl text-xs md:text-sm transition-all shadow-xs disabled:opacity-50 flex items-center gap-2 active:scale-95"
          >
            {loading && <span className="animate-spin">⏳</span>}
            <span>{isAr ? 'عرض المزيد من المنتجات' : 'Load More Products'}</span>
          </button>
        </div>
      )}

      {sortedProducts.length === 0 && (
        <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-zinc-200 mt-6">
          <ShoppingBag className="w-12 h-12 text-zinc-300 mx-auto mb-3" />
          <h4 className="text-base font-bold text-zinc-800">لم نتمكن من العثور على أي منتج يطابق خياراتك</h4>
          <p className="text-xs text-zinc-400 mt-1">جربي البحث بكلمة مختلفة أو اختاري تصنيفاً آخر.</p>
        </div>
      )}
    </div>
  );
}
