'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { filsToDisplay } from '@/lib/money';
import { Check, ShoppingBag, Maximize2, X } from 'lucide-react';

interface Variant {
  id: string;
  sku?: string;
  size?: string | null;
  shade?: string | null;
  colorName?: string | null;
  colorHex?: string | null;
  imageUrl?: string | null;
  image?: string | null;
  scent?: string | null;
  price: number;
  stock?: number;
}

interface ProductShowcaseProps {
  product: any;
  locale: string;
  initialImage: string;
  demoProduct?: any;
  lowestPrice: number;
}

export function ProductShowcase({
  product,
  locale = 'ar',
  initialImage,
  demoProduct,
  lowestPrice,
}: ProductShowcaseProps) {
  const isAr = locale === 'ar';
  const variants: Variant[] = product.variants || [];

  const [selectedVariant, setSelectedVariant] = useState<Variant | null>(() => variants[0] || null);
  const [activeImage, setActiveImage] = useState<string>(() => {
    return variants[0]?.imageUrl || (variants[0] as any)?.image || initialImage || '/logo.png';
  });
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  const productName = isAr ? product.nameAr : (product.nameEn || product.nameAr);

  // Check what attributes exist across variants (ensuring only ONE active dimension shows)
  const hasShades = variants.some(v => v.shade || v.colorHex);
  const hasSizes = !hasShades && variants.some(v => v.size && v.size !== 'Standard' && v.size !== 'افتراضي');
  const hasScents = !hasShades && !hasSizes && variants.some(v => v.scent || v.colorName);

  const handleSelectVariant = (v: Variant) => {
    setSelectedVariant(v);
    const targetImg = v.imageUrl || (v as any).image;
    if (targetImg) {
      setActiveImage(targetImg);
    }
  };

  const handleAddToCart = () => {
    if (!selectedVariant) return;

    try {
      const savedGhazal = localStorage.getItem('ghazal_cart');
      const savedDahab = localStorage.getItem('dahab_cart');
      const cartItems = savedGhazal ? JSON.parse(savedGhazal) : (savedDahab ? JSON.parse(savedDahab) : []);

      const existingItem = cartItems.find((item: any) => item.variantId === selectedVariant.id);

      const variantLabel = [
        selectedVariant.shade ? `${isAr ? 'درجة' : 'Shade'} ${selectedVariant.shade}` : null,
        selectedVariant.colorName || null,
        selectedVariant.size && selectedVariant.size !== 'Standard' ? selectedVariant.size : null,
        selectedVariant.scent ? `${isAr ? 'رائحة' : 'Scent'} ${selectedVariant.scent}` : null,
      ].filter(Boolean).join(' - ') || (isAr ? 'القياسي' : 'Standard');

      if (existingItem) {
        existingItem.quantity += quantity;
      } else {
        cartItems.push({
          productId: product.id,
          variantId: selectedVariant.id,
          sku: selectedVariant.sku || product.sku,
          name: productName,
          variantLabel,
          size: selectedVariant.size,
          shade: selectedVariant.shade,
          colorHex: selectedVariant.colorHex,
          price: selectedVariant.price,
          quantity: quantity,
          image: activeImage || initialImage || null
        });
      }

      localStorage.setItem('ghazal_cart', JSON.stringify(cartItems));
      localStorage.setItem('dahab_cart', JSON.stringify(cartItems));

      // Trigger a storage event manually so Header cart counter updates instantly
      window.dispatchEvent(new Event('storage'));

      setAdded(true);
      setTimeout(() => setAdded(false), 2200);
    } catch (e) {
      console.error('Failed to add to cart', e);
    }
  };

  const currentDisplayPrice = selectedVariant ? selectedVariant.price : lowestPrice;
  const activeOriginalPrice = (selectedVariant as any)?.compareAt || (product as any).originalPriceFils;
  const hasOffer = Boolean(activeOriginalPrice && activeOriginalPrice > currentDisplayPrice);
  const offerSavings = hasOffer ? (activeOriginalPrice - currentDisplayPrice) : 0;
  const offerPercent = hasOffer ? Math.round((offerSavings / activeOriginalPrice) * 100) : 0;

  return (
    <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-xs border border-zinc-200/90 grid grid-cols-1 md:grid-cols-12 gap-5 lg:gap-8 mb-10 items-start">
      
      {/* 1. Images Showcase Section (Compact & Clear) */}
      <div className="md:col-span-5 lg:col-span-4 flex flex-col items-center">
        <div className="w-full max-w-[240px] sm:max-w-[270px] aspect-square max-h-[270px] bg-zinc-50 rounded-2xl overflow-hidden relative border border-zinc-200/90 shadow-inner group">
          {/* Prominent Discount Badge on Upper End Corner */}
          {hasOffer && offerPercent > 0 && (
            <span className="absolute top-2.5 end-2.5 bg-gradient-to-r from-rose-600 to-[#E6007E] text-white text-[11px] sm:text-xs font-black px-2.5 py-1 rounded-xl shadow-md border border-white/30 tracking-tight z-10 flex items-center gap-1 pointer-events-none">
              <span>{isAr ? 'خصم' : 'OFF'}</span>
              <span dir="ltr">-{offerPercent}%</span>
            </span>
          )}

          {/* Custom Product Note / Badge (مثل الأكثر مبيعاً أو موصى به من الأطباء) */}
          {product.tag && (
            <span className="absolute top-2.5 start-2.5 bg-[#E6007E] text-white text-[10px] sm:text-[11px] font-black px-2.5 py-1 rounded-full shadow-md border border-white/20 z-10">
              {product.tag}
            </span>
          )}

          {/* Zoom Lightbox Trigger Button */}
          <button
            type="button"
            onClick={() => setIsLightboxOpen(true)}
            className="absolute top-2.5 end-2.5 w-7 h-7 rounded-lg bg-white/90 hover:bg-[#E6007E] text-zinc-600 hover:text-white border border-zinc-200 shadow-xs flex items-center justify-center transition-all z-10 cursor-pointer"
            title={isAr ? 'عرض وتكبير الصورة بوضوح' : 'Zoom Image'}
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>

          {/* High-Resolution Main / Variant Image filling display square */}
          <img
            src={activeImage}
            alt={productName}
            onClick={() => setIsLightboxOpen(true)}
            className="object-cover w-full h-full hover:scale-105 transition-transform duration-300 cursor-pointer"
            loading="eager"
          />

          {/* Active Variant Hint Badge on Image */}
          {selectedVariant && (selectedVariant.shade || selectedVariant.scent || selectedVariant.size) && (
            <div className="absolute bottom-2 start-2 end-2 bg-black/60 backdrop-blur-xs text-white text-[10px] font-bold py-0.5 px-2 rounded-md text-center truncate">
              {selectedVariant.shade || selectedVariant.scent || selectedVariant.size}
            </div>
          )}
        </div>
      </div>

      {/* 2. Product Details & Scaled Down Controls (Side-by-side) */}
      <div className="md:col-span-7 lg:col-span-8 flex flex-col justify-between">
        <div>
          {/* Title (Scaled down) */}
          <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-zinc-900 leading-snug mb-2">
            {productName}
          </h1>



          {/* Price Banner - Clean Numbers Before & After */}
          <div className="mb-4 p-3 rounded-xl bg-pink-50/40 border border-pink-200/80">
            {hasOffer ? (
              <div className="flex items-baseline gap-3 flex-wrap">
                {/* السعر الحالي */}
                <span className="text-2xl sm:text-3xl font-black text-[#E6007E] font-mono">
                  {filsToDisplay(currentDisplayPrice, isAr ? 'ar' : 'en')}
                </span>

                {/* السعر قبل الخصم مشطوب فقط */}
                <span className="text-sm sm:text-base text-zinc-400 line-through font-mono font-medium">
                  {filsToDisplay(activeOriginalPrice, isAr ? 'ar' : 'en')}
                </span>

                {/* نسبة الخصم البسيطة */}
                <span className="bg-gradient-to-r from-rose-600 to-[#E6007E] text-white text-[11px] font-black px-2 py-0.5 rounded-md shadow-xs">
                  -{offerPercent}%
                </span>
              </div>
            ) : (
              <div className="flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-black text-[#E6007E] font-mono">
                  {filsToDisplay(currentDisplayPrice, isAr ? 'ar' : 'en')}
                </span>
              </div>
            )}
          </div>

          {/* Short Description (Scaled down) */}
          <p className="text-xs sm:text-sm text-zinc-650 leading-relaxed mb-4">
            {product.shortDescription || product.fullDescription}
          </p>

          {/* Variant Controls (Compact single dimension) */}
          <div className="space-y-4 mb-5">
            {/* 1. Shade / Color Selector */}
            {hasShades && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-zinc-800 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#E6007E]" />
                    {isAr ? 'الدرجة / اللون:' : 'Shade / Color:'}
                  </span>
                  {selectedVariant?.shade && (
                    <span className="text-[#E6007E] font-black text-xs">
                      {selectedVariant.shade} {selectedVariant.colorName ? `(${selectedVariant.colorName})` : ''}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {variants.map((v) => {
                    const isSelected = selectedVariant?.id === v.id;
                    const vImg = v.imageUrl || (v as any).image;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => handleSelectVariant(v)}
                        className={`flex items-center gap-2 p-2 rounded-lg border text-start transition-all cursor-pointer ${
                          isSelected
                            ? 'border-[#E6007E] bg-pink-50/70 ring-1 ring-[#E6007E] text-zinc-900 font-bold shadow-2xs'
                            : 'border-zinc-200 hover:border-pink-300 bg-white text-zinc-700'
                        }`}
                      >
                        {vImg ? (
                          <img
                            src={vImg}
                            alt={v.shade || ''}
                            className="w-5 h-5 rounded-md object-contain shrink-0 border border-zinc-200 bg-white"
                          />
                        ) : (
                          <span
                            className="w-4 h-4 rounded-full border border-black/10 shrink-0 shadow-2xs flex items-center justify-center"
                            style={{ backgroundColor: v.colorHex || '#E6007E' }}
                          >
                            {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
                          </span>
                        )}

                        <div className="min-w-0 flex-1">
                          <p className="text-xs truncate font-bold">
                            {v.shade ? `${isAr ? 'درجة' : 'Shade'} ${v.shade}` : (v.colorName || v.size)}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 2. Size / Volume Selector */}
            {hasSizes && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-zinc-800">
                    {isAr ? 'الحجم / السعة:' : 'Size / Volume:'}
                  </span>
                  {selectedVariant?.size && (
                    <span className="text-[#E6007E] font-black text-xs">{selectedVariant.size}</span>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {variants.map((v) => {
                    const isSelected = selectedVariant?.id === v.id;
                    const vImg = v.imageUrl || (v as any).image;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => handleSelectVariant(v)}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                          isSelected
                            ? 'border-[#E6007E] bg-[#E6007E] text-white shadow-2xs'
                            : 'border-zinc-200 hover:border-pink-300 bg-white text-zinc-700'
                        }`}
                      >
                        {vImg && (
                          <img
                            src={vImg}
                            alt={v.size || ''}
                            className="w-4 h-4 rounded-sm object-contain shrink-0 bg-white"
                          />
                        )}
                        <span>{v.size}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 3. Scent / Fragrance Note Selector */}
            {hasScents && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-zinc-800">
                    {isAr ? 'الرائحة / النكهة:' : 'Scent / Fragrance:'}
                  </span>
                  {(selectedVariant?.scent || selectedVariant?.colorName) && (
                    <span className="text-[#E6007E] font-black text-xs">
                      {selectedVariant.scent || selectedVariant.colorName}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {variants.map((v) => {
                    const isSelected = selectedVariant?.id === v.id;
                    const scentLabel = v.scent || v.colorName || (isAr ? 'عطر غزل' : 'Fragrance');
                    const vImg = v.imageUrl || (v as any).image;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => handleSelectVariant(v)}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                          isSelected
                            ? 'border-[#E6007E] bg-pink-100 text-[#E6007E] ring-1 ring-[#E6007E] font-black'
                            : 'border-zinc-200 hover:border-pink-300 bg-white text-zinc-700'
                        }`}
                      >
                        {vImg && (
                          <img
                            src={vImg}
                            alt={scentLabel}
                            className="w-4 h-4 rounded-sm object-contain shrink-0 bg-white"
                          />
                        )}
                        <span>{scentLabel}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Quantity Controls & Add to Cart (Compact) */}
          <div className="pt-2 flex flex-col sm:flex-row items-center gap-2.5">
            {/* Quantity */}
            <div className="flex items-center border border-zinc-200 rounded-xl bg-zinc-50 p-1 shrink-0 w-full sm:w-auto justify-between sm:justify-start">
              <button 
                type="button"
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                className="w-8 h-8 rounded-lg bg-white hover:bg-zinc-200 text-zinc-800 font-bold transition flex items-center justify-center text-sm shadow-2xs cursor-pointer"
              >
                -
              </button>
              <span className="w-10 text-center font-extrabold text-xs sm:text-sm text-zinc-900">{quantity}</span>
              <button 
                type="button"
                onClick={() => setQuantity(quantity + 1)}
                className="w-8 h-8 rounded-lg bg-white hover:bg-zinc-200 text-zinc-800 font-bold transition flex items-center justify-center text-sm shadow-2xs cursor-pointer"
              >
                +
              </button>
            </div>

            {/* Add to Cart */}
            <button 
              type="button"
              disabled={!selectedVariant}
              onClick={handleAddToCart}
              className="w-full flex-1 bg-linear-to-r from-[#E6007E] to-[#C4006B] hover:from-[#d10072] hover:to-[#b00060] text-white font-bold py-2.5 sm:py-3 px-5 rounded-xl transition-all shadow-xs disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-[0.98] cursor-pointer text-xs sm:text-sm"
            >
              {added ? (
                <>
                  <Check className="w-4 h-4 animate-bounce" />
                  <span>{isAr ? 'تمت الإضافة إلى سلتكِ بنجاح!' : 'Added to Cart!'}</span>
                </>
              ) : (
                <>
                  <ShoppingBag className="w-4 h-4" />
                  <span>{isAr ? 'أضيفي إلى السلة' : 'Add to Cart'}</span>
                </>
              )}
            </button>
          </div>

        </div>
      </div>

      {/* Lightbox Modal (For clear high-res inspection) */}
      {isLightboxOpen && (
        <div
          className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setIsLightboxOpen(false)}
        >
          <div
            className="relative bg-white rounded-2xl p-4 max-w-xl max-h-[85vh] w-full flex flex-col items-center shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setIsLightboxOpen(false)}
              className="absolute top-3 end-3 w-8 h-8 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-700 flex items-center justify-center transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="w-full flex-1 flex items-center justify-center p-2 min-h-[300px]">
              <img
                src={activeImage}
                alt={productName}
                className="max-h-[70vh] max-w-full object-contain drop-shadow-md rounded-lg"
              />
            </div>
            <div className="text-center pt-2 border-t border-zinc-100 w-full">
              <p className="text-xs sm:text-sm font-bold text-zinc-900">{productName}</p>
              {selectedVariant?.shade && (
                <p className="text-xs text-[#E6007E] font-semibold">{selectedVariant.shade}</p>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
