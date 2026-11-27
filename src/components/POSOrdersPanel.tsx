'use client';

import React, { useEffect, useState, useTransition, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { 
  X, RefreshCcw, ExternalLink, Search, ShoppingBag, Clock, 
  PackageCheck, Truck, CheckCircle2, XCircle, Layers, Printer,
  Phone, MapPin, Eye, ArrowRight, Package
} from 'lucide-react';
import { getPOSOrders, updatePOSOrderStatus } from '@/actions/pos-orders';
import { confirmStorefrontOrder, cancelStorefrontOrder } from '@/actions/orders';
import { createBrowserClient } from '@supabase/ssr';
import { AdminOrderQuickActions } from './AdminOrderQuickActions';
import { AdminOrderItemsEditor } from './AdminOrderItemsEditor';
import { getAvailableProductsForOrderEditor } from '@/actions/products';
import { resolvePOSItemImage } from '@/lib/order-image';

export function POSOrdersPanel({
  onClose,
  hasManagePermission,
  locale = 'ar',
  isInline = false
}: {
  onClose?: () => void;
  hasManagePermission: boolean;
  locale?: string;
  isInline?: boolean;
}) {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<string>('ALL');
  const [availableProducts, setAvailableProducts] = useState<any[]>([]);
  const [isPending, startTransition] = useTransition();

  // Load available products for instant order item editing
  useEffect(() => {
    getAvailableProductsForOrderEditor().then((res) => {
      if (res.success && res.products) {
        setAvailableProducts(res.products);
      }
    });
  }, []);

  // Supabase client for realtime (safe build-time fallback)
  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ebygsibxdxjxaetrqrya.supabase.co';
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_sGe982LRaxveX8O67APzgQ_ojL_YMev';
    return createBrowserClient(url, key);
  }, []);

  const fetchOrders = async () => {
    setLoading(true);
    const res = await getPOSOrders();
    if (res.success) {
      setOrders(res.orders || []);
      // If an order is currently selected, refresh its data
      if (selectedOrder) {
        const updated = (res.orders || []).find((o: any) => o.id === selectedOrder.id);
        if (updated) setSelectedOrder(updated);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchOrders();

    // Set up Realtime subscription
    const channel = supabase
      .channel('pos-public-orders')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'Order' },
        (payload) => {
          try {
            const audio = new Audio('/chime.mp3');
            audio.play().catch(() => {});
          } catch (e) {}

          fetchOrders();
          
          if (typeof window !== 'undefined' && 'Notification' in window) {
            if (Notification.permission === 'granted') {
              new Notification('طلب جديد وصل!', {
                body: `طلب جديد برقم: ${payload.new.reference}`,
              });
            } else if (Notification.permission !== 'denied') {
              Notification.requestPermission();
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  // Official Status mapping matching Admin Orders exactly:
  // 1. الطلبات الجديدة: NEW, PENDING, AWAITING_WHATSAPP
  // 2. مؤكد وقيد التجهيز: CONFIRMED, PREPARING, CONFIRMED_PREPARING
  // 3. تم التجهيز بانتظار التوصيل: PREPARED, READY_FOR_DELIVERY, AWAITING_DELIVERY
  // 4. مع التوصيل: SHIPPED, OUT_FOR_DELIVERY, WITH_COURIER
  // 5. مكتمل: DELIVERED, COMPLETED
  // 6. ملغي: CANCELLED, REFUNDED
  const tabStatusMap: Record<string, string[]> = {
    'NEW': ['PENDING', 'AWAITING_WHATSAPP', 'NEW'],
    'PREPARING': ['CONFIRMED', 'PREPARING', 'CONFIRMED_PREPARING'],
    'PREPARED': ['PREPARED', 'READY_FOR_DELIVERY', 'AWAITING_DELIVERY'],
    'SHIPPED': ['SHIPPED', 'OUT_FOR_DELIVERY', 'WITH_COURIER'],
    'COMPLETED': ['DELIVERED', 'COMPLETED'],
    'CANCELLED': ['CANCELLED', 'REFUNDED']
  };

  const tabsConfig = [
    { key: 'ALL', label: 'كافة الطلبات', icon: Layers, color: 'text-zinc-900', activeBg: 'border-zinc-900 text-zinc-900' },
    { key: 'NEW', label: 'الطلبات الجديدة', icon: ShoppingBag, color: 'text-blue-600', activeBg: 'border-blue-600 text-blue-600' },
    { key: 'PREPARING', label: 'مؤكد وقيد التجهيز', icon: Clock, color: 'text-amber-600', activeBg: 'border-amber-600 text-amber-600' },
    { key: 'PREPARED', label: 'تم التجهيز بانتظار التوصيل', icon: PackageCheck, color: 'text-purple-600', activeBg: 'border-purple-600 text-purple-600' },
    { key: 'SHIPPED', label: 'مع التوصيل', icon: Truck, color: 'text-orange-600', activeBg: 'border-orange-600 text-orange-600' },
    { key: 'COMPLETED', label: 'مكتمل', icon: CheckCircle2, color: 'text-emerald-600', activeBg: 'border-emerald-600 text-emerald-600' },
    { key: 'CANCELLED', label: 'ملغي', icon: XCircle, color: 'text-rose-600', activeBg: 'border-rose-600 text-rose-600' },
  ];

  const getTabCount = (tabKey: string) => {
    if (tabKey === 'ALL') return orders.length;
    const statuses = tabStatusMap[tabKey] || [];
    return orders.filter(o => statuses.includes(o.status)).length;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'AWAITING_WHATSAPP':
      case 'PENDING':
      case 'NEW':
        return (
          <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-0.5 rounded-full text-xs font-black">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
            الطلبات الجديدة
          </span>
        );
      case 'CONFIRMED':
      case 'PREPARING':
      case 'CONFIRMED_PREPARING':
        return (
          <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-0.5 rounded-full text-xs font-black">
            <Clock className="w-3 h-3 text-amber-500" />
            مؤكد وقيد التجهيز
          </span>
        );
      case 'PREPARED':
      case 'READY_FOR_DELIVERY':
      case 'AWAITING_DELIVERY':
        return (
          <span className="inline-flex items-center gap-1 bg-purple-50 text-purple-700 border border-purple-200 px-2.5 py-0.5 rounded-full text-xs font-black">
            <PackageCheck className="w-3 h-3 text-purple-500" />
            تم التجهيز بانتظار التوصيل
          </span>
        );
      case 'SHIPPED':
      case 'OUT_FOR_DELIVERY':
      case 'WITH_COURIER':
        return (
          <span className="inline-flex items-center gap-1 bg-orange-50 text-orange-700 border border-orange-200 px-2.5 py-0.5 rounded-full text-xs font-black">
            <Truck className="w-3 h-3 text-orange-500" />
            مع التوصيل
          </span>
        );
      case 'DELIVERED':
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 rounded-full text-xs font-black">
            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
            مكتمل
          </span>
        );
      case 'CANCELLED':
      case 'REFUNDED':
        return (
          <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-700 border border-rose-200 px-2.5 py-0.5 rounded-full text-xs font-black">
            <XCircle className="w-3 h-3 text-rose-500" />
            ملغي
          </span>
        );
      default:
        return <span className="bg-zinc-100 text-zinc-800 px-2.5 py-0.5 rounded-full text-xs font-bold">{status}</span>;
    }
  };

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      // Tab matching
      if (activeTab !== 'ALL') {
        const allowedStatuses = tabStatusMap[activeTab] || [];
        if (!allowedStatuses.includes(o.status)) return false;
      }

      // Search matching
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesRef = (o.reference || '').toLowerCase().includes(q);
        const matchesCustomer = (o.customerName || '').toLowerCase().includes(q);
        const matchesPhone = (o.customerPhone || '').includes(q);
        const matchesItems = (o.items || []).some((it: any) => (it.name || '').toLowerCase().includes(q) || (it.sku || '').toLowerCase().includes(q));
        if (!matchesRef && !matchesCustomer && !matchesPhone && !matchesItems) return false;
      }

      return true;
    });
  }, [orders, activeTab, searchQuery]);

  return (
    <div className={isInline ? "flex flex-col h-full w-full bg-white shadow-xl rounded-2xl overflow-hidden relative border border-zinc-200" : "fixed inset-y-0 left-0 w-full md:w-[650px] bg-white shadow-2xl z-50 flex flex-col animate-slide-in-right relative"} dir="rtl">
      
      {/* Top Header */}
      <div className="bg-black text-white p-4 flex justify-between items-center shrink-0 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-pink-500/20 text-[#E6007E] rounded-xl border border-pink-500/30">
            <ShoppingBag className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-extrabold text-base md:text-lg flex items-center gap-2">
              <span>طلبات المتجر الإلكتروني</span>
              <span className="text-[11px] font-bold text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded">
                شاشة الكاشير والتجهيز
              </span>
            </h2>
            <p className="text-[11px] text-zinc-400 font-medium">
              تجهيز طلبات الزبائن وإصدار الشحنات بمرونة وسرعة
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/pos/deliveries"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-950/60 hover:bg-purple-900 text-purple-200 border border-purple-800 text-xs font-bold transition shadow-2xs"
            title="الانتقال إلى طلبيات شركة التوصيل والشحنات"
          >
            <Truck className="w-3.5 h-3.5 text-purple-400" />
            <span>طلبيات التوصيل</span>
          </Link>

          <button 
            type="button"
            onClick={fetchOrders} 
            disabled={loading}
            className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors border border-zinc-700"
            title="تحديث الطلبات"
          >
            <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin text-pink-400' : ''}`} />
          </button>
          
          {!isInline && onClose && (
            <button 
              type="button"
              onClick={onClose} 
              className="p-2 rounded-xl bg-zinc-800 hover:bg-red-600 text-zinc-300 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Live Search Bar */}
      <div className="p-3 bg-zinc-50 border-b border-zinc-200 shrink-0">
        <div className="relative">
          <Search className="w-4 h-4 absolute inset-inline-start-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ابحث برقم الطلب (GHZ-1001)، اسم الزبونة، رقم الهاتف، أو اسم الصنف..."
            className="w-full h-10 ps-9 pe-8 bg-white border border-zinc-200 rounded-xl text-xs font-bold text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#E6007E]/30 focus:border-[#E6007E] transition shadow-2xs"
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="absolute inset-inline-end-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 text-xs font-bold p-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* The 6 Official Status Tabs Matching Admin Exactly */}
      <div className="flex bg-white border-b border-zinc-200 shrink-0 overflow-x-auto whitespace-nowrap scrollbar-none px-2">
        {tabsConfig.map((tab) => {
          const isActive = activeTab === tab.key;
          const count = getTabCount(tab.key);
          const Icon = tab.icon;

          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-black border-b-2 transition-all cursor-pointer ${
                isActive
                  ? `${tab.activeBg} bg-pink-50/20`
                  : 'border-transparent text-zinc-500 hover:text-zinc-800 hover:bg-zinc-50'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span>{tab.label}</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                isActive ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-600 border border-zinc-200'
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Orders List View */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-zinc-50/60">
        {loading && orders.length === 0 ? (
          <div className="text-center text-zinc-500 py-16 flex flex-col items-center gap-2">
            <RefreshCcw className="w-6 h-6 animate-spin text-[#E6007E]" />
            <span className="text-xs font-bold">جاري تحميل الطلبات...</span>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="text-center text-zinc-400 py-16 bg-white rounded-2xl border border-dashed border-zinc-200 p-8">
            <ShoppingBag className="w-8 h-8 mx-auto mb-2 text-zinc-300" />
            <p className="font-bold text-xs text-zinc-600">
              {searchQuery ? `لا توجد نتائج مطابقة لبحثك عن "${searchQuery}"` : 'لا توجد طلبات في هذا القسم حالياً'}
            </p>
          </div>
        ) : (
          filteredOrders.map((order) => {
            return (
              <div 
                key={order.id} 
                onClick={() => setSelectedOrder(order)}
                className="bg-white p-4 rounded-2xl shadow-2xs border border-zinc-200 cursor-pointer hover:border-[#E6007E] hover:shadow-sm transition-all group"
              >
                {/* Header row */}
                <div className="flex justify-between items-start mb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-black text-sm text-zinc-900 group-hover:text-[#E6007E] transition-colors">
                      #{order.reference}
                    </span>
                    <span className="text-[11px] font-mono text-zinc-400" dir="ltr">
                      {order.createdAt ? new Date(order.createdAt).toLocaleDateString('ar-JO-u-nu-latn') : ''}
                    </span>
                  </div>
                  <div>
                    {getStatusBadge(order.status)}
                  </div>
                </div>

                {/* Customer Info & Total */}
                <div className="flex justify-between items-center mb-3">
                  <div>
                    <p className="text-xs font-bold text-zinc-900">{order.customerName}</p>
                    <p className="text-[11px] font-mono text-zinc-500" dir="ltr">{order.customerPhone}</p>
                  </div>
                  <div className="text-end">
                    <span className="text-sm font-black text-emerald-700 font-mono">
                      {(order.totalAmount / 1000).toFixed(3)} د.أ
                    </span>
                    <span className="block text-[10px] text-zinc-400">شامل التوصيل</span>
                  </div>
                </div>

                {/* Product Items with IMAGES for easy order preparation (صور الاصناف مع اسم الاصناف) */}
                <div className="pt-2.5 border-t border-zinc-100 space-y-1.5">
                  <div className="text-[10px] font-bold text-zinc-400 mb-1 flex items-center gap-1">
                    <Package className="w-3 h-3 text-zinc-400" />
                    <span>محتويات الطلب والتجهيز ({order.items?.length || 0} أصناف):</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(order.items || []).slice(0, 4).map((it: any) => {
                      const img = resolvePOSItemImage(it);
                      return (
                        <div 
                          key={it.id || it.sku}
                          className="flex items-center gap-2 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200/80 rounded-xl px-2 py-1 max-w-[200px] text-xs"
                        >
                          <div className="w-7 h-7 rounded-lg bg-zinc-200 overflow-hidden shrink-0 border border-zinc-200 relative flex items-center justify-center">
                            {img ? (
                              <img 
                                src={img} 
                                alt={it.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <Package className="w-3.5 h-3.5 text-zinc-400" />
                            )}
                          </div>
                          <div className="truncate">
                            <p className="text-[11px] font-bold text-zinc-800 truncate" title={it.name}>
                              {it.name}
                            </p>
                            <span className="text-[10px] text-zinc-500 font-mono">
                              × {it.quantity}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                    {(order.items || []).length > 4 && (
                      <div className="flex items-center justify-center bg-zinc-100 text-zinc-600 rounded-xl px-2.5 py-1 text-[11px] font-bold border border-zinc-200">
                        + {(order.items.length - 4)} أصناف أخرى
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Order Detail Modal / Slide-in (Strictly within POS) */}
      {selectedOrder && (
        <div className="absolute inset-0 bg-white z-20 flex flex-col animate-fade-in shadow-2xl">
          {/* Top Detail Header */}
          <div className="bg-zinc-900 text-white p-4 flex justify-between items-center border-b border-zinc-800 shrink-0">
            <div className="flex items-center gap-3">
              <button 
                type="button"
                onClick={() => setSelectedOrder(null)} 
                className="flex items-center gap-1.5 text-white font-extrabold bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded-xl border border-zinc-700 text-xs transition shadow-2xs"
              >
                <ArrowRight className="w-4 h-4 text-pink-400" />
                <span>رجوع للقائمة</span>
              </button>
              <div>
                <h3 className="font-black text-sm md:text-base text-white flex items-center gap-2">
                  <span>طلب #{selectedOrder.reference}</span>
                  {getStatusBadge(selectedOrder.status)}
                </h3>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Link
                href={`/ar/invoice/${selectedOrder.id}`}
                target="_blank"
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white text-xs font-bold border border-zinc-700 transition"
                title="عرض رابط الفاتورة الحرارية"
              >
                <Printer className="w-3.5 h-3.5 text-zinc-400" />
                <span className="hidden sm:inline">طباعة الفاتورة</span>
              </Link>
            </div>
          </div>
          
          {/* Detail Body */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 text-sm bg-zinc-50/50">
            
            {/* Customer Details Box */}
            <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-2xs space-y-3">
              <h4 className="text-xs font-black text-zinc-500 uppercase tracking-wider flex items-center gap-1.5 border-b pb-2">
                <span>بيانات الزبونة والتوصيل</span>
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <span className="text-[11px] text-zinc-400 block">اسم الزبونة:</span>
                  <p className="font-extrabold text-sm text-zinc-900">{selectedOrder.customerName}</p>
                </div>
                <div>
                  <span className="text-[11px] text-zinc-400 block">رقم الهاتف:</span>
                  <div className="flex items-center gap-2">
                    <p className="font-mono font-bold text-zinc-900" dir="ltr">{selectedOrder.customerPhone}</p>
                    <a 
                      href={`https://wa.me/${selectedOrder.customerPhone.replace(/\D/g, '')}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-[10px] bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-full font-bold transition flex items-center gap-1"
                    >
                      <span>واتساب</span>
                    </a>
                  </div>
                </div>
                {(selectedOrder.addressStreet || selectedOrder.addressBuilding) && (
                  <div className="sm:col-span-2">
                    <span className="text-[11px] text-zinc-400 block">عنوان التوصيل:</span>
                    <p className="text-xs font-bold text-zinc-800">
                      {selectedOrder.addressStreet} {selectedOrder.addressBuilding ? `• ${selectedOrder.addressBuilding}` : ''} {selectedOrder.addressApartment ? `(شقة ${selectedOrder.addressApartment})` : ''}
                    </p>
                  </div>
                )}
                {selectedOrder.notes && (
                  <div className="sm:col-span-2 bg-amber-50 border border-amber-200 p-2.5 rounded-xl text-amber-900 text-xs">
                    <span className="font-bold">ملاحظات الزبونة: </span>
                    <span>{selectedOrder.notes}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Product Items with Full Image Lightbox & Barcode/Camera Item Editor */}
            <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-2xs">
              <AdminOrderItemsEditor
                orderId={selectedOrder.id}
                items={selectedOrder.items || []}
                shippingCost={selectedOrder.shippingCost || 0}
                availableProducts={availableProducts}
                isLocked={selectedOrder.status === 'DELIVERED' || selectedOrder.status === 'CANCELLED'}
                onOrderUpdated={() => {
                  fetchOrders();
                }}
              />
            </div>

            {/* Financial Summary */}
            <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-2xs space-y-2">
              <div className="flex justify-between text-xs text-zinc-600">
                <span>مجموع المنتجات:</span>
                <span className="font-mono font-bold">{(((selectedOrder.totalAmount || 0) - (selectedOrder.shippingCost || 0)) / 1000).toFixed(3)} د.أ</span>
              </div>
              <div className="flex justify-between text-xs text-zinc-600">
                <span>أجرة التوصيل:</span>
                <span className="font-mono font-bold">{((selectedOrder.shippingCost || 0) / 1000).toFixed(3)} د.أ</span>
              </div>
              <div className="flex justify-between font-black text-sm text-zinc-900 pt-2 border-t border-zinc-100">
                <span>المبلغ الإجمالي المستحق:</span>
                <span className="font-mono text-emerald-700 text-base">{((selectedOrder.totalAmount || 0) / 1000).toFixed(3)} د.أ</span>
              </div>
            </div>

            {/* Quick Status Action Controls - Strictly Isolated to POS */}
            <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-2xs space-y-3">
              <h4 className="text-xs font-black text-zinc-500 uppercase tracking-wider border-b pb-2">
                إجراءات وتغيير حالة الطلب في الكاشير
              </h4>

              {hasManagePermission ? (
                <AdminOrderQuickActions 
                  orderId={selectedOrder.id} 
                  status={selectedOrder.status} 
                  phone={selectedOrder.customerPhone} 
                  reference={selectedOrder.reference} 
                  confirmAction={confirmStorefrontOrder}
                  cancelAction={cancelStorefrontOrder}
                  updateStatusAction={async (id, s) => updatePOSOrderStatus(id, s)} 
                  isPOS={true}
                  onStatusChangeSuccess={(newSt) => {
                    setSelectedOrder((prev: any) => prev ? { ...prev, status: newSt } : null);
                    fetchOrders();
                  }}
                />
              ) : (
                <div className="text-center text-xs text-red-500 bg-red-50 p-2.5 rounded-xl border border-red-200 font-bold">
                  لا تملك صلاحية تعديل حالة الطلب
                </div>
              )}
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
