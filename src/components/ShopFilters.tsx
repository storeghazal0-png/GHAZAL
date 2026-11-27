'use client';

import React, { useState, useEffect, useTransition, useCallback } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Search, X, Loader2, Sparkles } from 'lucide-react';
import {
  PerfumeIcon,
  HaircareIcon,
  SkincareIcon,
  FaceCareIcon,
  DeodorantsIcon,
  MakeupIcon,
  AccessoriesIcon,
  ToolsIcon,
  OffersIcon
} from '@/components/CategoryIcons';

interface ShopFiltersProps {
  categories?: {
    id: string;
    name: string;
    slug?: string;
    parentId?: string | null;
    children?: { id: string; name: string; slug?: string; parentId?: string | null }[];
  }[];
  genders?: { id: string; name: string }[];
  families?: { id: string; name: string }[];
  initialMinPrice?: number;
  initialMaxPrice?: number;
  initialCategory?: string;
  initialGender?: string;
  initialFamily?: string;
}

export function ShopFilters({ 
  categories = [],
  initialCategory = '',
}: ShopFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const urlQ = searchParams.get('q') || searchParams.get('search') || '';
  const rawCat = (searchParams.get('category') || initialCategory || '').toLowerCase();
  const urlCategory = (rawCat === '*' || rawCat === 'all') ? '' : rawCat;
  const urlFilter = (searchParams.get('filter') || '').toLowerCase();

  const [searchQuery, setSearchQuery] = useState(urlQ);

  // Sync search query whenever URL changes externally
  useEffect(() => {
    setSearchQuery(urlQ);
  }, [urlQ]);

  // Use the same active ONLINE/SHARED categories supplied by /shop and the
  // categories page, instead of maintaining a second hard-coded list here.
  const categoryIcons: Record<string, React.ComponentType<any>> = {
    fragrances: PerfumeIcon,
    perfumes: PerfumeIcon,
    haircare: HaircareIcon,
    skincare: SkincareIcon,
    'face-care': FaceCareIcon,
    deodorants: DeodorantsIcon,
    makeup: MakeupIcon,
    accessories: AccessoriesIcon,
    'beauty-tools': ToolsIcon,
    tools: ToolsIcon,
  };

  const rootCategories = categories.filter((category) => !category.parentId);
  const dynamicCategories = rootCategories
    .filter((category) => !['offers', 'offers-gifts', 'old-cash-category'].includes((category.slug || category.id).toLowerCase()))
    .map((category) => {
      const categoryParam = (category.slug || category.id).toLowerCase();
      return {
        id: category.id,
        name: category.name,
        icon: categoryIcons[categoryParam] || ((props: any) => <Sparkles className="text-[#E6007E] stroke-[1.75]" {...props} />),
        categoryParam,
        filterParam: '',
        matches: urlCategory === categoryParam || (categoryParam === 'fragrances' && urlCategory === 'perfumes') || (categoryParam === 'beauty-tools' && urlCategory === 'tools'),
      };
    });

  const CIRCULAR_CATEGORIES = [
    {
      id: 'all',
      name: 'جميع الأقسام',
      icon: (props: any) => <Sparkles className="text-[#E6007E] stroke-[1.75]" {...props} />,
      categoryParam: '',
      filterParam: '',
      matches: !urlCategory && !urlFilter,
    },
    ...dynamicCategories,
    {
      id: 'offers',
      name: 'هدايا وعروض',
      icon: OffersIcon,
      categoryParam: '',
      filterParam: 'offers',
      matches: urlFilter === 'offers',
    },
  ];

  const selectedRoot = rootCategories.find((category) => {
    const rootSlug = (category.slug || category.id).toLowerCase();
    return urlCategory === rootSlug || urlCategory === category.id.toLowerCase() ||
      (category.children || []).some((child) => urlCategory === (child.slug || child.id).toLowerCase());
  });
  const selectedRootChildren = (selectedRoot?.children || [])
    .filter((child) => child.slug !== 'old-cash-category')
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));

  const updateFilters = useCallback((newQ: string, newCat?: string, newFilter?: string) => {
    const params = new URLSearchParams(searchParams.toString());

    // Normalize query
    params.delete('search');
    if (newQ.trim()) {
      params.set('q', newQ.trim());
    } else {
      params.delete('q');
    }

    // Category param
    if (newCat !== undefined) {
      if (newCat) {
        params.set('category', newCat);
        params.delete('filter');
      } else {
        params.delete('category');
      }
    }

    // Filter param (offers)
    if (newFilter !== undefined) {
      if (newFilter) {
        params.set('filter', newFilter);
        params.delete('category');
      } else {
        params.delete('filter');
      }
    }

    startTransition(() => {
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }, [pathname, router, searchParams]);

  // LIVE AUTO-SEARCH: Trigger search automatically as user types
  useEffect(() => {
    if (searchQuery.trim() === urlQ.trim()) return;

    const timer = setTimeout(() => {
      updateFilters(searchQuery);
    }, 280);

    return () => clearTimeout(timer);
  }, [searchQuery, urlQ, updateFilters]);

  const handleSelectCategory = (catItem: typeof CIRCULAR_CATEGORIES[0]) => {
    if (catItem.id === 'all') {
      updateFilters(searchQuery, '', '');
    } else if (catItem.filterParam) {
      updateFilters(searchQuery, '', catItem.filterParam);
    } else {
      updateFilters(searchQuery, catItem.categoryParam, '');
    }
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    updateFilters('');
  };

  const handleResetAll = () => {
    setSearchQuery('');
    startTransition(() => {
      router.push(pathname, { scroll: false });
    });
  };

  const hasActiveFilters = Boolean(searchQuery.trim() || urlCategory || urlFilter);

  return (
    <div className="space-y-6">
      {/* -------------------------------------------------------------
          1. CIRCULAR CATEGORY FILTERS (مطابقة للأقسام في الصفحة الرئيسية)
      ------------------------------------------------------------- */}
      <div className="bg-white p-4 sm:p-6 rounded-3xl border border-pink-100 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#E6007E] animate-pulse" />
            <span className="text-xs sm:text-sm font-extrabold text-zinc-900 font-heading">
              تصفحي حسب التصنيف
            </span>
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleResetAll}
              className="text-xs text-[#E6007E] hover:text-[#c4006b] font-bold flex items-center gap-1 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              <span>إعادة ضبط الكل</span>
            </button>
          )}
        </div>

        {/* Circular Category Buttons List */}
        <div className="flex items-center justify-start sm:justify-center gap-4 sm:gap-6 md:gap-7 overflow-x-auto pb-2 pt-1 scrollbar-none no-scrollbar">
          {CIRCULAR_CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const isActive = cat.matches;

            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => handleSelectCategory(cat)}
                className="flex flex-col items-center gap-2 shrink-0 group focus:outline-none transition-all cursor-pointer"
              >
                <div 
                  className={`w-16 h-16 sm:w-20 sm:h-20 md:w-22 md:h-22 rounded-full flex items-center justify-center p-3 transition-all duration-300 ${
                    isActive
                      ? 'bg-gradient-to-tr from-[#FADAE6] via-pink-100 to-white border-2 border-[#E6007E] shadow-md scale-105 ring-4 ring-[#E6007E]/20'
                      : 'bg-gradient-to-tr from-[#FADAE6]/40 via-pink-50/70 to-white border-2 border-pink-100 shadow-2xs hover:scale-105 hover:border-[#E6007E] hover:shadow-sm'
                  }`}
                >
                  <Icon className={`w-8 h-8 sm:w-10 sm:h-10 transition-transform duration-300 ${isActive ? 'scale-110' : 'group-hover:scale-105'}`} />
                </div>
                <span 
                  className={`text-xs md:text-sm transition-colors text-center ${
                    isActive 
                      ? 'text-[#E6007E] font-black' 
                      : 'text-zinc-700 font-bold group-hover:text-[#E6007E]'
                  }`}
                >
                  {cat.name}
                </span>
              </button>
            );
          })}
        </div>

        {selectedRootChildren.length > 0 && (
          <div className="mt-4 pt-4 border-t border-pink-100">
            <p className="text-xs font-extrabold text-zinc-700 mb-2 text-center">
              الأقسام الفرعية
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => handleSelectCategory({ id: selectedRoot!.id, name: selectedRoot!.name, icon: Sparkles, categoryParam: selectedRoot!.slug || selectedRoot!.id, filterParam: '', matches: false })}
                className={`px-3 py-1.5 rounded-full border text-xs font-bold transition-colors ${
                  urlCategory === (selectedRoot?.slug || selectedRoot?.id || '').toLowerCase()
                    ? 'bg-[#E6007E] text-white border-[#E6007E]'
                    : 'bg-white text-zinc-700 border-pink-200 hover:border-[#E6007E] hover:text-[#E6007E]'
                }`}
              >
                كل {selectedRoot?.name}
              </button>
              {selectedRootChildren.map((child) => {
                const childParam = (child.slug || child.id).toLowerCase();
                const isSelected = urlCategory === childParam;
                return (
                  <button
                    key={child.id}
                    type="button"
                    onClick={() => updateFilters(searchQuery, childParam, '')}
                    className={`px-3 py-1.5 rounded-full border text-xs font-bold transition-colors ${
                      isSelected
                        ? 'bg-[#E6007E] text-white border-[#E6007E]'
                        : 'bg-white text-zinc-700 border-pink-200 hover:border-[#E6007E] hover:text-[#E6007E]'
                    }`}
                  >
                    {child.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* -------------------------------------------------------------
          2. LIVE SEARCH INPUT BAR
      ------------------------------------------------------------- */}
      <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-zinc-200/80 shadow-2xs">
        <div className="relative flex items-center">
          <Search className="w-4 h-4 absolute inset-inline-start-3.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
          <input 
            type="text" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ابحثي عن منتج بالاسم أو الماركة (مثال: لوريال، مايبيلين، سيروم، عطر)..."
            className="w-full ps-10 pe-10 py-2.5 text-xs sm:text-sm border border-zinc-200 rounded-xl bg-zinc-50/50 focus:bg-white focus:border-[#E6007E] focus:ring-2 focus:ring-[#FADAE6] outline-none transition font-medium text-zinc-800 placeholder:text-zinc-400"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={handleClearSearch}
              className="absolute inset-inline-end-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 flex items-center justify-center transition"
              title="مسح البحث"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Live Loading feedback indicator */}
        {isPending && (
          <div className="mt-2 flex items-center gap-2 text-xs text-[#E6007E] font-bold animate-pulse">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>جاري تحديث المنتجات المعروضة...</span>
          </div>
        )}
      </div>
    </div>
  );
}
