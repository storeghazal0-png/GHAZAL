'use client';

import React, { useState, useTransition } from 'react';
import { 
  GripVertical, Plus, Folder, FolderPlus, Layers, ArrowUpDown, ChevronDown, 
  ChevronRight, Trash2, Edit2, Image as ImageIcon, CheckCircle2, AlertCircle, 
  Package, Sparkles, MoveUp, MoveDown, Info
} from 'lucide-react';
import { reorderCategoriesAction, createCategory, updateCategory, deleteCategory, SyncedCategory } from '@/actions/categories';
import { useRouter } from 'next/navigation';

interface AdminCategoriesClientProps {
  initialCategories: SyncedCategory[];
  allProducts: { id: string; nameAr: string; nameEn: string; category?: { name: string } | null; categoryId?: string | null }[];
}

export function AdminCategoriesClient({ initialCategories, allProducts }: AdminCategoriesClientProps) {
  const router = useRouter();
  const [categories, setCategories] = useState<SyncedCategory[]>(initialCategories);
  const [isPending, startTransition] = useTransition();
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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

  // Group categories into Root vs Subcategories
  const rootCategories = categories.filter(c => !c.parentId);
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
    setTimeout(() => setStatusMessage(null), 4000);
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

    // Reorder array
    const sourceList = parentId ? (subCategoriesMap[parentId] || []) : rootCategories;
    const oldIndex = sourceList.findIndex(c => c.id === draggedCatId);
    const newIndex = sourceList.findIndex(c => c.id === targetId);
    if (oldIndex === -1 || newIndex === -1) return;

    const updatedSubList = [...sourceList];
    const [movedItem] = updatedSubList.splice(oldIndex, 1);
    updatedSubList.splice(newIndex, 0, movedItem);

    // Apply optimistic state
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
    const list = parentId ? (subCategoriesMap[parentId] || []) : rootCategories;
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
        showNotification('success', 'تم تحديث الترتيب');
        router.refresh();
      } else {
        showNotification('error', res.error || 'فشل تحديث الترتيب');
      }
    });
  };

  const openAddModal = (presetParentId: string = 'root') => {
    setEditingCategory(null);
    setFormName('');
    setSelectedParentId(presetParentId);
    setFormImage(null);
    setIsModalOpen(true);
  };

  const openEditModal = (cat: SyncedCategory) => {
    setEditingCategory(cat);
    setFormName(cat.name);
    setSelectedParentId(cat.parentId || 'root');
    setFormImage(null);
    setIsModalOpen(true);
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

      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-2xl border border-[var(--color-ivory-200)] shadow-sm">
        <div>
          <h2 className="text-xl font-black text-zinc-900 flex items-center gap-2">
            <Layers className="w-6 h-6 text-[#E6007E]" />
            <span>هيكلية الأقسام وتصنيفات المتجر</span>
          </h2>
          <p className="text-xs text-zinc-500 mt-1">
            اسحب الأقسام لتغيير ترتيب ظهورها في المتجر ونقاط البيع • يدعم تفريع قسم واحد كحد أقصى
          </p>
        </div>

        <button
          onClick={() => openAddModal('root')}
          className="flex items-center gap-2 bg-[#E6007E] hover:bg-[#c2006a] text-white px-4 py-2.5 rounded-xl font-bold text-sm shadow-md transition-all active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>إضافة قسم رئيسي جديد</span>
        </button>
      </div>

      {/* Categories Tree List with Drag and Drop */}
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="bg-zinc-50 px-6 py-3.5 border-b border-zinc-200 flex justify-between items-center text-xs font-bold text-zinc-600">
          <div className="flex items-center gap-4">
            <span className="w-8 text-center">الترتيب</span>
            <span>القسم / الصورة</span>
          </div>
          <div className="flex items-center gap-8">
            <span>عدد الأصناف</span>
            <span>الإجراءات والتفريع</span>
          </div>
        </div>

        <div className="divide-y divide-zinc-100">
          {rootCategories.length === 0 ? (
            <div className="p-12 text-center text-zinc-400">لا توجد أقسام مسجلة حالياً</div>
          ) : (
            rootCategories.map((cat, idx) => {
              const subCats = subCategoriesMap[cat.id] || [];
              const isExpanded = expandedCats[cat.id] ?? true;
              const isDragOver = dragOverCatId === cat.id;

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

                      {/* Image Thumbnail */}
                      <div className="w-11 h-11 rounded-xl overflow-hidden border border-zinc-200 bg-white shrink-0 flex items-center justify-center p-0.5">
                        <img 
                          src={cat.imagePath || '/logo.png'} 
                          alt={cat.name} 
                          className="w-full h-full object-contain"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/logo.png'; }}
                        />
                      </div>

                      {/* Name & Slug */}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-black text-sm text-zinc-900">{cat.name}</span>
                          <span className="bg-zinc-100 text-zinc-600 text-[10px] font-bold px-2 py-0.5 rounded-full border border-zinc-200">
                            قسم رئيسي
                          </span>
                          {subCats.length > 0 && (
                            <span className="bg-pink-50 text-[#E6007E] text-[10px] font-bold px-2 py-0.5 rounded-full border border-pink-200">
                              {subCats.length} قسم فرعي
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] font-mono text-zinc-400">{cat.slug}</span>
                      </div>
                    </div>

                    {/* Actions & Product Count */}
                    <div className="flex items-center gap-4">
                      {/* Products Count Badge */}
                      <div className="text-xs font-bold text-zinc-700 bg-zinc-100 px-3 py-1 rounded-full border border-zinc-200 min-w-[70px] text-center">
                        {cat._count?.products ?? 0} منتج
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
                          disabled={idx === rootCategories.length - 1}
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
                        <span className="hidden md:inline">إضافة قسم فرعي</span>
                      </button>

                      {/* Edit Button */}
                      <button
                        onClick={() => openEditModal(cat)}
                        className="p-1.5 hover:bg-zinc-200 text-zinc-600 rounded-lg transition"
                        title="تعديل القسم"
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
                          مستوى واحد فقط • المنتجات فقط داخل هذه الأقسام
                        </span>
                      </div>

                      {subCats.map((sub, subIdx) => {
                        const isSubDragOver = dragOverCatId === sub.id;

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

                              <div className="w-8 h-8 rounded-lg overflow-hidden border border-zinc-200 bg-white shrink-0 flex items-center justify-center">
                                <img 
                                  src={sub.imagePath || '/logo.png'} 
                                  alt={sub.name} 
                                  className="w-full h-full object-contain"
                                  onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/logo.png'; }}
                                />
                              </div>

                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-xs text-zinc-900">{sub.name}</span>
                                  <span className="bg-purple-50 text-purple-700 text-[9px] font-bold px-1.5 py-0.5 rounded border border-purple-200">
                                    قسم فرعي
                                  </span>
                                </div>
                                <span className="text-[10px] font-mono text-zinc-400">{sub.slug}</span>
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              <div className="text-[11px] font-bold text-zinc-600 bg-zinc-100 px-2 py-0.5 rounded-full border border-zinc-200">
                                {sub._count?.products ?? 0} منتج
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
          <div className="bg-white rounded-3xl p-6 md:p-8 max-w-lg w-full shadow-2xl border border-zinc-200">
            <h3 className="text-lg font-black text-zinc-900 mb-1 flex items-center gap-2">
              <FolderPlus className="w-5 h-5 text-[#E6007E]" />
              <span>{editingCategory ? 'تعديل بيانات القسم' : 'إضافة قسم جديد للمتجر'}</span>
            </h3>
            <p className="text-xs text-zinc-500 mb-6">
              حدد اسم القسم وموقعه في الشجرة (قسم رئيسي أو فرعي لمرة واحدة فقط)
            </p>

            <form onSubmit={handleFormSubmit} className="space-y-4">
              {/* Category Name */}
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1.5">اسم القسم / المجموعة *</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="مثال: مزيلات عرق، العناية بالوجه، أحمر شفاه..."
                  className="w-full border border-zinc-300 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-[#E6007E] focus:ring-2 focus:ring-pink-100 font-bold"
                />
              </div>

              {/* Hierarchy Parent Selection (Strict 1-Level Depth) */}
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1.5">نوع ومستوى القسم *</label>
                <select
                  value={selectedParentId}
                  onChange={(e) => setSelectedParentId(e.target.value)}
                  className="w-full border border-zinc-300 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-[#E6007E] focus:ring-2 focus:ring-pink-100 font-bold bg-white"
                >
                  <option value="root">📁 قسم رئيسي مستقل (مستوى أول)</option>
                  <optgroup label="أقسام فرعية تابعة لقسم رئيسي (مستوى ثانٍ أخير)">
                    {rootCategories
                      .filter(r => !editingCategory || r.id !== editingCategory.id)
                      .map((root) => (
                        <option key={root.id} value={root.id}>
                          ↳ تابع لـ: {root.name}
                        </option>
                      ))}
                  </optgroup>
                </select>
                <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 mt-1.5">
                  <Info className="w-3.5 h-3.5 text-amber-500" />
                  <span>الأقسام الفرعية تكون داخل القسم الرئيسي، ولا يمكن أن يتفرع منها أقسام أخرى (فقط منتجات).</span>
                </div>
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
