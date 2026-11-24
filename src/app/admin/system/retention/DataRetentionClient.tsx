'use client';

import React, { useState, useTransition } from 'react';
import { 
  Database, ShieldCheck, Clock, FileText, CheckCircle2, 
  Trash2, RefreshCw, AlertTriangle, Layers, Sparkles, HardDrive, 
  Calendar, Info, ArrowRight, ExternalLink
} from 'lucide-react';
import { 
  DataRetentionStatus, 
  executeDataRetentionCleanupAction 
} from '@/actions/data-retention';

interface Props {
  initialStatus: DataRetentionStatus;
}

export function DataRetentionClient({ initialStatus }: Props) {
  const [status, setStatus] = useState<DataRetentionStatus>(initialStatus);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleRunCleanup = () => {
    const confirmed = window.confirm(
      'هل تؤكدين تشغيل دورة تنظيف وحفظ المساحة الآن؟\n\n- سيتم حذف فواتير المبيعات وإيصالات الكاشير الأقدم من 90 يوماً.\n- سيتم تفريغ وحذف سجلات تتبع النظام والأحداث المؤقتة والجلسات بالكامل (لا تحفظ نهائياً).\n- المنتجات والأقسام والماركات والإعدادات ستبقى دائمة ومحفوظة بنسبة 100% دون مساس.'
    );
    if (!confirmed) return;

    startTransition(async () => {
      try {
        const res = await executeDataRetentionCleanupAction();
        if (res.success) {
          setFeedback({ type: 'success', text: res.message });
          // Update status locally
          setStatus(prev => ({
            ...prev,
            invoices: {
              ...prev.invoices,
              total: Math.max(0, prev.invoices.total - res.deletedInvoices),
              olderThan90Days: 0,
              olderThan30Days: 0
            },
            systemLogs: {
              ...prev.systemLogs,
              auditLogsTotal: Math.max(0, prev.systemLogs.auditLogsTotal - res.deletedLogs),
              auditLogsOlderThan90Days: 0,
              auditLogsPrunable: 0,
              rateLimitEventsOlderThan90Days: 0,
              rateLimitEventsPrunable: 0,
              expiredSessionsTotal: 0
            },
            lastCleanup: {
              executedAt: res.timestamp,
              deletedInvoicesCount: res.deletedInvoices,
              deletedLogsCount: res.deletedLogs,
              deletedSessionsCount: res.deletedSessions,
              totalDeleted: res.totalDeleted
            },
            supabaseFreeTierSafety: {
              ...prev.supabaseFreeTierSafety,
              statusMessage: 'تم تفريغ السجلات المنتهية بنجاح وقاعدة البيانات الآن بأفضل كفاءة ومساحة ممكنة.'
            }
          }));
        } else {
          setFeedback({ type: 'error', text: res.message });
        }
      } catch (err: any) {
        setFeedback({ type: 'error', text: err.message || 'فشلت عملية التنظيف' });
      }
    });
  };

  const totalPrunable = status.invoices.olderThan90Days + status.systemLogs.auditLogsPrunable + status.systemLogs.rateLimitEventsPrunable + status.systemLogs.expiredSessionsTotal;

  return (
    <div className="space-y-6 max-w-6xl mx-auto" dir="rtl">
      {/* Top Banner */}
      <div className="bg-white rounded-3xl border border-zinc-200 p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="p-2 rounded-xl bg-pink-100 text-[#E6007E]">
              <Database className="w-5 h-5" />
            </span>
            <h1 className="text-xl md:text-2xl font-black font-heading text-zinc-900">
              سياسة حفظ البيانات وإدارة مساحة الخطة المجانية (Supabase Free Tier)
            </h1>
          </div>
          <p className="text-xs text-zinc-500 font-medium leading-relaxed">
            تنظيم مدة الاحتفاظ بالسجلات لتفادي تجاوز حد الـ 500 ميغابايت المجاني: الفواتير والإيصالات محفوظة لمدة <strong>90 يوماً</strong> لدعم المراجعات والتسويات، السجلات والعمليات المؤقتة <strong>لا تحفظ نهائياً وتفرغ بالكامل</strong>، بينما المنتجات والتصنيفات والبيانات الرئيسية <strong>دائمة ومحمية للأبد بنسبة 100%</strong>.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleRunCleanup}
            disabled={isPending}
            className="flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl font-bold text-xs shadow-xs transition cursor-pointer"
          >
            {isPending ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>جاري التنظيف الآن...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                <span>تشغيل يدوي فوري (اختياري)</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Automated Schedule Status Card */}
      <div className="bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-emerald-500/10 border border-emerald-200/80 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-emerald-950">
                الدورة التلقائية مجدولة ونشطة (Automated Weekly Retention Active)
              </h3>
              <span className="px-2 py-0.5 rounded-full bg-emerald-200/80 text-emerald-900 text-[10px] font-extrabold">
                تعمل تلقائياً
              </span>
            </div>
            <p className="text-xs text-emerald-800 mt-0.5">
              تُنفذ دورة التنظيف تلقائياً كل <strong>أحد الساعة 02:00 فجراً</strong> (توقيت عمّان) عبر GitHub Actions و Vercel Crons لحماية سعة الـ 500MB المجانية، دون الحاجة لأي تشغيل يدوي.
            </p>
          </div>
        </div>
        <div className="text-xs text-emerald-900 font-mono bg-white/80 px-3 py-1.5 rounded-xl border border-emerald-200 self-start sm:self-auto shrink-0 shadow-2xs">
          آخر دورة: {status.lastCleanup?.executedAt ? new Date(status.lastCleanup.executedAt).toLocaleString('ar-JO', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'مجدولة للتنفيذ الآلي القادم'}
        </div>
      </div>

      {/* Feedback Alert */}
      {feedback && (
        <div className={`p-4 rounded-2xl border text-xs font-bold flex items-center justify-between animate-fade-in ${
          feedback.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-rose-600" />}
            <span>{feedback.text}</span>
          </div>
          <button type="button" onClick={() => setFeedback(null)} className="text-zinc-400 hover:text-zinc-600 font-normal">
            إغلاق ✕
          </button>
        </div>
      )}

      {/* Main Retention Policy Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Invoices */}
        <div className="bg-white rounded-3xl border border-zinc-200 p-6 shadow-xs relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 end-0 w-24 h-24 bg-amber-50 rounded-full blur-2xl -z-10" />
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="p-2.5 rounded-2xl bg-amber-50 text-amber-700">
                <FileText className="w-5 h-5" />
              </span>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-200">
                مدة الاحتفاظ: 90 يوماً
              </span>
            </div>
            <h3 className="font-black text-sm text-zinc-900">فواتير وإيصالات الكاشير</h3>
            <p className="text-xs text-zinc-500 mt-1">
              تحفظ فواتير المبيعات وإيصالات الكاشير لمدة 90 يوماً لدعم مراجعة الحسابات والتسويات، ثم يتم تفريغ الفواتير القديمة بعد انتهاء دورة التسوية.
            </p>
          </div>

          <div className="mt-6 pt-4 border-t border-zinc-100 flex items-center justify-between text-xs">
            <div>
              <span className="text-zinc-400 block text-[11px]">إجمالي الفواتير الحالية</span>
              <strong className="text-zinc-900 font-mono text-base">{status.invoices.total}</strong>
            </div>
            <div className="text-end">
              <span className="text-zinc-400 block text-[11px]">أقدم من 90 يوماً (جاهزة للحذف)</span>
              <strong className={`font-mono text-base ${status.invoices.olderThan90Days > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                {status.invoices.olderThan90Days}
              </strong>
            </div>
          </div>
        </div>

        {/* Card 2: System Logs */}
        <div className="bg-white rounded-3xl border border-zinc-200 p-6 shadow-xs relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 end-0 w-24 h-24 bg-blue-50 rounded-full blur-2xl -z-10" />
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="p-2.5 rounded-2xl bg-blue-50 text-blue-700">
                <Clock className="w-5 h-5" />
              </span>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-blue-100 text-blue-900 border border-blue-200">
                لا تحفظ نهائياً (تفريغ كامل)
              </span>
            </div>
            <h3 className="font-black text-sm text-zinc-900">السجلات والعمليات المؤقتة</h3>
            <p className="text-xs text-zinc-500 mt-1">
              سجلات تتبع النظام (Audit Logs)، محاولات تسجيل الدخول، الأحداث المؤقتة، والجلسات المنتهية لا تحفظ نهائياً وتفرغ بالكامل لمنع استهلاك مساحة قاعدة البيانات بالعمليات المؤقتة.
            </p>
          </div>

          <div className="mt-6 pt-4 border-t border-zinc-100 flex items-center justify-between text-xs">
            <div>
              <span className="text-zinc-400 block text-[11px]">سجلات تتبع النظام الحالية</span>
              <strong className="text-zinc-900 font-mono text-base">{status.systemLogs.auditLogsTotal}</strong>
            </div>
            <div className="text-end">
              <span className="text-zinc-400 block text-[11px]">جاهزة للتفريغ الفوري</span>
              <strong className={`font-mono text-base ${status.systemLogs.auditLogsPrunable > 0 ? 'text-blue-600' : 'text-emerald-600'}`}>
                {status.systemLogs.auditLogsPrunable}
              </strong>
            </div>
          </div>
        </div>

        {/* Card 3: Core Permanent Data */}
        <div className="bg-white rounded-3xl border border-zinc-200 p-6 shadow-xs relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 end-0 w-24 h-24 bg-pink-50 rounded-full blur-2xl -z-10" />
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="p-2.5 rounded-2xl bg-pink-50 text-[#E6007E]">
                <ShieldCheck className="w-5 h-5" />
              </span>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-pink-100 text-[#E6007E] border border-pink-200">
                دائمة بنسبة 100%
              </span>
            </div>
            <h3 className="font-black text-sm text-zinc-900">المنتجات والتصنيفات والبيانات الرئيسية</h3>
            <p className="text-xs text-zinc-500 mt-1">
              محمية بصفة قطعية ومطلقة من أي عملية تنظيف: المنتجات، خياراتها، الأقسام، الماركات، حسابات الموظفين، وإعدادات المتجر لا تُحذف أبداً.
            </p>
          </div>

          <div className="mt-6 pt-4 border-t border-zinc-100 flex items-center justify-between text-xs">
            <div>
              <span className="text-zinc-400 block text-[11px]">إجمالي المنتجات النشطة</span>
              <strong className="text-emerald-700 font-mono text-base">{status.corePermanentData.productsCount}</strong>
            </div>
            <div className="text-end">
              <span className="text-zinc-400 block text-[11px]">الأقسام والتصنيفات</span>
              <strong className="text-zinc-900 font-mono text-base">{status.corePermanentData.categoriesCount}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Supabase Free Tier Status Box */}
      <div className="bg-emerald-50/50 rounded-3xl border border-emerald-200 p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="p-2.5 rounded-2xl bg-emerald-100 text-emerald-800 shrink-0">
              <HardDrive className="w-5 h-5" />
            </span>
            <div>
              <h4 className="font-black text-sm text-emerald-900">
                حالة حماية السعة التخزينية المجانية (Supabase Free Tier)
              </h4>
              <p className="text-xs text-emerald-800 mt-0.5">
                {status.supabaseFreeTierSafety.statusMessage} الحد الأقصى المسموح: {status.supabaseFreeTierSafety.tierLimitMb} ميغابايت.
              </p>
            </div>
          </div>

          {status.lastCleanup && (
            <div className="text-xs text-emerald-900 bg-white/80 px-4 py-2 rounded-xl border border-emerald-200 shrink-0 font-medium">
              <span>آخر دورة تنظيف: </span>
              <strong className="font-mono">
                {new Date(status.lastCleanup.executedAt || '').toLocaleDateString('ar-JO')}
              </strong>
              <span> • تم تفريغ {status.lastCleanup.totalDeleted} سجل</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
