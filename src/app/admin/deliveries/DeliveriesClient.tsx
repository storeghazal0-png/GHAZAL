'use client';

import React, { useState, useTransition, useEffect } from 'react';
import Link from 'next/link';
import { 
  Truck, Package, PackageCheck, CheckCircle2, Clock, DollarSign, Phone, 
  AlertCircle, Check, ChevronRight, ChevronDown, FileText, Send, Printer, 
  Search, RefreshCw, X, Eye, ExternalLink, ShieldAlert, CheckSquare, Square, 
  Building2, MapPin, Landmark, Filter, Lock, Plus, Pencil, Trash2, UserCheck
} from 'lucide-react';
import { 
  CourierBatchRecord, 
  CourierBatchOrderSummary, 
  DeliveryOrderRecord, 
  DeliverySettlementStatement,
  CourierCompany,
  createCourierBatchAction, 
  updateCourierBatchStatusAction,
  cancelOrderInCourierBatchAction,
  cancelMultipleOrdersInCourierBatchAction,
  getCourierCompaniesAction,
  saveCourierCompanyAction,
  toggleCourierCompanyStatusAction,
  deleteCourierCompanyAction,
  setDefaultCourierCompanyAction
} from '@/actions/settlements';
import { updateShippingZone, getAllCompanyShippingZonesAction } from '@/actions/shipping';
import { getDemoOrderById } from '@/lib/orders-catalog';

interface Props {
  initialTabParam?: string;
  initialPreparedOrders: CourierBatchOrderSummary[];
  initialCourierBatches: CourierBatchRecord[];
  initialDeliveryOrders: DeliveryOrderRecord[];
  deliverySettlement: DeliverySettlementStatement;
  initialShippingZones?: any[];
  initialCourierCompanies?: CourierCompany[];
  isPOS?: boolean;
}

const getInitialTab = (param?: string): 'READY_ORDERS' | 'BATCHES' | 'ALL_ORDERS' | 'SHIPPING_ZONES' | 'COURIER_COMPANIES' => {
  if (!param) return 'READY_ORDERS';
  const clean = param.toLowerCase().trim();
  if (clean === 'ready' || clean === 'ready_orders' || clean === 'ready-orders') return 'READY_ORDERS';
  if (clean === 'batches' || clean === 'courier-batches' || clean === 'courier-settlements' || clean === 'settlements' || clean === 'cod') return 'BATCHES';
  if (clean === 'all-orders' || clean === 'all_orders' || clean === 'orders' || clean === 'all-deliveries' || clean === 'deliveries') return 'ALL_ORDERS';
  if (clean === 'shipping-zones' || clean === 'shipping' || clean === 'pricing' || clean === 'zones') return 'SHIPPING_ZONES';
  if (clean === 'courier-companies' || clean === 'couriers' || clean === 'companies' || clean === 'delegates') return 'COURIER_COMPANIES';
  return 'READY_ORDERS';
};

export function DeliveriesClient({
  initialTabParam,
  initialPreparedOrders,
  initialCourierBatches,
  initialDeliveryOrders,
  deliverySettlement,
  initialShippingZones = [],
  initialCourierCompanies = [],
  isPOS = false
}: Props) {
  const [activeTab, setActiveTab] = useState<'READY_ORDERS' | 'BATCHES' | 'ALL_ORDERS' | 'SHIPPING_ZONES' | 'COURIER_COMPANIES'>(
    () => getInitialTab(initialTabParam)
  );

  const handleTabChange = (tab: 'READY_ORDERS' | 'BATCHES' | 'ALL_ORDERS' | 'SHIPPING_ZONES' | 'COURIER_COMPANIES') => {
    setActiveTab(tab);
    const paramMap = {
      'READY_ORDERS': 'ready',
      'BATCHES': 'batches',
      'ALL_ORDERS': 'all-orders',
      'SHIPPING_ZONES': 'shipping-zones',
      'COURIER_COMPANIES': 'couriers'
    };
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', paramMap[tab]);
      url.searchParams.delete('q');
      url.searchParams.delete('view');
      window.history.replaceState(null, '', url.toString());
    }
  };

  const [preparedOrders, setPreparedOrders] = useState<CourierBatchOrderSummary[]>(initialPreparedOrders);
  const [courierBatches, setCourierBatches] = useState<CourierBatchRecord[]>(initialCourierBatches);
  const [deliveryOrders, setDeliveryOrders] = useState<DeliveryOrderRecord[]>(initialDeliveryOrders);
  const [shippingZones, setShippingZones] = useState<any[]>(initialShippingZones);
  const [savingZoneId, setSavingZoneId] = useState<string | null>(null);

  // Background auto-refresh synchronization
  useEffect(() => {
    setPreparedOrders(initialPreparedOrders);
    setCourierBatches(initialCourierBatches);
    setDeliveryOrders(initialDeliveryOrders);
    setShippingZones(initialShippingZones);
    if (initialCourierCompanies) {
      setCourierCompanies(initialCourierCompanies);
    }
  }, [initialPreparedOrders, initialCourierBatches, initialDeliveryOrders, initialShippingZones, initialCourierCompanies]);
  
  // Selection state for ready orders
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  
  // Create Batch Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [batchNumberInput, setBatchNumberInput] = useState('');
  const [courierNameInput, setCourierNameInput] = useState('سريعة إكسبرس');
  const [batchNotesInput, setBatchNotesInput] = useState('');
  const [modalFeedback, setModalFeedback] = useState<string | null>(null);

  // Cancel Entire Batch Modal State
  const [cancelBatchModal, setCancelBatchModal] = useState<{
    isOpen: boolean;
    batch: CourierBatchRecord | null;
    storeBearsCost: boolean;
  } | null>(null);

  // Cancel Single Order in Batch Modal State
  const [cancelOrderModal, setCancelOrderModal] = useState<{
    isOpen: boolean;
    batch: CourierBatchRecord | null;
    order: CourierBatchOrderSummary | null;
    storeBearsCost: boolean;
    reason: string;
  } | null>(null);

  // Cancel Multiple Selected Orders in Batch Modal State
  const [cancelSomeOrdersModal, setCancelSomeOrdersModal] = useState<{
    isOpen: boolean;
    batch: CourierBatchRecord | null;
    ordersState: Record<string, { isSelected: boolean; storeBearsDeliveryCost: boolean; reason: string }>;
  } | null>(null);

  // Batch Status Updating State
  const [updatingBatchId, setUpdatingBatchId] = useState<string | null>(null);
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);

  // Print Manifest Modal State
  const [manifestBatch, setManifestBatch] = useState<CourierBatchRecord | null>(null);

  // Multi-order Shipment Details Modal State
  const [selectedBatchDetails, setSelectedBatchDetails] = useState<CourierBatchRecord | null>(null);

  // Courier Companies & Partners State
  const [courierCompanies, setCourierCompanies] = useState<CourierCompany[]>(
    initialCourierCompanies && initialCourierCompanies.length > 0
      ? initialCourierCompanies
      : [
          { id: 'comp-1', name: 'سريعة إكسبرس', phone: '0791112233', type: 'COMPANY', active: true, isDefaultStoreCourier: true, defaultFeeFils: 2500, notes: 'الشركة المعتمدة الرئيسية للتوصيل لكافة محافظات المملكة', createdAt: '2026-01-01' },
          { id: 'comp-2', name: 'أرامكس (Aramex)', phone: '065358899', type: 'COMPANY', active: true, isDefaultStoreCourier: false, defaultFeeFils: 3000, notes: 'شحنات المحافظات البعيدة والمستعجلة', createdAt: '2026-01-05' },
          { id: 'comp-3', name: 'مندوب غزل الخاص (عين الباشا)', phone: '0795554433', type: 'DELEGATE', active: true, isDefaultStoreCourier: false, defaultFeeFils: 1500, notes: 'توصيل محلي فوري داخل لواء عين الباشا ومخيم البقعة', createdAt: '2026-01-10' }
        ]
  );
  const [selectedCompanyIdForZones, setSelectedCompanyIdForZones] = useState<string>(() => {
    const def = (initialCourierCompanies || []).find(c => c.isDefaultStoreCourier);
    return def ? def.id : 'comp-1';
  });
  const [companyRatesMap, setCompanyRatesMap] = useState<Record<string, any[]>>({});
  const [isAdoptingCompany, setIsAdoptingCompany] = useState(false);

  useEffect(() => {
    getAllCompanyShippingZonesAction().then(res => {
      if (res?.rates) {
        setCompanyRatesMap(res.rates);
        if (res.defaultCompanyId) {
          setSelectedCompanyIdForZones(prev => prev || res.defaultCompanyId);
        }
      }
    }).catch(() => {});
  }, []);

  const [isCompanyModalOpen, setIsCompanyModalOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<CourierCompany | null>(null);
  const [companyFormName, setCompanyFormName] = useState('');
  const [companyFormPhone, setCompanyFormPhone] = useState('');
  const [companyFormType, setCompanyFormType] = useState<'COMPANY' | 'DELEGATE'>('COMPANY');
  const [companyFormNotes, setCompanyFormNotes] = useState('');
  const [companyActionLoading, setCompanyActionLoading] = useState(false);
  const [companySearch, setCompanySearch] = useState('');
  const [batchCompanyFilter, setBatchCompanyFilter] = useState('ALL');

  const handleSetDefaultCompany = async (companyId: string) => {
    setIsAdoptingCompany(true);
    try {
      const res = await setDefaultCourierCompanyAction(companyId);
      if (res.success) {
        setCourierCompanies(prev => prev.map(c => ({
          ...c,
          isDefaultStoreCourier: c.id === companyId
        })));
        const comp = courierCompanies.find(c => c.id === companyId);
        showToast(`تم اعتماد "${comp?.name || 'الشركة'}" كشركة التوصيل المعتمدة للمتجر الإلكتروني بنجاح ⭐ (تظهر أسعارها للزبائن مباشرة في صفحة الدفع)`);
      } else {
        showToast(res.error || 'فشل اعتماد الشركة للمتجر');
      }
    } catch (err: any) {
      showToast('تعذر الاعتماد: ' + err.message);
    } finally {
      setIsAdoptingCompany(false);
    }
  };

  const handleOpenAddCompany = () => {
    setEditingCompany(null);
    setCompanyFormName('');
    setCompanyFormPhone('');
    setCompanyFormType('COMPANY');
    setCompanyFormNotes('');
    setIsCompanyModalOpen(true);
  };

  const handleOpenEditCompany = (comp: CourierCompany) => {
    setEditingCompany(comp);
    setCompanyFormName(comp.name);
    setCompanyFormPhone(comp.phone);
    setCompanyFormType(comp.type);
    setCompanyFormNotes(comp.notes || '');
    setIsCompanyModalOpen(true);
  };

  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyFormName.trim()) return;
    setCompanyActionLoading(true);
    try {
      const res = await saveCourierCompanyAction({
        id: editingCompany ? editingCompany.id : undefined,
        name: companyFormName.trim(),
        phone: companyFormPhone.trim(),
        type: companyFormType,
        notes: companyFormNotes.trim(),
        active: editingCompany ? editingCompany.active : true,
        isDefaultStoreCourier: editingCompany ? editingCompany.isDefaultStoreCourier : false
      });
      if (res.success && res.companies) {
        setCourierCompanies(res.companies);
        setIsCompanyModalOpen(false);
        showToast(editingCompany ? 'تم تعديل بيانات شركة التوصيل بنجاح' : 'تمت إضافة شركة التوصيل / المندوب بنجاح');
      } else {
        alert(res.error || 'فشل حفظ البيانات');
      }
    } finally {
      setCompanyActionLoading(false);
    }
  };

  const handleToggleCompanyStatus = async (id: string) => {
    const res = await toggleCourierCompanyStatusAction(id);
    if (res.success) {
      setCourierCompanies(prev => prev.map(c => c.id === id ? { ...c, active: res.active! } : c));
      showToast('تم تحديث حالة تفعيل الشركة/المندوب');
    }
  };

  const handleDeleteCompany = async (id: string, name: string) => {
    if (!window.confirm(`هل أنتِ متأكدة من حذف "${name}" من قائمة شركات التوصيل والمناديب؟`)) return;
    const res = await deleteCourierCompanyAction(id);
    if (res.success) {
      setCourierCompanies(prev => prev.filter(c => c.id !== id));
      showToast('تم حذف شركة التوصيل بنجاح');
    }
  };

  const handleViewBatchForOrder = (ord: DeliveryOrderRecord) => {
    const matched = courierBatches.find(b =>
      b.orders.some(o => o.orderId === ord.id || o.orderNumber === ord.orderNumber || o.orderNumber === ord.id)
    );
    if (matched) {
      setSelectedBatchDetails(matched);
    } else {
      setSelectedBatchDetails({
        id: ord.id,
        batchNumber: `شحنة مستقلة (${ord.orderNumber})`,
        courierName: ord.companyName || 'سريعة إكسبرس',
        status: ord.status === 'DELIVERED_COLLECTED' || ord.status === 'SETTLED' ? 'DELIVERED' : ord.status === 'IN_TRANSIT' ? 'OUT_FOR_DELIVERY' : 'PREPARED',
        orders: [
          {
            orderId: ord.id,
            orderNumber: ord.orderNumber,
            customerName: ord.customerName,
            customerPhone: '',
            city: ord.city,
            address: ord.city,
            codAmountFils: ord.codAmountFils,
            deliveryFeeFils: ord.deliveryFeeFils,
            netSettlementFils: ord.netSettlementFils,
            status: ord.status
          }
        ],
        totalExpectedCodFils: ord.codAmountFils,
        totalCollectedCodFils: ord.status === 'DELIVERED_COLLECTED' || ord.status === 'SETTLED' ? ord.codAmountFils : 0,
        totalCodFils: ord.codAmountFils,
        totalDeliveryFeeFils: ord.deliveryFeeFils,
        totalReturnFeeFils: 0,
        totalCourierFeesFils: ord.deliveryFeeFils,
        netSettlementFils: ord.netSettlementFils,
        storeReceivableFils: Math.max(0, ord.netSettlementFils),
        companyPayableFils: Math.max(0, -ord.netSettlementFils),
        remittedFils: 0,
        remainingFils: ord.netSettlementFils,
        deliveredOrdersCount: ord.status === 'DELIVERED_COLLECTED' ? 1 : 0,
        returnedOrdersCount: ord.status === 'RETURNED' ? 1 : 0,
        inTransitOrdersCount: ord.status === 'IN_TRANSIT' ? 1 : 0,
        isPartialSettlement: false,
        remittances: [],
        notes: 'طلب مباشر من المتجر الإلكتروني',
        createdAt: ord.date,
        updatedAt: ord.date
      });
    }
  };

  // Search and Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [courierFilter, setCourierFilter] = useState<string>('ALL');
  
  // Toast Notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 5000);
  };

  // English Number and Money Formatting
  const formatMoney = (fils: number): string => {
    return (fils / 1000).toFixed(3);
  };

  const formatJordanDate = (isoString?: string) => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      return new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Amman',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      }).format(d);
    } catch {
      return isoString;
    }
  };

  // Selection handlers
  const handleToggleSelectOrder = (id: string) => {
    setSelectedOrderIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSelectAllOrders = () => {
    if (selectedOrderIds.length === preparedOrders.length) {
      setSelectedOrderIds([]);
    } else {
      setSelectedOrderIds(preparedOrders.map(o => o.orderId));
    }
  };

  // Open Create Batch Modal
  const handleOpenCreateModal = () => {
    if (selectedOrderIds.length === 0) {
      alert('يرجى تحديد طلب واحد على الأقل أولاً لإنشاء طلبية التوصيل');
      return;
    }
    const nextSeq = (courierBatches.length + 1).toString().padStart(3, '0');
    setBatchNumberInput(`BATCH-2026-${nextSeq}`);
    setBatchNotesInput('');
    setModalFeedback(null);
    const activeCompanies = courierCompanies.filter(c => c.active);
    const defComp = activeCompanies.find(c => c.isDefaultStoreCourier) || activeCompanies[0];
    if (defComp) {
      setCourierNameInput(defComp.name);
    } else {
      setCourierNameInput('سريعة إكسبرس');
    }
    setIsCreateModalOpen(true);
  };

  // Confirm Create Batch
  const handleConfirmCreateBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!batchNumberInput.trim() || !courierNameInput.trim()) {
      setModalFeedback('يرجى إدخال رقم الطلبية واسم شركة التوصيل');
      return;
    }

    setModalFeedback(null);
    startTransition(async () => {
      try {
        const res = await createCourierBatchAction({
          batchNumber: batchNumberInput.trim(),
          courierName: courierNameInput.trim(),
          orderIds: selectedOrderIds,
          notes: batchNotesInput.trim()
        });

        if (!res.success) {
          setModalFeedback(res.error || 'فشل إنشاء طلبية التوصيل');
          return;
        }

        if (res.batch) {
          setCourierBatches(prev => [res.batch!, ...prev]);
          setPreparedOrders(prev => prev.filter(o => !selectedOrderIds.includes(o.orderId)));
          setSelectedOrderIds([]);

          // Also populate into deliveryOrders so it immediately appears in سجل كافة طلبات التوصيل
          if (res.batch.orders && res.batch.orders.length > 0) {
            const addedDeliveryOrders: DeliveryOrderRecord[] = res.batch.orders.map(o => ({
              id: `del-${o.orderId}`,
              orderNumber: o.orderNumber,
              companyName: res.batch!.courierName,
              customerName: o.customerName,
              city: o.city,
              codAmountFils: o.codAmountFils,
              deliveryFeeFils: o.deliveryFeeFils,
              netSettlementFils: o.netSettlementFils,
              status: 'IN_TRANSIT',
              date: new Date().toISOString().split('T')[0]
            }));
            setDeliveryOrders(prev => [...addedDeliveryOrders, ...prev]);
          }
        }

        setIsCreateModalOpen(false);
        handleTabChange('BATCHES');
        showToast(`تم إنشاء طلبية التوصيل #${res.batch?.batchNumber} بنجاح! تم نقل جميع الطلبات المحددة إلى (قيد الشحن والتوصيل).`);
      } catch (err: any) {
        setModalFeedback(err.message || 'حدث خطأ أثناء حفظ الطلبية');
      }
    });
  };

  // Safe Batch Status Selector Change Handler
  const handleStatusSelectChange = (
    batch: CourierBatchRecord,
    selectedStatus: 'PREPARED' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'SETTLED' | 'CANCELLED' | 'CANCEL_SOME_ORDERS'
  ) => {
    // Terminal lock check
    if (batch.status === 'DELIVERED' || batch.status === 'SETTLED' || batch.status === 'CANCELLED') {
      alert('لا يمكن تعديل حالة هذه الطلبية إطلاقاً لأنها بحالة نهائية مقفلة لضمان النزاهة والمطابقة المحاسبية.');
      return;
    }

    // Cancel multiple selected orders inside batch
    if (selectedStatus === 'CANCEL_SOME_ORDERS') {
      const activeOrders = batch.orders.filter(o => o.status !== 'CANCELLED');
      if (activeOrders.length === 0) {
        alert('جميع طلبات هذه الإرسالية ملغاة بالفعل.');
        return;
      }
      const initialOrdersState: Record<string, { isSelected: boolean; storeBearsDeliveryCost: boolean; reason: string }> = {};
      activeOrders.forEach(o => {
        initialOrdersState[o.orderId] = {
          isSelected: false,
          storeBearsDeliveryCost: false,
          reason: ''
        };
      });
      setCancelSomeOrdersModal({
        isOpen: true,
        batch,
        ordersState: initialOrdersState
      });
      return;
    }

    // Cancellation: open modal to choose store delivery cost bearing
    if (selectedStatus === 'CANCELLED') {
      setCancelBatchModal({
        isOpen: true,
        batch,
        storeBearsCost: false
      });
      return;
    }

    // Permanent Delivered Locking confirmation
    if (selectedStatus === 'DELIVERED') {
      const confirmMsg = `🔒 تنبيه هام ومصيري:\n\nعند تحويل حالة طلبية التوصيل #${batch.batchNumber} إلى (تم التوصيل للزبائن بالكامل ✓)، سيتم قفل حالتها نهائياً ولن يمكن تعديل حالتها أو التراجع عنها بعد ذلك أبداً.\n\nهل أنتِ متأكدة من اعتماد التوصيل بالكامل والقفل الآن؟`;
      if (!window.confirm(confirmMsg)) return;
      executeBatchStatusUpdate(batch.id, 'DELIVERED');
      return;
    }

    if (selectedStatus === 'SETTLED') {
      const confirmMsg = `🔒 تنبيه:\n\nسيتم قفل طلبية التوصيل #${batch.batchNumber} واعتماد توريد الكاش للصندوق نهائياً.\n\nهل تودين الاستمرار؟`;
      if (!window.confirm(confirmMsg)) return;
      executeBatchStatusUpdate(batch.id, 'SETTLED');
      return;
    }

    // Other status transitions (PREPARED / OUT_FOR_DELIVERY)
    const statusLabels: Record<string, string> = {
      'PREPARED': 'تم التجهيز بانتظار استلام المندوب',
      'OUT_FOR_DELIVERY': 'خرجت للتوصيل مع المندوب 🚚'
    };
    const confirmMsg = `هل أنتِ متأكدة من تغيير حالة طلبية التوصيل #${batch.batchNumber} إلى: "${statusLabels[selectedStatus]}"؟`;
    if (!window.confirm(confirmMsg)) return;
    executeBatchStatusUpdate(batch.id, selectedStatus);
  };

  // Confirm Multiple Selected Orders Cancellation
  const handleConfirmCancelSomeOrders = () => {
    if (!cancelSomeOrdersModal?.batch) return;
    const { batch, ordersState } = cancelSomeOrdersModal;
    const selectedEntries = Object.entries(ordersState).filter(([_, s]) => s.isSelected);
    if (selectedEntries.length === 0) {
      alert('يرجى تحديد طلب واحد على الأقل لإلغائه.');
      return;
    }

    const cancelledOrders = selectedEntries.map(([orderId, s]) => ({
      orderId,
      storeBearsDeliveryCost: s.storeBearsDeliveryCost,
      reason: s.reason.trim() || undefined
    }));

    setUpdatingBatchId(batch.id);
    startTransition(async () => {
      try {
        const res = await cancelMultipleOrdersInCourierBatchAction({
          batchId: batch.id,
          cancelledOrders
        });

        if (!res.success) {
          alert(res.error || 'فشل إلغاء الطلبات المحددة');
          return;
        }

        if (res.batch) {
          setCourierBatches(prev => prev.map(b => b.id === batch.id ? res.batch! : b));
        }

        setCancelSomeOrdersModal(null);
        showToast(res.message || `تم إلغاء ${cancelledOrders.length} طلبات بنجاح وتحديث الحسابات.`);
      } catch (err: any) {
        alert(err.message || 'حدث خطأ أثناء إلغاء الطلبات');
      } finally {
        setUpdatingBatchId(null);
      }
    });
  };

  // Execute Batch Status Update
  const executeBatchStatusUpdate = (
    batchId: string, 
    newStatus: 'PREPARED' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'SETTLED' | 'CANCELLED',
    storeBearsCost = false
  ) => {
    setUpdatingBatchId(batchId);
    startTransition(async () => {
      try {
        const res = await updateCourierBatchStatusAction({
          batchId,
          newStatus,
          storeBearsDeliveryCost: storeBearsCost
        });
        if (!res.success) {
          alert(res.error || 'فشل تحديث حالة طلبية التوصيل');
          return;
        }

        setCourierBatches(prev => prev.map(b => {
          if (b.id === batchId) {
            const isDeliveredOrSettled = newStatus === 'DELIVERED' || newStatus === 'SETTLED';
            const updatedOrders = b.orders.map(o => ({
              ...o,
              status: isDeliveredOrSettled ? 'DELIVERED' : newStatus === 'OUT_FOR_DELIVERY' ? 'SHIPPED' : o.status
            }));

            return {
              ...b,
              status: newStatus,
              orders: updatedOrders,
              updatedAt: new Date().toISOString()
            };
          }
          return b;
        }));

        showToast(res.message || `تم تحديث حالة طلبية التوصيل بنجاح!`);
      } catch (err: any) {
        alert(err.message || 'حدث خطأ أثناء تحديث حالة الطلبية');
      } finally {
        setUpdatingBatchId(null);
      }
    });
  };

  // Confirm Entire Batch Cancellation from Modal
  const handleConfirmCancelBatch = () => {
    if (!cancelBatchModal?.batch) return;
    const batchId = cancelBatchModal.batch.id;
    const storeBearsCost = cancelBatchModal.storeBearsCost;

    setUpdatingBatchId(batchId);
    startTransition(async () => {
      try {
        const res = await updateCourierBatchStatusAction({
          batchId,
          newStatus: 'CANCELLED',
          storeBearsDeliveryCost: storeBearsCost
        });

        if (!res.success) {
          alert(res.error || 'فشل إلغاء طلبية التوصيل');
          return;
        }

        setCourierBatches(prev => prev.map(b => {
          if (b.id === batchId) {
            const totalDeliveryFee = storeBearsCost ? b.totalDeliveryFeeFils : 0;
            return {
              ...b,
              status: 'CANCELLED',
              totalCodFils: 0,
              totalDeliveryFeeFils: totalDeliveryFee,
              netSettlementFils: storeBearsCost ? -totalDeliveryFee : 0,
              updatedAt: new Date().toISOString(),
              orders: b.orders.map(o => ({
                ...o,
                status: 'CANCELLED',
                codAmountFils: 0,
                deliveryFeeFils: storeBearsCost ? o.deliveryFeeFils : 0
              }))
            };
          }
          return b;
        }));

        setCancelBatchModal(null);
        showToast(res.message || 'تم إلغاء طلبية التوصيل وقفلها نهائياً بنجاح.');
      } catch (err: any) {
        alert(err.message || 'حدث خطأ أثناء إلغاء طلبية التوصيل');
      } finally {
        setUpdatingBatchId(null);
      }
    });
  };

  // Open Modal to Cancel Single Order inside Batch
  const handleOpenCancelOrderModal = (batch: CourierBatchRecord, order: CourierBatchOrderSummary) => {
    if (batch.status === 'DELIVERED' || batch.status === 'SETTLED' || batch.status === 'CANCELLED') {
      alert('لا يمكن تعديل أو إلغاء هذا الطلب لأن حالة إرسالية الشحن مقفلة نهائياً.');
      return;
    }
    setCancelOrderModal({
      isOpen: true,
      batch,
      order,
      storeBearsCost: false,
      reason: ''
    });
  };

  // Confirm Single Order Cancellation
  const handleConfirmCancelOrder = () => {
    if (!cancelOrderModal?.batch || !cancelOrderModal?.order) return;
    const { batch, order, storeBearsCost, reason } = cancelOrderModal;

    startTransition(async () => {
      try {
        const res = await cancelOrderInCourierBatchAction({
          batchId: batch.id,
          orderId: order.orderId,
          storeBearsDeliveryCost: storeBearsCost,
          reason: reason.trim() || undefined
        });

        if (!res.success) {
          alert(res.error || 'فشل إلغاء الطلب');
          return;
        }

        if (res.batch) {
          setCourierBatches(prev => prev.map(b => b.id === batch.id ? res.batch! : b));
        } else {
          setCourierBatches(prev => prev.map(b => {
            if (b.id === batch.id) {
              const updatedOrders = b.orders.map(o => {
                if (o.orderId === order.orderId) {
                  return {
                    ...o,
                    status: 'CANCELLED',
                    codAmountFils: 0,
                    deliveryFeeFils: storeBearsCost ? o.deliveryFeeFils : 0
                  };
                }
                return o;
              });
              const totalCod = updatedOrders.filter(o => o.status !== 'CANCELLED').reduce((s, o) => s + o.codAmountFils, 0);
              const totalFee = updatedOrders.reduce((s, o) => s + o.deliveryFeeFils, 0);
              return {
                ...b,
                orders: updatedOrders,
                totalCodFils: totalCod,
                totalDeliveryFeeFils: totalFee,
                netSettlementFils: totalCod - totalFee,
                updatedAt: new Date().toISOString()
              };
            }
            return b;
          }));
        }

        setCancelOrderModal(null);
        showToast(res.message || `تم إلغاء الطلب #${order.orderNumber} بنجاح.`);
      } catch (err: any) {
        alert(err.message || 'حدث خطأ أثناء إلغاء الطلب');
      }
    });
  };

  // Trigger Print Manifest
  const handlePrintManifest = (batch: CourierBatchRecord) => {
    setManifestBatch(batch);
    setTimeout(() => {
      window.print();
    }, 400);
  };

  // Shipping Zone Handler
  const handleSaveShippingZone = async (id: string, feeJOD: number, costJOD: number, isEnabled: boolean) => {
    setSavingZoneId(id);
    try {
      const fee = Math.round(feeJOD * 1000);
      const cost = Math.round(costJOD * 1000);
      const res = await updateShippingZone(id, { fee, cost, isEnabled }, selectedCompanyIdForZones);
      if (res.success) {
        setCompanyRatesMap(prev => {
          const oldList = prev[selectedCompanyIdForZones] || shippingZones;
          const newList = oldList.map(z => z.id === id ? { ...z, fee, cost, isEnabled } : z);
          return { ...prev, [selectedCompanyIdForZones]: newList };
        });
        const isDef = courierCompanies.find(c => c.id === selectedCompanyIdForZones)?.isDefaultStoreCourier;
        if (isDef) {
          setShippingZones(prev => prev.map(z => z.id === id ? { ...z, fee, cost, isEnabled } : z));
        }
        showToast('تم حفظ وتحديث سعر التوصيل وسعر التكلفة بنجاح لهذه الشركة.');
      }
    } catch (err: any) {
      showToast('تعذر التحديث: ' + (err.message || 'خطأ أثناء الحفظ'));
    } finally {
      setSavingZoneId(null);
    }
  };

  // KPI Computations
  const totalCodReady = preparedOrders.reduce((sum, o) => sum + (o.codAmountFils || 0), 0);
  const activeBatchesCount = courierBatches.filter(b => b.status === 'OUT_FOR_DELIVERY').length;
  const deliveredBatchesCount = courierBatches.filter(b => b.status === 'DELIVERED' || b.status === 'SETTLED').length;
  const totalNetReceivable = courierBatches
    .filter(b => b.status === 'OUT_FOR_DELIVERY' || b.status === 'DELIVERED')
    .reduce((sum, b) => sum + b.netSettlementFils, 0);

  // Filtered Batches
  const filteredBatches = courierBatches.filter(b => {
    const matchesSearch = b.batchNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          b.courierName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          b.orders.some(o => o.orderNumber.toLowerCase().includes(searchQuery.toLowerCase()) || o.customerName.toLowerCase().includes(searchQuery.toLowerCase()) || o.customerPhone.includes(searchQuery));
    const matchesStatus = statusFilter === 'ALL' || b.status === statusFilter;
    const matchesCourier = courierFilter === 'ALL' || b.courierName.toLowerCase().includes(courierFilter.toLowerCase()) || courierFilter.toLowerCase().includes(b.courierName.toLowerCase());
    return matchesSearch && matchesStatus && matchesCourier;
  });

  return (
    <div className="space-y-6">
      {/* Toast Feedback */}
      {toastMessage && (
        <div className="fixed top-5 start-1/2 -translate-x-1/2 z-50 bg-zinc-900 text-white font-bold text-xs md:text-sm px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-pink-500 animate-slide-down">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
          <button onClick={() => setToastMessage(null)} className="p-1 hover:bg-zinc-800 rounded-lg text-zinc-400">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Top Header */}
      <div className="bg-white rounded-3xl border border-zinc-200 p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-6 bg-[#E6007E] rounded-full inline-block"></span>
            <h1 className="text-2xl font-black font-heading text-zinc-900 flex items-center gap-2">
              <Truck className="w-7 h-7 text-[#E6007E]" />
              <span>إدارة طلبيات التوصيل وشركات الشحن</span>
            </h1>
          </div>
          <p className="text-xs text-zinc-500 font-medium">
            المنصة المركزية لإسناد الطلبات المجهزة، إصدار أرقام طلبيات الشحن المجمعة، الطباعة، ومتابعة التوصيل
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'READY_ORDERS' && (
            <button
              type="button"
              onClick={handleOpenCreateModal}
              disabled={selectedOrderIds.length === 0}
              className="bg-[#E6007E] hover:bg-pink-600 disabled:opacity-40 text-white font-extrabold px-5 py-2.5 rounded-xl text-xs transition shadow-md flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed"
            >
              <PackageCheck className="w-4 h-4" />
              <span>إنشاء طلبية توصيل ({selectedOrderIds.length})</span>
            </button>
          )}
          <Link
            href={isPOS ? "/pos/orders" : "/admin/orders"}
            className="px-4 py-2.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 text-xs font-bold transition flex items-center gap-1.5"
          >
            <Package className="w-4 h-4 text-zinc-400" />
            <span>طلبات المتجر</span>
          </Link>
        </div>
      </div>

      {/* KPI Stats Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
        <div 
          onClick={() => handleTabChange('READY_ORDERS')}
          className={`p-4 rounded-2xl border cursor-pointer transition shadow-2xs ${
            activeTab === 'READY_ORDERS'
              ? 'bg-purple-50/70 border-purple-300 ring-2 ring-purple-400/20'
              : 'bg-white border-zinc-200 hover:bg-zinc-50'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-bold text-zinc-500 mb-1">
            <span>طلبات جاهزة للشحن</span>
            <span className="p-1.5 rounded-lg bg-purple-100 text-purple-700">
              <PackageCheck className="w-4 h-4" />
            </span>
          </div>
          <p className="text-2xl font-black font-mono text-zinc-900">{preparedOrders.length}</p>
          <p className="text-[11px] text-zinc-400 font-medium mt-0.5">
            بقيمة تحصيل: <span className="font-mono font-bold text-purple-900">{formatMoney(totalCodReady)} د.أ</span>
          </p>
        </div>

        <div 
          onClick={() => handleTabChange('BATCHES')}
          className={`p-4 rounded-2xl border cursor-pointer transition shadow-2xs ${
            activeTab === 'BATCHES'
              ? 'bg-teal-50/70 border-teal-300 ring-2 ring-teal-400/20'
              : 'bg-white border-zinc-200 hover:bg-zinc-50'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-bold text-zinc-500 mb-1">
            <span>طلبيات قيد التوصيل</span>
            <span className="p-1.5 rounded-lg bg-teal-100 text-teal-700">
              <Truck className="w-4 h-4" />
            </span>
          </div>
          <p className="text-2xl font-black font-mono text-zinc-900">{activeBatchesCount}</p>
          <p className="text-[11px] text-zinc-400 font-medium mt-0.5">
            مع المناديب في الميدان
          </p>
        </div>

        <div 
          onClick={() => handleTabChange('ALL_ORDERS')}
          className={`p-4 rounded-2xl border cursor-pointer transition shadow-2xs ${
            activeTab === 'ALL_ORDERS'
              ? 'bg-zinc-100 border-zinc-400 ring-2 ring-zinc-400/20'
              : 'bg-white border-zinc-200 hover:bg-zinc-50'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-bold text-zinc-500 mb-1">
            <span>كافة طلبيات التوصيل</span>
            <span className="p-1.5 rounded-lg bg-zinc-800 text-white">
              <Truck className="w-4 h-4" />
            </span>
          </div>
          <p className="text-2xl font-black font-mono text-zinc-900">{courierBatches.length}</p>
          <p className="text-[11px] text-zinc-400 font-medium mt-0.5">
            منها {deliveredBatchesCount} طلبية مسلّمة
          </p>
        </div>

        <div 
          onClick={() => handleTabChange('SHIPPING_ZONES')}
          className={`p-4 rounded-2xl border cursor-pointer transition shadow-2xs ${
            activeTab === 'SHIPPING_ZONES'
              ? 'bg-emerald-50/70 border-emerald-300 ring-2 ring-emerald-400/20'
              : 'bg-white border-zinc-200 hover:bg-zinc-50'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-bold text-zinc-500 mb-1">
            <span>المحافظات وأسعار التوصيل</span>
            <span className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700">
              <MapPin className="w-4 h-4" />
            </span>
          </div>
          <p className="text-2xl font-black font-mono text-emerald-700">{shippingZones.filter(z => z.isEnabled).length} مفعلة</p>
          <p className="text-[11px] text-zinc-400 font-medium mt-0.5">
            إجمالي {shippingZones.length || 12} محافظة بالأردن
          </p>
        </div>

        <div 
          onClick={() => handleTabChange('COURIER_COMPANIES')}
          className={`p-4 rounded-2xl border cursor-pointer transition shadow-2xs ${
            activeTab === 'COURIER_COMPANIES'
              ? 'bg-blue-50/70 border-blue-300 ring-2 ring-blue-400/20'
              : 'bg-white border-zinc-200 hover:bg-zinc-50'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-bold text-zinc-500 mb-1">
            <span>شركات الشحن والمناديب</span>
            <span className="p-1.5 rounded-lg bg-blue-100 text-blue-700">
              <Building2 className="w-4 h-4" />
            </span>
          </div>
          <p className="text-2xl font-black font-mono text-blue-700">{courierCompanies.filter(c => c.active).length} نشطة</p>
          <p className="text-[11px] text-zinc-400 font-medium mt-0.5">
            إجمالي {courierCompanies.length} شركة ومندوب
          </p>
        </div>
      </div>

      {/* Main Tab Controls */}
      <div className="flex flex-wrap items-center gap-2 p-1.5 bg-zinc-100 rounded-2xl border border-zinc-200">
        <button
          type="button"
          onClick={() => handleTabChange('READY_ORDERS')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
            activeTab === 'READY_ORDERS'
              ? 'bg-purple-600 text-white shadow-xs'
              : 'text-zinc-700 hover:bg-white hover:text-zinc-900'
          }`}
        >
          <PackageCheck className="w-4 h-4" />
          <span>الطلبات الجاهزة وإنشاء إرسالية</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black font-mono ${
            activeTab === 'READY_ORDERS' ? 'bg-purple-700 text-white' : 'bg-purple-100 text-purple-800'
          }`}>
            {preparedOrders.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('BATCHES')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
            activeTab === 'BATCHES'
              ? 'bg-[#E6007E] text-white shadow-xs'
              : 'text-zinc-700 hover:bg-white hover:text-zinc-900'
          }`}
        >
          <Truck className="w-4 h-4" />
          <span>سجل طلبيات وشحنات شركة التوصيل</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black font-mono ${
            activeTab === 'BATCHES' ? 'bg-pink-700 text-white' : 'bg-pink-100 text-[#E6007E]'
          }`}>
            {courierBatches.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('ALL_ORDERS')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
            activeTab === 'ALL_ORDERS'
              ? 'bg-zinc-800 text-white shadow-xs'
              : 'text-zinc-700 hover:bg-white hover:text-zinc-900'
          }`}
        >
          <Truck className="w-4 h-4" />
          <span>كافة طلبيات التوصيل</span>
          <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold ${
            activeTab === 'ALL_ORDERS' ? 'bg-zinc-900 text-white' : 'bg-zinc-200 text-zinc-800'
          }`}>
            {courierBatches.length} طلبية
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('SHIPPING_ZONES')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
            activeTab === 'SHIPPING_ZONES'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-zinc-700 hover:bg-white hover:text-zinc-900'
          }`}
        >
          <MapPin className="w-4 h-4" />
          <span>المحافظات وأسعار التوصيل المعتمدة</span>
          <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold ${
            activeTab === 'SHIPPING_ZONES' ? 'bg-emerald-700 text-white' : 'bg-emerald-100 text-emerald-800'
          }`}>
            {shippingZones.filter(z => z.isEnabled).length} مفعلة
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('COURIER_COMPANIES')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
            activeTab === 'COURIER_COMPANIES'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-zinc-700 hover:bg-white hover:text-zinc-900'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>إدارة شركات التوصيل والمناديب</span>
          <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold ${
            activeTab === 'COURIER_COMPANIES' ? 'bg-blue-700 text-white' : 'bg-blue-100 text-blue-800'
          }`}>
            {courierCompanies.filter(c => c.active).length} نشطة
          </span>
        </button>
      </div>

      {/* ==================================================================== */}
      {/* TAB 1: READY ORDERS & CREATE BATCH                                   */}
      {/* ==================================================================== */}
      {activeTab === 'READY_ORDERS' && (
        <div className="space-y-4 animate-fade-in">
          {/* Informational Guidance Alert */}
          <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-purple-900 shadow-2xs">
            <div className="flex items-start gap-3">
              <span className="w-9 h-9 rounded-xl bg-purple-100 text-purple-700 font-black flex items-center justify-center shrink-0 text-base">
                📦
              </span>
              <div>
                <h4 className="font-black text-purple-950 text-sm">
                  الطلبات الجاهزة للتسليم إلى شركة التوصيل
                </h4>
                <p className="text-[11px] text-purple-800 font-medium mt-0.5 leading-relaxed">
                  هذه الطلبات اكتمل تجهيزها وتغليفها بالمعرض. لتغيير حالتها إلى مشحونة، حددي طلباً أو أكثر ثم اضغطي <strong>(إنشاء طلبية توصيل)</strong> وأعطيها رقماً ليتم تجميعها في إرسالية شحن واحدة ومتابعتها مع المندوب.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleOpenCreateModal}
              disabled={selectedOrderIds.length === 0}
              className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white font-black text-xs flex items-center justify-center gap-2 transition shadow-xs shrink-0 cursor-pointer disabled:cursor-not-allowed"
            >
              <Truck className="w-4 h-4" />
              <span>إنشاء طلبية توصيل ({selectedOrderIds.length})</span>
            </button>
          </div>

          {/* Prepared Orders Table */}
          <div className="bg-white rounded-3xl border border-zinc-200 overflow-hidden shadow-xs">
            <div className="p-4 bg-zinc-50/70 border-b border-zinc-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleSelectAllOrders}
                  className="flex items-center gap-2 font-bold text-zinc-700 hover:text-purple-700 transition cursor-pointer"
                >
                  {selectedOrderIds.length > 0 && selectedOrderIds.length === preparedOrders.length ? (
                    <CheckSquare className="w-4 h-4 text-purple-600" />
                  ) : (
                    <Square className="w-4 h-4 text-zinc-400" />
                  )}
                  <span>تحديد الكل ({preparedOrders.length})</span>
                </button>
                {selectedOrderIds.length > 0 && (
                  <span className="font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-md text-[11px]">
                    محدد: {selectedOrderIds.length} طلب
                  </span>
                )}
              </div>

              <div className="text-zinc-500 font-bold">
                إجمالي COD للطلبات المحددة: <span className="text-zinc-900 font-mono font-black">{formatMoney(
                  preparedOrders.filter(o => selectedOrderIds.includes(o.orderId)).reduce((sum, o) => sum + (o.codAmountFils || 0), 0)
                )} د.أ</span>
              </div>
            </div>

            {preparedOrders.length === 0 ? (
              <div className="p-16 text-center text-zinc-400 space-y-2">
                <PackageCheck className="w-12 h-12 text-zinc-300 mx-auto" />
                <h4 className="font-black text-sm text-zinc-700">لا توجد طلبات جاهزة بانتظار الشحن حالياً</h4>
                <p className="text-xs text-zinc-400">
                  عندما يقوم فريق المعرض بتجهيز أي طلب جديد وتغيير حالته إلى (تم التجهيز)، سيظهر هنا تلقائياً لضمه إلى طلبيات التوصيل.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-start border-collapse text-xs md:text-sm">
                  <thead className="bg-zinc-100/70 text-zinc-700 font-bold border-b border-zinc-200">
                    <tr>
                      <th className="p-3.5 w-10 text-center">اختيار</th>
                      <th className="p-3.5 text-start">رقم الطلب</th>
                      <th className="p-3.5 text-start">العميل ورقم الهاتف</th>
                      <th className="p-3.5 text-start">المحافظة والعنوان</th>
                      <th className="p-3.5 text-start">رسوم التوصيل</th>
                      <th className="p-3.5 text-start">إجمالي التحصيل (COD)</th>
                      <th className="p-3.5 text-center">معاينة الفاتورة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {preparedOrders.map((ord) => {
                      const isSelected = selectedOrderIds.includes(ord.orderId);
                      return (
                        <tr 
                          key={ord.orderId}
                          className={`hover:bg-purple-50/30 transition cursor-pointer ${isSelected ? 'bg-purple-50/50' : ''}`}
                          onClick={() => handleToggleSelectOrder(ord.orderId)}
                        >
                          <td className="p-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelectOrder(ord.orderId)}
                              className="rounded text-purple-600 focus:ring-purple-500 cursor-pointer w-4 h-4"
                            />
                          </td>
                          <td className="p-3.5 font-bold font-mono text-zinc-900">
                            <span className="text-purple-700 font-black">{ord.orderNumber}</span>
                          </td>
                          <td className="p-3.5">
                            <span className="font-bold text-zinc-900 block">{ord.customerName}</span>
                            <a 
                              href={`https://wa.me/962${ord.customerPhone.replace(/[^0-9]/g, '').slice(-9)}`} 
                              target="_blank" 
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-emerald-700 font-mono text-xs hover:underline inline-flex items-center gap-1 font-semibold"
                            >
                              <Phone className="w-3 h-3" />
                              <span dir="ltr">{ord.customerPhone}</span>
                            </a>
                          </td>
                          <td className="p-3.5 text-zinc-600">
                            <div className="flex items-center gap-1 font-bold text-zinc-800">
                              <MapPin className="w-3.5 h-3.5 text-pink-500 shrink-0" />
                              <span>{ord.city || 'الأردن'}</span>
                            </div>
                            <span className="text-[11px] text-zinc-400 block truncate max-w-xs">{ord.address}</span>
                          </td>
                          <td className="p-3.5 font-mono font-bold text-zinc-600">
                            {formatMoney(ord.deliveryFeeFils)} د.أ
                          </td>
                          <td className="p-3.5 font-mono font-black text-emerald-700">
                            {formatMoney(ord.codAmountFils)} د.أ
                          </td>
                          <td className="p-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                            <Link
                              href={`/ar/invoice/${ord.orderId}`}
                              target="_blank"
                              className="p-1.5 rounded-lg border border-zinc-200 hover:bg-zinc-100 text-zinc-600 hover:text-zinc-900 inline-flex items-center gap-1 text-xs font-bold transition"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>فاتورة</span>
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 2: COURIER BATCHES MANAGEMENT                                    */}
      {/* ==================================================================== */}
      {activeTab === 'BATCHES' && (
        <div className="space-y-4 animate-fade-in">
          {/* Filter Toolbar */}
          <div className="bg-white rounded-2xl border border-zinc-200 p-4 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex-1 relative">
              <Search className="w-4 h-4 text-zinc-400 absolute start-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="البحث برقم طلبية الشحن، شركة التوصيل، أو رقم أي طلب..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full ps-9 pe-3 py-2 border border-zinc-200 rounded-xl text-xs outline-none focus:border-[#E6007E]"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-zinc-400 shrink-0">شركة التوصيل:</span>
              <select
                value={courierFilter}
                onChange={(e) => setCourierFilter(e.target.value)}
                className="border border-zinc-200 rounded-xl px-3 py-2 text-xs font-bold text-zinc-700 bg-white outline-none focus:border-[#E6007E]"
              >
                <option value="ALL">كافة الشركات والمناديب</option>
                {courierCompanies.map((c) => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>

              <span className="text-xs font-bold text-zinc-400 shrink-0">الحالة:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="border border-zinc-200 rounded-xl px-3 py-2 text-xs font-bold text-zinc-700 bg-white outline-none focus:border-[#E6007E]"
              >
                <option value="ALL">كافة الحالات</option>
                <option value="OUT_FOR_DELIVERY">خرجت للتوصيل 🚚</option>
                <option value="PREPARED">تم التجهيز</option>
                <option value="DELIVERED">تم التوصيل للزبائن ✓</option>
                <option value="SETTLED">تمت التسوية وتوريد الكاش 💰</option>
                <option value="CANCELLED">ملغاة</option>
              </select>
            </div>
          </div>

          {/* Batches List */}
          {filteredBatches.length === 0 ? (
            <div className="bg-white rounded-3xl border border-dashed border-zinc-300 p-16 text-center text-zinc-400 space-y-2">
              <Truck className="w-12 h-12 text-zinc-300 mx-auto" />
              <h4 className="font-black text-sm text-zinc-700">لا توجد طلبيات توصيل مطابقة للبحث</h4>
              <p className="text-xs text-zinc-400">
                يمكنكِ الانتقال لتبويب &quot;الطلبات الجاهزة&quot; لتحديد الطلبات وإنشاء أول طلبية شحن.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredBatches.map((batch) => {
                const isExpanded = expandedBatchId === batch.id;
                const isUpdating = updatingBatchId === batch.id;
                const isLocked = batch.status === 'DELIVERED' || batch.status === 'SETTLED' || batch.status === 'CANCELLED';

                const statusBg = ({
                  'PREPARED': 'bg-purple-100 text-purple-900 border-purple-200',
                  'OUT_FOR_DELIVERY': 'bg-teal-100 text-teal-900 border-teal-200',
                  'PARTIALLY_DELIVERED': 'bg-amber-100 text-amber-900 border-amber-200',
                  'DELIVERED': 'bg-blue-100 text-blue-900 border-blue-200',
                  'PARTIALLY_SETTLED': 'bg-indigo-100 text-indigo-900 border-indigo-200',
                  'SETTLED': 'bg-emerald-100 text-emerald-900 border-emerald-200',
                  'CANCELLED': 'bg-rose-100 text-rose-900 border-rose-200'
                } as Record<string, string>)[batch.status] || 'bg-zinc-100 text-zinc-900';

                return (
                  <div 
                    key={batch.id}
                    className="bg-white rounded-3xl border border-zinc-200 overflow-hidden shadow-xs hover:border-zinc-300 transition"
                  >
                    {/* Batch Card Top Header */}
                    <div className="p-4 md:p-5 bg-zinc-50/60 border-b border-zinc-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <div className="w-11 h-11 rounded-2xl bg-[#FADAE6] text-[#E6007E] font-black flex items-center justify-center shrink-0 shadow-2xs">
                          <Truck className="w-6 h-6" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-black font-mono text-base text-zinc-900 tracking-wider">
                              #{batch.batchNumber}
                            </span>
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${statusBg}`}>
                              {batch.status === 'PREPARED' && 'تم التجهيز بانتظار استلام المندوب'}
                              {batch.status === 'OUT_FOR_DELIVERY' && 'خرجت للتوصيل مع المندوب 🚚'}
                              {batch.status === 'DELIVERED' && 'تم التوصيل للزبائن بالكامل ✓ (مقفل)'}
                              {batch.status === 'SETTLED' && 'تمت التسوية وتوريد الكاش للمحل 💰 (مقفل)'}
                              {batch.status === 'CANCELLED' && 'ملغاة نهائياً (مقفل)'}
                            </span>
                            {isLocked && (
                              <span className="text-[10px] font-bold text-zinc-400 bg-zinc-100 px-2 py-0.5 rounded flex items-center gap-1 border border-zinc-200">
                                <Lock className="w-3 h-3 text-zinc-500" />
                                <span>مقفل نهائياً</span>
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-zinc-500 font-bold mt-1 flex items-center gap-2">
                            <span>شركة التوصيل: <strong className="text-zinc-900">{batch.courierName}</strong></span>
                            <span>•</span>
                            <span className="font-mono text-zinc-400">{formatJordanDate(batch.createdAt)}</span>
                          </p>
                          {batch.notes && (
                            <p className="text-[11px] text-zinc-600 mt-1 bg-white px-2 py-0.5 rounded border border-zinc-200 inline-block">
                              ملاحظات: {batch.notes}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Right Actions: Status Dropdown & Print */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Status Change Selector or Locked Badge */}
                        {isLocked ? (
                          <div 
                            className="flex items-center gap-1.5 bg-zinc-100 border border-zinc-200 px-3 py-1.5 rounded-xl text-zinc-700 shadow-2xs" 
                            title="حالة معتمدة ومقفلة نهائياً لا يمكن تعديلها لضمان النزاهة والمطابقة المحاسبية"
                          >
                            <Lock className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                            <span className="text-xs font-black">
                              {batch.status === 'DELIVERED' && 'تم التوصيل بالكامل (مقفل 🔒)'}
                              {batch.status === 'SETTLED' && 'تمت التسوية والكاش (مقفل 🔒)'}
                              {batch.status === 'CANCELLED' && 'ملغاة نهائياً (مقفل 🔒)'}
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 bg-white border border-zinc-300 px-3 py-1.5 rounded-xl shadow-2xs">
                            <span className="text-[11px] text-zinc-500 font-bold">تغيير الحالة:</span>
                            <select
                              disabled={isUpdating || isPending}
                              value={batch.status}
                              onChange={(e) => handleStatusSelectChange(batch, e.target.value as any)}
                              className="bg-transparent font-black text-xs text-zinc-900 outline-none cursor-pointer"
                            >
                              <option value="PREPARED">تم التجهيز</option>
                              <option value="OUT_FOR_DELIVERY">خرجت للتوصيل 🚚</option>
                              <option value="DELIVERED">تم التوصيل بالكامل ✓ (قفل نهائي)</option>
                              <option value="SETTLED">تمت التسوية وتوريد الكاش 💰 (قفل نهائي)</option>
                              <option value="CANCEL_SOME_ORDERS">إلغاء بعض الطلبات ⚠️</option>
                              <option value="CANCELLED">إلغاء الطلبية كاملة ❌</option>
                            </select>
                          </div>
                        )}

                        {/* Print Delivery Manifest Button */}
                        <button
                          type="button"
                          onClick={() => handlePrintManifest(batch)}
                          className="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-black text-white font-bold text-xs flex items-center gap-1.5 transition shadow-2xs cursor-pointer"
                          title="طباعة كشف الإرسالية لشركة التوصيل للتوقيع"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>طباعة</span>
                        </button>

                        {/* Expand / Collapse Button */}
                        <button
                          type="button"
                          onClick={() => setExpandedBatchId(isExpanded ? null : batch.id)}
                          className="px-3 py-2 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-100 text-zinc-700 font-bold text-xs flex items-center gap-1 transition"
                        >
                          <span>{isExpanded ? 'إخفاء الطلبات' : `عرض الطلبات (${batch.orders.length})`}</span>
                          {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    {/* Financial Summary Strip */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 bg-zinc-50/30 text-xs border-b border-zinc-100 divide-x divide-zinc-100 divide-x-reverse font-mono text-center">
                      <div className="p-2.5">
                        <span className="text-[10px] text-zinc-400 font-bold block">عدد الطلبات</span>
                        <span className="font-black text-zinc-900">{batch.orders.length} طلبات</span>
                      </div>
                      <div className="p-2.5">
                        <span className="text-[10px] text-zinc-400 font-bold block">إجمالي تحصيل COD</span>
                        <span className="font-black text-zinc-900">{formatMoney(batch.totalCodFils)} د.أ</span>
                      </div>
                      <div className="p-2.5">
                        <span className="text-[10px] text-rose-500 font-bold block">رسوم التوصيل المقتطعة</span>
                        <span className="font-black text-rose-600">-{formatMoney(batch.totalDeliveryFeeFils)} د.أ</span>
                      </div>
                      <div className="p-2.5 bg-emerald-50/50">
                        <span className="text-[10px] text-emerald-700 font-bold block">صافي النقد المستحق للمحل</span>
                        <span className="font-black text-emerald-800 text-sm">{formatMoney(batch.netSettlementFils)} د.أ</span>
                      </div>
                    </div>

                    {/* Expanded Orders List */}
                    {isExpanded && (
                      <div className="p-4 bg-white animate-fade-in border-t border-zinc-100">
                        <h4 className="font-black text-xs text-zinc-800 mb-3 flex items-center gap-1.5">
                          <Package className="w-3.5 h-3.5 text-[#E6007E]" />
                          <span>الطلبات المشمولة داخل طلبية التوصيل #{batch.batchNumber}:</span>
                        </h4>

                        <div className="overflow-x-auto rounded-xl border border-zinc-200">
                          <table className="w-full text-start text-xs border-collapse">
                            <thead className="bg-zinc-50 text-zinc-700 font-bold border-b border-zinc-200">
                              <tr>
                                <th className="p-2.5 text-start">رقم الطلب</th>
                                <th className="p-2.5 text-start">اسم العميل</th>
                                <th className="p-2.5 text-start">رقم الهاتف</th>
                                <th className="p-2.5 text-start">المحافظة / العنوان</th>
                                <th className="p-2.5 text-start">أجور التوصيل</th>
                                <th className="p-2.5 text-start">مبلغ التحصيل (COD)</th>
                                <th className="p-2.5 text-center">الفاتورة</th>
                                <th className="p-2.5 text-center">حالة الطلب / الإجراء</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100">
                              {batch.orders.map((bo) => {
                                const isOrderCancelled = bo.status === 'CANCELLED';
                                return (
                                  <tr key={bo.orderId} className={`hover:bg-zinc-50 ${isOrderCancelled ? 'bg-rose-50/20 opacity-80' : ''}`}>
                                    <td className="p-2.5 font-mono font-bold text-purple-700">
                                      <Link href={isPOS ? `/pos/orders?search=${bo.orderNumber}` : `/admin/orders/${bo.orderId}`} className="hover:underline flex items-center gap-1">
                                        <span>{bo.orderNumber}</span>
                                        {isOrderCancelled && <span className="text-rose-600 text-[10px] font-black font-sans">(ملغي)</span>}
                                      </Link>
                                    </td>
                                    <td className="p-2.5 font-bold text-zinc-900">{bo.customerName}</td>
                                    <td className="p-2.5 font-mono text-zinc-600" dir="ltr">{bo.customerPhone}</td>
                                    <td className="p-2.5 text-zinc-600">{bo.city} — {bo.address}</td>
                                    <td className="p-2.5 font-mono text-zinc-500 font-bold">
                                      {formatMoney(bo.deliveryFeeFils)} د.أ
                                      {isOrderCancelled && (
                                        <span className="block text-[10px] text-zinc-400 font-sans">
                                          {bo.deliveryFeeFils > 0 ? '(المتجر تحمّل التوصيل)' : '(معفى)'}
                                        </span>
                                      )}
                                    </td>
                                    <td className="p-2.5 font-mono font-black text-emerald-700">
                                      {isOrderCancelled ? <span className="text-zinc-400 line-through">0.000 د.أ</span> : `${formatMoney(bo.codAmountFils)} د.أ`}
                                    </td>
                                    <td className="p-2.5 text-center">
                                      <Link
                                        href={`/ar/invoice/${bo.orderId}`}
                                        target="_blank"
                                        className="p-1 hover:bg-zinc-100 rounded text-zinc-500 hover:text-zinc-900 inline-flex items-center"
                                        title="عرض الفاتورة الرسمية"
                                      >
                                        <Eye className="w-3.5 h-3.5" />
                                      </Link>
                                    </td>
                                    <td className="p-2.5 text-center">
                                      {isOrderCancelled ? (
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-200">
                                          ملغي ❌
                                        </span>
                                      ) : isLocked ? (
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-zinc-100 text-zinc-600">
                                          معتمد 🔒
                                        </span>
                                      ) : (
                                        <button
                                          type="button"
                                          disabled={isPending}
                                          onClick={() => handleOpenCancelOrderModal(batch, bo)}
                                          className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[11px] font-bold transition flex items-center gap-1 mx-auto cursor-pointer"
                                          title="إلغاء هذا الطلب من الشحنة وتحديد من يتحمل تكلفة التوصيل"
                                        >
                                          <X className="w-3 h-3" />
                                          <span>إلغاء الطلب</span>
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
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 3: ALL COURIER SHIPMENTS & BATCHES ARCHIVE                       */}
      {/* ==================================================================== */}
      {activeTab === 'ALL_ORDERS' && (
        <div className="space-y-4 animate-fade-in">
          {/* Filter & Search Toolbar */}
          <div className="bg-white rounded-3xl border border-zinc-200 p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex-1 relative">
              <Search className="w-4 h-4 text-zinc-400 absolute start-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="البحث برقم طلبية التوصيل، شركة الشحن، أو رقم أي طلب بداخلها..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full ps-10 pe-4 py-2.5 border border-zinc-200 rounded-2xl text-xs font-bold outline-none focus:border-[#E6007E] focus:ring-2 focus:ring-pink-100 transition"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-zinc-400 shrink-0">شركة التوصيل:</span>
              <select
                value={courierFilter}
                onChange={(e) => setCourierFilter(e.target.value)}
                className="border border-zinc-200 rounded-xl px-3 py-2 text-xs font-bold text-zinc-700 bg-white outline-none focus:border-[#E6007E]"
              >
                <option value="ALL">كافة الشركات والمناديب</option>
                {courierCompanies.map((c) => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>

              <span className="text-xs font-bold text-zinc-400 shrink-0">الحالة:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="border border-zinc-200 rounded-xl px-3 py-2 text-xs font-bold text-zinc-700 bg-white outline-none focus:border-[#E6007E]"
              >
                <option value="ALL">كافة الحالات</option>
                <option value="OUT_FOR_DELIVERY">خرجت للتوصيل 🚚</option>
                <option value="PREPARED">تم التجهيز</option>
                <option value="DELIVERED">تم التوصيل للزبائن ✓</option>
                <option value="SETTLED">تمت التسوية وتوريد الكاش 💰</option>
                <option value="CANCELLED">ملغاة</option>
              </select>
            </div>
          </div>

          {/* KPI Summary Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="bg-white p-3.5 rounded-2xl border border-zinc-200 shadow-2xs">
              <span className="text-[11px] font-bold text-zinc-400 block mb-0.5">عدد الطلبيات</span>
              <p className="text-lg font-black font-mono text-zinc-900">{filteredBatches.length} طلبية</p>
            </div>
            <div className="bg-white p-3.5 rounded-2xl border border-zinc-200 shadow-2xs">
              <span className="text-[11px] font-bold text-zinc-400 block mb-0.5">إجمالي الطلبات المشمولة</span>
              <p className="text-lg font-black font-mono text-purple-700">
                {filteredBatches.reduce((acc, b) => acc + (b.orders?.length || 0), 0)} طلب
              </p>
            </div>
            <div className="bg-white p-3.5 rounded-2xl border border-zinc-200 shadow-2xs">
              <span className="text-[11px] font-bold text-zinc-400 block mb-0.5">إجمالي التحصيل (COD)</span>
              <p className="text-lg font-black font-mono text-zinc-900">
                {formatMoney(filteredBatches.reduce((acc, b) => acc + (b.totalCodFils || 0), 0))} د.أ
              </p>
            </div>
            <div className="bg-white p-3.5 rounded-2xl border border-zinc-200 shadow-2xs">
              <span className="text-[11px] font-bold text-zinc-400 block mb-0.5">إجمالي أجور التوصيل</span>
              <p className="text-lg font-black font-mono text-rose-600">
                -{formatMoney(filteredBatches.reduce((acc, b) => acc + (b.totalDeliveryFeeFils || 0), 0))} د.أ
              </p>
            </div>
            <div className="bg-white p-3.5 rounded-2xl border border-emerald-200 bg-emerald-50/40 shadow-2xs">
              <span className="text-[11px] font-bold text-emerald-800 block mb-0.5">صافي مستحقات المحل</span>
              <p className="text-lg font-black font-mono text-emerald-700">
                {formatMoney(filteredBatches.reduce((acc, b) => acc + (b.netSettlementFils || 0), 0))} د.أ
              </p>
            </div>
          </div>

          {/* Master Courier Batches Table */}
          <div className="bg-white rounded-3xl border border-zinc-200 shadow-xs overflow-hidden">
            <div className="p-4 bg-zinc-50/80 border-b border-zinc-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Truck className="w-4 h-4 text-[#E6007E]" />
                <h3 className="font-black text-sm text-zinc-900">
                  كافة طلبيات وشحنات شركة التوصيل ({filteredBatches.length} طلبية)
                </h3>
              </div>
              <span className="text-xs font-bold text-zinc-400">
                تتضمن كل طلبية مجموعة طلبات مجمعة مع تفاصيل مبالغها وأجورها
              </span>
            </div>

            {filteredBatches.length === 0 ? (
              <div className="p-12 text-center text-zinc-400 space-y-2">
                <Truck className="w-10 h-10 text-zinc-300 mx-auto" />
                <h4 className="font-bold text-sm text-zinc-700">لا توجد طلبيات توصيل مطابقة</h4>
                <p className="text-xs text-zinc-400">يمكنك تعديل خيارات البحث أو إنشاء طلبية جديدة من تبويب &quot;الطلبات الجاهزة&quot;</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-start text-xs border-collapse">
                  <thead className="bg-zinc-100/70 text-zinc-700 font-bold border-b border-zinc-200">
                    <tr>
                      <th className="p-3.5 text-start">رقم / كود الطلبية</th>
                      <th className="p-3.5 text-start">شركة التوصيل</th>
                      <th className="p-3.5 text-start">تاريخ الإرسال</th>
                      <th className="p-3.5 text-center">عدد الطلبات المشمولة</th>
                      <th className="p-3.5 text-start">إجمالي التحصيل (COD)</th>
                      <th className="p-3.5 text-start">أجرة التوصيل</th>
                      <th className="p-3.5 text-start">الصافي للمحل</th>
                      <th className="p-3.5 text-start">حالة الطلبية</th>
                      <th className="p-3.5 text-center">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {filteredBatches.map((batch) => {
                      const isLocked = batch.status === 'DELIVERED' || batch.status === 'SETTLED' || batch.status === 'CANCELLED';
                      const statusBadge = ({
                        'PREPARED': { label: 'تم التجهيز', bg: 'bg-purple-100 text-purple-900 border-purple-200' },
                        'OUT_FOR_DELIVERY': { label: 'خرجت للتوصيل 🚚', bg: 'bg-teal-100 text-teal-900 border-teal-200' },
                        'PARTIALLY_DELIVERED': { label: 'تسليم جزئي 📦', bg: 'bg-amber-100 text-amber-900 border-amber-200' },
                        'DELIVERED': { label: 'تم التوصيل للزبائن ✓', bg: 'bg-blue-100 text-blue-900 border-blue-200' },
                        'PARTIALLY_SETTLED': { label: 'تسوية جزئية ⚖️', bg: 'bg-indigo-100 text-indigo-900 border-indigo-200' },
                        'SETTLED': { label: 'تمت التسوية وتوريد الكاش 💰', bg: 'bg-emerald-100 text-emerald-900 border-emerald-200' },
                        'CANCELLED': { label: 'ملغاة ✕', bg: 'bg-rose-100 text-rose-900 border-rose-200' }
                      } as Record<string, { label: string; bg: string }>)[batch.status] || { label: batch.status, bg: 'bg-zinc-100 text-zinc-800 border-zinc-200' };

                      return (
                        <tr key={batch.id} className="hover:bg-zinc-50/80 transition">
                          {/* Batch ID */}
                          <td className="p-3.5 font-mono font-bold text-zinc-900">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[#E6007E] font-black">#{batch.batchNumber}</span>
                              {isLocked && (
                                <span title="مقفل">
                                  <Lock className="w-3 h-3 text-zinc-400" />
                                </span>
                              )}
                            </div>
                            {batch.notes && (
                              <span className="block text-[10px] text-zinc-400 font-sans mt-0.5 line-clamp-1">
                                {batch.notes}
                              </span>
                            )}
                          </td>

                          {/* Courier Company */}
                          <td className="p-3.5">
                            <span className="font-extrabold text-zinc-900 block">{batch.courierName}</span>
                          </td>

                          {/* Date */}
                          <td className="p-3.5 font-mono text-zinc-500 text-[11px]">
                            {formatJordanDate(batch.createdAt)}
                          </td>

                          {/* Orders Count in Batch */}
                          <td className="p-3.5 text-center">
                            <button
                              type="button"
                              onClick={() => setSelectedBatchDetails(batch)}
                              className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-black bg-purple-100 hover:bg-purple-200 text-purple-900 border border-purple-200 transition cursor-pointer"
                              title="انقري لعرض كافة الطلبات المشمولة بهذه الطلبية"
                            >
                              <Package className="w-3.5 h-3.5 text-purple-700" />
                              <span>{batch.orders?.length || 0} طلبات</span>
                            </button>
                          </td>

                          {/* Total COD Amount */}
                          <td className="p-3.5 font-mono font-black text-zinc-900">
                            {formatMoney(batch.totalCodFils)} د.أ
                          </td>

                          {/* Total Delivery Fee */}
                          <td className="p-3.5 font-mono font-bold text-rose-600">
                            -{formatMoney(batch.totalDeliveryFeeFils || 0)} د.أ
                          </td>

                          {/* Net Settlement Amount */}
                          <td className="p-3.5 font-mono font-black text-emerald-700 bg-emerald-50/30">
                            {formatMoney(batch.netSettlementFils || 0)} د.أ
                          </td>

                          {/* Status */}
                          <td className="p-3.5">
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-black border ${statusBadge.bg}`}>
                              {statusBadge.label}
                            </span>
                          </td>

                          {/* Actions */}
                          <td className="p-3.5 text-center">
                            <div className="flex items-center justify-center gap-1.5 flex-wrap">
                              <button
                                type="button"
                                onClick={() => setSelectedBatchDetails(batch)}
                                className="px-2.5 py-1 rounded-xl bg-zinc-900 hover:bg-black text-white text-xs font-bold transition flex items-center gap-1 shadow-2xs cursor-pointer"
                                title="عرض تفاصيل الطلبية وقائمة الطلبات"
                              >
                                <Eye className="w-3.5 h-3.5 text-pink-400" />
                                <span>عرض الطلبات ({batch.orders?.length || 0})</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handlePrintManifest(batch)}
                                className="px-2.5 py-1 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-200 text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                                title="طباعة كشف المانفيست A4"
                              >
                                <Printer className="w-3.5 h-3.5 text-purple-700" />
                                <span>مانفيست</span>
                              </button>

                              {!isPOS && (batch.status === 'DELIVERED' || batch.status === 'OUT_FOR_DELIVERY') && (
                                <Link
                                  href="/admin/settlements?q=courier-settlements"
                                  className="px-2.5 py-1 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold transition flex items-center gap-1"
                                  title="تسوية هذه الطلبية في الحسابات"
                                >
                                  <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                                  <span>تسوية</span>
                                </Link>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 5: SHIPPING ZONES & GOVERNORATES MANAGEMENT                       */}
      {/* ==================================================================== */}
      {activeTab === 'SHIPPING_ZONES' && (() => {
        const activeCompanyForZones = courierCompanies.find(c => c.id === selectedCompanyIdForZones) || courierCompanies[0];
        const displayedZones = (companyRatesMap[selectedCompanyIdForZones] && companyRatesMap[selectedCompanyIdForZones].length > 0)
          ? companyRatesMap[selectedCompanyIdForZones]
          : shippingZones;

        return (
          <div className="space-y-6 animate-fade-in">
            {/* Header Card */}
            <div className="bg-white rounded-3xl border border-zinc-200 p-6 shadow-xs">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                      <MapPin className="w-5 h-5" />
                    </span>
                    <h2 className="text-xl font-black text-zinc-900">
                      قائمة المحافظات وأسعار التوصيل المعتمدة حسب شركة الشحن
                    </h2>
                  </div>
                  <p className="text-xs text-zinc-500 font-medium leading-relaxed">
                    حددي شركة التوصيل لضبط سعر التوصيل للزبون وسعر التكلفة علينا لكل محافظة. أسعار الشركة المعتمدة هي التي تظهر وتحسب للزبائن في المتجر الإلكتروني عند الشراء.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-800 text-xs font-black border border-emerald-200 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>{displayedZones.filter((z: any) => z.isEnabled).length} محافظة مفعلة</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Courier Company Selection & Store Adoption Bar */}
            <div className="bg-white rounded-3xl border border-zinc-200 p-6 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="font-extrabold text-sm text-zinc-900 flex items-center gap-2">
                    <Truck className="w-4 h-4 text-[#E6007E]" />
                    <span>تحديد شركة الشحن أو المندوب المراد تعديل أسعاره وتكاليفه:</span>
                  </h3>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    انقري على اسم الشركة لعرض وتعديل أسعارها، أو اعتمادها كشركة وحيدة تظهر أسعارها للزبائن.
                  </p>
                </div>
              </div>

              {/* Company Selection Buttons */}
              <div className="flex flex-wrap gap-2.5">
                {courierCompanies.map((c) => {
                  const isSelected = selectedCompanyIdForZones === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelectedCompanyIdForZones(c.id)}
                      className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-black transition-all cursor-pointer border ${
                        isSelected
                          ? 'bg-zinc-900 text-white border-zinc-900 shadow-md ring-2 ring-[#E6007E]/30'
                          : 'bg-zinc-50 hover:bg-zinc-100 text-zinc-700 border-zinc-200'
                      }`}
                    >
                      <Building2 className={`w-3.5 h-3.5 ${isSelected ? 'text-pink-400' : 'text-zinc-500'}`} />
                      <span>{c.name}</span>
                      {c.isDefaultStoreCourier ? (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-emerald-500 text-white shadow-2xs">
                          معتمدة للمتجر ⭐
                        </span>
                      ) : (
                        <span className={`text-[10px] ${isSelected ? 'text-zinc-400' : 'text-zinc-400'}`}>
                          ({c.type === 'DELEGATE' ? 'مندوب' : 'شركة'})
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Adoption Banner */}
              {activeCompanyForZones?.isDefaultStoreCourier ? (
                <div className="bg-emerald-50 border-2 border-emerald-300 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
                  <div className="flex items-center gap-3">
                    <span className="p-2.5 bg-emerald-600 text-white rounded-xl text-lg shadow-xs">⭐</span>
                    <div>
                      <span className="text-emerald-950 font-black text-sm block">
                        &quot;{activeCompanyForZones.name}&quot; هي الشركة المعتمدة رسمياً لطلبات المتجر الإلكتروني
                      </span>
                      <span className="text-xs text-emerald-700 font-semibold block mt-0.5">
                        أسعار التوصيل للزبون المحددة في الجدول أدناه هي المعتمدة رسمياً وتظهر للزبائن في قائمة اختيار المحافظة بصفحة الدفع (Checkout).
                      </span>
                    </div>
                  </div>
                  <span className="px-3.5 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-black shrink-0 flex items-center gap-1.5 shadow-2xs">
                    <Check className="w-3.5 h-3.5" />
                    معتمدة لطلبات المتجر 🛒
                  </span>
                </div>
              ) : (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="p-2.5 bg-amber-100 text-amber-800 rounded-xl text-lg">ℹ️</span>
                    <div>
                      <span className="text-amber-950 font-bold text-sm block">
                        أنتِ تقومين بضبط أسعار وتكاليف: &quot;{activeCompanyForZones?.name}&quot;
                      </span>
                      <span className="text-xs text-amber-700 font-medium block mt-0.5">
                        هذه الشركة ليست معتمدة حالياً لطلبات المتجر الإلكتروني. يمكنك اعتمادها بضغطة زر ليتم تفعيل أسعارها للزبائن فوراً.
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={isAdoptingCompany}
                    onClick={() => handleSetDefaultCompany(selectedCompanyIdForZones)}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl transition shadow-xs flex items-center gap-2 shrink-0 cursor-pointer disabled:opacity-50"
                  >
                    {isAdoptingCompany ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <span>⭐</span>}
                    <span>اعتماد هذه الشركة لطلبات المتجر</span>
                  </button>
                </div>
              )}
            </div>

            {/* Governorates Table */}
            <div className="bg-white rounded-3xl border border-zinc-200 shadow-xs overflow-hidden">
              <div className="p-4 border-b border-zinc-200 bg-zinc-50/50 flex items-center justify-between">
                <h3 className="font-bold text-sm text-zinc-800 flex items-center gap-2">
                  <Landmark className="w-4 h-4 text-emerald-600" />
                  <span>أسعار محافظات المملكة الـ 12 لشركة: ({activeCompanyForZones?.name})</span>
                </h3>
                <span className="text-xs text-zinc-500 font-medium">
                  {activeCompanyForZones?.isDefaultStoreCourier ? 'تعديل أسعار الزبون ينعكس لحظياً في صفحة الدفع' : 'الأسعار خاصة بهذه الشركة فقط'}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-start text-xs md:text-sm">
                  <thead className="bg-zinc-50 text-zinc-500 border-b border-zinc-200 font-bold">
                    <tr>
                      <th className="px-5 py-3.5 text-start">المحافظة (الاسم المعتمد)</th>
                      <th className="px-5 py-3.5 text-start">سعر التوصيل للزبون (د.أ)</th>
                      <th className="px-5 py-3.5 text-start">تكلفة شركة الشحن علينا (د.أ)</th>
                      <th className="px-5 py-3.5 text-start">هامش الربح (د.أ)</th>
                      <th className="px-5 py-3.5 text-start">مدة التوصيل التقريبية</th>
                      <th className="px-5 py-3.5 text-center">الحالة بالمتجر</th>
                      <th className="px-5 py-3.5 text-center">حفظ التعديل</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {displayedZones.map((zone: any) => {
                      const feeJOD = (zone.fee / 1000).toFixed(1);
                      const costJOD = ((zone.cost || 2000) / 1000).toFixed(1);
                      const profitFils = (zone.fee || 2000) - (zone.cost || 2000);
                      const isSaving = savingZoneId === zone.id;

                      return (
                        <tr key={`${selectedCompanyIdForZones}-${zone.id}`} className="hover:bg-emerald-50/20 transition">
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-2">
                              <MapPin className="w-4 h-4 text-pink-500 shrink-0" />
                              <span className="font-bold text-zinc-900 text-sm">{zone.nameAr}</span>
                              <span className="text-xs text-zinc-400 font-mono">({zone.nameEn})</span>
                            </div>
                          </td>

                          <td className="px-5 py-3.5 font-bold">
                            <div className="flex items-center gap-1.5">
                              <input
                                type="number"
                                id={`fee-${zone.id}`}
                                step="0.25"
                                min="0"
                                defaultValue={feeJOD}
                                className="w-20 border border-zinc-300 rounded-lg px-2.5 py-1 text-xs font-black font-mono text-center outline-none focus:border-[#E6007E]"
                              />
                              <span className="text-xs text-zinc-500">د.أ</span>
                            </div>
                          </td>

                          <td className="px-5 py-3.5 font-bold">
                            <div className="flex items-center gap-1.5">
                              <input
                                type="number"
                                id={`cost-${zone.id}`}
                                step="0.25"
                                min="0"
                                defaultValue={costJOD}
                                className="w-20 border border-zinc-300 rounded-lg px-2.5 py-1 text-xs font-black font-mono text-center outline-none focus:border-zinc-500 bg-zinc-50"
                              />
                              <span className="text-xs text-zinc-500">د.أ</span>
                            </div>
                          </td>

                          <td className="px-5 py-3.5 font-mono font-bold">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs ${
                              profitFils > 0 
                                ? 'bg-emerald-100 text-emerald-800' 
                                : profitFils === 0 
                                ? 'bg-zinc-100 text-zinc-700' 
                                : 'bg-rose-100 text-rose-800'
                            }`}>
                              {profitFils > 0 ? `+${(profitFils / 1000).toFixed(3)}` : `${(profitFils / 1000).toFixed(3)}`} د.أ
                            </span>
                          </td>

                          <td className="px-5 py-3.5 text-xs text-zinc-600 font-bold">
                            {zone.estimatedDeliveryTime || 'خلال 2 - 3 أيام عمل'}
                          </td>

                          <td className="px-5 py-3.5 text-center">
                            <label className="inline-flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                id={`enabled-${zone.id}`}
                                defaultChecked={zone.isEnabled}
                                className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                              />
                              <span className={`text-xs font-bold ${zone.isEnabled ? 'text-emerald-700' : 'text-zinc-400'}`}>
                                {zone.isEnabled ? 'مفعل' : 'معطل'}
                              </span>
                            </label>
                          </td>

                          <td className="px-5 py-3.5 text-center">
                            <button
                              type="button"
                              disabled={isSaving}
                              onClick={() => {
                                const feeInput = document.getElementById(`fee-${zone.id}`) as HTMLInputElement;
                                const costInput = document.getElementById(`cost-${zone.id}`) as HTMLInputElement;
                                const enabledInput = document.getElementById(`enabled-${zone.id}`) as HTMLInputElement;
                                const feeVal = parseFloat(feeInput?.value || '2.0');
                                const costVal = parseFloat(costInput?.value || '2.0');
                                const isEnabledVal = enabledInput ? enabledInput.checked : true;
                                handleSaveShippingZone(zone.id, feeVal, costVal, isEnabledVal);
                              }}
                              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition shadow-xs flex items-center gap-1.5 mx-auto cursor-pointer disabled:opacity-50"
                            >
                              {isSaving ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Check className="w-3.5 h-3.5" />
                              )}
                              <span>حفظ</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ==================================================================== */}
      {/* TAB 5: COURIER COMPANIES & DELEGATES MANAGEMENT                      */}
      {/* ==================================================================== */}
      {activeTab === 'COURIER_COMPANIES' && (
        <div className="space-y-6 animate-fade-in">
          {/* Header Card */}
          <div className="bg-white rounded-3xl border border-zinc-200 p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="p-2 rounded-xl bg-blue-50 text-blue-600">
                  <Building2 className="w-5 h-5" />
                </span>
                <h2 className="text-xl font-black text-zinc-900">
                  إدارة شركات التوصيل والمناديب المعتمدة
                </h2>
              </div>
              <p className="text-xs text-zinc-500 font-medium leading-relaxed">
                قائمة شركات الشحن ومناديب المعرض الرسمية المعتمدة لإنشاء إرساليات الشحن، تسوية العهد المالية، ومتابعة التحصيل.
              </p>
            </div>

            <button
              type="button"
              onClick={handleOpenAddCompany}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-black px-4 py-2.5 rounded-xl transition shadow-xs flex items-center gap-2 shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة شركة / مندوب جديد</span>
            </button>
          </div>

          {/* Companies Table Card */}
          <div className="bg-white rounded-3xl border border-zinc-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-zinc-200 bg-zinc-50/50 flex items-center justify-between">
              <h3 className="font-bold text-sm text-zinc-800 flex items-center gap-2">
                <Truck className="w-4 h-4 text-blue-600" />
                <span>الشركات والمناديب المسجلة ({courierCompanies.length})</span>
              </h3>
              <span className="text-xs text-zinc-500 font-medium">
                الشركات النشطة تظهر تلقائياً في خيارات إنشاء الإرسالية وتصفية الفواتير والتسويات
              </span>
            </div>

            {courierCompanies.length === 0 ? (
              <div className="p-12 text-center text-zinc-400 space-y-2">
                <Building2 className="w-10 h-10 text-zinc-300 mx-auto" />
                <p className="font-bold text-sm text-zinc-600">لا توجد شركات شحن أو مناديب مسجلة حالياً</p>
                <p className="text-xs">اضغطي على &quot;إضافة شركة / مندوب جديد&quot; للبدء.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-start text-xs md:text-sm">
                  <thead className="bg-zinc-50 text-zinc-500 border-b border-zinc-200 font-bold">
                    <tr>
                      <th className="px-5 py-3.5 text-start">الاسم والنوع</th>
                      <th className="px-5 py-3.5 text-start">رقم الهاتف / التواصل</th>
                      <th className="px-5 py-3.5 text-center">اعتماد المتجر وأسعار المحافظات</th>
                      <th className="px-5 py-3.5 text-start">ملاحظات</th>
                      <th className="px-5 py-3.5 text-center">الحالة</th>
                      <th className="px-5 py-3.5 text-center">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {courierCompanies.map((comp) => (
                      <tr key={comp.id} className="hover:bg-blue-50/20 transition">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                              {comp.type === 'DELEGATE' ? <UserCheck className="w-4 h-4" /> : <Building2 className="w-4 h-4" />}
                            </div>
                            <div>
                              <span className="font-bold text-zinc-900 block text-sm">{comp.name}</span>
                              <span className="text-[10px] font-semibold text-zinc-400">
                                {comp.type === 'DELEGATE' ? 'مندوب خاص للمعرض' : 'شركة شحن خارجية'}
                              </span>
                            </div>
                          </div>
                        </td>

                        <td className="px-5 py-3.5">
                          {comp.phone ? (
                            <a
                              href={`https://wa.me/962${comp.phone.replace(/[^0-9]/g, '').slice(-9)}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-emerald-700 font-mono text-xs hover:underline inline-flex items-center gap-1 font-semibold"
                            >
                              <Phone className="w-3.5 h-3.5" />
                              <span dir="ltr">{comp.phone}</span>
                            </a>
                          ) : (
                            <span className="text-zinc-400 text-xs">—</span>
                          )}
                        </td>

                        <td className="px-5 py-3.5 text-center">
                          <div className="flex flex-col items-center gap-1.5">
                            {comp.isDefaultStoreCourier ? (
                              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs">
                                <span>⭐</span>
                                <span>معتمدة للمتجر (أسعارها بالدفع)</span>
                              </span>
                            ) : (
                              <button
                                type="button"
                                disabled={isAdoptingCompany}
                                onClick={() => handleSetDefaultCompany(comp.id)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition cursor-pointer disabled:opacity-50"
                                title="اعتماد هذه الشركة لطلبات المتجر الإلكتروني واحتساب أسعارها للزبائن"
                              >
                                <span>⭐</span>
                                <span>اعتماد كشركة المتجر</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedCompanyIdForZones(comp.id);
                                setActiveTab('SHIPPING_ZONES');
                              }}
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-zinc-500 hover:text-emerald-700 hover:underline transition cursor-pointer"
                            >
                              <MapPin className="w-3 h-3 text-pink-500" />
                              <span>تعديل تسعيرة المحافظات ({comp.name})</span>
                            </button>
                          </div>
                        </td>

                        <td className="px-5 py-3.5 text-xs text-zinc-500 max-w-xs truncate">
                          {comp.notes || '—'}
                        </td>

                        <td className="px-5 py-3.5 text-center">
                          <button
                            type="button"
                            onClick={() => handleToggleCompanyStatus(comp.id)}
                            className={`px-3 py-1 rounded-full text-xs font-black transition cursor-pointer ${
                              comp.active 
                                ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200' 
                                : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'
                            }`}
                          >
                            {comp.active ? 'نشطة ✓' : 'معطلة'}
                          </button>
                        </td>

                        <td className="px-5 py-3.5 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleOpenEditCompany(comp)}
                              className="p-1.5 text-zinc-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition cursor-pointer"
                              title="تعديل البيانات"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteCompany(comp.id, comp.name)}
                              className="p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                              title="حذف"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: CREATE COURIER BATCH (إنشاء طلبية توصيل جديدة)                 */}
      {/* ==================================================================== */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto" dir="rtl">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-zinc-200 animate-fade-in my-8">
            <div className="flex items-center justify-between pb-4 border-b border-zinc-200">
              <div className="flex items-center gap-2">
                <Truck className="w-5 h-5 text-[#E6007E]" />
                <h3 className="font-black text-lg text-zinc-900">
                  إنشاء طلبية توصيل جديدة (إرسالية شحن)
                </h3>
              </div>
              <button onClick={() => setIsCreateModalOpen(false)} className="p-1 hover:bg-zinc-100 rounded-lg text-zinc-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            {modalFeedback && (
              <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs p-3 rounded-xl mt-4 font-bold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{modalFeedback}</span>
              </div>
            )}

            <form onSubmit={handleConfirmCreateBatch} className="space-y-4 pt-4 text-xs font-bold text-zinc-700">
              <div className="bg-purple-50 p-3 rounded-2xl border border-purple-200 text-purple-900 text-xs">
                عدد الطلبات المحددة للإرسالية: <strong className="font-mono text-purple-950 font-black text-sm">{selectedOrderIds.length}</strong> طلب
              </div>

              {/* Batch Number */}
              <div>
                <label className="block mb-1 text-zinc-900">رقم طلبية الشحن (Batch Number): *</label>
                <input
                  type="text"
                  required
                  value={batchNumberInput}
                  onChange={(e) => setBatchNumberInput(e.target.value)}
                  placeholder="مثال: BATCH-2026-003"
                  className="w-full border border-zinc-300 rounded-xl px-3.5 py-2.5 text-sm font-mono font-bold outline-none focus:border-[#E6007E]"
                />
                <p className="text-[10px] text-zinc-400 mt-1">يمكنكِ تعديل الرقم أو تركه وفق التسلسل التلقائي.</p>
              </div>

              {/* Courier Company Name - Dropdown List Selection */}
              <div>
                <label className="block mb-1.5 text-zinc-900 font-bold text-xs">
                  شركة التوصيل أو اسم المندوب: *
                </label>
                <div className="relative">
                  <select
                    required
                    value={courierNameInput}
                    onChange={(e) => setCourierNameInput(e.target.value)}
                    className="w-full border border-zinc-300 rounded-xl px-3.5 py-2.5 text-sm font-bold bg-white text-zinc-900 outline-none focus:border-[#E6007E] focus:ring-2 focus:ring-[#E6007E]/20 transition cursor-pointer appearance-none pe-10"
                  >
                    <option value="" disabled>-- اختاري شركة التوصيل أو المندوب من القائمة --</option>
                    {courierCompanies.filter(c => c.active).map((comp) => (
                      <option key={comp.id} value={comp.name}>
                        {comp.name} {comp.isDefaultStoreCourier ? '⭐ (المعتمدة للمتجر)' : comp.type === 'DELEGATE' ? '(مندوب خاص)' : '(شركة شحن)'}
                      </option>
                    ))}
                    {courierCompanies.filter(c => c.active).length === 0 && (
                      <>
                        <option value="سريعة إكسبرس">سريعة إكسبرس (شركة شحن)</option>
                        <option value="أرامكس (Aramex)">أرامكس (Aramex)</option>
                        <option value="مندوب غزل الخاص (عين الباشا)">مندوب غزل الخاص (عين الباشا)</option>
                      </>
                    )}
                  </select>
                  <div className="absolute inset-y-0 end-0 flex items-center pe-3.5 pointer-events-none text-zinc-500">
                    <ChevronDown className="w-4 h-4" />
                  </div>
                </div>
                <p className="text-[10px] text-zinc-400 mt-1">يتم اختيار شركة التوصيل أو المندوب من القائمة المعتمدة لدى المحل.</p>
              </div>

              {/* Notes */}
              <div>
                <label className="block mb-1 text-zinc-900">ملاحظات أو تعليمات خاصة بالسائق (اختياري):</label>
                <textarea
                  rows={2}
                  value={batchNotesInput}
                  onChange={(e) => setBatchNotesInput(e.target.value)}
                  placeholder="أي ملاحظات خاصة بالتسليم أو الكاش..."
                  className="w-full border border-zinc-300 rounded-xl p-3 text-xs outline-none focus:border-[#E6007E]"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-4 border-t border-zinc-200">
                <button
                  type="submit"
                  disabled={isPending}
                  className="flex-1 py-3 bg-[#E6007E] hover:bg-pink-600 text-white font-extrabold rounded-xl transition shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  <span>تأكيد وإنشاء الإرسالية</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="py-3 px-5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold rounded-xl transition cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: CANCEL ENTIRE BATCH (إلغاء طلبية التوصيل بالكامل مع القفل النهائي) */}
      {/* ==================================================================== */}
      {cancelBatchModal?.isOpen && cancelBatchModal.batch && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto" dir="rtl">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-zinc-200 animate-fade-in my-8 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-200">
              <div className="flex items-center gap-2 text-rose-600">
                <ShieldAlert className="w-6 h-6 shrink-0" />
                <h3 className="font-black text-lg text-zinc-900">
                  إلغاء طلبية التوصيل #{cancelBatchModal.batch.batchNumber}
                </h3>
              </div>
              <button 
                type="button"
                onClick={() => setCancelBatchModal(null)} 
                className="p-1 hover:bg-zinc-100 rounded-lg text-zinc-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-black text-sm text-amber-950">
                <Lock className="w-4 h-4 text-amber-700 shrink-0" />
                <span>تنبيه القفل النهائي:</span>
              </div>
              <p className="font-medium leading-relaxed">
                عند إلغاء هذه الطلبية، سيتم تغيير حالتها إلى <strong>(ملغاة نهائياً 🔒)</strong> وتصفير مبالغ الـ COD لجميع الطلبات المشمولة بها، <strong>ولن يمكن تغيير حالتها أو إعادة فتحها بعد ذلك إطلاقاً</strong> لضمان النزاهة والمطابقة المحاسبية.
              </p>
            </div>

            <div className="space-y-2.5">
              <label className="block text-xs font-black text-zinc-900">
                تحمل تكلفة التوصيل لشركة الشحن ({formatMoney(cancelBatchModal.batch.totalDeliveryFeeFils)} د.أ): *
              </label>

              <div className="space-y-2 text-xs">
                <label 
                  className={`flex items-start gap-3 p-3.5 rounded-2xl border cursor-pointer transition ${
                    !cancelBatchModal.storeBearsCost 
                      ? 'bg-emerald-50/70 border-emerald-300 ring-2 ring-emerald-500/20' 
                      : 'bg-zinc-50 border-zinc-200 hover:bg-zinc-100/70'
                  }`}
                >
                  <input
                    type="radio"
                    name="batchStoreBearsCost"
                    checked={!cancelBatchModal.storeBearsCost}
                    onChange={() => setCancelBatchModal(prev => prev ? { ...prev, storeBearsCost: false } : null)}
                    className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                  />
                  <div>
                    <span className="font-black text-zinc-900 block">
                      المتجر لا يتحمل تكلفة التوصيل (إعفاء كامل 0.000 د.أ)
                    </span>
                    <p className="text-[11px] text-zinc-500 font-medium mt-0.5">
                      تصفير أجور التوصيل بالكامل لشركة الشحن؛ لن يتم احتساب أي ذمة أو التزام مالي على المتجر عن هذه الشحنة.
                    </p>
                  </div>
                </label>

                <label 
                  className={`flex items-start gap-3 p-3.5 rounded-2xl border cursor-pointer transition ${
                    cancelBatchModal.storeBearsCost 
                      ? 'bg-rose-50/70 border-rose-300 ring-2 ring-rose-500/20' 
                      : 'bg-zinc-50 border-zinc-200 hover:bg-zinc-100/70'
                  }`}
                >
                  <input
                    type="radio"
                    name="batchStoreBearsCost"
                    checked={cancelBatchModal.storeBearsCost}
                    onChange={() => setCancelBatchModal(prev => prev ? { ...prev, storeBearsCost: true } : null)}
                    className="mt-0.5 text-rose-600 focus:ring-rose-500"
                  />
                  <div>
                    <span className="font-black text-zinc-900 block">
                      المتجر يتحمل تكلفة التوصيل لشركة الشحن ({formatMoney(cancelBatchModal.batch.totalDeliveryFeeFils)} د.أ)
                    </span>
                    <p className="text-[11px] text-zinc-500 font-medium mt-0.5">
                      تبقى أجور التوصيل مستحقة ومقيدة كذمة على المتجر لصالح شركة التوصيل، بينما يتم تصفير مبالغ التحصيل (COD) من الزبائن.
                    </p>
                  </div>
                </label>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-3 border-t border-zinc-200">
              <button
                type="button"
                disabled={isPending}
                onClick={handleConfirmCancelBatch}
                className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white font-extrabold rounded-xl transition shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 text-xs"
              >
                {isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                <span>تأكيد الإلغاء والقفل النهائي 🔒</span>
              </button>
              <button
                type="button"
                onClick={() => setCancelBatchModal(null)}
                className="py-3 px-5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold rounded-xl transition cursor-pointer text-xs"
              >
                تراجع
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: CANCEL SINGLE ORDER IN BATCH (إلغاء طلب فردي من طلبية التوصيل)  */}
      {/* ==================================================================== */}
      {cancelOrderModal?.isOpen && cancelOrderModal.batch && cancelOrderModal.order && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto" dir="rtl">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-zinc-200 animate-fade-in my-8 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-200">
              <div className="flex items-center gap-2 text-rose-600">
                <ShieldAlert className="w-6 h-6 shrink-0" />
                <h3 className="font-black text-lg text-zinc-900">
                  إلغاء الطلب #{cancelOrderModal.order.orderNumber}
                </h3>
              </div>
              <button 
                type="button"
                onClick={() => setCancelOrderModal(null)} 
                className="p-1 hover:bg-zinc-100 rounded-lg text-zinc-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-3.5 text-xs space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="text-zinc-500 font-bold">العميل:</span>
                <span className="font-black text-zinc-900">{cancelOrderModal.order.customerName}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-500 font-bold">المحافظة / العنوان:</span>
                <span className="font-bold text-zinc-800">{cancelOrderModal.order.city} — {cancelOrderModal.order.address}</span>
              </div>
              <div className="flex justify-between items-center font-mono">
                <span className="text-zinc-500 font-bold">مبلغ التحصيل الحالي (COD):</span>
                <span className="font-black text-emerald-700">{formatMoney(cancelOrderModal.order.codAmountFils)} د.أ</span>
              </div>
              <div className="flex justify-between items-center font-mono">
                <span className="text-zinc-500 font-bold">أجور توصيل الطلب:</span>
                <span className="font-black text-zinc-800">{formatMoney(cancelOrderModal.order.deliveryFeeFils)} د.أ</span>
              </div>
            </div>

            <div className="space-y-2.5">
              <label className="block text-xs font-black text-zinc-900">
                هل يتحمل المتجر أجور التوصيل لشركة الشحن ({formatMoney(cancelOrderModal.order.deliveryFeeFils)} د.أ)؟ *
              </label>

              <div className="space-y-2 text-xs">
                <label 
                  className={`flex items-start gap-3 p-3.5 rounded-2xl border cursor-pointer transition ${
                    !cancelOrderModal.storeBearsCost 
                      ? 'bg-emerald-50/70 border-emerald-300 ring-2 ring-emerald-500/20' 
                      : 'bg-zinc-50 border-zinc-200 hover:bg-zinc-100/70'
                  }`}
                >
                  <input
                    type="radio"
                    name="orderStoreBearsCost"
                    checked={!cancelOrderModal.storeBearsCost}
                    onChange={() => setCancelOrderModal(prev => prev ? { ...prev, storeBearsCost: false } : null)}
                    className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                  />
                  <div>
                    <span className="font-black text-zinc-900 block">
                      لا — المتجر لا يتحمل أجور التوصيل (إعفاء كامل 0.000 د.أ)
                    </span>
                    <p className="text-[11px] text-zinc-500 font-medium mt-0.5">
                      تصفير أجور توصيل هذا الطلب وتصفير الـ COD؛ لا يترتب على المتجر أي رسوم لشركة الشحن عن هذا الطلب.
                    </p>
                  </div>
                </label>

                <label 
                  className={`flex items-start gap-3 p-3.5 rounded-2xl border cursor-pointer transition ${
                    cancelOrderModal.storeBearsCost 
                      ? 'bg-rose-50/70 border-rose-300 ring-2 ring-rose-500/20' 
                      : 'bg-zinc-50 border-zinc-200 hover:bg-zinc-100/70'
                  }`}
                >
                  <input
                    type="radio"
                    name="orderStoreBearsCost"
                    checked={cancelOrderModal.storeBearsCost}
                    onChange={() => setCancelOrderModal(prev => prev ? { ...prev, storeBearsCost: true } : null)}
                    className="mt-0.5 text-rose-600 focus:ring-rose-500"
                  />
                  <div>
                    <span className="font-black text-zinc-900 block">
                      نعم — المتجر يتحمل أجور التوصيل لشركة الشحن ({formatMoney(cancelOrderModal.order.deliveryFeeFils)} د.أ)
                    </span>
                    <p className="text-[11px] text-zinc-500 font-medium mt-0.5">
                      تبقى أجور التوصيل مقيدة ومستحقة الدفع لشركة التوصيل على حساب المتجر، مع تصفير COD الطلب وتحديث إجمالي الإرسالية تلقائياً.
                    </p>
                  </div>
                </label>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-700 mb-1">
                سبب الإلغاء أو ملاحظات إضافية (اختياري):
              </label>
              <input
                type="text"
                value={cancelOrderModal.reason}
                onChange={(e) => setCancelOrderModal(prev => prev ? { ...prev, reason: e.target.value } : null)}
                placeholder="مثال: رفضت الزبونة الاستلام / إلغاء بناءً على طلب العميل..."
                className="w-full border border-zinc-300 rounded-xl px-3 py-2 text-xs outline-none focus:border-[#E6007E]"
              />
            </div>

            <div className="flex items-center gap-2 pt-3 border-t border-zinc-200">
              <button
                type="button"
                disabled={isPending}
                onClick={handleConfirmCancelOrder}
                className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white font-extrabold rounded-xl transition shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 text-xs"
              >
                {isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                <span>تأكيد إلغاء الطلب</span>
              </button>
              <button
                type="button"
                onClick={() => setCancelOrderModal(null)}
                className="py-3 px-5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold rounded-xl transition cursor-pointer text-xs"
              >
                تراجع
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: CANCEL SOME ORDERS IN BATCH (إلغاء بعض الطلبات وتحديد التكلفة)  */}
      {/* ==================================================================== */}
      {cancelSomeOrdersModal?.isOpen && cancelSomeOrdersModal.batch && (() => {
        const batch = cancelSomeOrdersModal.batch;
        const activeOrders = batch.orders.filter(o => o.status !== 'CANCELLED');
        const selectedOrdersList = activeOrders.filter(o => cancelSomeOrdersModal.ordersState[o.orderId]?.isSelected);
        const selectedCount = selectedOrdersList.length;
        const totalCancelledCod = selectedOrdersList.reduce((sum, o) => sum + (o.codAmountFils || 0), 0);
        const storeDeliveryFeeTotal = selectedOrdersList.reduce((sum, o) => {
          const isBearing = cancelSomeOrdersModal.ordersState[o.orderId]?.storeBearsDeliveryCost;
          return sum + (isBearing ? (o.deliveryFeeFils || 0) : 0);
        }, 0);
        const exemptDeliveryFeeTotal = selectedOrdersList.reduce((sum, o) => {
          const isBearing = cancelSomeOrdersModal.ordersState[o.orderId]?.storeBearsDeliveryCost;
          return sum + (!isBearing ? (o.deliveryFeeFils || 0) : 0);
        }, 0);

        const handleSelectAll = (select: boolean) => {
          setCancelSomeOrdersModal(prev => {
            if (!prev) return null;
            const updated = { ...prev.ordersState };
            activeOrders.forEach(o => {
              if (updated[o.orderId]) {
                updated[o.orderId].isSelected = select;
              }
            });
            return { ...prev, ordersState: updated };
          });
        };

        const toggleOrderSelected = (orderId: string) => {
          setCancelSomeOrdersModal(prev => {
            if (!prev) return null;
            const curr = prev.ordersState[orderId];
            return {
              ...prev,
              ordersState: {
                ...prev.ordersState,
                [orderId]: {
                  ...curr,
                  isSelected: !curr?.isSelected
                }
              }
            };
          });
        };

        const updateOrderStoreBearsCost = (orderId: string, storeBears: boolean) => {
          setCancelSomeOrdersModal(prev => {
            if (!prev) return null;
            const curr = prev.ordersState[orderId];
            return {
              ...prev,
              ordersState: {
                ...prev.ordersState,
                [orderId]: {
                  ...curr,
                  storeBearsDeliveryCost: storeBears
                }
              }
            };
          });
        };

        const updateOrderReason = (orderId: string, reason: string) => {
          setCancelSomeOrdersModal(prev => {
            if (!prev) return null;
            const curr = prev.ordersState[orderId];
            return {
              ...prev,
              ordersState: {
                ...prev.ordersState,
                [orderId]: {
                  ...curr,
                  reason
                }
              }
            };
          });
        };

        return (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto" dir="rtl">
            <div className="bg-white rounded-3xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl border border-zinc-200 animate-fade-in my-6 space-y-4 max-h-[92vh] flex flex-col">
              
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-zinc-200 shrink-0">
                <div className="flex items-center gap-2.5 text-rose-600">
                  <div className="w-10 h-10 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600">
                    <ShieldAlert className="w-5 h-5 shrink-0" />
                  </div>
                  <div>
                    <h3 className="font-black text-base sm:text-lg text-zinc-900">
                      إلغاء بعض الطلبات من الإرسالية #{batch.batchNumber}
                    </h3>
                    <p className="text-xs text-zinc-500 font-medium">
                      شركة التوصيل: <strong className="text-zinc-800">{batch.courierName}</strong> • حددي الطلبات المراد استبعادها وتكلفة التوصيل
                    </p>
                  </div>
                </div>
                <button 
                  type="button"
                  onClick={() => setCancelSomeOrdersModal(null)} 
                  className="p-1.5 hover:bg-zinc-100 rounded-xl text-zinc-400 hover:text-zinc-700 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Actions / Selection bar */}
              <div className="flex items-center justify-between bg-zinc-50 px-3.5 py-2.5 rounded-2xl border border-zinc-200 shrink-0 text-xs">
                <div className="flex items-center gap-2 font-bold text-zinc-700">
                  <span>تم تحديد:</span>
                  <span className="font-black px-2 py-0.5 rounded-lg bg-rose-100 text-rose-700 font-mono">
                    {selectedCount} من أصل {activeOrders.length}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleSelectAll(true)}
                    className="text-xs font-bold text-zinc-600 hover:text-zinc-900 underline cursor-pointer"
                  >
                    تحديد الكل
                  </button>
                  <span className="text-zinc-300">•</span>
                  <button
                    type="button"
                    onClick={() => handleSelectAll(false)}
                    className="text-xs font-bold text-zinc-600 hover:text-zinc-900 underline cursor-pointer"
                  >
                    إلغاء تحديد الكل
                  </button>
                </div>
              </div>

              {/* Orders List (Scrollable) */}
              <div className="space-y-3 overflow-y-auto flex-1 pe-1">
                {activeOrders.map((o) => {
                  const state = cancelSomeOrdersModal.ordersState[o.orderId] || { isSelected: false, storeBearsDeliveryCost: false, reason: '' };
                  const isChecked = state.isSelected;

                  return (
                    <div 
                      key={o.orderId}
                      className={`rounded-2xl border p-3.5 transition ${
                        isChecked 
                          ? 'border-rose-300 bg-rose-50/30 ring-1 ring-rose-400/30 shadow-xs' 
                          : 'border-zinc-200 bg-white hover:border-zinc-300'
                      }`}
                    >
                      {/* Order Row Header with Checkbox */}
                      <div className="flex items-start gap-3">
                        <label className="flex items-center cursor-pointer mt-0.5">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleOrderSelected(o.orderId)}
                            className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 cursor-pointer"
                          />
                        </label>

                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center justify-between flex-wrap gap-1">
                            <span className="font-mono font-black text-sm text-zinc-900">
                              #{o.orderNumber}
                            </span>
                            <div className="flex items-center gap-2 text-xs font-mono">
                              <span className="text-zinc-500">
                                أجور التوصيل: <strong className="text-zinc-800">{formatMoney(o.deliveryFeeFils)} د.أ</strong>
                              </span>
                              <span className="text-zinc-300">|</span>
                              <span className="text-emerald-700 font-bold">
                                تحصيل (COD): <strong>{formatMoney(o.codAmountFils)} د.أ</strong>
                              </span>
                            </div>
                          </div>

                          <div className="text-xs text-zinc-600 flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-zinc-800">{o.customerName}</span>
                            <span>•</span>
                            <span className="font-mono text-zinc-500" dir="ltr">{o.customerPhone}</span>
                            <span>•</span>
                            <span>{o.city} — {o.address}</span>
                          </div>

                          {/* Expansion options when order is selected for cancellation */}
                          {isChecked && (
                            <div className="pt-3 mt-2 border-t border-dashed border-rose-200 space-y-3">
                              <div>
                                <label className="block text-[11px] font-black text-zinc-800 mb-1.5">
                                  تحديد تكلفة التوصيل لهذا الطلب ({formatMoney(o.deliveryFeeFils)} د.أ): *
                                </label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                  {/* No cost / full exemption */}
                                  <label 
                                    className={`p-2.5 rounded-xl border flex items-start gap-2 cursor-pointer transition ${
                                      !state.storeBearsDeliveryCost 
                                        ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-bold' 
                                        : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50'
                                    }`}
                                  >
                                    <input
                                      type="radio"
                                      name={`cost-${o.orderId}`}
                                      checked={!state.storeBearsDeliveryCost}
                                      onChange={() => updateOrderStoreBearsCost(o.orderId, false)}
                                      className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                                    />
                                    <div>
                                      <span className="block font-bold">إعفاء كامل (0.000 د.أ)</span>
                                      <span className="text-[10px] text-zinc-500 font-normal">المتجر لا يدفع أي تكلفة توصيل للمندوب عن هذا الطلب</span>
                                    </div>
                                  </label>

                                  {/* Store bears cost */}
                                  <label 
                                    className={`p-2.5 rounded-xl border flex items-start gap-2 cursor-pointer transition ${
                                      state.storeBearsDeliveryCost 
                                        ? 'bg-rose-50 border-rose-300 text-rose-900 font-bold' 
                                        : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50'
                                    }`}
                                  >
                                    <input
                                      type="radio"
                                      name={`cost-${o.orderId}`}
                                      checked={state.storeBearsDeliveryCost}
                                      onChange={() => updateOrderStoreBearsCost(o.orderId, true)}
                                      className="mt-0.5 text-rose-600 focus:ring-rose-500"
                                    />
                                    <div>
                                      <span className="block font-bold">المتجر يتكفل بالتوصيل ({formatMoney(o.deliveryFeeFils)} د.أ)</span>
                                      <span className="text-[10px] text-zinc-500 font-normal">تُقيد أجرة التوصيل مستحقة لشركة الشحن على حساب المتجر</span>
                                    </div>
                                  </label>
                                </div>
                              </div>

                              <div>
                                <input
                                  type="text"
                                  value={state.reason}
                                  onChange={(e) => updateOrderReason(o.orderId, e.target.value)}
                                  placeholder="سبب إلغاء الطلب (اختياري: مثال: الزبونة ألغت / رفضت الاستلام)..."
                                  className="w-full bg-white border border-rose-200 rounded-xl px-3 py-1.5 text-xs text-zinc-800 outline-none focus:border-rose-500"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Financial Impact Live Summary */}
              {selectedCount > 0 && (
                <div className="bg-zinc-900 text-white rounded-2xl p-3.5 space-y-2 shrink-0 text-xs">
                  <div className="flex items-center justify-between font-bold text-zinc-300 pb-1.5 border-b border-zinc-800">
                    <span>ملخص أثر الإلغاء على الحسابات:</span>
                    <span className="font-mono text-pink-400">{selectedCount} طلبات محددة</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 font-mono text-center">
                    <div className="bg-zinc-800/80 p-2 rounded-xl">
                      <span className="text-[10px] text-zinc-400 block font-sans">تصفير COD</span>
                      <strong className="text-sm text-amber-400">{formatMoney(totalCancelledCod)} د.أ</strong>
                    </div>
                    <div className="bg-zinc-800/80 p-2 rounded-xl">
                      <span className="text-[10px] text-zinc-400 block font-sans">أجور يتحملها المتجر</span>
                      <strong className="text-sm text-rose-400">{formatMoney(storeDeliveryFeeTotal)} د.أ</strong>
                    </div>
                    <div className="bg-zinc-800/80 p-2 rounded-xl">
                      <span className="text-[10px] text-zinc-400 block font-sans">أجور توصيل معفاة</span>
                      <strong className="text-sm text-emerald-400">{formatMoney(exemptDeliveryFeeTotal)} د.أ</strong>
                    </div>
                  </div>
                </div>
              )}

              {/* Modal Actions */}
              <div className="flex items-center gap-2 pt-3 border-t border-zinc-200 shrink-0">
                <button
                  type="button"
                  disabled={isPending || selectedCount === 0}
                  onClick={handleConfirmCancelSomeOrders}
                  className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white font-extrabold rounded-xl transition shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 text-xs"
                >
                  {isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  <span>
                    {selectedCount > 0 
                      ? `تأكيد إلغاء (${selectedCount}) طلبات وتحديث الحسابات` 
                      : 'حددي الطلبات المراد إلغاؤها أولاً'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setCancelSomeOrdersModal(null)}
                  className="py-3 px-5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold rounded-xl transition cursor-pointer text-xs"
                >
                  تراجع
                </button>
              </div>

            </div>
          </div>
        );
      })()}

      {/* ==================================================================== */}
      {/* PRINT DELIVERY MANIFEST VIEW                                         */}
      {/* ==================================================================== */}
      {manifestBatch && (
        <div className="hidden print:block fixed inset-0 z-50 bg-white p-8 text-black" dir="rtl">
          {/* Header */}
          <div className="border-b-2 border-black pb-4 mb-6 flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-black">غزل لمستحضرات التجميل والعناية</h1>
              <p className="text-xs mt-1">GHAZAL Cosmetics &amp; More — الفرع الرئيسي: عين الباشا، شارع القدس</p>
              <p className="text-xs font-mono">هاتف المعرض: +962776299243</p>
            </div>
            <div className="text-end">
              <span className="text-xs font-bold block">مانفست وكشف استلام شحنات التوصيل</span>
              <span className="text-xl font-mono font-black block">#{manifestBatch.batchNumber}</span>
              <span className="text-xs font-mono text-zinc-700 block">{formatJordanDate(manifestBatch.createdAt)}</span>
            </div>
          </div>

          {/* Details */}
          <div className="grid grid-cols-3 gap-4 border border-black p-3 mb-6 text-xs">
            <div>
              <span className="font-bold block">شركة التوصيل / المندوب:</span>
              <span className="font-black text-sm">{manifestBatch.courierName}</span>
            </div>
            <div>
              <span className="font-bold block">عدد الشحنات المرفقة:</span>
              <span className="font-black text-sm font-mono">{manifestBatch.orders.length} شحنة</span>
            </div>
            <div>
              <span className="font-bold block">إجمالي مبالغ COD المطلوب تحصيلها:</span>
              <span className="font-black text-sm font-mono">{formatMoney(manifestBatch.totalCodFils)} د.أ</span>
            </div>
          </div>

          {/* Orders Table */}
          <table className="w-full text-start text-xs border border-black border-collapse mb-6">
            <thead>
              <tr className="bg-zinc-100 border-b border-black">
                <th className="border border-black p-2 text-center w-8">#</th>
                <th className="border border-black p-2 text-start">رقم الطلب</th>
                <th className="border border-black p-2 text-start">اسم العميل</th>
                <th className="border border-black p-2 text-start">رقم الهاتف</th>
                <th className="border border-black p-2 text-start">المحافظة والعنوان</th>
                <th className="border border-black p-2 text-start">مبلغ التحصيل (COD)</th>
                <th className="border border-black p-2 text-center">توقيع المستلم</th>
              </tr>
            </thead>
            <tbody>
              {manifestBatch.orders.map((o, idx) => (
                <tr key={o.orderId} className="border-b border-black">
                  <td className="border border-black p-2 text-center font-mono">{idx + 1}</td>
                  <td className="border border-black p-2 font-mono font-black">{o.orderNumber}</td>
                  <td className="border border-black p-2 font-bold">{o.customerName}</td>
                  <td className="border border-black p-2 font-mono" dir="ltr">{o.customerPhone}</td>
                  <td className="border border-black p-2">{o.city} — {o.address}</td>
                  <td className="border border-black p-2 font-mono font-black">{formatMoney(o.codAmountFils)} د.أ</td>
                  <td className="border border-black p-2 text-center"></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-zinc-100 font-bold border-t-2 border-black">
                <td colSpan={5} className="border border-black p-2 text-end">المجموع الإجمالي للتحصيل (COD):</td>
                <td className="border border-black p-2 font-mono font-black">{formatMoney(manifestBatch.totalCodFils)} د.أ</td>
                <td className="border border-black p-2"></td>
              </tr>
            </tfoot>
          </table>

          {/* Signatures */}
          <div className="grid grid-cols-2 gap-12 mt-12 text-xs pt-4 border-t border-black">
            <div>
              <p className="font-bold mb-10">توقيع مسؤولة تسليم البضاعة (المعرض):</p>
              <div className="border-b border-dotted border-black w-48"></div>
            </div>
            <div>
              <p className="font-bold mb-10">أقر أنا مندوب شركة التوصيل باستلام الشحنات المذكورة أعلاه سليمة:</p>
              <div className="border-b border-dotted border-black w-48"></div>
              <p className="text-[10px] text-zinc-600 mt-2">الاسم والتوقيع: .......................................</p>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MULTI-ORDER DELIVERY SHIPMENT DETAILS MODAL                          */}
      {/* ==================================================================== */}
      {selectedBatchDetails && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto" dir="rtl">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 shadow-2xl border border-zinc-200 animate-fade-in my-8 text-xs font-bold text-zinc-800 space-y-5">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-zinc-200">
              <div className="flex items-center gap-2.5">
                <span className="p-2.5 rounded-2xl bg-purple-100 text-purple-800">
                  <Truck className="w-5 h-5" />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-black text-base text-zinc-900">
                      تفاصيل طلبية التوصيل: {selectedBatchDetails.batchNumber}
                    </h3>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-purple-100 text-purple-900">
                      تشمل {selectedBatchDetails.orders.length} طلبات
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-500 font-medium">
                    شركة التوصيل: <strong className="text-zinc-800">{selectedBatchDetails.courierName}</strong>
                    {selectedBatchDetails.createdAt && ` • تاريخ الإرسال: ${new Date(selectedBatchDetails.createdAt).toLocaleDateString('ar-JO')}`}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handlePrintManifest(selectedBatchDetails)}
                  className="px-3.5 py-2 bg-zinc-900 hover:bg-black text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                  title="طباعة كشف الإرسالية"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>طباعة</span>
                </button>
                <button
                  onClick={() => setSelectedBatchDetails(null)}
                  className="p-1.5 text-zinc-400 hover:text-zinc-600 rounded-xl hover:bg-zinc-100 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Shipment Summary KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-zinc-50 p-3 rounded-2xl border border-zinc-200 text-center">
                <span className="text-[10px] text-zinc-500 font-bold block">إجمالي عدد الطلبات</span>
                <span className="text-lg font-black font-mono text-zinc-900">
                  {selectedBatchDetails.orders.length} طلبات
                </span>
              </div>
              <div className="bg-zinc-50 p-3 rounded-2xl border border-zinc-200 text-center">
                <span className="text-[10px] text-zinc-500 font-bold block">إجمالي مبالغ COD</span>
                <span className="text-lg font-black font-mono text-purple-900">
                  {formatMoney(selectedBatchDetails.totalCodFils)} د.أ
                </span>
              </div>
              <div className="bg-zinc-50 p-3 rounded-2xl border border-zinc-200 text-center">
                <span className="text-[10px] text-zinc-500 font-bold block">رسوم التوصيل المخصومة</span>
                <span className="text-lg font-black font-mono text-rose-600">
                  -{formatMoney(selectedBatchDetails.totalDeliveryFeeFils || 0)} د.أ
                </span>
              </div>
              <div className="bg-emerald-50 p-3 rounded-2xl border border-emerald-200 text-center">
                <span className="text-[10px] text-emerald-800 font-bold block">صافي التوريد للمتجر</span>
                <span className="text-lg font-black font-mono text-emerald-700">
                  {formatMoney(selectedBatchDetails.netSettlementFils || 0)} د.أ
                </span>
              </div>
            </div>

            {/* Breakdown of Every Order in this Batch */}
            <div className="space-y-3">
              <h4 className="text-xs font-black text-zinc-900 flex items-center justify-between">
                <span>الطلبات المشمولة بهذه الطلبية بالتفصيل ({selectedBatchDetails.orders.length} طلبات):</span>
                <span className="text-[11px] text-zinc-400 font-normal">* تتضمن الأصناف والكميات والعناوين والمبالغ</span>
              </h4>

              <div className="max-h-[50vh] overflow-y-auto space-y-3 pr-1">
                {selectedBatchDetails.orders.map((o, idx) => {
                  const demoOrder = getDemoOrderById(o.orderId || o.orderNumber);
                  const items = demoOrder?.items || [];
                  const phone = o.customerPhone || demoOrder?.customerPhone || '—';
                  const address = o.address || (demoOrder ? [demoOrder.addressStreet, demoOrder.addressBuilding].filter(Boolean).join('، ') : o.city);

                  return (
                    <div key={o.orderId || idx} className="p-4 rounded-2xl border border-zinc-200 bg-white shadow-2xs space-y-3">
                      {/* Order Header */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-zinc-100 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-lg bg-purple-100 text-purple-900 font-mono font-black text-xs flex items-center justify-center">
                            {idx + 1}
                          </span>
                          <span className="font-mono font-black text-sm text-purple-900">
                            #{o.orderNumber}
                          </span>
                          <span className="text-zinc-400">•</span>
                          <span className="font-black text-zinc-900">{o.customerName}</span>
                          <span className="text-[11px] text-zinc-500 font-mono" dir="ltr">{phone}</span>
                        </div>

                        <div className="flex items-center gap-2">
                          <Link
                            href={`/ar/invoice/${o.orderNumber}`}
                            target="_blank"
                            className="px-2.5 py-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded-lg text-[11px] font-bold flex items-center gap-1 transition"
                            title="عرض الفاتورة الرسمية"
                          >
                            <FileText className="w-3 h-3 text-purple-600" />
                            <span>الفاتورة الرسمية</span>
                          </Link>
                          <Link
                            href={isPOS ? `/pos/orders?search=${o.orderNumber}` : `/admin/orders/${o.orderId || o.orderNumber}`}
                            target={isPOS ? undefined : "_blank"}
                            className="px-2.5 py-1 bg-zinc-900 hover:bg-black text-white rounded-lg text-[11px] font-bold flex items-center gap-1 transition"
                            title={isPOS ? "عرض الطلب في الكاشير" : "تعديل الطلب في لوحة الإدارة"}
                          >
                            <ExternalLink className="w-3 h-3 text-pink-400" />
                            <span>تفاصيل الطلب</span>
                          </Link>
                        </div>
                      </div>

                      {/* Customer Address & City */}
                      <div className="text-[11px] text-zinc-600 flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                        <span><strong>العنوان:</strong> {o.city} — {address}</span>
                      </div>

                      {/* Items Table inside this order */}
                      {items.length > 0 ? (
                        <div className="rounded-xl border border-zinc-100 overflow-hidden bg-zinc-50/50">
                          <table className="w-full text-right text-[11px]">
                            <thead className="bg-zinc-100 text-zinc-700 font-bold border-b border-zinc-200">
                              <tr>
                                <th className="p-2">المنتج / الصنف</th>
                                <th className="p-2 text-center">الكمية</th>
                                <th className="p-2 text-left">سعر الوحدة</th>
                                <th className="p-2 text-left">الإجمالي</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-200/60">
                              {items.map((it, iIdx) => (
                                <tr key={it.id || iIdx}>
                                  <td className="p-2 font-bold text-zinc-900">
                                    {it.name}
                                    {it.size && <span className="text-zinc-500 font-normal"> ({it.size})</span>}
                                  </td>
                                  <td className="p-2 text-center font-mono font-bold">{it.quantity}</td>
                                  <td className="p-2 text-left font-mono">{formatMoney(it.unitPrice)} د.أ</td>
                                  <td className="p-2 text-left font-mono font-bold text-zinc-900">{formatMoney(it.total)} د.أ</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="text-[11px] text-zinc-400 italic">أصناف الطلب مسجلة بالطلب الأصلي (#{o.orderNumber})</p>
                      )}

                      {/* Amounts line for this order */}
                      <div className="flex justify-between items-center text-xs pt-1 border-t border-dashed border-zinc-200 font-mono">
                        <span className="text-zinc-500 font-sans">
                          أجرة التوصيل: <strong className="text-zinc-800">{formatMoney(o.deliveryFeeFils)} د.أ</strong>
                        </span>
                        <span className="text-purple-900 font-bold text-sm">
                          مطلوب تحصيله (COD): <strong className="font-black text-base">{formatMoney(o.codAmountFils)} د.أ</strong>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between pt-3 border-t border-zinc-200">
              <span className="text-xs text-zinc-500 font-medium">
                إجمالي صافي مستحق الطلبية: <strong className="text-emerald-700 font-mono text-sm">{formatMoney(selectedBatchDetails.netSettlementFils || 0)} د.أ</strong>
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handlePrintManifest(selectedBatchDetails)}
                  className="px-4 py-2 bg-[#E6007E] hover:bg-[#c4006b] text-white rounded-xl text-xs font-black flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>طباعة</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedBatchDetails(null)}
                  className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  إغلاق
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: ADD / EDIT COURIER COMPANY                                    */}
      {/* ==================================================================== */}
      {isCompanyModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto" dir="rtl">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-zinc-200 animate-fade-in my-8">
            <div className="flex items-center justify-between pb-4 border-b border-zinc-200">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-blue-600" />
                <h3 className="font-black text-lg text-zinc-900">
                  {editingCompany ? 'تعديل بيانات شركة التوصيل / المندوب' : 'إضافة شركة توصيل / مندوب جديد'}
                </h3>
              </div>
              <button 
                type="button" 
                onClick={() => setIsCompanyModalOpen(false)} 
                className="p-1 hover:bg-zinc-100 rounded-lg text-zinc-400 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCompany} className="space-y-4 pt-4 text-xs font-bold text-zinc-700">
              <div>
                <label className="block mb-1 text-zinc-900">اسم الشركة أو المندوب: *</label>
                <input
                  type="text"
                  required
                  value={companyFormName}
                  onChange={(e) => setCompanyFormName(e.target.value)}
                  placeholder="مثال: سريعة إكسبرس، أرامكس، مندوب أحمد..."
                  className="w-full border border-zinc-300 rounded-xl px-3.5 py-2.5 text-sm font-bold outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block mb-1 text-zinc-900">نوع الجهة: *</label>
                <select
                  value={companyFormType}
                  onChange={(e) => setCompanyFormType(e.target.value as 'COMPANY' | 'DELEGATE')}
                  className="w-full border border-zinc-300 rounded-xl px-3.5 py-2.5 text-xs font-bold outline-none focus:border-blue-600 bg-white"
                >
                  <option value="COMPANY">شركة شحن وتوصيل خارجية</option>
                  <option value="DELEGATE">مندوب خاص لمعرض غزل</option>
                </select>
              </div>

              <div>
                <label className="block mb-1 text-zinc-900">رقم الهاتف / الواتساب: *</label>
                <input
                  type="tel"
                  required
                  value={companyFormPhone}
                  onChange={(e) => setCompanyFormPhone(e.target.value)}
                  placeholder="مثال: 0791234567"
                  className="w-full border border-zinc-300 rounded-xl px-3.5 py-2.5 text-sm font-mono font-bold outline-none focus:border-blue-600"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block mb-1 text-zinc-900">ملاحظات إضافية (اختياري):</label>
                <textarea
                  rows={2}
                  value={companyFormNotes}
                  onChange={(e) => setCompanyFormNotes(e.target.value)}
                  placeholder="أي تعليمات أو ملاحظات خاصة بالتسليم والتسوية..."
                  className="w-full border border-zinc-300 rounded-xl p-3 text-xs outline-none focus:border-blue-600"
                />
              </div>

              <div className="flex items-center gap-2 pt-4 border-t border-zinc-200">
                <button
                  type="submit"
                  disabled={companyActionLoading}
                  className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-xl transition shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {companyActionLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  <span>{editingCompany ? 'حفظ التعديلات' : 'إضافة الشركة'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsCompanyModalOpen(false)}
                  className="py-3 px-5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold rounded-xl transition cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
