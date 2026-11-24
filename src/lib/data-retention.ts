import { prisma } from './db';
import { DATA_RETENTION_CONFIG } from './data-retention-config';

export interface DataRetentionCleanupResult {
  success: boolean;
  message: string;
  deletedInvoices: number;
  deletedLogs: number;
  deletedSessions: number;
  totalDeleted: number;
  timestamp: string;
  trigger: string;
}

/**
 * المحرك المركزي المستقل لتنفيذ دورة تنظيف وحفظ مساحة البيانات (Supabase Free Tier)
 * يمكن استدعاؤه برمجياً من سطر الأوامر (CLI/Scripts)، عبر GitHub Actions، Vercel Cron، أو لوحة الإدارة.
 */
export async function performDataRetentionCleanup(options: { trigger?: string } = {}): Promise<DataRetentionCleanupResult> {
  const trigger = options.trigger || 'AUTOMATED';
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - DATA_RETENTION_CONFIG.invoicesDays * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(now.getTime() - DATA_RETENTION_CONFIG.systemLogsDays * 24 * 60 * 60 * 1000);

  let deletedInvoices = 0;
  let deletedLogs = 0;
  let deletedSessions = 0;

  try {
    // 1. Delete Invoices older than 30 days
    try {
      const resInvoices = await prisma.invoice.deleteMany({
        where: { createdAt: { lt: thirtyDaysAgo } }
      });
      deletedInvoices += resInvoices.count;
    } catch (e) {
      console.warn('Invoices cleanup warning:', e);
    }

    // Also delete any suspended temporary cart sales (HeldSale) older than 30 days
    try {
      await prisma.heldSale.deleteMany({
        where: { createdAt: { lt: thirtyDaysAgo } }
      });
    } catch {}

    // 2. Delete Audit Logs & Events older than 90 days
    try {
      const resAudit = await prisma.auditLog.deleteMany({
        where: { createdAt: { lt: ninetyDaysAgo } }
      });
      deletedLogs += resAudit.count;
    } catch (e) {
      console.warn('AuditLog cleanup warning:', e);
    }

    try {
      const resRate = await prisma.rateLimitEvent.deleteMany({
        where: { createdAt: { lt: ninetyDaysAgo } }
      });
      deletedLogs += resRate.count;
    } catch {}

    try {
      const resLogin = await prisma.loginAttempt.deleteMany({
        where: { createdAt: { lt: ninetyDaysAgo } }
      });
      deletedLogs += resLogin.count;
    } catch {}

    try {
      const resMfa = await prisma.pendingMfaChallenge.deleteMany({
        where: { createdAt: { lt: ninetyDaysAgo } }
      });
      deletedLogs += resMfa.count;
    } catch {}

    try {
      const resJobs = await prisma.importJob.deleteMany({
        where: { createdAt: { lt: ninetyDaysAgo } }
      });
      deletedLogs += resJobs.count;
    } catch {}

    // 3. Delete Expired Sessions & Sessions older than 90 days
    try {
      const resSessions = await prisma.session.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: now } },
            { createdAt: { lt: ninetyDaysAgo } }
          ]
        }
      });
      deletedSessions += resSessions.count;
    } catch (e) {
      console.warn('Sessions cleanup warning:', e);
    }

    const totalDeleted = deletedInvoices + deletedLogs + deletedSessions;
    const cleanupRecord = {
      executedAt: now.toISOString(),
      trigger,
      deletedInvoicesCount: deletedInvoices,
      deletedLogsCount: deletedLogs,
      deletedSessionsCount: deletedSessions,
      totalDeleted
    };

    // Save cleanup audit record in siteSettings
    try {
      await prisma.siteSettings.upsert({
        where: { key: 'data_retention_last_cleanup' },
        update: { value: JSON.stringify(cleanupRecord) },
        create: { key: 'data_retention_last_cleanup', value: JSON.stringify(cleanupRecord) }
      });
    } catch {}

    return {
      success: true,
      message: `تم تنظيف وتفريغ ${totalDeleted} سجل بنجاح (${trigger === 'MANUAL' ? 'تشغيل يدوي' : 'دورة مجدولة تلقائياً'}). الفواتير محددة بـ 30 يوماً، والسجلات بـ 90 يوماً، والمنتجات والبيانات الرئيسية محفوظة بالكامل ودائمة.`,
      deletedInvoices,
      deletedLogs,
      deletedSessions,
      totalDeleted,
      timestamp: now.toISOString(),
      trigger
    };
  } catch (err: any) {
    console.error('Error during data retention cleanup:', err);
    return {
      success: false,
      message: err.message || 'حدث خطأ أثناء تنظيف البيانات',
      deletedInvoices,
      deletedLogs,
      deletedSessions,
      totalDeleted: 0,
      timestamp: now.toISOString(),
      trigger
    };
  }
}
