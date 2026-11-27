'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { filsToDisplay } from '@/lib/money';
import { Search, Plus, Sparkles, Tag, Trash2, Edit3, Globe, ShoppingBag, Eye, EyeOff, Loader2, Layers, CheckCircle2, ScanLine, Camera, ArrowRight } from 'lucide-react';
import { deleteProduct, toggleProductStoreVisibility, toggleProductPOSVisibility, updateProductChannelAction, findProductByBarcodeOrSkuAction } from '@/actions/products';
import { CameraBarcodeScannerModal } from '@/components/CameraBarcodeScannerModal';

export function AdminProductsClient({ 
  products, 
  globalPrices, 
  adminId, 
  categories,
  initialChannelParam = 'all'
}: { 
  products: any[], 
  globalPrices: any, 
  adminId: string, 
  categories: any[],
  initialChannelParam?: string
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [productList, setProductList] = useState<any[]>(products);

  useEffect(() => {
    setProductList(products);
  }, [products]);

  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busyIds, setBusyIds] = useState<Record<string, boolean>>({});

  // Parse active channel tab from URL search parameter (e.g. ?channel=all / online / pos / shared)
  const currentUrlChannel = (searchParams?.get('channel') || initialChannelParam || 'all').toLowerCase();
  const [activeChannelTab, setActiveChannelTab] = useState<'ALL' | 'ONLINE' | 'POS' | 'SHARED'>(() => {
    if (currentUrlChannel === 'online') return 'ONLINE';
    if (currentUrlChannel === 'pos') return 'POS';
    if (currentUrlChannel === 'shared') return 'SHARED';
    return 'ALL';
  });

  // Sync state if URL changes externally
  useEffect(() => {
    const param = (searchParams?.get('channel') || 'all').toLowerCase();
    if (param === 'online') setActiveChannelTab('ONLINE');
    else if (param === 'pos') setActiveChannelTab('POS');
    else if (param === 'shared') setActiveChannelTab('SHARED');
    else setActiveChannelTab('ALL');
  }, [searchParams]);

  // Category filter state
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(() => {
    return searchParams?.get('category') || '';
  });

  useEffect(() => {
    const cat = searchParams?.get('category') || '';
    setSelectedCategoryId(cat);
  }, [searchParams]);

  // Barcode Scanner Modal State for Phone / Camera
  const [isBarcodeScannerOpen, setIsBarcodeScannerOpen] = useState(false);
  const [isSearchingBarcode, setIsSearchingBarcode] = useState(false);
  const [scannerNotification, setScannerNotification] = useState<string | null>(null);
  const [redirectFallbackUrl, setRedirectFallbackUrl] = useState<string | null>(null);

  // Pagination: Load 30 products at a time with "عرض المزيد"
  const PAGE_SIZE = 30;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Reset pagination on search, channel tab, or category change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [search, activeChannelTab, selectedCategoryId]);

  // Exact Channel product counts
  const totalCount = productList.length;
  const onlineCount = useMemo(() => 
    productList.filter(p => p.channel === 'ONLINE').length,
    [productList]
  );
  const posCount = useMemo(() => 
    productList.filter(p => p.channel === 'POS' || (!p.channel && !p.isVisible)).length,
    [productList]
  );
  const sharedCount = useMemo(() => 
    productList.filter(p => p.channel === 'SHARED').length,
    [productList]
  );

  // Switch tab and update URL query parameter (?channel=...)
  const handleTabChange = (tab: 'ALL' | 'ONLINE' | 'POS' | 'SHARED') => {
    setActiveChannelTab(tab);
    const paramVal = tab === 'ALL' ? 'all' : tab.toLowerCase();
    const url = new URL(window.location.href);
    url.searchParams.set('channel', paramVal);
    window.history.pushState({}, '', url.toString());
  };

  // Filter products by search and channel
  const filteredProducts = useMemo(() => {
    let list = productList;
    if (activeChannelTab === 'ONLINE') {
      list = list.filter(p => p.channel === 'ONLINE');
    } else if (activeChannelTab === 'POS') {
      list = list.filter(p => p.channel === 'POS' || (!p.channel && !p.isVisible));
    } else if (activeChannelTab === 'SHARED') {
      list = list.filter(p => p.channel === 'SHARED');
    }

    if (selectedCategoryId) {
      list = list.filter(p => p.categoryId === selectedCategoryId || p.category?.id === selectedCategoryId || p.category?.slug === selectedCategoryId);
    }

    if (!search.trim()) return list;
    const lowerSearch = search.toLowerCase();
    return list.filter(p => 
      p.nameAr?.toLowerCase().includes(lowerSearch) || 
      (p.nameEn && p.nameEn.toLowerCase().includes(lowerSearch)) ||
      (p.sku && p.sku.toLowerCase().includes(lowerSearch)) ||
      (p.barcode && p.barcode.toLowerCase().includes(lowerSearch)) ||
      (p.variants && p.variants.some((v: any) => v.barcode?.toLowerCase().includes(lowerSearch) || v.sku?.toLowerCase().includes(lowerSearch))) ||
      (p.brand?.name && p.brand.name.toLowerCase().includes(lowerSearch)) ||
      (p.brand?.nameAr && p.brand.nameAr.toLowerCase().includes(lowerSearch))
    );
  }, [productList, search, activeChannelTab]);

  // Slice filtered products to show visibleCount (30 at a time)
  const displayedProducts = useMemo(() => {
    return filteredProducts.slice(0, visibleCount);
  }, [filteredProducts, visibleCount]);

  // Handle Barcode Scanned via Camera / Phone
  const handleBarcodeScanned = async (scannedBarcode: string) => {
    setIsBarcodeScannerOpen(false);
    const code = scannedBarcode.trim();
    if (!code) return;

    setIsSearchingBarcode(true);
    setScannerNotification(`جارٍ فحص الباركود (${code})...`);

    // 1. Search in local product list
    const localMatch = productList.find(p => 
      p.id === code ||
      p.barcode === code || 
      p.sku?.toLowerCase() === code.toLowerCase() ||
      p.variants?.some((v: any) => v.barcode === code || v.sku?.toLowerCase() === code.toLowerCase())
    );

    if (localMatch) {
      const editUrl = `/admin/products/${localMatch.id}`;
      setRedirectFallbackUrl(editUrl);
      setScannerNotification(`تم العثور على المنتج: "${localMatch.nameAr || localMatch.nameEn}" — جاري فتح صفحة التعديل...`);
      // Direct navigation for mobile reliability
      window.location.assign(editUrl);
      return;
    }

    // 2. Search database via Server Action (in case not in memory)
    try {
      const res = await findProductByBarcodeOrSkuAction(code);
      if (res?.success && res.product?.id) {
        const editUrl = `/admin/products/${res.product.id}`;
        setRedirectFallbackUrl(editUrl);
        setScannerNotification(`تم العثور على المنتج: "${res.product.nameAr || res.product.nameEn}" — جاري فتح صفحة التعديل...`);
        window.location.assign(editUrl);
        return;
      }
    } catch (err) {
      console.error('Error finding barcode in DB:', err);
    }

    // 3. Not found: Open "Add New Product" with prefilled barcode parameter
    const targetChannel = activeChannelTab === 'ALL' ? 'POS' : activeChannelTab;
    const addUrl = `/admin/products/new?barcode=${encodeURIComponent(code)}&channel=${targetChannel}`;
    setRedirectFallbackUrl(addUrl);
    setScannerNotification(`الباركود (${code}) غير مسجل مسبقاً! جاري فتح صفحة إضافة منتج جديد...`);
    window.location.assign(addUrl);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredProducts.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredProducts.map(p => p.id));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // Switch product channel action
  const handleChannelChange = async (productId: string, newChannel: 'ONLINE' | 'POS' | 'SHARED') => {
    setBusyIds(prev => ({ ...prev, [`chan_${productId}`]: true }));
    // Optimistic update
    setProductList(prev => prev.map(p => {
      if (p.id === productId) {
        return {
          ...p,
          channel: newChannel,
          isVisible: newChannel !== 'POS',
          isPOSAvailable: newChannel !== 'ONLINE'
        };
      }
      return p;
    }));

    try {
      const res = await updateProductChannelAction(productId, newChannel);
      if (!res.success) {
        alert(res.error || 'فشل تحديث قسم المنتج');
      }
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء تحديث قسم المنتج');
    } finally {
      setBusyIds(prev => ({ ...prev, [`chan_${productId}`]: false }));
    }
  };

  // Toggle Store Visibility (المتجر الإلكتروني)
  const handleToggleStoreVisibility = async (productId: string, currentVisible: boolean) => {
    const nextState = !currentVisible;
    setBusyIds(prev => ({ ...prev, [`store_${productId}`]: true }));
    // Optimistic update
    setProductList(prev => prev.map(p => p.id === productId ? { ...p, isVisible: nextState } : p));
    try {
      const res = await toggleProductStoreVisibility(productId, nextState);
      if (!res.success) {
        // revert on failure
        setProductList(prev => prev.map(p => p.id === productId ? { ...p, isVisible: currentVisible } : p));
        alert(res.error || 'فشل تحديث حالة العرض في المتجر');
      }
    } catch (err: any) {
      setProductList(prev => prev.map(p => p.id === productId ? { ...p, isVisible: currentVisible } : p));
      alert(err.message || 'حدث خطأ');
    } finally {
      setBusyIds(prev => ({ ...prev, [`store_${productId}`]: false }));
    }
  };

  // Toggle POS Visibility (كاشير البيع)
  const handleTogglePOSVisibility = async (productId: string, currentPOSAvailable: boolean) => {
    const nextState = !currentPOSAvailable;
    setBusyIds(prev => ({ ...prev, [`pos_${productId}`]: true }));
    // Optimistic update
    setProductList(prev => prev.map(p => {
      if (p.id === productId) {
        const updatedVariants = (p.variants || []).map((v: any) => ({ ...v, isActive: nextState }));
        return { ...p, isPOSAvailable: nextState, variants: updatedVariants };
      }
      return p;
    }));

    try {
      const res = await toggleProductPOSVisibility(productId, nextState);
      if (!res.success) {
        setProductList(prev => prev.map(p => {
          if (p.id === productId) {
            const revertedVariants = (p.variants || []).map((v: any) => ({ ...v, isActive: currentPOSAvailable }));
            return { ...p, isPOSAvailable: currentPOSAvailable, variants: revertedVariants };
          }
          return p;
        }));
        alert(res.error || 'فشل تحديث حالة البيع في الكاشير');
      }
    } catch (err: any) {
      alert(err.message || 'حدث خطأ');
    } finally {
      setBusyIds(prev => ({ ...prev, [`pos_${productId}`]: false }));
    }
  };

  // Delete product action
  const handleDeleteProduct = async (productId: string, productName: string) => {
    const confirmed = window.confirm(`هل أنت متأكد من رغبتك في حذف المنتج:\n"${productName}"؟\nسيتم حذفه من المتجر ونظام الكاشير نهائياً.`);
    if (!confirmed) return;

    setBusyIds(prev => ({ ...prev, [`del_${productId}`]: true }));
    try {
      const res = await deleteProduct(productId);
      if (res.success) {
        setProductList(prev => prev.filter(p => p.id !== productId));
      } else {
        alert(res.error || 'فشل حذف المنتج');
      }
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء الحذف');
    } finally {
      setBusyIds(prev => ({ ...prev, [`del_${productId}`]: false }));
    }
  };

  return (
    <div className="w-full flex flex-col gap-6" dir="rtl">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-zinc-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-6 bg-[#E6007E] rounded-full inline-block"></span>
            <h1 className="text-2xl md:text-3xl font-bold font-heading text-zinc-900">
              إدارة المنتجات والأسعار
            </h1>
          </div>
          <p className="text-zinc-500 mt-1 text-sm">
            التحكم المباشر بالعرض في المتجر والكاشير، الدرجات، الباركود، والأسعار • عرض {displayedProducts.length} من {filteredProducts.length} منتج (إجمالي النظام: {productList.length})
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto items-stretch sm:items-center flex-wrap">
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-400 absolute start-3 top-3" />
            <input 
              type="text" 
              placeholder="بحث بالاسم، الباركود أو SKU..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="border border-zinc-300 rounded-xl ps-9 pe-4 py-2 text-sm focus:outline-none focus:border-[#E6007E] w-full sm:w-64 bg-white"
            />
          </div>

          {/* فلتر الأقسام */}
          <div className="relative">
            <select
              value={selectedCategoryId}
              onChange={e => {
                const val = e.target.value;
                setSelectedCategoryId(val);
                const url = new URL(window.location.href);
                if (val) url.searchParams.set('category', val);
                else url.searchParams.delete('category');
                window.history.pushState({}, '', url.toString());
              }}
              className={`border rounded-xl px-3 py-2 text-xs font-bold outline-none cursor-pointer transition ${
                selectedCategoryId 
                  ? 'border-[#E6007E] bg-pink-50 text-[#E6007E]' 
                  : 'border-zinc-300 bg-white text-zinc-700 focus:border-[#E6007E]'
              }`}
            >
              <option value="">جميع الأقسام ({categories.length})</option>
              {categories.map(c => {
                const badge = c.channel === 'ONLINE' ? '🌐 متجر' : c.channel === 'POS' ? '🏪 كاش' : '🔄 مشترك';
                return (
                  <option key={c.id} value={c.id}>
                    {c.name} ({badge})
                  </option>
                );
              })}
            </select>
          </div>

          {selectedCategoryId && (
            <button
              type="button"
              onClick={() => {
                setSelectedCategoryId('');
                const url = new URL(window.location.href);
                url.searchParams.delete('category');
                window.history.pushState({}, '', url.toString());
              }}
              className="text-xs text-rose-600 hover:underline font-bold px-1"
              title="إلغاء فلترة القسم"
            >
              إلغاء فلتر القسم ✕
            </button>
          )}

          {/* زر مسح الباركود بالكاميرا للهاتف والكمبيوتر */}
          <button
            type="button"
            onClick={() => setIsBarcodeScannerOpen(true)}
            className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl font-bold transition text-sm shadow-sm whitespace-nowrap cursor-pointer"
            title="مسح باركود المنتج بواسطة كاميرا الهاتف لتعديله فوراً أو إضافته إن لم يكن موجوداً"
          >
            <ScanLine className="w-4 h-4" />
            <span>مسح باركود بالهاتف</span>
          </button>

          <Link
            href={
              activeChannelTab === 'ONLINE' ? '/admin/products/new?channel=ONLINE' :
              activeChannelTab === 'POS' ? '/admin/products/new?channel=POS' :
              activeChannelTab === 'SHARED' ? '/admin/products/new?channel=SHARED' :
              '/admin/products/new'
            }
            className="flex items-center justify-center gap-2 bg-[#E6007E] hover:bg-[#c9006e] text-white px-5 py-2 rounded-xl font-bold transition text-sm shadow-sm whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            {
              activeChannelTab === 'ONLINE' ? 'إضافة منتج للمتجر الإلكتروني' :
              activeChannelTab === 'POS' ? 'إضافة منتج لكاشير المحل' :
              activeChannelTab === 'SHARED' ? 'إضافة منتج مشترك (متجر + كاشير)' :
              'إضافة منتج جديد'
            }
          </Link>
        </div>
      </div>

      {/* Product Channels Tabs (أقسام المتجر الإلكتروني، الكاشير، والمنتجات المشتركة) */}
      <div className="flex flex-wrap items-center gap-2 p-1.5 bg-zinc-100 rounded-2xl border border-zinc-200">
        <button
          type="button"
          onClick={() => handleTabChange('ALL')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
            activeChannelTab === 'ALL'
              ? 'bg-zinc-800 text-white shadow-xs'
              : 'text-zinc-700 hover:bg-white hover:text-zinc-900'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>كافة المنتجات</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-zinc-200 text-zinc-800">
            {totalCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('ONLINE')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
            activeChannelTab === 'ONLINE'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-zinc-700 hover:bg-white hover:text-zinc-900'
          }`}
        >
          <Globe className="w-4 h-4" />
          <span>قسم المتجر الإلكتروني</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
            activeChannelTab === 'ONLINE' ? 'bg-blue-700 text-white' : 'bg-blue-100 text-blue-800'
          }`}>
            {onlineCount} منتج
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('POS')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
            activeChannelTab === 'POS'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'text-zinc-700 hover:bg-white hover:text-zinc-900'
          }`}
        >
          <ShoppingBag className="w-4 h-4" />
          <span>قسم كاشير وصالة المحل</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
            activeChannelTab === 'POS' ? 'bg-amber-700 text-white' : 'bg-amber-100 text-amber-800'
          }`}>
            {posCount} منتج
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('SHARED')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
            activeChannelTab === 'SHARED'
              ? 'bg-[#E6007E] text-white shadow-xs'
              : 'text-zinc-700 hover:bg-white hover:text-zinc-900'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>قسم المنتجات المشتركة (المتجر + الكاشير)</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
            activeChannelTab === 'SHARED' ? 'bg-pink-700 text-white' : 'bg-pink-100 text-[#E6007E]'
          }`}>
            {sharedCount} منتج
          </span>
        </button>
      </div>

      {/* Modal ماسح الباركود بالكاميرا للهاتف */}
      <CameraBarcodeScannerModal
        isOpen={isBarcodeScannerOpen}
        onClose={() => setIsBarcodeScannerOpen(false)}
        onScan={handleBarcodeScanned}
        title="مسح باركود المنتج بالهاتف للبحث والتعديل أو الإضافة"
      />

      {/* شاشة انتظار الفحص والتوجيه التلقائي */}
      {isSearchingBarcode && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 shadow-2xl flex flex-col items-center gap-3 text-center max-w-sm border border-pink-100 animate-fade-in">
            <Loader2 className="w-8 h-8 text-[#E6007E] animate-spin" />
            <p className="font-bold text-sm text-zinc-800 leading-relaxed">
              {scannerNotification || 'جاري فحص الباركود...'}
            </p>
            {redirectFallbackUrl && (
              <a
                href={redirectFallbackUrl}
                className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 bg-[#E6007E] hover:bg-[#c9006e] text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer"
              >
                <span>اضغط هنا إذا لم يتم التحويل تلقائياً</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-zinc-200/80 overflow-hidden">
        <div className="overflow-x-auto w-full pb-2">
          <table className="w-full text-right border-collapse min-w-[1050px]">
            <thead className="bg-zinc-50/80 border-b border-zinc-200">
              <tr className="text-xs font-bold text-zinc-600">
                <th className="px-4 py-3.5 w-12 text-center">
                  <input 
                    type="checkbox" 
                    checked={filteredProducts.length > 0 && selectedIds.length === filteredProducts.length}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 text-[#E6007E] rounded border-zinc-300 focus:ring-[#E6007E]"
                  />
                </th>
                <th className="px-4 py-3.5 w-14">صورة</th>
                <th className="px-4 py-3.5">المنتج</th>
                <th className="px-4 py-3.5">القسم</th>
                <th className="px-4 py-3.5 text-center">قناة البيع / القسم</th>
                <th className="px-4 py-3.5">الدرجات / الخيارات</th>
                <th className="px-4 py-3.5 text-center">سعر التكلفة</th>
                <th className="px-4 py-3.5 text-center">سعر البيع</th>
                <th className="px-4 py-3.5 text-center">عرض المتجر</th>
                <th className="px-4 py-3.5 text-center">كاشير POS</th>
                <th className="px-4 py-3.5 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {displayedProducts.map((product) => {
                const mainImage = product.images?.[0];
                const isSelected = selectedIds.includes(product.id);
                const isStoreBusy = busyIds[`store_${product.id}`];
                const isPOSBusy = busyIds[`pos_${product.id}`];
                const isDelBusy = busyIds[`del_${product.id}`];
                
                // Determine if POS is available (any active variant or product flag)
                const isPOSActive = product.isPOSAvailable !== undefined 
                  ? product.isPOSAvailable 
                  : (product.variants?.some((v: any) => v.isActive) ?? true);

                // Selling price calculation
                const variantPrices = (product.variants || [])
                  .map((v: any) => Number(v.price) || 0)
                  .filter((p: number) => p > 0);
                const minPrice = variantPrices.length > 0 ? Math.min(...variantPrices) : (product.priceFils || 0);
                const maxPrice = variantPrices.length > 0 ? Math.max(...variantPrices) : (product.priceFils || 0);

                // Cost price calculation
                const variantCosts = (product.variants || [])
                  .map((v: any) => {
                    if (v.costPrice !== undefined && Number(v.costPrice) > 0) return Number(v.costPrice);
                    if ((product as any).costPrice !== undefined && Number((product as any).costPrice) > 0) return Number((product as any).costPrice);
                    return Math.round((Number(v.price) || (product.priceFils || 0)) * 0.55);
                  })
                  .filter((c: number) => c > 0);
                const minCost = variantCosts.length > 0 ? Math.min(...variantCosts) : Math.round(minPrice * 0.55);
                const maxCost = variantCosts.length > 0 ? Math.max(...variantCosts) : Math.round(maxPrice * 0.55);

                return (
                  <tr key={product.id} className={`hover:bg-zinc-50/60 transition text-zinc-700 text-sm ${isSelected ? 'bg-pink-50/30' : ''}`}>
                    <td className="px-4 py-3 text-center">
                      <input 
                        type="checkbox" 
                        checked={isSelected}
                        onChange={() => toggleSelect(product.id)}
                        className="w-4 h-4 text-[#E6007E] rounded border-zinc-300 focus:ring-[#E6007E]"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="w-12 h-12 rounded-xl border border-zinc-200 bg-white overflow-hidden flex items-center justify-center p-0.5">
                        {mainImage ? (
                          <img src={mainImage.url.startsWith('local://') ? '/product-placeholder.png' : mainImage.url} alt={product.nameAr} className="w-full h-full object-contain rounded-lg" />
                        ) : (
                          <span className="text-[10px] text-zinc-400">بدون صورة</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-zinc-900">{product.nameAr}</div>
                      <div className="flex items-center gap-2 flex-wrap mt-0.5">
                        <span className="text-xs text-zinc-400 font-mono" dir="ltr">{product.sku}</span>
                        {product.tag ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-pink-100 text-[#E6007E] border border-pink-200">
                            🏷️ {product.tag}
                          </span>
                        ) : (
                          <span className="text-[10px] text-zinc-300 font-medium">(بدون شارة)</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-800 font-bold">
                      {product.category?.name || '-'}
                    </td>
                    
                    {/* Channel / Section Selector */}
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      {(() => {
                        const currentChannel: 'ONLINE' | 'POS' | 'SHARED' = product.channel || (
                          (product.isPOSAvailable !== false && product.isVisible !== false) ? 'SHARED' :
                          product.isPOSAvailable ? 'POS' : 'ONLINE'
                        );

                        return (
                          <div className="inline-flex flex-col items-center">
                            <select
                              value={currentChannel}
                              disabled={busyIds[`chan_${product.id}`]}
                              onChange={(e) => handleChannelChange(product.id, e.target.value as any)}
                              className={`text-xs font-black px-2.5 py-1 rounded-xl border outline-none cursor-pointer transition shadow-2xs ${
                                currentChannel === 'ONLINE'
                                  ? 'bg-blue-50 text-blue-900 border-blue-200 hover:bg-blue-100'
                                  : currentChannel === 'POS'
                                  ? 'bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100'
                                  : 'bg-pink-50 text-[#E6007E] border-pink-200 hover:bg-pink-100'
                              }`}
                            >
                              <option value="ONLINE">🌐 متجر إلكتروني</option>
                              <option value="POS">🛍️ كاشير المحل</option>
                              <option value="SHARED">✨ مشترك</option>
                            </select>
                            <span className="text-[10px] text-zinc-400 mt-0.5">
                              {currentChannel === 'ONLINE' && 'المتجر فقط'}
                              {currentChannel === 'POS' && 'الكاشير فقط'}
                              {currentChannel === 'SHARED' && 'المتجر والكاشير'}
                            </span>
                          </div>
                        );
                      })()}
                    </td>
                    
                    {/* Shades / Variants */}
                    <td className="px-4 py-3 text-sm">
                      <div className="flex flex-wrap gap-1 max-w-[180px]">
                        {product.variants.map((v: any) => (
                          <span key={v.id} className="inline-flex items-center gap-1 bg-zinc-100 px-2 py-0.5 rounded-lg text-xs font-medium text-zinc-700 border border-zinc-200">
                            {v.colorHex && (
                              <span className="w-2.5 h-2.5 rounded-full inline-block border border-black/10 shrink-0" style={{ backgroundColor: v.colorHex }}></span>
                            )}
                            <span>{v.shade || v.size}</span>
                          </span>
                        ))}
                        {product.variants.length === 0 && <span className="text-xs text-zinc-400">لا درجات</span>}
                      </div>
                    </td>

                    {/* Cost Price (سعر التكلفة) */}
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <div className="inline-flex flex-col items-center">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-mono font-black bg-amber-50 text-amber-900 border border-amber-200/90 shadow-2xs">
                          <span>{minCost === maxCost ? filsToDisplay(minCost, 'ar') : `${filsToDisplay(minCost, 'ar')} - ${filsToDisplay(maxCost, 'ar')}`}</span>
                        </span>
                        <span className="text-[10px] text-zinc-400 font-semibold mt-0.5">تكلفة الوحدة</span>
                      </div>
                    </td>

                    {/* Selling Price (سعر البيع) */}
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <div className="inline-flex flex-col items-center">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-mono font-black bg-emerald-50 text-emerald-900 border border-emerald-200/90 shadow-2xs">
                          <span>{minPrice === maxPrice ? filsToDisplay(minPrice, 'ar') : `${filsToDisplay(minPrice, 'ar')} - ${filsToDisplay(maxPrice, 'ar')}`}</span>
                        </span>
                        {product.variants?.some((v: any) => v.compareAt && v.compareAt > v.price) ? (
                          <span className="text-[10px] text-rose-600 font-extrabold mt-0.5">خصم فعال</span>
                        ) : (
                          <span className="text-[10px] text-zinc-400 font-semibold mt-0.5">سعر الجمهور</span>
                        )}
                      </div>
                    </td>

                    {/* Storefront Online Toggle (المتجر الإلكتروني) */}
                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => handleToggleStoreVisibility(product.id, product.isVisible)}
                        disabled={isStoreBusy}
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all shadow-2xs cursor-pointer ${
                          product.isVisible
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                            : 'bg-zinc-100 text-zinc-500 border border-zinc-200 hover:bg-zinc-200'
                        }`}
                        title="انقر لتبديل الظهور في المتجر الإلكتروني مباشرة"
                      >
                        {isStoreBusy ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : product.isVisible ? (
                          <Eye className="w-3 h-3 text-emerald-600" />
                        ) : (
                          <EyeOff className="w-3 h-3 text-zinc-400" />
                        )}
                        <span>{product.isVisible ? 'متاح بالمتجر' : 'مخفي بالمتجر'}</span>
                      </button>
                    </td>

                    {/* POS Cashier Toggle (كاشير البيع) */}
                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => handleTogglePOSVisibility(product.id, isPOSActive)}
                        disabled={isPOSBusy}
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all shadow-2xs cursor-pointer ${
                          isPOSActive
                            ? 'bg-pink-50 text-[#E6007E] border border-pink-200 hover:bg-pink-100'
                            : 'bg-zinc-100 text-zinc-500 border border-zinc-200 hover:bg-zinc-200'
                        }`}
                        title="انقر لتبديل إتاحة المنتج في كاشير البيع POS مباشرة"
                      >
                        {isPOSBusy ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <ShoppingBag className={`w-3 h-3 ${isPOSActive ? 'text-[#E6007E]' : 'text-zinc-400'}`} />
                        )}
                        <span>{isPOSActive ? 'متاح بالكاشير' : 'مخفي بالكاشير'}</span>
                      </button>
                    </td>

                    {/* Actions: Edit & Delete */}
                    <td className="px-4 py-3 text-center text-sm font-bold">
                      <div className="flex items-center justify-center gap-2">
                        <Link
                          href={`/admin/products/${product.id}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg text-zinc-700 bg-zinc-100 hover:bg-pink-50 hover:text-[#E6007E] border border-zinc-200 transition"
                          title="تعديل المنتج"
                        >
                          <Edit3 className="w-3 h-3" />
                          <span>تعديل</span>
                        </Link>
                        
                        <button
                          type="button"
                          onClick={() => handleDeleteProduct(product.id, product.nameAr)}
                          disabled={isDelBusy}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 transition cursor-pointer"
                          title="حذف المنتج نهائياً"
                        >
                          {isDelBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                          <span>حذف</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-6 py-16 text-center">
                    <p className="text-zinc-500 mb-2">لا توجد منتجات تطابق البحث.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Load More Pagination (عرض المزيد) */}
        {filteredProducts.length > visibleCount && (
          <div className="p-6 bg-zinc-50/80 border-t border-zinc-200 flex flex-col items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
              className="inline-flex items-center gap-2.5 px-6 py-2.5 bg-[#E6007E] hover:bg-[#c9006e] text-white font-extrabold text-xs rounded-xl shadow-xs transition active:scale-95 cursor-pointer"
            >
              <span>عرض المزيد (+30 منتج)</span>
              <span className="bg-white/20 px-2.5 py-0.5 rounded-full text-[11px] font-mono">
                {displayedProducts.length} من {filteredProducts.length}
              </span>
            </button>
            <p className="text-[11px] text-zinc-500 font-medium">
              يتم تحميل 30 منتج في كل دفعة لضمان أقصى سرعة وسلاسة تصفح.
            </p>
          </div>
        )}

        {filteredProducts.length > 0 && filteredProducts.length <= visibleCount && (
          <div className="text-center py-4 text-xs font-bold text-zinc-400 border-t border-zinc-100 bg-zinc-50/50">
            ✓ تم عرض كافة المنتجات المتاحة ({filteredProducts.length} منتج)
          </div>
        )}
      </div>
    </div>
  );
}
