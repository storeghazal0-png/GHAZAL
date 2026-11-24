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
  const invoicesCutoff = new Date(now.getTime() - DATA_RETENTION_CONFIG.invoicesDays * 24 * 60 * 60 * 1000);
  const systemLogsCutoff = DATA_RETENTION_CONFIG.systemLogsDays === 0 ? now : new Date(now.getTime() - DATA_RETENTION_CONFIG.systemLogsDays * 24 * 60 * 60 * 1000);

  let deletedInvoices = 0;
  let deletedLogs = 0;
  let deletedSessions = 0;

  try {
    // 1. Delete Invoices older than retention cutoff (90 days)
    try {
      const resInvoices = await prisma.invoice.deleteMany({
        where: { createdAt: { lt: invoicesCutoff } }
      });
      deletedInvoices += resInvoices.count;
    } catch (e) {
      console.warn('Invoices cleanup warning:', e);
    }

    // Also delete any suspended temporary cart sales (HeldSale) older than cutoff
    try {
      await prisma.heldSale.deleteMany({
        where: { createdAt: { lt: invoicesCutoff } }
      });
    } catch {}

    // 2. Delete Audit Logs & Events (purged completely if systemLogsDays === 0)
    try {
      const resAudit = await prisma.auditLog.deleteMany({
        where: { createdAt: { lte: systemLogsCutoff } }
      });
      deletedLogs += resAudit.count;
    } catch (e) {
      console.warn('AuditLog cleanup warning:', e);
    }

    try {
      const resRate = await prisma.rateLimitEvent.deleteMany({
        where: { createdAt: { lte: systemLogsCutoff } }
      });
      deletedLogs += resRate.count;
    } catch {}

    try {
      const resLogin = await prisma.loginAttempt.deleteMany({
        where: { createdAt: { lte: systemLogsCutoff } }
      });
      deletedLogs += resLogin.count;
    } catch {}

    try {
      const resMfa = await prisma.pendingMfaChallenge.deleteMany({
        where: { createdAt: { lte: systemLogsCutoff } }
      });
      deletedLogs += resMfa.count;
    } catch {}

    try {
      const resJobs = await prisma.importJob.deleteMany({
        where: { createdAt: { lte: systemLogsCutoff } }
      });
      deletedLogs += resJobs.count;
    } catch {}

    // 3. Delete Expired Sessions & Sessions older than cutoff
    try {
      const resSessions = await prisma.session.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: now } },
            { createdAt: { lte: systemLogsCutoff } }
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
      message: `تم تنظيف وتفريغ ${totalDeleted} سجل بنجاح (${trigger === 'MANUAL' ? 'تشغيل يدوي' : 'دورة مجدولة تلقائياً'}). الفواتير محددة بـ ${DATA_RETENTION_CONFIG.invoicesDays} يوماً، وسجلات النظام لا تحفظ نهائياً وتفرغ بالكامل، والمنتجات والبيانات الرئيسية محفوظة بالكامل ودائمة.`,
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
