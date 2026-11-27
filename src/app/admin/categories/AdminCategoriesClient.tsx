'use client';

import React, { useState, useTransition, useRef } from 'react';
import { 
  GripVertical, Plus, Folder, FolderPlus, Layers, ArrowUpDown, ChevronDown, 
  ChevronRight, Trash2, Edit2, Image as ImageIcon, CheckCircle2, AlertCircle, 
  Package, Sparkles, MoveUp, MoveDown, Info, Globe, Store, RefreshCw, Upload,
  Camera, Check, ExternalLink, SlidersHorizontal, Search
} from 'lucide-react';
import { 
  reorderCategoriesAction, 
  createCategory, 
  updateCategory, 
  deleteCategory, 
  toggleCategoryStatusAction,
  SyncedCategory 
} from '@/actions/categories';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface AdminCategoriesClientProps {
  initialCategories: SyncedCategory[];
  allProducts: { id: string; nameAr: string; nameEn: string; channel?: string; category?: { name: string } | null; categoryId?: string | null }[];
}

export function AdminCategoriesClient({ initialCategories, allProducts }: AdminCategoriesClientProps) {
  const router = useRouter();
  const [categories, setCategories] = useState<SyncedCategory[]>(initialCategories);

  React.useEffect(() => {
    setCategories(initialCategories);
  }, [initialCategories]);

  const [isPending, startTransition] = useTransition();
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'HAS_ONLINE' | 'HAS_POS' | 'HAS_SHARED'>('ALL');

  // Expanded root categories for subcategories view
  const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>({});

  // Drag and drop state
  const [draggedCatId, setDraggedCatId] = useState<string | null>(null);
  const [dragOverCatId, setDragOverCatId] = useState<string | null>(null);

  // Modal / Form state for Add or Edit
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<SyncedCategory | null>(null);
  const [selectedParentId, setSelectedParentId] = useState<string>('root');
  const [formName, setFormName] = useState('');
  const [formImage, setFormImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Overview metrics across all categories
  const rootCategories = categories.filter(c => !c.parentId);
  const subCategoriesList = categories.filter(c => Boolean(c.parentId));

  const totalOnlineProducts = categories.reduce((sum, c) => sum + (c.onlineCount || 0), 0);
  const totalPosProducts = categories.reduce((sum, c) => sum + (c.posCount || 0), 0);
  const totalSharedProducts = categories.reduce((sum, c) => sum + (c.sharedCount || 0), 0);
  const totalAllProducts = categories.reduce((sum, c) => sum + (c.totalCount || c._count?.products || 0), 0);

  const subCategoriesMap = categories.reduce<Record<string, SyncedCategory[]>>((acc, cat) => {
    if (cat.parentId) {
      if (!acc[cat.parentId]) acc[cat.parentId] = [];
      acc[cat.parentId].push(cat);
    }
    return acc;
  }, {});

  // Filter root categories based on search and product-type filter
  const filteredRootCategories = rootCategories.filter(c => {
    const q = searchQuery.trim().toLowerCase();
    const subCats = subCategoriesMap[c.id] || [];

    // Search filter
    if (q) {
      const matchRoot = c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q);
      const matchChild = subCats.some(sub => sub.name.toLowerCase().includes(q) || sub.slug.toLowerCase().includes(q));
      if (!matchRoot && !matchChild) return false;
    }

    // Channel product presence filter
    if (filterType === 'HAS_ONLINE') {
      const rootHas = (c.onlineCount || 0) > 0;
      const childHas = subCats.some(sub => (sub.onlineCount || 0) > 0);
      return rootHas || childHas;
    }
    if (filterType === 'HAS_POS') {
      const rootHas = (c.posCount || 0) > 0;
      const childHas = subCats.some(sub => (sub.posCount || 0) > 0);
      return rootHas || childHas;
    }
    if (filterType === 'HAS_SHARED') {
      const rootHas = (c.sharedCount || 0) > 0;
      const childHas = subCats.some(sub => (sub.sharedCount || 0) > 0);
      return rootHas || childHas;
    }

    return true;
  });

  const toggleExpand = (id: string) => {
    setExpandedCats(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const showNotification = (type: 'success' | 'error', text: string) => {
    setStatusMessage({ type, text });
    setTimeout(() => setStatusMessage(null), 4500);
  };

  // Drag handlers for Categories
  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedCatId(id);
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (draggedCatId && draggedCatId !== id) {
      setDragOverCatId(id);
    }
  };

  const handleDragLeave = () => {
    setDragOverCatId(null);
  };

  const handleDrop = async (e: React.DragEvent, targetId: string, parentId: string | null = null) => {
    e.preventDefault();
    setDragOverCatId(null);
    if (!draggedCatId || draggedCatId === targetId) return;

    const sourceList = parentId ? (subCategoriesMap[parentId] || []) : filteredRootCategories;
    const oldIndex = sourceList.findIndex(c => c.id === draggedCatId);
    const newIndex = sourceList.findIndex(c => c.id === targetId);
    if (oldIndex === -1 || newIndex === -1) return;

    const updatedSubList = [...sourceList];
    const [movedItem] = updatedSubList.splice(oldIndex, 1);
    updatedSubList.splice(newIndex, 0, movedItem);

    const newOrderedIds = updatedSubList.map(c => c.id);
    setCategories(prev => {
      const otherCats = prev.filter(c => (parentId ? c.parentId !== parentId : Boolean(c.parentId)));
      return [...otherCats, ...updatedSubList];
    });

    startTransition(async () => {
      const res = await reorderCategoriesAction(newOrderedIds, parentId);
      if (res.success) {
        showNotification('success', 'تم حفظ ترتيب الأقسام بنجاح');
        router.refresh();
      } else {
        showNotification('error', res.error || 'فشل حفظ الترتيب');
      }
    });
    setDraggedCatId(null);
  };

  // Move Up / Move Down helper
  const handleMoveOrder = async (id: string, direction: 'up' | 'down', parentId: string | null = null) => {
    const list = parentId ? (subCategoriesMap[parentId] || []) : filteredRootCategories;
    const index = list.findIndex(c => c.id === id);
    if (index === -1) return;
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === list.length - 1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const updated = [...list];
    const [item] = updated.splice(index, 1);
    updated.splice(targetIndex, 0, item);

    const orderedIds = updated.map(c => c.id);
    setCategories(prev => {
      const others = prev.filter(c => (parentId ? c.parentId !== parentId : Boolean(c.parentId)));
      return [...others, ...updated];
    });

    startTransition(async () => {
      const res = await reorderCategoriesAction(orderedIds, parentId);
      if (res.success) {
        showNotification('success', 'تم تحديث الترتيب بنجاح');
        router.refresh();
      } else {
        showNotification('error', res.error || 'فشل تحديث الترتيب');
      }
    });
  };

  const handleToggleActive = async (cat: SyncedCategory) => {
    const nextStatus = cat.isActive === false;
    setCategories(prev => prev.map(c => c.id === cat.id ? { ...c, isActive: nextStatus } : c));
    startTransition(async () => {
      const res = await toggleCategoryStatusAction(cat.id);
      if (res.success) {
        showNotification('success', `تم ${res.isActive ? 'تفعيل' : 'تعطيل'} القسم "${cat.name}" في قاعدة البيانات بنجاح`);
        router.refresh();
      } else {
        showNotification('error', res.error || 'فشل تعديل حالة القسم');
        router.refresh();
      }
    });
  };

  const openAddModal = (presetParentId: string = 'root') => {
    setEditingCategory(null);
    setFormName('');
    setSelectedParentId(presetParentId);
    setFormImage(null);
    setImagePreview(null);
    setIsModalOpen(true);
  };

  const openEditModal = (cat: SyncedCategory) => {
    setEditingCategory(cat);
    setFormName(cat.name);
    setSelectedParentId(cat.parentId || 'root');
    setFormImage(null);
    setImagePreview(cat.imagePath || null);
    setIsModalOpen(true);
  };

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFormImage(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      showNotification('error', 'يرجى كتابة اسم القسم');
      return;
    }

    const formData = new FormData();
    formData.append('name', formName.trim());
    formData.append('parentId', selectedParentId);
    formData.append('channel', 'SHARED');
    if (formImage) {
      formData.append('image', formImage);
    }

    startTransition(async () => {
      let res;
      if (editingCategory) {
        res = await updateCategory(editingCategory.id, formData);
      } else {
        res = await createCategory(formData);
      }

      if (res.success) {
        showNotification('success', editingCategory ? 'تم تحديث بيانات وصورة القسم بنجاح' : 'تمت إضافة القسم الموحد بنجاح');
        setIsModalOpen(false);
        router.refresh();
      } else {
        showNotification('error', res.error || 'حدث خطأ أثناء حفظ القسم');
      }
    });
  };

  const handleDelete = async (cat: SyncedCategory) => {
    const hasSubs = (subCategoriesMap[cat.id] || []).length > 0;
    if (hasSubs) {
      alert('لا يمكن حذف قسم رئيسي يحتوي على أقسام فرعية. يرجى حذف أو نقل الأقسام الفرعية أولاً.');
      return;
    }

    if (!confirm(`هل أنت متأكد من حذف القسم "${cat.name}"؟`)) return;

    startTransition(async () => {
      const res = await deleteCategory(cat.id, false, 'cat-makeup');
      if (res.success) {
        showNotification('success', 'تم حذف القسم بنجاح');
        setCategories(prev => prev.filter(c => c.id !== cat.id));
        router.refresh();
      } else {
        showNotification('error', res.error || 'فشل حذف القسم');
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Notification Toast */}
      {statusMessage && (
        <div className={`p-4 rounded-xl flex items-center gap-3 text-sm font-bold shadow-lg animate-fade-in ${
          statusMessage.type === 'success' 
            ? 'bg-emerald-50 border border-emerald-300 text-emerald-800' 
            : 'bg-rose-50 border border-rose-300 text-rose-800'
        }`}>
          {statusMessage.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <AlertCircle className="w-5 h-5 text-rose-600" />}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Top Overview Cards: Unified Categories & Product Distribution */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* All Categories Card */}
        <div 
          onClick={() => setFilterType('ALL')}
          className={`p-5 rounded-2xl border-2 transition-all cursor-pointer select-none ${
            filterType === 'ALL' 
              ? 'bg-white border-zinc-900 shadow-md ring-2 ring-zinc-900/10' 
              : 'bg-white/80 border-zinc-200 hover:border-zinc-400 shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-black text-zinc-600">إجمالي الأقسام</span>
            <div className="w-8 h-8 rounded-xl bg-zinc-100 flex items-center justify-center text-zinc-800">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-zinc-900">{categories.length}</span>
            <span className="text-xs font-bold text-zinc-400">قسم مسجل</span>
          </div>
          <p className="text-[11px] text-zinc-500 mt-2 font-medium">
            {rootCategories.length} قسم رئيسي • {subCategoriesList.length} قسم فرعي
          </p>
        </div>

        {/* Online Store Products Card */}
        <div 
          onClick={() => setFilterType(filterType === 'HAS_ONLINE' ? 'ALL' : 'HAS_ONLINE')}
          className={`p-5 rounded-2xl border-2 transition-all cursor-pointer select-none ${
            filterType === 'HAS_ONLINE' 
              ? 'bg-pink-50/50 border-[#E6007E] shadow-md ring-2 ring-[#E6007E]/20' 
              : 'bg-white border-pink-100 hover:border-pink-300 shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-black text-[#E6007E] flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5" />
              <span>منتجات المتجر الإلكتروني</span>
            </span>
            <div className="w-8 h-8 rounded-xl bg-pink-100 text-[#E6007E] flex items-center justify-center">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-[#E6007E]">{totalOnlineProducts}</span>
            <span className="text-xs font-bold text-pink-600">منتج للموقع</span>
          </div>
          <p className="text-[11px] text-zinc-600 mt-2 font-medium">
            مخصصة للبيع والطلب عبر المتجر الإلكتروني
          </p>
        </div>

        {/* POS Cashier Products Card */}
        <div 
          onClick={() => setFilterType(filterType === 'HAS_POS' ? 'ALL' : 'HAS_POS')}
          className={`p-5 rounded-2xl border-2 transition-all cursor-pointer select-none ${
            filterType === 'HAS_POS' 
              ? 'bg-emerald-50/50 border-emerald-600 shadow-md ring-2 ring-emerald-600/20' 
              : 'bg-white border-emerald-100 hover:border-emerald-300 shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-black text-emerald-800 flex items-center gap-1.5">
              <Store className="w-3.5 h-3.5" />
              <span>منتجات الكاشير بالمحل</span>
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <Store className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-emerald-800">{totalPosProducts}</span>
            <span className="text-xs font-bold text-emerald-600">منتج كاش</span>
          </div>
          <p className="text-[11px] text-zinc-600 mt-2 font-medium">
            مخصصة لنقاط البيع ونظام الكاشير بالمحل
          </p>
        </div>

        {/* Shared Products Card */}
        <div 
          onClick={() => setFilterType(filterType === 'HAS_SHARED' ? 'ALL' : 'HAS_SHARED')}
          className={`p-5 rounded-2xl border-2 transition-all cursor-pointer select-none ${
            filterType === 'HAS_SHARED' 
              ? 'bg-purple-50/50 border-purple-600 shadow-md ring-2 ring-purple-600/20' 
              : 'bg-white border-purple-100 hover:border-purple-300 shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-black text-purple-800 flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" />
              <span>المنتجات المشتركة</span>
            </span>
            <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-purple-800">{totalSharedProducts}</span>
            <span className="text-xs font-bold text-purple-600">منتج مشترك</span>
          </div>
          <p className="text-[11px] text-zinc-600 mt-2 font-medium">
            معروضة في المتجر الإلكتروني والكاشير معاً
          </p>
        </div>
      </div>

      {/* Info Notification Banner */}
      <div className="bg-gradient-to-r from-pink-50 via-purple-50 to-indigo-50 border border-pink-200/80 rounded-2xl p-4 flex items-start gap-3 shadow-2xs">
        <div className="w-8 h-8 rounded-xl bg-white shadow-2xs text-[#E6007E] flex items-center justify-center shrink-0 mt-0.5 border border-pink-100">
          <Sparkles className="w-4 h-4" />
        </div>
        <div>
          <h4 className="font-black text-sm text-zinc-900">نظام الأقسام الموحد (Unified Categories)</h4>
          <p className="text-xs text-zinc-600 mt-0.5 leading-relaxed">
            جميع الأقسام موحدة ومشتركة: كل قسم يمكن أن يحتوي على منتجات للمتجر، منتجات للكاشير، ومنتجات مشتركة. يتم تحديد قناة العرض من داخل صفحة المنتج نفسه، وتظهر الأقسام في المتجر تلقائياً عند احتوائها على منتجات مخصصة للمتجر.
          </p>
        </div>
      </div>

      {/* Search, Filter & Actions Bar */}
      <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-3 bg-white p-4 md:p-5 rounded-2xl border border-[var(--color-ivory-200)] shadow-xs">
        {/* Search Bar */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ابحث بالاسم أو المعرف (مثال: مكياج، عناية، عطور)..."
            className="w-full pl-3 pr-10 py-2 rounded-xl text-xs font-bold border border-zinc-200 outline-none focus:border-[#E6007E] focus:ring-2 focus:ring-pink-100 bg-zinc-50"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 text-xs font-bold"
            >
              مسح
            </button>
          )}
        </div>

        {/* Quick Filters & Add Button */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
          <button
            onClick={() => setFilterType('ALL')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition shrink-0 ${
              filterType === 'ALL'
                ? 'bg-zinc-900 text-white shadow-xs'
                : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
            }`}
          >
            جميع الأقسام ({categories.length})
          </button>

          <button
            onClick={() => setFilterType(filterType === 'HAS_ONLINE' ? 'ALL' : 'HAS_ONLINE')}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition shrink-0 flex items-center gap-1.5 ${
              filterType === 'HAS_ONLINE'
                ? 'bg-[#E6007E] text-white shadow-xs'
                : 'bg-pink-50 text-[#E6007E] hover:bg-pink-100 border border-pink-200'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>بها منتجات متجر</span>
          </button>

          <button
            onClick={() => setFilterType(filterType === 'HAS_POS' ? 'ALL' : 'HAS_POS')}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition shrink-0 flex items-center gap-1.5 ${
              filterType === 'HAS_POS'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'
            }`}
          >
            <Store className="w-3.5 h-3.5" />
            <span>بها منتجات كاش</span>
          </button>

          <button
            onClick={() => setFilterType(filterType === 'HAS_SHARED' ? 'ALL' : 'HAS_SHARED')}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition shrink-0 flex items-center gap-1.5 ${
              filterType === 'HAS_SHARED'
                ? 'bg-purple-700 text-white shadow-xs'
                : 'bg-purple-50 text-purple-800 hover:bg-purple-100 border border-purple-200'
            }`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>بها منتجات مشتركة</span>
          </button>

          {/* Add New Category Button */}
          <button
            onClick={() => openAddModal('root')}
            className="flex items-center gap-2 bg-[#E6007E] hover:bg-[#c2006a] text-white px-4 py-2 rounded-xl font-bold text-xs shadow-md transition-all active:scale-95 shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة قسم جديد</span>
          </button>
        </div>
      </div>

      {/* Categories List View */}
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-xs overflow-hidden">
        {/* Table Header */}
        <div className="bg-zinc-50 px-6 py-3.5 border-b border-zinc-200 flex justify-between items-center text-xs font-bold text-zinc-600">
          <div className="flex items-center gap-4">
            <span className="w-8 text-center">الترتيب</span>
            <span>القسم والصورة</span>
          </div>
          <div className="flex items-center gap-8">
            <span className="hidden sm:inline">حالة القسم</span>
            <span>تفصيل المنتجات داخل القسم</span>
            <span>الإجراءات والتفريع</span>
          </div>
        </div>

        {/* Categories Rows */}
        <div className="divide-y divide-zinc-100">
          {filteredRootCategories.length === 0 ? (
            <div className="p-16 text-center text-zinc-400">
              <Folder className="w-12 h-12 mx-auto mb-3 text-zinc-300" />
              <p className="font-bold text-sm text-zinc-600">
                {searchQuery ? 'لا توجد أقسام مطابقة لبحثك' : 'لا توجد أقسام مسجلة حالياً'}
              </p>
              <button 
                onClick={() => openAddModal('root')}
                className="mt-3 text-xs font-bold text-[#E6007E] hover:underline"
              >
                + اضغط هنا لإضافة قسم جديد الآن
              </button>
            </div>
          ) : (
            filteredRootCategories.map((cat, idx) => {
              const subCats = subCategoriesMap[cat.id] || [];
              const isExpanded = expandedCats[cat.id] ?? true;
              const isDragOver = dragOverCatId === cat.id;
              const hasCustomImage = cat.imagePath && cat.imagePath !== '/logo.png';
              const catTotalProducts = cat.totalCount || cat._count?.products || 0;

              return (
                <div 
                  key={cat.id} 
                  className={`transition-all ${isDragOver ? 'bg-pink-50 border-y-2 border-[#E6007E]' : 'hover:bg-zinc-50/60'}`}
                >
                  {/* Root Category Row */}
                  <div 
                    draggable
                    onDragStart={(e) => handleDragStart(e, cat.id)}
                    onDragOver={(e) => handleDragOver(e, cat.id)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, cat.id, null)}
                    className="flex items-center justify-between p-4 px-6 cursor-grab active:cursor-grabbing select-none"
                  >
                    <div className="flex items-center gap-4">
                      {/* Drag Handle */}
                      <div className="flex items-center gap-1 text-zinc-400 hover:text-zinc-700">
                        <GripVertical className="w-5 h-5" />
                        <span className="font-mono text-xs font-bold text-zinc-400 w-4 text-center">{idx + 1}</span>
                      </div>

                      {/* Expand / Collapse Button */}
                      <button 
                        onClick={() => toggleExpand(cat.id)}
                        className="p-1 hover:bg-zinc-200 rounded text-zinc-600 transition"
                        title={isExpanded ? "طي الأقسام الفرعية" : "توسيع الأقسام الفرعية"}
                      >
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </button>

                      {/* Image Thumbnail with Direct Click-to-Edit */}
                      <div 
                        onClick={() => openEditModal(cat)}
                        className="relative group w-12 h-12 rounded-xl overflow-hidden border-2 border-zinc-200 bg-white shrink-0 flex items-center justify-center p-0.5 cursor-pointer shadow-2xs hover:border-[#E6007E] transition"
                        title="اضغط لتعديل صورة القسم"
                      >
                        <img 
                          src={cat.imagePath || '/logo.png'} 
                          alt={cat.name} 
                          className="w-full h-full object-contain"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/logo.png'; }}
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition text-white">
                          <Camera className="w-4 h-4" />
                        </div>
                        {hasCustomImage && (
                          <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 rounded-full border border-white" title="صورة مخصصة مرفوعة" />
                        )}
                      </div>

                      {/* Name & Slug */}
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-black text-sm text-zinc-900">{cat.name}</span>

                          {/* Active / Inactive Status Toggle */}
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleToggleActive(cat); }}
                            className={`text-[10px] font-black px-2 py-0.5 rounded-full border transition flex items-center gap-1 cursor-pointer ${
                              cat.isActive !== false
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                                : 'bg-zinc-100 text-zinc-500 border-zinc-300 hover:bg-zinc-200'
                            }`}
                            title={cat.isActive !== false ? 'القسم مفعل وظاهر. اضغط لتعطيله' : 'القسم معطل ومخفي. اضغط لتفعيله'}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${cat.isActive !== false ? 'bg-emerald-500' : 'bg-zinc-400'}`} />
                            {cat.isActive !== false ? 'نشط' : 'معطل'}
                          </button>

                          {subCats.length > 0 && (
                            <span className="bg-zinc-100 text-zinc-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-zinc-200">
                              {subCats.length} قسم فرعي
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] font-mono text-zinc-400">{cat.slug}</span>
                      </div>
                    </div>

                    {/* Actions & Product Breakdown Badges */}
                    <div className="flex items-center gap-3 md:gap-4">
                      {/* Detailed Products Breakdown with Direct Filter Links */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {/* Online Store Count */}
                        <Link
                          href={`/admin/products?category=${cat.id}&channel=online`}
                          className="text-[11px] font-bold px-2 py-0.5 rounded-lg border text-[#E6007E] bg-pink-50 border-pink-200 hover:bg-pink-100 transition flex items-center gap-1"
                          title="عرض منتجات المتجر الإلكتروني فقط في هذا القسم"
                        >
                          <Globe className="w-3 h-3" />
                          <span>{cat.onlineCount || 0} متجر</span>
                        </Link>

                        {/* POS Cashier Count */}
                        <Link
                          href={`/admin/products?category=${cat.id}&channel=pos`}
                          className="text-[11px] font-bold px-2 py-0.5 rounded-lg border text-emerald-800 bg-emerald-50 border-emerald-200 hover:bg-emerald-100 transition flex items-center gap-1"
                          title="عرض منتجات الكاشير بالمحل فقط في هذا القسم"
                        >
                          <Store className="w-3 h-3" />
                          <span>{cat.posCount || 0} كاشير</span>
                        </Link>

                        {/* Shared Count */}
                        <Link
                          href={`/admin/products?category=${cat.id}&channel=shared`}
                          className="text-[11px] font-bold px-2 py-0.5 rounded-lg border text-purple-800 bg-purple-50 border-purple-200 hover:bg-purple-100 transition flex items-center gap-1"
                          title="عرض المنتجات المشتركة بين المتجر والكاش في هذا القسم"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>{cat.sharedCount || 0} مشترك</span>
                        </Link>

                        {/* Total Count Badge */}
                        <Link
                          href={`/admin/products?category=${cat.id}`}
                          className="text-[11px] font-black px-2.5 py-0.5 rounded-lg border text-zinc-900 bg-zinc-100 border-zinc-300 hover:bg-zinc-200 transition flex items-center gap-1 shadow-2xs"
                          title="عرض كافة منتجات هذا القسم في صفحة المنتجات"
                        >
                          <Package className="w-3 h-3 text-zinc-600" />
                          <span>{catTotalProducts} إجمالي</span>
                        </Link>
                      </div>

                      {/* Move Up/Down Buttons */}
                      <div className="flex items-center gap-0.5">
                        <button 
                          onClick={() => handleMoveOrder(cat.id, 'up', null)}
                          disabled={idx === 0}
                          className="p-1 hover:bg-zinc-200 text-zinc-500 disabled:opacity-30 rounded"
                          title="نقل لأعلى"
                        >
                          <MoveUp className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={() => handleMoveOrder(cat.id, 'down', null)}
                          disabled={idx === filteredRootCategories.length - 1}
                          className="p-1 hover:bg-zinc-200 text-zinc-500 disabled:opacity-30 rounded"
                          title="نقل لأسفل"
                        >
                          <MoveDown className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Add Subcategory Button */}
                      <button
                        onClick={() => openAddModal(cat.id)}
                        className="flex items-center gap-1 bg-pink-50 hover:bg-pink-100 text-[#E6007E] px-2.5 py-1.5 rounded-lg text-xs font-bold border border-pink-200 transition"
                        title="إضافة قسم فرعي داخل هذا القسم"
                      >
                        <FolderPlus className="w-3.5 h-3.5" />
                        <span className="hidden lg:inline">إضافة فرعي</span>
                      </button>

                      {/* Edit Button */}
                      <button
                        onClick={() => openEditModal(cat)}
                        className="p-1.5 hover:bg-zinc-200 text-zinc-600 rounded-lg transition"
                        title="تعديل القسم والصورة"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>

                      {/* Delete Button */}
                      <button
                        onClick={() => handleDelete(cat)}
                        className="p-1.5 hover:bg-red-50 text-red-500 rounded-lg transition"
                        title="حذف القسم"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Subcategories Container (Strictly 1 Level Deep) */}
                  {isExpanded && subCats.length > 0 && (
                    <div className="bg-zinc-50/80 pr-14 pl-6 py-2 space-y-1.5 border-t border-zinc-100">
                      <div className="text-[11px] font-bold text-zinc-400 flex items-center gap-1.5 mb-2">
                        <span>الأقسام الفرعية التابعة لـ ({cat.name}):</span>
                        <span className="text-[10px] text-zinc-600 bg-white px-2 py-0.5 rounded border border-zinc-200">
                          مستوى فرعي مباشر • تظهر المنتجات بداخله
                        </span>
                      </div>

                      {subCats.map((sub, subIdx) => {
                        const isSubDragOver = dragOverCatId === sub.id;
                        const subTotalProducts = sub.totalCount || sub._count?.products || 0;

                        return (
                          <div 
                            key={sub.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, sub.id)}
                            onDragOver={(e) => handleDragOver(e, sub.id)}
                            onDragLeave={handleDragLeave}
                            onDrop={(e) => handleDrop(e, sub.id, cat.id)}
                            className={`flex items-center justify-between p-2.5 px-4 bg-white rounded-xl border transition-all cursor-grab active:cursor-grabbing ${
                              isSubDragOver ? 'border-[#E6007E] bg-pink-50' : 'border-zinc-200 hover:border-zinc-300 shadow-2xs'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <GripVertical className="w-4 h-4 text-zinc-400" />
                              <span className="font-mono text-[10px] text-zinc-400">{subIdx + 1}</span>

                              <div 
                                onClick={() => openEditModal(sub)}
                                className="w-9 h-9 rounded-lg overflow-hidden border border-zinc-200 bg-white shrink-0 flex items-center justify-center cursor-pointer hover:border-[#E6007E] transition"
                                title="اضغط لتغيير صورة القسم الفرعي"
                              >
                                <img 
                                  src={sub.imagePath || '/logo.png'} 
                                  alt={sub.name} 
                                  className="w-full h-full object-contain"
                                  onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/logo.png'; }}
                                />
                              </div>

                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-bold text-xs text-zinc-900">{sub.name}</span>
                                  <span className="bg-purple-50 text-purple-700 text-[9px] font-bold px-1.5 py-0.5 rounded border border-purple-200">
                                    قسم فرعي
                                  </span>

                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); handleToggleActive(sub); }}
                                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border transition flex items-center gap-1 cursor-pointer ${
                                      sub.isActive !== false
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                                        : 'bg-zinc-100 text-zinc-500 border-zinc-300 hover:bg-zinc-200'
                                    }`}
                                    title={sub.isActive !== false ? 'القسم مفعل. اضغط للتعطيل' : 'القسم معطل. اضغط للتفعيل'}
                                  >
                                    <span className={`w-1 h-1 rounded-full ${sub.isActive !== false ? 'bg-emerald-500' : 'bg-zinc-400'}`} />
                                    {sub.isActive !== false ? 'نشط' : 'معطل'}
                                  </button>
                                </div>
                                <span className="text-[10px] font-mono text-zinc-400">{sub.slug}</span>
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              {/* Subcategory Products Breakdown */}
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <Link
                                  href={`/admin/products?category=${sub.id}&channel=online`}
                                  className="text-[10px] font-bold px-1.5 py-0.5 rounded border text-[#E6007E] bg-pink-50 border-pink-200 hover:bg-pink-100 transition"
                                  title="منتجات المتجر في هذا القسم الفرعي"
                                >
                                  {sub.onlineCount || 0} متجر
                                </Link>

                                <Link
                                  href={`/admin/products?category=${sub.id}&channel=pos`}
                                  className="text-[10px] font-bold px-1.5 py-0.5 rounded border text-emerald-800 bg-emerald-50 border-emerald-200 hover:bg-emerald-100 transition"
                                  title="منتجات الكاشير في هذا القسم الفرعي"
                                >
                                  {sub.posCount || 0} كاش
                                </Link>

                                <Link
                                  href={`/admin/products?category=${sub.id}&channel=shared`}
                                  className="text-[10px] font-bold px-1.5 py-0.5 rounded border text-purple-800 bg-purple-50 border-purple-200 hover:bg-purple-100 transition"
                                  title="المنتجات المشتركة في هذا القسم الفرعي"
                                >
                                  {sub.sharedCount || 0} مشترك
                                </Link>

                                <Link
                                  href={`/admin/products?category=${sub.id}`}
                                  className="text-[10px] font-black px-2 py-0.5 rounded border text-zinc-900 bg-zinc-100 border-zinc-300 hover:bg-zinc-200 transition"
                                  title="إجمالي المنتجات في هذا القسم الفرعي"
                                >
                                  {subTotalProducts} إجمالي
                                </Link>
                              </div>

                              <div className="flex items-center gap-0.5">
                                <button 
                                  onClick={() => handleMoveOrder(sub.id, 'up', cat.id)}
                                  disabled={subIdx === 0}
                                  className="p-1 hover:bg-zinc-200 text-zinc-500 disabled:opacity-30 rounded"
                                  title="نقل لأعلى"
                                >
                                  <MoveUp className="w-3 h-3" />
                                </button>
                                <button 
                                  onClick={() => handleMoveOrder(sub.id, 'down', cat.id)}
                                  disabled={subIdx === subCats.length - 1}
                                  className="p-1 hover:bg-zinc-200 text-zinc-500 disabled:opacity-30 rounded"
                                  title="نقل لأسفل"
                                >
                                  <MoveDown className="w-3 h-3" />
                                </button>
                              </div>

                              <button
                                onClick={() => openEditModal(sub)}
                                className="p-1 text-zinc-500 hover:text-zinc-800 rounded transition"
                                title="تعديل القسم الفرعي"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>

                              <button
                                onClick={() => handleDelete(sub)}
                                className="p-1 text-red-500 hover:text-red-700 rounded transition"
                                title="حذف القسم الفرعي"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Add / Edit Category Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in" dir="rtl">
          <div className="bg-white rounded-3xl p-6 md:p-8 max-w-lg w-full shadow-2xl border border-zinc-200 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-black text-zinc-900 mb-1 flex items-center gap-2">
              <FolderPlus className="w-5 h-5 text-[#E6007E]" />
              <span>{editingCategory ? 'تعديل بيانات وصورة القسم' : 'إضافة قسم جديد'}</span>
            </h3>
            <p className="text-xs text-zinc-500 mb-6">
              أنشئ تصنيفاً موحداً يحتوي على منتجاتك، وارفع صورة معبرة تمثل القسم لزبائن المتجر.
            </p>

            <form onSubmit={handleFormSubmit} className="space-y-5">
              {/* Category Name */}
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1.5">اسم القسم / المجموعة *</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="مثال: المكياج، العناية بالبشرة، عطور فاخرة، مزيلات عرق..."
                  className="w-full border border-zinc-300 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-[#E6007E] focus:ring-2 focus:ring-pink-100 font-bold"
                />
              </div>

              {/* Category Image Upload with Live Preview */}
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1.5 flex items-center justify-between">
                  <span>صورة القسم (للمتجر الإلكتروني)</span>
                  {imagePreview && (
                    <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1">
                      <Check className="w-3 h-3" />
                      <span>تم تحديد صورة</span>
                    </span>
                  )}
                </label>

                <div className="flex items-center gap-4 p-3 bg-zinc-50 rounded-2xl border border-zinc-200">
                  {/* Image Preview Box */}
                  <div className="w-20 h-20 rounded-xl overflow-hidden border-2 border-dashed border-zinc-300 bg-white flex items-center justify-center shrink-0 relative">
                    {imagePreview ? (
                      <img 
                        src={imagePreview} 
                        alt="معاينة" 
                        className="w-full h-full object-cover" 
                      />
                    ) : (
                      <ImageIcon className="w-8 h-8 text-zinc-300" />
                    )}
                  </div>

                  <div className="flex-1 space-y-2">
                    <input 
                      type="file" 
                      ref={fileInputRef}
                      accept="image/*"
                      onChange={handleImageFileChange}
                      className="hidden" 
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-1.5 bg-white hover:bg-zinc-100 text-zinc-800 border border-zinc-300 px-3 py-1.5 rounded-xl text-xs font-bold shadow-2xs transition"
                    >
                      <Upload className="w-3.5 h-3.5 text-[#E6007E]" />
                      <span>{imagePreview ? 'تغيير الصورة المحددة' : 'رفع صورة من جهازك'}</span>
                    </button>
                    <p className="text-[10px] text-zinc-500 leading-relaxed">
                      الصيغ المدعومة: PNG, JPG, WEBP. يُفضل صورة مربعة واضحة لتمثيل القسم في المتجر.
                    </p>
                  </div>
                </div>
              </div>

              {/* Hierarchy Parent Selection (Strict 1-Level Depth) */}
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1.5">مستوى القسم *</label>
                <select
                  value={selectedParentId}
                  onChange={(e) => setSelectedParentId(e.target.value)}
                  className="w-full border border-zinc-300 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-[#E6007E] focus:ring-2 focus:ring-pink-100 font-bold bg-white"
                >
                  <option value="root">📁 قسم رئيسي مستقل (مستوى أول)</option>
                  <optgroup label="أقسام فرعية تابعة لقسم رئيسي (مستوى ثانٍ)">
                    {rootCategories
                      .filter(r => !editingCategory || r.id !== editingCategory.id)
                      .map((root) => (
                        <option key={root.id} value={root.id}>
                          ↳ تابع لـ: {root.name}
                        </option>
                      ))}
                  </optgroup>
                </select>
              </div>

              {/* Informative Guidance Note */}
              <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl text-amber-800 text-[11px] leading-relaxed">
                <span className="font-bold">ملاحظة:</span> الأقسام موحدة لجميع المنتجات. يمكنك إضافة أي منتج إلى هذا القسم سواء كان مخصصاً للمتجر الإلكتروني أو الكاشير أو كلاهما.
              </div>

              {/* Modal Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-100 mt-6">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-zinc-600 hover:bg-zinc-100 text-xs font-bold transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="bg-[#E6007E] hover:bg-[#c2006a] text-white px-6 py-2.5 rounded-xl text-xs font-bold shadow-md transition disabled:opacity-50"
                >
                  {isPending ? 'جاري الحفظ...' : (editingCategory ? 'حفظ التعديلات' : 'إضافة القسم الآن')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
