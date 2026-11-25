import React from 'react';
import { requireAuth, requirePermission, getEmployeePermissions } from '@/lib/dal';
import { prisma } from '@/lib/db';
import { POSCashierWorkspace } from '@/components/POSCashierWorkspace';
import { getLivePOSCatalog } from '@/actions/pos';
import { getPrintingSettings } from '@/actions/admin-pos';

export default async function POSCashierPage() {
  // 1. Authorize permission
  const session = await requirePermission('pos:access');
  const employeeId = session.employeeId;
  const activePermissions = await getEmployeePermissions(employeeId);
  const hasOrdersViewPermission = activePermissions.includes('pos.orders.view') || activePermissions.includes('manage:orders') || activePermissions.includes('pos:access');
  const hasOrdersManagePermission = activePermissions.includes('pos.orders.manage') || activePermissions.includes('manage:orders') || activePermissions.includes('pos:access');

  // 2. Fetch active cashier info
  let employee = session.employee || {
    id: employeeId,
    name: 'كاشير غزل (عين الباشا)',
    email: 'cashier@ghazal.jo',
    role: { name: 'CASHIER' }
  };

  try {
    const dbEmployee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: { role: true }
    });
    if (dbEmployee) {
      employee = dbEmployee;
    }
  } catch (err) {
    console.warn('Prisma employee lookup fallback active');
  }

  // 3. Fetch latest live synchronized POS products and authoritative printing settings from DB
  const [liveCatalogRes, printingSettings] = await Promise.all([
    getLivePOSCatalog(),
    getPrintingSettings()
  ]);
  const combinedProducts = liveCatalogRes.products || [];

  // 4. Fetch site settings
  let settingsRecords: any[] = [];
  try {
    settingsRecords = await prisma.siteSettings.findMany();
  } catch {}
  const settingsMap = new Map(settingsRecords.map(s => [s.key, s.value]));

  const taxEnabled = settingsMap.get('tax_enabled') === 'true';
  const taxRate = parseFloat(settingsMap.get('tax_rate') || '0');
  const pricesIncludeTax = settingsMap.get('prices_include_tax') !== 'false';

  // Load custom JSON-backed POS settings
  const posSettingsRecord = settingsRecords.find(s => s.key === 'pos_settings');
  let posSettings = {
    requireShiftToSell: false,
    defaultIdleLockSeconds: 60,
    allowManagerOverride: true,
    posIdleEnabled: true,
    posIdleTimeoutMinutes: 1,
    posIdleShowClock: true,
    posIdleShowDate: true,
    posIdleRequirePin: false,
    posIdleMessageAr: 'انقر للمتابعة',
    posIdleMessageEn: 'Click to continue',
    posSessionLifetimeHours: 15
  };
  if (posSettingsRecord) {
    try {
      const parsed = JSON.parse(posSettingsRecord.value);
      posSettings = {
        ...posSettings,
        ...parsed,
        requireShiftToSell: false, // Enforce sales per account without shifts
        posIdleTimeoutMinutes: 1, // Enforce 1 minute idle screensaver per user requirement
        defaultIdleLockSeconds: 60
      };
    } catch {}
  }

  // 5. Calculate absolute session expiry time based on posSessionLifetimeHours
  let userSession: any = null;
  try {
    userSession = await prisma.session.findFirst({
      where: { employeeId },
      orderBy: { createdAt: 'desc' }
    });
  } catch {}
  
  const rawDate = userSession ? userSession.createdAt : new Date();
  const sessionCreatedAt = new Date(rawDate);
  const hours = Number(posSettings?.posSessionLifetimeHours) || 15;
  const lifetimeMs = hours * 60 * 60 * 1000;
  
  let sessionExpiresAt = new Date().toISOString();
  if (sessionCreatedAt instanceof Date && !isNaN(sessionCreatedAt.getTime())) {
    try {
      const expiresDate = new Date(sessionCreatedAt.getTime() + lifetimeMs);
      if (!isNaN(expiresDate.getTime())) {
        sessionExpiresAt = expiresDate.toISOString();
      }
    } catch {}
  }

  return (
    <div className="h-full bg-[var(--color-ivory-100)]">
      <POSCashierWorkspace
        products={combinedProducts}
        settings={{
          taxEnabled,
          taxRate,
          pricesIncludeTax,
          ...posSettings
        }}
        initialPrintingSettings={printingSettings}
        cashierName={employee.name}
        sessionExpiresAt={sessionExpiresAt}
        hasOrdersViewPermission={hasOrdersViewPermission}
        hasOrdersManagePermission={hasOrdersManagePermission}
      />
    </div>
  );
}
