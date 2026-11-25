import React from 'react';
import { requireAuth } from '@/lib/dal';
import { AdminSidebar } from '@/components/AdminSidebar';
import { getSystemHealthOverviewAction } from '@/actions/system-health';
import { getBackupSystemStatusAction } from '@/actions/backup';
import { getDataRetentionStatusAction } from '@/actions/data-retention';
import { UnifiedSystemClient } from './UnifiedSystemClient';

export const dynamic = 'force-dynamic';

export default async function AdminSystemUnifiedPage({
  searchParams
}: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  const session = await requireAuth();
  const sp = searchParams ? await searchParams : {};
  const currentTab = typeof sp.tab === 'string' ? sp.tab : 'health';

  const [healthData, backupData, retentionData] = await Promise.all([
    getSystemHealthOverviewAction(),
    getBackupSystemStatusAction(),
    getDataRetentionStatusAction()
  ]);

  return (
    <div className="flex flex-col md:flex-row h-screen bg-[#FAF8F5] overflow-hidden" dir="rtl">
      <AdminSidebar
        employeeName={session.employee.name}
        roleName={session?.employee?.role?.name || 'ADMIN'}
      />
      <main className="flex-1 overflow-y-auto p-4 md:p-8 font-sans w-full max-w-full">
        <UnifiedSystemClient
          initialTab={currentTab}
          healthData={healthData}
          backupData={backupData}
          retentionData={retentionData}
        />
      </main>
    </div>
  );
}
