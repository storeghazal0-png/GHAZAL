'use client';

import React, { useState, useTransition, useEffect, useRef, useCallback } from 'react';
import { 
  Plus, Trash2, RefreshCw, AlertCircle, ShoppingBag, AlertTriangle, 
  FileEdit, Eye, Maximize2, X, Sparkles, Camera, ScanLine, 
  Barcode, CheckCircle2, ZoomIn, ZoomOut, RotateCcw, Search
} from 'lucide-react';
import { addOrderItemToCustomerOrder, removeOrderItemFromCustomerOrder } from '@/actions/orders';
import { findProductByBarcodeOrSkuAction } from '@/actions/products';
import { CameraBarcodeScannerModal } from '@/components/CameraBarcodeScannerModal';
import { resolvePOSItemImage } from '@/lib/order-image';
import { filsToDisplay } from '@/lib/money';

interface Props {
  orderId: string;
  items: any[];
  shippingCost: number;
  availableProducts?: any[];
  isLocked: boolean; // true if DELIVERED or CANCELLED
  onOrderUpdated?: () => void;
}

export function AdminOrderItemsEditor({ 
  orderId, 
  items, 
  shippingCost, 
  availableProducts = [], 
  isLocked,
  onOrderUpdated
}: Props) {
  const [isPending, startTransition] = useTransition();

  // Dynamic available products catalog (initial + scanned on demand)
  const [localProducts, setLocalProducts] = useState<any[]>(availableProducts);

  useEffect(() => {
    if (availableProducts && availableProducts.length > 0) {
      setLocalProducts((prev) => {
        const map = new Map<string, any>();
        prev.forEach((p) => map.set(p.id, p));
        availableProducts.forEach((p) => map.set(p.id, p));
        return Array.from(map.values());
      });
    }
  }, [availableProducts]);

  // Add Item Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [customPriceStr, setCustomPriceStr] = useState('');
  const [addReason, setAddReason] = useState('');

  // Barcode Scanning State
  const [barcodeInput, setBarcodeInput] = useState('');
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isSearchingBarcode, setIsSearchingBarcode] = useState(false);
  const [scanFeedback, setScanFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const barcodeInputRef = useRef<HTMLInputElement | null>(null);

  // Delete Item Modal State
  const [itemToDelete, setItemToDelete] = useState<{ id: string; name: string; quantity: number; total: number } | null>(null);
  const [deleteReason, setDeleteReason] = useState('');

  // Image Lightbox Preview State with Zoom
  const [previewImage, setPreviewImage] = useState<{ url: string; title: string; subtitle?: string } | null>(null);
  const [zoomScale, setZoomScale] = useState(1);

  const [error, setError] = useState<string | null>(null);

  const selectedProduct = localProducts.find((p) => p.id === selectedProductId);

  // Audio beep feedback
  const playBeep = useCallback((isSuccess = true) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = isSuccess ? 'sine' : 'sawtooth';
      osc.frequency.setValueAtTime(isSuccess ? 1850 : 420, ctx.currentTime);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (isSuccess ? 0.15 : 0.25));
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + (isSuccess ? 0.15 : 0.25));
    } catch {}
  }, []);

  const handleOpenAddModal = () => {
    const defaultProduct = localProducts[0];
    setSelectedProductId(defaultProduct?.id || '');
    setQuantity(1);
    const initialPrice = defaultProduct?.variants?.[0]?.price || 15000;
    setCustomPriceStr((initialPrice / 1000).toFixed(3));
    setAddReason('طلب الزبونة هاتفياً إضافة صنف للفاتورة');
    setBarcodeInput('');
    setScanFeedback(null);
    setError(null);
    setIsAddModalOpen(true);

    // Autofocus barcode input after modal animation
    setTimeout(() => {
      barcodeInputRef.current?.focus();
    }, 150);
  };

  const handleProductChange = (prodId: string) => {
    setSelectedProductId(prodId);
    const p = localProducts.find((x) => x.id === prodId);
    if (p) {
      const priceFils = p.variants?.[0]?.price || 15000;
      setCustomPriceStr((priceFils / 1000).toFixed(3));
    }
  };

  // Core Barcode Detection & Product Lookup (Scanner Gun + Camera)
  const handleBarcodeDetected = useCallback(async (rawCode: string) => {
    const cleanCode = rawCode.trim();
    if (!cleanCode) return;

    setBarcodeInput(cleanCode);
    setIsSearchingBarcode(true);
    setScanFeedback(null);
    setError(null);

    // 1. Search in localProducts
    const existing = localProducts.find((p) => {
      if (p.id === cleanCode || p.sku?.toLowerCase() === cleanCode.toLowerCase()) return true;
      if (p.variants?.some((v: any) => v.barcode === cleanCode || v.sku?.toLowerCase() === cleanCode.toLowerCase())) return true;
      return false;
    });

    if (existing) {
      setSelectedProductId(existing.id);
      const matchedVariant = existing.variants?.find((v: any) => v.barcode === cleanCode) || existing.variants?.[0];
      const price = matchedVariant?.price || 15000;
      setCustomPriceStr((price / 1000).toFixed(3));
      setScanFeedback({
        type: 'success',
        message: `تم التعرف على الصنف: ${existing.nameAr || existing.name} (${(price / 1000).toFixed(3)} د.أ)`
      });
      playBeep(true);
      setIsSearchingBarcode(false);
      return;
    }

    // 2. Query full Database via Server Action
    try {
      const res = await findProductByBarcodeOrSkuAction(cleanCode);
      if (res.success && res.product) {
        const p = res.product as any;
        const matchedVariant = p.variants?.find((v: any) => v.barcode === cleanCode) || p.variants?.[0];
        const price = matchedVariant?.price || 15000;

        const newProd = {
          id: p.id,
          nameAr: p.nameAr,
          name: p.nameEn || p.nameAr,
          imageUrl: p.imageUrl || null,
          sku: p.sku,
          variants: p.variants?.map((v: any) => ({
            id: v.id,
            size: v.size || v.shade || 'قياسي',
            price: v.price,
            barcode: v.barcode,
            sku: v.sku,
            imageUrl: v.imageUrl
          })) || []
        };

        setLocalProducts((prev) => [newProd, ...prev]);
        setSelectedProductId(newProd.id);
        setCustomPriceStr((price / 1000).toFixed(3));
        setScanFeedback({
          type: 'success',
          message: `تم العثور على الصنف من قاعدة البيانات: ${newProd.nameAr || newProd.name} (${(price / 1000).toFixed(3)} د.أ)`
        });
        playBeep(true);
      } else {
        setScanFeedback({
          type: 'error',
          message: `لم يتم العثور على أي منتج مسجل بالباركود: ${cleanCode}`
        });
        playBeep(false);
      }
    } catch (err: any) {
      setScanFeedback({
        type: 'error',
        message: `خطأ أثناء البحث عن الباركود: ${err.message || err}`
      });
      playBeep(false);
    } finally {
      setIsSearchingBarcode(false);
    }
  }, [localProducts, playBeep]);

  // Physical Barcode Scanner Gun Keystroke Listener
  useEffect(() => {
    if (!isAddModalOpen) return;

    let buffer = '';
    let lastKeyTime = Date.now();

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in notes/reason textarea
      const target = e.target as HTMLElement;
      if (target?.tagName === 'TEXTAREA') return;

      const currentTime = Date.now();
      const timeDiff = currentTime - lastKeyTime;
      lastKeyTime = currentTime;

      if (e.key === 'Enter') {
        if (buffer.length >= 3) {
          e.preventDefault();
          const scannedCode = buffer.trim();
          buffer = '';
          handleBarcodeDetected(scannedCode);
        }
        return;
      }

      // Barcode scanner guns type consecutive characters very rapidly (< 70ms)
      if (e.key.length === 1) {
        if (timeDiff > 90 && buffer.length > 0) {
          buffer = e.key;
        } else {
          buffer += e.key;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isAddModalOpen, handleBarcodeDetected]);

  // Handle Add Item to Order
  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) {
      setError('يرجى اختيار منتج لإضافته');
      return;
    }
    const priceVal = parseFloat(customPriceStr);
    if (isNaN(priceVal) || priceVal <= 0) {
      setError('يرجى تحديد سعر صالح');
      return;
    }
    if (!addReason.trim()) {
      setError('يرجى كتابة سبب التعديل والإضافة لتسجيلها في سجل الطلب');
      return;
    }

    startTransition(async () => {
      setError(null);
      const res = await addOrderItemToCustomerOrder(orderId, {
        productId: selectedProduct.id,
        variantId: selectedProduct.variants?.[0]?.id,
        quantity: Math.max(1, quantity),
        unitPrice: Math.round(priceVal * 1000),
        productName: selectedProduct.nameAr || selectedProduct.name,
        variantLabel: selectedProduct.variants?.[0]?.size || 'قياسي',
        reason: addReason.trim()
      });

      if (res.success) {
        setIsAddModalOpen(false);
        onOrderUpdated?.();
      } else {
        setError(res.error || 'فشل إضافة الصنف');
      }
    });
  };

  const handleOpenDeleteModal = (item: any) => {
    setItemToDelete({
      id: item.id,
      name: item.name || item.product?.nameAr || 'هذا المنتج',
      quantity: item.quantity || 1,
      total: item.total || item.totalPrice || ((item.unitPrice || 0) * (item.quantity || 1))
    });
    setDeleteReason('طلب الزبونة إلغاء هذا الصنف قبل التوصيل');
    setError(null);
  };

  const handleConfirmDelete = (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemToDelete) return;
    if (!deleteReason.trim()) {
      setError('يرجى كتابة سبب حذف الصنف لتسجيله رسمياً في سجل التعديلات');
      return;
    }

    startTransition(async () => {
      setError(null);
      const res = await removeOrderItemFromCustomerOrder(orderId, itemToDelete.id, deleteReason.trim());
      if (res.success) {
        setItemToDelete(null);
        onOrderUpdated?.();
      } else {
        setError(res.error || 'فشل حذف الصنف');
      }
    });
  };

  return (
    <div className="space-y-4">
      {/* Header and Add Button */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-zinc-200">
        <div>
          <h3 className="font-extrabold text-sm text-zinc-900 flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-[#E6007E]" />
            <span>الأصناف والمنتجات بالفاتورة ({items.length})</span>
          </h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            {isLocked
              ? 'تم قفل تعديل الفاتورة لأن الطلب أصبح مكتملاً أو ملغياً.'
              : 'يمكنك تكبير أي صورة للتأكد من الصنف، أو إضافة صنف جديد للفاتورة عبر قارئ الباركود أو الكاميرا.'}
          </p>
        </div>

        {!isLocked && (
          <button
            type="button"
            onClick={handleOpenAddModal}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#E6007E] hover:bg-[#c4006b] text-white text-xs font-bold transition shadow-xs active:scale-95 cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة منتج للفاتورة (باركود / كاميرا)</span>
          </button>
        )}
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-bold flex items-center gap-2 animate-fade-in">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Items List with Clear Click-to-Zoom Product Images */}
      <div className="divide-y divide-zinc-200">
        {items.map((item) => {
          const itemName = item.name || item.product?.nameAr || 'منتج غير مسمى';
          const itemSpec = item.size || item.variant?.size || null;
          const itemTotal = ((item.total || item.totalPrice || ((item.unitPrice || 0) * (item.quantity || 1))) || 0);
          const itemImage = item.imageUrl || item.image || resolvePOSItemImage(item) || item.variant?.imageUrl || item.product?.images?.[0]?.url || null;

          return (
            <div 
              key={item.id} 
              className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 group hover:bg-zinc-50/80 p-3 rounded-2xl transition border border-transparent hover:border-zinc-200"
            >
              {/* Product Visual Thumbnail & Info */}
              <div className="flex items-center gap-3.5 sm:gap-4 flex-1 min-w-0">
                {/* Image Box with Click-to-Zoom Lightbox */}
                <div 
                  onClick={() => {
                    if (itemImage) {
                      setPreviewImage({ 
                        url: itemImage, 
                        title: itemName,
                        subtitle: itemSpec ? `المواصفة / الحجم: ${itemSpec}` : undefined
                      });
                      setZoomScale(1);
                    }
                  }}
                  className={`relative w-16 h-16 sm:w-20 sm:h-20 shrink-0 rounded-2xl overflow-hidden border border-zinc-200 bg-white shadow-2xs flex items-center justify-center ${
                    itemImage ? 'cursor-pointer hover:border-[#E6007E] transition' : ''
                  }`}
                  title={itemImage ? 'انقر لتكبير صورة الصنف والتأكد من التجهيز' : 'صورة الصنف غير متوفرة'}
                >
                  {itemImage ? (
                    <>
                      <img 
                        src={itemImage} 
                        alt={itemName} 
                        className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-200" 
                      />
                      <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                        <Maximize2 className="w-5 h-5 drop-shadow-md" />
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center text-zinc-300">
                      <ShoppingBag className="w-6 h-6 text-pink-300" />
                      <span className="text-[9px] font-black text-pink-400 mt-0.5">غزل</span>
                    </div>
                  )}
                </div>

                {/* Details */}
                <div className="space-y-1.5 min-w-0 flex-1">
                  <h4 className="font-black text-sm sm:text-base text-zinc-900 leading-snug" title={itemName}>
                    {itemName}
                  </h4>

                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {(item.colorName || item.scent || (item.variant as any)?.colorName) && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-pink-100 text-[#E6007E] font-black border border-pink-300 text-xs shadow-2xs">
                        <span>الرائحة / الخيار: {item.colorName || item.scent || (item.variant as any)?.colorName}</span>
                      </span>
                    )}
                    {(item.shade || (item.variant as any)?.shade) && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-purple-100 text-purple-800 font-black border border-purple-300 text-xs shadow-2xs">
                        <span>الدرجة: {item.shade || (item.variant as any)?.shade}</span>
                      </span>
                    )}
                    {itemSpec && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg bg-zinc-100 text-zinc-800 font-bold border border-zinc-200 text-xs">
                        المواصفة: {itemSpec}
                      </span>
                    )}
                    {(item.barcode || (item.variant as any)?.barcode) && (
                      <span className="font-mono text-[11px] font-bold text-zinc-800 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200" dir="ltr">
                        باركود: {item.barcode || (item.variant as any)?.barcode}
                      </span>
                    )}
                  </div>

                  {/* High-Visibility Quantity for Warehouse Packaging */}
                  <div className="flex flex-wrap items-center gap-2.5 pt-0.5">
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-xl bg-pink-100/80 text-[#E6007E] font-black text-xs sm:text-sm border border-pink-200 shadow-2xs">
                      الكمية للتجهيز: {item.quantity} قطعة
                    </span>
                    <span className="text-xs text-zinc-500 font-bold font-mono">
                      (سعر الحبة: {((item.unitPrice || 0) / 1000).toFixed(3)} د.أ)
                    </span>
                  </div>
                </div>
              </div>

              {/* Price & Delete Action */}
              <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-zinc-100">
                <div className="text-start sm:text-end">
                  <span className="text-[10px] font-bold text-zinc-400 block">إجمالي الصنف</span>
                  <span className="font-black text-[#E6007E] font-mono text-base sm:text-lg" dir="ltr">
                    {(itemTotal / 1000).toFixed(3)} د.أ
                  </span>
                </div>

                {!isLocked && (
                  <button
                    type="button"
                    onClick={() => handleOpenDeleteModal(item)}
                    disabled={isPending}
                    className="p-2 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition cursor-pointer border border-transparent hover:border-red-200"
                    title="حذف هذا الصنف من الطلب"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Item Modal with Barcode Scanner & Camera Support */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto" dir="rtl">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-zinc-200 animate-fade-in my-8">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-200">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-pink-100 text-[#E6007E] flex items-center justify-center font-bold">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-base text-zinc-900">إضافة منتج جديد لفاتورة الطلب</h3>
                  <p className="text-[11px] text-zinc-500">امسح باركود المنتج بالكاميرا أو القارئ الضوئي لإضافته فوراً</p>
                </div>
              </div>
              <button 
                onClick={() => setIsAddModalOpen(false)} 
                className="p-1.5 rounded-xl hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Quick Barcode Scanner Section */}
            <div className="my-4 p-3.5 bg-gradient-to-r from-pink-50/70 via-purple-50/50 to-white rounded-2xl border border-pink-200/80 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-zinc-800 flex items-center gap-1.5">
                  <Barcode className="w-4 h-4 text-[#E6007E]" />
                  <span>قارئ الباركود السريع (جهاز المسح / الكاميرا)</span>
                </span>
                <span className="text-[10px] text-zinc-500 bg-white px-2 py-0.5 rounded-full border border-zinc-200 font-bold">
                  يدعم قارئ الليزر والكاميرا
                </span>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    ref={barcodeInputRef}
                    type="text"
                    value={barcodeInput}
                    onChange={(e) => setBarcodeInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleBarcodeDetected(barcodeInput);
                      }
                    }}
                    placeholder="امسح بالباركود (Scanner Gun) أو اكتب الكود..."
                    className="w-full bg-white border border-zinc-300 focus:border-[#E6007E] rounded-xl pl-3 pr-8 py-2 text-xs font-mono font-bold outline-none transition"
                  />
                  <ScanLine className="w-4 h-4 text-zinc-400 absolute right-2.5 top-1/2 -translate-y-1/2" />
                </div>

                <button
                  type="button"
                  onClick={() => handleBarcodeDetected(barcodeInput)}
                  disabled={isSearchingBarcode || !barcodeInput.trim()}
                  className="px-3 py-2 bg-zinc-900 hover:bg-black text-white text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-1 shrink-0 disabled:opacity-40"
                  title="بحث عن الباركود"
                >
                  {isSearchingBarcode ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                  <span>بحث</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsCameraOpen(true)}
                  className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl transition shadow-xs flex items-center gap-1.5 shrink-0 cursor-pointer"
                  title="فتح كاميرا الهاتف / الكمبيوتر لمسح الباركود"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>مسح بالكاميرا</span>
                </button>
              </div>

              {/* Feedback messages */}
              {scanFeedback && (
                <div className={`p-2.5 rounded-xl text-xs font-bold flex items-center gap-2 animate-fade-in ${
                  scanFeedback.type === 'success' 
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
                    : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}>
                  {scanFeedback.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  )}
                  <span>{scanFeedback.message}</span>
                </div>
              )}
            </div>

            <form onSubmit={handleAddItem} className="space-y-4 pt-1 text-xs font-bold text-zinc-700">
              <div>
                <label className="block mb-1 text-zinc-800 font-extrabold">أو اختر المنتج يدوياً من القائمة:</label>
                <select
                  value={selectedProductId}
                  onChange={(e) => handleProductChange(e.target.value)}
                  className="w-full border border-zinc-300 rounded-xl px-3 py-2.5 text-xs font-bold outline-none focus:border-[#E6007E] bg-white cursor-pointer"
                >
                  {localProducts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nameAr || p.name} — {(((p.variants?.[0]?.price || 15000)) / 1000).toFixed(3)} د.أ
                    </option>
                  ))}
                </select>
              </div>

              {selectedProduct && (
                <div className="flex items-center gap-3 p-3 bg-zinc-50 rounded-2xl border border-zinc-200">
                  <div className="w-14 h-14 rounded-xl overflow-hidden border border-zinc-200 bg-white shrink-0 flex items-center justify-center shadow-2xs">
                    {selectedProduct.imageUrl ? (
                      <img 
                        src={selectedProduct.imageUrl} 
                        alt={selectedProduct.nameAr || selectedProduct.name} 
                        className="w-full h-full object-cover" 
                      />
                    ) : (
                      <ShoppingBag className="w-6 h-6 text-pink-300" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-extrabold text-xs text-zinc-900 truncate">
                      {selectedProduct.nameAr || selectedProduct.name}
                    </p>
                    <p className="text-[11px] text-zinc-500 font-medium font-mono">
                      السعر المقترح: {(((selectedProduct.variants?.[0]?.price || 15000)) / 1000).toFixed(3)} د.أ
                    </p>
                    {selectedProduct.variants?.[0]?.barcode && (
                      <p className="text-[10px] text-zinc-400 font-mono">
                        باركود: {selectedProduct.variants[0].barcode}
                      </p>
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block mb-1">الكمية: *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={quantity}
                    onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                    className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-sm font-bold font-mono outline-none focus:border-[#E6007E]"
                  />
                </div>

                <div>
                  <label className="block mb-1">سعر الوحدة (د.أ): *</label>
                  <input
                    type="number"
                    step="0.001"
                    min="0.001"
                    required
                    value={customPriceStr}
                    onChange={(e) => setCustomPriceStr(e.target.value)}
                    className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-sm font-bold font-mono outline-none focus:border-[#E6007E]"
                  />
                </div>
              </div>

              {/* Required Modification Reason */}
              <div className="space-y-1">
                <label className="block text-zinc-900 font-extrabold flex items-center gap-1">
                  <FileEdit className="w-3.5 h-3.5 text-[#E6007E]" />
                  <span>سبب التعديل والإضافة: * (إلزامي للتوثيق والنزاهة)</span>
                </label>
                <textarea
                  rows={2}
                  required
                  value={addReason}
                  onChange={(e) => setAddReason(e.target.value)}
                  placeholder="اكتب سبب تعديل الفاتورة وإضافة الصنف (مثال: طلب الزبونة هاتفياً إضافة منتج إضافي)"
                  className="w-full border border-zinc-300 rounded-xl p-2.5 text-xs font-medium outline-none focus:border-[#E6007E] bg-zinc-50 focus:bg-white resize-none"
                />
              </div>

              <div className="bg-pink-50 p-3 rounded-xl border border-pink-200 flex justify-between text-xs font-bold">
                <span className="text-zinc-700">المبلغ الإضافي على الفاتورة:</span>
                <span className="font-black text-[#E6007E] font-mono text-sm" dir="ltr">
                  +{((parseFloat(customPriceStr || '0') * quantity) || 0).toFixed(3)} د.أ
                </span>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="submit"
                  disabled={isPending}
                  className="flex-1 py-2.5 bg-[#E6007E] hover:bg-[#c4006b] text-white font-extrabold rounded-xl transition shadow-sm flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  <span>تأكيد الإضافة وتحديث الفاتورة</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="py-2.5 px-4 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl font-bold cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Camera Barcode Scanner Modal */}
      {isCameraOpen && (
        <CameraBarcodeScannerModal
          isOpen={isCameraOpen}
          onClose={() => setIsCameraOpen(false)}
          onScan={(scannedCode) => {
            setIsCameraOpen(false);
            handleBarcodeDetected(scannedCode);
          }}
          title="مسح باركود المنتج بكاميرا الهاتف / الويب كام"
        />
      )}

      {/* Delete Item Modal with Reason */}
      {itemToDelete && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto" dir="rtl">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-zinc-200 animate-fade-in my-8">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-200">
              <div className="flex items-center gap-2 text-rose-600">
                <AlertTriangle className="w-5 h-5" />
                <h3 className="font-black text-base text-zinc-900">حذف منتج من الفاتورة</h3>
              </div>
              <button 
                onClick={() => setItemToDelete(null)} 
                className="p-1 text-zinc-400 hover:text-zinc-600 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmDelete} className="space-y-4 pt-4 text-xs font-bold text-zinc-700">
              <div className="bg-rose-50 border border-rose-200 p-3.5 rounded-2xl text-xs space-y-1">
                <p className="font-black text-rose-900 text-sm">{itemToDelete.name}</p>
                <div className="flex justify-between text-rose-800 text-xs pt-1">
                  <span>الكمية المحذوفة: {itemToDelete.quantity}</span>
                  <span className="font-black font-mono" dir="ltr">
                    -{(itemToDelete.total / 1000).toFixed(3)} د.أ
                  </span>
                </div>
                <p className="text-[11px] text-rose-600 pt-1">
                  سيتم خصم هذا المبلغ من إجمالي الفاتورة وتحديث المجموع تلقائياً.
                </p>
              </div>

              {/* Required Deletion Reason */}
              <div className="space-y-1">
                <label className="block text-zinc-900 font-extrabold flex items-center gap-1">
                  <FileEdit className="w-3.5 h-3.5 text-rose-600" />
                  <span>سبب حذف الصنف والتعديل: * (إلزامي للتوثيق والنزاهة)</span>
                </label>
                <textarea
                  rows={2}
                  required
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value)}
                  placeholder="اكتب سبب حذف هذا الصنف من الفاتورة (مثال: الزبونة اتصلت وطلبت إلغاء هذا الصنف قبل التوصيل)"
                  className="w-full border border-zinc-300 rounded-xl p-2.5 text-xs font-medium outline-none focus:border-rose-600 bg-zinc-50 focus:bg-white resize-none"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="submit"
                  disabled={isPending}
                  className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-extrabold rounded-xl transition shadow-sm flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  <span>تأكيد الحذف وتسجيل الملاحظة</span>
                </button>
                <button
                  type="button"
                  onClick={() => setItemToDelete(null)}
                  className="py-2.5 px-4 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl font-bold cursor-pointer"
                >
                  تراجع
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Fullscreen Image Preview Lightbox with Smooth Zoom Controls */}
      {previewImage && (
        <div 
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in" 
          dir="rtl"
          onClick={() => { setPreviewImage(null); setZoomScale(1); }}
        >
          <div 
            className="bg-white rounded-3xl max-w-xl w-full p-5 shadow-2xl border border-zinc-200 flex flex-col items-center space-y-3 relative"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Lightbox Header */}
            <div className="flex items-center justify-between w-full pb-3 border-b border-zinc-100">
              <div className="min-w-0 pr-1">
                <h4 className="font-black text-sm sm:text-base text-zinc-900 truncate">
                  {previewImage.title}
                </h4>
                {previewImage.subtitle && (
                  <p className="text-xs text-zinc-500 font-bold mt-0.5">{previewImage.subtitle}</p>
                )}
              </div>

              {/* Zoom Controls & Close */}
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setZoomScale((prev) => Math.min(2.5, prev + 0.3))}
                  className="p-1.5 rounded-xl hover:bg-zinc-100 text-zinc-600 hover:text-zinc-900 transition cursor-pointer"
                  title="تكبير الصورة (+)"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setZoomScale((prev) => Math.max(1, prev - 0.3))}
                  className="p-1.5 rounded-xl hover:bg-zinc-100 text-zinc-600 hover:text-zinc-900 transition cursor-pointer"
                  title="تصغير الصورة (-)"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                {zoomScale > 1 && (
                  <button
                    type="button"
                    onClick={() => setZoomScale(1)}
                    className="p-1.5 rounded-xl hover:bg-zinc-100 text-zinc-600 hover:text-zinc-900 transition cursor-pointer"
                    title="إعادة الحجم الافتراضي"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                )}
                <div className="w-px h-4 bg-zinc-200 mx-1" />
                <button
                  type="button"
                  onClick={() => { setPreviewImage(null); setZoomScale(1); }}
                  className="p-1.5 rounded-xl hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 transition cursor-pointer"
                  title="إغلاق (Esc)"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* High-Resolution Zoomable Stage */}
            <div className="w-full max-h-[70vh] rounded-2xl overflow-auto bg-zinc-50/80 border border-zinc-200 flex items-center justify-center p-3 select-none">
              <img 
                src={previewImage.url} 
                alt={previewImage.title} 
                style={{ transform: `scale(${zoomScale})`, transition: 'transform 0.2s ease-out' }}
                className="w-full h-auto max-h-[60vh] object-contain rounded-xl origin-center" 
              />
            </div>

            {/* Lightbox Footer */}
            <div className="flex items-center justify-between w-full text-xs text-zinc-500 font-bold pt-1">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#E6007E]" />
                <span>صورة الصنف واضحة بدقة كاملة للمعاينة ومطابقة الطلب قبل التوصيل</span>
              </span>
              <span className="text-[11px] font-mono text-zinc-400">
                {Math.round(zoomScale * 100)}%
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
