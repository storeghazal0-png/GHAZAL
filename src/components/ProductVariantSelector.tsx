'use client';

import { useState } from 'react';
import { filsToDisplay } from '@/lib/money';
import { Check, ShoppingBag } from 'lucide-react';

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

export function ProductVariantSelector({ 
  variants = [], 
  locale = 'ar',
  product,
  mainImage
}: { 
  variants: Variant[], 
  locale: string,
  product: any,
  mainImage?: string
}) {
  const isAr = locale === 'ar';
  // Default to first variant if available
  const [selectedVariant, setSelectedVariant] = useState<Variant | null>(() => variants[0] || null);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  // Check what attributes exist across variants (allowing independent selection of scent, shade, and size)
  const distinctShades = new Set(variants.map(v => v.shade).filter(Boolean));
  const distinctScents = new Set(variants.map(v => v.scent || v.colorName).filter(Boolean));
  const distinctSizes = new Set(variants.map(v => v.size).filter(s => s && s !== 'Standard' && s !== 'افتراضي' && s !== 'قياسي'));

  const hasShades = distinctShades.size > 0 || variants.some(v => Boolean(v.colorHex));
  const hasScents = distinctScents.size > 0;
  const hasSizes = distinctSizes.size > 1 || (distinctSizes.size === 1 && !hasShades && !hasScents && variants.length > 1);
  const hasGenericVariants = !hasShades && !hasScents && !hasSizes && variants.length > 1;

  const handleSelectVariant = (v: Variant) => {
    setSelectedVariant(v);
    const targetImg = v.imageUrl || (v as any).image || mainImage;
    if (targetImg) {
      const imgEl = document.querySelector('#product-main-showcase-image') as HTMLImageElement;
      if (imgEl) {
        imgEl.src = targetImg;
      }
    }
    window.dispatchEvent(new CustomEvent('ghazal_variant_selected', { detail: v }));
  };

  const handleAddToCart = () => {
    if (!selectedVariant) return;
    
    try {
      const savedGhazal = localStorage.getItem('ghazal_cart');
      const savedDahab = localStorage.getItem('dahab_cart');
      const cartItems = savedGhazal ? JSON.parse(savedGhazal) : (savedDahab ? JSON.parse(savedDahab) : []);
      
      const existingItem = cartItems.find((item: any) => item.variantId === selectedVariant.id);
      
      const selectedImg = selectedVariant.imageUrl || (selectedVariant as any).image || mainImage || null;

      const variantLabel = [
        selectedVariant.scent ? `${isAr ? 'رائحة' : 'Scent'} ${selectedVariant.scent}` : null,
        selectedVariant.shade ? `${isAr ? 'درجة' : 'Shade'} ${selectedVariant.shade}` : null,
        selectedVariant.colorName || null,
        selectedVariant.size && selectedVariant.size !== 'Standard' && selectedVariant.size !== 'افتراضي' && selectedVariant.size !== 'قياسي' ? selectedVariant.size : null,
      ].filter(Boolean).join(' - ') || (isAr ? 'القياسي' : 'Standard');

      if (existingItem) {
        existingItem.quantity += quantity;
        if (selectedImg) existingItem.image = selectedImg;
        existingItem.variantLabel = variantLabel;
        existingItem.colorName = selectedVariant.colorName || selectedVariant.scent || existingItem.colorName;
        existingItem.scent = selectedVariant.scent || existingItem.scent;
        existingItem.shade = selectedVariant.shade || existingItem.shade;
        existingItem.barcode = (selectedVariant as any).barcode || selectedVariant.sku || existingItem.barcode;
      } else {
        cartItems.push({
          productId: product.id,
          variantId: selectedVariant.id,
          sku: selectedVariant.sku || product.sku,
          barcode: (selectedVariant as any).barcode || selectedVariant.sku || null,
          name: isAr ? product.nameAr : (product.nameEn || product.nameAr),
          variantLabel,
          size: selectedVariant.size,
          shade: selectedVariant.shade,
          colorName: selectedVariant.colorName || selectedVariant.scent || null,
          scent: selectedVariant.scent || null,
          colorHex: selectedVariant.colorHex,
          price: selectedVariant.price,
          quantity: quantity,
          image: selectedImg
        });
      }
      
      localStorage.setItem('ghazal_cart', JSON.stringify(cartItems));
      localStorage.setItem('dahab_cart', JSON.stringify(cartItems));
      
      // Trigger storage and cart events so Header and floating carts update instantly
      window.dispatchEvent(new Event('storage'));
      window.dispatchEvent(new Event('cart_updated'));
      
      setAdded(true);
      setTimeout(() => setAdded(false), 2200);
    } catch (e) {
      console.error('Failed to add to cart', e);
    }
  };

  return (
    <div className="space-y-6">
      {/* Dynamic Price Display */}
      <div className="flex items-baseline gap-2">
        <span className="text-xs font-bold text-zinc-500 uppercase">
          {isAr ? 'سعر الخيار المحدد:' : 'Selected Price:'}
        </span>
        <span className="text-2xl font-black text-[#E6007E]">
          {selectedVariant ? filsToDisplay(selectedVariant.price, isAr ? 'ar' : 'en') : '—'}
        </span>
      </div>

      {/* 1. Shade / Color Selector */}
      {hasShades && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-zinc-800 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#E6007E]" />
              {isAr ? 'الدرجة / اللون:' : 'Shade / Color:'}
            </span>
            {selectedVariant?.shade && (
              <span className="text-[#E6007E] font-extrabold">
                {selectedVariant.shade} {selectedVariant.colorName ? `(${selectedVariant.colorName})` : ''}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {variants.map((v) => {
              const isSelected = selectedVariant?.id === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => handleSelectVariant(v)}
                  className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-right transition-all ${
                    isSelected
                      ? 'border-[#E6007E] bg-pink-50/60 ring-2 ring-[#E6007E]/20 text-zinc-900 font-bold'
                      : 'border-zinc-200 hover:border-pink-300 bg-white text-zinc-700'
                  }`}
                >
                  {/* Swatch Circle or Variant Image */}
                  {v.imageUrl ? (
                    <img
                      src={v.imageUrl}
                      alt={v.shade || v.colorName || ''}
                      className="w-6 h-6 rounded-md object-contain shrink-0 border border-pink-200 bg-white"
                    />
                  ) : (
                    <span
                      className="w-5 h-5 rounded-full border border-black/10 shrink-0 shadow-xs flex items-center justify-center"
                      style={{ backgroundColor: v.colorHex || '#E6007E' }}
                    >
                      {isSelected && <Check className="w-3 h-3 text-white drop-shadow-sm" />}
                    </span>
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="text-xs truncate font-bold">
                      {v.shade ? `${isAr ? 'درجة' : 'Shade'} ${v.shade}` : (v.colorName || v.size)}
                    </p>
                    {v.colorName && v.shade && (
                      <p className="text-[10px] text-zinc-500 truncate">{v.colorName}</p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 2. Size / Volume Selector */}
      {hasSizes && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-zinc-800">
              {isAr ? 'الحجم / السعة:' : 'Size / Volume:'}
            </span>
            {selectedVariant?.size && (
              <span className="text-[#E6007E] font-extrabold">{selectedVariant.size}</span>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {variants.map((v) => {
              const isSelected = selectedVariant?.id === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => handleSelectVariant(v)}
                  className={`px-3.5 py-2 rounded-xl border text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                    isSelected
                      ? 'border-[#E6007E] bg-[#E6007E] text-white shadow-xs'
                      : 'border-zinc-200 hover:border-pink-300 bg-white text-zinc-700'
                  }`}
                >
                  {v.imageUrl && (
                    <img
                      src={v.imageUrl}
                      alt={v.size || ''}
                      className="w-5 h-5 rounded-md object-contain shrink-0 bg-white border border-pink-100"
                    />
                  )}
                  <span>{v.size}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. Scent / Fragrance Note Selector (if available) */}
      {hasScents && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-zinc-800">
              {isAr ? 'الرائحة / النكهة:' : 'Scent / Flavor:'}
            </span>
            {(selectedVariant?.scent || selectedVariant?.colorName) && (
              <span className="text-[#E6007E] font-extrabold">
                {selectedVariant.scent || selectedVariant.colorName}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {variants.map((v) => {
              const isSelected = selectedVariant?.id === v.id;
              const scentLabel = v.scent || v.colorName || (isAr ? 'عطر غزل' : 'Fragrance');
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => handleSelectVariant(v)}
                  className={`px-3.5 py-2 rounded-xl border text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                    isSelected
                      ? 'border-[#E6007E] bg-pink-100 text-[#E6007E] ring-2 ring-[#E6007E]/20 font-black'
                      : 'border-zinc-200 hover:border-pink-300 bg-white text-zinc-700'
                  }`}
                >
                  {v.imageUrl && (
                    <img
                      src={v.imageUrl}
                      alt={scentLabel}
                      className="w-5 h-5 rounded-md object-contain shrink-0 bg-white border border-pink-100"
                    />
                  )}
                  <span>{scentLabel}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. Generic Options Selector */}
      {hasGenericVariants && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-zinc-800">
              {isAr ? 'الخيارات المتاحة:' : 'Available Options:'}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {variants.map((v, i) => {
              const isSelected = selectedVariant?.id === v.id;
              const label = v.colorName || v.shade || v.size || `خيار ${i + 1}`;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => handleSelectVariant(v)}
                  className={`px-3.5 py-2 rounded-xl border text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                    isSelected
                      ? 'border-[#E6007E] bg-pink-100 text-[#E6007E] ring-2 ring-[#E6007E]/20 font-black'
                      : 'border-zinc-200 hover:border-pink-300 bg-white text-zinc-700'
                  }`}
                >
                  {v.imageUrl && (
                    <img
                      src={v.imageUrl}
                      alt={label}
                      className="w-5 h-5 rounded-md object-contain shrink-0 bg-white border border-pink-100"
                    />
                  )}
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Quantity & Add to Cart Action */}
      <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
        {/* Quantity Controls */}
        <div className="flex items-center border border-zinc-200 rounded-2xl bg-zinc-50 p-1 shrink-0 w-full sm:w-auto justify-between sm:justify-start">
          <button 
            type="button"
            onClick={() => setQuantity(Math.max(1, quantity - 1))}
            className="w-10 h-10 rounded-xl bg-white hover:bg-zinc-200 text-zinc-800 font-bold transition flex items-center justify-center text-base shadow-xs"
          >
            -
          </button>
          <span className="w-12 text-center font-extrabold text-sm text-zinc-900">{quantity}</span>
          <button 
            type="button"
            onClick={() => setQuantity(quantity + 1)}
            className="w-10 h-10 rounded-xl bg-white hover:bg-zinc-200 text-zinc-800 font-bold transition flex items-center justify-center text-base shadow-xs"
          >
            +
          </button>
        </div>

        {/* Add to Cart Button */}
        <button 
          type="button"
          disabled={!selectedVariant}
          onClick={handleAddToCart}
          className="w-full flex-1 bg-gradient-to-r from-[#E6007E] to-[#C4006B] hover:from-[#d10072] hover:to-[#b00060] text-white font-extrabold py-3.5 px-6 rounded-2xl transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-[0.98]"
        >
          {added ? (
            <>
              <Check className="w-5 h-5 animate-bounce" />
              <span>{isAr ? 'تمت الإضافة إلى سلتكِ بنجاح!' : 'Added to Cart!'}</span>
            </>
          ) : (
            <>
              <ShoppingBag className="w-5 h-5" />
              <span>{isAr ? 'أضيفي إلى السلة' : 'Add to Cart'}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
