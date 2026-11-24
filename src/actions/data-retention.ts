'use server';

import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/dal';
import { revalidatePath } from 'next/cache';
import { DATA_RETENTION_CONFIG } from '@/lib/data-retention-config';
import { performDataRetentionCleanup } from '@/lib/data-retention';

export interface DataRetentionStatus {
  invoices: {
    total: number;
    olderThan90Days: number;
    olderThan30Days: number;
    retentionDays: number;
  };
  systemLogs: {
    auditLogsTotal: number;
    auditLogsOlderThan90Days: number;
    auditLogsPrunable: number;
    rateLimitEventsTotal: number;
    rateLimitEventsOlderThan90Days: number;
    rateLimitEventsPrunable: number;
    expiredSessionsTotal: number;
    retentionDays: number;
  };
  corePermanentData: {
    productsCount: number;
    categoriesCount: number;
    brandsCount: number;
    status: 'PERMANENT';
  };
  lastCleanup: {
    executedAt: string | null;
    trigger?: string;
    deletedInvoicesCount: number;
    deletedLogsCount: number;
    deletedSessionsCount: number;
    totalDeleted: number;
  } | null;
  supabaseFreeTierSafety: {
    isSafe: boolean;
    tierLimitMb: number;
    statusMessage: string;
  };
  automatedSchedule: {
    enabled: boolean;
    frequency: string;
    description: string;
  };
}

/**
 * فحص حالة تخزين قاعدة البيانات وسجلات الاحتفاظ وحساب العناصر المؤهلة للتنظيف
 */
export async function getDataRetentionStatusAction(): Promise<DataRetentionStatus> {
  const now = new Date();
  const invoicesCutoff = new Date(now.getTime() - DATA_RETENTION_CONFIG.invoicesDays * 24 * 60 * 60 * 1000);
  const systemLogsCutoff = DATA_RETENTION_CONFIG.systemLogsDays === 0 ? now : new Date(now.getTime() - DATA_RETENTION_CONFIG.systemLogsDays * 24 * 60 * 60 * 1000);

  let invoicesTotal = 0;
  let invoicesOlderThanCutoff = 0;
  let auditLogsTotal = 0;
  let auditLogsPrunable = 0;
  let rateLimitEventsTotal = 0;
  let rateLimitEventsPrunable = 0;
  let expiredSessionsTotal = 0;
  let productsCount = 0;
  let categoriesCount = 0;
  let brandsCount = 0;
  let lastCleanup: any = null;

  try {
    // 1. Invoices metrics (90 days limit)
    try {
      [invoicesTotal, invoicesOlderThanCutoff] = await Promise.all([
        prisma.invoice.count(),
        prisma.invoice.count({ where: { createdAt: { lt: invoicesCutoff } } })
      ]);
    } catch {}

    // 2. System logs metrics (0 days / no retention, purged completely)
    try {
      auditLogsTotal = await prisma.auditLog.count();
      auditLogsPrunable = DATA_RETENTION_CONFIG.systemLogsDays === 0
        ? auditLogsTotal
        : await prisma.auditLog.count({ where: { createdAt: { lte: systemLogsCutoff } } });
    } catch {}

    try {
      rateLimitEventsTotal = await prisma.rateLimitEvent.count();
      rateLimitEventsPrunable = DATA_RETENTION_CONFIG.systemLogsDays === 0
        ? rateLimitEventsTotal
        : await prisma.rateLimitEvent.count({ where: { createdAt: { lte: systemLogsCutoff } } });
    } catch {}

    try {
      expiredSessionsTotal = await prisma.session.count({
        where: {
          OR: [
            { expiresAt: { lt: now } },
            { createdAt: { lte: systemLogsCutoff } }
          ]
        }
      });
    } catch {}

    // 3. Core Permanent Data metrics
    try {
      [productsCount, categoriesCount, brandsCount] = await Promise.all([
        prisma.product.count(),
        prisma.category.count(),
        prisma.brand.count()
      ]);
    } catch {}

    // 4. Retrieve last cleanup run recorded in siteSettings
    try {
      const setting = await prisma.siteSettings.findUnique({
        where: { key: 'data_retention_last_cleanup' }
      });
      if (setting?.value) {
        lastCleanup = JSON.parse(setting.value);
      }
    } catch {}
  } catch (err) {
    console.warn('Error reading data retention status:', err);
  }

  const totalPrunable = invoicesOlderThanCutoff + auditLogsPrunable + rateLimitEventsPrunable + expiredSessionsTotal;

  return {
    invoices: {
      total: invoicesTotal,
      olderThan90Days: invoicesOlderThanCutoff,
      olderThan30Days: invoicesOlderThanCutoff,
      retentionDays: DATA_RETENTION_CONFIG.invoicesDays
    },
    systemLogs: {
      auditLogsTotal,
      auditLogsOlderThan90Days: auditLogsPrunable,
      auditLogsPrunable,
      rateLimitEventsTotal,
      rateLimitEventsOlderThan90Days: rateLimitEventsPrunable,
      rateLimitEventsPrunable,
      expiredSessionsTotal,
      retentionDays: DATA_RETENTION_CONFIG.systemLogsDays
    },
    corePermanentData: {
      productsCount,
      categoriesCount,
      brandsCount,
      status: 'PERMANENT'
    },
    lastCleanup,
    supabaseFreeTierSafety: {
      isSafe: true,
      tierLimitMb: 500, // Supabase Free Tier 500 MB
      statusMessage: totalPrunable > 0 
        ? `يوجد ${totalPrunable} سجل مؤقت مجدول للتفريغ تلقائياً أسبوعياً للحفاظ على مساحة الخطة المجانية.`
        : 'قاعدة البيانات نظيفة ومحسنة تماماً ومطابقة لسياسة الـ 90 يوماً للفواتير وعدم حفظ سجلات النظام.'
    },
    automatedSchedule: {
      enabled: true,
      frequency: 'أسبوعياً كل يوم أحد الساعة 02:00 فجراً (توقيت عمّان)',
      description: 'تشغيل دوري مؤتمت عبر GitHub Actions و Vercel Cron يقوم بحذف السجلات المنتهية بدون تدخل بشري.'
    }
  };
}

/**
 * إجراء المشرف لتشغيل دورة تنظيف وحفظ المساحة يدوياً مع فحص صلاحيات الإدارة
 */
export async function executeDataRetentionCleanupAction(): Promise<{
  success: boolean;
  message: string;
  deletedInvoices: number;
  deletedLogs: number;
  deletedSessions: number;
  totalDeleted: number;
  timestamp: string;
}> {
  await requirePermission('manage:settings');
  const result = await performDataRetentionCleanup({ trigger: 'MANUAL' });

  try {
    revalidatePath('/admin');
    revalidatePath('/admin/settlements');
    revalidatePath('/admin/system/retention');
  } catch {}

  return result;
}
