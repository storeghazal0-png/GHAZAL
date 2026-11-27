'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createProduct } from '@/actions/products';
import { Loader2, Plus, Trash2, Sparkles, Palette, Barcode, ScanLine, CheckCircle2, Upload, ImageIcon, Camera } from 'lucide-react';
import { BarcodeSvg } from '@/components/BarcodeSvg';
import { CameraBarcodeScannerModal } from '@/components/CameraBarcodeScannerModal';
import { sanitizePriceInput } from '@/lib/money';

interface CosmeticVariant {
  size: string;
  shade: string;
  colorName: string;
  colorHex: string;
  imageUrl?: string;
  barcode: string;
  sku: string;
  price: string;
  costPrice?: string;
  compareAt?: string;
  isActive: boolean;
}

interface Category {
  id: string;
  name: string;
  channel?: 'ONLINE' | 'POS' | 'SHARED';
}

interface BrandOption {
  id: string;
  name: string;
  nameAr?: string | null;
}

export function ProductNewForm({ 
  categories, 
  brands = [],
  genders = [],
  seasons = [],
  families = [],
  nextSku,
  initialChannel,
  initialBarcode
}: { 
  categories: Category[]; 
  brands?: BrandOption[];
  genders?: Category[];
  seasons?: Category[];
  families?: Category[];
  globalPrices?: Record<string, number>;
  nextSku?: string;
  initialChannel?: 'ONLINE' | 'POS' | 'SHARED' | 'STOREFRONT' | 'BOTH';
  initialBarcode?: string;
}) {
  const router = useRouter();
  const [channel, setChannel] = useState<'BOTH' | 'STOREFRONT' | 'POS'>(() => {
    if (initialChannel === 'ONLINE' || initialChannel === 'STOREFRONT') return 'STOREFRONT';
    if (initialChannel === 'POS') return 'POS';
    return 'BOTH';
  });
  const [variantType, setVariantType] = useState<'SHADE' | 'SCENT' | 'SIZE' | 'NONE'>('NONE');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');

  // Dynamically filter categories based on the product's assigned channel:
  // - STOREFRONT (ONLINE): categories marked ONLINE or SHARED
  // - POS: categories marked POS or SHARED
  // - BOTH (SHARED): categories marked SHARED
  const filteredCategories = React.useMemo(() => {
    if (channel === 'STOREFRONT') {
      return categories.filter(c => c.channel === 'ONLINE' || c.channel === 'SHARED' || !c.channel);
    }
    if (channel === 'POS') {
      return categories.filter(c => c.channel === 'POS' || c.channel === 'SHARED' || !c.channel);
    }
    return categories.filter(c => c.channel === 'SHARED' || !c.channel);
  }, [categories, channel]);

  useEffect(() => {
    if (filteredCategories.length > 0) {
      if (!selectedCategoryId || !filteredCategories.some(c => c.id === selectedCategoryId)) {
        setSelectedCategoryId(filteredCategories[0].id);
      }
    } else {
      setSelectedCategoryId('');
    }
  }, [filteredCategories, selectedCategoryId]);
  const [autoSku] = useState(() => nextSku || 'GHZ-' + Math.floor(1000 + Math.random() * 9000).toString());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [productTag, setProductTag] = useState<string>('');
  
  const defaultVariants: CosmeticVariant[] = [
    {
      size: 'Standard',
      shade: '',
      colorName: '',
      colorHex: '',
      imageUrl: '',
      barcode: initialBarcode || '',
      sku: `${autoSku}-STD`,
      price: '5.000',
      costPrice: '2.750',
      compareAt: '',
      isActive: true
    }
  ];
  
  const [variants, setVariants] = useState<CosmeticVariant[]>(defaultVariants);
  const [activeScanIndex, setActiveScanIndex] = useState<number | null>(0);
  const [lastScannedBarcode, setLastScannedBarcode] = useState<string | null>(initialBarcode || null);

  // Camera Barcode Scanner State
  const [isCameraScannerOpen, setIsCameraScannerOpen] = useState(false);
  const [cameraScanTargetIndex, setCameraScanTargetIndex] = useState<number>(0);

  const handleCameraScan = (code: string) => {
    updateVariant(cameraScanTargetIndex, 'barcode', code);
    setLastScannedBarcode(code);
  };

  const playScanBeep = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1760, ctx.currentTime);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } catch (e) {}
  };

  useEffect(() => {
    let buffer = '';
    let lastTime = 0;

    const handleKeyDown = (e: KeyboardEvent) => {
      const now = Date.now();
      // If delay between keystrokes is more than 200ms, reset buffer (typing slowly vs scanner burst)
      if (now - lastTime > 200) {
        buffer = '';
      }
      lastTime = now;

      if (e.key === 'Enter') {
        const trimmed = buffer.trim();
        if (trimmed.length >= 3) {
          const targetIndex = activeScanIndex !== null ? activeScanIndex : 0;
          updateVariant(targetIndex, 'barcode', trimmed);
          setLastScannedBarcode(trimmed);
          playScanBeep();
          buffer = '';
          e.preventDefault();
        }
      } else if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        buffer += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeScanIndex, variants]);

  const handleVariantTypeChange = (type: 'SHADE' | 'SCENT' | 'SIZE' | 'NONE') => {
    setVariantType(type);
    if (type === 'NONE') {
      setVariants([
        {
          size: 'Standard',
          shade: '',
          colorName: '',
          colorHex: '',
          imageUrl: '',
          barcode: variants[0]?.barcode || '',
          sku: `${autoSku}-STD`,
          price: variants[0]?.price || '15.000',
          costPrice: variants[0]?.costPrice || '8.250',
          compareAt: variants[0]?.compareAt || '',
          isActive: true
        }
      ]);
    } else if (type === 'SHADE') {
      setVariants([
        {
          size: 'Standard',
          shade: '01',
          colorName: 'طبيعي Natural',
          colorHex: '#E6007E',
          imageUrl: '',
          barcode: '',
          sku: `${autoSku}-01`,
          price: variants[0]?.price || '15.000',
          costPrice: variants[0]?.costPrice || '8.250',
          compareAt: variants[0]?.compareAt || '',
          isActive: true
        }
      ]);
    } else if (type === 'SCENT') {
      setVariants([
        {
          size: 'Standard',
          shade: '',
          colorName: 'مسك وورد / Rose Musk',
          colorHex: '',
          imageUrl: '',
          barcode: '',
          sku: `${autoSku}-01`,
          price: variants[0]?.price || '15.000',
          costPrice: variants[0]?.costPrice || '8.250',
          compareAt: variants[0]?.compareAt || '',
          isActive: true
        }
      ]);
    } else if (type === 'SIZE') {
      setVariants([
        {
          size: '50ml',
          shade: '',
          colorName: '',
          colorHex: '',
          imageUrl: '',
          barcode: '',
          sku: `${autoSku}-01`,
          price: variants[0]?.price || '15.000',
          costPrice: variants[0]?.costPrice || '8.250',
          compareAt: variants[0]?.compareAt || '',
          isActive: true
        }
      ]);
    }
  };

  const addVariant = () => {
    const nextIdx = (variants.length + 1).toString().padStart(2, '0');
    setVariants(prev => [
      ...prev,
      {
        size: variantType === 'SIZE' ? '' : 'Standard',
        shade: variantType === 'SHADE' ? nextIdx : '',
        colorName: '',
        colorHex: '#E6007E',
        imageUrl: '',
        barcode: '',
        sku: `${autoSku}-${nextIdx}`,
        price: prev[prev.length - 1]?.price || '15.000',
        costPrice: prev[prev.length - 1]?.costPrice || '8.250',
        compareAt: prev[prev.length - 1]?.compareAt || '',
        isActive: true
      }
    ]);
  };

  const removeVariant = (index: number) => {
    setVariants(prev => prev.filter((_, i) => i !== index));
  };

  const updateVariant = (index: number, field: keyof CosmeticVariant, value: string | boolean) => {
    setVariants(prev => prev.map((v, i) => i === index ? { ...v, [field]: value } : v));
  };

  const handleVariantImageUpload = async (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.success && data.url) {
        updateVariant(index, 'imageUrl', data.url);
      } else {
        alert(data.error || 'فشل رفع صورة المتغير');
      }
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء رفع الصورة');
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPending(true);
    setError('');

    try {
      const formData = new FormData(e.currentTarget);
      formData.set('sku', autoSku);

      const mappedChannel = channel === 'STOREFRONT' ? 'ONLINE' : (channel === 'POS' ? 'POS' : 'SHARED');
      formData.set('channel', mappedChannel);
      formData.set('targetChannel', mappedChannel);
      formData.set('categoryId', selectedCategoryId);

      if (channel === 'POS') {
        formData.set('isVisible', 'false');
      } else {
        formData.set('isVisible', 'true');
      }

      // NameEn is optional: fallback to nameAr if left empty
      const nameEnVal = formData.get('nameEn');
      if (!nameEnVal || (typeof nameEnVal === 'string' && nameEnVal.trim() === '')) {
        formData.set('nameEn', formData.get('nameAr') as string);
      }

      // Convert variants to fils
      const variantsForAction = variants.map((v, idx) => ({
        size: variantType === 'SIZE' ? (v.size || 'Standard') : 'Standard',
        shade: variantType === 'SHADE' ? (v.shade || null) : null,
        colorName: variantType === 'SHADE' ? (v.colorName || null) : (variantType === 'SCENT' ? (v.colorName || null) : null),
        colorHex: variantType === 'SHADE' ? (v.colorHex || null) : null,
        imageUrl: v.imageUrl || null,
        barcode: v.barcode ? v.barcode.trim() : null,
        sku: v.sku || `${autoSku}-${(idx + 1).toString().padStart(2, '0')}`,
        price: Math.round((parseFloat(v.price) || 0) * 1000),
        costPrice: v.costPrice ? Math.round((parseFloat(v.costPrice) || 0) * 1000) : Math.round((parseFloat(v.price) || 0) * 550),
        compareAt: v.compareAt && parseFloat(v.compareAt) > 0 ? Math.round(parseFloat(v.compareAt) * 1000) : null,
        isActive: v.isActive,
        usesGlobalPricing: true
      }));

      formData.set('variants', JSON.stringify(variantsForAction));
      formData.set('variantType', variantType);

      const res = await createProduct(formData);
      if (res.success) {
        window.location.href = '/admin/products';
      } else {
        setError(res.error || 'حدث خطأ أثناء حفظ المنتج');
        setPending(false);
      }
    } catch (err: any) {
      setError(err.message || 'حدث خطأ');
      setPending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-4xl bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-zinc-200/80 space-y-6">

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm font-medium">
          {error}
        </div>
      )}

      {initialBarcode && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-xl text-xs font-bold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>تم مسح باركود جديد غير مسجل مسبقاً: <strong className="font-mono text-emerald-900 bg-white px-2 py-0.5 rounded border border-emerald-200">{initialBarcode}</strong> — تم تعبئته تلقائياً في بيانات الباركود أدناه.</span>
          </div>
        </div>
      )}

      {/* Target Channel Selector (تحديد قناة البيع: كاش فقط / متجر فقط / كلاهما) */}
      <div className="bg-pink-50/50 p-4 rounded-2xl border border-pink-200 space-y-2">
        <label className="block text-xs font-black text-zinc-900">
          قناة البيع المعتمدة للمنتج: *
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
            channel === 'BOTH' 
              ? 'bg-white border-[#E6007E] shadow-xs ring-2 ring-[#E6007E]/20' 
              : 'bg-white/60 border-zinc-200 hover:border-pink-300'
          }`}>
            <input 
              type="radio" 
              name="targetChannel" 
              value="BOTH" 
              checked={channel === 'BOTH'} 
              onChange={() => setChannel('BOTH')}
              className="mt-0.5 text-[#E6007E] focus:ring-[#E6007E]"
            />
            <div>
              <span className="block text-xs font-bold text-zinc-900">كلاهما (المتجر + الكاش)</span>
              <span className="text-[10px] text-zinc-500">يعرض بالموقع ويتوفر لنظام الكاشير</span>
            </div>
          </label>

          <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
            channel === 'STOREFRONT' 
              ? 'bg-white border-[#E6007E] shadow-xs ring-2 ring-[#E6007E]/20' 
              : 'bg-white/60 border-zinc-200 hover:border-pink-300'
          }`}>
            <input 
              type="radio" 
              name="targetChannel" 
              value="STOREFRONT" 
              checked={channel === 'STOREFRONT'} 
              onChange={() => setChannel('STOREFRONT')}
              className="mt-0.5 text-[#E6007E] focus:ring-[#E6007E]"
            />
            <div>
              <span className="block text-xs font-bold text-zinc-900">المتجر الإلكتروني فقط</span>
              <span className="text-[10px] text-zinc-500">خاص بطلبات الموقع والشحن</span>
            </div>
          </label>

          <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
            channel === 'POS' 
              ? 'bg-white border-[#E6007E] shadow-xs ring-2 ring-[#E6007E]/20' 
              : 'bg-white/60 border-zinc-200 hover:border-pink-300'
          }`}>
            <input 
              type="radio" 
              name="targetChannel" 
              value="POS" 
              checked={channel === 'POS'} 
              onChange={() => setChannel('POS')}
              className="mt-0.5 text-[#E6007E] focus:ring-[#E6007E]"
            />
            <div>
              <span className="block text-xs font-bold text-[#E6007E]">نظام الكاشير فقط (POS)</span>
              <span className="text-[10px] text-zinc-500">إدخال سريع: بدون صور أو أوصاف</span>
            </div>
          </label>
        </div>
      </div>

      {/* Basic Info */}
      <div className="space-y-4">
        <h3 className="text-base font-bold text-zinc-900 border-b border-zinc-100 pb-2 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[#E6007E]" />
          البيانات الأساسية للمنتج
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-zinc-700 mb-1.5">اسم المنتج (عربي) *</label>
            <input
              type="text"
              name="nameAr"
              required
              placeholder="مثال: أحمر شفاه سوبر ستاي فينيل إنك"
              className="w-full border border-zinc-300 rounded-xl px-3.5 py-2 text-sm outline-none focus:border-[#E6007E]"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-zinc-700 mb-1.5">
              اسم المنتج (إنجليزي) <span className="text-zinc-400 font-normal">(اختياري)</span>
            </label>
            <input
              type="text"
              name="nameEn"
              placeholder="e.g. Super Stay Vinyl Ink Liquid Lipstick"
              className="w-full border border-zinc-300 rounded-xl px-3.5 py-2 text-sm outline-none focus:border-[#E6007E]"
              dir="ltr"
            />
          </div>
        </div>

        <input type="hidden" name="sku" value={autoSku} />

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-bold text-zinc-700">القسم / التصنيف *</label>
            <span className="text-[11px] text-zinc-500 font-medium">
              (تظهر الأقسام المتوافقة مع: <strong className="text-[#E6007E]">{channel === 'STOREFRONT' ? 'المتجر الإلكتروني' : channel === 'POS' ? 'نظام الكاشير' : 'الأقسام المشتركة'}</strong>)
            </span>
          </div>
          <select
            name="categoryId"
            required
            value={selectedCategoryId}
            onChange={(e) => setSelectedCategoryId(e.target.value)}
            className="w-full border border-zinc-300 rounded-xl px-3.5 py-2.5 text-sm outline-none bg-white focus:border-[#E6007E] font-medium"
          >
            {filteredCategories.length === 0 ? (
              <option value="">-- لا توجد أقسام متوافقة مع هذه القناة حالياً --</option>
            ) : (
              filteredCategories.map(c => {
                const badge = c.channel === 'ONLINE' ? '🌐 متجر' : c.channel === 'POS' ? '🏪 كاش' : '🔄 مشترك';
                return (
                  <option key={c.id} value={c.id}>
                    {c.name} ({badge})
                  </option>
                );
              })
            )}
          </select>
          {filteredCategories.length === 0 && (
            <p className="text-xs text-amber-600 mt-1.5 font-bold">
              يرجى التوجه لصفحة أقسام المتجر والكاش لإنشاء قسم مخصص أو قسم مشترك لهذه القناة.
            </p>
          )}
        </div>

        {/* Descriptions: Only shown if online storefront is active */}
        {channel !== 'POS' && (
          <div className="space-y-4 pt-1">
            <div>
              <label className="block text-xs font-bold text-zinc-700 mb-1.5">
                الوصف المختصر <span className="text-zinc-400 font-normal">(اختياري)</span>
              </label>
              <textarea
                name="shortDescription"
                rows={2}
                placeholder="وصف سريع يظهر في كروت المنتجات ونتائج البحث (اختياري)..."
                className="w-full border border-zinc-300 rounded-xl px-3.5 py-2 text-sm outline-none focus:border-[#E6007E]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-700 mb-1.5">
                الوصف التفصيلي وطريقة الاستخدام <span className="text-zinc-400 font-normal">(اختياري)</span>
              </label>
              <textarea
                name="longDescription"
                rows={3}
                placeholder="تفاصيل التركيبة، المكونات، طريقة التطبيق، والنصائح (اختياري)..."
                className="w-full border border-zinc-300 rounded-xl px-3.5 py-2 text-sm outline-none focus:border-[#E6007E]"
              />
            </div>
          </div>
        )}
      </div>

      {/* 4. Variant Dimension Selector (نوع المتغيرات: خيار واحد فقط حصراً) */}
      <div className="bg-pink-50/40 p-4 md:p-5 rounded-2xl border border-pink-200/80 space-y-3">
        <div>
          <label className="block text-sm font-black text-zinc-900 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#E6007E]" />
            نوع المتغيرات والخيارات لهذا المنتج: *
          </label>
          <p className="text-xs text-zinc-500 mt-0.5">
            اختر نوعاً واحداً فقط للمنتج (إما درجات ألوان، أو روائح، أو أحجام وسعات، أو منتج بسيط بدون خيارات).
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Option 1: SHADE */}
          <button
            type="button"
            onClick={() => handleVariantTypeChange('SHADE')}
            className={`p-3.5 rounded-xl border text-center transition-all flex flex-col items-center justify-center gap-1.5 cursor-pointer ${
              variantType === 'SHADE'
                ? 'bg-white border-[#E6007E] shadow-sm ring-2 ring-[#E6007E]/20 text-[#E6007E] font-black'
                : 'bg-white/60 border-zinc-200 hover:border-pink-300 text-zinc-700 font-bold'
            }`}
          >
            <span className="text-xl">🎨</span>
            <span className="text-xs">الدرجات والألوان</span>
            <span className="text-[10px] text-zinc-400 font-normal">مكياج، حمرة، كريمات</span>
          </button>

          {/* Option 2: SCENT */}
          <button
            type="button"
            onClick={() => handleVariantTypeChange('SCENT')}
            className={`p-3.5 rounded-xl border text-center transition-all flex flex-col items-center justify-center gap-1.5 cursor-pointer ${
              variantType === 'SCENT'
                ? 'bg-white border-[#E6007E] shadow-sm ring-2 ring-[#E6007E]/20 text-[#E6007E] font-black'
                : 'bg-white/60 border-zinc-200 hover:border-pink-300 text-zinc-700 font-bold'
            }`}
          >
            <span className="text-xl">🌸</span>
            <span className="text-xs">الرائحة أو النوع</span>
            <span className="text-[10px] text-zinc-400 font-normal">عطور، معطرات، زيوت</span>
          </button>

          {/* Option 3: SIZE */}
          <button
            type="button"
            onClick={() => handleVariantTypeChange('SIZE')}
            className={`p-3.5 rounded-xl border text-center transition-all flex flex-col items-center justify-center gap-1.5 cursor-pointer ${
              variantType === 'SIZE'
                ? 'bg-white border-[#E6007E] shadow-sm ring-2 ring-[#E6007E]/20 text-[#E6007E] font-black'
                : 'bg-white/60 border-zinc-200 hover:border-pink-300 text-zinc-700 font-bold'
            }`}
          >
            <span className="text-xl">📏</span>
            <span className="text-xs">الحجم والسعة</span>
            <span className="text-[10px] text-zinc-400 font-normal">عناية، غسول، 50ml..</span>
          </button>

          {/* Option 4: NONE */}
          <button
            type="button"
            onClick={() => handleVariantTypeChange('NONE')}
            className={`p-3.5 rounded-xl border text-center transition-all flex flex-col items-center justify-center gap-1.5 cursor-pointer ${
              variantType === 'NONE'
                ? 'bg-white border-[#E6007E] shadow-sm ring-2 ring-[#E6007E]/20 text-[#E6007E] font-black'
                : 'bg-white/60 border-zinc-200 hover:border-pink-300 text-zinc-700 font-bold'
            }`}
          >
            <span className="text-xl">📦</span>
            <span className="text-xs">منتج بسيط</span>
            <span className="text-[10px] text-zinc-400 font-normal">خيار واحد قياسي</span>
          </button>
        </div>
      </div>

      {/* Cosmetic Variants List */}
      <div className="space-y-4 pt-2">
        <div className="flex justify-between items-center border-b border-zinc-100 pb-2">
          <div>
            <h3 className="text-base font-bold text-zinc-900 flex items-center gap-2">
              <Palette className="w-4 h-4 text-[#E6007E]" />
              {variantType === 'SHADE' && 'الدرجات والألوان المتاحة'}
              {variantType === 'SCENT' && 'الروائح والأنواع المتاحة'}
              {variantType === 'SIZE' && 'الأحجام والسعات المتاحة'}
              {variantType === 'NONE' && 'بيانات وسعر المنتج الأساسي'}
            </h3>
            <p className="text-xs text-zinc-500">
              {variantType === 'SHADE' && 'لكل درجة كود لوني، صورة مخصصة، باركود وسعر'}
              {variantType === 'SCENT' && 'لكل رائحة اسم مميز، صورة مخصصة، باركود وسعر'}
              {variantType === 'SIZE' && 'لكل سعة حجم محدد، صورة مخصصة، باركود وسعر'}
              {variantType === 'NONE' && 'سعر البيع المعتمد والباركود لقطعة واحدة'}
            </p>
          </div>

          {variantType !== 'NONE' && (
            <button
              type="button"
              onClick={addVariant}
              className="flex items-center gap-1.5 text-xs font-bold text-[#E6007E] hover:text-[#c9006e] border border-pink-200 bg-pink-50/50 hover:bg-pink-100/50 px-3 py-1.5 rounded-xl transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              {variantType === 'SHADE' && 'إضافة درجة/لون'}
              {variantType === 'SCENT' && 'إضافة رائحة/نوع'}
              {variantType === 'SIZE' && 'إضافة حجم/سعة'}
            </button>
          )}
        </div>

        <div className="space-y-3">
          {variants.map((v, i) => (
            <div key={i} className="p-4 rounded-xl border border-zinc-200 bg-zinc-50/50 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
                {/* 1. If SHADE: Shade Number + Color Name + Color Swatch */}
                {variantType === 'SHADE' && (
                  <>
                    <div>
                      <label className="block text-[11px] font-bold text-zinc-600 mb-1">الدرجة / الرقم</label>
                      <input
                        type="text"
                        value={v.shade}
                        onChange={e => updateVariant(i, 'shade', e.target.value)}
                        placeholder="01, 120, Light"
                        className="w-full border border-zinc-300 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-[#E6007E] bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-zinc-600 mb-1">اسم اللون</label>
                      <input
                        type="text"
                        value={v.colorName}
                        onChange={e => updateVariant(i, 'colorName', e.target.value)}
                        placeholder="وردي ناعم / Rose"
                        className="w-full border border-zinc-300 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-[#E6007E] bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-zinc-600 mb-1">رمز اللون (Swatch)</label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="color"
                          value={v.colorHex || '#E6007E'}
                          onChange={e => updateVariant(i, 'colorHex', e.target.value)}
                          className="w-8 h-8 rounded-lg cursor-pointer border border-zinc-300 p-0.5 bg-white"
                          title="اختر درجة اللون"
                        />
                        <input
                          type="text"
                          value={v.colorHex}
                          onChange={e => updateVariant(i, 'colorHex', e.target.value)}
                          placeholder="#E6007E"
                          dir="ltr"
                          className="w-full border border-zinc-300 rounded-lg px-2 py-1.5 text-xs font-mono outline-none focus:border-[#E6007E] bg-white"
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* 2. If SCENT: Scent Name */}
                {variantType === 'SCENT' && (
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-bold text-zinc-600 mb-1">اسم الرائحة أو النوع</label>
                    <input
                      type="text"
                      value={v.colorName}
                      onChange={e => updateVariant(i, 'colorName', e.target.value)}
                      placeholder="مسك أبيض، لافندر، فانيلا فرنسية..."
                      className="w-full border border-zinc-300 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-[#E6007E] bg-white"
                    />
                  </div>
                )}

                {/* 3. If SIZE: Size / Volume */}
                {variantType === 'SIZE' && (
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-bold text-zinc-600 mb-1">الحجم أو السعة</label>
                    <input
                      type="text"
                      value={v.size}
                      onChange={e => updateVariant(i, 'size', e.target.value)}
                      placeholder="30ml, 50ml, 100ml, 250ml..."
                      className="w-full border border-zinc-300 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-[#E6007E] bg-white"
                      dir="ltr"
                    />
                  </div>
                )}

                {/* Variant Image Uploader (متاح للدرجات، الروائح، والأحجام) */}
                {variantType !== 'NONE' && (
                  <div>
                    <label className="block text-[11px] font-bold text-zinc-600 mb-1">
                      صورة الخيار (اختياري)
                    </label>
                    <div className="flex items-center gap-2">
                      {v.imageUrl ? (
                        <div className="relative w-9 h-9 rounded-lg border border-pink-200 overflow-hidden bg-white shrink-0 group">
                          <img src={v.imageUrl} alt="preview" className="w-full h-full object-contain" />
                          <button
                            type="button"
                            onClick={() => updateVariant(i, 'imageUrl', '')}
                            className="absolute inset-0 bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                            title="حذف الصورة"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-red-400" />
                          </button>
                        </div>
                      ) : (
                        <label className="cursor-pointer border border-dashed border-pink-300 hover:border-[#E6007E] bg-pink-50/50 hover:bg-pink-100/50 text-[#E6007E] rounded-lg px-2.5 py-1.5 text-[11px] font-bold flex items-center gap-1 transition shrink-0">
                          <Upload className="w-3.5 h-3.5" />
                          <span>رفع صورة</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={e => handleVariantImageUpload(i, e)}
                          />
                        </label>
                      )}
                    </div>
                  </div>
                )}

                {/* Barcode (EAN/UPC / Scanner) - Hidden for Online-only channel */}
                {channel !== 'STOREFRONT' && (
                  <div className="sm:col-span-2">
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[11px] font-bold text-zinc-700">
                        الباركود (قارئ الليزر أو يدوي)
                      </label>
                      <span className="text-[10px] text-zinc-400 font-normal">اختياري</span>
                    </div>
                    <div className="flex gap-1.5 items-center">
                      <div className="relative flex-1">
                        <Barcode className="w-4 h-4 text-zinc-400 absolute start-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="text"
                          value={v.barcode}
                          onChange={e => updateVariant(i, 'barcode', e.target.value)}
                          placeholder="امسح بالليزر أو أدخل الأرقام..."
                          className={`w-full border rounded-lg ps-8 pe-2 py-1.5 text-xs font-mono outline-none transition bg-white ${
                            activeScanIndex === i
                              ? 'border-[#E6007E] ring-2 ring-pink-100'
                              : 'border-zinc-300 focus:border-[#E6007E]'
                          }`}
                          dir="ltr"
                          onFocus={() => setActiveScanIndex(i)}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveScanIndex(i)}
                        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1 transition shrink-0 ${
                          activeScanIndex === i
                            ? 'bg-[#E6007E] text-white shadow-xs animate-pulse'
                            : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border border-zinc-200'
                        }`}
                        title="انقر هنا ثم امسح المنتج بجهاز قارئ الباركود"
                      >
                        <ScanLine className="w-3.5 h-3.5" />
                        <span>{activeScanIndex === i ? 'جاهز للمسح...' : 'مسح ليزر'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCameraScanTargetIndex(i);
                          setIsCameraScannerOpen(true);
                        }}
                        className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1 transition shrink-0 bg-pink-50 hover:bg-pink-100 text-[#E6007E] border border-pink-200 hover:border-pink-300 cursor-pointer shadow-2xs"
                        title="قراءة الباركود عن طريق الكاميرا تلقائياً"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        <span>مسح بالكاميرا</span>
                      </button>
                    </div>
                    {v.barcode && (
                      <div className="mt-1.5 bg-white p-1 rounded-lg border border-zinc-200 flex items-center justify-between">
                        <BarcodeSvg value={v.barcode} height={32} barHeight={22} showText={false} />
                        <span className="text-[10px] font-mono text-zinc-600 font-bold px-1" dir="ltr">
                          {v.barcode}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Price (JOD) & Cost Price */}
                <div className="sm:col-span-2 lg:col-span-6 bg-zinc-50/80 p-4 rounded-2xl border-2 border-zinc-200/90 shadow-2xs">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* 1. سعر البيع للزبون (د.أ) * */}
                    <div className="flex flex-col justify-between bg-white rounded-xl p-3.5 border-2 border-zinc-300 hover:border-zinc-400 focus-within:!border-[#E6007E] focus-within:ring-3 focus-within:ring-[#E6007E]/15 transition-all shadow-2xs">
                      <div>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                          <label className="text-sm font-black text-zinc-900 flex items-center gap-1.5 cursor-pointer">
                            <span className="w-2.5 h-2.5 rounded-full bg-[#E6007E]"></span>
                            سعر البيع للزبون (د.أ) *
                          </label>
                          <span className="self-start sm:self-auto whitespace-nowrap text-xs font-bold text-[#E6007E] bg-pink-50 px-2.5 py-1 rounded-lg border border-pink-100 font-mono">
                            = {v.price ? parseFloat(v.price).toFixed(3) : '5.000'} د.أ
                          </span>
                        </div>
                        <div className="relative flex items-center mt-1.5">
                          <input
                            type="text"
                            inputMode="decimal"
                            autoComplete="off"
                            value={v.price}
                            onChange={e => updateVariant(i, 'price', sanitizePriceInput(e.target.value))}
                            required
                            placeholder="5.000"
                            className="w-full h-12 px-3.5 pl-14 bg-zinc-50/50 hover:bg-white focus:bg-white border-2 border-zinc-300 focus:border-[#E6007E] rounded-xl text-lg font-black font-mono text-zinc-900 outline-none transition-all placeholder:text-zinc-400 placeholder:font-normal"
                            dir="ltr"
                          />
                          <div className="absolute left-3 flex items-center pointer-events-none select-none">
                            <span className="text-xs font-black text-zinc-600 bg-zinc-200/80 px-2.5 py-1 rounded-md font-sans">
                              د.أ
                            </span>
                          </div>
                        </div>
                      </div>
                      <span className="text-xs font-bold text-zinc-500 mt-2 block">سعر الجمهور المعتمد للبيع</span>
                    </div>

                    {/* 2. سعر التكلفة علينا (د.أ) */}
                    <div className="flex flex-col justify-between bg-amber-50/30 rounded-xl p-3.5 border-2 border-amber-300 hover:border-amber-400 focus-within:!border-amber-500 focus-within:ring-3 focus-within:ring-amber-500/15 transition-all shadow-2xs">
                      <div>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                          <label className="text-sm font-black text-amber-900 flex items-center gap-1.5 cursor-pointer">
                            <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                            سعر التكلفة علينا (د.أ)
                          </label>
                          <span className="self-start sm:self-auto whitespace-nowrap text-xs font-bold text-amber-800 bg-amber-100/80 px-2.5 py-1 rounded-lg border border-amber-300 font-mono">
                            = {(v.costPrice ? parseFloat(v.costPrice) : (parseFloat(v.price || '0') * 0.55)).toFixed(3)} د.أ
                          </span>
                        </div>
                        <div className="relative flex items-center mt-1.5">
                          <input
                            type="text"
                            inputMode="decimal"
                            autoComplete="off"
                            value={v.costPrice ?? ''}
                            onChange={e => updateVariant(i, 'costPrice', sanitizePriceInput(e.target.value))}
                            placeholder={v.price ? (parseFloat(v.price) * 0.55).toFixed(3) : '2.750'}
                            className="w-full h-12 px-3.5 pl-14 bg-white border-2 border-amber-300 focus:border-amber-600 rounded-xl text-lg font-black font-mono text-amber-950 outline-none transition-all placeholder:text-amber-400/60 placeholder:font-normal"
                            dir="ltr"
                          />
                          <div className="absolute left-3 flex items-center pointer-events-none select-none">
                            <span className="text-xs font-black text-amber-800 bg-amber-200/70 px-2 py-1 rounded-md font-sans">
                              د.أ
                            </span>
                          </div>
                        </div>
                      </div>
                      <span className="text-xs font-bold text-amber-800 block mt-2">
                        {v.price && v.costPrice && parseFloat(v.price) > parseFloat(v.costPrice) ? (
                          `هامش ربح تقريبي: +${(parseFloat(v.price) - parseFloat(v.costPrice)).toFixed(3)} د.أ للقطعة`
                        ) : (
                          'تكلفة الشراء والتوريد للقطعة'
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Status & Delete Action Row */}
              <div className="flex items-center justify-between pt-2 border-t border-zinc-200/60 text-xs">
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 cursor-pointer mr-3">
                    <input
                      type="checkbox"
                      checked={v.isActive}
                      onChange={e => updateVariant(i, 'isActive', e.target.checked)}
                      className="rounded text-[#E6007E] focus:ring-[#E6007E]"
                    />
                    <span className="text-[11px] text-zinc-600">متاح للبيع</span>
                  </label>
                </div>

                {variantType !== 'NONE' && variants.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeVariant(i)}
                    className="text-red-500 hover:text-red-700 flex items-center gap-1 text-[11px] font-bold transition cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {variantType === 'SHADE' && 'حذف الدرجة'}
                    {variantType === 'SCENT' && 'حذف الرائحة'}
                    {variantType === 'SIZE' && 'حذف الحجم'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Image Upload: Only for online storefront */}
      {channel !== 'POS' ? (
        <div className="space-y-3 pt-2">
          <h3 className="text-base font-bold text-zinc-900 border-b border-zinc-100 pb-2">
            صورة المنتج
          </h3>
          <div>
            <input
              type="file"
              name="image"
              accept="image/*"
              className="w-full border border-zinc-300 rounded-xl p-2.5 text-xs outline-none bg-zinc-50 file:me-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-[#1A1A1A] file:text-white hover:file:bg-black cursor-pointer"
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) setPreview(URL.createObjectURL(file));
              }}
            />
            {preview && (
              <div className="mt-3 w-28 h-28 border border-zinc-200 rounded-xl overflow-hidden bg-white p-1">
                <img src={preview} alt="Preview" className="w-full h-full object-contain rounded-lg" />
              </div>
            )}
            <p className="text-[11px] text-zinc-400 mt-1">يُفضل رفع صورة عالية الجودة مربعة بخلفية بيضاء أو شفافة.</p>
          </div>
        </div>
      ) : (
        <div className="p-3 bg-pink-50/60 rounded-xl border border-pink-200 text-xs text-zinc-600 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#E6007E] shrink-0"></span>
          <span>وضع الكاشير السريع نشط: تم إخفاء الصور والأوصاف لتمكين الإدخال الفوري بالباركود.</span>
        </div>
      )}

      {/* Product Promotional Badge / Note (شارة وملاحظة المنتج الترويجية) */}
      {channel !== 'POS' && (
        <div className="space-y-3 bg-zinc-50/70 p-4 sm:p-5 rounded-2xl border border-zinc-200">
          <input type="hidden" name="tag" value={productTag} />
          <div className="flex items-center justify-between flex-wrap gap-2">
            <label className="text-sm font-black text-zinc-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#E6007E]" />
              <span>شارة وملاحظة المنتج الترويجية (Product Badge / Tag)</span>
            </label>
            {productTag ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-[#E6007E] text-white shadow-xs">
                <span>المعاينة:</span>
                <span>{productTag}</span>
              </span>
            ) : (
              <span className="text-xs font-bold text-zinc-400">
                (لا توجد شارة معينة لهذا المنتج)
              </span>
            )}
          </div>

          <p className="text-xs text-zinc-500 leading-relaxed">
            تظهر هذه الشارة كملاحظة تسويقية بارزة على بطاقة المنتج وصفحة التفاصيل (مثل: الأكثر مبيعاً، موصى به من الأطباء، جديد، أصلي 100%...). 
            <strong> لن تظهر أي شارة على هذا المنتج إطلاقاً ما لم يتم تعيينها هنا يدوياً.</strong>
          </p>

          {/* Preset Quick Buttons */}
          <div className="flex flex-wrap gap-2 items-center pt-1">
            <span className="text-[11px] font-bold text-zinc-400">خيارات سريعة:</span>
            {[
              { label: 'بدون شارة (إلغاء)', value: '' },
              { label: 'الأكثر مبيعاً 🔥', value: 'الأكثر مبيعاً' },
              { label: 'موصى به من الأطباء 🩺', value: 'موصى به من الأطباء' },
              { label: 'منتج أصلي 100% ⭐️', value: 'منتج أصلي 100%' },
              { label: 'الأعلى تقييماً 👑', value: 'الأعلى تقييماً' },
              { label: 'جديد ✨', value: 'جديد' },
              { label: 'طبي معتمد 🌿', value: 'طبي معتمد' },
              { label: 'إصدار حصري 💎', value: 'إصدار حصري' },
              { label: 'كمية محدودة ⏳', value: 'كمية محدودة' },
              { label: 'عرض خاص 🎁', value: 'عرض خاص' },
            ].map((item) => {
              const isSelected = productTag === item.value;
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => setProductTag(item.value)}
                  className={`text-xs px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[#E6007E] text-white shadow-xs ring-2 ring-[#E6007E]/30'
                      : item.value === ''
                      ? 'bg-zinc-200 hover:bg-zinc-300 text-zinc-700'
                      : 'bg-white hover:bg-pink-50 text-zinc-800 border border-zinc-200 hover:border-pink-300'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          {/* Custom Tag Input */}
          <div className="pt-2">
            <label className="block text-[11px] font-bold text-zinc-600 mb-1">
              أو كتابة نص ملاحظة مخصصة:
            </label>
            <input
              type="text"
              value={productTag}
              onChange={(e) => setProductTag(e.target.value)}
              placeholder="مثال: الأكثر مبيعاً، موصى به من الأطباء، أو أي نص ترغبين به..."
              className="w-full border border-zinc-300 rounded-xl px-3.5 py-2 text-xs font-bold outline-none focus:border-[#E6007E] bg-white text-zinc-900"
            />
          </div>
        </div>
      )}

      {/* Visibility Options */}
      <div className="flex flex-col sm:flex-row gap-4 border-t border-zinc-100 pt-4">
        {channel !== 'POS' ? (
          <>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" name="isVisible" value="true" defaultChecked className="w-4 h-4 rounded text-[#E6007E] focus:ring-[#E6007E]" />
              <span className="text-xs font-bold text-zinc-800">تفعيل العرض في المتجر الإلكتروني</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" name="isFeatured" value="true" className="w-4 h-4 rounded text-[#E6007E] focus:ring-[#E6007E]" />
              <span className="text-xs font-bold text-zinc-800">إبراز في قائمة المنتجات المختارة بالصفحة الرئيسية</span>
            </label>
          </>
        ) : (
          <p className="text-xs text-zinc-500 font-bold">
            🔒 المنتج سيُحفظ مباشرة في قاعدة بيانات الكاشير بنقاط البيع POS، ويبقى مخفياً عن واجهة زوار المتجر.
          </p>
        )}
      </div>

      {/* Action Buttons */}
      <div className="pt-4 flex justify-end gap-3 border-t border-zinc-100">
        <Link
          href="/admin/products"
          className="px-6 py-2.5 border border-zinc-300 rounded-xl font-bold text-zinc-600 hover:bg-zinc-50 transition text-xs"
        >
          إلغاء
        </Link>
        <button
          type="submit"
          disabled={pending}
          className="bg-[#E6007E] hover:bg-[#c9006e] text-white px-8 py-2.5 rounded-xl font-bold transition text-xs shadow-sm disabled:opacity-60 flex items-center gap-2"
        >
          {pending && <Loader2 className="w-4 h-4 animate-spin" />}
          {pending ? 'جاري الحفظ...' : 'حفظ وإضافة المنتج'}
        </button>
      </div>

      {/* Camera Barcode Scanner Modal */}
      <CameraBarcodeScannerModal
        isOpen={isCameraScannerOpen}
        onClose={() => setIsCameraScannerOpen(false)}
        onScan={handleCameraScan}
        title="مسح وقراءة باركود المنتج بالكاميرا"
      />

    </form>
  );
}
