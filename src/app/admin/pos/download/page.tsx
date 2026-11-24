import React from 'react';
import fs from 'fs';
import path from 'path';
import { Metadata } from 'next';
import { requireAuth } from '@/lib/dal';
import { AdminSidebar } from '@/components/AdminSidebar';
import AdminPOSDownloadClient from './AdminPOSDownloadClient';

export const metadata: Metadata = {
  title: 'تحميل برنامج كاشير غزل (EXE & SQL) | إدارة النظام',
  description: 'تحميل حزمة كاشير غزل المتكاملة لسطح المكتب ومخطط قواعد البيانات لفرع عين الباشا.',
};

function formatBytes(bytes: number, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export default async function AdminPOSDownloadPage() {
  const session = await requireAuth();

  const zipPath = path.join(process.cwd(), 'public', 'downloads', 'GHAZAL-POS-Setup.zip');
  const sqlPath = path.join(process.cwd(), 'public', 'downloads', 'ghazal-database-schema.sql');
  const batPath = path.join(process.cwd(), 'تشغيل برنامج الكاشير - GHAZAL POS.bat');

  const zipExists = fs.existsSync(zipPath);
  const zipStat = zipExists ? fs.statSync(zipPath) : null;

  const sqlExists = fs.existsSync(sqlPath);
  const sqlStat = sqlExists ? fs.statSync(sqlPath) : null;

  const batExists = fs.existsSync(batPath);
  const batStat = batExists ? fs.statSync(batPath) : null;

  const zipInfo = {
    name: 'GHAZAL-POS-Setup.zip',
    sizeFormatted: zipStat ? formatBytes(zipStat.size) : '~115 MB',
    exists: zipExists,
    lastModified: zipStat ? zipStat.mtime.toLocaleDateString('ar-JO') : undefined,
  };

  const sqlInfo = {
    name: 'ghazal-database-schema.sql',
    sizeFormatted: sqlStat ? formatBytes(sqlStat.size) : '~64 KB',
    exists: sqlExists,
    lastModified: sqlStat ? sqlStat.mtime.toLocaleDateString('ar-JO') : undefined,
  };

  const batInfo = {
    name: 'تشغيل برنامج الكاشير - GHAZAL POS.bat',
    sizeFormatted: batStat ? formatBytes(batStat.size) : '< 1 KB',
    exists: batExists,
    lastModified: batStat ? batStat.mtime.toLocaleDateString('ar-JO') : undefined,
  };

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-[var(--color-ivory-100)] overflow-hidden" dir="rtl">
      <AdminSidebar employeeName={session.employee.name} roleName={session?.employee?.role?.name || 'ADMIN'} />
      <main className="flex-1 overflow-y-auto w-full max-w-full">
        <AdminPOSDownloadClient zipFile={zipInfo} sqlFile={sqlInfo} batFile={batInfo} />
      </main>
    </div>
  );
}
