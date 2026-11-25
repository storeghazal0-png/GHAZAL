'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { logout } from '@/actions/auth';
import { 
  LayoutDashboard, ShoppingBag, Clock, Banknote, Shield, Printer,
  Layers, Tag, Gift, DollarSign, RotateCcw, Users, FileText,
  BarChart3, Database, HardDrive, ShieldAlert, Settings, Truck,
  FileCode, LogOut, ChevronDown, Sparkles, ClipboardCheck, Boxes,
  Menu, X, ChevronRight, ChevronLeft, CheckCircle2, Activity, ShieldCheck, Download
} from 'lucide-react';

interface AdminSidebarProps {
  employeeName: string;
  roleName?: string;
}

interface NavItem {
  href: string;
  label: string;
  icon: any;
  badge?: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

export function AdminSidebar({ employeeName, roleName = 'ADMIN' }: AdminSidebarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const pathname = usePathname();

  const navSections: NavSection[] = [
    {
      title: 'الرئيسية والمؤشرات',
      items: [
        { href: '/admin/dashboard', label: 'لوحة التحكم العامة', icon: LayoutDashboard },
      ]
    },
    {
      title: 'نقطة البيع (POS)',
      items: [
        { href: '/admin/pos/sales', label: 'مبيعات الكاشير بالفرع', icon: ShoppingBag },
        { href: '/admin/pos/printing', label: 'طباعة الإيصالات والباركود', icon: Printer },
        { href: '/admin/pos/download', label: 'تحميل برنامج الكاشير (EXE & ZIP)', icon: Download },
      ]
    },
    {
      title: 'الكتالوج والمنتجات',
      items: [
        { href: '/admin/products', label: 'المنتجات والأسعار', icon: Layers },
        { href: '/admin/categories', label: 'الأقسام والتصنيفات', icon: Layers },
      ]
    },
    {
      title: 'المبيعات والتوصيل',
      items: [
        { href: '/admin/orders', label: 'طلبات المتجر الإلكتروني', icon: ShoppingBag },
        { href: '/admin/deliveries', label: 'طلبيات وشحنات التوصيل', icon: Truck },
        { href: '/admin/promotions', label: 'العروض الترويجية والخصومات', icon: Tag },
        { href: '/admin/rewards', label: 'مكافآت السلة والهدايا', icon: Gift },
        { href: '/admin/customers', label: 'سجل الزبائن والعملاء', icon: Users },
      ]
    },
    {
      title: 'المالية والتسويات',
      items: [
        { href: '/admin/settlements', label: 'التسويات والجرد والفواتير المركزية', icon: ClipboardCheck },
        { href: '/admin/settlements?tab=reports', label: 'التقارير المالية والتحليلات', icon: BarChart3 },
      ]
    },
    {
      title: 'إدارة النظام والمتجر',
      items: [
        { href: '/admin/employees', label: 'الموظفون والصلاحيات', icon: Users },
        { href: '/admin/content', label: 'إدارة واجهة المتجر (CMS)', icon: FileCode },
        { href: '/admin/system', label: 'صحة النظام والنسخ الاحتياطي والبيانات', icon: Activity },
      ]
    }
  ];

  return (
    <>
      {/* Mobile Top Header - Button located on the TOP RIGHT */}
      <div 
        className="print:hidden md:hidden flex items-center justify-between bg-[#0e0e12]/95 backdrop-blur-md text-white px-3 py-2.5 sticky top-0 z-40 w-full shadow-lg border-b border-[#E6007E]/30"
        dir="rtl"
      >
        {/* Right side: Toggle button at top right + Ghazal Brand Title */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="p-2 rounded-xl bg-gradient-to-r from-[#E6007E] to-[#C4006B] text-white shadow-md shadow-pink-500/25 active:scale-95 transition-all flex items-center justify-center cursor-pointer border border-pink-400/30"
            aria-label="فتح القائمة الرئيسية"
            title="فتح القائمة الرئيسية"
          >
            {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 p-0.5 flex items-center justify-center overflow-hidden shrink-0">
              <img src="/logo.png" alt="Ghazal" className="w-full h-full object-contain" />
            </div>
            <div>
              <span className="font-heading font-black text-sm text-white block leading-tight">
                غزل <span className="text-[#E6007E]">للمكياج</span>
              </span>
              <span className="text-[10px] text-zinc-400 font-bold block">لوحة الإدارة المركزية</span>
            </div>
          </div>
        </div>

        {/* Left side: Live indicator */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>متصل</span>
        </div>
      </div>

      {/* Backdrop for mobile drawer */}
      {isOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/75 backdrop-blur-xs z-40 transition-opacity"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Main Sidebar */}
      <aside
        className={`print:hidden fixed md:sticky top-0 right-0 z-50 bg-[#0e0e12] text-white flex flex-col h-screen font-sans border-l-2 border-[#E6007E]/30 shadow-2xl transition-all duration-300 transform md:transform-none ${
          isOpen ? 'translate-x-0' : 'translate-x-full md:translate-x-0'
        } ${isCollapsed ? 'md:w-20' : 'md:w-68'} w-72`}
        dir="rtl"
      >
        {/* Desktop Collapse / Expand Toggle Button */}
        <button 
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="hidden md:flex absolute -left-3.5 top-7 bg-[#E6007E] text-white p-1.5 rounded-full shadow-lg shadow-pink-600/30 hover:bg-[#c4006b] hover:scale-105 transition-all z-50 border-2 border-[#0e0e12]"
          title={isCollapsed ? "توسيع القائمة" : "طي القائمة"}
        >
          {isCollapsed ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>

        {/* Brand Header */}
        <div className={`p-4 border-b border-zinc-800/80 bg-gradient-to-b from-zinc-900/60 to-transparent flex flex-col items-center relative ${isCollapsed ? 'md:p-2' : ''}`}>
          {/* Mobile close button inside drawer */}
          <button
            onClick={() => setIsOpen(false)}
            className="md:hidden absolute top-3 left-3 p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/60 transition"
            title="إغلاق القائمة"
          >
            <X className="w-5 h-5" />
          </button>

          <div className={`flex items-center justify-center ${isCollapsed ? 'md:w-10 md:h-10' : 'w-16 h-16'} transition-all`}>
            <img 
              src="/logo.png" 
              alt="Ghazal Logo" 
              className="object-contain w-full h-full drop-shadow-[0_4px_12px_rgba(230,0,126,0.3)]" 
            />
          </div>

          {!isCollapsed && (
            <div className="text-center mt-2">
              <span className="font-heading font-black text-lg tracking-wider text-white block">
                GHAZAL <span className="text-[#E6007E]">BEAUTY</span>
              </span>
              <span className="text-[10px] text-zinc-400 font-bold block mt-0.5">
                لوحة الإدارة والتشغيل السحابي
              </span>
            </div>
          )}
        </div>

        {/* Navigation Sections */}
        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-4 overflow-x-hidden text-xs custom-scrollbar">
          {navSections.map((sec, secIdx) => (
            <div key={secIdx} className="space-y-1">
              {!isCollapsed && (
                <div className="flex items-center gap-1.5 px-3 py-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#E6007E]/70"></span>
                  <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">
                    {sec.title}
                  </p>
                </div>
              )}
              {sec.items.map((link) => {
                const Icon = link.icon;
                const [targetPath, targetQuery] = link.href.split('?');
                let isActive = false;
                if (targetQuery) {
                  isActive = pathname === targetPath && typeof window !== 'undefined' && window.location.search.includes(targetQuery);
                } else if (link.href === '/admin/settlements') {
                  const isReports = typeof window !== 'undefined' && window.location.search.includes('reports');
                  isActive = pathname === '/admin/settlements' && !isReports;
                } else if (link.href === '/admin/system') {
                  isActive = pathname === '/admin/system' || pathname.startsWith('/admin/system') || pathname === '/admin/system-health' || pathname === '/admin/settings/backups';
                } else {
                  isActive = pathname === link.href || (link.href !== '/admin/dashboard' && pathname.startsWith(link.href + '/'));
                }

                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setIsOpen(false)}
                    className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all relative ${
                      isActive
                        ? 'bg-gradient-to-l from-[#E6007E] to-[#C4006B] text-white font-black shadow-md shadow-pink-600/25 border border-pink-400/20'
                        : 'text-zinc-300 hover:text-white hover:bg-zinc-800/60'
                    } ${isCollapsed ? 'md:justify-center md:px-2' : ''}`}
                    title={link.label}
                  >
                    <Icon className={`w-4 h-4 shrink-0 transition-transform ${isActive ? 'scale-110 text-white' : 'text-zinc-400 group-hover:text-pink-400'}`} />
                    {!isCollapsed && <span className="truncate">{link.label}</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Employee Info & Logout Card */}
        <div className={`p-3 border-t border-zinc-800/80 bg-zinc-950/80 ${isCollapsed ? 'md:flex md:flex-col md:items-center md:gap-2' : ''}`}>
          {!isCollapsed ? (
            <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-zinc-900/60 border border-zinc-800">
              <div className="flex items-center gap-2 truncate">
                <div className="w-8 h-8 rounded-lg bg-pink-500/10 border border-pink-500/20 flex items-center justify-center text-[#E6007E] font-black text-xs shrink-0">
                  {employeeName.charAt(0)}
                </div>
                <div className="truncate">
                  <p className="font-extrabold text-white text-xs truncate leading-tight">{employeeName}</p>
                  <span className="text-[10px] font-bold text-pink-400/90">{roleName}</span>
                </div>
              </div>
              <form action={logout}>
                <button
                  type="submit"
                  className="p-2 rounded-lg text-rose-400 hover:text-rose-200 hover:bg-rose-500/10 transition cursor-pointer"
                  title="تسجيل الخروج من النظام"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </form>
            </div>
          ) : (
            <form action={logout}>
              <button
                type="submit"
                className="p-2 rounded-lg text-rose-400 hover:text-rose-200 hover:bg-rose-500/10 transition cursor-pointer"
                title="تسجيل الخروج من النظام"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </form>
          )}
        </div>
      </aside>
    </>
  );
}
