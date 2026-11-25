'use client';

import React, { useState, useEffect, useRef, useTransition, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { 
  X, Zap, Barcode, Plus, Search, Tag, Sparkles, ShoppingBag, Trash2, CheckCircle2, 
  Printer, Receipt, RefreshCw, Undo2, Users, Calendar, Phone, CreditCard, Wallet, 
  Banknote, FileText, Check, AlertCircle, Clock, Settings, Keyboard, Volume2, VolumeX,
  Maximize2, Minimize2, Edit3, Save, RotateCcw, Eye, Filter, Wifi, WifiOff,
  CheckCheck, RefreshCcw, HardDrive, ShieldCheck, Layers, Truck
} from 'lucide-react';
import { 
  storeCatalogOffline, 
  getOfflineCatalog, 
  enqueueOfflineSale, 
  getOfflineQueue, 
  removeOfflineSale, 
  updateOfflineSaleStatus, 
  addSaleToLocalHistory, 
  getLocalSalesHistory, 
  OfflineSaleItem 
} from '@/lib/pos-offline-db';
import { BarcodeSvg } from '@/components/BarcodeSvg';
import { 
  processPOSCheckout, 
  getPendingCreditSales, 
  getAllCreditSales,
  searchCreditCustomersAction,
  settleCreditSale, 
  getCustomerCreditBalance,
  settleCustomerCreditDebt,
  getSaleForReturn, 
  processPOSReturn, 
  getSaleDetailsForReceipt,
  getPOSSalesHistory,
  recordCashMovement,
  getLivePOSCatalog,
  quickUpdatePOSProduct,
  getPOSQuickCodesAction,
  savePOSQuickCodesAction
} from '@/actions/pos';
import { createOperatingExpense, createFinancialVoucher } from '@/actions/finance';
import { recordCashierDrawerExpense } from '@/actions/settlements';
import { getAllCustomers, getPrintingSettings, PrintingSettingsRecord } from '@/actions/admin-pos';
import { getPOSActiveEmployees, switchCashierEmployee } from '@/actions/employees';
import { verifyUnlockPassword } from '@/actions/auth';
import ProductMainAccords, { AccordData } from './ProductMainAccords';
import { POSOrdersPanel } from './POSOrdersPanel';

interface ProductNote {
  noteType: string;
  nameAr: string;
  nameEn: string;
}

interface ProductAccord {
  value: number;
  accord: {
    name: string;
    color: string | null;
  };
}

interface ProductVariant {
  id: string;
  size: string;
  shade?: string | null;
  colorName?: string | null;
  colorHex?: string | null;
  barcode?: string | null;
  sku: string;
  price: number;
  costPrice?: number;
  compareAt?: number;
  isActive: boolean;
  usesGlobalPricing: boolean;
}

interface ProductItem {
  id: string;
  nameAr: string;
  nameEn: string;
  sku: string;
  shortDescription: string | null;
  stockStatus: string;
  stockLiters: number;
  originalPriceFils?: number;
  variants: ProductVariant[];
  imageUrl: string | null;
  accords?: AccordData[];
}

interface POSCashierWorkspaceProps {
  products: ProductItem[];
  settings: {
    taxEnabled: boolean;
    taxRate: number;
    pricesIncludeTax: boolean;
    posIdleEnabled?: boolean;
    posIdleTimeoutMinutes?: number;
    posIdleShowClock?: boolean;
    posIdleShowDate?: boolean;
    posIdleRequirePin?: boolean;
    posIdleMessageAr?: string;
    posIdleMessageEn?: string;
    posSessionLifetimeHours?: number;
  };
  initialPrintingSettings?: PrintingSettingsRecord;
  cashierName: string;
  sessionExpiresAt: string;
  hasOrdersViewPermission?: boolean;
  hasOrdersManagePermission?: boolean;
}

export function POSCashierWorkspace({
  products,
  settings,
  initialPrintingSettings,
  cashierName,
  sessionExpiresAt,
  hasOrdersViewPermission = false,
  hasOrdersManagePermission = false
}: POSCashierWorkspaceProps) {
  const [cart, setCart] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CARD' | 'WALLET' | 'CREDIT'>('CASH');
  const [customerName, setCustomerName] = useState('عميل نقدي');
  const [customerPhone, setCustomerPhone] = useState('');
  const [creditDueDate, setCreditDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().split('T')[0];
  });
  const [creditNotes, setCreditNotes] = useState('');
  const [invoiceNotes, setInvoiceNotes] = useState('');
  const [walletRef, setWalletRef] = useState('');
  const [amountTendered, setAmountTendered] = useState<string>('');
  const [discountAmount, setDiscountAmount] = useState<string>('0');
  const [isPending, startTransition] = useTransition();
  const [checkoutResult, setCheckoutResult] = useState<any | null>(null);

  // Invoices & Sales History modal state
  const [isSalesHistoryOpen, setIsSalesHistoryOpen] = useState(false);
  const [salesHistoryList, setSalesHistoryList] = useState<any[]>([]);
  const [salesHistoryEmployees, setSalesHistoryEmployees] = useState<any[]>([]);
  const [salesHistoryFilterDate, setSalesHistoryFilterDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [salesHistoryFilterEmployee, setSalesHistoryFilterEmployee] = useState('ALL');
  const [salesHistoryFilterMethod, setSalesHistoryFilterMethod] = useState('ALL');
  const [salesHistoryFilterSearch, setSalesHistoryFilterSearch] = useState('');
  const [isLoadingSalesHistory, setIsLoadingSalesHistory] = useState(false);

  // Active Cashier & Quick Employee Switcher
  const [activeCashierName, setActiveCashierName] = useState(cashierName || 'كاشير غزل');
  const [isSwitchCashierModalOpen, setIsSwitchCashierModalOpen] = useState(false);
  const [activeEmployeesList, setActiveEmployeesList] = useState<any[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [switchPin, setSwitchPin] = useState<string>('');
  const [isSwitchingEmployee, setIsSwitchingEmployee] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);

  // Receipt Modal state
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [receiptData, setReceiptData] = useState<any | null>(null);

  // Credit / Debt Register modal state
  const [isCreditLedgerOpen, setIsCreditLedgerOpen] = useState(false);
  const [pendingCreditSales, setPendingCreditSales] = useState<any[]>([]);
  const [isLoadingCreditSales, setIsLoadingCreditSales] = useState(false);
  const [settlingSaleId, setSettlingSaleId] = useState<string | null>(null);
  const [customerCreditInfo, setCustomerCreditInfo] = useState<{
    found: boolean;
    totalDebtFils: number;
    pendingCount: number;
    customerName: string;
    customerPhone: string;
    invoices: any[];
    allInvoicesCount?: number;
    hasCreditHistory?: boolean;
    isSettled?: boolean;
  } | null>(null);
  const [creditCustomerSuggestions, setCreditCustomerSuggestions] = useState<any[]>([]);
  const [isSearchingCreditCustomers, setIsSearchingCreditCustomers] = useState(false);
  const [showCreditSuggestions, setShowCreditSuggestions] = useState(false);
  const creditSuggestionsRef = useRef<HTMLDivElement>(null);
  const [showCreditCustomerModal, setShowCreditCustomerModal] = useState(false);
  const [creditStatusFilter, setCreditStatusFilter] = useState<'PENDING_ONLY' | 'ALL'>('PENDING_ONLY');
  const [settleDialogOpen, setSettleDialogOpen] = useState(false);
  const [settlingTarget, setSettlingTarget] = useState<{
    customerIdentifier: string;
    customerName: string;
    customerPhone?: string;
    totalRemainingFils: number;
    saleId?: string;
  } | null>(null);
  const [settleAmountStr, setSettleAmountStr] = useState('');
  const [settlePaymentMethod, setSettlePaymentMethod] = useState<'CASH' | 'CARD' | 'WALLET'>('CASH');
  const [settleNotes, setSettleNotes] = useState('');
  const [isSubmittingSettlement, setIsSubmittingSettlement] = useState(false);
  const [creditFilterSearch, setCreditFilterSearch] = useState('');
  const [creditViewMode, setCreditViewMode] = useState<'CUSTOMERS' | 'INVOICES'>('CUSTOMERS');
  const [expandedCustomerKey, setExpandedCustomerKey] = useState<string | null>(null);

  // Return / Refund modal state
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [returnQuery, setReturnQuery] = useState('');
  const [returnSaleData, setReturnSaleData] = useState<any | null>(null);
  const [returnQuantities, setReturnQuantities] = useState<Record<string, number>>({});
  const [returnMethod, setReturnMethod] = useState<'CASH' | 'CARD'>('CASH');
  const [returnReason, setReturnReason] = useState('إرجاع بموجب فاتورة كاشير');
  const [isSearchingReturn, setIsSearchingReturn] = useState(false);

  // Cash Movement / Expense Drawer Modal State (سحب مصروف مباشر من درج الكاشير)
  const [isCashExpenseModalOpen, setIsCashExpenseModalOpen] = useState(false);
  const [cashExpenseAmountStr, setCashExpenseAmountStr] = useState('');
  const [cashExpenseReason, setCashExpenseReason] = useState('');
  const [cashExpenseBeneficiary, setCashExpenseBeneficiary] = useState('');
  const [isSubmittingCashExpense, setIsSubmittingCashExpense] = useState(false);
  const [cashExpenseError, setCashExpenseError] = useState<string | null>(null);

  // Customer Quick Search / Picker State
  const [isCustomerPickerOpen, setIsCustomerPickerOpen] = useState(false);
  const [customerPickerSearch, setCustomerPickerSearch] = useState('');
  const [customersList, setCustomersList] = useState<any[]>([]);

  // POS Shortcuts & Customizable Terminal Settings
  const DEFAULT_SHORTCUTS = {
    focusScanner: 'F1',
    checkout: 'F2',
    quickCash: 'F3',
    holdOrder: 'F4',
    openReturns: 'F6',
    addCustomItem: 'F7',
    clearCart: 'F8',
    printReceipt: 'F9',
    openSettings: 'F10',
    toggleFullscreen: 'F11',
  };

  const [shortcuts, setShortcuts] = useState<typeof DEFAULT_SHORTCUTS>(DEFAULT_SHORTCUTS);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [settingsActiveTab, setSettingsActiveTab] = useState<'shortcuts' | 'quickcodes' | 'general'>('shortcuts');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [autoPrintEnabled, setAutoPrintEnabled] = useState(false);
  const [editingShortcutKey, setEditingShortcutKey] = useState<keyof typeof DEFAULT_SHORTCUTS | null>(null);
  const [heldCart, setHeldCart] = useState<any[] | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [newQuickName, setNewQuickName] = useState('');
  const [newQuickCode, setNewQuickCode] = useState('');
  const [newQuickPrice, setNewQuickPrice] = useState('1.000');
  const [newQuickColor, setNewQuickColor] = useState('bg-zinc-800 hover:bg-black');
  const [editingQuickCodeIndex, setEditingQuickCodeIndex] = useState<number | null>(null);

  // Mall Fast Scanner Mode state & Shortcodes (Loaded directly from Database)
  const [quickShortcuts, setQuickShortcuts] = useState<{
    code: string;
    name: string;
    price: number;
    label: string;
    color: string;
  }[]>([]);
  const [customPosProducts, setCustomPosProducts] = useState<ProductItem[]>([]);
  const [editingCustomProductId, setEditingCustomProductId] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [offlineQueueCount, setOfflineQueueCount] = useState<number>(0);
  const [offlineQueueList, setOfflineQueueList] = useState<OfflineSaleItem[]>([]);
  const [isOfflineQueueModalOpen, setIsOfflineQueueModalOpen] = useState<boolean>(false);
  const [isSyncingOffline, setIsSyncingOffline] = useState<boolean>(false);
  const [isSyncingWithAdmin, setIsSyncingWithAdmin] = useState<boolean>(false);
  const [cachedCatalog, setCachedCatalog] = useState<ProductItem[]>(products || []);
  const [isAddPosModalOpen, setIsAddPosModalOpen] = useState(false);
  const [posModalMode, setPosModalMode] = useState<'NEW' | 'EDIT'>('NEW');
  const [posProductSearch, setPosProductSearch] = useState('');
  const [isSearchingPosProduct, setIsSearchingPosProduct] = useState(false);
  const [newPosName, setNewPosName] = useState('');
  const [newPosCode, setNewPosCode] = useState('');
  const [newPosPrice, setNewPosPrice] = useState('1.000');
  const [newPosCostPrice, setNewPosCostPrice] = useState('0.000');
  const [newPosCompareAtPrice, setNewPosCompareAtPrice] = useState('');
  const [newPosCategory, setNewPosCategory] = useState('عام');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const newPosBarcodeInputRef = useRef<HTMLInputElement>(null);
  const returnQueryInputRef = useRef<HTMLInputElement>(null);
  const lastScanRef = useRef<{ code: string; timestamp: number }>({ code: '', timestamp: 0 });

  const [printingSettings, setPrintingSettings] = useState<{
    receiptPaperWidth: '80mm' | '58mm';
    showShopLogo: boolean;
    receiptHeader: string;
    receiptFooter: string;
    showBarcodeOnReceipt: boolean;
  }>(() => {
    if (initialPrintingSettings) {
      return {
        receiptPaperWidth: initialPrintingSettings.receiptPaperWidth || '80mm',
        showShopLogo: initialPrintingSettings.showShopLogo !== false,
        receiptHeader: initialPrintingSettings.receiptHeader || 'محل غزل للمكياج والعناية — عين الباشا (شارع القدس)',
        receiptFooter: initialPrintingSettings.receiptFooter || 'شكراً لتسوقكم من محل غزل ❤️\nالبضاعة المباعة تستبدل خلال 3 أيام مع إبراز أصل الفاتورة بحالتها الأصلية.',
        showBarcodeOnReceipt: initialPrintingSettings.showBarcodeOnReceipt !== false
      };
    }
    return {
      receiptPaperWidth: '80mm',
      showShopLogo: true,
      receiptHeader: 'محل غزل للمكياج والعناية — عين الباشا (شارع القدس)',
      receiptFooter: 'شكراً لتسوقكم من محل غزل ❤️\nالبضاعة المباعة تستبدل خلال 3 أيام مع إبراز أصل الفاتورة بحالتها الأصلية.',
      showBarcodeOnReceipt: true
    };
  });

  // 0. Register Service Worker for seamless offline operation (PWA Cache)
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      if (isLocalhost && process.env.NODE_ENV !== 'production') {
        // In local development, unregister service workers and clear browser caches to prevent Turbopack chunk mismatch
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          for (const reg of registrations) {
            reg.unregister();
          }
        });
        if ('caches' in window) {
          caches.keys().then((names) => {
            names.forEach((name) => {
              if (name.startsWith('ghazal-pos-cache')) {
                caches.delete(name);
              }
            });
          });
        }
      } else {
        navigator.serviceWorker.register('/sw-pos.js').catch((err) => {
          console.warn('POS Service Worker registration error:', err);
        });
      }
    }
  }, []);

  // Load custom terminal settings, offline cached catalog and offline queue on mount
  useEffect(() => {
    try {
      const savedShortcuts = localStorage.getItem('ghazal_pos_shortcuts');
      if (savedShortcuts) {
        setShortcuts({ ...DEFAULT_SHORTCUTS, ...JSON.parse(savedShortcuts) });
      }
      // Fetch Authoritative Quick Codes directly from PostgreSQL Database
      getPOSQuickCodesAction().then(dbCodes => {
        if (Array.isArray(dbCodes)) {
          setQuickShortcuts(dbCodes);
          localStorage.setItem('ghazal_pos_quick_codes', JSON.stringify(dbCodes));
        }
      }).catch(err => {
        console.warn('Failed to load POS quick codes from DB:', err);
        const savedCodes = localStorage.getItem('ghazal_pos_quick_codes');
        if (savedCodes) {
          try {
            setQuickShortcuts(JSON.parse(savedCodes));
          } catch {}
        }
      });
      const savedSound = localStorage.getItem('ghazal_pos_sound');
      if (savedSound !== null) {
        setSoundEnabled(savedSound === 'true');
      }
      const savedAutoPrint = localStorage.getItem('ghazal_pos_autoprint');
      if (savedAutoPrint !== null) {
        setAutoPrintEnabled(savedAutoPrint === 'true');
      }
      const savedCustomProducts = localStorage.getItem('ghazal_pos_custom_products');
      if (savedCustomProducts) {
        setCustomPosProducts(JSON.parse(savedCustomProducts));
      }
      const savedCashier = localStorage.getItem('ghazal_current_cashier_name');
      if (savedCashier) {
        setActiveCashierName(savedCashier);
      }
      if (initialPrintingSettings) {
        setPrintingSettings(prev => ({ ...prev, ...initialPrintingSettings }));
        try {
          localStorage.setItem('ghazal_pos_printing_settings', JSON.stringify(initialPrintingSettings));
        } catch (e) {}
      } else {
        const savedPrinting = localStorage.getItem('ghazal_pos_printing_settings');
        if (savedPrinting) {
          try {
            setPrintingSettings(prev => ({ ...prev, ...JSON.parse(savedPrinting) }));
          } catch (e) {}
        }
      }
      localStorage.setItem('ghazal_pos_paired_device', 'true');
    } catch (e) {}

    // Initialize offline queue from IndexedDB
    getOfflineQueue().then((queue) => {
      if (queue && Array.isArray(queue)) {
        setOfflineQueueCount(queue.length);
        setOfflineQueueList(queue);
      }
    });
  }, []);

  // Cache catalog locally via IndexedDB for offline PC performance
  useEffect(() => {
    if (products && products.length > 0) {
      setCachedCatalog(products);
      storeCatalogOffline(products);
    } else {
      getOfflineCatalog().then((stored) => {
        if (stored && stored.length > 0) {
          setCachedCatalog(stored);
        }
      });
    }
  }, [products]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Beep feedback for barcode scanning
  const playBeep = () => {
    if (!soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1760, ctx.currentTime);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.08);
    } catch {}
  };

  // Offline queue synchronization with IndexedDB and server
  const handleSyncOfflineQueue = useCallback(async () => {
    if (isSyncingOffline) return;
    try {
      const queue = await getOfflineQueue();
      if (!queue || queue.length === 0) {
        setOfflineQueueCount(0);
        setOfflineQueueList([]);
        return;
      }

      setIsSyncingOffline(true);
      showToast(`🔄 جارٍ مزامنة ${queue.length} فواتير مسجلة أوفلاين مع السيرفر...`);

      let syncedCount = 0;
      const remaining: OfflineSaleItem[] = [];

      for (const item of queue) {
        try {
          await updateOfflineSaleStatus(item.id, 'SYNCING');

          // Strict 4s timeout per item to avoid hanging if network fluctuates
          const timeoutPromise = new Promise<{ success: false; error: string }>((resolve) =>
            setTimeout(() => resolve({ success: false, error: 'TIMEOUT' }), 4000)
          );

          const res: any = await Promise.race([
            processPOSCheckout(item.payload),
            timeoutPromise
          ]);

          if (res && res.success) {
            syncedCount++;
            await removeOfflineSale(item.id);
            // Reflect authoritative server reference in local history
            try {
              const history = await getLocalSalesHistory();
              const matched = history.find(h => h.id === item.id || h.reference === item.receiptData?.reference);
              if (matched) {
                matched.serverSynced = true;
                matched.serverReference = res.reference;
                matched.saleId = res.saleId;
                await addSaleToLocalHistory(matched);
              }
            } catch (e) {}
          } else if (res && (res.conflict || (res.error && (res.error.includes('تعارض') || res.error.includes('conflict') || res.error.includes('غير متوفر') || res.error.includes('ملغي'))))) {
            const conflictMsg = res.error || 'تعارض في بيانات الفاتورة أو توفر الأصناف';
            await updateOfflineSaleStatus(item.id, 'CONFLICT', conflictMsg, conflictMsg);
            remaining.push({ ...item, syncStatus: 'CONFLICT', lastError: conflictMsg, conflictReason: conflictMsg });
          } else {
            await updateOfflineSaleStatus(item.id, 'FAILED', res?.error || 'Server error');
            remaining.push({ ...item, syncStatus: 'FAILED', lastError: res?.error || 'Server error' });
          }
        } catch (e: any) {
          await updateOfflineSaleStatus(item.id, 'FAILED', e?.message || 'Network error');
          remaining.push(item);
        }
      }

      setOfflineQueueCount(remaining.length);
      setOfflineQueueList(remaining);

      if (syncedCount > 0) {
        showToast(`✅ تمت مزامنة ${syncedCount} فواتير بنجاح مع السيرفر المركزي`);
      }
      if (remaining.length > 0 && syncedCount === 0) {
        showToast(`⚠️ تعذر مزامنة الفواتير حالياً؛ بقيت ${remaining.length} فواتير محفوظة بأمان وستعاد المحاولة تلقائياً`);
      }
    } catch (e) {
      console.error('Error syncing offline queue:', e);
    } finally {
      setIsSyncingOffline(false);
    }
  }, [isSyncingOffline]);

  // Dual-Layer Online / Offline Connectivity Sentinel with Active Heartbeat Ping
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let isMounted = true;

    const checkConnectivity = async () => {
      if (!navigator.onLine) {
        if (isMounted) setIsOnline(false);
        return;
      }

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        const res = await fetch('/api/pos/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ping: true }),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          if (isMounted) {
            setIsOnline((prev) => {
              if (!prev) {
                showToast('🟢 تم استعادة الاتصال بالسيرفر المركزي - جاري مزامنة الفواتير تلقائياً...');
                handleSyncOfflineQueue();
              }
              return true;
            });
          }
        } else {
          if (isMounted) setIsOnline(false);
        }
      } catch {
        if (isMounted) setIsOnline(false);
      }
    };

    // Run immediately and periodically every 12 seconds
    checkConnectivity();
    const interval = setInterval(checkConnectivity, 12000);

    const handleWindowOnline = () => {
      checkConnectivity();
    };
    const handleWindowOffline = () => {
      setIsOnline(false);
      showToast('🔴 انقطع الاتصال بالإنترنت - يتم حفظ الفواتير تلقائياً دون أي توقف');
    };

    window.addEventListener('online', handleWindowOnline);
    window.addEventListener('offline', handleWindowOffline);

    return () => {
      isMounted = false;
      clearInterval(interval);
      window.removeEventListener('online', handleWindowOnline);
      window.removeEventListener('offline', handleWindowOffline);
    };
  }, [handleSyncOfflineQueue]);

  // Live synchronization with Admin edits (products, prices, visibility, and printing settings)
  const refreshCatalogFromAdmin = useCallback(async (silent = false) => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    if (!silent) setIsSyncingWithAdmin(true);
    try {
      const [res, printRes] = await Promise.all([
        getLivePOSCatalog(),
        getPrintingSettings().catch(() => null)
      ]);
      if (res && res.success && Array.isArray(res.products)) {
        setCachedCatalog(res.products);
        try {
          localStorage.setItem('ghazal_pos_cached_catalog', JSON.stringify(res.products));
        } catch (e) {}
      }
      if (printRes) {
        setPrintingSettings(prev => ({ ...prev, ...printRes }));
        try {
          localStorage.setItem('ghazal_pos_printing_settings', JSON.stringify(printRes));
        } catch (e) {}
      }
      if (!silent) {
        showToast('تم تحديث الأصناف وإعدادات الطباعة المتوافقة مع الإدارة بنجاح');
      }
    } catch (err) {
      console.error('Error syncing catalog from admin:', err);
    } finally {
      if (!silent) setIsSyncingWithAdmin(false);
    }
  }, []);

  // Periodic and tab focus sync with Admin
  useEffect(() => {
    const handleFocus = () => {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        refreshCatalogFromAdmin(true);
      }
    };

    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible' && navigator.onLine) {
        refreshCatalogFromAdmin(true);
      }
    }, 20000);

    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
      clearInterval(interval);
    };
  }, [refreshCatalogFromAdmin]);

  // Focus search input on mount for immediate scanning
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // Hold / Recall Order (F4)
  const handleHoldRecallCart = () => {
    if (cart.length > 0) {
      setHeldCart(cart);
      setCart([]);
      showToast('تم تعليق الفاتورة بنجاح. اضغط F4 مجدداً لاسترجاعها');
      playBeep();
    } else if (heldCart && heldCart.length > 0) {
      setCart(heldCart);
      setHeldCart(null);
      showToast('تم استرجاع الفاتورة المعلقة بنجاح');
      playBeep();
    } else {
      showToast('لا توجد عناصر بالسلة لتعليقها ولا توجد فاتورة معلقة');
    }
  };

  // Quick Cash Checkout (F3)
  const handleQuickCashCheckout = () => {
    if (cart.length === 0) {
      showToast('السلة فارغة، يرجى مسح أصناف أولاً');
      return;
    }
    setPaymentMethod('CASH');
    setAmountTendered('');
    handleCheckout();
  };

  // Mobile navigation tab: 'catalog' or 'cart'
  const [mobileTab, setMobileTab] = useState<'catalog' | 'cart'>('catalog');

  // Idle and Session state
  const [isIdle, setIsIdle] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [sessionTimeLeft, setSessionTimeLeft] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<string>('');
  const [currentDate, setCurrentDate] = useState<string>('');

  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);

  const { 
    taxEnabled, 
    taxRate, 
    pricesIncludeTax, 
    posIdleEnabled = true,
    posIdleTimeoutMinutes = 1,
    posIdleShowClock = true,
    posIdleShowDate = true,
    posIdleRequirePin = false,
    posIdleMessageAr = 'انقر للمتابعة',
    posIdleMessageEn = 'Click to continue',
    posSessionLifetimeHours = 15
  } = settings;

  // Initialize BroadCast Channel for Multi-Tab session sync
  useEffect(() => {
    const channel = new BroadcastChannel('pos_session_sync');
    broadcastChannelRef.current = channel;

    channel.onmessage = (event) => {
      if (event.data === 'LOCK') {
        setIsLocked(true);
      } else if (event.data === 'UNLOCK') {
        setIsLocked(false);
      } else if (event.data === 'LOGOUT') {
        window.location.href = '/pos/login';
      }
    };

    return () => {
      channel.close();
    };
  }, []);

  const handleLogoutAction = () => {
    broadcastChannelRef.current?.postMessage('LOGOUT');
    window.location.href = '/login';
  };

  // Activity tracking for idle state trigger
  const resetIdleTimer = () => {
    if (!posIdleEnabled) return;
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
    }
    if (!isLocked && !isIdle) {
      idleTimerRef.current = setTimeout(() => {
        setIsIdle(true);
      }, posIdleTimeoutMinutes * 60 * 1000);
    }
  };

  // Update clocks every second
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      // Always display in English for consistency with design
      setCurrentTime(now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }));
      setCurrentDate(now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }));

      // Session expiration countdown
      const expiry = new Date(sessionExpiresAt).getTime();
      const diff = Math.max(0, Math.floor((expiry - now.getTime()) / 1000));
      setSessionTimeLeft(diff);

      if (diff <= 0) {
        handleLogoutAction();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [sessionExpiresAt]);

  // Idle overlay safe dismissal using capture-phase event interception
  useEffect(() => {
    const handleCaptureInteraction = (e: MouseEvent | TouchEvent | KeyboardEvent) => {
      if (isIdle) {
        // Prevent event from propagating/triggering any click-throughs below the overlay
        e.stopPropagation();
        e.stopImmediatePropagation?.();
        e.preventDefault();
        setIsIdle(false);
        if (posIdleRequirePin) {
          setIsLocked(true);
          broadcastChannelRef.current?.postMessage('LOCK');
        }
        resetIdleTimer();
      }
    };

    // Listen on window in capture phase (third arg: true)
    window.addEventListener('click', handleCaptureInteraction, true);
    window.addEventListener('pointerdown', handleCaptureInteraction, true);
    window.addEventListener('touchstart', handleCaptureInteraction, true);
    window.addEventListener('keydown', handleCaptureInteraction, true);

    return () => {
      window.removeEventListener('click', handleCaptureInteraction, true);
      window.removeEventListener('pointerdown', handleCaptureInteraction, true);
      window.removeEventListener('touchstart', handleCaptureInteraction, true);
      window.removeEventListener('keydown', handleCaptureInteraction, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isIdle]);

  useEffect(() => {
    const events = ['pointermove', 'pointerdown', 'click', 'keydown', 'scroll', 'touchstart'];
    events.forEach(event => {
      window.addEventListener(event, resetIdleTimer, { passive: true });
    });

    resetIdleTimer();

    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      events.forEach(event => {
        window.removeEventListener(event, resetIdleTimer);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLocked, isIdle, posIdleEnabled, posIdleTimeoutMinutes]);

  const handleLockAction = () => {
    setIsLocked(true);
    setIsIdle(false);
    broadcastChannelRef.current?.postMessage('LOCK');
  };

  const handleUnlockAction = () => {
    if (posIdleRequirePin) {
      if (!pinInput) {
        alert('يرجى إدخال كلمة المرور');
        return;
      }
      
      startTransition(async () => {
        const res = await verifyUnlockPassword(pinInput);
        if (res.success) {
          setIsLocked(false);
          setPinInput('');
          broadcastChannelRef.current?.postMessage('UNLOCK');
        } else {
          alert(res.error || 'كلمة المرور غير صحيحة');
          setPinInput('');
        }
      });
    } else {
      setIsLocked(false);
      broadcastChannelRef.current?.postMessage('UNLOCK');
    }
  };

  // Combine server products (or cached catalog in offline mode) with cashier custom items
  const allAvailableProducts = [...customPosProducts, ...(cachedCatalog && cachedCatalog.length > 0 ? cachedCatalog : (products || []))];

  // Fast Autocomplete / Search results for the Add/Edit Product Modal
  const modalSearchResults = useMemo(() => {
    if (!posProductSearch.trim()) return [];
    const q = posProductSearch.toLowerCase().trim();
    return allAvailableProducts.filter(p => 
      p.nameAr.toLowerCase().includes(q) || 
      p.sku.toLowerCase().includes(q) ||
      (p.nameEn && p.nameEn.toLowerCase().includes(q)) ||
      p.variants.some(v => 
        (v.barcode && v.barcode.toLowerCase().includes(q)) || 
        (v.sku && v.sku.toLowerCase().includes(q)) || 
        (v.shade && v.shade.toLowerCase().includes(q))
      )
    ).slice(0, 10);
  }, [allAvailableProducts, posProductSearch]);

  // Filter products by name, SKU, barcode, shade, or color
  const filteredProducts = allAvailableProducts.filter(p => 
    p.nameAr.toLowerCase().includes(search.toLowerCase()) || 
    p.sku.toLowerCase().includes(search.toLowerCase()) ||
    (p.nameEn && p.nameEn.toLowerCase().includes(search.toLowerCase())) ||
    p.variants.some(v => v.barcode && v.barcode.includes(search)) ||
    p.variants.some(v => v.shade && v.shade.toLowerCase().includes(search.toLowerCase())) ||
    p.variants.some(v => v.colorName && v.colorName.toLowerCase().includes(search.toLowerCase()))
  );

  const handleSelectProduct = (product: ProductItem) => {
    setSelectedProduct(product);
  };

  const handleAddVariantDirect = (product: ProductItem, variant: ProductVariant) => {
    const existingIdx = cart.findIndex(item => item.variantId === variant.id);
    if (existingIdx > -1) {
      const updated = [...cart];
      updated[existingIdx].quantity += 1;
      setCart(updated);
    } else {
      setCart(prev => [...prev, {
        variantId: variant.id,
        sku: variant.sku,
        name: product.nameAr,
        size: variant.size,
        shade: variant.shade,
        colorName: variant.colorName,
        colorHex: variant.colorHex,
        price: variant.price,
        costPrice: variant.costPrice || 0,
        quantity: 1
      }]);
    }
  };

  const handleAddVariant = (variant: ProductVariant) => {
    if (!selectedProduct) return;
    handleAddVariantDirect(selectedProduct, variant);
    setSelectedProduct(null);
  };

  // Direct trigger for quick code buttons (e.g. 1234 for 1 JOD items)
  const handleQuickCodeClick = (shortcut: { code: string; name: string; price: number }) => {
    // 1. Look up corresponding variant from allAvailableProducts or COSMETICS_CATALOG
    const matchedProduct = allAvailableProducts.find(p => 
      (p as any).quickCode === shortcut.code ||
      p.sku === `POS-${shortcut.code}-SEC` ||
      p.variants.some(v => v.barcode === shortcut.code || v.sku === shortcut.code || v.sku.includes(shortcut.code))
    );
    const matchedVariant = matchedProduct?.variants.find(v => v.barcode === shortcut.code || v.sku === shortcut.code || v.sku.includes(shortcut.code)) 
      || matchedProduct?.variants[0];

    const quickVariantId = matchedVariant?.id || `quick-${shortcut.code}`;
    const sku = matchedVariant?.sku || `POS-${shortcut.code}`;
    const name = matchedProduct?.nameAr || shortcut.name;
    const price = matchedVariant?.price || shortcut.price;

    const existingIdx = cart.findIndex(item => item.variantId === quickVariantId || (item.sku && item.sku === sku));
    if (existingIdx > -1) {
      const updated = [...cart];
      updated[existingIdx].quantity += 1;
      setCart(updated);
    } else {
      setCart(prev => [...prev, {
        variantId: quickVariantId,
        sku,
        name,
        size: matchedVariant?.size || 'سريع',
        shade: matchedVariant?.shade || 'كاش',
        price,
        quantity: 1
      }]);
    }
    playBeep();
    searchInputRef.current?.focus();
  };

  // Shared Return Query Executor (يدعم قراءة ليزر الفاتورة أو البحث النصي)
  const executeReturnQuerySearch = async (queryToSearch: string) => {
    const trimmed = queryToSearch.trim();
    if (!trimmed) return;
    setIsSearchingReturn(true);
    try {
      const res = await getSaleForReturn(trimmed);
      if (res.success && res.sale) {
        setReturnSaleData(res.sale);
        playBeep();
        if (res.sale.isFullyReturned) {
          showToast(`تم إرجاع الفاتورة رقم ${res.sale.reference} مسبقاً (فاتورة مستردة)`);
        } else {
          showToast(`تم العثور على الفاتورة رقم ${res.sale.reference}`);
        }
      } else {
        alert(res.error || 'لم يتم العثور على الفاتورة. تأكدي من كتابة رقم الفاتورة أو مسح الباركود بشكل صحيح.');
        setReturnSaleData(null);
      }
    } catch (e: any) {
      alert(e.message || 'خطأ أثناء البحث عن الفاتورة');
    } finally {
      setIsSearchingReturn(false);
    }
  };

  // Unified Barcode Scanner & Shortcode Processor (يدعم أصناف المتجر + أكواد الكاش + فواتير الاسترجاع)
  const processScannedBarcode = async (rawCode: string) => {
    const trimmed = rawCode.trim().replace(/[\r\n\t]/g, '');
    if (!trimmed) return;

    // Laser debounce & duplicate suppression within 400ms
    const now = Date.now();
    if (lastScanRef.current.code === trimmed && now - lastScanRef.current.timestamp < 400) {
      return;
    }
    lastScanRef.current = { code: trimmed, timestamp: now };

    // 1. Check if it is an Invoice/Receipt Reference for Returns (e.g. POS-XXXX or INV-XXXX)
    if (trimmed.toUpperCase().startsWith('POS-') || trimmed.toUpperCase().startsWith('INV-')) {
      playBeep();
      setIsReturnModalOpen(true);
      setReturnQuery(trimmed.toUpperCase());
      await executeReturnQuerySearch(trimmed.toUpperCase());
      return;
    }

    // 2. Check quick department shortcodes (e.g. "1234", "2222", etc.)
    const matchedShortcut = quickShortcuts.find(qs => qs.code === trimmed);
    if (matchedShortcut) {
      handleQuickCodeClick(matchedShortcut);
      playBeep();
      showToast(`تمت إضافة: ${matchedShortcut.name}`);
      return;
    }

    // 3. Check full product catalog for exact barcode, variant SKU, or product SKU match
    for (const prod of allAvailableProducts) {
      const matchingVariant = prod.variants.find(
        v => (v.barcode && v.barcode.trim() === trimmed) || 
             v.sku.toLowerCase() === trimmed.toLowerCase() ||
             (prod.sku && prod.sku.toLowerCase() === trimmed.toLowerCase())
      );
      if (matchingVariant) {
        handleAddVariantDirect(prod, matchingVariant);
        playBeep();
        showToast(`تم مسح: ${prod.nameAr} (${matchingVariant.shade || matchingVariant.size})`);
        return;
      }
    }

    // 4. If exactly one filtered product matches
    if (filteredProducts.length === 1 && filteredProducts[0].variants.length === 1) {
      handleAddVariantDirect(filteredProducts[0], filteredProducts[0].variants[0]);
      playBeep();
      showToast(`تم مسح: ${filteredProducts[0].nameAr}`);
      return;
    }

    playBeep();
    showToast(`الباركود [${trimmed}] غير مسجل كصنف أو فاتورة`);
  };

  // Barcode Scanner Listener: Enter key automatically processes scanned code or shortcode
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === 'NumpadEnter') {
      e.preventDefault();
      e.stopPropagation();
      const code = (searchInputRef.current?.value || search).trim();
      if (code) {
        setSearch('');
        if (searchInputRef.current) searchInputRef.current.value = '';
        processScannedBarcode(code);
      }
    }
  };

  // Global Unified Hardware Barcode Scanner & Keyboard Shortcuts Listener
  useEffect(() => {
    let scanBuffer = '';
    let lastKeyTime = 0;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // 1. If currently rebinding a shortcut key in settings modal:
      if (editingShortcutKey) {
        e.preventDefault();
        const newKey = e.key;
        if (newKey !== 'Escape') {
          const updated = { ...shortcuts, [editingShortcutKey]: newKey };
          setShortcuts(updated);
          localStorage.setItem('ghazal_pos_shortcuts', JSON.stringify(updated));
          showToast(`تم تعيين الاختصار [${newKey}] بنجاح`);
        }
        setEditingShortcutKey(null);
        return;
      }

      // 2. Escape key: Close any active modal
      if (e.key === 'Escape') {
        if (showReceiptModal) { setShowReceiptModal(false); searchInputRef.current?.focus(); return; }
        if (isSettingsModalOpen || isReturnModalOpen || isAddPosModalOpen || isCreditLedgerOpen || isSalesHistoryOpen || isSwitchCashierModalOpen || isCashExpenseModalOpen || settleDialogOpen || showCreditCustomerModal) {
          closeModal();
          return;
        }
        return;
      }

      // 3. Configurable POS Shortcuts (F1 - F12 or customized)
      if (e.key === shortcuts.openSettings) {
        e.preventDefault();
        if (isSettingsModalOpen) closeModal();
        else openModal('settings');
        return;
      }

      if (e.key === shortcuts.focusScanner) {
        e.preventDefault();
        searchInputRef.current?.focus();
        showToast('تم توجيه المؤشر لقارئ الباركود');
        return;
      }

      if (e.key === shortcuts.toggleFullscreen) {
        e.preventDefault();
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
        return;
      }

      if (e.key === shortcuts.openReturns) {
        e.preventDefault();
        if (isReturnModalOpen) closeModal();
        else openModal('returns');
        return;
      }

      if (e.key === shortcuts.addCustomItem) {
        e.preventDefault();
        if (isAddPosModalOpen) closeModal();
        else openModal('add-product');
        return;
      }

      if (e.key === shortcuts.clearCart) {
        if (cart.length > 0) {
          e.preventDefault();
          if (confirm('هل أنت متأكد من تفريغ سلة المشتريات بالكامل؟')) {
            setCart([]);
            showToast('تم تفريغ السلة');
          }
        }
        return;
      }

      if (e.key === shortcuts.holdOrder) {
        e.preventDefault();
        handleHoldRecallCart();
        return;
      }

      if (e.key === shortcuts.checkout) {
        e.preventDefault();
        handleCheckout();
        return;
      }

      if (e.key === shortcuts.quickCash) {
        e.preventDefault();
        handleQuickCashCheckout();
        return;
      }

      if (e.key === shortcuts.printReceipt) {
        if (showReceiptModal) {
          e.preventDefault();
          window.print();
          return;
        }
      }

      // 4. Rapid Keystroke Detection for Hardware Laser Barcode Guns & Intelligent Modal Routing
      const now = Date.now();
      const timeDiff = now - lastKeyTime;
      lastKeyTime = now;

      // Ignore modifier keys
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      const isInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      const isSearchInput = e.target === searchInputRef.current;
      const isAddPosBarcodeInput = e.target === newPosBarcodeInputRef.current;
      const isReturnQueryInput = e.target === returnQueryInputRef.current;

      if (e.key === 'Enter' || e.key === 'NumpadEnter') {
        if (isSearchInput) {
          // Already handled with stopPropagation in input's onKeyDown
          return;
        }
        const candidate = scanBuffer.trim();

        // ROUTING RULE 1: If Add/Edit POS Product modal is open (مسح باركود للتعديل أو إضافة صنف جديد)
        if (isAddPosModalOpen) {
          const finalCode = candidate.length >= 2 
            ? candidate 
            : (isAddPosBarcodeInput && newPosCode.trim() 
                ? newPosCode.trim() 
                : (posProductSearch.trim() ? posProductSearch.trim() : ''));

          if (finalCode.length >= 1) {
            e.preventDefault();
            scanBuffer = '';

            // Search if barcode or SKU or ID or Name matches in allAvailableProducts
            const foundProduct = allAvailableProducts.find(p => 
              p.sku.toLowerCase() === finalCode.toLowerCase() || 
              p.id === finalCode ||
              p.nameAr.toLowerCase() === finalCode.toLowerCase() ||
              p.variants.some(v => 
                (v.barcode && v.barcode.toLowerCase() === finalCode.toLowerCase()) || 
                (v.sku && v.sku.toLowerCase() === finalCode.toLowerCase())
              )
            );

            if (foundProduct) {
              const matchingVariant = foundProduct.variants.find(v => 
                (v.barcode && v.barcode.toLowerCase() === finalCode.toLowerCase()) || 
                (v.sku && v.sku.toLowerCase() === finalCode.toLowerCase())
              ) || foundProduct.variants[0];
              handleSelectProductToEdit(foundProduct, matchingVariant);
              playBeep();
              showToast(`تم مسح/اختيار الصنف: "${foundProduct.nameAr}" - معروض الآن للتعديل`);
            } else {
              setPosModalMode('NEW');
              setEditingCustomProductId(null);
              setNewPosCode(finalCode);
              setNewPosName('');
              setNewPosPrice('1.000');
              setNewPosCostPrice('0.000');
              setNewPosCategory('عام');
              setPosProductSearch('');
              setIsSearchingPosProduct(false);
              playBeep();
              showToast(`باركود جديد (${finalCode}) - يمكنك الآن إدخال الاسم والسعر لإضافته للكاش`);
            }
            return;
          }
        }

        // ROUTING RULE 2: If Return / Refund modal is open
        if (isReturnModalOpen) {
          if (candidate.length >= 2 || (isReturnQueryInput && returnQuery.trim())) {
            e.preventDefault();
            const finalCode = candidate.length >= 2 ? candidate : returnQuery.trim();
            setReturnQuery(finalCode);
            executeReturnQuerySearch(finalCode);
            scanBuffer = '';
            return;
          }
        }

        // ROUTING RULE 3: If any other modal is active, or focused on an ordinary input (e.g. notes, expense reason, phone)
        if (
          isCashExpenseModalOpen ||
          isSettingsModalOpen ||
          showReceiptModal ||
          isCreditLedgerOpen ||
          isSalesHistoryOpen ||
          isSwitchCashierModalOpen ||
          isCustomerPickerOpen ||
          isInput
        ) {
          // Do not trigger sale barcode scanning during other dialogs or typing in regular form fields
          scanBuffer = '';
          return;
        }

        // ROUTING RULE 4: Main Sales POS Barcode Processing
        if (candidate.length >= 2) {
          e.preventDefault();
          processScannedBarcode(candidate);
          scanBuffer = '';
        }
      } else if (e.key.length === 1) {
        if (timeDiff > 100) {
          scanBuffer = e.key;
        } else {
          scanBuffer += e.key;
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [
    shortcuts, 
    editingShortcutKey, 
    showReceiptModal, 
    isSettingsModalOpen, 
    isReturnModalOpen, 
    isAddPosModalOpen, 
    isCreditLedgerOpen, 
    isCashExpenseModalOpen, 
    isSalesHistoryOpen, 
    isSwitchCashierModalOpen, 
    isCustomerPickerOpen,
    cart, 
    search, 
    newPosCode, 
    returnQuery,
    allAvailableProducts,
    customPosProducts,
    cachedCatalog,
    posProductSearch
  ]);

  // Create or Edit POS-only product on the fly (مع سعر التكلفة وسعر البيع وقراءة الباركود)
  const handleSaveCustomPosProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPosName.trim()) return;
    const priceFils = Math.round((parseFloat(newPosPrice) || 1) * 1000);
    const costFils = Math.round((parseFloat(newPosCostPrice) || 0) * 1000);
    const compareAtFils = newPosCompareAtPrice && parseFloat(newPosCompareAtPrice) > 0 ? Math.round(parseFloat(newPosCompareAtPrice) * 1000) : undefined;
    const code = newPosCode.trim() || `POS-${Math.floor(1000 + Math.random() * 9000)}`;

    if (posModalMode === 'EDIT' && editingCustomProductId) {
      // 1. Update in customPosProducts if present
      const isCustom = customPosProducts.some(p => p.id === editingCustomProductId);
      if (isCustom) {
        const updatedCustom = customPosProducts.map(p => {
          if (p.id === editingCustomProductId) {
            return {
              ...p,
              nameAr: newPosName.trim(),
              nameEn: newPosName.trim(),
              sku: code,
              originalPriceFils: compareAtFils && compareAtFils > priceFils ? compareAtFils : undefined,
              shortDescription: `منتج كاشير مباشر (${newPosCategory})`,
              variants: [{
                ...p.variants[0],
                shade: newPosCategory || 'كاشير',
                barcode: code,
                sku: code,
                price: priceFils,
                costPrice: costFils,
                compareAt: compareAtFils,
              }]
            };
          }
          return p;
        });
        setCustomPosProducts(updatedCustom);
        try {
          localStorage.setItem('ghazal_pos_custom_products', JSON.stringify(updatedCustom));
        } catch (e) {}
      }

      // 2. Update in cachedCatalog for instant reflection across POS workspace
      const updatedCatalog = cachedCatalog.map(p => {
        if (p.id === editingCustomProductId) {
          return {
            ...p,
            nameAr: newPosName.trim(),
            nameEn: newPosName.trim(),
            sku: code,
            originalPriceFils: compareAtFils && compareAtFils > priceFils ? compareAtFils : undefined,
            variants: p.variants.map((v, i) => i === 0 ? {
              ...v,
              barcode: code,
              sku: code,
              price: priceFils,
              costPrice: costFils,
              compareAt: compareAtFils,
              shade: newPosCategory || v.shade
            } : v)
          };
        }
        return p;
      });
      setCachedCatalog(updatedCatalog);
      try {
        localStorage.setItem('ghazal_pos_cached_catalog', JSON.stringify(updatedCatalog));
      } catch (e) {}

      // 3. Update in cart if currently added
      setCart(prev => prev.map(item => {
        if (item.variantId.includes(editingCustomProductId) || item.sku === code || item.name === newPosName.trim()) {
          return {
            ...item,
            name: newPosName.trim(),
            sku: code,
            price: priceFils,
            shade: newPosCategory
          };
        }
        return item;
      }));

      // 4. Background server update if online
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        quickUpdatePOSProduct(editingCustomProductId, {
          nameAr: newPosName.trim(),
          barcode: code,
          priceFils,
          costPriceFils: costFils,
          compareAtFils,
          category: newPosCategory
        }).catch(err => console.warn('quickUpdatePOSProduct sync note:', err));
      }

      setIsAddPosModalOpen(false);
      setEditingCustomProductId(null);
      playBeep();
      showToast(`تم تعديل الصنف "${newPosName.trim()}" بنجاح (السعر: ${(priceFils / 1000).toFixed(3)} د.أ)`);
    } else {
      // Create new custom product
      const newProduct: ProductItem = {
        id: `pos-custom-${Date.now()}`,
        nameAr: newPosName.trim(),
        nameEn: newPosName.trim(),
        sku: code,
        shortDescription: `منتج كاشير مباشر (${newPosCategory})`,
        stockStatus: 'IN_STOCK',
        stockLiters: 100,
        imageUrl: null,
        originalPriceFils: compareAtFils && compareAtFils > priceFils ? compareAtFils : undefined,
        variants: [{
          id: `v-custom-${Date.now()}`,
          size: '1 قطعة',
          shade: newPosCategory || 'كاشير',
          barcode: code,
          sku: code,
          price: priceFils,
          costPrice: costFils,
          compareAt: compareAtFils,
          isActive: true,
          usesGlobalPricing: false
        }]
      };

      const updatedList = [newProduct, ...customPosProducts];
      setCustomPosProducts(updatedList);
      try {
        localStorage.setItem('ghazal_pos_custom_products', JSON.stringify(updatedList));
      } catch (e) {}

      handleAddVariantDirect(newProduct, newProduct.variants[0]);
      setIsAddPosModalOpen(false);
      playBeep();
      showToast(`تمت إضافة منتج جديد للكاش: ${newProduct.nameAr} (سعر: ${(priceFils / 1000).toFixed(3)} د.أ)`);
    }

    setNewPosName('');
    setNewPosCode('');
    setNewPosPrice('1.000');
    setNewPosCostPrice('0.000');
    setNewPosCompareAtPrice('');
    setNewPosCategory('عام');
    setPosModalMode('NEW');
    setPosProductSearch('');
    searchInputRef.current?.focus();
  };

  const handleDeleteCustomPosProduct = (productId: string) => {
    if (!confirm('هل تريد بالتأكيد حذف هذا الصنف من قائمة منتجات الكاشير؟')) return;
    const updated = customPosProducts.filter(p => p.id !== productId);
    setCustomPosProducts(updated);
    try {
      localStorage.setItem('ghazal_pos_custom_products', JSON.stringify(updated));
    } catch (e) {}
    if (editingCustomProductId === productId) {
      setEditingCustomProductId(null);
      setIsAddPosModalOpen(false);
    }
    showToast('تم حذف الصنف من الكاشير بنجاح');
  };

  const handleSelectProductToEdit = (product: ProductItem, variant?: any) => {
    setPosModalMode('EDIT');
    setEditingCustomProductId(product.id);
    setNewPosName(product.nameAr);
    const targetVariant = variant || product.variants[0];
    const code = targetVariant?.barcode || product.sku || '';
    setNewPosCode(code);
    setNewPosPrice(targetVariant ? (targetVariant.price / 1000).toFixed(3) : '1.000');
    setNewPosCostPrice(targetVariant && (targetVariant as any).costPrice ? (((targetVariant as any).costPrice) / 1000).toFixed(3) : '0.000');
    const compareVal = (targetVariant as any)?.compareAt || (product as any)?.originalPriceFils;
    setNewPosCompareAtPrice(compareVal ? (compareVal / 1000).toFixed(3) : '');
    setNewPosCategory(targetVariant?.shade || 'عام');
    setPosProductSearch('');
    setIsSearchingPosProduct(false);
  };

  const handleSetNewProductMode = () => {
    setPosModalMode('NEW');
    setEditingCustomProductId(null);
    setNewPosName('');
    setNewPosCode('');
    setNewPosPrice('1.000');
    setNewPosCostPrice('0.000');
    setNewPosCompareAtPrice('');
    setNewPosCategory('عام');
    setPosProductSearch('');
    setIsSearchingPosProduct(false);
    setTimeout(() => newPosBarcodeInputRef.current?.focus(), 80);
  };

  const handleOpenAddOrEditPosModal = (productToEdit?: ProductItem) => {
    if (productToEdit) {
      handleSelectProductToEdit(productToEdit);
    } else {
      handleSetNewProductMode();
    }
    openModal('add-product');
  };

  const handleRemoveItem = (variantId: string) => {
    setCart(cart.filter(item => item.variantId !== variantId));
  };

  const handleUpdateQty = (variantId: string, delta: number) => {
    setCart(cart.map(item => {
      if (item.variantId === variantId) {
        return { ...item, quantity: Math.max(1, item.quantity + delta) };
      }
      return item;
    }));
  };

  const handleUpdateItemDiscount = (variantId: string, val: string) => {
    const cleanVal = val.replace(/[^0-9.]/g, '');
    const parts = cleanVal.split('.');
    const formatted = parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : cleanVal;
    setCart(prev => prev.map(item => {
      if (item.variantId === variantId) {
        return { ...item, discount: formatted };
      }
      return item;
    }));
  };

  const getSubtotal = () => {
    return cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
  };

  const getItemDiscountsTotal = () => {
    return cart.reduce((acc, item) => {
      const itemDisc = parseFloat(item.discount || '0') || 0;
      return acc + Math.round(itemDisc * 1000);
    }, 0);
  };

  const getInvoiceDiscount = () => {
    const discVal = parseFloat(discountAmount) || 0;
    return Math.round(discVal * 1000);
  };

  const getDiscount = () => {
    return getItemDiscountsTotal() + getInvoiceDiscount();
  };

  const getTax = () => {
    if (!taxEnabled) return 0;
    const afterDiscount = Math.max(0, getSubtotal() - getDiscount());
    if (pricesIncludeTax) {
      return Math.round(afterDiscount * (taxRate / (100 + taxRate)));
    } else {
      return Math.round(afterDiscount * (taxRate / 100));
    }
  };

  const getGrandTotal = () => {
    const afterDiscount = Math.max(0, getSubtotal() - getDiscount());
    if (taxEnabled && !pricesIncludeTax) {
      return afterDiscount + getTax();
    }
    return afterDiscount;
  };

  const getChange = () => {
    const tender = parseFloat(amountTendered) || 0;
    const tenderFils = Math.round(tender * 1000);
    const total = getGrandTotal();
    return Math.max(0, tenderFils - total);
  };

  const formatCountdown = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // ====================================================================
  // CREDIT / ON-ACCOUNT REGISTER FUNCTIONS (الذمم والبيع الآجل)
  // ====================================================================
  const loadCreditSales = async () => {
    setIsLoadingCreditSales(true);
    try {
      const list = await getAllCreditSales();
      setPendingCreditSales(list || []);
    } catch (err) {
      console.error('Failed to load credit sales:', err);
    } finally {
      setIsLoadingCreditSales(false);
    }
  };

  const handleOpenCreditLedger = () => {
    setIsCreditLedgerOpen(true);
    loadCreditSales();
  };

  const handleSettleCreditSale = async (saleId: string, method: 'CASH' | 'CARD' | 'WALLET' = 'CASH') => {
    setSettlingSaleId(saleId);
    try {
      const res = await settleCreditSale(saleId, method);
      if (res.success) {
        alert('تم تسجيل سداد الذمة بنجاح في النظام والجرد الصندوقي!');
        loadCreditSales();
      } else {
        alert(res.error || 'فشل سداد الذمة');
      }
    } catch (e: any) {
      alert(e.message || 'حدث خطأ أثناء السداد');
    } finally {
      setSettlingSaleId(null);
    }
  };

  // Autocomplete search when typing customer name in CREDIT mode (minimum 2 chars)
  useEffect(() => {
    if (paymentMethod !== 'CREDIT') {
      setCreditCustomerSuggestions([]);
      setShowCreditSuggestions(false);
      return;
    }

    const q = (customerName === 'عميل نقدي' ? '' : customerName).trim();
    if (!q || q.length < 2) {
      setCreditCustomerSuggestions([]);
      setShowCreditSuggestions(false);
      return;
    }

    setIsSearchingCreditCustomers(true);
    const timer = setTimeout(async () => {
      try {
        const results = await searchCreditCustomersAction(q);
        setCreditCustomerSuggestions(results || []);
        setShowCreditSuggestions((results || []).length > 0);
      } catch (err) {
        setCreditCustomerSuggestions([]);
      } finally {
        setIsSearchingCreditCustomers(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [customerName, paymentMethod]);

  // Click outside listener for credit suggestions dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (creditSuggestionsRef.current && !creditSuggestionsRef.current.contains(e.target as Node)) {
        setShowCreditSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectCreditCustomer = (suggestion: any) => {
    setCustomerName(suggestion.name);
    setCustomerPhone(suggestion.phone || '');
    setShowCreditSuggestions(false);
    getCustomerCreditBalance(suggestion.phone || suggestion.name).then(res => {
      if (res && res.found) {
        setCustomerCreditInfo(res);
      }
    });
  };

  // Automatic real-time detection of existing customer debt balance
  useEffect(() => {
    if (paymentMethod !== 'CREDIT') {
      setCustomerCreditInfo(null);
      return;
    }
    const query = (customerPhone || (customerName === 'عميل نقدي' ? '' : customerName) || '').trim();
    if (!query || query.length < 2) {
      setCustomerCreditInfo(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await getCustomerCreditBalance(query);
        if (res && res.found) {
          setCustomerCreditInfo(res);
        } else {
          setCustomerCreditInfo(null);
        }
      } catch {
        setCustomerCreditInfo(null);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [customerName, customerPhone, paymentMethod]);

  // Group credit sales by customer account
  const customerCreditAccounts = React.useMemo(() => {
    const map = new Map<string, {
      customerKey: string;
      customerName: string;
      customerPhone: string;
      invoices: any[];
      totalDebtFils: number;
      totalPaidFils: number;
      netRemainingFils: number;
      isSettled: boolean;
      earliestDate: string;
      latestDueDate: string;
    }>();

    for (const sale of pendingCreditSales) {
      const key = (sale.customerPhone || sale.customerName || 'عميل غير محدد').trim().toLowerCase();
      const existing = map.get(key);
      const paid = sale.paidAmount || 0;
      const remaining = sale.remainingAmount !== undefined ? sale.remainingAmount : Math.max(0, sale.total - paid);
      const unpaidRemaining = sale.paymentStatus === 'PAID' ? 0 : remaining;

      if (existing) {
        existing.invoices.push(sale);
        existing.totalDebtFils += sale.total;
        existing.totalPaidFils += paid;
        existing.netRemainingFils += unpaidRemaining;
        if (sale.dueDate && (!existing.latestDueDate || sale.dueDate > existing.latestDueDate)) {
          existing.latestDueDate = sale.dueDate;
        }
      } else {
        map.set(key, {
          customerKey: key,
          customerName: sale.customerName,
          customerPhone: sale.customerPhone || '',
          invoices: [sale],
          totalDebtFils: sale.total,
          totalPaidFils: paid,
          netRemainingFils: unpaidRemaining,
          isSettled: false,
          earliestDate: sale.createdAt,
          latestDueDate: sale.dueDate || ''
        });
      }
    }

    const list = Array.from(map.values()).map(acc => ({
      ...acc,
      isSettled: acc.netRemainingFils === 0
    }));

    if (creditStatusFilter === 'PENDING_ONLY') {
      return list.filter(acc => acc.netRemainingFils > 0);
    }
    return list;
  }, [pendingCreditSales, creditStatusFilter]);

  // Filtered accounts for search in Credit Ledger
  const filteredCreditAccounts = React.useMemo(() => {
    if (!creditFilterSearch.trim()) return customerCreditAccounts;
    const q = creditFilterSearch.trim().toLowerCase();
    return customerCreditAccounts.filter(acc => 
      acc.customerName.toLowerCase().includes(q) ||
      acc.customerPhone.includes(q) ||
      acc.invoices.some(inv => (inv.invoiceNumber || '').toLowerCase().includes(q))
    );
  }, [customerCreditAccounts, creditFilterSearch]);

  const filteredCreditInvoices = React.useMemo(() => {
    let list = pendingCreditSales;
    if (creditStatusFilter === 'PENDING_ONLY') {
      list = list.filter(sale => sale.remainingAmount > 0 && sale.paymentStatus !== 'PAID');
    }
    if (!creditFilterSearch.trim()) return list;
    const q = creditFilterSearch.trim().toLowerCase();
    return list.filter(sale => 
      (sale.customerName || '').toLowerCase().includes(q) ||
      (sale.customerPhone || '').includes(q) ||
      (sale.invoiceNumber || '').toLowerCase().includes(q) ||
      (sale.reference || '').toLowerCase().includes(q)
    );
  }, [pendingCreditSales, creditFilterSearch, creditStatusFilter]);

  // Open Settle Debt Dialog
  const handleOpenSettleDialog = (target: {
    customerIdentifier: string;
    customerName: string;
    customerPhone?: string;
    totalRemainingFils: number;
    saleId?: string;
  }) => {
    setSettlingTarget(target);
    setSettleAmountStr((target.totalRemainingFils / 1000).toFixed(3));
    setSettlePaymentMethod('CASH');
    setSettleNotes('');
    setSettleDialogOpen(true);
  };

  // Settle Debt and Deduct from Customer Balance
  const handleConfirmDebtSettlement = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!settlingTarget) return;

    const amt = parseFloat(settleAmountStr);
    if (isNaN(amt) || amt <= 0) {
      alert('يرجى إدخال مبلغ سداد صحيح بالدينار أكبر من صفر');
      return;
    }

    const amtFils = Math.round(amt * 1000);
    if (amtFils > settlingTarget.totalRemainingFils) {
      alert(`المبلغ المدخل (${amt.toFixed(3)} د.أ) يتجاوز إجمالي الذمة المستحقة (${(settlingTarget.totalRemainingFils / 1000).toFixed(3)} د.أ)`);
      return;
    }

    setIsSubmittingSettlement(true);
    try {
      const res = await settleCustomerCreditDebt({
        customerIdentifier: settlingTarget.saleId || settlingTarget.customerIdentifier,
        amountFils: amtFils,
        settlementMethod: settlePaymentMethod,
        notes: settleNotes.trim() || undefined
      });

      if (res.success) {
        playBeep();
        showToast(res.message || 'تم تسجيل سداد الذمة بنجاح وخصم المبلغ من المسجل عليه!');
        setSettleDialogOpen(false);
        setSettlingTarget(null);
        await loadCreditSales();
      } else {
        alert(res.error || 'فشل سداد الذمة');
      }
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء معالجة سداد الذمة');
    } finally {
      setIsSubmittingSettlement(false);
    }
  };

  // ====================================================================
  // INVOICES & SALES HISTORY FUNCTIONS (سجل فواتير المبيعات)
  // ====================================================================
  const fetchSalesHistory = async (overrideFilters?: {
    date?: string;
    employeeId?: string;
    paymentMethod?: string;
    search?: string;
  }) => {
    setIsLoadingSalesHistory(true);
    try {
      const date = overrideFilters?.date !== undefined ? overrideFilters.date : salesHistoryFilterDate;
      const employeeId = overrideFilters?.employeeId !== undefined ? overrideFilters.employeeId : salesHistoryFilterEmployee;
      const paymentMethod = overrideFilters?.paymentMethod !== undefined ? overrideFilters.paymentMethod : salesHistoryFilterMethod;
      const search = overrideFilters?.search !== undefined ? overrideFilters.search : salesHistoryFilterSearch;

      const res = await getPOSSalesHistory({
        date: date || undefined,
        employeeId: employeeId !== 'ALL' ? employeeId : undefined,
        paymentMethod: paymentMethod !== 'ALL' ? paymentMethod : undefined,
        search: search.trim() || undefined
      });

      const serverSales = (res && res.success && res.sales) ? res.sales : [];
      let localSales: any[] = [];
      try {
        const stored = JSON.parse(localStorage.getItem('ghazal_pos_sales_history') || '[]');
        localSales = Array.isArray(stored) ? stored : [];
        if (date) {
          localSales = localSales.filter((s: any) => (s.createdAt || '').startsWith(date));
        }
        if (paymentMethod && paymentMethod !== 'ALL') {
          localSales = localSales.filter((s: any) => s.paymentMethod === paymentMethod);
        }
        if (search && search.trim()) {
          const q = search.trim().toLowerCase();
          localSales = localSales.filter((s: any) => 
            (s.reference && s.reference.toLowerCase().includes(q)) ||
            (s.invoiceNumber && s.invoiceNumber.toLowerCase().includes(q)) ||
            (s.customerName && s.customerName.toLowerCase().includes(q))
          );
        }
      } catch {}

      // Deduplicate by reference / invoiceNumber
      const seen = new Set<string>();
      const combined: any[] = [];
      for (const s of [...serverSales, ...localSales]) {
        const key = s.reference || s.invoiceNumber || s.id;
        if (!seen.has(key)) {
          seen.add(key);
          combined.push(s);
        }
      }

      setSalesHistoryList(combined);
      if (res && res.employees && res.employees.length > 0) {
        setSalesHistoryEmployees(res.employees);
      }
    } catch (err) {
      console.error('Failed to fetch sales history:', err);
    } finally {
      setIsLoadingSalesHistory(false);
    }
  };

  const handleOpenSalesHistory = () => {
    setIsSalesHistoryOpen(true);
    fetchSalesHistory();
  };

  const handleViewReceiptFromHistory = async (reference: string) => {
    try {
      const res = await getSaleDetailsForReceipt(reference);
      if (res.success && res.sale) {
        setReceiptData(res.sale);
        setShowReceiptModal(true);
        return;
      }
    } catch {}

    const found = salesHistoryList.find(s => s.reference === reference || s.invoiceNumber === reference);
    if (found) {
      setReceiptData(found);
      setShowReceiptModal(true);
      return;
    }

    try {
      const stored = JSON.parse(localStorage.getItem('ghazal_pos_sales_history') || '[]');
      const localFound = stored.find((s: any) => s.reference === reference || s.invoiceNumber === reference);
      if (localFound) {
        setReceiptData(localFound);
        setShowReceiptModal(true);
        return;
      }
    } catch {}

    alert('لم يتم العثور على الفاتورة');
  };

  // ====================================================================
  // FAST CASHIER EMPLOYEE SWITCHER (التبديل السريع بين الموظفين على الكاشير)
  // ====================================================================
  const handleOpenSwitchModal = async () => {
    setIsSwitchCashierModalOpen(true);
    setSwitchError(null);
    setSwitchPin('');
    try {
      const list = await getPOSActiveEmployees();
      setActiveEmployeesList(list);
      if (list.length > 0) {
        const currentMatch = list.find((e: any) => e.name === activeCashierName);
        setSelectedEmployeeId(currentMatch ? currentMatch.id : list[0].id);
      }
    } catch {}
  };

  const handleConfirmSwitch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedEmployeeId) {
      setSwitchError('يرجى اختيار الموظف من القائمة');
      return;
    }

    setIsSwitchingEmployee(true);
    setSwitchError(null);

    try {
      const res = await switchCashierEmployee(selectedEmployeeId, switchPin);
      if (res.success && res.employee) {
        setActiveCashierName(res.employee.name);
        try {
          localStorage.setItem('ghazal_current_cashier_name', res.employee.name);
          localStorage.setItem('ghazal_pos_paired_device', 'true');
        } catch {}
        setIsSwitchCashierModalOpen(false);
        setSwitchPin('');
        playBeep();
        showToast(`تم تبديل الكاشير بنجاح: مرحباً ${res.employee.name}`);
      } else {
        setSwitchError(res.error || 'رمز الـ PIN أو كلمة المرور غير صحيحة');
      }
    } catch (err: any) {
      setSwitchError(err.message || 'حدث خطأ أثناء تبديل الموظف');
    } finally {
      setIsSwitchingEmployee(false);
    }
  };

  // ====================================================================
  // CASH MOVEMENT, VOUCHERS & EXPENSES FROM DRAWER
  // ====================================================================
  const handleOpenCashExpenseModal = () => {
    setIsCashExpenseModalOpen(true);
    setCashExpenseError(null);
    setCashExpenseAmountStr('');
    setCashExpenseReason('');
    setCashExpenseBeneficiary('');
  };

  const handleSubmitCashExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(cashExpenseAmountStr);
    if (!val || val <= 0) {
      setCashExpenseError('يرجى إدخال مبلغ صحيح بالدينار');
      return;
    }
    if (!cashExpenseReason.trim()) {
      setCashExpenseError('يرجى توضيح سبب المصروف بالتفصيل');
      return;
    }

    setIsSubmittingCashExpense(true);
    setCashExpenseError(null);

    try {
      const amountFils = Math.round(val * 1000);
      const [resExpense, resDrawer] = await Promise.all([
        createOperatingExpense({
          category: 'مصاريف تشغيلية للكاشير',
          amountFils,
          beneficiary: cashExpenseBeneficiary.trim() || 'مصروف مباشر من الدرج',
          description: cashExpenseReason.trim(),
          paymentMethod: 'CASH',
          paidFromDrawer: true
        }),
        recordCashierDrawerExpense({
          amountFils,
          reason: cashExpenseReason.trim(),
          cashierName: activeCashierName,
          beneficiary: cashExpenseBeneficiary.trim() || 'مصروف مباشر من الدرج'
        })
      ]);

      if (resExpense.success || resDrawer.success) {
        playBeep();
        showToast(`تم تسجيل سحب المصروف بنجاح: ${val.toFixed(3)} د.أ وترحيله للتسويات المالية`);
        setIsCashExpenseModalOpen(false);
      } else {
        setCashExpenseError(resExpense.error || resDrawer.error || 'فشل تسجيل المصروف');
      }
    } catch (err: any) {
      setCashExpenseError(err.message || 'حدث خطأ أثناء حفظ حركة المصروف');
    } finally {
      setIsSubmittingCashExpense(false);
    }
  };

  // ====================================================================
  // CUSTOMER QUICK PICKER
  // ====================================================================
  const handleOpenCustomerPicker = async () => {
    setIsCustomerPickerOpen(true);
    try {
      const list = await getAllCustomers();
      setCustomersList(list);
    } catch {}
  };

  const handleSelectCustomer = (cust: any) => {
    setCustomerName(`${cust.name} [${cust.phone}]`);
    setIsCustomerPickerOpen(false);
    playBeep();
    showToast(`تم ربط العميل بالفاتورة: ${cust.name}`);
  };

  // ====================================================================
  // INVOICE RETURN / REFUND FUNCTIONS (إرجاع فاتورة برقمها)
  // ====================================================================
  const handleSearchReturnSale = async (e: React.FormEvent) => {
    e.preventDefault();
    await executeReturnQuerySearch(returnQuery);
  };

  const handleConfirmReturn = async () => {
    if (!returnSaleData) return;
    
    if (returnSaleData.isFullyReturned) {
      alert('تم إرجاع الفاتورة مسبقاً (هذه الفاتورة مستردة بالكامل)');
      return;
    }
    
    // Full Invoice Return: all items returned automatically without manual quantity picking
    const itemsToReturn = (returnSaleData.items || []).map((it: any) => {
      const qty = it.remainingQty !== undefined ? it.remainingQty : (it.quantity || 1);
      return {
        variantId: it.variantId,
        quantity: qty,
        amount: (it.unitPrice || 0) * qty
      };
    });

    if (itemsToReturn.length === 0) {
      alert('لا توجد أصناف قابلة للإرجاع في هذه الفاتورة');
      return;
    }

    try {
      const res = await processPOSReturn({
        saleReference: returnSaleData.reference,
        items: itemsToReturn,
        refundMethod: returnMethod,
        reason: returnReason
      });

      if (res.success) {
        const refundedJOD = ((res.returnRecord?.totalAmount || returnSaleData.total || 0) / 1000).toFixed(3);
        playBeep();
        showToast(`تم استرجاع الفاتورة رقم ${returnSaleData.reference} بالكامل وإعادة ${refundedJOD} د.أ`);
        setIsReturnModalOpen(false);
        setReturnSaleData(null);
        setReturnQuery('');
        updateModalUrlParam(null);
      } else {
        alert(res.error || 'فشل إرجاع الفاتورة');
      }
    } catch (e: any) {
      alert(e.message || 'خطأ أثناء معالجة المرتجع');
    }
  };

  // ====================================================================
  // MODAL ROUTING & URL PARAMETER SYNCHRONIZATION
  // ====================================================================
  type ModalKey = 'settings' | 'add-product' | 'returns' | 'credit-ledger' | 'sales-history' | 'switch-cashier' | 'cash-expense' | 'offline-queue';

  const updateModalUrlParam = useCallback((key: ModalKey | null) => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (key) {
      url.searchParams.set('modal', key);
      window.history.pushState({ modal: key }, '', url.pathname + url.search);
    } else {
      url.searchParams.delete('modal');
      window.history.replaceState({}, '', url.pathname + (url.search ? url.search : ''));
    }
  }, []);

  const openModal = useCallback((key: ModalKey) => {
    // Close other modals first
    setIsSettingsModalOpen(false);
    setIsAddPosModalOpen(false);
    setEditingCustomProductId(null);
    setIsReturnModalOpen(false);
    setIsCreditLedgerOpen(false);
    setIsSalesHistoryOpen(false);
    setIsSwitchCashierModalOpen(false);
    setIsCashExpenseModalOpen(false);
    setIsOfflineQueueModalOpen(false);
    setSettleDialogOpen(false);

    switch (key) {
      case 'settings':
        setIsSettingsModalOpen(true);
        break;
      case 'add-product':
        setIsAddPosModalOpen(true);
        setTimeout(() => newPosBarcodeInputRef.current?.focus(), 120);
        break;
      case 'returns':
        setIsReturnModalOpen(true);
        setTimeout(() => returnQueryInputRef.current?.focus(), 120);
        break;
      case 'credit-ledger':
        setIsCreditLedgerOpen(true);
        loadCreditSales();
        break;
      case 'sales-history':
        setIsSalesHistoryOpen(true);
        fetchSalesHistory();
        break;
      case 'switch-cashier':
        handleOpenSwitchModal();
        break;
      case 'cash-expense':
        handleOpenCashExpenseModal();
        break;
      case 'offline-queue':
        getOfflineQueue().then((q) => setOfflineQueueList(q || []));
        setIsOfflineQueueModalOpen(true);
        break;
    }

    updateModalUrlParam(key);
  }, [updateModalUrlParam]);

  const closeModal = useCallback(() => {
    setIsSettingsModalOpen(false);
    setIsAddPosModalOpen(false);
    setEditingCustomProductId(null);
    setIsReturnModalOpen(false);
    setIsCreditLedgerOpen(false);
    setIsSalesHistoryOpen(false);
    setIsSwitchCashierModalOpen(false);
    setIsCashExpenseModalOpen(false);
    setIsOfflineQueueModalOpen(false);
    setEditingShortcutKey(null);
    setReturnSaleData(null);
    setSettleDialogOpen(false);
    setShowCreditCustomerModal(false);

    updateModalUrlParam(null);
    searchInputRef.current?.focus();
  }, [updateModalUrlParam]);

  // Sync URL query param on mount and browser navigation (Back/Forward)
  useEffect(() => {
    const handleUrlSync = () => {
      if (typeof window === 'undefined') return;
      const params = new URLSearchParams(window.location.search);
      const modalParam = params.get('modal') as ModalKey | null;

      if (!modalParam) {
        setIsSettingsModalOpen(false);
        setIsAddPosModalOpen(false);
        setIsReturnModalOpen(false);
        setIsCreditLedgerOpen(false);
        setIsSalesHistoryOpen(false);
        setIsSwitchCashierModalOpen(false);
        setIsCashExpenseModalOpen(false);
        setIsOfflineQueueModalOpen(false);
        return;
      }

      switch (modalParam) {
        case 'settings':
          setIsSettingsModalOpen(true);
          break;
        case 'add-product':
          setIsAddPosModalOpen(true);
          setTimeout(() => newPosBarcodeInputRef.current?.focus(), 120);
          break;
        case 'returns':
          setIsReturnModalOpen(true);
          setTimeout(() => returnQueryInputRef.current?.focus(), 120);
          break;
        case 'credit-ledger':
          setIsCreditLedgerOpen(true);
          loadCreditSales();
          break;
        case 'sales-history':
          setIsSalesHistoryOpen(true);
          fetchSalesHistory();
          break;
        case 'switch-cashier':
          handleOpenSwitchModal();
          break;
        case 'cash-expense':
          handleOpenCashExpenseModal();
          break;
        case 'offline-queue':
          getOfflineQueue().then((q) => setOfflineQueueList(q || []));
          setIsOfflineQueueModalOpen(true);
          break;
      }
    };

    handleUrlSync();
    window.addEventListener('popstate', handleUrlSync);
    return () => {
      window.removeEventListener('popstate', handleUrlSync);
    };
  }, []);

  // ====================================================================
  // CHECKOUT PROCESSOR (معالجة الدفع وإصدار الفاتورة)
  // ====================================================================
  const handleCheckout = () => {
    if (cart.length === 0) return;

    const grandTotalFils = getGrandTotal();
    const isCredit = paymentMethod === 'CREDIT';
    const isCash = paymentMethod === 'CASH';

    const parsedTendered = parseFloat(amountTendered);
    const tenderedFils = isCash
      ? (!isNaN(parsedTendered) && parsedTendered > 0 ? Math.round(parsedTendered * 1000) : grandTotalFils)
      : (isCredit ? 0 : grandTotalFils);

    if (isCredit) {
      if (!customerName.trim() || customerName === 'عميل نقدي') {
        setShowCreditCustomerModal(true);
        alert('يرجى كتابة اسم الزبونة / العميل لتسجيل فاتورة البيع الآجل (الذمة)');
        return;
      }
      if (!customerPhone.trim()) {
        setShowCreditCustomerModal(true);
        alert('يرجى إدخال رقم هاتف الزبونة للتواصل ومتابعة السداد');
        return;
      }
      if (!creditDueDate.trim()) {
        setShowCreditCustomerModal(true);
        alert('يرجى تحديد تاريخ استحقاق السداد المتفق عليه');
        return;
      }
    }
    
    const saleIdempotencyKey = `OFF-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    const payload = {
      idempotencyKey: saleIdempotencyKey,
      items: cart.map(item => ({
        variantId: item.variantId,
        sku: item.sku,
        name: item.name,
        size: item.size,
        shade: item.shade,
        price: item.price,
        quantity: item.quantity
      })),
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      dueDate: creditDueDate,
      creditNotes: creditNotes.trim(),
      notes: invoiceNotes.trim() || creditNotes.trim(),
      cashierName: activeCashierName,
      paymentMethod,
      walletRef: walletRef.trim(),
      discount: getDiscount(),
      amountTendered: tenderedFils
    };

    const processLocallyAsOffline = async () => {
      const offlineRef = `OFF-${Date.now().toString().slice(-6)}`;
      const offlineSaleId = saleIdempotencyKey;
      const nowIso = new Date().toISOString();
      const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      const discount = getDiscount();
      const total = Math.max(0, subtotal - discount);
      const taxAmount = Math.round(total * 0.16);

      const offlineResult = {
        success: true,
        offline: true,
        saleId: offlineSaleId,
        reference: offlineRef,
        invoiceNumber: offlineRef,
        createdAt: nowIso,
        total,
        subtotal,
        discount,
        taxAmount,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim() || null,
        dueDate: creditDueDate || null,
        notes: invoiceNotes.trim() || creditNotes.trim() || null,
        paymentMethod,
        cashierName: activeCashierName,
        items: payload.items
      };

      const queueItem: OfflineSaleItem = {
        id: offlineSaleId,
        createdAt: nowIso,
        total,
        subtotal,
        discount,
        taxAmount,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim() || null,
        paymentMethod,
        cashierName: activeCashierName,
        items: payload.items.map(it => ({
          variantId: it.variantId,
          productName: it.name,
          variantSize: it.size,
          sku: it.sku,
          price: it.price,
          quantity: it.quantity
        })),
        payload,
        receiptData: offlineResult,
        syncStatus: 'PENDING',
        retryCount: 0
      };

      // 1. Enqueue to IndexedDB & localStorage
      await enqueueOfflineSale(queueItem);
      await addSaleToLocalHistory(offlineResult);

      // 2. Refresh local state
      const currentQueue = await getOfflineQueue();
      setOfflineQueueCount(currentQueue.length);
      setOfflineQueueList(currentQueue);

      setCheckoutResult(offlineResult);
      setReceiptData(offlineResult);
      setShowReceiptModal(true);
      setCart([]);
      setAmountTendered('');
      setDiscountAmount('0');
      setInvoiceNotes('');
      playBeep();
      showToast(`تم حفظ الفاتورة أوفلاين ${offlineRef} بنجاح (جاهزة للطباعة والمزامنة)`);
      if (autoPrintEnabled) {
        setTimeout(() => window.print(), 350);
      }
      if (isCredit) {
        setCustomerName('عميل نقدي');
        setCustomerPhone('');
        setCreditNotes('');
      }
    };

    // Automatic check: if disconnected, save locally without any delay!
    if (!isOnline || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      processLocallyAsOffline();
      return;
    }

    startTransition(async () => {
      try {
        // Enforce a strict 2.5s network timeout so cashier never freezes or hangs if connection drops
        const timeoutPromise = new Promise<{ success: false; error: string; isNetworkTimeout?: boolean }>((resolve) =>
          setTimeout(() => resolve({ success: false, error: 'TIMEOUT', isNetworkTimeout: true }), 2500)
        );

        const res: any = await Promise.race([
          processPOSCheckout(payload),
          timeoutPromise
        ]);

        if (res.success) {
          setCheckoutResult(res);
          setReceiptData(res);
          setShowReceiptModal(true);
          setCart([]);
          setAmountTendered('');
          setDiscountAmount('0');
          setInvoiceNotes('');

          // Store to local sales history for high-availability offline resilience
          const historyEntry = {
            id: res.saleId || `sale-${Date.now()}`,
            reference: res.reference,
            invoiceNumber: res.invoiceNumber || res.reference,
            createdAt: res.createdAt || new Date().toISOString(),
            total: res.total,
            subtotal: res.subtotal || res.total,
            discount: res.discount || 0,
            tax: res.taxAmount || 0,
            customerName: res.customerName || customerName.trim(),
            customerPhone: res.customerPhone || customerPhone.trim() || null,
            dueDate: res.dueDate || null,
            notes: res.notes || null,
            paymentMethod: res.paymentMethod || paymentMethod,
            employeeName: res.cashierName || activeCashierName,
            employeeId: 'emp-1',
            itemsCount: (res.items || []).reduce((sum: number, it: any) => sum + (it.quantity || 1), 0),
            items: res.items || []
          };
          addSaleToLocalHistory(historyEntry);

          playBeep();
          showToast(`تم إصدار الفاتورة رقم ${res.reference} بنجاح`);
          if (autoPrintEnabled) {
            setTimeout(() => window.print(), 350);
          }
          if (isCredit) {
            setCustomerName('عميل نقدي');
            setCustomerPhone('');
            setCreditNotes('');
          }
        } else {
          // If timeout, network cut, or fetch failure -> seamlessly convert to offline sale!
          if (res.isNetworkTimeout || (res.error && (res.error.includes('fetch') || res.error.includes('network') || res.error.includes('connect') || res.error.includes('TIMEOUT')))) {
            setIsOnline(false);
            processLocallyAsOffline();
          } else {
            alert(res.error || 'حدث خطأ أثناء إتمام العملية');
          }
        }
      } catch (err: any) {
        // Any socket/network exception -> seamlessly convert to offline sale!
        setIsOnline(false);
        processLocallyAsOffline();
      }
    });
  };

  return (
    <div className="flex flex-col w-full h-full relative" dir="rtl">
      

      <div className="flex-1 flex flex-col md:flex-row w-full overflow-hidden">
        
        {/* Mobile screen tabs */}
        <div className="md:hidden flex border-b border-zinc-200 bg-white sticky top-0 z-10 shrink-0">
          <button
            onClick={() => setMobileTab('catalog')}
            className={`flex-1 text-center py-3 font-bold text-sm border-b-2 transition-colors ${
              mobileTab === 'catalog'
                ? 'border-black text-black'
                : 'border-transparent text-zinc-500'
            }`}
          >
            المبيعات السريعة والباركود
          </button>
          <button
            onClick={() => setMobileTab('cart')}
            className={`flex-1 text-center py-3 font-bold text-sm border-b-2 transition-colors relative ${
              mobileTab === 'cart'
                ? 'border-black text-black'
                : 'border-transparent text-zinc-500'
            }`}
          >
            سلة المشتريات ({cart.reduce((sum, item) => sum + item.quantity, 0)})
          </button>
        </div>

        {/* LEFT COLUMN: Barcode Scanner & Quick Sales Catalog (Monochrome Official) */}
        <div
          className={`flex-grow md:w-[52%] lg:w-[50%] flex flex-col p-4 md:p-6 overflow-hidden bg-[#FAFAFA] ${
            mobileTab === 'catalog' ? 'flex' : 'hidden md:flex'
          }`}
        >
          {/* Top Barcode Status & Quick Shortcodes Ribbon */}
          <div className="mb-4 shrink-0 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-zinc-800">
                <Barcode className="w-4 h-4 text-black" />
                <span className="font-mono text-[11px] text-zinc-600">GHAZAL POS • نقطة البيع الرسمية الموحدة</span>
              </div>

              {/* Action Buttons: Settings, Add/Edit POS product, Return by invoice, and Credit Ledger */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Automatic Online / Offline Status Indicator */}
                <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition shadow-xs ${
                  isOnline 
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                    : 'bg-rose-50 text-rose-800 border-rose-300 animate-pulse'
                }`}>
                  {isOnline ? (
                    <>
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                      <Wifi className="w-3.5 h-3.5 text-emerald-600" />
                      <span>متصل</span>
                    </>
                  ) : (
                    <>
                      <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
                      <WifiOff className="w-3.5 h-3.5 text-rose-600" />
                      <span>حفظ تلقائي (دون إنترنت)</span>
                    </>
                  )}
                </div>

                {/* Offline Queue Badge & Automatic Sync (Displayed only in the rare case when offline invoices exist) */}
                {offlineQueueCount > 0 && (
                  <div className="inline-flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => openModal('offline-queue')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold transition shadow-xs"
                      title="عرض الفواتير المسجلة محلياً أثناء انقطاع الإنترنت"
                    >
                      <HardDrive className="w-3.5 h-3.5 text-amber-700" />
                      <span>فواتير الانتظار ({offlineQueueCount})</span>
                      {isSyncingOffline && <RefreshCcw className="w-3 h-3 animate-spin text-amber-600" />}
                    </button>

                    {isOnline && !isSyncingOffline && (
                      <button
                        type="button"
                        onClick={handleSyncOfflineQueue}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition shadow-xs"
                        title="مزامنة فورية الآن"
                      >
                        <RefreshCcw className="w-3.5 h-3.5" />
                        <span>مزامنة الآن</span>
                      </button>
                    )}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => refreshCatalogFromAdmin(false)}
                  disabled={isSyncingWithAdmin}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-zinc-100 text-zinc-800 border border-zinc-300 text-xs font-bold transition shadow-xs"
                  title="مزامنة فورية وتحديث الأصناف والأسعار مباشرة من لوحة تحكم الإدارة"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-zinc-600 ${isSyncingWithAdmin ? 'animate-spin' : ''}`} />
                  <span>تحديث من الإدارة</span>
                </button>

                <button
                  type="button"
                  onClick={() => openModal('settings')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-zinc-100 text-zinc-800 border border-zinc-300 text-xs font-bold transition shadow-xs"
                  title="إعدادات الكاشير واختصارات لوحة المفاتيح (F10)"
                >
                  <Settings className="w-3.5 h-3.5 text-zinc-600" />
                  <span>الإعدادات والاختصارات</span>
                  <span className="text-[10px] bg-zinc-100 border border-zinc-200 px-1 py-0.2 rounded font-mono font-normal">{shortcuts.openSettings}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleOpenAddOrEditPosModal()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black hover:bg-zinc-800 text-white text-xs font-bold transition shadow-xs border border-zinc-800"
                  title="إضافة أو تعديل منتج كاشير مباشر مع سعر التكلفة والبيع (F7)"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>إضافة أو تعديل منتج مباشر</span>
                  <span className="text-[10px] bg-white/20 px-1 py-0.2 rounded font-mono font-normal">{shortcuts.addCustomItem}</span>
                </button>

                <button
                  type="button"
                  onClick={() => openModal('returns')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-zinc-100 text-zinc-800 border border-zinc-300 text-xs font-bold transition shadow-xs"
                  title="إرجاع أصناف بموجب رقم الفاتورة أو مسح الباركود (F6)"
                >
                  <Undo2 className="w-3.5 h-3.5 text-zinc-700" />
                  <span>إرجاع فاتورة</span>
                  <span className="text-[10px] bg-zinc-100 border border-zinc-200 px-1 py-0.2 rounded font-mono font-normal">{shortcuts.openReturns}</span>
                </button>

                <button
                  type="button"
                  onClick={() => openModal('credit-ledger')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-zinc-100 text-zinc-800 border border-zinc-300 text-xs font-bold transition shadow-xs"
                  title="عرض الذمم غير المسددة وفواتير البيع الآجل"
                >
                  <Users className="w-3.5 h-3.5 text-zinc-600" />
                  <span>البيع الآجل والذمم</span>
                </button>

                <button
                  type="button"
                  onClick={() => openModal('sales-history')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-zinc-100 text-zinc-800 border border-zinc-300 text-xs font-bold transition shadow-xs"
                  title="سجل فواتير المبيعات ومتابعة العمليات وإعادة طباعة الإيصالات"
                >
                  <Receipt className="w-3.5 h-3.5 text-zinc-600" />
                  <span>سجل الفواتير</span>
                </button>

                <button
                  type="button"
                  onClick={() => openModal('switch-cashier')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-zinc-100 text-zinc-800 border border-zinc-300 text-xs font-bold transition shadow-xs"
                  title="تبديل موظف الكاشير واختيار اسمك وإدخال الـ PIN"
                >
                  <Users className="w-3.5 h-3.5 text-zinc-600" />
                  <span>الكاشير: {activeCashierName}</span>
                  <span className="text-[10px] bg-zinc-100 border border-zinc-300 text-zinc-700 px-1 py-0.2 rounded font-normal">تبديل</span>
                </button>

                <button
                  type="button"
                  onClick={() => openModal('cash-expense')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-black text-white text-xs font-extrabold transition shadow-xs border border-zinc-700 cursor-pointer"
                  title="تسجيل سحب مصروف مباشر من درج الكاشير وترحيله للتسويات"
                >
                  <Banknote className="w-3.5 h-3.5 text-pink-400" />
                  <span>سحب مصروف من الدرج</span>
                </button>

                <Link
                  href="/pos/orders"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-zinc-100 text-zinc-900 border border-zinc-300 text-xs font-bold transition shadow-xs"
                  title="عرض وإدارة طلبات المتجر الإلكتروني المعتمدة وحالاتها"
                >
                  <Layers className="w-3.5 h-3.5 text-zinc-700" />
                  <span>طلبات المتجر</span>
                </Link>

                <Link
                  href="/pos/deliveries"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-200 text-xs font-bold transition shadow-xs"
                  title="عرض طلبيات شركة التوصيل والشحنات وإرسال المندوبين"
                >
                  <Truck className="w-3.5 h-3.5 text-purple-600" />
                  <span>طلبيات شركة التوصيل</span>
                </Link>
              </div>
            </div>

            {/* Quick Shortcodes Buttons Ribbon (e.g. 1234 for 1 JOD items) */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-[11px] font-bold text-zinc-600 flex items-center gap-1">
                <Zap className="w-3.5 h-3.5 text-zinc-700 fill-current" />
                <span>أكواد سريعة:</span>
              </span>
              {quickShortcuts.length === 0 && (
                <span className="text-[11px] text-zinc-400 font-medium">
                  لا توجد أكواد سريعة مضافة حالياً.
                </span>
              )}
              {quickShortcuts.map((qs) => (
                <button
                  key={qs.code}
                  type="button"
                  onClick={() => handleQuickCodeClick(qs)}
                  className={`px-3 py-1.5 rounded-lg text-white font-bold text-xs shadow-xs transition flex items-center gap-1.5 active:scale-95 ${qs.color}`}
                  title={`إدخال سريع: اضغط هنا أو اكتب ${qs.code} ثم Enter`}
                >
                  <span className="bg-black/30 px-1.5 py-0.2 rounded font-mono text-[10px]">{qs.code}</span>
                  <span>{qs.name}</span>
                  <span className="text-[10px] opacity-90">({qs.label})</span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setSettingsActiveTab('quickcodes');
                  setIsSettingsModalOpen(true);
                }}
                className="px-2.5 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold text-xs transition border border-zinc-200 flex items-center gap-1"
                title="تعديل أو إضافة أكواد سريعة للأقسام"
              >
                <Edit3 className="w-3 h-3 text-zinc-600" />
                <span>تعديل/إضافة كود</span>
              </button>
            </div>

            {/* Main Barcode & Code Scanner Input */}
            <div className="relative flex items-center">
              <input 
                ref={searchInputRef}
                type="text" 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder={`امسح باركود الصنف أو باركود الفاتورة بالليزر، أو اكتب الكود السريع... (${shortcuts.focusScanner})`} 
                className="w-full border-2 border-zinc-300 focus:border-black focus:ring-1 focus:ring-black bg-white rounded-xl ps-11 pe-4 py-3 outline-none text-sm font-semibold text-zinc-900 shadow-sm transition-all"
                autoFocus
              />
              <Barcode className="w-5 h-5 text-zinc-700 absolute start-3.5 pointer-events-none" />
              {search && (
                <button 
                  onClick={() => { setSearch(''); searchInputRef.current?.focus(); }}
                  className="absolute end-3 text-zinc-400 hover:text-zinc-600 text-xs font-bold"
                >
                  مسح
                </button>
              )}
            </div>
          </div>

          {/* High-Speed Mall Table (NO Images, Compact, High-Density Rows) */}
          <div className="flex-grow overflow-y-auto bg-white rounded-2xl border border-zinc-200 shadow-xs flex flex-col">
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-right border-collapse text-xs md:text-sm">
                <thead className="bg-zinc-100 sticky top-0 border-b border-zinc-200 text-zinc-800 font-bold z-10">
                  <tr>
                    <th className="py-2.5 px-3">الباركود / الكود</th>
                    <th className="py-2.5 px-3">اسم المنتج</th>
                    <th className="py-2.5 px-3">الدرجة / الحجم</th>
                    <th className="py-2.5 px-3">السعر</th>
                    <th className="py-2.5 px-3 text-center">إضافة سريعة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {filteredProducts.map((product) => {
                    return product.variants.map((v: any, vIdx: number) => {
                      const displayCode = v.barcode || product.sku || product.id.slice(0, 8);
                      const isQuickCode = displayCode === '1234' || displayCode === '2222' || displayCode === '3333' || displayCode === '5555';

                      return (
                        <tr 
                          key={`${product.id}-${v.id || vIdx}`}
                          className="hover:bg-zinc-100/70 transition-colors group cursor-pointer"
                          onClick={() => {
                            handleAddVariantDirect(product, v);
                            playBeep();
                            searchInputRef.current?.focus();
                          }}
                        >
                          <td className="py-2.5 px-3 font-mono font-bold text-zinc-600">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] ${isQuickCode ? 'bg-zinc-900 text-white font-black' : 'bg-zinc-100 text-zinc-700'}`}>
                              <Barcode className="w-3 h-3 text-zinc-400" />
                              <span>{displayCode}</span>
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-bold text-zinc-900">
                            {product.nameAr}
                          </td>
                          <td className="py-2.5 px-3 text-zinc-600">
                            <div className="flex items-center gap-1.5">
                              {v.colorHex && (
                                <span className="w-3 h-3 rounded-full border border-zinc-300 shrink-0" style={{ backgroundColor: v.colorHex }} />
                              )}
                              <span>{v.shade || v.size || 'قياسي'}</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 font-black text-zinc-900 font-mono">
                            {((v.price) / 1000).toFixed(3)} د.أ
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenAddOrEditPosModal(product);
                                }}
                                className="p-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs transition border border-zinc-200"
                                title="تعديل بيانات وسعر هذا الصنف"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAddVariantDirect(product, v);
                                  playBeep();
                                  searchInputRef.current?.focus();
                                }}
                                className="px-3 py-1 rounded-lg bg-zinc-900 text-white group-hover:bg-black font-bold text-xs transition shadow-xs"
                              >
                                + إضافة
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    });
                  })}

                  {filteredProducts.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-zinc-400">
                        <Barcode className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
                        <p className="font-bold text-sm">لم يتم العثور على منتج يطابق الباركود أو الاسم.</p>
                        <p className="text-xs text-zinc-500 mt-1">امسح الباركود بجهاز القراءة أو أدخل كود الاختصار (مثل: 1234).</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Cart & Checkout Panel (Wider Layout for fast checkout) */}
        <div
          className={`w-full md:w-[48%] lg:w-[50%] bg-white border-r border-zinc-200 flex flex-col h-full shadow-lg ${
            mobileTab === 'cart' ? 'flex' : 'hidden md:flex'
          }`}
        >
          <div className="p-3 border-b border-zinc-100 shrink-0 flex items-center gap-2">
            <div className="relative flex-1">
              <input 
                type="text" 
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="اسم العميل (عميل نقدي افتراضياً)" 
                className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs font-bold outline-hidden focus:border-black focus:ring-1 focus:ring-black"
              />
            </div>
            {customerName && customerName !== 'عميل نقدي' && (
              <button
                type="button"
                onClick={() => setCustomerName('عميل نقدي')}
                className="px-2.5 py-2 text-zinc-500 hover:text-black border border-zinc-200 hover:border-zinc-400 rounded-xl text-xs font-bold shrink-0 bg-zinc-50 transition"
                title="إعادة التعيين لعميل نقدي"
              >
                نقدي
              </button>
            )}
          </div>

          <div className="flex-grow overflow-y-auto p-3 space-y-3">
            {cart.map((item) => (
              <div key={item.variantId} className="flex flex-col gap-2 border-b pb-3 text-xs md:text-sm bg-white p-2.5 rounded-xl border border-zinc-100 shadow-2xs">
                <div className="flex justify-between items-start gap-2">
                  <div className="flex-grow min-w-0">
                    <h4 className="font-bold text-zinc-900 truncate">{item.name}</h4>
                    <p className="text-[10px] text-zinc-500 font-mono">{item.size} | SKU: {item.sku}</p>
                  </div>
                  <button 
                    onClick={() => handleRemoveItem(item.variantId)}
                    className="text-red-500 hover:text-red-700 text-xs shrink-0 hover:underline"
                  >
                    إزالة
                  </button>
                </div>
                
                <div className="flex justify-between items-center pt-1">
                  <div className="flex items-center border rounded-lg overflow-hidden bg-zinc-50">
                    <button 
                      onClick={() => handleUpdateQty(item.variantId, -1)}
                      className="px-2.5 py-0.5 bg-zinc-100 hover:bg-zinc-200 font-bold"
                    >
                      -
                    </button>
                    <span className="px-3 font-bold text-xs">{item.quantity}</span>
                    <button 
                      onClick={() => handleUpdateQty(item.variantId, 1)}
                      className="px-2.5 py-0.5 bg-zinc-100 hover:bg-zinc-200 font-bold"
                    >
                      +
                    </button>
                  </div>
                  <span className="font-bold text-zinc-800 font-mono">
                    {((item.price * item.quantity) / 1000).toFixed(3)} د.أ
                  </span>
                </div>

                {/* Line Item Discount (خصم خاص على الصنف) */}
                <div className="flex items-center justify-between gap-2 bg-zinc-50 px-2.5 py-1.5 rounded-lg border border-zinc-200">
                  <span className="text-[11px] font-bold text-zinc-700">خصم على هذا المنتج:</span>
                  <div className="flex items-center gap-1">
                    <span className="text-zinc-400 font-mono text-xs">-</span>
                    <input 
                      type="text" 
                      inputMode="decimal"
                      value={item.discount || ''}
                      placeholder="0.00"
                      onChange={(e) => handleUpdateItemDiscount(item.variantId, e.target.value)}
                      className="w-16 border border-zinc-300 rounded px-1.5 py-0.5 text-center text-xs font-bold text-zinc-900 outline-none focus:border-black bg-white font-mono"
                    />
                    <span className="text-[10px] font-bold text-zinc-500">د.أ</span>
                  </div>
                </div>
              </div>
            ))}

            {cart.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-zinc-400 py-12">
                <span className="text-xs">السلة فارغة</span>
              </div>
            )}
          </div>

          {/* Checkout Totals & Submit */}
          <div className="bg-zinc-50 p-4 border-t space-y-3 shrink-0">
            <div className="space-y-2 text-xs md:text-sm text-zinc-600">
              <div className="flex justify-between">
                <span>المجموع الفرعي للأصناف</span>
                <span className="font-mono">{(getSubtotal() / 1000).toFixed(3)} د.أ</span>
              </div>

              {getItemDiscountsTotal() > 0 && (
                <div className="flex justify-between text-zinc-800 font-medium">
                  <span>مجموع خصومات الأصناف</span>
                  <span className="font-mono">-{(getItemDiscountsTotal() / 1000).toFixed(3)} د.أ</span>
                </div>
              )}

              <div className="flex justify-between items-center">
                <span className="font-bold text-zinc-700">خصم إضافي على الفاتورة</span>
                <div className="flex items-center gap-1">
                  <span className="text-zinc-400 font-mono text-xs">-</span>
                  <input 
                    type="text" 
                    inputMode="decimal"
                    value={discountAmount}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9.]/g, '');
                      const parts = val.split('.');
                      const clean = parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : val;
                      setDiscountAmount(clean);
                    }}
                    placeholder="0.00"
                    className="w-20 border border-zinc-300 rounded px-2 py-0.5 text-center text-xs font-bold text-zinc-900 outline-none focus:border-black bg-white font-mono"
                  />
                  <span className="text-[11px] font-bold text-zinc-500">د.أ</span>
                </div>
              </div>

              {getDiscount() > 0 && (
                <div className="flex justify-between text-zinc-900 font-bold">
                  <span>إجمالي الخصم الممنوح</span>
                  <span className="font-mono">-{(getDiscount() / 1000).toFixed(3)} د.أ</span>
                </div>
              )}

              {taxEnabled && (
                <div className="flex justify-between">
                  <span>ضريبة المبيعات ({taxRate}%)</span>
                  <span className="font-mono">{(getTax() / 1000).toFixed(3)} د.أ</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold text-zinc-900 pt-1.5 border-t">
                <span>الإجمالي الكلي المطلوب</span>
                <span className="text-xl text-black font-mono font-black">
                  {(getGrandTotal() / 1000).toFixed(3)} د.أ
                </span>
              </div>
            </div>

            {/* 4 Payment Methods: CASH, CARD, WALLET, CREDIT */}
            <div className="space-y-2">
              <label className="block text-[11px] font-bold text-zinc-600">طريقة الدفع والتسوية:</label>
              <div className="grid grid-cols-4 gap-1.5 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('CASH')}
                  className={`py-2 px-1 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all ${
                    paymentMethod === 'CASH'
                      ? 'bg-black text-white border-black shadow-xs'
                      : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                  }`}
                >
                  <Banknote className="w-4 h-4" />
                  <span>نقدي</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod('CARD')}
                  className={`py-2 px-1 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all ${
                    paymentMethod === 'CARD'
                      ? 'bg-black text-white border-black shadow-xs'
                      : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                  }`}
                >
                  <CreditCard className="w-4 h-4" />
                  <span>فيزا</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod('WALLET')}
                  className={`py-2 px-1 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all ${
                    paymentMethod === 'WALLET'
                      ? 'bg-black text-white border-black shadow-xs'
                      : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                  }`}
                >
                  <Wallet className="w-4 h-4" />
                  <span>محافظ CliQ</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setPaymentMethod('CREDIT');
                    if (!customerName || customerName === 'عميل نقدي' || !customerPhone) {
                      setShowCreditCustomerModal(true);
                    }
                  }}
                  className={`py-2 px-1 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all ${
                    paymentMethod === 'CREDIT'
                      ? 'bg-black text-white border-black shadow-xs'
                      : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                  }`}
                >
                  <Clock className="w-4 h-4" />
                  <span>بيع آجل</span>
                </button>
              </div>
            </div>

            {/* WALLET / CliQ Payment Fields */}
            {paymentMethod === 'WALLET' && (
              <div className="space-y-2 text-xs border-t pt-2 bg-zinc-50 p-2.5 rounded-xl border-zinc-200">
                <label className="block font-bold text-zinc-700">رقم المحفظة أو مرجع تحويل CliQ</label>
                <input 
                  type="text" 
                  value={walletRef}
                  onChange={(e) => setWalletRef(e.target.value)}
                  placeholder="مثال: CliQ ID أو هاتف المحفظة..."
                  className="w-full border border-zinc-300 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-black bg-white"
                />
              </div>
            )}

            {/* CREDIT (بيع آجل / ذمم) Compact Summary Card (Saves Cart Space) */}
            {paymentMethod === 'CREDIT' && (
              <div className="border-2 border-zinc-900 bg-zinc-50 p-2.5 rounded-xl text-xs space-y-2 animate-fade-in">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-zinc-900 flex items-center gap-1.5 text-xs">
                    <Clock className="w-4 h-4 text-zinc-700" />
                    فاتورة بيع آجل (ذمة)
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowCreditCustomerModal(true)}
                    className="text-[11px] font-bold text-blue-600 hover:text-blue-800 underline flex items-center gap-1 cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    {customerName && customerName !== 'عميل نقدي' ? 'تعديل البيانات' : 'تحديد الزبونة'}
                  </button>
                </div>

                {customerName && customerName !== 'عميل نقدي' ? (
                  <div className="bg-white border border-zinc-200 rounded-lg p-2.5 space-y-1.5 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <span className="font-black text-zinc-900 text-xs">{customerName}</span>
                      <span className="text-[11px] font-mono text-zinc-600 font-bold" dir="ltr">{customerPhone || 'بدون هاتف'}</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-zinc-600 border-t border-zinc-100 pt-1">
                      <span>الاستحقاق: <strong className="text-zinc-800">{creditDueDate || 'غير محدد'}</strong></span>
                      {customerCreditInfo?.found && customerCreditInfo.totalDebtFils > 0 && (
                        <span className="text-[10px] bg-rose-50 text-rose-700 font-black px-1.5 py-0.5 rounded border border-rose-200">
                          ذمة سابقة: {(customerCreditInfo.totalDebtFils / 1000).toFixed(3)} د.أ
                        </span>
                      )}
                    </div>
                    {creditNotes && (
                      <p className="text-[10px] text-zinc-500 truncate border-t border-zinc-100 pt-1">
                        ملاحظة: {creditNotes}
                      </p>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowCreditCustomerModal(true)}
                    className="w-full py-2.5 bg-black hover:bg-zinc-800 text-white rounded-lg text-center font-bold text-xs flex items-center justify-center gap-2 transition shadow-xs cursor-pointer"
                  >
                    <Users className="w-4 h-4" />
                    <span>تحديد بيانات الزبونة وتاريخ الاستحقاق *</span>
                  </button>
                )}
              </div>
            )}

            {/* General Invoice Notes (Available for all payment methods) */}
            <div className="space-y-1 text-xs pt-1">
              <label className="block text-[11px] font-bold text-zinc-700 flex items-center gap-1">
                <FileText className="w-3.5 h-3.5 text-zinc-600" />
                <span>ملاحظات على الفاتورة (تطبع على الفاتورة):</span>
              </label>
              <input
                type="text"
                value={invoiceNotes}
                onChange={(e) => setInvoiceNotes(e.target.value)}
                placeholder="اكتب أي ملاحظة أو شرط خاص ليظهر على الفاتورة المطبوعة..."
                className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs outline-none focus:border-black focus:ring-1 focus:ring-black bg-white transition shadow-2xs font-medium"
              />
            </div>

            <button
              onClick={handleCheckout}
              disabled={isPending || cart.length === 0}
              className="w-full text-white font-extrabold py-3.5 rounded-xl transition-all shadow-md disabled:opacity-50 text-sm flex items-center justify-center gap-2 active:scale-98 bg-black hover:bg-zinc-800"
            >
              {isPending ? (
                <span>جاري حفظ ومعالجة الفاتورة...</span>
              ) : paymentMethod === 'CREDIT' ? (
                <>
                  <Clock className="w-4 h-4" />
                  <span>تأكيد تسجيل الفاتورة في البيع الآجل</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>تأكيد الدفع وإصدار الفاتورة</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* PRODUCT DETAILS & NOTES DIALOG DRAWER */}
      {selectedProduct && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end md:items-center justify-center p-0 md:p-4 animate-fade-in">
          <div className="bg-white rounded-t-2xl md:rounded-lg p-6 max-w-lg w-full shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b pb-3">
              <div>
                <h3 className="text-xl font-bold text-[var(--color-charcoal-900)]">{selectedProduct.nameAr}</h3>
                <span className="text-[10px] text-zinc-400">SKU: {selectedProduct.sku}</span>
              </div>
              <button
                onClick={() => setSelectedProduct(null)}
                className="text-zinc-400 hover:text-zinc-600 text-xl font-bold px-2"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {selectedProduct.shortDescription && (
              <p className="text-xs text-zinc-650 leading-relaxed bg-zinc-50 p-2.5 rounded border border-zinc-100">
                {selectedProduct.shortDescription}
              </p>
            )}

            {/* Accords Breakdown Section */}
            {selectedProduct.accords && selectedProduct.accords.length > 0 && (
              <div className="pt-2">
                <ProductMainAccords accords={selectedProduct.accords} />
              </div>
            )}



            {/* Variant Shade / Size selector buttons */}
            <div className="space-y-2 pt-3 border-t">
              <h4 className="text-xs font-bold text-neutral-800">اختر الدرجة أو الحجم للإضافة للسلة:</h4>
              <div className="grid grid-cols-2 gap-3">
                {selectedProduct.variants.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => handleAddVariant(v)}
                    disabled={!v.isActive}
                    className="flex flex-col items-center justify-center p-3 border border-zinc-200 rounded-lg hover:border-black hover:bg-zinc-100 transition-all text-center disabled:opacity-40 active:scale-95"
                  >
                    <div className="flex items-center gap-1.5 justify-center mb-1">
                      {v.colorHex && (
                        <span
                          className="w-3.5 h-3.5 rounded-full border border-zinc-300 shadow-xs"
                          style={{ backgroundColor: v.colorHex }}
                        />
                      )}
                      <span className="font-bold text-zinc-900 text-xs">
                        {v.shade || v.size}
                      </span>
                    </div>
                    {v.colorName && (
                      <span className="text-[10px] text-zinc-500 font-medium">
                        {v.colorName}
                      </span>
                    )}
                    <span className="text-xs text-zinc-900 font-black font-mono mt-1">
                      {(v.price / 1000).toFixed(3)} د.أ
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}


      {/* SCREEN LOCK OVERLAY PROMPT */}
      {isLocked && (
        <div className="fixed inset-0 bg-neutral-950/95 z-55 flex flex-col items-center justify-center p-6 text-white text-center">
          <div className="max-w-sm w-full space-y-6">
            <div className="space-y-2">
              <h2 className="text-2xl font-bold font-heading text-[var(--color-champagne-400)]">شاشة POS مقفلة</h2>
              <p className="text-xs text-neutral-400">يرجى إدخال كلمة المرور للمتابعة</p>
            </div>

            <div className="space-y-4">
              <input
                type="password"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleUnlockAction()}
                placeholder="كلمة المرور"
                className="w-full text-center tracking-widest text-2xl bg-neutral-900 border border-neutral-700 rounded py-3 outline-none text-white focus:border-[var(--color-champagne-600)]"
              />
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={handleUnlockAction}
                  disabled={isPending}
                  className="bg-[var(--color-charcoal-900)] hover:bg-[var(--color-charcoal-800)] text-white py-3 rounded font-bold text-sm transition-colors disabled:opacity-50"
                >
                  {isPending ? 'جاري التحقق...' : 'فتح الشاشة'}
                </button>
                <button
                  onClick={handleLogoutAction}
                  className="bg-red-950/60 hover:bg-red-900 text-red-300 hover:text-white py-3 rounded font-bold text-sm transition-colors"
                >
                  خروج
                </button>
              </div>
            </div>
          </div>
        </div>
      )}


      {/* INACTIVITY SHUTTER IDLE PRIVACY OVERLAY */}
      {isIdle && (
        <div 
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            setIsIdle(false);
          }}
          className="fixed inset-0 z-54 flex flex-col items-center justify-center p-6 text-white text-center animate-fade-in select-none bg-zinc-950/95 backdrop-blur-md cursor-pointer"
          style={{ backgroundImage: 'radial-gradient(ellipse at center, rgba(30,27,75,0.7) 0%, rgba(9,9,11,0.98) 100%)' }}
        >
          <div className="relative z-10 w-full max-w-md space-y-6 flex flex-col items-center drop-shadow-2xl">
            {/* Logo */}
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-pink-600 to-purple-600 rounded-3xl blur-lg opacity-40 group-hover:opacity-75 transition duration-1000 group-hover:duration-200 animate-pulse"></div>
              <div className="relative w-32 h-32 md:w-36 md:h-36 rounded-3xl p-4 bg-white/10 backdrop-blur-xl border border-white/20 shadow-2xl flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img 
                  src="/logo.png" 
                  alt="غزل للمكياج والعناية" 
                  className="w-full h-full object-contain filter drop-shadow-lg"
                />
              </div>
            </div>

            {/* Store Title */}
            <div className="text-center space-y-1">
              <h2 className="text-xl md:text-2xl font-black font-heading text-white tracking-wide">
                غزل للمكياج والعطور
              </h2>
              <p className="text-xs text-pink-300 font-medium font-sans">
                GHAZAL Cosmetics & Care
              </p>
            </div>

            {/* Clock & Date in English Numerals */}
            <div className="space-y-1.5 bg-black/40 border border-white/10 px-6 py-4 rounded-2xl backdrop-blur-md w-full">
              {posIdleShowClock && (
                <h1 className="text-4xl md:text-5xl font-mono tracking-widest font-black text-[#facc15] drop-shadow-md">
                  {currentTime}
                </h1>
              )}
              {posIdleShowDate && (
                <p className="text-xs md:text-sm text-zinc-300 font-mono font-medium tracking-wide">
                  {currentDate}
                </p>
              )}
            </div>

            {/* Pulsing Click to Continue Button/Badge */}
            <div className="pt-2">
              <div className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[#E6007E] hover:bg-pink-600 text-white font-black text-sm md:text-base shadow-lg shadow-pink-600/30 animate-pulse border border-pink-400/30">
                <span>انقر للمتابعة</span>
                <span className="text-xs font-normal opacity-80">(Click to continue)</span>
              </div>
            </div>
          </div>
        </div>
      )}


      {/* MODAL: إضافة أو تعديل منتج كاشير مباشر (مع سعر التكلفة والبيع وقراءة الباركود) */}
      {isAddPosModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4" dir="rtl">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 md:p-6 shadow-2xl border border-zinc-200 space-y-4 max-h-[92vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <div className="flex items-center gap-2 text-zinc-900 font-bold">
                <Barcode className="w-5 h-5 text-black" />
                <div>
                  <h3 className="text-base md:text-lg font-bold">إضافة أو تعديل منتج كاشير مباشر</h3>
                  <p className="text-[11px] text-zinc-500 font-normal">تعديل أسعار وبيانات أي صنف موجود، أو إضافة صنف جديد للكاشير</p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="text-zinc-400 hover:text-zinc-700 p-1.5 rounded-lg hover:bg-zinc-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mode Tabs */}
            <div className="grid grid-cols-2 rounded-xl bg-zinc-100 p-1 text-xs font-bold gap-1">
              <button
                type="button"
                onClick={() => {
                  setPosModalMode('EDIT');
                  setIsSearchingPosProduct(true);
                }}
                className={`py-2 px-3 rounded-lg transition flex items-center justify-center gap-1.5 ${
                  posModalMode === 'EDIT'
                    ? 'bg-white text-black shadow-xs font-black'
                    : 'text-zinc-600 hover:text-black'
                }`}
              >
                <Search className="w-3.5 h-3.5" />
                <span>مسح باركود أو اختيار صنف لتعديله</span>
              </button>

              <button
                type="button"
                onClick={handleSetNewProductMode}
                className={`py-2 px-3 rounded-lg transition flex items-center justify-center gap-1.5 ${
                  posModalMode === 'NEW'
                    ? 'bg-white text-black shadow-xs font-black'
                    : 'text-zinc-600 hover:text-black'
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>إضافة منتج جديد للكاش</span>
              </button>
            </div>

            {/* In EDIT Mode: Product Search & Barcode Scanner Area */}
            {posModalMode === 'EDIT' && (
              <div className="bg-zinc-50 p-3 rounded-xl border border-zinc-200 space-y-2">
                <label className="block text-xs font-bold text-zinc-700">
                  ابحث باسم الصنف أو امسح الباركود بالليزر للتعديل:
                </label>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    value={posProductSearch}
                    onChange={(e) => {
                      setPosProductSearch(e.target.value);
                      setIsSearchingPosProduct(true);
                    }}
                    onFocus={() => setIsSearchingPosProduct(true)}
                    placeholder="اكتب اسم الصنف، كود الباركود، أو وجه قارئ الليزر..."
                    className="w-full border border-zinc-300 rounded-xl ps-9 pe-8 py-2 text-xs font-bold bg-white focus:border-black outline-none"
                  />
                  <Search className="w-4 h-4 text-zinc-400 absolute start-3 pointer-events-none" />
                  {posProductSearch && (
                    <button
                      type="button"
                      onClick={() => {
                        setPosProductSearch('');
                        setIsSearchingPosProduct(false);
                      }}
                      className="absolute end-2.5 text-zinc-400 hover:text-zinc-700"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Autocomplete Dropdown */}
                {isSearchingPosProduct && posProductSearch.trim() && (
                  <div className="max-h-48 overflow-y-auto divide-y divide-zinc-100 bg-white border border-zinc-200 rounded-xl shadow-lg mt-1 z-10">
                    {modalSearchResults.map(p => {
                      const variant = p.variants[0];
                      const code = variant?.barcode || p.sku;
                      const priceFormatted = ((variant?.price || 1000) / 1000).toFixed(3);
                      return (
                        <div
                          key={p.id}
                          onClick={() => handleSelectProductToEdit(p, variant)}
                          className="p-2.5 hover:bg-zinc-50 cursor-pointer flex items-center justify-between transition text-xs"
                        >
                          <div>
                            <p className="font-bold text-zinc-900">{p.nameAr}</p>
                            <p className="text-[10px] text-zinc-500 font-mono">
                              كود/باركود: {code} | {variant?.shade || p.shortDescription || 'عام'}
                            </p>
                          </div>
                          <div className="text-end">
                            <span className="font-black text-black font-mono">{priceFormatted} د.أ</span>
                            <span className="block text-[10px] text-zinc-500 font-bold">انقر للتعديل ✏️</span>
                          </div>
                        </div>
                      );
                    })}
                    {modalSearchResults.length === 0 && (
                      <div className="p-3 text-center text-xs text-zinc-500">
                        لم يتم العثور على صنف مطابق لهذا البحث أو الباركود.
                        <button
                          type="button"
                          onClick={() => {
                            setPosModalMode('NEW');
                            setNewPosCode(posProductSearch.trim());
                            setPosProductSearch('');
                            setIsSearchingPosProduct(false);
                          }}
                          className="block mx-auto mt-1 font-bold text-black underline"
                        >
                          + إضافة صنف جديد للكاش بهذا الباركود
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Active Edit Banner */}
                {editingCustomProductId && (
                  <div className="bg-zinc-100 border border-zinc-300 rounded-xl p-3 flex items-center justify-between text-xs mt-2">
                    <div className="space-y-0.5">
                      <span className="text-[10px] font-bold text-zinc-500 block">الصنف المحدد المعروض للتعديل:</span>
                      <span className="font-black text-zinc-900 text-sm">{newPosName}</span>
                      <span className="text-[11px] font-mono text-zinc-600 block">كود/باركود: {newPosCode}</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleSetNewProductMode}
                      className="px-2.5 py-1.5 bg-white hover:bg-zinc-200 border border-zinc-300 rounded-lg text-xs font-bold text-zinc-700 transition"
                      title="العودة لإضافة منتج جديد"
                    >
                      إلغاء التعديل
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* In NEW Mode: Notice Badge */}
            {posModalMode === 'NEW' && (
              <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3 flex items-center gap-2.5 text-xs text-zinc-700">
                <Plus className="w-4 h-4 text-black shrink-0" />
                <span>أنت الآن في وضع <strong>إضافة منتج جديد</strong> للكاش. أدخل بياناته أو امسح باركود جديد بالليزر.</span>
              </div>
            )}

            {/* The Form */}
            <form onSubmit={handleSaveCustomPosProduct} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">اسم المنتج أو البند *</label>
                <input
                  type="text"
                  required
                  value={newPosName}
                  onChange={(e) => setNewPosName(e.target.value)}
                  placeholder="مثال: عطر مسك خاص، عباية كتان، قلم كحل..."
                  className="w-full border border-zinc-300 rounded-xl px-3.5 py-2.5 text-sm focus:border-black focus:ring-1 focus:ring-black outline-none font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">الباركود أو كود التخزين (قراءة بالليزر أو يدوي) *</label>
                <div className="relative flex items-center">
                  <input
                    ref={newPosBarcodeInputRef}
                    type="text"
                    required
                    value={newPosCode}
                    onChange={(e) => setNewPosCode(e.target.value)}
                    placeholder="امسح بالليزر أو أدخل كود الصنف..."
                    className="w-full border border-zinc-300 rounded-xl ps-10 pe-3.5 py-2.5 text-sm font-mono font-bold focus:border-black focus:ring-1 focus:ring-black outline-none"
                  />
                  <Barcode className="w-4 h-4 text-zinc-500 absolute start-3 pointer-events-none" />
                </div>
                <p className="text-[11px] text-zinc-500 mt-1">
                  💡 عند استخدام قارئ الليزر أثناء فتح هذه النافذة، سيتعرف النظام تلقائياً على الصنف إذا كان موجوداً لعرضه للتعديل، أو سيملأ كود الباركود الجديد تلقائياً.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">سعر التكلفة (د.أ)</label>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    value={newPosCostPrice}
                    onChange={(e) => setNewPosCostPrice(e.target.value)}
                    placeholder="0.000"
                    className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs font-bold text-zinc-800 focus:border-black focus:ring-1 focus:ring-black outline-none font-mono"
                    dir="ltr"
                  />
                  <span className="text-[10px] text-zinc-400">تكلفة القطعة</span>
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">سعر البيع الحالي (د.أ) *</label>
                  <input
                    type="number"
                    step="0.05"
                    min="0.05"
                    required
                    value={newPosPrice}
                    onChange={(e) => setNewPosPrice(e.target.value)}
                    placeholder="1.000"
                    className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs font-bold text-black focus:border-black focus:ring-1 focus:ring-black outline-none font-mono"
                    dir="ltr"
                  />
                  <span className="text-[10px] text-zinc-500">المطلوب سداده</span>
                </div>
                <div>
                  <label className="block text-xs font-bold text-rose-700 mb-1">السعر قبل الخصم (د.أ)</label>
                  <input
                    type="number"
                    step="0.05"
                    value={newPosCompareAtPrice}
                    onChange={(e) => setNewPosCompareAtPrice(e.target.value)}
                    placeholder="اختياري للعروض"
                    className="w-full border border-rose-300 bg-rose-50/40 rounded-xl px-3 py-2 text-xs font-bold text-rose-900 focus:border-rose-500 outline-none font-mono"
                    dir="ltr"
                  />
                  <span className="text-[10px] text-rose-600 font-bold block truncate">
                    {newPosCompareAtPrice && parseFloat(newPosCompareAtPrice) > parseFloat(newPosPrice)
                      ? `خصم -${Math.round(((parseFloat(newPosCompareAtPrice) - parseFloat(newPosPrice)) / parseFloat(newPosCompareAtPrice)) * 100)}%`
                      : 'سعر العرض اختياري'}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">القسم أو التصنيف</label>
                <select
                  value={newPosCategory}
                  onChange={(e) => setNewPosCategory(e.target.value)}
                  className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs font-bold bg-white focus:border-black outline-none"
                >
                  <option value="عام">عام</option>
                  <option value="عطور">عطور</option>
                  <option value="مكياج">مكياج</option>
                  <option value="عناية بالبشرة">عناية بالبشرة</option>
                  <option value="العناية بالشعر">العناية بالشعر</option>
                  <option value="أدوات التجميل">أدوات التجميل</option>
                  <option value="عبايات وملابس">عبايات وملابس</option>
                  <option value="إكسسوارات">إكسسوارات</option>
                  <option value="هدايا وعروض">هدايا وعروض</option>
                </select>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  className="flex-1 bg-black hover:bg-zinc-800 text-white font-bold py-2.5 rounded-xl text-sm transition shadow-sm flex items-center justify-center gap-2"
                >
                  {posModalMode === 'EDIT' ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span>حفظ التعديلات وتحديث السعر</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      <span>حفظ وإضافة للسلة فوراً</span>
                    </>
                  )}
                </button>

                {editingCustomProductId && customPosProducts.some(p => p.id === editingCustomProductId) && (
                  <button
                    type="button"
                    onClick={() => handleDeleteCustomPosProduct(editingCustomProductId)}
                    className="px-3 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold rounded-xl text-sm transition"
                    title="حذف هذا الصنف من قائمة الكاش"
                  >
                    حذف الصنف
                  </button>
                )}

                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold rounded-xl text-sm transition"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


      {/* ==============================================================
          MODAL 1: HIGH-GRADE THERMAL RECEIPT (فاتورة الكاشير الحرارية 80mm)
      ============================================================== */}
      {showReceiptModal && receiptData && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs z-[100] flex items-center justify-center p-4 overflow-y-auto" dir="rtl">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-zinc-200 flex flex-col items-center animate-fade-in my-auto">
            
            {/* Header Alert & Prompt */}
            <div className="w-full flex items-center justify-between pb-3 mb-3 border-b border-zinc-100">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <h3 className="font-extrabold text-zinc-900 text-base">تم إتمام العملية بنجاح!</h3>
              </div>
              <button
                onClick={() => { setShowReceiptModal(false); searchInputRef.current?.focus(); }}
                className="text-zinc-400 hover:text-zinc-600 text-sm font-bold"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Visual 80mm/58mm Thermal Receipt Preview (Exact Receipt Output) */}
            <div
              id="thermal-receipt-printable"
              style={{ maxWidth: printingSettings.receiptPaperWidth === '58mm' ? '260px' : '340px' }}
              className="w-full bg-white border border-zinc-300 p-4 rounded-xl shadow-inner font-mono text-[11px] text-zinc-900 space-y-2 select-text"
            >
              {/* Receipt Header & Logo */}
              <div className="text-center space-y-1">
                {printingSettings.showShopLogo && (
                  <img
                    src="/logo.png"
                    alt="GHAZAL Logo"
                    className="h-10 mx-auto object-contain mb-1"
                  />
                )}
                <h2 className="font-bold text-sm tracking-wider">{printingSettings.receiptHeader || 'محل غزل للمكياج والعناية'}</h2>
                <p className="text-[10px] text-zinc-600">عين الباشا - شارع القدس</p>
                <p className="text-[10px] text-zinc-600">هاتف: <span dir="ltr">+962776299243</span></p>
              </div>

              {/* Invoice Meta */}
              <div className="border-t border-b border-dashed border-zinc-400 py-1.5 space-y-0.5 text-[10px]">
                <div className="flex justify-between">
                  <span>رقم الفاتورة:</span>
                  <span className="font-bold">{receiptData.invoiceNumber || receiptData.reference}</span>
                </div>
                <div className="flex justify-between">
                  <span>المرجع:</span>
                  <span className="font-mono">{receiptData.reference}</span>
                </div>
                <div className="flex justify-between">
                  <span>التاريخ والوقت:</span>
                  <span>{new Date(receiptData.createdAt || Date.now()).toLocaleDateString('ar-JO-u-nu-latn')} {new Date(receiptData.createdAt || Date.now()).toLocaleTimeString('ar-JO-u-nu-latn', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div className="flex justify-between">
                  <span>الكاشير:</span>
                  <span>{receiptData.cashierName || activeCashierName}</span>
                </div>
                {receiptData.customerName && receiptData.customerName !== 'عميل نقدي' && (
                  <div className="flex justify-between font-bold text-zinc-900">
                    <span>العميل:</span>
                    <span>{receiptData.customerName}</span>
                  </div>
                )}
                {receiptData.customerPhone && (
                  <div className="flex justify-between">
                    <span>الهاتف:</span>
                    <span dir="ltr">{receiptData.customerPhone}</span>
                  </div>
                )}
                {receiptData.paymentMethod === 'CREDIT' && receiptData.dueDate && (
                  <div className="flex justify-between font-bold text-amber-800 bg-amber-50 px-1 rounded">
                    <span>استحقاق الذمة:</span>
                    <span>{receiptData.dueDate}</span>
                  </div>
                )}
                {receiptData.notes && (
                  <div className="flex justify-between font-bold text-zinc-800 bg-zinc-50 px-1.5 py-0.5 rounded border border-zinc-200">
                    <span>ملاحظات:</span>
                    <span className="text-right">{receiptData.notes}</span>
                  </div>
                )}
              </div>

              {/* Items Table */}
              <div>
                <table className="w-full text-right border-collapse text-[10px]">
                  <thead>
                    <tr className="border-b border-zinc-300 text-zinc-700 font-bold">
                      <th className="py-1">الصنف</th>
                      <th className="py-1 text-center">الكمية</th>
                      <th className="py-1 text-left">الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200">
                    {(receiptData.items || []).map((it: any, idx: number) => (
                      <tr key={idx} className="py-1">
                        <td className="py-1">
                          <p className="font-bold leading-tight">{it.name}</p>
                          {(it.shade || it.size) && it.shade !== 'كاش' && it.size !== 'سريع' && (
                            <span className="text-[9px] text-zinc-500">
                              {it.shade ? `درجة ${it.shade}` : it.size}
                            </span>
                          )}
                        </td>
                        <td className="py-1 text-center font-bold">{it.quantity}</td>
                        <td className="py-1 text-left font-bold" dir="ltr">
                          {((it.total || (it.unitPrice * it.quantity)) / 1000).toFixed(3)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Financial Totals */}
              <div className="border-t border-dashed border-zinc-400 pt-1.5 space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span>المجموع الفرعي:</span>
                  <span dir="ltr">{((receiptData.subtotal || 0) / 1000).toFixed(3)} د.أ</span>
                </div>
                {receiptData.discount > 0 && (
                  <div className="flex justify-between text-rose-700">
                    <span>الخصم:</span>
                    <span dir="ltr">-{((receiptData.discount || 0) / 1000).toFixed(3)} د.أ</span>
                  </div>
                )}
                {receiptData.taxAmount > 0 && (
                  <div className="flex justify-between text-[10px] text-zinc-600">
                    <span>ضريبة المبيعات:</span>
                    <span dir="ltr">{((receiptData.taxAmount || 0) / 1000).toFixed(3)} د.أ</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-black border-t-2 border-b-2 border-zinc-900 py-1">
                  <span>المجموع النهائي:</span>
                  <span dir="ltr">{((receiptData.total || 0) / 1000).toFixed(3)} د.أ</span>
                </div>

                <div className="flex justify-between text-[10px] pt-1">
                  <span>طريقة الدفع:</span>
                  <span className="font-bold">
                    {receiptData.paymentMethod === 'CREDIT'
                      ? 'بيع آجل (ذمم)'
                      : receiptData.paymentMethod === 'WALLET'
                      ? 'محفظة / CliQ'
                      : receiptData.paymentMethod === 'CARD'
                      ? 'بطاقة (فيزا)'
                      : 'نقدي (كاش)'}
                  </span>
                </div>
              </div>

              {/* Store Policy */}
              <div className="border-t border-dashed border-zinc-300 pt-2 text-center text-[9px] text-zinc-500 space-y-0.5">
                <p className="font-bold text-zinc-700">{printingSettings.receiptFooter ? printingSettings.receiptFooter.split('\n')[0] : 'شكراً لتسوقكم من محل غزل ❤️'}</p>
                <p>{printingSettings.receiptFooter && printingSettings.receiptFooter.includes('\n') ? printingSettings.receiptFooter.split('\n').slice(1).join(' ') : 'البضاعة المباعة تستبدل خلال 3 أيام مع إبراز أصل الفاتورة بحالتها الأصلية.'}</p>
              </div>

              {/* Scannable Invoice Barcode for Return & Exchange (Code 128) */}
              {printingSettings.showBarcodeOnReceipt && (
                <div className="border-t border-dashed border-zinc-400 pt-2 text-center flex flex-col items-center">
                  <BarcodeSvg 
                    value={receiptData.reference || receiptData.invoiceNumber || 'GHAZAL-POS'} 
                    height={54} 
                    barHeight={36} 
                    showText={true} 
                  />
                </div>
              )}
            </div>

            {/* Prompt Actions: Print (F9) vs No Receipt (Esc) */}
            <div className="w-full grid grid-cols-2 gap-3 pt-5 mt-2 border-t border-zinc-100">
              <button
                type="button"
                onClick={() => window.print()}
                className="bg-black hover:bg-zinc-800 text-white font-extrabold py-3 px-4 rounded-xl text-sm transition shadow-md flex items-center justify-center gap-2 active:scale-95"
              >
                <Printer className="w-4 h-4" />
                <span>طباعة فاتورة</span>
                <kbd className="bg-black/20 text-white px-1.5 py-0.5 rounded text-[10px] font-mono">F9</kbd>
              </button>

              <button
                type="button"
                onClick={() => { setShowReceiptModal(false); searchInputRef.current?.focus(); }}
                className="bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-extrabold py-3 px-4 rounded-xl text-sm transition flex items-center justify-center gap-2 active:scale-95"
              >
                <span>بدون فاتورة</span>
                <kbd className="bg-zinc-300 text-zinc-700 px-1.5 py-0.5 rounded text-[10px] font-mono">Esc</kbd>
              </button>
            </div>
          </div>
        </div>
      )}


      {/* ==============================================================
          MODAL 2: CREDIT / ON-ACCOUNT SALES REGISTER (سجل الذمم والبيع الآجل)
      ============================================================== */}
      {isCreditLedgerOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4" dir="rtl">
          <div className="bg-white rounded-3xl max-w-4xl w-full p-6 shadow-2xl border border-zinc-200 max-h-[92vh] flex flex-col animate-fade-in">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-zinc-100 mb-4 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-black text-white flex items-center justify-center">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-zinc-900">سجل الذمم والبيع الآجل (حسابات العملاء)</h3>
                  <p className="text-xs text-zinc-500">متابعة أرصدة الزبائن التراكمية، تحصيل وسداد الدفعات وخصمها من الذمة</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={loadCreditSales}
                  disabled={isLoadingCreditSales}
                  className="p-2 hover:bg-zinc-100 rounded-lg text-zinc-600 transition"
                  title="تحديث البيانات"
                >
                  <RefreshCw className={`w-4 h-4 ${isLoadingCreditSales ? 'animate-spin' : ''}`} />
                </button>
                <button
                  type="button"
                  onClick={closeModal}
                  className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-400 hover:text-zinc-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Quick Summary KPI Cards */}
            <div className="grid grid-cols-3 gap-3 mb-4 shrink-0">
              <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-3">
                <span className="text-[11px] font-bold text-zinc-500 block mb-1">إجمالي الذمم المستحقة (غير المحصلة)</span>
                <span className="text-base font-black font-mono text-zinc-900">
                  {(customerCreditAccounts.reduce((sum, a) => sum + a.netRemainingFils, 0) / 1000).toFixed(3)} د.أ
                </span>
              </div>
              <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-3">
                <span className="text-[11px] font-bold text-zinc-500 block mb-1">عدد الزبائن المدينين المسجلين</span>
                <span className="text-base font-black font-mono text-zinc-900">
                  {customerCreditAccounts.length} زبونة / عميل
                </span>
              </div>
              <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-3">
                <span className="text-[11px] font-bold text-zinc-500 block mb-1">إجمالي الفواتير الآجلة المعلقة</span>
                <span className="text-base font-black font-mono text-zinc-900">
                  {pendingCreditSales.length} فاتورة
                </span>
              </div>
            </div>

            {/* Filter & View Mode Controls */}
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3 shrink-0">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-3.5 h-3.5 absolute end-3 top-3 text-zinc-400 pointer-events-none" />
                <input
                  type="text"
                  value={creditFilterSearch}
                  onChange={(e) => setCreditFilterSearch(e.target.value)}
                  placeholder="ابحث باسم الزبونة، رقم الهاتف، أو رقم الفاتورة..."
                  className="w-full border border-zinc-300 rounded-xl ps-3 pe-8 py-2 text-xs font-medium outline-hidden focus:border-black bg-zinc-50 focus:bg-white transition"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Status Filter: Pending vs All */}
                <div className="flex items-center gap-1 bg-zinc-100 p-1 rounded-xl border border-zinc-200 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setCreditStatusFilter('PENDING_ONLY')}
                    className={`px-3 py-1.5 rounded-lg transition ${
                      creditStatusFilter === 'PENDING_ONLY'
                        ? 'bg-rose-700 text-white shadow-xs'
                        : 'text-zinc-600 hover:text-black'
                    }`}
                  >
                    الذمم المعلقة فقط
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreditStatusFilter('ALL')}
                    className={`px-3 py-1.5 rounded-lg transition ${
                      creditStatusFilter === 'ALL'
                        ? 'bg-black text-white shadow-xs'
                        : 'text-zinc-600 hover:text-black'
                    }`}
                  >
                    جميع الحسابات (شامل المسددين)
                  </button>
                </div>

                {/* View Mode: Customers vs Invoices */}
                <div className="flex items-center gap-1 bg-zinc-100 p-1 rounded-xl border border-zinc-200 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setCreditViewMode('CUSTOMERS')}
                    className={`px-3 py-1.5 rounded-lg transition ${
                      creditViewMode === 'CUSTOMERS'
                        ? 'bg-black text-white shadow-xs'
                        : 'text-zinc-600 hover:text-black'
                    }`}
                  >
                    حسابات الزبائن ({filteredCreditAccounts.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreditViewMode('INVOICES')}
                    className={`px-3 py-1.5 rounded-lg transition ${
                      creditViewMode === 'INVOICES'
                        ? 'bg-black text-white shadow-xs'
                        : 'text-zinc-600 hover:text-black'
                    }`}
                  >
                    الفواتير التفصيلية ({filteredCreditInvoices.length})
                  </button>
                </div>
              </div>
            </div>

            {/* Content Body: Customers View or Invoices View */}
            <div className="overflow-y-auto flex-1 border border-zinc-200 rounded-2xl bg-zinc-50/50 p-3">
              {isLoadingCreditSales ? (
                <div className="p-12 text-center text-zinc-400 text-sm">جاري تحميل سجل الذمم...</div>
              ) : pendingCreditSales.length === 0 ? (
                <div className="p-12 text-center text-zinc-400 text-sm">
                  <CheckCircle2 className="w-8 h-8 text-black mx-auto mb-2" />
                  <p className="font-bold text-zinc-800">لا توجد ذمم أو فواتير بيع آجل غير مسددة!</p>
                  <p className="text-xs text-zinc-500 mt-1">جميع الفواتير والذمم مسددة بالكامل.</p>
                </div>
              ) : creditViewMode === 'CUSTOMERS' ? (
                filteredCreditAccounts.length === 0 ? (
                  <div className="p-8 text-center text-zinc-500 text-xs">لا توجد نتائج مطابقة لبحثك</div>
                ) : (
                  <div className="space-y-3">
                    {filteredCreditAccounts.map((account) => {
                      const isExpanded = expandedCustomerKey === account.customerKey;
                      return (
                        <div key={account.customerKey} className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-2xs space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="font-extrabold text-sm text-zinc-900">{account.customerName}</h4>
                                <span className="bg-zinc-100 text-zinc-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-zinc-200">
                                  {account.invoices.length} {account.invoices.length === 1 ? 'فاتورة' : 'فواتير'}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 text-xs text-zinc-500 mt-1 font-mono">
                                {account.customerPhone ? (
                                  <a href={`tel:${account.customerPhone}`} className="hover:text-black font-bold flex items-center gap-1" dir="ltr">
                                    <Phone className="w-3 h-3 text-zinc-400" />
                                    <span>{account.customerPhone}</span>
                                  </a>
                                ) : (
                                  <span>بدون هاتف</span>
                                )}
                                {account.latestDueDate && (
                                  <span className="text-[11px] text-zinc-600 font-sans">
                                    أحدث استحقاق: <strong className="font-mono">{account.latestDueDate}</strong>
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-4">
                              <div className="text-start">
                                <span className="text-[10px] text-zinc-400 block">
                                  {account.netRemainingFils === 0 ? 'حالة الحساب' : 'المتبقي في الذمة'}
                                </span>
                                {account.netRemainingFils === 0 ? (
                                  <span className="font-mono font-black text-xs text-emerald-800 bg-emerald-50 border border-emerald-300 px-2.5 py-1 rounded-xl flex items-center gap-1">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                    <span>مسددة بالكامل ✓</span>
                                  </span>
                                ) : (
                                  <span className="font-mono font-black text-sm text-black bg-zinc-100 border border-zinc-300 px-2.5 py-1 rounded-xl block">
                                    {(account.netRemainingFils / 1000).toFixed(3)} د.أ
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-2">
                                {account.netRemainingFils > 0 ? (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenSettleDialog({
                                      customerIdentifier: account.customerPhone || account.customerName,
                                      customerName: account.customerName,
                                      customerPhone: account.customerPhone,
                                      totalRemainingFils: account.netRemainingFils
                                    })}
                                    className="px-3.5 py-2 bg-black hover:bg-zinc-800 text-white rounded-xl font-bold text-xs shadow-xs transition active:scale-95 flex items-center gap-1.5 cursor-pointer"
                                    title="سداد دفعة نقدية أو كاملة وخصمها من الذمة"
                                  >
                                    <Banknote className="w-3.5 h-3.5" />
                                    <span>سداد دفعة / سداد الذمة</span>
                                  </button>
                                ) : (
                                  <span className="px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-xl text-xs font-bold border border-emerald-200 flex items-center gap-1">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                    <span>الحساب مسدد بالكامل</span>
                                  </span>
                                )}

                                <button
                                  type="button"
                                  onClick={() => setExpandedCustomerKey(isExpanded ? null : account.customerKey)}
                                  className="px-2.5 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs font-bold transition cursor-pointer"
                                  title="عرض فواتير الزبونة التفصيلية"
                                >
                                  {isExpanded ? 'إخفاء الفواتير' : 'سجل الفواتير'}
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Expanded Invoices breakdown for this customer */}
                          {isExpanded && (
                            <div className="pt-3 border-t border-zinc-100 space-y-2">
                              <div className="text-[11px] font-bold text-zinc-500">فواتير وسجل ذمم الزبونة:</div>
                              <div className="overflow-x-auto">
                                <table className="w-full text-right text-xs border-collapse">
                                  <thead className="bg-zinc-50 text-zinc-600 font-bold border-b border-zinc-200">
                                    <tr>
                                      <th className="p-2">رقم الفاتورة</th>
                                      <th className="p-2">تاريخ الفاتورة</th>
                                      <th className="p-2">تاريخ الاستحقاق</th>
                                      <th className="p-2">قيمة الفاتورة</th>
                                      <th className="p-2">المدفوع</th>
                                      <th className="p-2">المتبقي</th>
                                      <th className="p-2 text-center">إجراء سريع</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-zinc-100">
                                    {account.invoices.map((inv: any) => {
                                      const invPaid = inv.paidAmount || 0;
                                      const invRemaining = inv.remainingAmount !== undefined ? inv.remainingAmount : Math.max(0, inv.total - invPaid);
                                      const isInvPaid = inv.paymentStatus === 'PAID' || invRemaining === 0;
                                      return (
                                        <tr key={inv.id} className="hover:bg-zinc-50">
                                          <td className="p-2 font-mono font-bold text-zinc-900">{inv.invoiceNumber}</td>
                                          <td className="p-2 text-zinc-600">{new Date(inv.createdAt).toLocaleDateString('ar-JO-u-nu-latn')}</td>
                                          <td className="p-2 font-mono">{inv.dueDate || '—'}</td>
                                          <td className="p-2 font-mono">{(inv.total / 1000).toFixed(3)} د.أ</td>
                                          <td className="p-2 font-mono text-zinc-500">{(invPaid / 1000).toFixed(3)} د.أ</td>
                                          <td className="p-2 font-mono font-bold text-black">
                                            {isInvPaid ? (
                                              <span className="text-emerald-700 font-bold">0.000 د.أ</span>
                                            ) : (
                                              `${(invRemaining / 1000).toFixed(3)} د.أ`
                                            )}
                                          </td>
                                          <td className="p-2 text-center">
                                            {isInvPaid ? (
                                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                                <span>مسددة بالكامل ✓</span>
                                              </span>
                                            ) : (
                                              <button
                                                type="button"
                                                onClick={() => handleOpenSettleDialog({
                                                  customerIdentifier: inv.id,
                                                  customerName: account.customerName,
                                                  customerPhone: account.customerPhone,
                                                  totalRemainingFils: invRemaining,
                                                  saleId: inv.id
                                                })}
                                                className="px-2 py-1 bg-zinc-100 hover:bg-black hover:text-white text-zinc-800 rounded-lg text-[11px] font-bold border border-zinc-200 transition"
                                              >
                                                سداد الفاتورة
                                              </button>
                                            )}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )
              ) : (
                /* INVOICES TABLE VIEW */
                <table className="w-full text-right border-collapse text-xs md:text-sm">
                  <thead className="bg-zinc-100 border-b border-zinc-200 text-zinc-700 font-bold sticky top-0">
                    <tr>
                      <th className="p-3">رقم الفاتورة</th>
                      <th className="p-3">اسم الزبونة / العميل</th>
                      <th className="p-3">رقم الهاتف</th>
                      <th className="p-3">تاريخ الاستحقاق</th>
                      <th className="p-3">القيمة</th>
                      <th className="p-3">المتبقي</th>
                      <th className="p-3 text-center">الإجراء</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 bg-white">
                    {filteredCreditInvoices.map((sale) => {
                      const paid = sale.paidAmount || 0;
                      const remaining = sale.remainingAmount !== undefined ? sale.remainingAmount : Math.max(0, sale.total - paid);
                      return (
                        <tr key={sale.id} className="hover:bg-zinc-50 transition">
                          <td className="p-3 font-bold font-mono text-zinc-900">
                            {sale.invoiceNumber}
                            <span className="block text-[10px] text-zinc-400 font-sans font-normal">
                              {new Date(sale.createdAt).toLocaleDateString('ar-JO-u-nu-latn')}
                            </span>
                          </td>
                          <td className="p-3 font-bold text-zinc-900">{sale.customerName}</td>
                          <td className="p-3 font-mono text-zinc-700" dir="ltr">
                            {sale.customerPhone ? (
                              <a href={`tel:${sale.customerPhone}`} className="text-zinc-900 font-bold hover:underline flex items-center gap-1">
                                <Phone className="w-3 h-3 text-zinc-400" />
                                <span>{sale.customerPhone}</span>
                              </a>
                            ) : '—'}
                          </td>
                          <td className="p-3">
                            <span className="bg-zinc-100 text-zinc-900 border border-zinc-200 px-2 py-0.5 rounded-full font-bold text-[11px] font-mono">
                              {sale.dueDate || 'غير محدد'}
                            </span>
                          </td>
                          <td className="p-3 font-mono text-zinc-600">
                            {(sale.total / 1000).toFixed(3)} د.أ
                          </td>
                          <td className="p-3 font-extrabold font-mono">
                            {sale.paymentStatus === 'PAID' || remaining === 0 ? (
                              <span className="text-emerald-700 font-bold">0.000 د.أ</span>
                            ) : (
                              <span className="text-black">{(remaining / 1000).toFixed(3)} د.أ</span>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            {sale.paymentStatus === 'PAID' || remaining === 0 ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-300">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                <span>مسددة بالكامل ✓</span>
                              </span>
                            ) : (
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  type="button"
                                  disabled={settlingSaleId === sale.id}
                                  onClick={() => handleSettleCreditSale(sale.id, 'CASH')}
                                  className="px-2.5 py-1.5 bg-black hover:bg-zinc-800 text-white rounded-lg font-bold text-xs shadow-xs transition active:scale-95 disabled:opacity-50 cursor-pointer"
                                  title="سداد كامل نقدي للمبلغ وإضافته للصندوق"
                                >
                                  {settlingSaleId === sale.id ? 'جاري...' : 'سداد كاش'}
                                </button>
                                <button
                                  type="button"
                                  disabled={settlingSaleId === sale.id}
                                  onClick={() => handleOpenSettleDialog({
                                    customerIdentifier: sale.id,
                                    customerName: sale.customerName,
                                    customerPhone: sale.customerPhone,
                                    totalRemainingFils: remaining,
                                    saleId: sale.id
                                  })}
                                  className="px-2 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded-lg font-bold text-xs border border-zinc-200 transition cursor-pointer"
                                  title="سداد دفعة جزئية"
                                >
                                  دفعة
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Modal Footer */}
            <div className="pt-4 mt-2 flex justify-between items-center text-xs text-zinc-500">
              <span>إجمالي عدد الفواتير الآجلة: {pendingCreditSales.length}</span>
              <button
                type="button"
                onClick={closeModal}
                className="px-5 py-2 bg-zinc-100 hover:bg-zinc-200 font-bold rounded-xl text-zinc-700 transition"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settle Debt Dialog (خصم من الذمة وسداد دفعة) */}
      {settleDialogOpen && settlingTarget && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs z-[60] flex items-center justify-center p-4" dir="rtl">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border-2 border-black space-y-4 animate-scale-up">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-200">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-black text-white flex items-center justify-center">
                  <Banknote className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-extrabold text-sm text-zinc-900">سداد دفعة وخصم من الذمة</h4>
                  <p className="text-[11px] text-zinc-500">{settlingTarget.customerName}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSettleDialogOpen(false)}
                className="p-1 hover:bg-zinc-100 rounded-lg text-zinc-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-zinc-100 p-3 rounded-2xl border border-zinc-200 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-zinc-600 font-bold">الرصيد المتبقي في الذمة:</span>
                <span className="font-mono font-black text-black text-base">
                  {(settlingTarget.totalRemainingFils / 1000).toFixed(3)} د.أ
                </span>
              </div>
              {settlingTarget.customerPhone && (
                <div className="text-[11px] text-zinc-600 font-mono" dir="ltr">
                  الهاتف: {settlingTarget.customerPhone}
                </div>
              )}
            </div>

            <form onSubmit={handleConfirmDebtSettlement} className="space-y-4">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-bold text-zinc-800">المبلغ المدفوع (د.أ) *</label>
                  <button
                    type="button"
                    onClick={() => setSettleAmountStr((settlingTarget.totalRemainingFils / 1000).toFixed(3))}
                    className="text-[10px] text-black font-bold underline hover:text-zinc-700"
                  >
                    سداد كامل الذمة ({(settlingTarget.totalRemainingFils / 1000).toFixed(3)} د.أ)
                  </button>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="decimal"
                    required
                    value={settleAmountStr}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9.]/g, '');
                      const parts = val.split('.');
                      const clean = parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : val;
                      setSettleAmountStr(clean);
                    }}
                    placeholder="0.000"
                    className="w-full border-2 border-black rounded-xl px-3 py-2.5 text-base font-bold text-center font-mono outline-hidden"
                    autoFocus
                  />
                  <span className="absolute start-3 top-3 text-xs font-bold text-zinc-500">د.أ</span>
                </div>
              </div>

              {/* Quick Amount Pills */}
              <div className="flex flex-wrap gap-1.5 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setSettleAmountStr('5.000')}
                  className="px-2.5 py-1 bg-zinc-100 hover:bg-zinc-200 rounded-lg border border-zinc-200 text-zinc-800"
                >
                  5 د.أ
                </button>
                <button
                  type="button"
                  onClick={() => setSettleAmountStr('10.000')}
                  className="px-2.5 py-1 bg-zinc-100 hover:bg-zinc-200 rounded-lg border border-zinc-200 text-zinc-800"
                >
                  10 د.أ
                </button>
                <button
                  type="button"
                  onClick={() => setSettleAmountStr('20.000')}
                  className="px-2.5 py-1 bg-zinc-100 hover:bg-zinc-200 rounded-lg border border-zinc-200 text-zinc-800"
                >
                  20 د.أ
                </button>
                <button
                  type="button"
                  onClick={() => setSettleAmountStr((settlingTarget.totalRemainingFils / 2000).toFixed(3))}
                  className="px-2.5 py-1 bg-zinc-100 hover:bg-zinc-200 rounded-lg border border-zinc-200 text-zinc-800"
                >
                  نصف المبلغ
                </button>
              </div>

              {/* Payment Method */}
              <div>
                <label className="block text-xs font-bold text-zinc-800 mb-1.5">طريقة التحصيل والاستلام:</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setSettlePaymentMethod('CASH')}
                    className={`py-2 px-1 rounded-xl border text-xs font-bold flex flex-col items-center justify-center gap-1 transition ${
                      settlePaymentMethod === 'CASH'
                        ? 'bg-black text-white border-black'
                        : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                    }`}
                  >
                    <Banknote className="w-4 h-4" />
                    <span>نقدي (بالدرج)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettlePaymentMethod('CARD')}
                    className={`py-2 px-1 rounded-xl border text-xs font-bold flex flex-col items-center justify-center gap-1 transition ${
                      settlePaymentMethod === 'CARD'
                        ? 'bg-black text-white border-black'
                        : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                    }`}
                  >
                    <CreditCard className="w-4 h-4" />
                    <span>بطاقة فيزا</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettlePaymentMethod('WALLET')}
                    className={`py-2 px-1 rounded-xl border text-xs font-bold flex flex-col items-center justify-center gap-1 transition ${
                      settlePaymentMethod === 'WALLET'
                        ? 'bg-black text-white border-black'
                        : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                    }`}
                  >
                    <Wallet className="w-4 h-4" />
                    <span>محفظة CliQ</span>
                  </button>
                </div>
                {settlePaymentMethod === 'CASH' && (
                  <p className="text-[10px] text-zinc-600 mt-1">
                    * سيتم قيد المبلغ النقدي مباشرة في درج كاشير الوردية الحالية ويظهر في الجرد اليومي.
                  </p>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-zinc-800 mb-1">ملاحظات السداد (اختياري)</label>
                <input
                  type="text"
                  value={settleNotes}
                  onChange={(e) => setSettleNotes(e.target.value)}
                  placeholder="مثال: دفعة على الحساب، أو سند قبض..."
                  className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs outline-hidden focus:border-black"
                />
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-zinc-200">
                <button
                  type="submit"
                  disabled={isSubmittingSettlement}
                  className="flex-1 py-2.5 bg-black hover:bg-zinc-800 text-white rounded-xl font-bold text-xs shadow-xs transition disabled:opacity-50"
                >
                  {isSubmittingSettlement ? 'جاري السداد...' : 'تأكيد السداد والخصم من الذمة'}
                </button>
                <button
                  type="button"
                  onClick={() => setSettleDialogOpen(false)}
                  className="px-4 py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl font-bold text-xs transition"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==============================================================
          MODAL: CREDIT SALE CUSTOMER MODAL (بيانات الزبونة لفاتورة البيع الآجل)
          Opens on choosing/editing credit customer, frees up cart sidebar space
      ============================================================== */}
      {showCreditCustomerModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4" dir="rtl">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-zinc-200 max-h-[92vh] flex flex-col animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 mb-4 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-zinc-900 text-white flex items-center justify-center shadow-xs">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-zinc-900">بيانات الزبونة لفاتورة البيع الآجل (الذمة)</h3>
                  <p className="text-[11px] text-zinc-500 font-medium">اختاري زبونة مسجلة مسبقاً أو أدخلي بيانات زبونة جديدة وتاريخ الاستحقاق</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCreditCustomerModal(false)}
                className="p-1.5 hover:bg-zinc-100 rounded-xl text-zinc-400 hover:text-zinc-700 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1 pl-1">
              {/* Customer Autocomplete Search / Input */}
              <div className="space-y-1.5 relative" ref={creditSuggestionsRef}>
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-zinc-800">اسم الزبونة / العميل *</label>
                  <span className="text-[10px] text-zinc-400 font-medium">ابحثي في السجل أو اكتبي اسماً جديداً</span>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={customerName === 'عميل نقدي' ? '' : customerName}
                    onChange={(e) => {
                      setCustomerName(e.target.value);
                      setShowCreditSuggestions(true);
                    }}
                    onFocus={() => {
                      if (creditCustomerSuggestions.length > 0) {
                        setShowCreditSuggestions(true);
                      }
                    }}
                    placeholder="اكتبي اسم الزبونة الكامل (يظهر اقتراحات العملاء والذمم)..."
                    className="w-full border-2 border-zinc-200 rounded-xl px-3 py-2.5 text-xs font-bold outline-none focus:border-black bg-white transition"
                    autoFocus
                  />
                  {isSearchingCreditCustomers && (
                    <div className="absolute inset-y-0 start-auto end-3 flex items-center">
                      <RefreshCw className="w-4 h-4 animate-spin text-zinc-400" />
                    </div>
                  )}
                </div>

                {/* Suggestions dropdown inside modal */}
                {showCreditSuggestions && creditCustomerSuggestions.length > 0 && (
                  <div className="mt-1 bg-white border-2 border-zinc-900 rounded-xl shadow-xl overflow-hidden max-h-48 overflow-y-auto divide-y divide-zinc-100 z-10">
                    <div className="bg-zinc-100 px-3 py-1.5 text-[10px] font-black text-zinc-600 flex items-center justify-between">
                      <span>الزبونات المتطابقات ({creditCustomerSuggestions.length}):</span>
                      <span className="text-[9px] text-zinc-400">انقري للاختيار</span>
                    </div>
                    {creditCustomerSuggestions.map((sug, idx) => (
                      <button
                        key={`${sug.name}-${sug.phone}-${idx}`}
                        type="button"
                        onClick={() => {
                          handleSelectCreditCustomer(sug);
                          setShowCreditSuggestions(false);
                        }}
                        className="w-full text-right p-2.5 hover:bg-pink-50/70 transition flex items-center justify-between gap-2 group cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-zinc-100 group-hover:bg-pink-100 text-zinc-700 group-hover:text-pink-700 flex items-center justify-center shrink-0">
                            <Users className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <div className="font-bold text-xs text-zinc-900 group-hover:text-black">
                              {sug.name}
                            </div>
                            <div className="text-[10px] text-zinc-500 font-mono" dir="ltr">
                              {sug.phone || 'بدون هاتف'}
                            </div>
                          </div>
                        </div>

                        <div className="text-left shrink-0">
                          {sug.isSettled || sug.totalDebtFils === 0 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>مسددة بالكامل ✓</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-300">
                              <span>ذمة: {(sug.totalDebtFils / 1000).toFixed(3)} د.أ</span>
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Phone & Due Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-800 mb-1">رقم الهاتف *</label>
                  <input
                    type="tel"
                    required
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="07XXXXXXXX"
                    dir="ltr"
                    className="w-full border-2 border-zinc-200 rounded-xl px-3 py-2 text-xs font-mono font-bold outline-none focus:border-black bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-800 mb-1">تاريخ استحقاق السداد *</label>
                  <input
                    type="date"
                    required
                    value={creditDueDate}
                    onChange={(e) => setCreditDueDate(e.target.value)}
                    className="w-full border-2 border-zinc-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:border-black bg-white"
                  />
                </div>
              </div>

              {/* Quick Due Date Presets */}
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                <span className="text-[10px] text-zinc-500 font-bold ms-1">استحقاق سريع:</span>
                <button
                  type="button"
                  onClick={() => {
                    const d = new Date();
                    d.setDate(d.getDate() + 7);
                    setCreditDueDate(d.toISOString().split('T')[0]);
                  }}
                  className="px-2 py-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-[10px] font-bold rounded-lg transition"
                >
                  +7 أيام (أسبوع)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const d = new Date();
                    d.setDate(d.getDate() + 14);
                    setCreditDueDate(d.toISOString().split('T')[0]);
                  }}
                  className="px-2 py-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-[10px] font-bold rounded-lg transition"
                >
                  +14 يوم (أسبوعين)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const d = new Date();
                    d.setDate(d.getDate() + 30);
                    setCreditDueDate(d.toISOString().split('T')[0]);
                  }}
                  className="px-2 py-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-[10px] font-bold rounded-lg transition"
                >
                  +30 يوم (شهر)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    const d = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                    setCreditDueDate(d.toISOString().split('T')[0]);
                  }}
                  className="px-2 py-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-[10px] font-bold rounded-lg transition"
                >
                  نهاية الشهر الحالي
                </button>
              </div>

              {/* Previous Balance / Debt Summary */}
              {customerCreditInfo && customerCreditInfo.found && (
                customerCreditInfo.totalDebtFils > 0 ? (
                  <div className="bg-zinc-100 border-2 border-zinc-900 rounded-2xl p-3 text-zinc-900 space-y-2">
                    <div className="flex items-center justify-between font-black text-xs border-b border-zinc-300 pb-1.5">
                      <span className="flex items-center gap-1.5 text-rose-800">
                        <Users className="w-4 h-4 text-black" />
                        الزبونة مسجلة مسبقاً ({customerCreditInfo.pendingCount} فاتورة ذمة قائمة)
                      </span>
                      <span className="font-mono text-xs bg-rose-600 text-white px-2 py-0.5 rounded-lg font-bold">
                        الرصيد القائم: {(customerCreditInfo.totalDebtFils / 1000).toFixed(3)} د.أ
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5 text-[11px] pt-1 text-center">
                      <div className="bg-white p-2 rounded-xl border border-zinc-200">
                        <span className="text-zinc-500 block text-[10px]">الرصيد السابق</span>
                        <span className="font-mono font-bold text-rose-700 text-xs">{(customerCreditInfo.totalDebtFils / 1000).toFixed(3)} د.أ</span>
                      </div>
                      <div className="bg-white p-2 rounded-xl border border-zinc-200">
                        <span className="text-zinc-500 block text-[10px]">الفاتورة الحالية (+)</span>
                        <span className="font-mono font-bold text-black text-xs">{(getGrandTotal() / 1000).toFixed(3)} د.أ</span>
                      </div>
                      <div className="bg-black text-white p-2 rounded-xl border border-black">
                        <span className="text-zinc-300 block text-[10px]">إجمالي الذمة الجديد</span>
                        <span className="font-mono font-black text-xs">{((customerCreditInfo.totalDebtFils + getGrandTotal()) / 1000).toFixed(3)} د.أ</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-emerald-50 border-2 border-emerald-500 rounded-2xl p-3 text-emerald-950 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                      <div>
                        <div className="font-black text-xs text-emerald-800">الزبونة مسجلة مسبقاً وسجلها نظيف ✓</div>
                        <div className="text-[11px] text-emerald-700">لا توجد ديون سابقة معلقة. سيتم تسجيل هذه الفاتورة بذمة جديدة.</div>
                      </div>
                    </div>
                  </div>
                )
              )}

              {/* Credit Notes */}
              <div>
                <label className="block text-xs font-bold text-zinc-800 mb-1">ملاحظات الذمة (اختياري)</label>
                <input
                  type="text"
                  value={creditNotes}
                  onChange={(e) => setCreditNotes(e.target.value)}
                  placeholder="أي اتفاق خاص بالسداد أو تفاصيل إضافية..."
                  className="w-full border-2 border-zinc-200 rounded-xl px-3 py-2 text-xs outline-none focus:border-black bg-white"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="pt-4 border-t border-zinc-100 flex items-center gap-2 shrink-0 mt-4">
              <button
                type="button"
                onClick={() => {
                  if (!customerName.trim() || customerName === 'عميل نقدي') {
                    alert('يرجى كتابة اسم الزبونة / العميل');
                    return;
                  }
                  if (!customerPhone.trim()) {
                    alert('يرجى إدخال رقم هاتف الزبونة للتواصل ومتابعة السداد');
                    return;
                  }
                  if (!creditDueDate.trim()) {
                    alert('يرجى تحديد تاريخ استحقاق السداد المتفق عليه');
                    return;
                  }
                  setShowCreditCustomerModal(false);
                }}
                className="flex-1 py-3 bg-black hover:bg-zinc-800 text-white rounded-xl font-bold text-xs shadow-md transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <Check className="w-4 h-4 text-emerald-400" />
                <span>تـم وتأكيد البيانات</span>
              </button>
              <button
                type="button"
                onClick={() => setShowCreditCustomerModal(false)}
                className="px-5 py-3 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl font-bold text-xs transition cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==============================================================
          MODAL 3: INVOICE RETURN & REFUND (إرجاع فاتورة برقمها)
      ============================================================== */}
      {isReturnModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4" dir="rtl">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-zinc-200 max-h-[90vh] flex flex-col animate-fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 mb-4 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center">
                  <Undo2 className="w-4 h-4" />
                </div>
                <h3 className="text-lg font-bold text-zinc-900">إرجاع فاتورة كاشير برقمها</h3>
              </div>
              <button
                onClick={closeModal}
                className="p-1 hover:bg-zinc-100 rounded-lg text-zinc-400 hover:text-zinc-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search Input for Invoice */}
            <form onSubmit={handleSearchReturnSale} className="mb-4 shrink-0">
              <label className="block text-xs font-bold text-zinc-700 mb-1">
                رقم الفاتورة أو المرجع أو مسح الباركود:
              </label>
              <div className="flex gap-2">
                <input
                  ref={returnQueryInputRef}
                  type="text"
                  required
                  value={returnQuery}
                  onChange={(e) => setReturnQuery(e.target.value)}
                  placeholder="مثال: INV-17189... أو POS-A3F1 (يدعم مسح الليزر المباشر)"
                  className="flex-1 border border-zinc-300 rounded-xl px-3.5 py-2 text-sm font-mono outline-none focus:border-black focus:ring-1 focus:ring-black font-bold"
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={isSearchingReturn}
                  className="bg-black hover:bg-zinc-800 text-white font-bold px-5 py-2 rounded-xl text-xs transition shadow-xs disabled:opacity-50"
                >
                  {isSearchingReturn ? 'جاري البحث...' : 'بحث عن الفاتورة'}
                </button>
              </div>
            </form>

            {/* Found Sale Details & Full Return Form (عرض بيانات الفاتورة بدون تحديد كمية) */}
            {returnSaleData && (
              <div className="flex-1 overflow-y-auto space-y-4 border-t border-zinc-100 pt-3">
                {/* Notice if already returned */}
                {returnSaleData.isFullyReturned && (
                  <div className="bg-rose-50 border border-rose-300 rounded-2xl p-4 text-center space-y-1">
                    <div className="inline-flex items-center gap-2 text-rose-700 font-black text-sm">
                      <AlertCircle className="w-5 h-5 text-rose-600" />
                      <span>تم إرجاع الفاتورة (فاتورة مستردة)</span>
                    </div>
                    <p className="text-xs text-rose-700 font-bold">
                      لقد تم استرداد هذه الفاتورة بالكامل مسبقاً، ولا يمكن إرجاعها مرة أخرى.
                    </p>
                    {returnSaleData.notes && (
                      <div className="mt-1">
                        <span className="inline-block bg-white border border-rose-200 text-rose-800 text-[11px] font-mono font-bold px-3 py-1 rounded-lg">
                          ملاحظة الفاتورة: {returnSaleData.notes}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Invoice Header Details */}
                <div className="bg-zinc-50 p-3.5 rounded-2xl border border-zinc-200 text-xs space-y-2">
                  <div className="flex justify-between items-start pb-2 border-b border-zinc-200">
                    <div>
                      <span className="font-black text-zinc-900 block text-sm font-mono">فاتورة بيع: {returnSaleData.reference}</span>
                      <span className="text-zinc-600 text-xs block font-bold mt-0.5">العميل: {returnSaleData.customerName || 'عميل نقدي'}</span>
                      {returnSaleData.createdAt && (
                        <span className="text-zinc-400 text-[11px] font-mono block">التاريخ: {new Date(returnSaleData.createdAt).toLocaleDateString('en-GB')} {new Date(returnSaleData.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                      )}
                      {returnSaleData.notes && !returnSaleData.isFullyReturned && (
                        <span className="text-rose-600 text-[11px] font-mono block mt-0.5 font-bold">ملاحظة: {returnSaleData.notes}</span>
                      )}
                    </div>
                    <div className="text-end bg-white px-3 py-1.5 rounded-xl border border-zinc-200">
                      <span className="text-[10px] text-zinc-500 block font-bold">
                        {returnSaleData.isFullyReturned ? 'المبلغ المسترد بالكامل' : 'إجمالي الفاتورة المسترجع'}
                      </span>
                      <span className="font-mono font-black text-rose-600 text-base">{(returnSaleData.total / 1000).toFixed(3)} د.أ</span>
                    </div>
                  </div>

                  {/* Items Display (Read-Only List) */}
                  <div className="pt-1">
                    <span className="block text-xs font-bold text-zinc-700 mb-2">أصناف ومحتويات الفاتورة ({returnSaleData.items?.length || 0}):</span>
                    <div className="space-y-1.5 max-h-56 overflow-y-auto pe-1">
                      {returnSaleData.items.map((it: any) => (
                        <div key={it.id || it.variantId} className="flex items-center justify-between p-2.5 bg-white border border-zinc-200 rounded-xl text-xs">
                          <div className="min-w-0 flex-1 pe-2">
                            <p className="font-bold text-zinc-900 truncate">{it.name}</p>
                            <p className="text-[10px] text-zinc-500 font-mono">
                              {it.size || '1 قطعة'} • سعر القطعة: {(it.unitPrice / 1000).toFixed(3)} د.أ
                            </p>
                          </div>
                          <div className="text-end shrink-0">
                            {returnSaleData.isFullyReturned ? (
                              <span className="font-mono font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded text-[11px] inline-block me-2">
                                مستردة (الكمية الأصلية: {it.originalQty || it.quantity})
                              </span>
                            ) : (
                              <span className="font-mono font-bold text-zinc-800 bg-zinc-100 px-2 py-0.5 rounded text-[11px] inline-block me-2">
                                الكمية: {it.quantity}
                              </span>
                            )}
                            <span className="font-mono font-black text-black">
                              {((it.unitPrice * (it.quantity || 1)) / 1000).toFixed(3)} د.أ
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Refund Method & Reason (Hide if already returned) */}
                {!returnSaleData.isFullyReturned && (
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block font-bold text-zinc-700 mb-1">طريقة رد المبلغ للزبونة:</label>
                      <select
                        value={returnMethod}
                        onChange={(e) => setReturnMethod(e.target.value as 'CASH' | 'CARD')}
                        className="w-full border border-zinc-300 rounded-xl p-2.5 outline-none font-bold bg-white text-zinc-800"
                      >
                        <option value="CASH">نقداً من الصندوق (كاش)</option>
                        <option value="CARD">إرجاع على البطاقة (فيزا)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-bold text-zinc-700 mb-1">سبب الإرجاع:</label>
                      <input
                        type="text"
                        value={returnReason}
                        onChange={(e) => setReturnReason(e.target.value)}
                        placeholder="سبب الإرجاع..."
                        className="w-full border border-zinc-300 rounded-xl p-2.5 outline-none font-bold bg-white text-zinc-800"
                      />
                    </div>
                  </div>
                )}

                {/* Direct Action Button */}
                <div className="pt-2 flex gap-2">
                  {returnSaleData.isFullyReturned ? (
                    <div className="flex-1 bg-zinc-100 text-zinc-500 font-bold py-3 rounded-xl text-sm text-center border border-zinc-200">
                      تم إرجاع الفاتورة مسبقاً (فاتورة مستردة)
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleConfirmReturn}
                      className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold py-3 rounded-xl text-sm transition shadow-sm flex items-center justify-center gap-2"
                    >
                      <Undo2 className="w-4 h-4" />
                      <span>تأكيد استرجاع كامل الفاتورة وإعادة {(returnSaleData.total / 1000).toFixed(3)} د.أ</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setReturnSaleData(null);
                      setReturnQuery('');
                      returnQueryInputRef.current?.focus();
                    }}
                    className="px-4 py-3 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold rounded-xl text-sm transition"
                  >
                    فاتورة أخرى
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}


      {/* ==============================================================
          MODAL 5: POS SETTINGS & KEYBOARD SHORTCUTS SYSTEM (F10)
      ============================================================== */}
      {isSettingsModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4" dir="rtl">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-zinc-200 max-h-[90vh] flex flex-col animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 mb-4 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-zinc-100 text-zinc-900 border border-zinc-200 flex items-center justify-center">
                  <Settings className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-zinc-900">إعدادات الكاشير واختصارات لوحة المفاتيح</h3>
                  <p className="text-xs text-zinc-500">تخصيص المفاتيح السريعة، وأكواد الأقسام، وخيارات الطباعة والصوت</p>
                </div>
              </div>
              <button
                onClick={closeModal}
                className="p-1 hover:bg-zinc-100 rounded-lg text-zinc-400 hover:text-zinc-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tabs Navigation */}
            <div className="flex gap-2 border-b border-zinc-200 pb-2 mb-4 shrink-0">
              <button
                type="button"
                onClick={() => setSettingsActiveTab('shortcuts')}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition ${
                  settingsActiveTab === 'shortcuts'
                    ? 'bg-black text-white shadow-xs'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                }`}
              >
                <Keyboard className="w-4 h-4" />
                <span>اختصارات الكيبورد</span>
              </button>
              <button
                type="button"
                onClick={() => setSettingsActiveTab('quickcodes')}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition ${
                  settingsActiveTab === 'quickcodes'
                    ? 'bg-black text-white shadow-xs'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                }`}
              >
                <Zap className="w-4 h-4 text-zinc-600 fill-current" />
                <span>أكواد الأقسام السريعة</span>
              </button>
              <button
                type="button"
                onClick={() => setSettingsActiveTab('general')}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition ${
                  settingsActiveTab === 'general'
                    ? 'bg-black text-white shadow-xs'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                }`}
              >
                <Printer className="w-4 h-4" />
                <span>الطباعة والصوت</span>
              </button>
            </div>

            {/* TAB 1: SHORTCUTS */}
            {settingsActiveTab === 'shortcuts' && (
              <div className="flex-1 overflow-y-auto space-y-3 pe-1">
                <div className="bg-zinc-100 border border-zinc-200 rounded-xl p-3 text-xs text-zinc-800 leading-relaxed">
                  💡 لتغيير أي اختصار، اضغط على زر <strong>تعديل</strong> بجانب الإجراء، ثم اضغط على المفتاح الجديد الذي تريده في لوحة المفاتيح.
                </div>

                <div className="divide-y divide-zinc-100 border border-zinc-200 rounded-2xl overflow-hidden bg-white">
                  {[
                    { key: 'focusScanner', label: 'التركيز على قارئ الباركود والبحث', desc: 'توجيه المؤشر فوراً لخانة مسح الباركود' },
                    { key: 'checkout', label: 'إتمام الدفع وإصدار الفاتورة', desc: 'فتح نافذة تأكيد الدفع واختيار الطريقة' },
                    { key: 'quickCash', label: 'دفع نقدي سريع فوري (Cash)', desc: 'تثبيت استلام المبلغ نقداً وإنهاء الفاتورة بنقرة واحدة' },
                    { key: 'holdOrder', label: 'تعليق / استرجاع الفاتورة', desc: 'حفظ السلة مؤقتاً لخدمة زبون آخر ثم استرجاعها' },
                    { key: 'openReturns', label: 'فتح نافذة إرجاع واستبدال فاتورة', desc: 'إدخال أو مسح باركود الفاتورة المرتجعة' },
                    { key: 'addCustomItem', label: 'إضافة منتج كاشير مباشر سريع', desc: 'بيع صنف غير مسجل بإدخال اسمه وسعره فوراً' },
                    { key: 'clearCart', label: 'تفريغ سلة المشتريات بالكامل', desc: 'مسح جميع الأصناف الحالية والبدء من جديد' },
                    { key: 'printReceipt', label: 'طباعة الإيصال الحراري', desc: 'إرسال أمر الطباعة إلى الطابعة الحرارية 80mm' },
                    { key: 'openSettings', label: 'فتح نافذة الإعدادات والاختصارات', desc: 'عرض وتعديل خيارات النظام' },
                    { key: 'toggleFullscreen', label: 'تفعيل / إلغاء وضع ملء الشاشة', desc: 'تكبير واجهة الكاشير لتشمل الشاشة بالكامل' },
                  ].map((item) => {
                    const currentKey = (shortcuts as any)[item.key];
                    const isEditing = editingShortcutKey === item.key;
                    return (
                      <div key={item.key} className="p-3 flex items-center justify-between hover:bg-zinc-50 transition">
                        <div>
                          <p className="font-bold text-xs text-zinc-800">{item.label}</p>
                          <p className="text-[10px] text-zinc-400">{item.desc}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2.5 py-1 rounded-lg font-mono text-xs font-bold border ${
                            isEditing 
                              ? 'bg-black text-white border-black animate-pulse ring-2 ring-zinc-400'
                              : 'bg-zinc-100 text-zinc-800 border-zinc-300'
                          }`}>
                            {isEditing ? 'اضغط أي مفتاح الآن...' : currentKey}
                          </span>
                          <button
                            type="button"
                            onClick={() => setEditingShortcutKey(isEditing ? null : item.key as any)}
                            className="text-xs text-zinc-900 hover:underline font-bold px-2 py-1 rounded"
                          >
                            {isEditing ? 'إلغاء' : 'تعديل'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="pt-2 flex justify-between items-center text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setShortcuts(DEFAULT_SHORTCUTS);
                      localStorage.setItem('ghazal_pos_shortcuts', JSON.stringify(DEFAULT_SHORTCUTS));
                      showToast('تمت استعادة الاختصارات الافتراضية');
                    }}
                    className="flex items-center gap-1 text-zinc-500 hover:text-zinc-800 transition"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>استعادة الاختصارات الافتراضية</span>
                  </button>
                  <span className="text-[11px] text-zinc-400">مفتاح Esc يغلق جميع النوافذ دائماً</span>
                </div>
              </div>
            )}

            {/* TAB 2: QUICK CODES */}
            {settingsActiveTab === 'quickcodes' && (
              <div className="flex-1 overflow-y-auto space-y-4 pe-1">
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 leading-relaxed">
                  ⚡ <strong>الأكواد السريعة:</strong> تتيح لك الضغط على الزر أو كتابة الكود ثم Enter في خانة الباركود لإضافة الصنف فوراً (مثلاً كود 1234 لقسم الدينار).
                </div>

                {/* Add new quick code form */}
                <div className="bg-zinc-50 border border-zinc-200 p-3.5 rounded-2xl space-y-3">
                  <h4 className="text-xs font-bold text-zinc-800">إضافة زر / كود سريع جديد</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                    <div>
                      <label className="block text-[10px] text-zinc-600 font-bold mb-1">اسم الصنف أو القسم</label>
                      <input
                        type="text"
                        placeholder="مثال: قسم الدينار والنصف"
                        value={newQuickName}
                        onChange={(e) => setNewQuickName(e.target.value)}
                        className="w-full border border-zinc-300 rounded-lg px-2.5 py-1.5 outline-none focus:border-black bg-white text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-zinc-600 font-bold mb-1">الكود / الباركود المختصر</label>
                      <input
                        type="text"
                        placeholder="مثال: 1500"
                        value={newQuickCode}
                        onChange={(e) => setNewQuickCode(e.target.value)}
                        className="w-full border border-zinc-300 rounded-lg px-2.5 py-1.5 outline-none focus:border-black bg-white text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-zinc-600 font-bold mb-1">السعر (د.أ)</label>
                      <input
                        type="number"
                        step="0.001"
                        placeholder="1.500"
                        value={newQuickPrice}
                        onChange={(e) => setNewQuickPrice(e.target.value)}
                        className="w-full border border-zinc-300 rounded-lg px-2.5 py-1.5 outline-none focus:border-black bg-white text-xs font-bold"
                      />
                    </div>
                  </div>
                  <div className="flex justify-between items-center pt-1">
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="text-[10px] text-zinc-500">ستايل الزر:</span>
                      {[
                        { val: 'bg-zinc-800 hover:bg-black', bg: 'bg-zinc-800' },
                        { val: 'bg-zinc-700 hover:bg-zinc-900', bg: 'bg-zinc-700' },
                        { val: 'bg-black hover:bg-zinc-800', bg: 'bg-black' },
                        { val: 'bg-zinc-900 hover:bg-black', bg: 'bg-zinc-900' },
                      ].map((c) => (
                        <button
                          key={c.val}
                          type="button"
                          onClick={() => setNewQuickColor(c.val)}
                          className={`w-5 h-5 rounded-full ${c.bg} transition ${newQuickColor === c.val ? 'ring-2 ring-black scale-110' : 'opacity-70'}`}
                        />
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (!newQuickName.trim() || !newQuickCode.trim()) {
                            alert('يرجى إدخال اسم الصنف والكود');
                            return;
                          }
                          const priceFils = Math.round((parseFloat(newQuickPrice) || 1) * 1000);

                          if (editingQuickCodeIndex !== null && editingQuickCodeIndex < quickShortcuts.length) {
                            const updated = quickShortcuts.map((qs, idx) => {
                              if (idx === editingQuickCodeIndex) {
                                return {
                                  code: newQuickCode.trim(),
                                  name: newQuickName.trim(),
                                  price: priceFils,
                                  label: `${(priceFils / 1000).toFixed(3)} د.أ`,
                                  color: newQuickColor
                                };
                              }
                              return qs;
                            });
                            setQuickShortcuts(updated);
                            localStorage.setItem('ghazal_pos_quick_codes', JSON.stringify(updated));
                            savePOSQuickCodesAction(updated).catch(e => console.warn('Failed to persist quick codes:', e));
                            setEditingQuickCodeIndex(null);
                            setNewQuickName('');
                            setNewQuickCode('');
                            setNewQuickPrice('1.000');
                            showToast('تم تعديل الكود السريع وحفظه في قاعدة البيانات');
                          } else {
                            const updated = [
                              ...quickShortcuts,
                              {
                                code: newQuickCode.trim(),
                                name: newQuickName.trim(),
                                price: priceFils,
                                label: `${(priceFils / 1000).toFixed(3)} د.أ`,
                                color: newQuickColor
                              }
                            ];
                            setQuickShortcuts(updated);
                            localStorage.setItem('ghazal_pos_quick_codes', JSON.stringify(updated));
                            savePOSQuickCodesAction(updated).catch(e => console.warn('Failed to persist quick codes:', e));
                            setNewQuickName('');
                            setNewQuickCode('');
                            setNewQuickPrice('1.000');
                            showToast('تمت إضافة الكود السريع وحفظه في قاعدة البيانات');
                          }
                        }}
                        className="bg-black hover:bg-zinc-800 text-white px-4 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-xs"
                      >
                        {editingQuickCodeIndex !== null ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>حفظ التعديل</span>
                          </>
                        ) : (
                          <>
                            <Plus className="w-3.5 h-3.5" />
                            <span>إضافة الزر</span>
                          </>
                        )}
                      </button>

                      {editingQuickCodeIndex !== null && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingQuickCodeIndex(null);
                            setNewQuickName('');
                            setNewQuickCode('');
                            setNewQuickPrice('1.000');
                          }}
                          className="bg-zinc-100 hover:bg-zinc-200 text-zinc-700 px-3 py-1.5 rounded-lg text-xs font-bold transition"
                        >
                          إلغاء التعديل
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Existing Quick Codes list */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-zinc-700">الأزرار الحالية النشطة ({quickShortcuts.length})</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {quickShortcuts.map((qs, i) => (
                      <div key={i} className={`p-2.5 rounded-xl border transition flex items-center justify-between ${editingQuickCodeIndex === i ? 'border-black bg-zinc-50' : 'border-zinc-200 bg-white'}`}>
                        <div className="flex items-center gap-2">
                          <span className={`w-3 h-3 rounded-full ${qs.color.split(' ')[0]}`} />
                          <div>
                            <p className="font-bold text-xs text-zinc-800">{qs.name}</p>
                            <p className="text-[10px] text-zinc-500 font-mono">الكود: {qs.code} • السعر: {(qs.price / 1000).toFixed(3)} د.أ</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingQuickCodeIndex(i);
                              setNewQuickName(qs.name);
                              setNewQuickCode(qs.code);
                              setNewQuickPrice((qs.price / 1000).toFixed(3));
                              setNewQuickColor(qs.color);
                            }}
                            className="text-zinc-500 hover:text-black hover:bg-zinc-100 p-1 rounded transition"
                            title="تعديل هذا الكود السريع"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const updated = quickShortcuts.filter((_, idx) => idx !== i);
                              setQuickShortcuts(updated);
                              localStorage.setItem('ghazal_pos_quick_codes', JSON.stringify(updated));
                              savePOSQuickCodesAction(updated).catch(e => console.warn('Failed to persist quick codes:', e));
                              if (editingQuickCodeIndex === i) {
                                setEditingQuickCodeIndex(null);
                              }
                              showToast('تم حذف الكود السريع بنجاح');
                            }}
                            className="text-zinc-400 hover:text-red-600 p-1 rounded transition"
                            title="حذف هذا الكود"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: GENERAL PREFERENCES */}
            {settingsActiveTab === 'general' && (
              <div className="flex-1 overflow-y-auto space-y-4 pe-1 text-xs">
                {/* Sound Settings */}
                <div className="p-4 rounded-2xl border border-zinc-200 bg-zinc-50/50 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-zinc-100 text-zinc-900 border border-zinc-200 flex items-center justify-center">
                      {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                    </div>
                    <div>
                      <p className="font-bold text-zinc-800">صوت التأكيد عند قراءة الباركود (Beep)</p>
                      <p className="text-[11px] text-zinc-500">إصدار صوت خفيف فور مسح كل صنف أو إتمام العملية بنجاح</p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={soundEnabled}
                      onChange={(e) => {
                        setSoundEnabled(e.target.checked);
                        localStorage.setItem('ghazal_pos_sound', e.target.checked ? 'true' : 'false');
                        if (e.target.checked) playBeep();
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-zinc-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-black" />
                  </label>
                </div>

                {/* Auto Print Setting */}
                <div className="p-4 rounded-2xl border border-zinc-200 bg-zinc-50/50 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-zinc-100 text-zinc-900 border border-zinc-200 flex items-center justify-center">
                      <Printer className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="font-bold text-zinc-800">طباعة تلقائية فورية للفاتورة</p>
                      <p className="text-[11px] text-zinc-500">فتح مربع حوار الطباعة الحرارية فور تأكيد الدفع بدون الضغط على F9</p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoPrintEnabled}
                      onChange={(e) => {
                        setAutoPrintEnabled(e.target.checked);
                        localStorage.setItem('ghazal_pos_autoprint', e.target.checked ? 'true' : 'false');
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-zinc-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-black" />
                  </label>
                </div>

                {/* Thermal Receipt Specifications */}
                <div className="p-4 rounded-2xl border border-zinc-200 bg-white space-y-2">
                  <h4 className="font-bold text-zinc-800 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-zinc-800" />
                    <span>مواصفات الفاتورة الحرارية المعتمدة لمحل غزل</span>
                  </h4>
                  <ul className="list-disc list-inside space-y-1 text-zinc-600 text-[11px]">
                    <li>شعار محل غزل المفرغ مطبوع بأعلى الفاتورة بوضوح تام.</li>
                    <li>تفاصيل المتجر، الهاتف، والرقم الضريبي للفوترة الأردنية (JoFotara).</li>
                    <li>جدول الأصناف، الكميات، الأسعار، وقيمة الخصم إن وجد.</li>
                    <li>رمز الاستجابة السريع للفوترة الإلكترونية (QR Code TLV).</li>
                    <li><strong>باركود الفاتورة القياسي (Code 128)</strong> مطبوع في أسفل الإيصال لسهولة الإرجاع.</li>
                  </ul>
                </div>
              </div>
            )}

            {/* Modal Footer */}
            <div className="pt-4 border-t border-zinc-100 flex justify-end shrink-0">
              <button
                type="button"
                onClick={closeModal}
                className="bg-black hover:bg-zinc-800 text-white px-6 py-2 rounded-xl text-xs font-bold transition shadow-xs"
              >
                حفظ وإغلاق
              </button>
            </div>
          </div>
        </div>
      )}


      {/* ==============================================================
          MODAL 6: INVOICES & SALES HISTORY (سجل فواتير المبيعات وإعادة الطباعة)
      ============================================================== */}
      {isSalesHistoryOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 flex items-center justify-center p-3 md:p-6 overflow-hidden" dir="rtl">
          <div className="bg-white rounded-3xl max-w-5xl w-full max-h-[92vh] shadow-2xl border border-zinc-200 flex flex-col animate-fade-in overflow-hidden">
            
            {/* Modal Header */}
            <div className="p-4 md:p-5 border-b border-zinc-200 flex items-center justify-between bg-zinc-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-zinc-200 text-zinc-900 border border-zinc-300 flex items-center justify-center shadow-xs">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base md:text-lg font-black text-zinc-900 flex items-center gap-2">
                    <span>سجل فواتير المبيعات</span>
                    <span className="text-xs bg-zinc-200 text-zinc-800 font-bold px-2 py-0.5 rounded-full">
                      {salesHistoryList.length} فاتورة
                    </span>
                  </h3>
                  <p className="text-xs text-zinc-500">
                    استعراض الفواتير المصدرة، الفلترة بالوقت وموظف الكاشير، وإعادة طباعة أي إيصال
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fetchSalesHistory()}
                  disabled={isLoadingSalesHistory}
                  className="p-2 hover:bg-white rounded-xl text-zinc-600 border border-zinc-200 shadow-2xs transition active:scale-95 disabled:opacity-50"
                  title="تحديث البيانات"
                >
                  <RefreshCw className={`w-4 h-4 ${isLoadingSalesHistory ? 'animate-spin text-purple-600' : ''}`} />
                </button>
                <button
                  type="button"
                  onClick={closeModal}
                  className="p-2 hover:bg-white rounded-xl text-zinc-400 hover:text-zinc-700 border border-zinc-200 shadow-2xs transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Filter Toolbar */}
            <div className="p-4 border-b border-zinc-200 bg-zinc-50/70 shrink-0 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* Date Filter */}
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-zinc-700 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-purple-600" />
                    <span>تاريخ الفاتورة:</span>
                  </label>
                  <div className="flex gap-1">
                    <input
                      type="date"
                      value={salesHistoryFilterDate}
                      onChange={(e) => {
                        setSalesHistoryFilterDate(e.target.value);
                        fetchSalesHistory({ date: e.target.value });
                      }}
                      className="flex-1 bg-white border border-zinc-300 rounded-xl px-2.5 py-1.5 text-xs font-bold outline-none focus:border-purple-600 transition"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const today = new Date().toISOString().split('T')[0];
                        setSalesHistoryFilterDate(today);
                        fetchSalesHistory({ date: today });
                      }}
                      className="px-2 py-1.5 bg-white hover:bg-zinc-100 border border-zinc-300 rounded-xl text-[10px] font-bold text-zinc-700 transition"
                      title="فواتير اليوم"
                    >
                      اليوم
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSalesHistoryFilterDate('');
                        fetchSalesHistory({ date: '' });
                      }}
                      className="px-2 py-1.5 bg-white hover:bg-zinc-100 border border-zinc-300 rounded-xl text-[10px] font-bold text-zinc-500 transition"
                      title="كل التواريخ"
                    >
                      الكل
                    </button>
                  </div>
                </div>

                {/* Cashier / Employee Filter */}
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-zinc-700 flex items-center gap-1">
                    <Users className="w-3.5 h-3.5 text-purple-600" />
                    <span>موظف الكاشير:</span>
                  </label>
                  <select
                    value={salesHistoryFilterEmployee}
                    onChange={(e) => {
                      setSalesHistoryFilterEmployee(e.target.value);
                      fetchSalesHistory({ employeeId: e.target.value });
                    }}
                    className="w-full bg-white border border-zinc-300 rounded-xl px-2.5 py-1.5 text-xs font-bold outline-none focus:border-purple-600 transition"
                  >
                    <option value="ALL">جميع موظفي الكاشير</option>
                    {salesHistoryEmployees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Payment Method Filter */}
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-zinc-700 flex items-center gap-1">
                    <CreditCard className="w-3.5 h-3.5 text-purple-600" />
                    <span>طريقة الدفع:</span>
                  </label>
                  <select
                    value={salesHistoryFilterMethod}
                    onChange={(e) => {
                      setSalesHistoryFilterMethod(e.target.value);
                      fetchSalesHistory({ paymentMethod: e.target.value });
                    }}
                    className="w-full bg-white border border-zinc-300 rounded-xl px-2.5 py-1.5 text-xs font-bold outline-none focus:border-purple-600 transition"
                  >
                    <option value="ALL">جميع طرق الدفع</option>
                    <option value="CASH">نقدي (كاش)</option>
                    <option value="CARD">بطاقة (فيزا)</option>
                    <option value="WALLET">محفظة / CliQ</option>
                    <option value="CREDIT">بيع آجل (ذمم)</option>
                  </select>
                </div>

                {/* Search Bar */}
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-zinc-700 flex items-center gap-1">
                    <Search className="w-3.5 h-3.5 text-purple-600" />
                    <span>بحث سريع:</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="رقم الفاتورة أو الباركود..."
                      value={salesHistoryFilterSearch}
                      onChange={(e) => setSalesHistoryFilterSearch(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          fetchSalesHistory();
                        }
                      }}
                      className="w-full bg-white border border-zinc-300 rounded-xl ps-3 pe-8 py-1.5 text-xs outline-none focus:border-purple-600 transition"
                    />
                    <button
                      type="button"
                      onClick={() => fetchSalesHistory()}
                      className="absolute end-1.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-purple-600 p-1"
                    >
                      <Search className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Summary Metrics */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-zinc-200/80 text-xs">
                <div className="flex items-center gap-4 text-zinc-600">
                  <span>
                    إجمالي الفواتير: <strong className="text-zinc-900 font-mono">{salesHistoryList.length}</strong>
                  </span>
                  <span>
                    مجموع المبيعات: <strong className="text-purple-700 font-extrabold font-mono text-sm">
                      {((salesHistoryList.reduce((acc, s) => acc + (s.total || 0), 0)) / 1000).toFixed(3)} د.أ
                    </strong>
                  </span>
                </div>
                {salesHistoryFilterDate && (
                  <span className="text-[11px] text-zinc-500 bg-white border border-zinc-200 px-2 py-0.5 rounded-md">
                    المعروض لفترة: <strong>{salesHistoryFilterDate}</strong>
                  </span>
                )}
              </div>
            </div>

            {/* Invoices Table Body */}
            <div className="flex-1 overflow-y-auto p-4">
              {isLoadingSalesHistory ? (
                <div className="py-20 text-center text-zinc-400 space-y-2">
                  <RefreshCw className="w-8 h-8 mx-auto animate-spin text-purple-500" />
                  <p className="text-sm font-bold text-zinc-600">جاري تحميل سجل الفواتير...</p>
                </div>
              ) : salesHistoryList.length === 0 ? (
                <div className="py-20 text-center text-zinc-400 space-y-2">
                  <Receipt className="w-12 h-12 mx-auto text-zinc-300" />
                  <p className="text-base font-bold text-zinc-700">لم يتم العثور على أي فواتير تطابق معايير البحث!</p>
                  <p className="text-xs text-zinc-400">جرب تغيير التاريخ أو موظف الكاشير لرؤية الفواتير السابقة.</p>
                </div>
              ) : (
                <div className="border border-zinc-200 rounded-2xl overflow-hidden shadow-2xs">
                  <table className="w-full text-right border-collapse text-xs">
                    <thead className="bg-zinc-100 border-b border-zinc-200 text-zinc-700 font-bold sticky top-0">
                      <tr>
                        <th className="p-3">رقم الفاتورة / المرجع</th>
                        <th className="p-3">التاريخ والوقت</th>
                        <th className="p-3">موظف الكاشير</th>
                        <th className="p-3">العميل</th>
                        <th className="p-3">طريقة الدفع</th>
                        <th className="p-3 text-center">الأصناف</th>
                        <th className="p-3">المجموع</th>
                        <th className="p-3 text-center">الإجراء</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 bg-white">
                      {salesHistoryList.map((sale) => (
                        <tr key={sale.id} className="hover:bg-purple-50/30 transition">
                          <td className="p-3">
                            <span className="font-mono font-bold text-zinc-900 block">
                              {sale.invoiceNumber || sale.reference}
                            </span>
                            <span className="text-[10px] text-zinc-400 font-mono block">
                              باركود: {sale.reference}
                            </span>
                          </td>
                          <td className="p-3 text-zinc-700 whitespace-nowrap">
                            <div className="font-medium">
                              {new Date(sale.createdAt).toLocaleDateString('ar-JO-u-nu-latn')}
                            </div>
                            <div className="text-[10px] text-zinc-400 font-mono">
                              {new Date(sale.createdAt).toLocaleTimeString('ar-JO-u-nu-latn', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </td>
                          <td className="p-3 font-medium text-zinc-800">
                            {sale.employeeName}
                          </td>
                          <td className="p-3">
                            <div className="font-bold text-zinc-900">{sale.customerName}</div>
                            {sale.customerPhone && (
                              <div className="text-[10px] text-zinc-500 font-mono" dir="ltr">
                                {sale.customerPhone}
                              </div>
                            )}
                            {sale.notes && (
                              <div className="text-[10px] text-purple-700 font-medium truncate max-w-[150px]" title={sale.notes}>
                                📝 {sale.notes}
                              </div>
                            )}
                          </td>
                          <td className="p-3">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              sale.paymentMethod === 'CREDIT'
                                ? 'bg-amber-100 text-amber-900'
                                : sale.paymentMethod === 'CARD'
                                ? 'bg-blue-100 text-blue-900'
                                : sale.paymentMethod === 'WALLET'
                                ? 'bg-purple-100 text-purple-900'
                                : 'bg-emerald-100 text-emerald-900'
                            }`}>
                              {sale.paymentMethod === 'CREDIT'
                                ? 'آجل (ذمم)'
                                : sale.paymentMethod === 'CARD'
                                ? 'فيزا'
                                : sale.paymentMethod === 'WALLET'
                                ? 'CliQ'
                                : 'نقدي'}
                            </span>
                            {sale.paymentMethod === 'CREDIT' && sale.dueDate && (
                              <div className="text-[9px] text-amber-800 font-bold mt-0.5">
                                استحقاق: {sale.dueDate}
                              </div>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            <span className="font-bold font-mono bg-zinc-100 text-zinc-700 px-2 py-0.5 rounded-md text-[11px]">
                              {sale.itemsCount}
                            </span>
                          </td>
                          <td className="p-3 font-black text-zinc-900 font-mono whitespace-nowrap" dir="ltr">
                            {((sale.total || 0) / 1000).toFixed(3)} د.أ
                          </td>
                          <td className="p-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleViewReceiptFromHistory(sale.reference)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black hover:bg-zinc-800 text-white text-xs font-bold transition shadow-xs active:scale-95"
                              title="عرض تفاصيل الفاتورة وطباعتها مجدداً"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              <span>عرض وطباعة</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-zinc-200 bg-zinc-50 flex items-center justify-between shrink-0">
              <p className="text-[11px] text-zinc-500">
                💡 يمكنكِ الضغط على زر &quot;عرض وطباعة&quot; لأي فاتورة لمعاينتها واستخراج نسخة ورقية حرارية فورية مجدداً.
              </p>
              <button
                type="button"
                onClick={closeModal}
                className="bg-zinc-800 hover:bg-zinc-900 text-white px-5 py-2 rounded-xl text-xs font-bold transition"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Modal 7: Quick Cashier Employee Switcher (تبديل موظف الكاشير السريع) */}
      {isSwitchCashierModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col border border-zinc-200 animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="p-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-900 text-white">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-500/20 text-blue-400 rounded-xl">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base">تبديل موظف الكاشير السريع</h3>
                  <p className="text-[11px] text-zinc-400">اختيار الموظف وإدخال رمز الـ PIN أو كلمة المرور</p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form & Keypad */}
            <form onSubmit={handleConfirmSwitch} className="p-5 space-y-4">
              {switchError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-2xl text-xs font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                  <span>{switchError}</span>
                </div>
              )}

              {/* Employee Selector Dropdown */}
              <div>
                <label className="block text-xs font-extrabold text-zinc-700 mb-1.5">
                  اختيار موظف الكاشير من القائمة:
                </label>
                <select
                  value={selectedEmployeeId}
                  onChange={(e) => setSelectedEmployeeId(e.target.value)}
                  className="w-full p-3 bg-zinc-50 border-2 border-zinc-200 focus:border-blue-500 rounded-2xl text-sm font-bold text-zinc-800 focus:outline-hidden transition"
                >
                  {activeEmployeesList.length === 0 ? (
                    <option value="">جاري تحميل الموظفين...</option>
                  ) : (
                    activeEmployeesList.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name} ({emp.roleName === 'Admin' ? 'مدير' : 'كاشير'})
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* PIN / Password Input */}
              <div>
                <label className="block text-xs font-extrabold text-zinc-700 mb-1.5 flex items-center justify-between">
                  <span>رمز الـ PIN أو كلمة المرور:</span>
                  <span className="text-[10px] text-zinc-400 font-normal">الافتراضي: 1234</span>
                </label>
                <input
                  type="password"
                  value={switchPin}
                  onChange={(e) => setSwitchPin(e.target.value)}
                  placeholder="••••"
                  autoFocus
                  maxLength={12}
                  className="w-full p-3.5 bg-zinc-50 border-2 border-zinc-200 focus:border-blue-500 rounded-2xl text-center text-xl tracking-widest font-black text-zinc-900 focus:outline-hidden transition"
                  dir="ltr"
                />
              </div>

              {/* On-Screen Touch Keypad */}
              <div className="bg-zinc-50 p-2.5 rounded-2xl border border-zinc-200">
                <div className="grid grid-cols-3 gap-1.5" dir="ltr">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                    <button
                      key={digit}
                      type="button"
                      onClick={() => setSwitchPin(prev => prev + digit)}
                      className="h-12 bg-white hover:bg-blue-50 active:scale-95 text-zinc-800 font-extrabold text-lg rounded-xl border border-zinc-200 shadow-2xs transition flex items-center justify-center"
                    >
                      {digit}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setSwitchPin('')}
                    className="h-12 bg-red-50 hover:bg-red-100 active:scale-95 text-red-600 font-bold text-sm rounded-xl border border-red-200 transition flex items-center justify-center"
                  >
                    مسح C
                  </button>
                  <button
                    type="button"
                    onClick={() => setSwitchPin(prev => prev + '0')}
                    className="h-12 bg-white hover:bg-blue-50 active:scale-95 text-zinc-800 font-extrabold text-lg rounded-xl border border-zinc-200 shadow-2xs transition flex items-center justify-center"
                  >
                    0
                  </button>
                  <button
                    type="button"
                    onClick={() => setSwitchPin(prev => prev.slice(0, -1))}
                    className="h-12 bg-amber-50 hover:bg-amber-100 active:scale-95 text-amber-700 font-bold text-sm rounded-xl border border-amber-200 transition flex items-center justify-center"
                  >
                    ⌫
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex items-center gap-2">
                <button
                  type="submit"
                  disabled={isSwitchingEmployee}
                  className="flex-1 py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-2xl font-bold text-sm shadow-md transition active:scale-95 flex items-center justify-center gap-2"
                >
                  {isSwitchingEmployee ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  <span>تأكيد وتبديل الكاشير</span>
                </button>
                <button
                  type="button"
                  onClick={closeModal}
                  className="py-3 px-4 bg-zinc-200 hover:bg-zinc-300 text-zinc-700 rounded-2xl font-bold text-sm transition"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 8: Cash Drawer Expense Modal (سحب مصروف مباشر من درج الكاشير) */}
      {isCashExpenseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col border border-zinc-200">
            <div className="p-4 bg-zinc-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-pink-500/20 text-pink-400 rounded-xl border border-pink-500/30">
                  <Banknote className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm">سحب مصروف من الدرج</h3>
                  <p className="text-[11px] text-zinc-400">توثيق وتسجيل أي مصروف مباشر يتم دفعه نقداً من كاشير الفرع</p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="p-1.5 text-zinc-400 hover:text-white rounded-lg transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitCashExpense} className="p-5 space-y-4 text-xs">
              {cashExpenseError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                  <span>{cashExpenseError}</span>
                </div>
              )}

              {/* Amount */}
              <div>
                <label className="block font-bold text-zinc-700 mb-1">المبلغ المصروف المطلوب (بالدينار الأردني) *:</label>
                <input
                  type="number"
                  step="0.05"
                  value={cashExpenseAmountStr}
                  onChange={(e) => setCashExpenseAmountStr(e.target.value)}
                  placeholder="مثال: 5.000"
                  autoFocus
                  required
                  className="w-full p-3 bg-zinc-50 border border-zinc-300 rounded-xl font-black text-lg text-zinc-900 focus:outline-hidden focus:border-black focus:ring-1 focus:ring-black font-mono"
                  dir="ltr"
                />
              </div>

              {/* Reason */}
              <div>
                <label className="block font-bold text-zinc-700 mb-1">البيان / سبب المصروف بالتفصيل *:</label>
                <textarea
                  rows={2}
                  value={cashExpenseReason}
                  onChange={(e) => setCashExpenseReason(e.target.value)}
                  placeholder="مثال: شراء أكياس، مستلزمات نظافة، ضيافة، مصاريف نقل طارئة..."
                  required
                  className="w-full p-2.5 bg-zinc-50 border border-zinc-300 rounded-xl font-bold text-zinc-800 focus:outline-hidden focus:border-black focus:ring-1 focus:ring-black"
                />
              </div>

              {/* Beneficiary */}
              <div>
                <label className="block font-bold text-zinc-700 mb-1">المستفيد / الجهة المصروف لها (اختياري):</label>
                <input
                  type="text"
                  value={cashExpenseBeneficiary}
                  onChange={(e) => setCashExpenseBeneficiary(e.target.value)}
                  placeholder="اسم العامل، المورد، المحل المجاور..."
                  className="w-full p-2.5 bg-zinc-50 border border-zinc-300 rounded-xl font-bold text-zinc-800 focus:outline-hidden focus:border-black focus:ring-1 focus:ring-black"
                />
              </div>

              <div className="p-3 bg-zinc-50 rounded-2xl border border-zinc-200 text-zinc-700 text-[11px] leading-relaxed">
                💡 <b>توثيق الصندوق والجرد:</b> يتم خصم هذا المصروف فورياً من رصيد صندوق الكاشير وترحيله مباشرة إلى مركز التسويات المالية (<span className="font-mono text-zinc-900">/admin/settlements?q=cash-expenses</span>) وتوثيقه باسم الكاشير وتاريخ وساعة الصرف.
              </div>

              <div className="pt-2 flex items-center gap-2">
                <button
                  type="submit"
                  disabled={isSubmittingCashExpense}
                  className="flex-1 py-3 bg-black hover:bg-zinc-800 text-white rounded-xl font-extrabold transition flex items-center justify-center gap-2 shadow-xs cursor-pointer"
                >
                  {isSubmittingCashExpense ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  <span>تأكيد تسجيل سحب المصروف من الدرج</span>
                </button>
                <button
                  type="button"
                  onClick={closeModal}
                  className="py-3 px-4 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl font-bold transition cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 10: Customer Quick Picker Modal (اختيار أو ربط عميل) */}
      {isCustomerPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col border border-zinc-200">
            <div className="p-4 bg-zinc-900 text-white flex items-center justify-between">
              <span className="font-extrabold text-sm">اختيار عميل وربطه بالفاتورة</span>
              <button onClick={() => setIsCustomerPickerOpen(false)} className="p-1 text-zinc-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 border-b border-zinc-100">
              <input
                type="text"
                value={customerPickerSearch}
                onChange={(e) => setCustomerPickerSearch(e.target.value)}
                placeholder="البحث بالاسم أو رقم الهاتف..."
                autoFocus
                className="w-full p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-bold text-zinc-800 focus:outline-hidden focus:border-black"
              />
            </div>

            <div className="p-3 max-h-64 overflow-y-auto space-y-1 text-xs">
              <button
                type="button"
                onClick={() => {
                  setCustomerName('عميل نقدي');
                  setIsCustomerPickerOpen(false);
                }}
                className="w-full p-2.5 rounded-xl hover:bg-zinc-100 text-start flex justify-between items-center border border-dashed border-zinc-200"
              >
                <span className="font-bold text-zinc-800">عميل نقدي افتراضي</span>
                <span className="text-[10px] text-zinc-400">افتراضي</span>
              </button>

              {customersList
                .filter(c =>
                  c.name.toLowerCase().includes(customerPickerSearch.toLowerCase()) ||
                  c.phone.includes(customerPickerSearch)
                )
                .map((cust) => (
                  <button
                    key={cust.id}
                    type="button"
                    onClick={() => handleSelectCustomer(cust)}
                    className="w-full p-2.5 rounded-xl hover:bg-zinc-100 text-start flex justify-between items-center border border-zinc-100 transition"
                  >
                    <div>
                      <p className="font-bold text-zinc-900">{cust.name}</p>
                      <p className="text-[10px] text-zinc-500 font-mono" dir="ltr">{cust.phone}</p>
                    </div>
                    <div className="text-end">
                      <span className="text-[10px] font-bold text-zinc-800 font-mono block">
                        إنفاق: {(cust.totalSpentFils / 1000).toFixed(3)} د.أ
                      </span>
                    </div>
                  </button>
                ))}
            </div>

            <div className="p-3 bg-zinc-50 border-t border-zinc-200 flex justify-end">
              <button
                type="button"
                onClick={() => setIsCustomerPickerOpen(false)}
                className="py-2 px-4 bg-zinc-200 hover:bg-zinc-300 text-zinc-700 rounded-xl font-bold text-xs"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      

      {/* ==============================================================
          MODAL 9: OFFLINE SALES QUEUE & SYNC MANAGER
      ============================================================== */}
      {isOfflineQueueModalOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto" dir="rtl">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 shadow-2xl border border-zinc-200 flex flex-col max-h-[90vh] animate-fade-in my-auto">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 mb-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-300 text-amber-700 flex items-center justify-center">
                  <HardDrive className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-zinc-900">فواتير وضع دون الاتصال (Offline Queue)</h3>
                  <p className="text-xs text-zinc-500">الفواتير المحفوظة محلياً أثناء انقطاع الإنترنت - محفوظة بأمان تام في الذاكرة المحلية</p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-xl transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4 shrink-0">
              <div className="bg-zinc-50 border border-zinc-200 p-3 rounded-2xl">
                <span className="text-[11px] font-bold text-zinc-500 block mb-1">عدد الفواتير المعلقة</span>
                <span className="text-xl font-black font-mono text-zinc-900">{offlineQueueList.length} فاتورة</span>
              </div>
              <div className="bg-amber-50 border border-amber-200 p-3 rounded-2xl">
                <span className="text-[11px] font-bold text-amber-700 block mb-1">إجمالي المبيعات المحفوظة</span>
                <span className="text-xl font-black font-mono text-amber-900" dir="ltr">
                  {(offlineQueueList.reduce((sum, item) => sum + (item.total || 0), 0) / 1000).toFixed(3)} د.أ
                </span>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-2xl">
                <span className="text-[11px] font-bold text-emerald-700 block mb-1">حالة الحفظ المحلي</span>
                <span className="text-sm font-black text-emerald-800 flex items-center gap-1 mt-1">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  محفوظ في IndexedDB
                </span>
              </div>
            </div>

            {/* Table of Queued Invoices */}
            <div className="flex-1 overflow-y-auto border border-zinc-200 rounded-2xl mb-4">
              {offlineQueueList.length === 0 ? (
                <div className="p-12 text-center text-zinc-400 flex flex-col items-center gap-2">
                  <CheckCheck className="w-8 h-8 text-emerald-500" />
                  <p className="font-bold text-sm text-zinc-700">لا توجد فواتير معلقة حالياً</p>
                  <p className="text-xs text-zinc-400">جميع عمليات البيع تمت مزامنتها بالكامل مع السيرفر المركزي</p>
                </div>
              ) : (
                <table className="w-full text-right border-collapse text-xs">
                  <thead className="bg-zinc-100 text-zinc-700 sticky top-0 font-bold border-b border-zinc-200">
                    <tr>
                      <th className="p-3">رقم الفاتورة المؤقت</th>
                      <th className="p-3">التوقيت</th>
                      <th className="p-3">العميل</th>
                      <th className="p-3">طريقة الدفع</th>
                      <th className="p-3">المبلغ</th>
                      <th className="p-3">الحالة</th>
                      <th className="p-3 text-center">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {offlineQueueList.map((sale) => (
                      <tr key={sale.id} className="hover:bg-zinc-50 transition">
                        <td className="p-3 font-mono font-bold text-zinc-900">{sale.id}</td>
                        <td className="p-3 text-zinc-600 font-mono text-[11px]" dir="ltr">
                          {new Date(sale.createdAt).toLocaleTimeString('ar-JO-u-nu-latn', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="p-3 font-bold text-zinc-800">{sale.customerName || 'عميل نقدي'}</td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded bg-zinc-100 font-bold text-[10px] text-zinc-700">
                            {sale.paymentMethod === 'CASH' ? 'نقدي' : sale.paymentMethod === 'CARD' ? 'بطاقة/شبكة' : sale.paymentMethod === 'CREDIT' ? 'آجل' : 'محفظة'}
                          </span>
                        </td>
                        <td className="p-3 font-black font-mono text-zinc-900" dir="ltr">
                          {(sale.total / 1000).toFixed(3)} د.أ
                        </td>
                        <td className="p-3">
                          {sale.syncStatus === 'SYNCING' ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                              <RefreshCcw className="w-3 h-3 animate-spin" />
                              جارٍ الإرسال...
                            </span>
                          ) : sale.syncStatus === 'CONFLICT' ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded" title={sale.conflictReason || sale.lastError}>
                              <AlertCircle className="w-3 h-3" />
                              تعارض (Conflict)
                            </span>
                          ) : sale.syncStatus === 'SYNCED' ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                              <CheckCheck className="w-3 h-3" />
                              تمت المزامنة
                            </span>
                          ) : sale.syncStatus === 'FAILED' ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded" title={sale.lastError}>
                              <AlertCircle className="w-3 h-3" />
                              فشل - سيعاد الإرسال
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
                              بانتظار المزامنة
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                if (sale.receiptData) {
                                  setReceiptData(sale.receiptData);
                                  setShowReceiptModal(true);
                                }
                              }}
                              className="p-1.5 hover:bg-zinc-200 text-zinc-700 rounded-lg transition inline-flex items-center gap-1 text-[11px] font-bold"
                              title="طباعة إيصال الفاتورة"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              <span>طباعة</span>
                            </button>
                            {(sale.syncStatus === 'CONFLICT' || sale.syncStatus === 'FAILED') && (
                              <button
                                type="button"
                                onClick={async () => {
                                  if (confirm('هل أنت متأكد من حذف هذه الفاتورة من قائمة الانتظار؟')) {
                                    await removeOfflineSale(sale.id);
                                    const updated = await getOfflineQueue();
                                    setOfflineQueueList(updated || []);
                                    setOfflineQueueCount(updated?.length || 0);
                                    showToast('تم حذف الفاتورة من القائمة المعلقة');
                                  }
                                }}
                                className="p-1.5 hover:bg-rose-100 text-rose-600 rounded-lg transition text-[11px] font-bold"
                                title="حذف الفاتورة المعلقة"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-between gap-3 pt-3 border-t border-zinc-100 shrink-0">
              <button
                type="button"
                onClick={closeModal}
                className="py-2.5 px-5 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded-xl font-bold text-xs transition"
              >
                إغلاق
              </button>

              {offlineQueueList.length > 0 && (
                <button
                  type="button"
                  onClick={async () => {
                    await handleSyncOfflineQueue();
                    const updated = await getOfflineQueue();
                    setOfflineQueueList(updated || []);
                  }}
                  disabled={isSyncingOffline}
                  className="py-2.5 px-6 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold text-xs transition flex items-center gap-2 shadow-xs disabled:opacity-50"
                >
                  <RefreshCcw className={`w-4 h-4 ${isSyncingOffline ? 'animate-spin' : ''}`} />
                  <span>{isSyncingOffline ? 'جارٍ مزامنة الفواتير...' : 'مزامنة جميع الفواتير الآن'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Floating Status Notification Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 start-6 z-50 bg-black text-white px-4 py-2.5 rounded-2xl shadow-xl border border-zinc-700 flex items-center gap-2 text-xs font-bold animate-fade-in">
          <Sparkles className="w-4 h-4 text-zinc-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Global CSS for Clean 80mm/58mm ESC/POS Thermal Printing */}
      <style jsx global>{`
        @media print {
          @page {
            size: ${printingSettings.receiptPaperWidth === '58mm' ? '58mm auto' : '80mm auto'};
            margin: 0mm !important;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
          }
          body * {
            visibility: hidden !important;
          }
          #thermal-receipt-printable, #thermal-receipt-printable * {
            visibility: visible !important;
          }
          #thermal-receipt-printable {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: ${printingSettings.receiptPaperWidth === '58mm' ? '56mm' : '78mm'} !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 2mm 3mm !important;
            background: #ffffff !important;
            color: #000000 !important;
            font-family: monospace, 'Courier New', Courier, monospace !important;
            border: none !important;
            box-shadow: none !important;
          }
        }
      `}</style>
    </div>
  );
}
export default POSCashierWorkspace;
