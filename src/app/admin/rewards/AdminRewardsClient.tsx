'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { 
  Gift, Sparkles, Tag, Plus, Search, Calendar, Percent, CheckCircle2, 
  Edit3, X, RefreshCw, ShoppingBag, Truck, DollarSign, Filter, Trash2, 
  AlertCircle, Check, Clock, ChevronDown, Layers, HelpCircle, Eye,
  ArrowRight, Users, TrendingUp, BarChart3, AlertTriangle,
  Sliders, Settings, Camera
} from 'lucide-react';
import { CameraBarcodeScannerModal } from '@/components/CameraBarcodeScannerModal';
import { 
  RewardRule, 
  RewardScope,
  RewardRedemptionRecord, 
  RewardType, 
  GiftMode, 
  OutOfStockPolicy, 
  SpendCalculationBasis, 
  StackingBehavior,
  RewardSystemSettings,
  MultiGiftResolutionMode,
  FreeShippingStackingMode,
  createOrUpdateRewardRuleAction,
  toggleRewardRuleStatusAction,
  deleteRewardRuleAction,
  getRewardsDashboardDataAction,
  updateRewardSystemSettingsAction,
  reverseRedemptionForOrderAction
} from '@/actions/rewards';
import { SyncedCategory } from '@/actions/categories';

interface ProductItem {
  id: string;
  nameAr: string;
  sku: string;
  barcode?: string;
  barcodes?: string[];
  channel?: string;
  categoryId?: string;
  categoryName?: string;
  categorySlug?: string;
  categoryParentId?: string | null;
  imageUrl?: string;
  price: number;
  costPrice?: number;
  stock: number;
}

interface Props {
  initialTabParam?: string;
  initialData: {
    periodFilter: string;
    rules: RewardRule[];
    redemptions: RewardRedemptionRecord[];
    settings?: RewardSystemSettings;
    kpis: {
      totalRewardSalesFils: number;
      totalDiscountCostFils: number;
      totalGiftCostFils: number;
      totalFreeShippingCostFils: number;
      totalRewardsCostFils: number;
      uniqueBeneficiariesCount: number;
      repeatCustomersCount: number;
      repeatRatePct: number;
      avgBasketWithRewardFils: number;
      netRewardProfitFils: number;
      activeRulesCount: number;
      totalRedemptionsCount: number;
    };
  };
  availableProducts: ProductItem[];
  categories?: SyncedCategory[];
}

const getInitialTab = (param?: string): 'RULES' | 'REDEMPTIONS' => {
  if (!param) return 'RULES';
  const clean = param.toLowerCase().trim();
  if (clean === 'redemptions' || clean === 'redemption' || clean === 'history' || clean === 'records') {
    return 'REDEMPTIONS';
  }
  return 'RULES';
};

export default function AdminRewardsClient({ initialTabParam, initialData, availableProducts, categories = [] }: Props) {
  const [activeTab, setActiveTab] = useState<'RULES' | 'REDEMPTIONS'>(() => getInitialTab(initialTabParam));
  const [data, setData] = useState(initialData);
  const [selectedPeriod, setSelectedPeriod] = useState(initialData.periodFilter);
  const [isRefreshingPeriod, setIsRefreshingPeriod] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Search & Filter for Rules
  const [rulesSearch, setRulesSearch] = useState('');
  const [rulesTypeFilter, setRulesTypeFilter] = useState<string>('ALL');
  const [rulesCategoryFilter, setRulesCategoryFilter] = useState<string>('ALL');

  // Categories & Subcategories State for Modals
  const [discountSelectedCatId, setDiscountSelectedCatId] = useState<string>('ALL');
  const [discountSelectedSubCatId, setDiscountSelectedSubCatId] = useState<string>('ALL');
  const [giftSelectedCatId, setGiftSelectedCatId] = useState<string>('ALL');
  const [giftSelectedSubCatId, setGiftSelectedSubCatId] = useState<string>('ALL');

  // Search & Filter for Redemptions
  const [redemptionsSearch, setRedemptionsSearch] = useState('');
  const [redemptionsRuleFilter, setRedemptionsRuleFilter] = useState('ALL');
  const [redemptionsTypeFilter, setRedemptionsTypeFilter] = useState('ALL');
  const [redemptionsStatusFilter, setRedemptionsStatusFilter] = useState('ALL');

  // Modal State for Rule Creation/Edit
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<RewardRule | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Form Fields
  const [formTitle, setFormTitle] = useState('');
  const [formChannel, setFormChannel] = useState<'ONLINE' | 'POS' | 'BOTH'>('ONLINE');
  const [formRewardType, setFormRewardType] = useState<RewardType>('FREE_GIFT');
  const [formGiftMode, setFormGiftMode] = useState<GiftMode>('FIXED_PRODUCT');
  const [formGiftProductIds, setFormGiftProductIds] = useState<string[]>([]);
  const [formOutOfStockPolicy, setFormOutOfStockPolicy] = useState<OutOfStockPolicy>('AUTO_PAUSE');
  const [formDiscountValue, setFormDiscountValue] = useState('5.000'); // in JOD or %
  const [formMaxDiscount, setFormMaxDiscount] = useState('');
  const [formMinSpend, setFormMinSpend] = useState('35.000'); // in JOD
  const [formSpendBasis, setFormSpendBasis] = useState<SpendCalculationBasis>('ITEMS_BEFORE_DISCOUNT');
  const [formIncludesShipping, setFormIncludesShipping] = useState(false);
  const [formIsStackable, setFormIsStackable] = useState(false);
  const [formPriority, setFormPriority] = useState(1);
  const [formStackingBehavior, setFormStackingBehavior] = useState<StackingBehavior>('APPLY_HIGHEST_ONLY');
  const [formTotalLimit, setFormTotalLimit] = useState('');
  const [formPerCustomerLimit, setFormPerCustomerLimit] = useState('1');
  const [formStartsAt, setFormStartsAt] = useState(() => new Date().toISOString().split('T')[0]);
  const [formEndsAt, setFormEndsAt] = useState(() => new Date(Date.now() + 86400000 * 30).toISOString().split('T')[0]);
  const [formIsActive, setFormIsActive] = useState(true);

  // Gift Product Browser inside Modal
  const [giftPickerSearch, setGiftPickerSearch] = useState('');
  const [isCameraScannerOpen, setIsCameraScannerOpen] = useState(false);

  // Specific Product Discount State inside Modal
  const [formTargetScope, setFormTargetScope] = useState<RewardScope>('ALL_PRODUCTS');
  const [formTargetProductIds, setFormTargetProductIds] = useState<string[]>([]);
  const [discountProductSearch, setDiscountProductSearch] = useState('');
  const [isDiscountCameraScannerOpen, setIsDiscountCameraScannerOpen] = useState(false);
  const [discountScannerFeedback, setDiscountScannerFeedback] = useState<string | null>(null);

  // Selected Order Details View Modal
  const [selectedRedemptionOrder, setSelectedRedemptionOrder] = useState<RewardRedemptionRecord | null>(null);

  // Global Reward System Stacking & Resolution Settings
  const [rewardSettings, setRewardSettings] = useState<RewardSystemSettings>(
    initialData.settings || {
      multiGiftResolution: 'HIGHEST_TIER_ONLY',
      freeShippingStacking: 'ALLOW_WITH_GIFTS',
      allowDiscountWithGift: true,
      minSpendCalculation: 'ITEMS_ONLY'
    }
  );
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsSuccessMessage, setSettingsSuccessMessage] = useState<string | null>(null);

  const handleSaveSettings = async () => {
    setIsSavingSettings(true);
    setSettingsSuccessMessage(null);
    try {
      const res = await updateRewardSystemSettingsAction(rewardSettings);
      if (res.success) {
        setRewardSettings(res.settings);
        setSettingsSuccessMessage('✓ تم حفظ واعتماد إعدادات المفاضلة والمكافآت بنجاح وتفعيلها في المتجر');
        setTimeout(() => setSettingsSuccessMessage(null), 5000);
      }
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء حفظ الإعدادات');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleTabChange = (tab: 'RULES' | 'REDEMPTIONS') => {
    setActiveTab(tab);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', tab === 'REDEMPTIONS' ? 'redemptions' : 'rules');
      url.searchParams.delete('q');
      url.searchParams.delete('view');
      window.history.replaceState(null, '', url.toString());
    }
  };

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab') || params.get('q') || params.get('view');
      if (tabParam) {
        setActiveTab(getInitialTab(tabParam));
      }
    }
  }, []);

  // Period Change
  const handlePeriodChange = async (newPeriod: string) => {
    setSelectedPeriod(newPeriod);
    setIsRefreshingPeriod(true);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('period', newPeriod);
      window.history.replaceState(null, '', url.toString());
    }
    try {
      const refreshed = await getRewardsDashboardDataAction(newPeriod);
      setData(refreshed);
    } finally {
      setIsRefreshingPeriod(false);
    }
  };

  const handleChannelChange = (newChannel: 'ONLINE' | 'POS' | 'BOTH') => {
    setFormChannel(newChannel);
    if (newChannel === 'POS') {
      setFormRewardType('PERCENTAGE_DISCOUNT');
    }
  };

  const handleOpenAddModal = () => {
    setEditingRule(null);
    setFormTitle('');
    setFormChannel('ONLINE');
    setFormRewardType('FREE_GIFT');
    setFormGiftMode('FIXED_PRODUCT');
    const onlineProducts = availableProducts.filter(p => p.channel !== 'POS');
    setFormGiftProductIds(onlineProducts.length > 0 ? [onlineProducts[0].id] : []);
    setFormOutOfStockPolicy('AUTO_PAUSE');
    setFormTargetScope('ALL_PRODUCTS');
    setFormTargetProductIds([]);
    setDiscountProductSearch('');
    setDiscountScannerFeedback(null);
    setDiscountSelectedCatId('ALL');
    setDiscountSelectedSubCatId('ALL');
    setGiftSelectedCatId('ALL');
    setGiftSelectedSubCatId('ALL');
    setFormDiscountValue('5.000');
    setFormMaxDiscount('');
    setFormMinSpend('35.000');
    setFormSpendBasis('ITEMS_BEFORE_DISCOUNT');
    setFormIncludesShipping(false);
    setFormIsStackable(false);
    setFormPriority(data.rules.length + 1);
    setFormStackingBehavior('APPLY_HIGHEST_ONLY');
    setFormTotalLimit('100');
    setFormPerCustomerLimit('1');
    setFormStartsAt(new Date().toISOString().split('T')[0]);
    setFormEndsAt(new Date(Date.now() + 86400000 * 30).toISOString().split('T')[0]);
    setFormIsActive(true);
    setGiftPickerSearch('');
    setErrors({});
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (rule: RewardRule) => {
    setEditingRule(rule);
    setFormTitle(rule.title);
    setFormChannel(rule.channel || 'ONLINE');
    const effectiveRewardType = rule.channel === 'POS' ? 'PERCENTAGE_DISCOUNT' : rule.rewardType;
    setFormRewardType(effectiveRewardType);
    setFormTargetScope(rule.targetScope || 'ALL_PRODUCTS');
    setFormTargetProductIds(rule.targetProductIds || []);
    setDiscountProductSearch('');
    setDiscountScannerFeedback(null);
    setDiscountSelectedCatId('ALL');
    setDiscountSelectedSubCatId('ALL');
    setGiftSelectedCatId('ALL');
    setGiftSelectedSubCatId('ALL');
    setFormGiftMode(rule.giftMode || 'FIXED_PRODUCT');
    setFormGiftProductIds(rule.giftProductIds || []);
    setFormOutOfStockPolicy(rule.outOfStockPolicy || 'AUTO_PAUSE');
    setFormDiscountValue(
      effectiveRewardType === 'PERCENTAGE_DISCOUNT'
        ? rule.discountValue.toString()
        : (rule.discountValue / 1000).toFixed(3)
    );
    setFormMaxDiscount(rule.maxDiscountFils ? (rule.maxDiscountFils / 1000).toFixed(3) : '');
    setFormMinSpend((rule.minSpendFils / 1000).toFixed(3));
    setFormSpendBasis(rule.spendCalculationBasis);
    setFormIncludesShipping(rule.includesShippingInThreshold);
    setFormIsStackable(rule.isStackable);
    setFormPriority(rule.priority);
    setFormStackingBehavior(rule.stackingBehavior);
    setFormTotalLimit(rule.totalUsageLimit ? rule.totalUsageLimit.toString() : '');
    setFormPerCustomerLimit(rule.perCustomerLimit ? rule.perCustomerLimit.toString() : '1');
    setFormStartsAt(rule.startsAt ? rule.startsAt.split('T')[0] : '');
    setFormEndsAt(rule.endsAt ? rule.endsAt.split('T')[0] : '');
    setFormIsActive(rule.isActive);
    setGiftPickerSearch('');
    setErrors({});
    setIsModalOpen(true);
  };

  const validateForm = () => {
    const errs: Record<string, string> = {};
    if (!formTitle.trim()) {
      errs.title = 'عنوان المكافأة مطلوب بشكل إلزامي ليظهر للإدارة والزبائن.';
    }
    const minSpendNum = parseFloat(formMinSpend);
    if (isNaN(minSpendNum) || minSpendNum < 0) {
      errs.minSpend = 'الحد الأدنى لقيمة السلة يجب أن يكون رقماً صحيحاً (د.أ).';
    }
    if (formRewardType === 'FREE_GIFT' && formGiftProductIds.length === 0) {
      errs.giftProducts = 'يرجى اختيار منتج هدية واحد على الأقل.';
    }
    if ((formRewardType === 'FIXED_DISCOUNT' || formRewardType === 'PERCENTAGE_DISCOUNT') && formTargetScope === 'SPECIFIC_PRODUCTS' && formTargetProductIds.length === 0) {
      errs.targetProducts = 'يرجى اختيار أو مسح باركود منتج واحد على الأقل لتطبيق الخصم عليه.';
    }
    if (formRewardType === 'FIXED_DISCOUNT') {
      const disc = parseFloat(formDiscountValue);
      if (isNaN(disc) || disc <= 0) {
        errs.discountValue = 'قيمة الخصم النقدي يجب أن تكون أكبر من 0 د.أ.';
      }
    }
    if (formRewardType === 'PERCENTAGE_DISCOUNT') {
      const pct = parseFloat(formDiscountValue);
      if (isNaN(pct) || pct <= 0 || pct > 100) {
        errs.discountValue = 'نسبة الخصم يجب أن تكون بين 1% و 100%.';
      }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      const minSpendFils = Math.round((parseFloat(formMinSpend) || 0) * 1000);
      let discountVal = 0;
      if (formRewardType === 'PERCENTAGE_DISCOUNT') {
        discountVal = parseFloat(formDiscountValue) || 10;
      } else if (formRewardType === 'FIXED_DISCOUNT') {
        discountVal = Math.round((parseFloat(formDiscountValue) || 0) * 1000);
      }

      const maxDiscountFils = formMaxDiscount ? Math.round((parseFloat(formMaxDiscount) || 0) * 1000) : undefined;
      const totalUsageLimit = formTotalLimit ? parseInt(formTotalLimit) : undefined;
      const perCustomerLimit = formPerCustomerLimit ? parseInt(formPerCustomerLimit) : 1;

      const res = await createOrUpdateRewardRuleAction({
        id: editingRule ? editingRule.id : undefined,
        title: formTitle.trim(),
        channel: formChannel,
        rewardType: formRewardType,
        targetScope: (formRewardType === 'FIXED_DISCOUNT' || formRewardType === 'PERCENTAGE_DISCOUNT') ? formTargetScope : 'ALL_PRODUCTS',
        targetProductIds: (formRewardType === 'FIXED_DISCOUNT' || formRewardType === 'PERCENTAGE_DISCOUNT') && formTargetScope === 'SPECIFIC_PRODUCTS' ? formTargetProductIds : [],
        giftMode: formRewardType === 'FREE_GIFT' ? formGiftMode : undefined,
        giftProductIds: formRewardType === 'FREE_GIFT' ? formGiftProductIds : [],
        outOfStockPolicy: 'AUTO_PAUSE',
        discountValue: discountVal,
        maxDiscountFils,
        minSpendFils,
        spendCalculationBasis: formSpendBasis,
        includesShippingInThreshold: formIncludesShipping,
        isStackable: formIsStackable,
        priority: formPriority,
        stackingBehavior: formStackingBehavior,
        totalUsageLimit,
        perCustomerLimit,
        startsAt: formStartsAt ? new Date(formStartsAt).toISOString() : undefined,
        endsAt: formEndsAt ? new Date(formEndsAt).toISOString() : undefined,
        isActive: formIsActive
      });

      if (res.success && res.rules) {
        setData(prev => ({
          ...prev,
          rules: res.rules
        }));
        setIsModalOpen(false);
      }
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء حفظ قاعدة المكافأة');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleRuleStatus = async (ruleId: string) => {
    const res = await toggleRewardRuleStatusAction(ruleId);
    if (res.success && res.rule) {
      setData(prev => ({
        ...prev,
        rules: prev.rules.map(r => r.id === ruleId ? res.rule! : r)
      }));
    }
  };

  const handleDeleteRule = async (ruleId: string, ruleTitle: string) => {
    if (!window.confirm(`هل أنتِ متأكدة من حذف قاعدة المكافأة "${ruleTitle}" نهائياً؟`)) return;
    const res = await deleteRewardRuleAction(ruleId);
    if (res.success) {
      setData(prev => ({
        ...prev,
        rules: prev.rules.filter(r => r.id !== ruleId)
      }));
    }
  };

  const handleToggleGiftProductId = (prodId: string) => {
    if (formGiftMode === 'FIXED_PRODUCT') {
      setFormGiftProductIds([prodId]);
    } else {
      setFormGiftProductIds(prev =>
        prev.includes(prodId) ? prev.filter(id => id !== prodId) : [...prev, prodId]
      );
    }
  };

  const handleToggleTargetProductId = (prodId: string) => {
    setFormTargetProductIds(prev =>
      prev.includes(prodId) ? prev.filter(id => id !== prodId) : [...prev, prodId]
    );
  };

  // Categories & Subcategories Hierarchy
  const rootCategories = useMemo(() => {
    return (categories || []).filter(c => !c.parentId);
  }, [categories]);

  const subCategoriesMap = useMemo(() => {
    const map: Record<string, SyncedCategory[]> = {};
    (categories || []).forEach(c => {
      if (c.parentId) {
        if (!map[c.parentId]) map[c.parentId] = [];
        map[c.parentId].push(c);
      } else if (c.children && c.children.length > 0) {
        map[c.id] = c.children;
      }
    });
    return map;
  }, [categories]);

  const categoryProductsCountMap = useMemo(() => {
    const map: Record<string, number> = {};
    availableProducts.forEach(p => {
      if (p.categoryId) {
        map[p.categoryId] = (map[p.categoryId] || 0) + 1;
      }
      if (p.categoryParentId) {
        map[p.categoryParentId] = (map[p.categoryParentId] || 0) + 1;
      }
    });
    return map;
  }, [availableProducts]);

  // Filtered Rules
  const filteredRules = useMemo(() => {
    return data.rules.filter(r => {
      const matchSearch = r.title.toLowerCase().includes(rulesSearch.toLowerCase());
      const matchType = rulesTypeFilter === 'ALL' || r.rewardType === rulesTypeFilter;
      
      let matchCat = true;
      if (rulesCategoryFilter !== 'ALL') {
        const catTargetProductIds = new Set(
          availableProducts
            .filter(p => p.categoryId === rulesCategoryFilter || p.categoryParentId === rulesCategoryFilter || p.categorySlug === rulesCategoryFilter)
            .map(p => p.id)
        );
        matchCat = (r.targetProductIds || []).some(id => catTargetProductIds.has(id)) ||
                   (r.targetProductsInfo || []).some(info => catTargetProductIds.has(info.id)) ||
                   (r.giftProductIds || []).some(id => catTargetProductIds.has(id)) ||
                   (r.giftProductsInfo || []).some(info => catTargetProductIds.has(info.id));
      }

      return matchSearch && matchType && matchCat;
    });
  }, [data.rules, rulesSearch, rulesTypeFilter, rulesCategoryFilter, availableProducts]);

  // Filtered Redemptions
  const filteredRedemptions = useMemo(() => {
    return data.redemptions.filter(rdm => {
      const q = redemptionsSearch.trim().toLowerCase();
      const matchSearch = !q || 
        rdm.orderNumber.includes(q) || 
        rdm.customerName.toLowerCase().includes(q) || 
        rdm.customerPhone.includes(q) ||
        rdm.ruleTitle.toLowerCase().includes(q);
      const matchRule = redemptionsRuleFilter === 'ALL' || rdm.ruleId === redemptionsRuleFilter;
      const matchType = redemptionsTypeFilter === 'ALL' || rdm.rewardType === redemptionsTypeFilter;
      const matchStatus = redemptionsStatusFilter === 'ALL' || rdm.orderStatus === redemptionsStatusFilter;
      return matchSearch && matchRule && matchType && matchStatus;
    });
  }, [data.redemptions, redemptionsSearch, redemptionsRuleFilter, redemptionsTypeFilter, redemptionsStatusFilter]);

  // Filtered Gift Products for picker (online only, barcode/variant search support)
  const filteredGiftProducts = useMemo(() => {
    const q = giftPickerSearch.trim().toLowerCase();
    let onlineProducts = availableProducts.filter(p => p.channel !== 'POS');

    // Category / Subcategory Filter
    if (giftSelectedSubCatId !== 'ALL') {
      onlineProducts = onlineProducts.filter(p => 
        p.categoryId === giftSelectedSubCatId || 
        p.categorySlug === giftSelectedSubCatId
      );
    } else if (giftSelectedCatId !== 'ALL') {
      const childIds = new Set((subCategoriesMap[giftSelectedCatId] || []).map(ch => ch.id));
      onlineProducts = onlineProducts.filter(p => 
        p.categoryId === giftSelectedCatId || 
        childIds.has(p.categoryId || '') || 
        p.categoryParentId === giftSelectedCatId ||
        p.categorySlug === giftSelectedCatId
      );
    }

    if (!q) return onlineProducts;
    return onlineProducts.filter(p => {
      const matchName = p.nameAr.toLowerCase().includes(q);
      const matchSku = p.sku.toLowerCase().includes(q);
      const matchBarcode = p.barcode ? p.barcode.toLowerCase().includes(q) : false;
      const matchVariants = p.barcodes ? p.barcodes.some(b => b.toLowerCase().includes(q)) : false;
      return matchName || matchSku || matchBarcode || matchVariants;
    });
  }, [availableProducts, giftPickerSearch, giftSelectedCatId, giftSelectedSubCatId, subCategoriesMap]);

  const handleBarcodeScanned = (scannedBarcode: string) => {
    const code = scannedBarcode.trim().toLowerCase();
    // Find matching online product
    const matched = availableProducts.find(p => {
      if (p.channel === 'POS') return false;
      if (p.sku && p.sku.toLowerCase() === code) return true;
      if (p.barcode && p.barcode.toLowerCase() === code) return true;
      if (p.barcodes && p.barcodes.some(b => b.toLowerCase() === code)) return true;
      return false;
    });

    if (matched) {
      handleToggleGiftProductId(matched.id);
      setGiftPickerSearch(matched.nameAr);
    } else {
      setGiftPickerSearch(scannedBarcode.trim());
    }
    setIsCameraScannerOpen(false);
  };

  // Filtered Products for Product-Specific Discounts (searches across available products according to rule channel)
  const filteredDiscountProducts = useMemo(() => {
    const q = discountProductSearch.trim().toLowerCase();
    let prods = availableProducts;
    if (formChannel === 'POS') {
      prods = availableProducts.filter(p => p.channel !== 'ONLINE');
    } else if (formChannel === 'ONLINE') {
      prods = availableProducts.filter(p => p.channel !== 'POS');
    }

    // Category / Subcategory Filter
    if (discountSelectedSubCatId !== 'ALL') {
      prods = prods.filter(p => 
        p.categoryId === discountSelectedSubCatId || 
        p.categorySlug === discountSelectedSubCatId
      );
    } else if (discountSelectedCatId !== 'ALL') {
      const childIds = new Set((subCategoriesMap[discountSelectedCatId] || []).map(ch => ch.id));
      prods = prods.filter(p => 
        p.categoryId === discountSelectedCatId || 
        childIds.has(p.categoryId || '') || 
        p.categoryParentId === discountSelectedCatId ||
        p.categorySlug === discountSelectedCatId
      );
    }

    if (!q) return prods.slice(0, 100);
    return prods.filter(p => {
      const matchName = p.nameAr.toLowerCase().includes(q);
      const matchSku = p.sku.toLowerCase().includes(q);
      const matchBarcode = p.barcode ? p.barcode.toLowerCase().includes(q) : false;
      const matchVariants = p.barcodes ? p.barcodes.some(b => b.toLowerCase().includes(q)) : false;
      return matchName || matchSku || matchBarcode || matchVariants;
    }).slice(0, 200);
  }, [availableProducts, discountProductSearch, formChannel, discountSelectedCatId, discountSelectedSubCatId, subCategoriesMap]);

  const handleSelectAllFilteredDiscountProducts = () => {
    const idsToAdd = filteredDiscountProducts.map(p => p.id);
    setFormTargetProductIds(prev => Array.from(new Set([...prev, ...idsToAdd])));
  };

  const handleDeselectAllFilteredDiscountProducts = () => {
    const idsToRemove = new Set(filteredDiscountProducts.map(p => p.id));
    setFormTargetProductIds(prev => prev.filter(id => !idsToRemove.has(id)));
  };

  const handleSelectAllFilteredGiftProducts = () => {
    const idsToAdd = filteredGiftProducts.map(p => p.id);
    setFormGiftProductIds(prev => Array.from(new Set([...prev, ...idsToAdd])));
  };

  const handleDeselectAllFilteredGiftProducts = () => {
    const idsToRemove = new Set(filteredGiftProducts.map(p => p.id));
    setFormGiftProductIds(prev => prev.filter(id => !idsToRemove.has(id)));
  };

  // Reusable hierarchical Category and Subcategory filters component
  const renderCategoryFilters = (
    selectedCatId: string,
    onSelectCat: (catId: string) => void,
    selectedSubCatId: string,
    onSelectSubCat: (subCatId: string) => void,
    themeColor: 'pink' | 'amber' = 'pink'
  ) => {
    const activeCat = rootCategories.find(c => c.id === selectedCatId || c.slug === selectedCatId);
    const activeSubCategories = activeCat ? (subCategoriesMap[activeCat.id] || []) : [];

    return (
      <div className="space-y-2 py-1.5 border-b border-zinc-100">
        {/* Level 1: Root Categories Horizontal Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 no-scrollbar text-xs">
          <button
            type="button"
            onClick={() => {
              onSelectCat('ALL');
              onSelectSubCat('ALL');
            }}
            className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition cursor-pointer border shrink-0 ${
              selectedCatId === 'ALL'
                ? 'bg-zinc-900 text-white border-zinc-900 shadow-2xs'
                : 'bg-white hover:bg-zinc-100 text-zinc-700 border-zinc-200'
            }`}
          >
            <span>كافة الأقسام والمجموعات</span>
            <span className="ms-1.5 text-[10px] opacity-75">({availableProducts.length})</span>
          </button>

          {rootCategories.map((cat) => {
            const isSelected = selectedCatId === cat.id || selectedCatId === cat.slug;
            const count = categoryProductsCountMap[cat.id] || cat._count?.products || 0;
            const children = subCategoriesMap[cat.id] || [];
            const hasChildren = children.length > 0;

            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  onSelectCat(cat.id);
                  onSelectSubCat('ALL');
                }}
                className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition cursor-pointer border shrink-0 flex items-center gap-1.5 ${
                  isSelected
                    ? themeColor === 'pink'
                      ? 'bg-[#E6007E] text-white border-[#E6007E] shadow-2xs'
                      : 'bg-amber-600 text-white border-amber-600 shadow-2xs'
                    : 'bg-white hover:bg-zinc-100 text-zinc-700 border-zinc-200'
                }`}
              >
                {cat.imagePath && cat.imagePath !== '/logo.png' && (
                  <img src={cat.imagePath} alt="" className="w-4 h-4 rounded-full object-cover shrink-0" />
                )}
                <span>{cat.name}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isSelected ? 'bg-white/20 text-white' : 'bg-zinc-100 text-zinc-500'}`}>
                  {count}
                </span>
                {hasChildren && (
                  <span className={`text-[9px] px-1.5 py-0.2 rounded-md font-black ${
                    isSelected ? 'bg-white/25 text-white' : 'bg-pink-100 text-[#E6007E]'
                  }`}>
                    {children.length} أقسام فرعية
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Level 2: Subcategories (تظهر كفلاتر للأقسام التي تحتوي أقساماً فرعية) */}
        {activeCat && activeSubCategories.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 ps-2.5 pe-2.5 py-1.5 bg-gradient-to-l from-zinc-50 via-pink-50/40 to-zinc-50 rounded-xl border border-pink-200 text-xs animate-fade-in">
            <span className="text-[11px] font-black text-zinc-700 shrink-0 flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-[#E6007E]" />
              <span>الأقسام الفرعية التابعة لـ ({activeCat.name}):</span>
            </span>

            <button
              type="button"
              onClick={() => onSelectSubCat('ALL')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition cursor-pointer border shrink-0 ${
                selectedSubCatId === 'ALL'
                  ? 'bg-zinc-900 text-white border-zinc-900 shadow-2xs'
                  : 'bg-white hover:bg-zinc-100 text-zinc-700 border-zinc-200'
              }`}
            >
              الكل في {activeCat.name}
            </button>

            {activeSubCategories.map((sub) => {
              const isSubSelected = selectedSubCatId === sub.id || selectedSubCatId === sub.slug;
              const subCount = categoryProductsCountMap[sub.id] || sub._count?.products || 0;

              return (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => onSelectSubCat(sub.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition cursor-pointer border shrink-0 flex items-center gap-1.5 ${
                    isSubSelected
                      ? themeColor === 'pink'
                        ? 'bg-[#E6007E] text-white border-[#E6007E] shadow-2xs'
                        : 'bg-amber-600 text-white border-amber-600 shadow-2xs'
                      : 'bg-white hover:bg-pink-50 text-zinc-700 border-pink-200'
                  }`}
                >
                  <span>{sub.name}</span>
                  <span className={`text-[9px] px-1.5 py-0.2 rounded-full ${isSubSelected ? 'bg-white/20' : 'bg-zinc-100 text-zinc-500'}`}>
                    {subCount}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // Selected Products for Target Discount
  const selectedTargetProducts = useMemo(() => {
    return availableProducts.filter(p => formTargetProductIds.includes(p.id));
  }, [availableProducts, formTargetProductIds]);

  const handleDiscountBarcodeScanned = (scannedBarcode: string) => {
    const code = scannedBarcode.trim().toLowerCase();
    const matched = availableProducts.find(p => {
      if (p.sku && p.sku.toLowerCase() === code) return true;
      if (p.barcode && p.barcode.toLowerCase() === code) return true;
      if (p.barcodes && p.barcodes.some(b => b.toLowerCase() === code)) return true;
      return false;
    });

    if (matched) {
      if (!formTargetProductIds.includes(matched.id)) {
        setFormTargetProductIds(prev => [...prev, matched.id]);
        setDiscountScannerFeedback(`✓ تم إضافة المنتج: ${matched.nameAr}`);
      } else {
        setDiscountScannerFeedback(`! المنتج مضاف مسبقاً: ${matched.nameAr}`);
      }
      setTimeout(() => {
        setIsDiscountCameraScannerOpen(false);
        setDiscountScannerFeedback(null);
      }, 1000);
    } else {
      setDiscountProductSearch(scannedBarcode.trim());
      setDiscountScannerFeedback(`لم يتم العثور على منتج بالباركود: ${scannedBarcode}`);
      setTimeout(() => setDiscountScannerFeedback(null), 3000);
    }
  };

  const formatJOD = (fils: number) => (fils / 1000).toFixed(3) + ' د.أ';

  const getStatusBadge = (status: string, reason: string) => {
    switch (status) {
      case 'ACTIVE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-200" title={reason}>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>نشطة وفعالة</span>
          </span>
        );
      case 'MANUALLY_PAUSED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-zinc-100 text-zinc-700 border border-zinc-300" title={reason}>
            <Clock className="w-3.5 h-3.5 text-zinc-500" />
            <span>متوقفة يدوياً</span>
          </span>
        );
      case 'SCHEDULED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-blue-100 text-blue-800 border border-blue-200" title={reason}>
            <Calendar className="w-3.5 h-3.5 text-blue-600" />
            <span>مجدولة للمستقبل</span>
          </span>
        );
      case 'EXPIRED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-rose-100 text-rose-800 border border-rose-200" title={reason}>
            <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
            <span>منتهية الصلاحية</span>
          </span>
        );
      case 'LIMIT_REACHED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-amber-100 text-amber-800 border border-amber-300" title={reason}>
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            <span>استُنفد حد الاستخدام</span>
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div className="bg-white rounded-3xl border border-zinc-200 p-6 md:p-8 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="p-2.5 rounded-2xl bg-pink-100 text-[#E6007E]">
              <Gift className="w-6 h-6" />
            </span>
            <h1 className="text-2xl font-black text-zinc-900 font-heading">
              إدارة مكافآت السلة وهدايا العملاء (Rewards & Basket Gifts)
            </h1>
          </div>
          <p className="text-xs md:text-sm text-zinc-500 font-medium leading-relaxed max-w-3xl">
            نظام إدارة حوافز سلة الشراء: تخصيص هدايا مجانية عند بلوغ حد إنفاق معين، إعفاء رسوم التوصيل، والخصومات النقدية مع متابعة دقيقة ومستقلة لتكلفة الهدايا وهامش الربحية.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Period Filter Dropdown */}
          <div className="flex items-center gap-2 bg-zinc-50 border border-zinc-200 rounded-2xl p-1.5 px-3">
            <Calendar className="w-4 h-4 text-zinc-500" />
            <span className="text-xs font-bold text-zinc-600">الفترة:</span>
            <select
              value={selectedPeriod}
              onChange={(e) => handlePeriodChange(e.target.value)}
              disabled={isRefreshingPeriod}
              className="bg-transparent text-xs font-black text-zinc-900 outline-none cursor-pointer"
            >
              <option value="LAST_7_DAYS">آخر 7 أيام</option>
              <option value="LAST_30_DAYS">آخر 30 يوماً</option>
              <option value="THIS_MONTH">هذا الشهر الحالي</option>
              <option value="ALL_TIME">كافة الفترات السابقة</option>
            </select>
            {isRefreshingPeriod && <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#E6007E]" />}
          </div>

          <button
            type="button"
            onClick={handleOpenAddModal}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-zinc-900 hover:bg-[#E6007E] text-white font-extrabold text-xs transition shadow-md cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>إنشاء قاعدة مكافأة جديدة</span>
          </button>
        </div>
      </div>

      {/* KPI Cards: Transparent Financials & Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* KPI 1: Reward Sales */}
        <div className="bg-white rounded-3xl border border-zinc-200 p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-zinc-500 mb-2">
            <span className="text-xs font-bold">مبيعات سلات المكافآت</span>
            <ShoppingBag className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="font-mono font-black text-xl text-zinc-900" dir="ltr">
            {formatJOD(data.kpis.totalRewardSalesFils)}
          </div>
          <span className="text-[11px] text-zinc-400 font-semibold mt-1">
            من إجمالي {data.kpis.totalRedemptionsCount} عملية استبدال ناجحة
          </span>
        </div>

        {/* KPI 2: Separation of Discount Cost vs Gift Cost */}
        <div className="bg-white rounded-3xl border border-zinc-200 p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-zinc-500 mb-2">
            <span className="text-xs font-bold">تكلفة المكافآت (مفصولة)</span>
            <Tag className="w-4 h-4 text-pink-600" />
          </div>
          <div className="font-mono font-black text-lg text-rose-600" dir="ltr">
            {formatJOD(data.kpis.totalRewardsCostFils)}
          </div>
          <div className="text-[10px] text-zinc-500 font-bold mt-1 space-y-0.5">
            <div>خصومات نقدية: <span className="font-mono text-zinc-800">{formatJOD(data.kpis.totalDiscountCostFils)}</span></div>
            <div>تكلفة هدايا المنتجات: <span className="font-mono text-zinc-800">{formatJOD(data.kpis.totalGiftCostFils)}</span></div>
          </div>
        </div>

        {/* KPI 3: Unique Beneficiaries & Repeat Orders */}
        <div className="bg-white rounded-3xl border border-zinc-200 p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-zinc-500 mb-2">
            <span className="text-xs font-bold">العميلات والولاء المتكرر</span>
            <Users className="w-4 h-4 text-blue-600" />
          </div>
          <div className="font-mono font-black text-xl text-zinc-900">
            {data.kpis.uniqueBeneficiariesCount} <span className="text-xs font-bold text-zinc-500">عميلة</span>
          </div>
          <div className="text-[11px] text-blue-700 font-bold mt-1 flex items-center justify-between">
            <span>تكرار الشراء:</span>
            <span className="font-mono">{data.kpis.repeatRatePct}% ({data.kpis.repeatCustomersCount} عميلة)</span>
          </div>
        </div>

        {/* KPI 4: AOV with Reward & Net Profitability */}
        <div className="bg-white rounded-3xl border border-zinc-200 p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-zinc-500 mb-2">
            <span className="text-xs font-bold">متوسط السلة وصافي الربح</span>
            <TrendingUp className="w-4 h-4 text-amber-600" />
          </div>
          <div className="font-mono font-black text-xl text-emerald-700" dir="ltr">
            {formatJOD(data.kpis.avgBasketWithRewardFils)}
          </div>
          <div className="text-[11px] text-emerald-800 font-bold mt-1 flex items-center justify-between">
            <span>صافي الربح التقديري:</span>
            <span className="font-mono">{formatJOD(data.kpis.netRewardProfitFils)}</span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-zinc-200 pb-3">
        <button
          type="button"
          onClick={() => handleTabChange('RULES')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs font-black transition cursor-pointer ${
            activeTab === 'RULES'
              ? 'bg-zinc-900 text-white shadow-xs'
              : 'bg-white hover:bg-zinc-100 text-zinc-700 border border-zinc-200'
          }`}
        >
          <Gift className="w-4 h-4 text-pink-400" />
          <span>قواعد وحملات المكافآت ({data.rules.length})</span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('REDEMPTIONS')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs font-black transition cursor-pointer ${
            activeTab === 'REDEMPTIONS'
              ? 'bg-zinc-900 text-white shadow-xs'
              : 'bg-white hover:bg-zinc-100 text-zinc-700 border border-zinc-200'
          }`}
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>سجل الاستبدالات التفصيلي ({data.redemptions.length})</span>
        </button>
      </div>

      {/* ==================================================================== */}
      {/* TAB 1: REWARD RULES LIST                                             */}
      {/* ==================================================================== */}
      {activeTab === 'RULES' && (
        <div className="space-y-4">
          {/* Settings Bar & Collapsible Drawer */}
          <div className="bg-white rounded-3xl border border-zinc-200 p-4 md:p-5 shadow-xs space-y-4">
            <div 
              onClick={() => setIsSettingsOpen(!isSettingsOpen)}
              className="flex items-center justify-between cursor-pointer select-none"
            >
              <div className="flex items-center gap-3">
                <span className="p-2.5 bg-pink-100 text-[#E6007E] rounded-2xl">
                  <Sliders className="w-5 h-5" />
                </span>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-black text-sm text-zinc-900">
                      إعدادات المفاضلة وسلوك السلة (الهدايا المتعددة والشحن المجاني)
                    </h4>
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 font-black px-2.5 py-0.5 rounded-full">
                      {rewardSettings.multiGiftResolution === 'HIGHEST_TIER_ONLY' ? 'الشريحة الأعلى تلقائياً (50 د.أ بدل 35 د.أ)' :
                       rewardSettings.multiGiftResolution === 'CUSTOMER_CHOICE' ? 'اختيار العميلة بالسلة' : 'تجميع كافة الهدايا'}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-500 mt-0.5">
                    التحكم بسياسة اختيار الهدايا المتعددة عند الوصول لأكثر من حد، ودمج التوصيل المجاني مع الهدايا
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-zinc-600 bg-zinc-100 hover:bg-zinc-200 px-3 py-1.5 rounded-xl transition">
                  {isSettingsOpen ? 'إخفاء الإعدادات ▲' : 'تعديل الإعدادات ▼'}
                </span>
              </div>
            </div>

            {isSettingsOpen && (
              <div className="pt-4 border-t border-zinc-100 space-y-5 animate-in fade-in">
                {settingsSuccessMessage && (
                  <div className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-4 py-2.5 rounded-2xl text-xs font-bold flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{settingsSuccessMessage}</span>
                  </div>
                )}

                {/* 1. Multi-Gift Resolution Setting */}
                <div className="space-y-2.5">
                  <h5 className="font-extrabold text-xs text-zinc-900 flex items-center gap-1.5">
                    <span>1. عند استيفاء السلة لأكثر من هدية أو شريحة إنفاق (Multi-Gift Resolution):</span>
                  </h5>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div
                      onClick={() => setRewardSettings(prev => ({ ...prev, multiGiftResolution: 'HIGHEST_TIER_ONLY' }))}
                      className={`p-3.5 rounded-2xl border-2 transition cursor-pointer flex flex-col justify-between space-y-1.5 ${
                        rewardSettings.multiGiftResolution === 'HIGHEST_TIER_ONLY'
                          ? 'border-[#E6007E] bg-pink-50/50 shadow-xs ring-1 ring-[#E6007E]/30'
                          : 'border-zinc-200 hover:border-zinc-300 bg-zinc-50/50'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-black text-xs text-zinc-900 flex items-center gap-1.5">
                            <span className="text-sm">🏆</span>
                            <span>اعتماد الشريحة الأعلى فقط</span>
                          </span>
                          <span className="bg-emerald-100 text-emerald-800 text-[9px] font-black px-1.5 py-0.5 rounded-md">
                            موصى به
                          </span>
                        </div>
                        <p className="text-[10px] text-zinc-600 leading-relaxed">
                          تُمنح العميلة تلقائياً هدية شريحة الـ 50 د.أ وتُستبعد هدية الـ 35 د.أ مع إشعار ترقية.
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 pt-1 text-[10px] font-bold text-[#E6007E]">
                        <span className={`w-3 h-3 rounded-full border flex items-center justify-center ${
                          rewardSettings.multiGiftResolution === 'HIGHEST_TIER_ONLY' ? 'border-[#E6007E] bg-[#E6007E]' : 'border-zinc-400'
                        }`}>
                          {rewardSettings.multiGiftResolution === 'HIGHEST_TIER_ONLY' && <span className="w-1 h-1 rounded-full bg-white" />}
                        </span>
                        <span>{rewardSettings.multiGiftResolution === 'HIGHEST_TIER_ONLY' ? 'مفعل حالياً' : 'تحديد'}</span>
                      </div>
                    </div>

                    <div
                      onClick={() => setRewardSettings(prev => ({ ...prev, multiGiftResolution: 'CUSTOMER_CHOICE' }))}
                      className={`p-3.5 rounded-2xl border-2 transition cursor-pointer flex flex-col justify-between space-y-1.5 ${
                        rewardSettings.multiGiftResolution === 'CUSTOMER_CHOICE'
                          ? 'border-[#E6007E] bg-pink-50/50 shadow-xs ring-1 ring-[#E6007E]/30'
                          : 'border-zinc-200 hover:border-zinc-300 bg-zinc-50/50'
                      }`}
                    >
                      <div className="space-y-1">
                        <span className="font-black text-xs text-zinc-900 flex items-center gap-1.5">
                          <span className="text-sm">✨</span>
                          <span>العميلة تختار هديتها بالسلة</span>
                        </span>
                        <p className="text-[10px] text-zinc-600 leading-relaxed">
                          تظهر كافة الهدايا المؤهلة بالسلة وتختار العميلة هدية واحدة منها.
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 pt-1 text-[10px] font-bold text-[#E6007E]">
                        <span className={`w-3 h-3 rounded-full border flex items-center justify-center ${
                          rewardSettings.multiGiftResolution === 'CUSTOMER_CHOICE' ? 'border-[#E6007E] bg-[#E6007E]' : 'border-zinc-400'
                        }`}>
                          {rewardSettings.multiGiftResolution === 'CUSTOMER_CHOICE' && <span className="w-1 h-1 rounded-full bg-white" />}
                        </span>
                        <span>{rewardSettings.multiGiftResolution === 'CUSTOMER_CHOICE' ? 'مفعل حالياً' : 'تحديد'}</span>
                      </div>
                    </div>

                    <div
                      onClick={() => setRewardSettings(prev => ({ ...prev, multiGiftResolution: 'STACK_ALL_GIFTS' }))}
                      className={`p-3.5 rounded-2xl border-2 transition cursor-pointer flex flex-col justify-between space-y-1.5 ${
                        rewardSettings.multiGiftResolution === 'STACK_ALL_GIFTS'
                          ? 'border-[#E6007E] bg-pink-50/50 shadow-xs ring-1 ring-[#E6007E]/30'
                          : 'border-zinc-200 hover:border-zinc-300 bg-zinc-50/50'
                      }`}
                    >
                      <div className="space-y-1">
                        <span className="font-black text-xs text-zinc-900 flex items-center gap-1.5">
                          <span className="text-sm">🎁</span>
                          <span>تجميع كافة الهدايا (تراكمي)</span>
                        </span>
                        <p className="text-[10px] text-zinc-600 leading-relaxed">
                          تحصل العميلة على هدايا جميع الشرائح المستوفاة معاً في نفس الطلب.
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 pt-1 text-[10px] font-bold text-[#E6007E]">
                        <span className={`w-3 h-3 rounded-full border flex items-center justify-center ${
                          rewardSettings.multiGiftResolution === 'STACK_ALL_GIFTS' ? 'border-[#E6007E] bg-[#E6007E]' : 'border-zinc-400'
                        }`}>
                          {rewardSettings.multiGiftResolution === 'STACK_ALL_GIFTS' && <span className="w-1 h-1 rounded-full bg-white" />}
                        </span>
                        <span>{rewardSettings.multiGiftResolution === 'STACK_ALL_GIFTS' ? 'مفعل حالياً' : 'تحديد'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. Free Shipping Stacking Policy */}
                <div className="space-y-2.5 pt-3 border-t border-zinc-100">
                  <h5 className="font-extrabold text-xs text-zinc-900">
                    2. سياسة دمج التوصيل المجاني مع الهدايا:
                  </h5>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div
                      onClick={() => setRewardSettings(prev => ({ ...prev, freeShippingStacking: 'ALLOW_WITH_GIFTS' }))}
                      className={`p-3.5 rounded-2xl border-2 transition cursor-pointer flex flex-col justify-between space-y-1.5 ${
                        rewardSettings.freeShippingStacking === 'ALLOW_WITH_GIFTS'
                          ? 'border-[#E6007E] bg-pink-50/50 shadow-xs ring-1 ring-[#E6007E]/30'
                          : 'border-zinc-200 hover:border-zinc-300 bg-zinc-50/50'
                      }`}
                    >
                      <div className="space-y-1">
                        <span className="font-black text-xs text-zinc-900 flex items-center gap-1.5">
                          <span>🚚 + 🎁</span>
                          <span>السماح بالدمج (توصيل مجاني + هدية معاً)</span>
                        </span>
                        <p className="text-[10px] text-zinc-600">
                          تُمنح العميلة التوصيل المجاني بالإضافة إلى الهدية دون تعارض.
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 pt-1 text-[10px] font-bold text-[#E6007E]">
                        <span className={`w-3 h-3 rounded-full border flex items-center justify-center ${
                          rewardSettings.freeShippingStacking === 'ALLOW_WITH_GIFTS' ? 'border-[#E6007E] bg-[#E6007E]' : 'border-zinc-400'
                        }`}>
                          {rewardSettings.freeShippingStacking === 'ALLOW_WITH_GIFTS' && <span className="w-1 h-1 rounded-full bg-white" />}
                        </span>
                        <span>{rewardSettings.freeShippingStacking === 'ALLOW_WITH_GIFTS' ? 'مفعل حالياً' : 'تحديد'}</span>
                      </div>
                    </div>

                    <div
                      onClick={() => setRewardSettings(prev => ({ ...prev, freeShippingStacking: 'STANDALONE_ONLY' }))}
                      className={`p-3.5 rounded-2xl border-2 transition cursor-pointer flex flex-col justify-between space-y-1.5 ${
                        rewardSettings.freeShippingStacking === 'STANDALONE_ONLY'
                          ? 'border-[#E6007E] bg-pink-50/50 shadow-xs ring-1 ring-[#E6007E]/30'
                          : 'border-zinc-200 hover:border-zinc-300 bg-zinc-50/50'
                      }`}
                    >
                      <div className="space-y-1">
                        <span className="font-black text-xs text-zinc-900 flex items-center gap-1.5">
                          <span>⚖️</span>
                          <span>مكافأة واحدة فقط (الأعلى قيمة نقدية)</span>
                        </span>
                        <p className="text-[10px] text-zinc-600">
                          تطبيق المكافأة الأكثر توفيراً للعميلة دون الجمع بينهما.
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 pt-1 text-[10px] font-bold text-[#E6007E]">
                        <span className={`w-3 h-3 rounded-full border flex items-center justify-center ${
                          rewardSettings.freeShippingStacking === 'STANDALONE_ONLY' ? 'border-[#E6007E] bg-[#E6007E]' : 'border-zinc-400'
                        }`}>
                          {rewardSettings.freeShippingStacking === 'STANDALONE_ONLY' && <span className="w-1 h-1 rounded-full bg-white" />}
                        </span>
                        <span>{rewardSettings.freeShippingStacking === 'STANDALONE_ONLY' ? 'مفعل حالياً' : 'تحديد'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. Discount with Gift & Spend Basis */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-zinc-100">
                  <div className="bg-zinc-50 p-3 rounded-2xl border border-zinc-200 flex items-center justify-between gap-2">
                    <span className="font-bold text-xs text-zinc-900">
                      دمج الخصم النقدي مع هدايا المنتجات:
                    </span>
                    <button
                      type="button"
                      onClick={() => setRewardSettings(prev => ({ ...prev, allowDiscountWithGift: !prev.allowDiscountWithGift }))}
                      className={`w-11 h-6 flex items-center rounded-full p-1 cursor-pointer transition ${
                        rewardSettings.allowDiscountWithGift ? 'bg-[#E6007E] justify-end' : 'bg-zinc-300 justify-start'
                      }`}
                    >
                      <span className="bg-white w-4 h-4 rounded-full shadow-md" />
                    </button>
                  </div>

                  <div className="bg-zinc-50 p-3 rounded-2xl border border-zinc-200 flex items-center justify-between gap-2">
                    <span className="font-bold text-xs text-zinc-900">
                      احتساب الحد الأدنى للسلة:
                    </span>
                    <div className="flex items-center gap-1 text-[11px]">
                      <button
                        type="button"
                        onClick={() => setRewardSettings(prev => ({ ...prev, minSpendCalculation: 'ITEMS_ONLY' }))}
                        className={`py-1 px-2.5 rounded-lg border font-bold transition cursor-pointer ${
                          rewardSettings.minSpendCalculation === 'ITEMS_ONLY'
                            ? 'bg-zinc-900 text-white border-zinc-900'
                            : 'bg-white text-zinc-700 border-zinc-200'
                        }`}
                      >
                        المنتجات فقط
                      </button>
                      <button
                        type="button"
                        onClick={() => setRewardSettings(prev => ({ ...prev, minSpendCalculation: 'ITEMS_AND_SHIPPING' }))}
                        className={`py-1 px-2.5 rounded-lg border font-bold transition cursor-pointer ${
                          rewardSettings.minSpendCalculation === 'ITEMS_AND_SHIPPING'
                            ? 'bg-zinc-900 text-white border-zinc-900'
                            : 'bg-white text-zinc-700 border-zinc-200'
                        }`}
                      >
                        شامل الشحن
                      </button>
                    </div>
                  </div>
                </div>

                {/* Save Button */}
                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={handleSaveSettings}
                    disabled={isSavingSettings}
                    className="py-2.5 px-6 bg-zinc-900 hover:bg-[#E6007E] text-white font-black text-xs rounded-xl transition shadow-sm flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isSavingSettings ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    )}
                    <span>حفظ واعتماد إعدادات المكافآت</span>
                  </button>
                </div>
              </div>
            )}
          </div>
          {/* Rules Filter Bar */}
          <div className="bg-white rounded-2xl border border-zinc-200 p-4 shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 text-zinc-400 absolute start-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={rulesSearch}
                onChange={(e) => setRulesSearch(e.target.value)}
                placeholder="ابحثي في أسماء القواعد..."
                className="w-full border border-zinc-300 rounded-xl ps-9 pe-3 py-2 text-xs font-bold outline-none focus:border-[#E6007E] bg-white"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-zinc-500">القسم:</span>
                <select
                  value={rulesCategoryFilter}
                  onChange={(e) => setRulesCategoryFilter(e.target.value)}
                  className="border border-zinc-300 rounded-xl px-3 py-2 text-xs font-black text-zinc-800 bg-white outline-none focus:border-[#E6007E]"
                >
                  <option value="ALL">كافة الأقسام والمجموعات</option>
                  {rootCategories.map(cat => {
                    const children = subCategoriesMap[cat.id] || [];
                    return (
                      <React.Fragment key={cat.id}>
                        <option value={cat.id}>📁 {cat.name} ({categoryProductsCountMap[cat.id] || 0})</option>
                        {children.map(sub => (
                          <option key={sub.id} value={sub.id}>
                            &nbsp;&nbsp;&nbsp;↳ {sub.name} ({categoryProductsCountMap[sub.id] || 0})
                          </option>
                        ))}
                      </React.Fragment>
                    );
                  })}
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-zinc-500">نوع المكافأة:</span>
                <select
                  value={rulesTypeFilter}
                  onChange={(e) => setRulesTypeFilter(e.target.value)}
                  className="border border-zinc-300 rounded-xl px-3 py-2 text-xs font-black text-zinc-800 bg-white outline-none focus:border-[#E6007E]"
                >
                  <option value="ALL">كافة الأنواع</option>
                  <option value="FREE_GIFT">منتج هدية مجاني</option>
                  <option value="FREE_SHIPPING">توصيل مجاني</option>
                  <option value="FIXED_DISCOUNT">خصم نقدي مباشر</option>
                  <option value="PERCENTAGE_DISCOUNT">خصم نسبة مئوية %</option>
                </select>
              </div>
            </div>
          </div>

          {/* Rules Cards / Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredRules.map((rule) => {
              const minSpendJOD = (rule.minSpendFils / 1000).toFixed(3);
              return (
                <div 
                  key={rule.id} 
                  className={`bg-white rounded-3xl border transition-all p-6 shadow-xs flex flex-col justify-between space-y-4 ${
                    rule.status === 'ACTIVE' ? 'border-zinc-200 hover:border-pink-300' : 'border-zinc-200/80 bg-zinc-50/50 opacity-90'
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <span className={`p-2.5 rounded-2xl text-base ${
                          rule.rewardType === 'FREE_GIFT' ? 'bg-pink-100 text-[#E6007E]' :
                          rule.rewardType === 'FREE_SHIPPING' ? 'bg-emerald-100 text-emerald-700' :
                          'bg-amber-100 text-amber-800'
                        }`}>
                          {rule.rewardType === 'FREE_GIFT' ? '🎁' : rule.rewardType === 'FREE_SHIPPING' ? '🚚' : '🏷️'}
                        </span>
                        <div>
                          <h3 className="font-extrabold text-sm text-zinc-900 leading-snug">{rule.title}</h3>
                          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-400 font-semibold mt-0.5">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                              rule.channel === 'POS' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                              rule.channel === 'BOTH' ? 'bg-purple-100 text-purple-800 border border-purple-200' :
                              'bg-blue-100 text-blue-800 border border-blue-200'
                            }`}>
                              {rule.channel === 'POS' ? 'محل غزل (POS)' : rule.channel === 'BOTH' ? 'أونلاين + كاشير' : 'المتجر الإلكتروني'}
                            </span>
                            <span>•</span>
                            <span>الأولوية: #{rule.priority}</span>
                            <span>•</span>
                            <span>{rule.isStackable ? 'قابلة للدمج مع مكافآت أخرى' : 'غير قابلة للدمج (حصرية)'}</span>
                          </div>
                        </div>
                      </div>

                      {/* Status Badge */}
                      <div>{getStatusBadge(rule.status, rule.statusReasonAr)}</div>
                    </div>

                    {/* Conditions & Threshold Details */}
                    <div className="bg-zinc-50 rounded-2xl p-3 border border-zinc-200/70 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-zinc-600">الحد الأدنى للسلة:</span>
                        <span className="font-black font-mono text-zinc-900" dir="ltr">{minSpendJOD} د.أ</span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-zinc-500">
                        <span>طريقة احتساب الحد:</span>
                        <span className="font-semibold text-zinc-700">قيمة المنتجات بالسلة</span>
                      </div>
                    </div>

                    {/* Gift or Discount Specific Preview */}
                    {rule.rewardType === 'FREE_GIFT' && (
                      <div className="border border-pink-200 bg-pink-50/40 rounded-2xl p-3 space-y-2">
                        <div className="flex items-center justify-between text-xs font-bold text-[#E6007E]">
                          <span>{rule.giftMode === 'CUSTOMER_CHOICE' ? 'هدايا تختار العميلة منها بالسلة:' : 'المنتج الهدية التلقائي:'}</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {rule.giftProductsInfo.map((p) => (
                            <div key={p.id} className="flex items-center gap-2 bg-white px-2.5 py-1.5 rounded-xl border border-pink-200 text-xs">
                              {p.imageUrl && <img src={p.imageUrl} alt={p.nameAr} className="w-6 h-6 object-contain rounded-md" />}
                              <div>
                                <div className="font-bold text-zinc-900 truncate max-w-[140px]">{p.nameAr}</div>
                                <div className="text-[10px] text-zinc-500 font-mono">
                                  سعر: {(p.price / 1000).toFixed(3)} د.أ | مخزون: {p.stock}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Specific Products Discount Preview */}
                    {(rule.rewardType === 'FIXED_DISCOUNT' || rule.rewardType === 'PERCENTAGE_DISCOUNT') && rule.targetScope === 'SPECIFIC_PRODUCTS' && rule.targetProductsInfo && rule.targetProductsInfo.length > 0 && (
                      <div className="border border-amber-200 bg-amber-50/40 rounded-2xl p-3 space-y-2">
                        <div className="flex items-center justify-between text-xs font-bold text-amber-800">
                          <span className="flex items-center gap-1.5">
                            <Tag className="w-3.5 h-3.5" />
                            <span>منتجات محددة مشمولة بهذا الخصم ({rule.targetProductsInfo.length}):</span>
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {rule.targetProductsInfo.map((p) => (
                            <div key={p.id} className="flex items-center gap-2 bg-white px-2.5 py-1.5 rounded-xl border border-amber-200 text-xs shadow-2xs">
                              {p.imageUrl && <img src={p.imageUrl} alt={p.nameAr} className="w-6 h-6 object-contain rounded-md" />}
                              <div>
                                <div className="font-bold text-zinc-900 truncate max-w-[140px]">{p.nameAr}</div>
                                <div className="text-[10px] text-zinc-500 font-mono">
                                  سعر: {(p.price / 1000).toFixed(3)} د.أ {p.barcode ? `| ${p.barcode}` : ''}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Limits & Usage Bar */}
                    <div className="space-y-1 pt-1 text-xs">
                      <div className="flex items-center justify-between font-bold text-zinc-700">
                        <span>مرات الاستخدام الفعلية:</span>
                        <span className="font-mono text-zinc-900 font-black">
                          {rule.currentUsageCount} {rule.totalUsageLimit ? `/ ${rule.totalUsageLimit}` : '(غير محدود)'}
                        </span>
                      </div>
                      {rule.totalUsageLimit && (
                        <div className="w-full bg-zinc-200 rounded-full h-1.5 overflow-hidden">
                          <div 
                            className="bg-[#E6007E] h-full rounded-full transition-all" 
                            style={{ width: `${Math.min(100, Math.round((rule.currentUsageCount / rule.totalUsageLimit) * 100))}%` }}
                          />
                        </div>
                      )}
                      <div className="text-[10px] text-zinc-400 font-medium">
                        الحد لكل عميلة: {rule.perCustomerLimit || 1} مرة واحدة
                      </div>
                    </div>

                    {/* Inactive Reason Prompt */}
                    {rule.status !== 'ACTIVE' && (
                      <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                        <span>سبب التعطيل: {rule.statusReasonAr}</span>
                      </div>
                    )}
                  </div>

                  {/* Actions Row */}
                  <div className="flex items-center justify-between pt-3 border-t border-zinc-100 text-xs">
                    <button
                      type="button"
                      onClick={() => handleToggleRuleStatus(rule.id)}
                      className={`px-3 py-1.5 rounded-xl font-black transition cursor-pointer ${
                        rule.isActive
                          ? 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700'
                          : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      }`}
                    >
                      {rule.isActive ? 'إيقاف مؤقت' : 'تفعيل القاعدة'}
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(rule)}
                        className="p-1.5 text-zinc-600 hover:text-[#E6007E] hover:bg-pink-50 rounded-lg transition cursor-pointer"
                        title="تعديل شروط القاعدة"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteRule(rule.id, rule.title)}
                        className="p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                        title="حذف القاعدة"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {filteredRules.length === 0 && (
            <div className="bg-white rounded-3xl border border-zinc-200 p-12 text-center text-zinc-400 space-y-2">
              <Gift className="w-12 h-12 text-zinc-300 mx-auto" />
              <p className="font-bold text-zinc-600 text-sm">لا توجد قواعد مكافآت تطابق البحث</p>
              <p className="text-xs">اضغطي على &quot;إنشاء قاعدة مكافأة جديدة&quot; لإطلاق حملة جديدة.</p>
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 2: DETAILED REDEMPTIONS LOG                                      */}
      {/* ==================================================================== */}
      {activeTab === 'REDEMPTIONS' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="bg-white rounded-2xl border border-zinc-200 p-4 shadow-xs grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-zinc-400 absolute start-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={redemptionsSearch}
                onChange={(e) => setRedemptionsSearch(e.target.value)}
                placeholder="رقم الطلب، اسم العميلة، هاتفها..."
                className="w-full border border-zinc-300 rounded-xl ps-9 pe-3 py-2 text-xs font-bold outline-none focus:border-[#E6007E] bg-white"
              />
            </div>

            <select
              value={redemptionsRuleFilter}
              onChange={(e) => setRedemptionsRuleFilter(e.target.value)}
              className="border border-zinc-300 rounded-xl px-3 py-2 text-xs font-bold text-zinc-700 bg-white outline-none focus:border-[#E6007E]"
            >
              <option value="ALL">كافة قواعد المكافآت</option>
              {data.rules.map(r => (
                <option key={r.id} value={r.id}>{r.title}</option>
              ))}
            </select>

            <select
              value={redemptionsTypeFilter}
              onChange={(e) => setRedemptionsTypeFilter(e.target.value)}
              className="border border-zinc-300 rounded-xl px-3 py-2 text-xs font-bold text-zinc-700 bg-white outline-none focus:border-[#E6007E]"
            >
              <option value="ALL">كافة أنواع المكافآت</option>
              <option value="FREE_GIFT">هدايا منتجات</option>
              <option value="FREE_SHIPPING">شحن مجاني</option>
              <option value="FIXED_DISCOUNT">خصم نقدي</option>
              <option value="PERCENTAGE_DISCOUNT">خصم نسبة</option>
            </select>

            <select
              value={redemptionsStatusFilter}
              onChange={(e) => setRedemptionsStatusFilter(e.target.value)}
              className="border border-zinc-300 rounded-xl px-3 py-2 text-xs font-bold text-zinc-700 bg-white outline-none focus:border-[#E6007E]"
            >
              <option value="ALL">كافة حالات الطلبات</option>
              <option value="DELIVERED">تم التوصيل بنجاح</option>
              <option value="IN_TRANSIT">قيد التوصيل</option>
              <option value="PREPARED">جاهز للتوصيل</option>
              <option value="CANCELLED">ملغي ومسترد التكلفة</option>
            </select>
          </div>

          {/* Table */}
          <div className="bg-white rounded-3xl border border-zinc-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-start text-xs">
                <thead className="bg-zinc-50 text-zinc-500 border-b border-zinc-200 font-bold">
                  <tr>
                    <th className="p-4 text-start">رقم الطلب والتاريخ</th>
                    <th className="p-4 text-start">العميلة والتواصل</th>
                    <th className="p-4 text-start">المكافأة المستبدلة</th>
                    <th className="p-4 text-start">قيمة السلة</th>
                    <th className="p-4 text-start">تكلفة الخصم</th>
                    <th className="p-4 text-start">تكلفة الهدية علينا</th>
                    <th className="p-4 text-center">حالة الطلب</th>
                    <th className="p-4 text-center">التفاصيل</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {filteredRedemptions.map((rdm) => (
                    <tr key={rdm.id} className={`hover:bg-zinc-50/50 transition ${rdm.isReversed ? 'bg-rose-50/20 opacity-80' : ''}`}>
                      <td className="p-4">
                        <span className="font-mono font-bold text-zinc-900 block">#{rdm.orderNumber}</span>
                        <span className="text-[11px] text-zinc-400 font-semibold">{new Date(rdm.redeemedAt).toLocaleDateString('ar-JO')}</span>
                      </td>

                      <td className="p-4">
                        <span className="font-bold text-zinc-900 block">{rdm.customerName}</span>
                        <span className="text-[11px] text-zinc-400 font-mono" dir="ltr">{rdm.customerPhone}</span>
                      </td>

                      <td className="p-4">
                        <span className="font-extrabold text-[#E6007E] block">{rdm.rewardDetailAr}</span>
                        <span className="text-[10px] text-zinc-400">{rdm.ruleTitle}</span>
                      </td>

                      <td className="p-4 font-mono font-bold text-zinc-900" dir="ltr">
                        {formatJOD(rdm.basketTotalFils)}
                      </td>

                      <td className="p-4 font-mono font-bold text-rose-600" dir="ltr">
                        {rdm.discountCostFils > 0 ? formatJOD(rdm.discountCostFils) : '—'}
                      </td>

                      <td className="p-4 font-mono font-bold text-amber-700" dir="ltr">
                        {rdm.estimatedGiftCostFils > 0 ? formatJOD(rdm.estimatedGiftCostFils) : '—'}
                      </td>

                      <td className="p-4 text-center">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black ${
                          rdm.orderStatus === 'DELIVERED' ? 'bg-emerald-100 text-emerald-800' :
                          rdm.orderStatus === 'CANCELLED' ? 'bg-rose-100 text-rose-800' :
                          'bg-blue-100 text-blue-800'
                        }`}>
                          {rdm.orderStatus === 'DELIVERED' ? 'مستلم بنجاح ✓' :
                           rdm.orderStatus === 'CANCELLED' ? 'ملغي ومسترد ✕' : 'قيد الشحن'}
                        </span>
                        {rdm.isReversed && (
                          <span className="block text-[9px] text-rose-600 font-bold mt-0.5">عُكست التكلفة للمخزون</span>
                        )}
                      </td>

                      <td className="p-4 text-center">
                        <button
                          type="button"
                          onClick={() => setSelectedRedemptionOrder(rdm)}
                          className="px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded-xl font-bold transition cursor-pointer"
                        >
                          معاينة الطلب
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {filteredRedemptions.length === 0 && (
                <div className="p-12 text-center text-zinc-400">
                  لا توجد استبدالات تطابق معايير الفلترة المحددة.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: CREATE / EDIT REWARD RULE                                     */}
      {/* ==================================================================== */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-4xl w-full border border-zinc-200 p-6 md:p-8 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto" dir="rtl">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-4">
              <div className="flex items-center gap-2.5">
                <span className="p-2.5 bg-pink-100 text-[#E6007E] rounded-2xl">
                  <Gift className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="font-black text-lg text-zinc-900">
                    {editingRule ? 'تعديل شروط قاعدة المكافأة' : 'إنشاء حملة مكافآت سلة جديدة'}
                  </h3>
                  <span className="text-xs text-zinc-500 font-medium">
                    يتم تطبيق المكافأة تلقائياً بالسلة عند مطابقة شروط الإنفاق
                  </span>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 hover:bg-zinc-100 rounded-xl text-zinc-400 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveRule} className="space-y-6 text-xs font-bold text-zinc-700">
              {/* 1. Rule Title */}
              <div>
                <label className="block mb-1.5 text-zinc-900 font-extrabold">عنوان القاعدة والحملة: *</label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="مثال: هدية أحمر شفاه مايبيلين سوبر ستاي عند الشراء بأكثر من 35 د.أ..."
                  className={`w-full border rounded-xl px-3.5 py-2.5 text-sm font-bold outline-none focus:border-[#E6007E] bg-white ${
                    errors.title ? 'border-red-400 bg-red-50/20' : 'border-zinc-300'
                  }`}
                />
                {errors.title && <p className="text-red-600 text-[11px] mt-1">{errors.title}</p>}
              </div>

              {/* 2. Channel Selector */}
              <div>
                <label className="block mb-1.5 text-zinc-900 font-extrabold">قناة تطبيق المكافأة: *</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {[
                    { id: 'ONLINE', label: 'المتجر الإلكتروني', icon: '🌐', desc: 'طلبات الأونلاين والتطبيق' },
                    { id: 'POS', label: 'محل غزل / الكاشير', icon: '🏪', desc: 'نقاط البيع في المعرض (POS)' },
                    { id: 'BOTH', label: 'كلاهما (أونلاين وكاشير)', icon: '✨', desc: 'سارية بالمتجر والمعرض' },
                  ].map((ch) => (
                    <button
                      key={ch.id}
                      type="button"
                      onClick={() => handleChannelChange(ch.id as 'ONLINE' | 'POS' | 'BOTH')}
                      className={`p-3 rounded-2xl border text-center transition flex flex-col items-center justify-center gap-1 cursor-pointer ${
                        formChannel === ch.id
                          ? 'bg-zinc-900 text-white border-zinc-900 shadow-sm ring-2 ring-[#E6007E]/30'
                          : 'bg-zinc-50 hover:bg-zinc-100 text-zinc-700 border-zinc-200'
                      }`}
                    >
                      <span className="text-xl">{ch.icon}</span>
                      <span className="font-extrabold text-xs">{ch.label}</span>
                      <span className={`text-[10px] ${formChannel === ch.id ? 'text-zinc-300' : 'text-zinc-400'}`}>{ch.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 3. Reward Type Selector */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-zinc-900 font-extrabold">نوع المكافأة الممنوحة للعميلة: *</label>
                  {formChannel === 'POS' && (
                    <span className="text-[11px] font-bold text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-lg border border-amber-200">
                      🔒 مقفلة على خصم النسبة المئوية % حصرياً لنقاط البيع والكاشير
                    </span>
                  )}
                </div>
                <div className={`grid gap-2.5 ${formChannel === 'POS' ? 'grid-cols-1 max-w-sm' : 'grid-cols-2 md:grid-cols-4'}`}>
                  {(formChannel === 'POS'
                    ? [{ id: 'PERCENTAGE_DISCOUNT', label: 'خصم نسبة مئوية', icon: '🏷️', desc: 'نسبة خصم مئوية (%) - حصرياً للكاشير' }]
                    : [
                        { id: 'FREE_GIFT', label: 'منتج هدية مجاني', icon: '🎁', desc: 'مستحضر تجميل أو عناية' },
                        { id: 'FREE_SHIPPING', label: 'توصيل مجاني', icon: '🚚', desc: 'إعفاء من رسوم الشحن' },
                        { id: 'FIXED_DISCOUNT', label: 'خصم نقدي مباشر', icon: '💵', desc: 'مبلغ مالي ثابت (د.أ)' },
                        { id: 'PERCENTAGE_DISCOUNT', label: 'خصم نسبة مئوية', icon: '🏷️', desc: 'نسبة خصم مئوية (%)' },
                      ]
                  ).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      disabled={formChannel === 'POS'}
                      onClick={() => setFormRewardType(t.id as RewardType)}
                      className={`p-3 rounded-2xl border text-center transition flex flex-col items-center justify-center gap-1 ${
                        formChannel === 'POS' ? 'cursor-default' : 'cursor-pointer'
                      } ${
                        formRewardType === t.id
                          ? 'bg-zinc-900 text-white border-zinc-900 shadow-sm ring-2 ring-[#E6007E]/30'
                          : 'bg-zinc-50 hover:bg-zinc-100 text-zinc-700 border-zinc-200'
                      }`}
                    >
                      <span className="text-xl">{t.icon}</span>
                      <span className="font-extrabold">{t.label}</span>
                      <span className={`text-[10px] ${formRewardType === t.id ? 'text-zinc-300' : 'text-zinc-400'}`}>{t.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 4. Dynamic Fields based on Type */}

              {/* A. If FREE_GIFT */}
              {formRewardType === 'FREE_GIFT' && (
                <div className="bg-pink-50/50 p-5 rounded-3xl border border-pink-200 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h4 className="font-black text-sm text-[#E6007E] flex items-center gap-1.5">
                        <Gift className="w-4 h-4" />
                        <span>إعدادات واختيار المنتج الهدية:</span>
                      </h4>
                      <p className="text-[11px] text-zinc-500 mt-0.5">
                        حددي ما إذا كانت الهدية منتجاً ثابتاً تلقائياً، أو تختار العميلة هديتها بالسلة من قائمة معينة.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setFormGiftMode('FIXED_PRODUCT')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer ${
                          formGiftMode === 'FIXED_PRODUCT' ? 'bg-[#E6007E] text-white shadow-xs' : 'bg-white text-zinc-700 border border-zinc-200'
                        }`}
                      >
                        منتج هدية ثابت
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormGiftMode('CUSTOMER_CHOICE')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer ${
                          formGiftMode === 'CUSTOMER_CHOICE' ? 'bg-[#E6007E] text-white shadow-xs' : 'bg-white text-zinc-700 border border-zinc-200'
                        }`}
                      >
                        العميلة تختار هديتها
                      </button>
                    </div>
                  </div>

                  {/* Product Search & Picker for Gifts with Camera Barcode Scanner */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-zinc-900 font-bold">
                        اختر المنتجات المؤهلة لتكون هدية ({formGiftProductIds.length} محددة):
                      </label>
                      <span className="text-[10px] text-zinc-400">منتجات الأونلاين المتاحة ({filteredGiftProducts.length})</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <Search className="w-3.5 h-3.5 text-zinc-400 absolute start-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={giftPickerSearch}
                          onChange={(e) => setGiftPickerSearch(e.target.value)}
                          placeholder="ابحثي بالاسم، الكود SKU، أو امسحي الباركود..."
                          className="w-full border border-pink-200 rounded-xl ps-8 pe-8 py-2 text-xs outline-none bg-white font-bold"
                        />
                        {giftPickerSearch && (
                          <button
                            type="button"
                            onClick={() => setGiftPickerSearch('')}
                            className="absolute end-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 p-0.5"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => setIsCameraScannerOpen(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 bg-pink-100 hover:bg-[#E6007E] text-[#E6007E] hover:text-white border border-pink-200 rounded-xl text-xs font-black transition cursor-pointer shrink-0 shadow-xs"
                        title="مسح باركود المنتج بواسطة كاميرا الهاتف أو الكمبيوتر"
                      >
                        <Camera className="w-4 h-4" />
                        <span className="hidden sm:inline">مسح الباركود بالكاميرا</span>
                      </button>
                    </div>

                    {/* Category & Subcategory Filter Bar */}
                    {renderCategoryFilters(
                      giftSelectedCatId,
                      setGiftSelectedCatId,
                      giftSelectedSubCatId,
                      setGiftSelectedSubCatId,
                      'pink'
                    )}

                    {/* Batch Actions for Gifts */}
                    <div className="flex items-center justify-between text-xs pt-1 pb-1">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleSelectAllFilteredGiftProducts}
                          className="px-2.5 py-1 bg-pink-100 hover:bg-pink-200 text-[#E6007E] border border-pink-300 rounded-lg font-bold text-[11px] transition cursor-pointer flex items-center gap-1 shadow-2xs"
                          title="تحديد وإضافة كافة المنتجات الظاهرة حالياً كهدايا مؤهلة"
                        >
                          <Check className="w-3.5 h-3.5 text-[#E6007E]" />
                          <span>تحديد جميع المعروض ({filteredGiftProducts.length})</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleDeselectAllFilteredGiftProducts}
                          className="px-2.5 py-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border border-zinc-200 rounded-lg font-bold text-[11px] transition cursor-pointer"
                        >
                          إلغاء تحديد المعروض
                        </button>
                      </div>

                      <span className="text-[11px] font-bold text-zinc-500 font-mono">
                        معروض: {filteredGiftProducts.length} منتج
                      </span>
                    </div>

                    <div className="max-h-48 overflow-y-auto space-y-1.5 border border-pink-200 bg-white rounded-2xl p-2">
                      {filteredGiftProducts.map((p) => {
                        const isSelected = formGiftProductIds.includes(p.id);
                        return (
                          <div
                            key={p.id}
                            onClick={() => handleToggleGiftProductId(p.id)}
                            className={`flex items-center justify-between p-2 rounded-xl transition cursor-pointer border ${
                              isSelected ? 'bg-pink-50 border-[#E6007E]' : 'hover:bg-zinc-50 border-zinc-100'
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              {p.imageUrl && <img src={p.imageUrl} alt={p.nameAr} className="w-8 h-8 object-contain rounded-lg border border-zinc-200 bg-white" />}
                              <div>
                                <span className="font-bold text-zinc-900 block text-xs">{p.nameAr}</span>
                                <span className="text-[10px] text-zinc-400 font-mono">
                                  {p.sku} {p.barcode ? `| باركود: ${p.barcode}` : ''} | سعر: {(p.price / 1000).toFixed(3)} د.أ
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              <span className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                                p.stock > 10 ? 'bg-emerald-100 text-emerald-800' :
                                p.stock > 0 ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'
                              }`}>
                                {p.stock > 0 ? `متوفر (${p.stock})` : 'متاح للعرض'}
                              </span>

                              <div className={`w-4 h-4 rounded-md border flex items-center justify-center ${
                                isSelected ? 'bg-[#E6007E] border-[#E6007E] text-white' : 'border-zinc-300'
                              }`}>
                                {isSelected && <Check className="w-3 h-3" />}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {errors.giftProducts && <p className="text-red-600 text-[11px]">{errors.giftProducts}</p>}
                  </div>
                </div>
              )}

              {/* B. If FIXED_DISCOUNT or PERCENTAGE_DISCOUNT */}
              {(formRewardType === 'FIXED_DISCOUNT' || formRewardType === 'PERCENTAGE_DISCOUNT') && (
                <div className="bg-amber-50/50 p-5 rounded-3xl border border-amber-200 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block mb-1.5 text-zinc-900 font-bold">
                        {formRewardType === 'FIXED_DISCOUNT' ? 'قيمة الخصم النقدي (د.أ): *' : 'نسبة الخصم المئوية (%): *'}
                      </label>
                      <input
                        type="number"
                        step={formRewardType === 'FIXED_DISCOUNT' ? '0.25' : '1'}
                        required
                        value={formDiscountValue}
                        onChange={(e) => setFormDiscountValue(e.target.value)}
                        placeholder={formRewardType === 'FIXED_DISCOUNT' ? '5.000' : '15'}
                        className={`w-full border rounded-xl px-3 py-2 text-sm font-bold outline-none bg-white font-mono ${
                          errors.discountValue ? 'border-red-400 bg-red-50/20' : 'border-zinc-300'
                        }`}
                      />
                      {errors.discountValue && <p className="text-red-600 text-[11px] mt-1">{errors.discountValue}</p>}
                    </div>

                    {formRewardType === 'PERCENTAGE_DISCOUNT' && (
                      <div>
                        <label className="block mb-1.5 text-zinc-900 font-bold">الحد الأقصى للخصم (د.أ - اختياري):</label>
                        <input
                          type="number"
                          step="0.5"
                          value={formMaxDiscount}
                          onChange={(e) => setFormMaxDiscount(e.target.value)}
                          placeholder="مثال: 10.000 (سقف الخصم)"
                          className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-sm font-bold outline-none bg-white font-mono"
                        />
                        <span className="text-[10px] text-zinc-400 block mt-0.5">اتركيه فارغاً إذا لم ترغبي بوضع سقف</span>
                      </div>
                    )}
                  </div>

                  {/* Target Scope Selection: Basket vs Specific Products */}
                  <div className="pt-3 border-t border-amber-200/80 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="block text-zinc-900 font-extrabold text-xs">
                        نطاق تطبيق الخصم: *
                      </label>
                      <span className="text-[11px] text-amber-900 font-semibold">
                        {formTargetScope === 'ALL_PRODUCTS' ? 'سارٍ على إجمالي السلة' : `مخصص لـ (${formTargetProductIds.length}) منتجات`}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        onClick={() => setFormTargetScope('ALL_PRODUCTS')}
                        className={`p-3 rounded-2xl border text-center transition flex items-center justify-center gap-2 cursor-pointer ${
                          formTargetScope === 'ALL_PRODUCTS'
                            ? 'bg-amber-600 text-white border-amber-600 shadow-xs ring-2 ring-amber-400/30'
                            : 'bg-white hover:bg-amber-100/50 text-zinc-700 border-amber-200'
                        }`}
                      >
                        <ShoppingBag className="w-4 h-4" />
                        <span className="font-extrabold text-xs">خصم عام على كامل السلة</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setFormTargetScope('SPECIFIC_PRODUCTS')}
                        className={`p-3 rounded-2xl border text-center transition flex items-center justify-center gap-2 cursor-pointer ${
                          formTargetScope === 'SPECIFIC_PRODUCTS'
                            ? 'bg-amber-600 text-white border-amber-600 shadow-xs ring-2 ring-amber-400/30'
                            : 'bg-white hover:bg-amber-100/50 text-zinc-700 border-amber-200'
                        }`}
                      >
                        <Tag className="w-4 h-4" />
                        <span className="font-extrabold text-xs">خصم على منتج معين أو عدة منتجات</span>
                      </button>
                    </div>

                    {/* When SPECIFIC_PRODUCTS is selected */}
                    {formTargetScope === 'SPECIFIC_PRODUCTS' && (
                      <div className="bg-white rounded-2xl p-4 border border-amber-200 space-y-3 mt-2">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <span className="font-extrabold text-xs text-zinc-900 block">
                              اختيار أو مسح باركود المنتجات المشمولة بالخصم:
                            </span>
                            <span className="text-[11px] text-zinc-500">
                              امسحي باركود المنتج بالكاميرا أو ابحثي بالاسم لإضافته لقائمة الخصم (للمتجر أو الكاش)
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => setIsDiscountCameraScannerOpen(true)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#E6007E] hover:bg-pink-700 text-white rounded-xl text-xs font-black transition cursor-pointer shadow-xs shrink-0"
                            title="مسح باركود المنتج بواسطة الكاميرا"
                          >
                            <Camera className="w-4 h-4" />
                            <span>مسح الباركود بالكاميرا 📷</span>
                          </button>
                        </div>

                        {/* Scanner feedback message */}
                        {discountScannerFeedback && (
                          <div className="p-2.5 rounded-xl bg-pink-50 border border-pink-200 text-[#E6007E] text-xs font-bold flex items-center gap-1.5">
                            <Sparkles className="w-4 h-4" />
                            <span>{discountScannerFeedback}</span>
                          </div>
                        )}

                        {/* Search Input */}
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 text-zinc-400 absolute start-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={discountProductSearch}
                            onChange={(e) => setDiscountProductSearch(e.target.value)}
                            placeholder="ابحثي باسم المنتج، الباركود، أو الرمز (SKU)..."
                            className="w-full border border-zinc-200 rounded-xl ps-8 pe-8 py-2 text-xs outline-none bg-zinc-50/50 font-bold focus:border-[#E6007E]"
                          />
                          {discountProductSearch && (
                            <button
                              type="button"
                              onClick={() => setDiscountProductSearch('')}
                              className="absolute end-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 p-0.5"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        {/* Selected Products Preview Chips */}
                        {selectedTargetProducts.length > 0 && (
                          <div className="space-y-1.5">
                            <span className="text-[11px] font-extrabold text-emerald-700">
                              ✓ المنتجات المحددة حالياً للخصم ({selectedTargetProducts.length}):
                            </span>
                            <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto p-1.5 border border-emerald-100 rounded-xl bg-emerald-50/20">
                              {selectedTargetProducts.map(p => {
                                const originalFils = p.price;
                                let discountedFils = originalFils;
                                if (formRewardType === 'PERCENTAGE_DISCOUNT') {
                                  const pct = parseFloat(formDiscountValue) || 0;
                                  discountedFils = Math.max(0, originalFils - Math.round(originalFils * (pct / 100)));
                                } else {
                                  const fix = Math.round((parseFloat(formDiscountValue) || 0) * 1000);
                                  discountedFils = Math.max(0, originalFils - fix);
                                }

                                return (
                                  <div
                                    key={p.id}
                                    className="flex items-center gap-2 bg-white px-2.5 py-1.5 rounded-xl border border-emerald-200 text-xs shadow-2xs"
                                  >
                                    <img src={p.imageUrl || '/product-placeholder.png'} alt={p.nameAr} className="w-7 h-7 object-contain rounded-lg border border-zinc-100 bg-white" />
                                    <div>
                                      <span className="font-extrabold text-zinc-900 block max-w-[160px] truncate">{p.nameAr}</span>
                                      <span className="text-[10px] text-zinc-500 font-mono">
                                        <span className="line-through text-zinc-400">{(originalFils / 1000).toFixed(3)}</span>
                                        {' → '}
                                        <span className="text-emerald-700 font-bold">{(discountedFils / 1000).toFixed(3)} د.أ</span>
                                        {p.barcode ? ` | ${p.barcode}` : ''}
                                      </span>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => handleToggleTargetProductId(p.id)}
                                      className="p-1 text-zinc-400 hover:text-red-600 rounded-lg transition cursor-pointer"
                                      title="إزالة من قائمة الخصم"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Category & Subcategory Filter Bar */}
                        {renderCategoryFilters(
                          discountSelectedCatId,
                          setDiscountSelectedCatId,
                          discountSelectedSubCatId,
                          setDiscountSelectedSubCatId,
                          'amber'
                        )}

                        {/* Quick Batch Selection Buttons */}
                        <div className="flex items-center justify-between text-xs pt-1 pb-1">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={handleSelectAllFilteredDiscountProducts}
                              className="px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 rounded-lg font-bold text-[11px] transition cursor-pointer flex items-center gap-1 shadow-2xs"
                              title="تحديد وإضافة كافة المنتجات الظاهرة في هذا القسم للخصم"
                            >
                              <Check className="w-3.5 h-3.5 text-amber-700" />
                              <span>تحديد جميع المعروض ({filteredDiscountProducts.length})</span>
                            </button>

                            <button
                              type="button"
                              onClick={handleDeselectAllFilteredDiscountProducts}
                              className="px-2.5 py-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border border-zinc-200 rounded-lg font-bold text-[11px] transition cursor-pointer"
                              title="إلغاء تحديد كافة المنتجات الظاهرة حالياً"
                            >
                              إلغاء تحديد المعروض
                            </button>
                          </div>
                          
                          <span className="text-[11px] font-bold text-zinc-500 font-mono">
                            معروض: {filteredDiscountProducts.length} منتج
                          </span>
                        </div>

                        {/* Available Products Scrollable List */}
                        <div className="max-h-52 overflow-y-auto space-y-1.5 border border-zinc-200 rounded-2xl p-2 bg-zinc-50/30">
                          {filteredDiscountProducts.map((p) => {
                            const isSelected = formTargetProductIds.includes(p.id);
                            return (
                              <div
                                key={p.id}
                                onClick={() => handleToggleTargetProductId(p.id)}
                                className={`flex items-center justify-between p-2 rounded-xl transition cursor-pointer border ${
                                  isSelected ? 'bg-amber-50/80 border-amber-500 shadow-2xs' : 'hover:bg-white border-zinc-100 bg-white/60'
                                }`}
                              >
                                <div className="flex items-center gap-2.5">
                                  <img src={p.imageUrl || '/product-placeholder.png'} alt={p.nameAr} className="w-8 h-8 object-contain rounded-lg border border-zinc-200 bg-white" />
                                  <div>
                                    <span className="font-bold text-zinc-900 block text-xs">{p.nameAr}</span>
                                    <span className="text-[10px] text-zinc-500 font-mono">
                                      {p.sku} {p.barcode ? `| باركود: ${p.barcode}` : ''} | سعر: {(p.price / 1000).toFixed(3)} د.أ
                                    </span>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2">
                                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                                    p.channel === 'POS' ? 'bg-amber-100 text-amber-800' :
                                    p.channel === 'ONLINE' ? 'bg-blue-100 text-blue-800' :
                                    'bg-purple-100 text-purple-800'
                                  }`}>
                                    {p.channel === 'POS' ? 'كاشير' : p.channel === 'ONLINE' ? 'أونلاين' : 'مشترك'}
                                  </span>

                                  <div className={`w-4 h-4 rounded-md border flex items-center justify-center ${
                                    isSelected ? 'bg-amber-600 border-amber-600 text-white' : 'border-zinc-300'
                                  }`}>
                                    {isSelected && <Check className="w-3 h-3" />}
                                  </div>
                                </div>
                              </div>
                            );
                          })}

                          {filteredDiscountProducts.length === 0 && (
                            <div className="p-6 text-center text-zinc-400 text-xs">
                              لم يتم العثور على أي منتج يطابق عبارة البحث "{discountProductSearch}"
                            </div>
                          )}
                        </div>
                        {errors.targetProducts && <p className="text-red-600 text-[11px]">{errors.targetProducts}</p>}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 5. Minimum Spend Threshold (Simplified directly to cart products value) */}
              <div className="bg-zinc-50 p-5 rounded-3xl border border-zinc-200 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-black text-sm text-zinc-900">الحد الأدنى لقيمة السلة:</h4>
                  <span className="text-xs font-bold text-zinc-500 bg-white px-2.5 py-1 rounded-xl border border-zinc-200">
                    طريقة الاحتساب: قيمة المنتجات بالسلة
                  </span>
                </div>
                <div>
                  <label className="block mb-1.5 text-zinc-900 font-bold">قيمة منتجات السلة المطلوبة (د.أ): *</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    required
                    value={formMinSpend}
                    onChange={(e) => setFormMinSpend(e.target.value)}
                    placeholder="مثال: 35.000"
                    className={`w-full border rounded-xl px-3.5 py-2.5 text-sm font-bold outline-none bg-white font-mono ${
                      errors.minSpend ? 'border-red-400 bg-red-50/20' : 'border-zinc-300'
                    }`}
                  />
                  {errors.minSpend && <p className="text-red-600 text-[11px] mt-1">{errors.minSpend}</p>}
                  <p className="text-[11px] text-zinc-500 font-medium mt-1">
                    يتم احتساب التأهيل تلقائياً فور وصول مجموع منتجات السلة إلى هذا المبلغ أو تجاوزه.
                  </p>
                </div>
              </div>

              {/* 6. Stacking, Priority & Usage Limits */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block mb-1.5 text-zinc-900 font-bold">هل يمكن دمجها مع مكافآت أخرى؟</label>
                  <select
                    value={formIsStackable ? 'YES' : 'NO'}
                    onChange={(e) => setFormIsStackable(e.target.value === 'YES')}
                    className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs font-bold outline-none bg-white"
                  >
                    <option value="NO">غير قابلة للدمج (حصرية)</option>
                    <option value="YES">نعم، تدمج مع مكافآت أخرى</option>
                  </select>
                </div>

                <div>
                  <label className="block mb-1.5 text-zinc-900 font-bold">الأولوية الرقمية (Priority):</label>
                  <input
                    type="number"
                    min="1"
                    value={formPriority}
                    onChange={(e) => setFormPriority(parseInt(e.target.value) || 1)}
                    className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs font-bold outline-none bg-white font-mono"
                  />
                  <span className="text-[10px] text-zinc-400 block mt-0.5">الرقم 1 هو الأسبق بالتطبيق</span>
                </div>

                <div>
                  <label className="block mb-1.5 text-zinc-900 font-bold">الحد لكل عميلة:</label>
                  <input
                    type="number"
                    min="1"
                    value={formPerCustomerLimit}
                    onChange={(e) => setFormPerCustomerLimit(e.target.value)}
                    placeholder="1"
                    className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs font-bold outline-none bg-white font-mono"
                  />
                  <span className="text-[10px] text-zinc-400 block mt-0.5">عدد مرات استفادة العميلة الواحدة</span>
                </div>
              </div>

              {/* 6. Validity Dates & Total Limit */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block mb-1.5 text-zinc-900 font-bold">تاريخ بدء السريان: *</label>
                  <input
                    type="date"
                    required
                    value={formStartsAt}
                    onChange={(e) => setFormStartsAt(e.target.value)}
                    className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs font-bold outline-none bg-white"
                  />
                </div>

                <div>
                  <label className="block mb-1.5 text-zinc-900 font-bold">تاريخ الانتهاء (اختياري):</label>
                  <input
                    type="date"
                    value={formEndsAt}
                    onChange={(e) => setFormEndsAt(e.target.value)}
                    className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs font-bold outline-none bg-white"
                  />
                </div>

                <div>
                  <label className="block mb-1.5 text-zinc-900 font-bold">الحد الإجمالي لكافة الحملة:</label>
                  <input
                    type="number"
                    min="1"
                    value={formTotalLimit}
                    onChange={(e) => setFormTotalLimit(e.target.value)}
                    placeholder="مثال: 100 استبدال"
                    className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs font-bold outline-none bg-white font-mono"
                  />
                </div>
              </div>

              {/* 7. LIVE PREVIEW CARD BEFORE SAVING (المعاينة الموجزة لشروط المكافأة قبل الحفظ) */}
              <div className="border-2 border-dashed border-[#E6007E]/40 bg-pink-50/30 rounded-3xl p-4 md:p-5 space-y-2">
                <div className="flex items-center gap-2 text-[#E6007E] font-black text-xs">
                  <Sparkles className="w-4 h-4" />
                  <span>معاينة شروط المكافأة كما ستظهر وتُحسب فعلياً بالسلة:</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs pt-1">
                  <div className="bg-white p-2.5 rounded-xl border border-pink-100">
                    <span className="text-[10px] text-zinc-400 block font-bold">القناة والحد:</span>
                    <span className="font-black text-zinc-900 font-mono">
                      {formChannel === 'POS' ? 'كاشير (POS)' : formChannel === 'BOTH' ? 'أونلاين + كاشير' : 'المتجر الإلكتروني'} | {formMinSpend || '0.000'} د.أ
                    </span>
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-pink-100">
                    <span className="text-[10px] text-zinc-400 block font-bold">نوع المكافأة:</span>
                    <span className="font-extrabold text-[#E6007E]">
                      {formRewardType === 'FREE_GIFT' ? 'هدية منتج تجميل' :
                       formRewardType === 'FREE_SHIPPING' ? 'توصيل مجاني لكافة المحافظات' :
                       formRewardType === 'FIXED_DISCOUNT' ? `خصم ${formDiscountValue} د.أ` : `خصم ${formDiscountValue}%`}
                    </span>
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-pink-100">
                    <span className="text-[10px] text-zinc-400 block font-bold">الدمج والحد:</span>
                    <span className="font-bold text-zinc-800">
                      {formIsStackable ? 'قابلة للدمج' : 'حصرية'} | {formPerCustomerLimit || 1} لكل عميلة
                    </span>
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-pink-100">
                    <span className="text-[10px] text-zinc-400 block font-bold">فترة السريان:</span>
                    <span className="font-bold text-zinc-800">
                      {formStartsAt || 'الآن'} إلى {formEndsAt || 'مستمر'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center gap-3 pt-4 border-t border-zinc-200">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-3 bg-zinc-900 hover:bg-[#E6007E] text-white font-black text-sm rounded-2xl transition shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  <span>{editingRule ? 'حفظ التعديلات على القاعدة' : 'اعتماد ونشر حملة المكافأة'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-6 py-3 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold rounded-2xl transition cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Camera Barcode Scanner Modal for Gift Selection */}
      <CameraBarcodeScannerModal
        isOpen={isCameraScannerOpen}
        onClose={() => setIsCameraScannerOpen(false)}
        onScan={handleBarcodeScanned}
        title="مسح باركود منتج الهدية بالكاميرا"
      />

      {/* Camera Barcode Scanner Modal for Product Discounts */}
      <CameraBarcodeScannerModal
        isOpen={isDiscountCameraScannerOpen}
        onClose={() => setIsDiscountCameraScannerOpen(false)}
        onScan={handleDiscountBarcodeScanned}
        title="مسح باركود المنتج بالكاميرا لإضافة الخصم (للمتجر أو الكاش)"
      />

      {/* ==================================================================== */}
      {/* MODAL: ORDER DETAILS QUICK VIEW                                      */}
      {/* ==================================================================== */}
      {selectedRedemptionOrder && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full border border-zinc-200 p-6 shadow-2xl space-y-4" dir="rtl">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="p-2 bg-pink-100 text-[#E6007E] rounded-xl">🎁</span>
                <h3 className="font-black text-base text-zinc-900">
                  تفاصيل استبدال المكافأة للطلب #{selectedRedemptionOrder.orderNumber}
                </h3>
              </div>
              <button 
                type="button" 
                onClick={() => setSelectedRedemptionOrder(null)}
                className="p-1 hover:bg-zinc-100 rounded-lg text-zinc-400 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-zinc-50 p-3.5 rounded-2xl border border-zinc-200 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-zinc-500 font-bold">اسم العميلة:</span>
                  <span className="font-black text-zinc-900">{selectedRedemptionOrder.customerName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500 font-bold">رقم الهاتف:</span>
                  <span className="font-mono font-bold text-zinc-900" dir="ltr">{selectedRedemptionOrder.customerPhone}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500 font-bold">تاريخ الاستبدال:</span>
                  <span className="font-bold text-zinc-700">{new Date(selectedRedemptionOrder.redeemedAt).toLocaleString('ar-JO')}</span>
                </div>
              </div>

              <div className="border border-pink-200 bg-pink-50/40 p-3.5 rounded-2xl space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-zinc-500 font-bold">قاعدة المكافأة:</span>
                  <span className="font-bold text-[#E6007E]">{selectedRedemptionOrder.ruleTitle}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500 font-bold">تفاصيل ما حصلت عليه العميلة:</span>
                  <span className="font-black text-zinc-900">{selectedRedemptionOrder.rewardDetailAr}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500 font-bold">قيمة السلة الإجمالية:</span>
                  <span className="font-mono font-black text-zinc-900">{formatJOD(selectedRedemptionOrder.basketTotalFils)}</span>
                </div>
              </div>

              <div className="bg-zinc-50 p-3.5 rounded-2xl border border-zinc-200 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-zinc-500 font-bold">الخصم المالي الفعلي:</span>
                  <span className="font-mono font-bold text-rose-600">{formatJOD(selectedRedemptionOrder.discountCostFils)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500 font-bold">التكلفة التقديرية للهدية علينا:</span>
                  <span className="font-mono font-bold text-amber-700">{formatJOD(selectedRedemptionOrder.estimatedGiftCostFils)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500 font-bold">حالة الطلبية:</span>
                  <span className="font-bold text-zinc-800">{selectedRedemptionOrder.orderStatus}</span>
                </div>
              </div>

              {selectedRedemptionOrder.isReversed && (
                <div className="p-3 bg-red-50 text-red-800 rounded-xl text-[11px] font-bold border border-red-200">
                  تم عكس هذا الاستبدال: {selectedRedemptionOrder.reversalReason}
                </div>
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedRedemptionOrder(null)}
                className="px-5 py-2 bg-zinc-900 text-white font-bold rounded-xl text-xs"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
