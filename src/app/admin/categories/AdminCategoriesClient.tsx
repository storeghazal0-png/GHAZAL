'use client';

import React, { useState, useTransition, useRef } from 'react';
import { 
  GripVertical, Plus, Folder, FolderPlus, Layers, ArrowUpDown, ChevronDown, 
  ChevronRight, Trash2, Edit2, Image as ImageIcon, CheckCircle2, AlertCircle, 
  Package, Sparkles, MoveUp, MoveDown, Info, Globe, Store, RefreshCw, Upload,
  Camera, Check, ExternalLink, SlidersHorizontal
} from 'lucide-react';
import { 
  reorderCategoriesAction, 
  createCategory, 
  updateCategory, 
  deleteCategory, 
  updateCategoryChannelAction,
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

  // Active channel view tab
  const [activeTab, setActiveTab] = useState<'ALL' | 'ONLINE' | 'POS' | 'SHARED'>('ALL');

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
  const [formChannel, setFormChannel] = useState<'ONLINE' | 'POS' | 'SHARED'>('ONLINE');
  const [formImage, setFormImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Calculate section counts
  const onlineCategories = categories.filter(c => c.channel === 'ONLINE');
  const posCategories = categories.filter(c => c.channel === 'POS');
  const sharedCategories = categories.filter(c => !c.channel || c.channel === 'SHARED');
  const onlineWithCustomImages = onlineCategories.filter(c => c.imagePath && c.imagePath !== '/logo.png').length;

  // Filter root categories according to active channel tab
  const rootCategories = categories.filter(c => !c.parentId);
  const filteredRootCategories = rootCategories.filter(c => {
    if (activeTab === 'ALL') return true;
    if (activeTab === 'ONLINE') return c.channel === 'ONLINE';
    if (activeTab === 'POS') return c.channel === 'POS';
    if (activeTab === 'SHARED') return !c.channel || c.channel === 'SHARED';
    return true;
  });

  const subCategoriesMap = categories.reduce<Record<string, SyncedCategory[]>>((acc, cat) => {
    if (cat.parentId) {
      if (!acc[cat.parentId]) acc[cat.parentId] = [];
      acc[cat.parentId].push(cat);
    }
    return acc;
  }, {});

  const toggleExpand = (id: string) => {
    setExpandedCats(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const showNotification = (type: 'success' | 'error', text: string) => {
    setStatusMessage({ type, text });
    setTimeout(() => setStatusMessage(null), 4500);
  };

  // Drag handlers for Root Categories
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

  // Move Up / Move Down helper for accessibility & touch
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

  const handleQuickChannelChange = async (cat: SyncedCategory, newChannel: 'ONLINE' | 'POS' | 'SHARED') => {
    if (cat.channel === newChannel) return;

    // Optimistic update
    setCategories(prev => prev.map(c => c.id === cat.id ? { ...c, channel: newChannel } : c));

    startTransition(async () => {
      const res = await updateCategoryChannelAction(cat.id, newChannel);
      if (res.success) {
        const channelLabel = newChannel === 'ONLINE' ? 'المتجر الإلكتروني' : newChannel === 'POS' ? 'الكاشير' : 'مشترك';
        showNotification('success', `تم تحويل القسم "${cat.name}" إلى (${channelLabel}) بنجاح`);
        router.refresh();
      } else {
        showNotification('error', res.error || 'فشل تحديث القناة');
        router.refresh();
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

  const openAddModal = (presetParentId: string = 'root', presetChannel?: 'ONLINE' | 'POS' | 'SHARED') => {
    setEditingCategory(null);
    setFormName('');
    setSelectedParentId(presetParentId);
    setFormChannel(presetChannel || (activeTab === 'ALL' ? 'ONLINE' : activeTab));
    setFormImage(null);
    setImagePreview(null);
    setIsModalOpen(true);
  };

  const openEditModal = (cat: SyncedCategory) => {
    setEditingCategory(cat);
    setFormName(cat.name);
    setSelectedParentId(cat.parentId || 'root');
    setFormChannel(cat.channel || 'SHARED');
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
    formData.append('channel', formChannel);
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
        showNotification('success', editingCategory ? 'تم تحديث القسم بنجاح' : 'تمت إضافة القسم بنجاح');
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

      {/* Top Overview Cards: Partition into Online Store, POS Cashier, and Shared */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* All Categories Card */}
        <div 
          onClick={() => setActiveTab('ALL')}
          className={`p-5 rounded-2xl border-2 transition-all cursor-pointer select-none ${
            activeTab === 'ALL' 
              ? 'bg-white border-zinc-900 shadow-md ring-2 ring-zinc-900/10' 
              : 'bg-white/80 border-zinc-200 hover:border-zinc-400 shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-black text-zinc-500">جميع الأقسام</span>
            <div className="w-8 h-8 rounded-xl bg-zinc-100 flex items-center justify-center text-zinc-700">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-zinc-900">{categories.length}</span>
            <span className="text-xs font-bold text-zinc-400">قسم مسجل</span>
          </div>
          <p className="text-[11px] text-zinc-500 mt-2 font-medium">عرض شامل لجميع أقسام المتجر والكاش</p>
        </div>

        {/* Online Store Categories Card */}
        <div 
          onClick={() => setActiveTab('ONLINE')}
          className={`p-5 rounded-2xl border-2 transition-all cursor-pointer select-none ${
            activeTab === 'ONLINE' 
              ? 'bg-pink-50/50 border-[#E6007E] shadow-md ring-2 ring-[#E6007E]/20' 
              : 'bg-white border-pink-100 hover:border-pink-300 shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-black text-[#E6007E] flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5" />
              <span>أقسام المتجر الإلكتروني</span>
            </span>
            <div className="w-8 h-8 rounded-xl bg-pink-100 text-[#E6007E] flex items-center justify-center">
              <ImageIcon className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-[#E6007E]">{onlineCategories.length}</span>
            <span className="text-xs font-bold text-pink-600">أقسام موقع</span>
          </div>
          <p className="text-[11px] text-zinc-600 mt-2 font-medium flex items-center justify-between">
            <span>تظهر للزبائن في الموقع</span>
            <span className="text-[#E6007E] font-bold">({onlineWithCustomImages} بصور مخصصة)</span>
          </p>
        </div>

        {/* POS Cashier Categories Card */}
        <div 
          onClick={() => setActiveTab('POS')}
          className={`p-5 rounded-2xl border-2 transition-all cursor-pointer select-none ${
            activeTab === 'POS' 
              ? 'bg-emerald-50/50 border-emerald-600 shadow-md ring-2 ring-emerald-600/20' 
              : 'bg-white border-emerald-100 hover:border-emerald-300 shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-black text-emerald-800 flex items-center gap-1.5">
              <Store className="w-3.5 h-3.5" />
              <span>أقسام الكاشير (المحل)</span>
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <Store className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-emerald-800">{posCategories.length}</span>
            <span className="text-xs font-bold text-emerald-600">أقسام كاش</span>
          </div>
          <p className="text-[11px] text-zinc-600 mt-2 font-medium">مخصصة لنقاط البيع داخل المحل</p>
        </div>

        {/* Shared Categories Card */}
        <div 
          onClick={() => setActiveTab('SHARED')}
          className={`p-5 rounded-2xl border-2 transition-all cursor-pointer select-none ${
            activeTab === 'SHARED' 
              ? 'bg-purple-50/50 border-purple-600 shadow-md ring-2 ring-purple-600/20' 
              : 'bg-white border-purple-100 hover:border-purple-300 shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-black text-purple-800 flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" />
              <span>الأقسام المشتركة</span>
            </span>
            <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-purple-800">{sharedCategories.length}</span>
            <span className="text-xs font-bold text-purple-600">قسم مشترك</span>
          </div>
          <p className="text-[11px] text-zinc-600 mt-2 font-medium">تظهر بالمتجر والكاشير معاً</p>
        </div>
      </div>

      {/* Channel Filter Tabs & Actions Bar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 md:p-5 rounded-2xl border border-[var(--color-ivory-200)] shadow-sm">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
          <button
            onClick={() => setActiveTab('ALL')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition shrink-0 flex items-center gap-1.5 ${
              activeTab === 'ALL'
                ? 'bg-zinc-900 text-white shadow-xs'
                : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
            }`}
          >
            <span>جميع الأقسام</span>
            <span className="bg-white/20 text-[10px] px-1.5 py-0.5 rounded-full">{categories.length}</span>
          </button>

          <button
            onClick={() => setActiveTab('ONLINE')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition shrink-0 flex items-center gap-1.5 ${
              activeTab === 'ONLINE'
                ? 'bg-[#E6007E] text-white shadow-xs'
                : 'bg-pink-50 text-[#E6007E] hover:bg-pink-100 border border-pink-200'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>أقسام المتجر الإلكتروني</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${activeTab === 'ONLINE' ? 'bg-white/20' : 'bg-pink-200 text-[#E6007E]'}`}>
              {onlineCategories.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('POS')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition shrink-0 flex items-center gap-1.5 ${
              activeTab === 'POS'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'
            }`}
          >
            <Store className="w-3.5 h-3.5" />
            <span>أقسام الكاشير</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${activeTab === 'POS' ? 'bg-white/20' : 'bg-emerald-200 text-emerald-800'}`}>
              {posCategories.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('SHARED')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition shrink-0 flex items-center gap-1.5 ${
              activeTab === 'SHARED'
                ? 'bg-purple-700 text-white shadow-xs'
                : 'bg-purple-50 text-purple-800 hover:bg-purple-100 border border-purple-200'
            }`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>الأقسام المشتركة</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${activeTab === 'SHARED' ? 'bg-white/20' : 'bg-purple-200 text-purple-800'}`}>
              {sharedCategories.length}
            </span>
          </button>
        </div>

        {/* Add New Category Button */}
        <button
          onClick={() => openAddModal('root', activeTab === 'ALL' ? 'ONLINE' : activeTab)}
          className="flex items-center gap-2 bg-[#E6007E] hover:bg-[#c2006a] text-white px-4 py-2.5 rounded-xl font-bold text-xs md:text-sm shadow-md transition-all active:scale-95 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>
            {activeTab === 'ONLINE' ? 'إضافة قسم للمتجر الإلكتروني' : activeTab === 'POS' ? 'إضافة قسم للكاشير' : 'إضافة قسم جديد'}
          </span>
        </button>
      </div>

      {/* Online Store Guide Alert if viewing Online Tab */}
      {activeTab === 'ONLINE' && (
        <div className="bg-pink-50 border border-pink-200 rounded-2xl p-4 flex items-start gap-3">
          <div className="w-8 h-8 rounded-xl bg-pink-100 text-[#E6007E] flex items-center justify-center shrink-0 mt-0.5">
            <ImageIcon className="w-4 h-4" />
          </div>
          <div>
            <h4 className="font-black text-sm text-zinc-900">أقسام المتجر الإلكتروني المرئية للزبائن</h4>
            <p className="text-xs text-zinc-600 mt-1 leading-relaxed">
              تظهر هنا الأقسام المعتمدة للمتجر الإلكتروني. <strong className="text-[#E6007E]">ملاحظة هامة:</strong> تظهر في المتجر فقط المنتجات المحددة كـ (متجر إلكتروني) أو (مشترك). منتجات الكاشير لا تظهر للزبائن في المتجر نهائياً وتبقى محفوظة في قاعدة البيانات حتى لو تم تعيين تصنيف القسم كمتجر.
            </p>
          </div>
        </div>
      )}

      {/* Categories Tree List */}
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="bg-zinc-50 px-6 py-3.5 border-b border-zinc-200 flex justify-between items-center text-xs font-bold text-zinc-600">
          <div className="flex items-center gap-4">
            <span className="w-8 text-center">الترتيب</span>
            <span>القسم والصورة</span>
          </div>
          <div className="flex items-center gap-8">
            <span className="hidden sm:inline">القناة المعتمدة</span>
            <span>عدد الأصناف</span>
            <span>الإجراءات والتفريع</span>
          </div>
        </div>

        <div className="divide-y divide-zinc-100">
          {filteredRootCategories.length === 0 ? (
            <div className="p-16 text-center text-zinc-400">
              <Folder className="w-12 h-12 mx-auto mb-3 text-zinc-300" />
              <p className="font-bold text-sm text-zinc-600">لا توجد أقسام مسجلة في هذا التصنيف حالياً</p>
              <button 
                onClick={() => openAddModal('root', activeTab === 'ALL' ? 'ONLINE' : activeTab)}
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
              const categoryChannel = cat.channel || 'SHARED';
              const hasCustomImage = cat.imagePath && cat.imagePath !== '/logo.png';

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
                          
                          {/* Channel Badge with Quick Toggle */}
                          <div className="relative inline-block">
                            <select
                              value={categoryChannel}
                              onChange={(e) => handleQuickChannelChange(cat, e.target.value as any)}
                              className={`text-[10px] font-black px-2 py-0.5 rounded-full border appearance-none pr-4 pl-2 cursor-pointer transition ${
                                categoryChannel === 'ONLINE'
                                  ? 'bg-pink-50 text-[#E6007E] border-pink-300 hover:bg-pink-100'
                                  : categoryChannel === 'POS'
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                                  : 'bg-purple-50 text-purple-800 border-purple-300 hover:bg-purple-100'
                              }`}
                              title="اضغط لتغيير قناة وتصنيف هذا القسم فوراً"
                            >
                              <option value="ONLINE">🌐 متجر إلكتروني</option>
                              <option value="POS">🏪 كاشير فقط</option>
                              <option value="SHARED">🔄 مشترك (متجر + كاش)</option>
                            </select>
                          </div>

                          {/* Active / Inactive Status Toggle */}
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleToggleActive(cat); }}
                            className={`text-[10px] font-black px-2 py-0.5 rounded-full border transition flex items-center gap-1 cursor-pointer ${
                              cat.isActive !== false
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                                : 'bg-zinc-100 text-zinc-500 border-zinc-300 hover:bg-zinc-200'
                            }`}
                            title={cat.isActive !== false ? 'القسم مفعل وظاهر. اضغط لتعطيله وإخفائه' : 'القسم معطل ومخفي. اضغط لتفعيله'}
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

                    {/* Actions & Product Count */}
                    <div className="flex items-center gap-3 md:gap-4">
                      {/* Products Count Badge with Direct Product Navigation */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Link
                          href={`/admin/products?category=${cat.id}${categoryChannel === 'ONLINE' ? '&channel=online' : categoryChannel === 'POS' ? '&channel=pos' : '&channel=shared'}`}
                          className={`text-xs font-bold px-2.5 py-1 rounded-full border min-w-[70px] text-center hover:opacity-80 transition flex items-center gap-1.5 shadow-2xs ${
                            categoryChannel === 'ONLINE'
                              ? 'text-[#E6007E] bg-pink-50 border-pink-200 hover:bg-pink-100'
                              : categoryChannel === 'POS'
                              ? 'text-emerald-800 bg-emerald-50 border-emerald-200 hover:bg-emerald-100'
                              : 'text-purple-800 bg-purple-50 border-purple-200 hover:bg-purple-100'
                          }`}
                          title="اضغط لعرض وتصفية منتجات هذا القسم في صفحة المنتجات"
                        >
                          <Package className="w-3.5 h-3.5" />
                          <span>
                            {cat._count?.products ?? 0} {categoryChannel === 'ONLINE' ? 'متجر' : categoryChannel === 'POS' ? 'كاشير' : 'مشترك'}
                          </span>
                        </Link>

                        {categoryChannel === 'ONLINE' && (cat.posCount ?? 0) > 0 && (
                          <span 
                            className="text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 font-bold"
                            title="يوجد منتجات كاشير مسجلة على هذا القسم ولكنها لا تظهر في المتجر الإلكتروني نهائياً"
                          >
                            ({cat.posCount} كاش مخفية عن المتجر)
                          </span>
                        )}
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
                        onClick={() => openAddModal(cat.id, categoryChannel)}
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

                  {/* Subcategories Container (1 Level Deep Only) */}
                  {isExpanded && subCats.length > 0 && (
                    <div className="bg-zinc-50/80 pr-14 pl-6 py-2 space-y-1.5 border-t border-zinc-100">
                      <div className="text-[11px] font-bold text-zinc-400 flex items-center gap-1.5 mb-2">
                        <span>الأقسام الفرعية التابعة لـ ({cat.name}):</span>
                        <span className="text-[10px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                          مستوى واحد فقط • تظهر المنتجات بداخلها
                        </span>
                      </div>

                      {subCats.map((sub, subIdx) => {
                        const isSubDragOver = dragOverCatId === sub.id;
                        const subChannel = sub.channel || categoryChannel;

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

                                  {/* Subcategory Channel Quick Toggle */}
                                  <div className="relative inline-block">
                                    <select
                                      value={subChannel}
                                      onChange={(e) => handleQuickChannelChange(sub, e.target.value as any)}
                                      className={`text-[9px] font-black px-1.5 py-0.5 rounded-full border appearance-none pr-3.5 pl-1.5 cursor-pointer transition ${
                                        subChannel === 'ONLINE'
                                          ? 'bg-pink-50 text-[#E6007E] border-pink-300 hover:bg-pink-100'
                                          : subChannel === 'POS'
                                          ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                                          : 'bg-purple-50 text-purple-800 border-purple-300 hover:bg-purple-100'
                                      }`}
                                      title="تغيير قناة وتصنيف هذا القسم الفرعي فوراً"
                                    >
                                      <option value="ONLINE">🌐 متجر</option>
                                      <option value="POS">🏪 كاش</option>
                                      <option value="SHARED">🔄 مشترك</option>
                                    </select>
                                  </div>

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
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <Link
                                  href={`/admin/products?category=${sub.id}${subChannel === 'ONLINE' ? '&channel=online' : subChannel === 'POS' ? '&channel=pos' : '&channel=shared'}`}
                                  className={`text-[11px] font-bold px-2 py-0.5 rounded-full border hover:opacity-80 transition flex items-center gap-1 ${
                                    subChannel === 'ONLINE'
                                      ? 'text-[#E6007E] bg-pink-50 border-pink-200'
                                      : subChannel === 'POS'
                                      ? 'text-emerald-800 bg-emerald-50 border-emerald-200'
                                      : 'text-purple-800 bg-purple-50 border-purple-200'
                                  }`}
                                  title="اضغط لعرض منتجات هذا القسم الفرعي في صفحة المنتجات"
                                >
                                  <Package className="w-3 h-3" />
                                  <span>{sub._count?.products ?? 0} {subChannel === 'ONLINE' ? 'متجر' : subChannel === 'POS' ? 'كاش' : 'مشترك'}</span>
                                </Link>
                                {subChannel === 'ONLINE' && (sub.posCount ?? 0) > 0 && (
                                  <span className="text-[9px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-full border border-amber-200 font-bold">
                                    ({sub.posCount} كاش)
                                  </span>
                                )}
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

      {/* Add / Edit Category Modal with Channel Selection & Image Upload */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in" dir="rtl">
          <div className="bg-white rounded-3xl p-6 md:p-8 max-w-lg w-full shadow-2xl border border-zinc-200 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-black text-zinc-900 mb-1 flex items-center gap-2">
              <FolderPlus className="w-5 h-5 text-[#E6007E]" />
              <span>{editingCategory ? 'تعديل بيانات وصورة القسم' : 'إضافة قسم جديد'}</span>
            </h3>
            <p className="text-xs text-zinc-500 mb-6">
              حدد تصنيف القسم (متجر إلكتروني / كاشير / مشترك)، وارفع صورة واضحة لتمثيل القسم لزبائن المتجر.
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

              {/* Channel Selector: Online Store vs POS vs Shared */}
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-2">تصنيف وقناة القسم *</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <label className={`flex flex-col p-3 rounded-xl border-2 cursor-pointer transition ${
                    formChannel === 'ONLINE'
                      ? 'bg-pink-50/60 border-[#E6007E] text-[#E6007E]'
                      : 'border-zinc-200 hover:border-pink-200 text-zinc-700'
                  }`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-black text-xs flex items-center gap-1">
                        <Globe className="w-3.5 h-3.5" />
                        <span>متجر إلكتروني</span>
                      </span>
                      <input 
                        type="radio" 
                        name="modalChannel" 
                        checked={formChannel === 'ONLINE'} 
                        onChange={() => setFormChannel('ONLINE')}
                        className="text-[#E6007E]"
                      />
                    </div>
                    <span className="text-[10px] text-zinc-500">يعرض بالموقع وتوضع له صورة</span>
                  </label>

                  <label className={`flex flex-col p-3 rounded-xl border-2 cursor-pointer transition ${
                    formChannel === 'POS'
                      ? 'bg-emerald-50/60 border-emerald-600 text-emerald-800'
                      : 'border-zinc-200 hover:border-emerald-200 text-zinc-700'
                  }`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-black text-xs flex items-center gap-1">
                        <Store className="w-3.5 h-3.5" />
                        <span>كاشير فقط</span>
                      </span>
                      <input 
                        type="radio" 
                        name="modalChannel" 
                        checked={formChannel === 'POS'} 
                        onChange={() => setFormChannel('POS')}
                        className="text-emerald-600"
                      />
                    </div>
                    <span className="text-[10px] text-zinc-500">خاص بنظام الكاشير بالمحل</span>
                  </label>

                  <label className={`flex flex-col p-3 rounded-xl border-2 cursor-pointer transition ${
                    formChannel === 'SHARED'
                      ? 'bg-purple-50/60 border-purple-600 text-purple-800'
                      : 'border-zinc-200 hover:border-purple-200 text-zinc-700'
                  }`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-black text-xs flex items-center gap-1">
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>مشترك</span>
                      </span>
                      <input 
                        type="radio" 
                        name="modalChannel" 
                        checked={formChannel === 'SHARED'} 
                        onChange={() => setFormChannel('SHARED')}
                        className="text-purple-600"
                      />
                    </div>
                    <span className="text-[10px] text-zinc-500">بالمتجر والكاشير معاً</span>
                  </label>
                </div>
              </div>

              {/* Category Image Upload with Live Preview */}
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1.5 flex items-center justify-between">
                  <span>صورة القسم (مهمة جداً لأقسام المتجر الإلكتروني)</span>
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
                      الصيغ المدعومة: PNG, JPG, WEBP. يُفضل صورة مربعة واضحة تُمثل القسم في المتجر.
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
