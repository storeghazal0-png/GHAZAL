'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { 
  Activity, 
  ShieldCheck, 
  Database, 
  Server, 
  Cpu, 
  Layers, 
  HardDrive, 
  Clock, 
  Sparkles 
} from 'lucide-react';
import { SystemHealthClient } from '@/app/admin/system-health/SystemHealthClient';
import { BackupSettingsClient } from '@/app/admin/settings/backups/BackupSettingsClient';
import { DataRetentionClient } from '@/app/admin/system/retention/DataRetentionClient';
import { SystemHealthMetrics, BackupRecord } from '@/actions/system-health';
import { BackupSystemStatus } from '@/actions/backup';
import { DataRetentionStatus } from '@/actions/data-retention';

type SystemTab = 'health' | 'backups' | 'retention';

interface UnifiedSystemClientProps {
  initialTab?: string;
  healthData: {
    success: boolean;
    metrics: SystemHealthMetrics;
    recentBackups: BackupRecord[];
  };
  backupData: BackupSystemStatus;
  retentionData: DataRetentionStatus;
}

export function UnifiedSystemClient({
  initialTab,
  healthData,
  backupData,
  retentionData
}: UnifiedSystemClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const parseTab = (t?: string | null): SystemTab => {
    if (!t) return 'health';
    const clean = t.toLowerCase().trim();
    if (clean === 'backup' || clean === 'backups' || clean === 'dr') return 'backups';
    if (clean === 'retention' || clean === 'storage' || clean === 'purge') return 'retention';
    return 'health';
  };

  const [activeTab, setActiveTab] = useState<SystemTab>(() => parseTab(initialTab || searchParams?.get('tab')));

  useEffect(() => {
    const urlTab = searchParams?.get('tab');
    if (urlTab) {
      setActiveTab(parseTab(urlTab));
    }
  }, [searchParams]);

  const switchTab = (tab: SystemTab) => {
    setActiveTab(tab);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', tab);
      window.history.replaceState({}, '', url.toString());
    }
  };

  const tabsConfig = [
    {
      id: 'health' as SystemTab,
      label: 'صحة النظام والمزامنة',
      description: 'مراقبة زمن الاستجابة، سلامة الاتصال السحابي، ومزامنة الفروع',
      icon: Activity,
      badge: 'مباشر',
      badgeColor: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
    },
    {
      id: 'backups' as SystemTab,
      label: 'النسخ الاحتياطي وحماية البيانات (Neon DR)',
      description: 'النسخ المؤتمت، استعادة البيانات، وسجلات الطوارئ مع إشعارات البريد',
      icon: ShieldCheck,
      badge: 'Neon Cloud',
      badgeColor: 'bg-blue-500/10 text-blue-600 border-blue-500/20'
    },
    {
      id: 'retention' as SystemTab,
      label: 'حفظ البيانات ومساحة التخزين (90/30 يوم)',
      description: 'سياسة الحفظ التلقائي، إدارة مساحة قاعدة البيانات، وحماية السجلات الأساسية',
      icon: Database,
      badge: 'تخزين أمثل',
      badgeColor: 'bg-pink-500/10 text-[#E6007E] border-pink-500/20'
    }
  ];

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header Hub Card */}
      <div className="bg-white rounded-2xl border border-zinc-200/80 p-5 md:p-6 shadow-xs relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-pink-50 via-purple-50/20 to-transparent rounded-full blur-2xl -z-10 pointer-events-none" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#E6007E] to-[#C4006B] flex items-center justify-center text-white shadow-md shadow-pink-500/20 shrink-0">
              <Server className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl md:text-2xl font-black text-zinc-900 tracking-tight">
                  مركز صحة النظام وإدارة البيانات
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-pink-50 text-[#E6007E] border border-pink-200/80">
                  لوحة مركزية موحدة
                </span>
              </div>
              <p className="text-xs text-zinc-500 font-medium mt-1">
                منظومة موحدة تجمع مراقبة صحة النظام، النسخ الاحتياطي السحابي (Neon DR)، وسياسة حفظ البيانات ومساحة التخزين في واجهة واحدة متكاملة.
              </p>
            </div>
          </div>
        </div>

        {/* Tab Buttons */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 mt-6 pt-5 border-t border-zinc-100">
          {tabsConfig.map((tab) => {
            const Icon = tab.icon;
            const isSelected = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => switchTab(tab.id)}
                type="button"
                className={`flex flex-col text-right p-3.5 rounded-xl border transition-all cursor-pointer relative ${
                  isSelected
                    ? 'bg-gradient-to-r from-pink-50/80 to-purple-50/40 border-[#E6007E]/60 shadow-sm ring-1 ring-[#E6007E]/30'
                    : 'bg-zinc-50/60 border-zinc-200/70 hover:bg-zinc-100/80 hover:border-zinc-300'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1.5">
                  <div className="flex items-center gap-2">
                    <div className={`p-1.5 rounded-lg ${isSelected ? 'bg-[#E6007E] text-white shadow-xs' : 'bg-zinc-200/70 text-zinc-700'}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <span className={`text-xs font-black ${isSelected ? 'text-zinc-900' : 'text-zinc-700'}`}>
                      {tab.label}
                    </span>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${tab.badgeColor}`}>
                    {tab.badge}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-500 line-clamp-1">
                  {tab.description}
                </p>
                {isSelected && (
                  <span className="absolute bottom-0 right-4 left-4 h-0.5 bg-[#E6007E] rounded-full" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Contents */}
      <div className="transition-all">
        {activeTab === 'health' && (
          <div className="animate-in fade-in duration-200">
            <SystemHealthClient initialData={healthData} />
          </div>
        )}

        {activeTab === 'backups' && (
          <div className="animate-in fade-in duration-200">
            <BackupSettingsClient initialData={backupData} />
          </div>
        )}

        {activeTab === 'retention' && (
          <div className="animate-in fade-in duration-200">
            <DataRetentionClient initialStatus={retentionData} />
          </div>
        )}
      </div>
    </div>
  );
}
