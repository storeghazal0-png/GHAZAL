'use client';

import React, { useActionState, useEffect, useState, useRef } from 'react';
import { processCheckout } from '@/actions/checkout';
import { filsToDisplay } from '@/lib/money';
import Link from 'next/link';
import { JORDAN_GOVERNORATES_SHIPPING_ZONES } from '@/lib/shipping-zones';
import { evaluateCartRewardsAction, RewardEvaluationResult } from '@/actions/rewards';
import { Sparkles, Gift, Truck, Check, AlertCircle } from 'lucide-react';

export default function CheckoutPage({ params }: { params: Promise<{ locale: string }> }) {
  const resolvedParams = React.use(params);
  const locale = resolvedParams.locale;
  const isAr = locale === 'ar';

  const [state, formAction, isPending] = useActionState(processCheckout, null);
  const [cartItems, setCartItems] = useState<any[]>([]);
  const [mounted, setMounted] = useState(false);
  const [zones, setZones] = useState<any[]>(JORDAN_GOVERNORATES_SHIPPING_ZONES);
  const [selectedZoneId, setSelectedZoneId] = useState<string>(JORDAN_GOVERNORATES_SHIPPING_ZONES[0].id);
  const [isSubmittingLocal, setIsSubmittingLocal] = useState(false);
  const [isCooldownActive, setIsCooldownActive] = useState(false);
  const cooldownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [rewardResult, setRewardResult] = useState<RewardEvaluationResult | null>(null);
  const [selectedGiftId, setSelectedGiftId] = useState<string>('');
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => `CHK-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`);

  // Controlled customer details (prevents accidental data clearing on errors)
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [detailedAddress, setDetailedAddress] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('ghazal_cart') || localStorage.getItem('dahab_cart');
    if (saved) {
      try {
        setCartItems(JSON.parse(saved));
      } catch (e) {}
    }

    // Restore previously entered checkout info so user never has to re-type
    const savedCustomer = localStorage.getItem('ghazal_customer_info');
    if (savedCustomer) {
      try {
        const parsed = JSON.parse(savedCustomer);
        if (parsed.name) setCustomerName(parsed.name);
        if (parsed.phone) setCustomerPhone(parsed.phone);
        if (parsed.address) setDetailedAddress(parsed.address);
      } catch (e) {}
    }
    
    // Fetch shipping zones (all 12 Jordan Governorates)
    fetch('/api/shipping-zones')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.zones && data.zones.length > 0) {
          setZones(data.zones);
          setSelectedZoneId((prev) => {
            const exists = data.zones.some((z: any) => z.id === prev);
            return exists ? prev : data.zones[0].id;
          });
        }
      })
      .catch(console.error);

    setMounted(true);
  }, []);

  // Evaluate dynamic rewards based on active rules in /admin/rewards and system resolution settings
  useEffect(() => {
    if (!mounted || cartItems.length === 0) {
      setRewardResult(null);
      return;
    }

    const subtotal = cartItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    const zone = zones.find(z => z.id === selectedZoneId);
    const zoneFee = zone ? zone.fee : 2000;

    evaluateCartRewardsAction({
      subtotalFils: subtotal,
      shippingFeeFils: zoneFee,
      selectedGiftId: selectedGiftId || undefined
    }).then(res => {
      setRewardResult(res);
      if (res.appliedGift && !selectedGiftId) {
        setSelectedGiftId(res.appliedGift.id);
      }
    }).catch(console.error);
  }, [cartItems, selectedZoneId, selectedGiftId, mounted, zones]);

  useEffect(() => {
    return () => {
      if (cooldownTimerRef.current) {
        clearTimeout(cooldownTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (state?.success) {
      // Clear cart on success to prevent accidental duplicate submission
      localStorage.removeItem('dahab_cart');
      localStorage.removeItem('ghazal_cart');
      setCartItems([]);
      window.dispatchEvent(new Event('cart_updated'));

      // Remember device active order for top bar persistence
      if (state.reference) {
        try {
          localStorage.setItem('ghazal_active_order', JSON.stringify({
            reference: state.reference,
            orderNumber: state.reference.replace('ORD-', ''),
            createdAt: new Date().toISOString()
          }));
          window.dispatchEvent(new Event('ghazal_order_created'));
        } catch (e) {}
      }

      // Redirect directly to Order Confirmation & Invoice page (no automatic WhatsApp redirect)
      window.location.href = `/${locale}/order-success/${state.reference}`;
    } else if (state?.error) {
      setIsSubmittingLocal(false);
      setIsCooldownActive(false);
      if (cooldownTimerRef.current) {
        clearTimeout(cooldownTimerRef.current);
      }
      if (state.field === 'customerName' || state.error.includes('اسم')) {
        setNameError(state.error);
      } else if (state.field === 'customerPhone' || state.error.includes('هاتف')) {
        setPhoneError(state.error);
      }
    }
  }, [state]);

  const removeItem = (index: number) => {
    const updated = [...cartItems];
    updated.splice(index, 1);
    setCartItems(updated);
    localStorage.setItem('ghazal_cart', JSON.stringify(updated));
    localStorage.setItem('dahab_cart', JSON.stringify(updated));
    window.dispatchEvent(new Event('cart_updated'));
  };

  const clearCart = () => {
    setCartItems([]);
    localStorage.removeItem('ghazal_cart');
    localStorage.removeItem('dahab_cart');
    window.dispatchEvent(new Event('cart_updated'));
  };

  const getSubtotal = () => {
    return cartItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);
  };

  const getSelectedZone = () => {
    return zones.find(z => z.id === selectedZoneId);
  };

  const getShippingFee = () => {
    if (rewardResult?.freeShippingApplied) {
      return 0;
    }
    const zone = getSelectedZone();
    if (!zone) return 0;
    const subtotal = getSubtotal();
    if (zone.freeShippingThreshold && subtotal >= zone.freeShippingThreshold) {
      return 0;
    }
    return zone.fee;
  };

  const getGrandTotal = () => {
    const subtotal = getSubtotal();
    const shipping = getShippingFee();
    const discount = rewardResult?.discountAmountFils || 0;
    return Math.max(0, subtotal - discount) + shipping;
  };

  const hasUnverifiedItems = mounted && cartItems.some(item => item.stockStatus === 'UNVERIFIED');

  return (
    <div className="container mx-auto px-6 py-12 bg-white min-h-screen" style={{ backgroundColor: '#ffffff', colorScheme: 'only light' }}>
      <h1 className="text-3xl font-bold font-heading text-[var(--color-charcoal-900)] mb-8">
        {isAr ? 'إتمام الشراء' : 'Checkout'}
      </h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        {/* Delivery Form */}
        <div>
          <form 
            action={formAction} 
            onSubmit={(e) => {
              setNameError(null);
              setPhoneError(null);

              const cleanName = customerName.trim();
              const cleanPhone = customerPhone.trim();
              let hasErr = false;

              if (!cleanName || cleanName.length < 2) {
                setNameError(isAr ? 'يرجى إدخال اسم المستلم (يقبل اسماً واحداً أو كاملاً، حرفين على الأقل)' : 'Please enter recipient name (at least 2 characters)');
                hasErr = true;
              }

              if (!cleanPhone || cleanPhone.length < 8) {
                setPhoneError(isAr ? 'يرجى إدخال رقم هاتف أردني صحيح (مثال: 07XXXXXXXX)' : 'Please enter a valid phone number');
                hasErr = true;
              }

              if (hasErr) {
                e.preventDefault();
                setIsSubmittingLocal(false);
                setIsCooldownActive(false);
                return;
              }

              if (isSubmittingLocal || isPending || isCooldownActive) {
                e.preventDefault();
                return;
              }
              setIsSubmittingLocal(true);
              setIsCooldownActive(true);
              if (cooldownTimerRef.current) {
                clearTimeout(cooldownTimerRef.current);
              }
              cooldownTimerRef.current = setTimeout(() => {
                setIsCooldownActive(false);
                setIsSubmittingLocal(false);
              }, 10000);
            }}
            className="bg-white p-8 rounded-lg shadow-sm border border-[var(--color-ivory-200)]"
          >
            <h2 className="text-xl font-bold text-zinc-900 mb-6">
              {isAr ? 'تفاصيل التوصيل' : 'Delivery Details'}
            </h2>
            
            <div className="space-y-4">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label htmlFor="customerName" className="block text-sm font-bold text-zinc-800">
                    {isAr ? 'الاسم' : 'Name'}
                    <span className="text-red-500 mr-1">*</span>
                  </label>
                  <span className="text-[11px] text-zinc-500 font-normal">
                    {isAr ? '(يقبل اسماً واحداً أو كاملاً)' : '(Single name or full name)'}
                  </span>
                </div>
                <input
                  type="text"
                  id="customerName"
                  name="customerName"
                  value={customerName}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCustomerName(val);
                    if (nameError) setNameError(null);
                    try {
                      localStorage.setItem('ghazal_customer_info', JSON.stringify({
                        name: val,
                        phone: customerPhone,
                        address: detailedAddress
                      }));
                    } catch {}
                  }}
                  required
                  placeholder={isAr ? 'مثال: أحمد أو رغد أو سارة' : 'e.g. Sarah or full name'}
                  className={`w-full border-2 rounded-xl px-4 py-2.5 outline-none transition font-medium text-sm ${
                    nameError 
                      ? 'border-red-500 bg-red-50/30 text-red-900 focus:ring-2 focus:ring-red-400' 
                      : 'border-zinc-300 bg-white focus:border-[#E6007E] focus:ring-2 focus:ring-[#E6007E]/20'
                  }`}
                />
                {nameError && (
                  <div className="flex items-center gap-1.5 mt-1.5 text-xs font-bold text-red-600 animate-fade-in">
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                    <span>{nameError}</span>
                  </div>
                )}
              </div>
              
              <div>
                <label htmlFor="customerPhone" className="block text-sm font-bold text-zinc-800 mb-1">
                  {isAr ? 'رقم الهاتف (الأردن)' : 'Phone Number (Jordan)'}
                  <span className="text-red-500 mr-1">*</span>
                </label>
                <input
                  type="tel"
                  id="customerPhone"
                  name="customerPhone"
                  value={customerPhone}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCustomerPhone(val);
                    if (phoneError) setPhoneError(null);
                    try {
                      localStorage.setItem('ghazal_customer_info', JSON.stringify({
                        name: customerName,
                        phone: val,
                        address: detailedAddress
                      }));
                    } catch {}
                  }}
                  required
                  dir="ltr"
                  placeholder="07XXXXXXXX"
                  className={`w-full border-2 rounded-xl px-4 py-2.5 text-right outline-none transition font-medium text-sm ${
                    phoneError 
                      ? 'border-red-500 bg-red-50/30 text-red-900 focus:ring-2 focus:ring-red-400' 
                      : 'border-zinc-300 bg-white focus:border-[#E6007E] focus:ring-2 focus:ring-[#E6007E]/20'
                  }`}
                />
                {phoneError && (
                  <div className="flex items-center gap-1.5 mt-1.5 text-xs font-bold text-red-600 animate-fade-in">
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                    <span>{phoneError}</span>
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="detailedAddress" className="block text-sm font-bold text-zinc-800 mb-1">
                  {isAr ? 'العنوان التفصيلي' : 'Detailed Address'}
                  <span className="text-red-500 mr-1">*</span>
                </label>
                <textarea
                  id="detailedAddress"
                  name="detailedAddress"
                  value={detailedAddress}
                  onChange={(e) => {
                    const val = e.target.value;
                    setDetailedAddress(val);
                    try {
                      localStorage.setItem('ghazal_customer_info', JSON.stringify({
                        name: customerName,
                        phone: customerPhone,
                        address: val
                      }));
                    } catch {}
                  }}
                  required
                  rows={3}
                  placeholder={isAr ? 'المدينة، الحي، اسم الشارع، رقم البناية أو أي علامة مميزة لتسهيل وصول المندوب...' : 'City, district, street, building number or landmark...'}
                  className="w-full border-2 border-zinc-300 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-[#E6007E]/20 focus:border-[#E6007E] outline-none text-sm transition"
                />
              </div>

              <div>
                <label htmlFor="shippingZoneId" className="block text-sm font-bold text-zinc-900 mb-1.5">
                  {isAr ? 'منطقة ومحافظة التوصيل (جميع محافظات الأردن)' : 'Delivery Governorate (All Jordan)'}
                </label>
                <select
                  id="shippingZoneId"
                  name="shippingZoneId"
                  value={selectedZoneId}
                  onChange={(e) => setSelectedZoneId(e.target.value)}
                  className="w-full border-2 border-zinc-200 rounded-xl px-4 py-2.5 focus:border-[#E6007E] focus:ring-0 outline-none bg-white text-zinc-800 font-bold text-sm transition cursor-pointer"
                >
                  {zones.map((zone) => (
                    <option key={zone.id} value={zone.id} className="py-1">
                      {isAr ? zone.nameAr : zone.nameEn}
                    </option>
                  ))}
                </select>
              </div>

              {/* Hidden payload inputs */}
              <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
              <input type="hidden" name="items" value={JSON.stringify(cartItems)} />
              <input type="hidden" name="appliedRewards" value={JSON.stringify(rewardResult || {})} />
            </div>

            {state?.error && (
              <div className="mt-6 p-4 bg-red-50 text-red-600 rounded text-sm font-bold">
                {state.error}
              </div>
            )}

            {hasUnverifiedItems && (
              <div className="mt-6 p-4 bg-amber-50 text-amber-800 border border-amber-200 rounded text-xs leading-relaxed">
                {isAr 
                  ? 'تنبيه: سلتك تحتوي على عطور تُصنع بالطلب أو بانتظار التحقق من المخزن. قد يتواصل معك فريق العمل لتأكيد الموعد النهائي للتوصيل.'
                  : 'Notice: Your cart contains custom-blended or unverified stock items. Our team will verify availability when processing your request.'}
              </div>
            )}

            <div className="mt-8">
              <button
                type="submit"
                disabled={isPending || isSubmittingLocal || isCooldownActive || cartItems.length === 0}
                className="w-full bg-[#E6007E] hover:bg-[#c2006a] text-white font-black py-4 rounded-xl text-base shadow-lg transition-all active:scale-[0.99] disabled:opacity-50"
              >
                {(isPending || isSubmittingLocal || isCooldownActive) ? (isAr ? 'جاري تسجيل الطلب...' : 'Processing...') : (isAr ? 'تأكيد وإرسال الطلب' : 'Confirm & Submit Order')}
              </button>
            </div>
          </form>
        </div>

        {/* Order Summary */}
        <div>
          <div className="bg-white p-8 rounded-lg border border-[var(--color-ivory-200)] shadow-sm">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-zinc-900">
                {isAr ? 'ملخص الطلب' : 'Order Summary'}
              </h2>
              {cartItems.length > 0 && (
                <button 
                  onClick={clearCart}
                  className="text-sm text-red-500 hover:text-red-700 underline font-bold"
                >
                  {isAr ? 'إفراغ السلة' : 'Empty Cart'}
                </button>
              )}
            </div>
            
            {cartItems.length === 0 ? (
              <div className="text-center py-8 text-zinc-500">
                {isAr ? 'السلة فارغة.' : 'Your cart is empty.'}{' '}
                <Link href={`/${locale}/shop`} className="text-[var(--color-champagne-600)] underline">
                  {isAr ? 'تسوق الآن' : 'Shop now'}
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Rewards Dynamic Banners */}
                {rewardResult?.upgradedGiftNote && (
                  <div className="p-3 bg-gradient-to-r from-pink-500/10 via-purple-500/10 to-pink-500/5 border border-pink-200 rounded-2xl flex items-center gap-2.5 text-xs font-black text-[#E6007E]">
                    <Sparkles className="w-4 h-4 text-[#E6007E] shrink-0" />
                    <span>{rewardResult.upgradedGiftNote}</span>
                  </div>
                )}

                {rewardResult?.freeShippingApplied && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between text-xs font-bold text-emerald-800">
                    <span className="flex items-center gap-2">
                      <Truck className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>{isAr ? 'مبارك! طلبيتكِ مؤهلة للتوصيل المجاني بالكامل 🎉' : 'Congratulations! Free shipping applied 🎉'}</span>
                    </span>
                    <span className="bg-emerald-600 text-white text-[10px] px-2 py-0.5 rounded-md font-black">
                      {isAr ? 'مجاني 0.000 د.أ' : 'FREE'}
                    </span>
                  </div>
                )}

                {/* Purchased Cart Items */}
                {cartItems.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center border-b border-zinc-100 pb-4 gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-12 h-12 rounded-xl bg-zinc-50 border border-zinc-200 overflow-hidden shrink-0 flex items-center justify-center p-0.5">
                        <img 
                          src={item.image || '/logo.png'} 
                          alt={item.name} 
                          className="w-full h-full object-contain"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/logo.png'; }}
                        />
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-bold text-sm text-zinc-900 truncate">{item.name}</h4>
                        <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                          {(item.variantLabel || item.colorName || item.scent || item.shade) && (
                            <span className="text-[10px] font-bold px-2 py-0.5 bg-pink-50 text-[#E6007E] border border-pink-200 rounded-md">
                              {item.variantLabel || [item.scent ? `رائحة: ${item.scent}` : null, item.shade ? `درجة: ${item.shade}` : null, item.colorName].filter(Boolean).join(' - ')}
                            </span>
                          )}
                          <span className="text-xs text-zinc-500 font-medium">
                            {item.size ? `${item.size} × ` : ''}{item.quantity}
                          </span>
                        </div>
                        {item.stockStatus === 'UNVERIFIED' && (
                          <span className="text-amber-600 font-bold block text-[10px] mt-0.5">({isAr ? 'بانتظار تأكيد المخزن' : 'Pending verification'})</span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <span className="font-bold text-sm text-zinc-800">
                        {filsToDisplay(item.price * item.quantity, isAr ? 'ar' : 'en')}
                      </span>
                      <button 
                        onClick={() => removeItem(idx)}
                        className="text-[11px] text-red-400 hover:text-red-600 font-bold"
                        title={isAr ? 'حذف العنصر' : 'Remove item'}
                      >
                        {isAr ? 'حذف' : 'Remove'}
                      </button>
                    </div>
                  </div>
                ))}

                {/* Qualified Free Gifts Display */}
                {rewardResult?.appliedGiftsList && rewardResult.appliedGiftsList.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-zinc-100">
                    <div className="flex items-center gap-1.5 text-xs font-black text-[#E6007E]">
                      <Gift className="w-4 h-4" />
                      <span>{isAr ? `الهدايا المجانية المشمولة مع طلبكِ (${rewardResult.appliedGiftsList.length}):` : `Free Gifts Included (${rewardResult.appliedGiftsList.length}):`}</span>
                    </div>
                    {rewardResult.appliedGiftsList.map((gift) => (
                      <div key={gift.id} className="p-3 bg-pink-50/70 border border-pink-200 rounded-2xl flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {gift.imageUrl ? (
                            <img src={gift.imageUrl} alt={gift.nameAr} className="w-12 h-12 object-contain bg-white rounded-xl border border-pink-200 p-1" />
                          ) : (
                            <div className="w-12 h-12 bg-pink-100 rounded-xl flex items-center justify-center text-lg">🎁</div>
                          )}
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="bg-[#E6007E] text-white text-[10px] font-black px-2 py-0.5 rounded-md">
                                {isAr ? 'هدية مجانية 🎁' : 'Free Gift 🎁'}
                              </span>
                              <h5 className="font-extrabold text-xs text-zinc-900">{isAr ? gift.nameAr : (gift.nameAr || 'Cosmetics Gift')}</h5>
                            </div>
                            <span className="text-[10px] text-zinc-500 font-mono block mt-0.5">
                              {gift.sku} • {isAr ? 'القيمة الأصلية:' : 'Value:'} {filsToDisplay(gift.price, isAr ? 'ar' : 'en')}
                            </span>
                          </div>
                        </div>
                        <div className="text-end">
                          <span className="font-black text-sm text-[#E6007E] block">0.000 د.أ</span>
                          <span className="text-[10px] text-zinc-400 line-through">
                            {filsToDisplay(gift.price, isAr ? 'ar' : 'en')}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Customer Choice Gift Selector (When enabled in /admin/rewards and multiple gifts qualify) */}
                {rewardResult?.settings?.multiGiftResolution === 'CUSTOMER_CHOICE' && rewardResult?.allQualifiedGifts && rewardResult.allQualifiedGifts.length > 1 && (
                  <div className="p-3.5 bg-white border-2 border-pink-200 rounded-2xl space-y-2.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-black text-zinc-900 flex items-center gap-1.5">
                        <Gift className="w-4 h-4 text-[#E6007E]" />
                        <span>{isAr ? 'اختاري هديتكِ المفضلة من الهدايا المؤهلة:' : 'Choose your free gift:'}</span>
                      </label>
                      <span className="text-[10px] text-zinc-400 font-semibold">{isAr ? 'هدية واحدة لكل طلب' : '1 gift per order'}</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {rewardResult.allQualifiedGifts.map((g) => {
                        const isSelected = (selectedGiftId === g.id) || (!selectedGiftId && rewardResult.appliedGift?.id === g.id);
                        return (
                          <button
                            key={g.id}
                            type="button"
                            onClick={() => setSelectedGiftId(g.id)}
                            className={`p-2.5 rounded-xl border text-xs font-bold text-start flex items-center gap-2.5 cursor-pointer transition ${
                              isSelected
                                ? 'border-[#E6007E] bg-pink-50/70 ring-2 ring-[#E6007E]/30 text-zinc-900'
                                : 'border-zinc-200 hover:bg-zinc-50 text-zinc-700'
                            }`}
                          >
                            {g.imageUrl ? (
                              <img src={g.imageUrl} alt={g.nameAr} className="w-10 h-10 rounded-lg object-contain bg-white border border-zinc-200 p-0.5 shrink-0" />
                            ) : (
                              <div className="w-10 h-10 bg-pink-100 rounded-lg flex items-center justify-center text-sm shrink-0">🎁</div>
                            )}
                            <div className="min-w-0 flex-1">
                              <span className="line-clamp-1 block text-xs">{g.nameAr}</span>
                              <span className="text-[10px] text-zinc-400 font-mono block">
                                {filsToDisplay(g.price, isAr ? 'ar' : 'en')}
                              </span>
                            </div>
                            {isSelected && <Check className="w-4 h-4 text-[#E6007E] shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                
                {/* Order Totals Summary */}
                <div className="pt-4 space-y-2 border-t border-zinc-200">
                  <div className="flex justify-between text-zinc-600">
                    <span>{isAr ? 'المجموع الفرعي' : 'Subtotal'}</span>
                    <span>{filsToDisplay(getSubtotal(), isAr ? 'ar' : 'en')}</span>
                  </div>

                  {rewardResult?.discountAmountFils && rewardResult.discountAmountFils > 0 && (
                    <div className="flex justify-between text-rose-600 font-bold">
                      <span>{isAr ? 'خصم المكافأة' : 'Reward Discount'}</span>
                      <span dir="ltr">-{filsToDisplay(rewardResult.discountAmountFils, isAr ? 'ar' : 'en')}</span>
                    </div>
                  )}

                  <div className="flex justify-between text-zinc-600">
                    <span>{isAr ? 'رسوم التوصيل' : 'Shipping Fee'}</span>
                    <span className={getShippingFee() === 0 ? 'text-emerald-700 font-bold' : ''}>
                      {getShippingFee() > 0 
                        ? filsToDisplay(getShippingFee(), isAr ? 'ar' : 'en') 
                        : (isAr ? 'توصيل مجاني 🚚' : 'Free Shipping 🚚')}
                    </span>
                  </div>

                  <div className="flex justify-between text-xl font-bold text-[var(--color-charcoal-900)] pt-2 border-t">
                    <span>{isAr ? 'الإجمالي' : 'Total'}</span>
                    <span>{filsToDisplay(getGrandTotal(), isAr ? 'ar' : 'en')}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
