'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { 
  Download, 
  FileArchive, 
  Database, 
  Terminal, 
  CheckCircle2, 
  Copy, 
  Check, 
  ExternalLink, 
  Monitor, 
  HardDrive, 
  ShieldCheck, 
  Printer, 
  ScanBarcode, 
  Info, 
  Layers, 
  FolderDown,
  Sparkles
} from 'lucide-react';

interface FileInfo {
  name: string;
  sizeFormatted: string;
  exists: boolean;
  lastModified?: string;
}

interface AdminPOSDownloadClientProps {
  zipFile: FileInfo;
  sqlFile: FileInfo;
  batFile: FileInfo;
}

export default function AdminPOSDownloadClient({
  zipFile,
  sqlFile,
  batFile,
}: AdminPOSDownloadClientProps) {
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  const handleCopyLink = (url: string, key: string) => {
    const fullUrl = `${window.location.origin}${url}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedLink(key);
    setTimeout(() => setCopiedLink(null), 3000);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-8 max-w-7xl mx-auto" dir="rtl">
      
      {/* Page Header */}
      <div className="bg-white rounded-2xl p-6 sm:p-8 border border-zinc-200/80 shadow-xs relative overflow-hidden">
        <div className="absolute top-0 left-0 w-96 h-96 bg-rose-500/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>نظام كاشير غزل المستقل (GHAZAL POS) • الإصدار الرسمي v1.0</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-zinc-900 tracking-tight font-heading">
              حزمة برنامج الكاشير وملفات التشغيل (EXE & SQL)
            </h1>
            <p className="text-sm text-zinc-600 max-w-2xl leading-relaxed">
              تحميل حزمة التثبيت المتكاملة لنقاط البيع في الفرع: تشمل تطبيق سطح المكتب (Windows EXE)، مخطط قواعد البيانات (SQL)، وملف التشغيل السريع (.bat) لتشغيل الكاشير المستقل وربطه بالمتجر.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/pos/cashier"
              target="_blank"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-xs sm:text-sm font-bold transition border border-zinc-200"
            >
              <Monitor className="w-4 h-4 text-rose-600" />
              <span>فتح كاشير الويب مباشرة</span>
              <ExternalLink className="w-3 h-3 text-zinc-400" />
            </Link>
          </div>
        </div>
      </div>

      {/* Main Download Hero Card */}
      <div className="bg-gradient-to-br from-zinc-900 via-zinc-900 to-rose-950 text-white rounded-3xl p-6 sm:p-10 border border-zinc-800 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-rose-600/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-8">
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-rose-400 shadow-inner">
                <FileArchive className="w-8 h-8" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xl sm:text-2xl font-bold text-white">GHAZAL-POS-Setup.zip</h3>
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold">
                    حزمة متكاملة جاهزة
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-zinc-300 font-mono mt-1">
                  Windows 10 / 11 (64-bit) • الحجم: {zipFile.sizeFormatted} • فك ضغط وتشغيل مباشر
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs text-zinc-300">
              <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>تطبيق سطح المكتب GHAZAL POS.exe</span>
              </div>
              <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>مخطط الجداول وقواعد البيانات ghazal-database-schema.sql</span>
              </div>
              <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>مكتبات التشغيل والطباعة ودعم الباركود</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row lg:flex-col gap-3 shrink-0">
            <a
              href="/api/pos/download?file=zip"
              download="GHAZAL-POS-Setup.zip"
              className="px-8 py-4 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white font-extrabold rounded-2xl transition shadow-lg shadow-rose-900/40 flex items-center justify-center gap-3 text-base active:scale-98"
            >
              <Download className="w-5 h-5 animate-bounce" />
              <span>تحميل الحزمة الكاملة (ZIP)</span>
            </a>

            <button
              onClick={() => handleCopyLink('/api/pos/download?file=zip', 'zip')}
              className="px-4 py-2.5 bg-white/10 hover:bg-white/15 text-zinc-200 hover:text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 border border-white/10 cursor-pointer"
            >
              {copiedLink === 'zip' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">تم نسخ رابط التحميل</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-zinc-400" />
                  <span>نسخ رابط التحميل المباشر</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Quick Individual Files Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-zinc-900">الملفات الفردية والمخططات (Individual Assets)</h2>
            <p className="text-xs text-zinc-500">يمكنك تحميل أي ملف منفصل حسب الحاجة دون إعادة تنزيل الحزمة الكاملة:</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          
          {/* SQL Schema Card */}
          <div className="bg-white border border-zinc-200/90 rounded-2xl p-6 shadow-xs hover:border-rose-300 transition-all flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center">
                  <Database className="w-6 h-6" />
                </div>
                <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold">
                  SQL Database DDL
                </span>
              </div>
              <div>
                <h3 className="text-base font-bold text-zinc-900 font-mono">ghazal-database-schema.sql</h3>
                <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                  مخطط قواعد البيانات المتطابق مع الإنتاج: يشمل الـ 45 جدولاً كاملة، العلاقات، الفهارس، ومفاتيح الربط لنظام الكاشير والمزامنة.
                </p>
                <div className="text-xs text-zinc-400 mt-2 font-mono">
                  الحجم: {sqlFile.sizeFormatted} • متوافق مع PostgreSQL 15 & 16
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-zinc-100">
              <a
                href="/api/pos/download?file=sql"
                download="ghazal-database-schema.sql"
                className="flex-1 px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-xs"
              >
                <Download className="w-4 h-4" />
                <span>تحميل ملف SQL</span>
              </a>
              <button
                onClick={() => handleCopyLink('/api/pos/download?file=sql', 'sql')}
                title="نسخ الرابط"
                className="p-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl transition cursor-pointer"
              >
                {copiedLink === 'sql' ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Launcher Bat Card */}
          <div className="bg-white border border-zinc-200/90 rounded-2xl p-6 shadow-xs hover:border-rose-300 transition-all flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center">
                  <Terminal className="w-6 h-6" />
                </div>
                <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-xs font-semibold">
                  Batch Script (.bat)
                </span>
              </div>
              <div>
                <h3 className="text-base font-bold text-zinc-900 font-mono">تشغيل برنامج الكاشير - GHAZAL POS.bat</h3>
                <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                  ملف أوامر دفعية مخصص لأجهزة الكاشير: يقوم بتشغيل البرنامج تلقائياً والتحقق من سلامة الملفات وتشغيل الواجهة بنقرة واحدة.
                </p>
                <div className="text-xs text-zinc-400 mt-2 font-mono">
                  الحجم: {batFile.sizeFormatted} • تشغيل فوري بدون إعدادات
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-zinc-100">
              <a
                href="/api/pos/download?file=bat"
                download="تشغيل برنامج الكاشير - GHAZAL POS.bat"
                className="flex-1 px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-xs"
              >
                <Download className="w-4 h-4" />
                <span>تحميل ملف التشغيل (.bat)</span>
              </a>
              <button
                onClick={() => handleCopyLink('/api/pos/download?file=bat', 'bat')}
                title="نسخ الرابط"
                className="p-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl transition cursor-pointer"
              >
                {copiedLink === 'bat' ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* Package Contents Breakdown */}
      <div className="bg-white border border-zinc-200/90 rounded-2xl p-6 sm:p-8 shadow-xs space-y-6">
        <div>
          <h2 className="text-lg font-bold text-zinc-900">محتويات الحزمة بالتفصيل (Package Contents)</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            عند فك ضغط ملف `GHAZAL-POS-Setup.zip` على جهاز الكاشير في المحل، ستجد هذه المكونات مجهزة تلقائياً:
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50/70 text-zinc-700 font-bold">
                <th className="py-3 px-4">الملف / المجلد</th>
                <th className="py-3 px-4">النوع</th>
                <th className="py-3 px-4">الوظيفة والمسؤولية</th>
                <th className="py-3 px-4">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 font-mono text-zinc-600">
              <tr>
                <td className="py-3 px-4 font-bold text-zinc-900">GHAZAL POS.exe</td>
                <td className="py-3 px-4 text-zinc-500 font-sans">تطبيق تنفيذي</td>
                <td className="py-3 px-4 font-sans text-zinc-700">تطبيق سطح المكتب الأساسي بنظام Electron للتعامل مع المبيعات وشاشات اللمس</td>
                <td className="py-3 px-4"><span className="text-emerald-600 font-bold font-sans">جاهز ومضمن</span></td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-bold text-zinc-900">تشغيل برنامج الكاشير - GHAZAL POS.bat</td>
                <td className="py-3 px-4 text-zinc-500 font-sans">أمر تشغيل دفعي</td>
                <td className="py-3 px-4 font-sans text-zinc-700">مفتاح التشغيل السريع للكاشير واكتشاف مسارات التطبيق آلياً</td>
                <td className="py-3 px-4"><span className="text-emerald-600 font-bold font-sans">جاهز ومضمن</span></td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-bold text-zinc-900">ghazal-database-schema.sql</td>
                <td className="py-3 px-4 text-zinc-500 font-sans">مخطط SQL</td>
                <td className="py-3 px-4 font-sans text-zinc-700">هيكل الجداول الـ 45 لقواعد البيانات المركزية والمحلية ومزامنة الفواتير</td>
                <td className="py-3 px-4"><span className="text-emerald-600 font-bold font-sans">جاهز ومضمن</span></td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-bold text-zinc-900">resources/app.asar</td>
                <td className="py-3 px-4 text-zinc-500 font-sans">حزمة برمجية</td>
                <td className="py-3 px-4 font-sans text-zinc-700">شفرة تشغيل الكاشير المجمعة، محرك الطباعة الحرارية، ومزامنة الباركود</td>
                <td className="py-3 px-4"><span className="text-emerald-600 font-bold font-sans">جاهز ومضمن</span></td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-bold text-zinc-900">ffmpeg.dll, libEGL.dll, etc.</td>
                <td className="py-3 px-4 text-zinc-500 font-sans">مكتبات تشغيل</td>
                <td className="py-3 px-4 font-sans text-zinc-700">تسريع الرسوميات، قراءة الكاميرا لمسح الباركود، ودعم تشغيل النوافذ</td>
                <td className="py-3 px-4"><span className="text-emerald-600 font-bold font-sans">جاهز ومضمن</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Step by Step Setup Guide */}
      <div className="bg-white border border-zinc-200/90 rounded-2xl p-6 sm:p-8 shadow-xs space-y-6">
        <div>
          <h2 className="text-lg font-bold text-zinc-900">خطوات تثبيت وتشغيل الكاشير لأول مرة في المحل</h2>
          <p className="text-xs text-zinc-500 mt-0.5">اتبع هذه الخطوات البسيطة على جهاز كمبيوتر الكاشير:</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-zinc-50 border border-zinc-200/80 rounded-2xl p-5 space-y-2">
            <div className="w-8 h-8 rounded-full bg-rose-600 text-white font-bold flex items-center justify-center text-sm">
              1
            </div>
            <h4 className="font-bold text-zinc-900 text-sm">تحميل وفك الضغط</h4>
            <p className="text-xs text-zinc-600 leading-relaxed">
              قم بتحميل ملف `GHAZAL-POS-Setup.zip` من هذه الصفحة، ثم فك ضغطه داخل مجلد ثابت (مثل: `C:\GHAZAL-POS`).
            </p>
          </div>

          <div className="bg-zinc-50 border border-zinc-200/80 rounded-2xl p-5 space-y-2">
            <div className="w-8 h-8 rounded-full bg-rose-600 text-white font-bold flex items-center justify-center text-sm">
              2
            </div>
            <h4 className="font-bold text-zinc-900 text-sm">تشغيل البرنامج</h4>
            <p className="text-xs text-zinc-600 leading-relaxed">
              انقر نقراً مزدوجاً على ملف `تشغيل برنامج الكاشير - GHAZAL POS.bat` أو `GHAZAL POS.exe` لفتح شاشة الكاشير.
            </p>
          </div>

          <div className="bg-zinc-50 border border-zinc-200/80 rounded-2xl p-5 space-y-2">
            <div className="w-8 h-8 rounded-full bg-rose-600 text-white font-bold flex items-center justify-center text-sm">
              3
            </div>
            <h4 className="font-bold text-zinc-900 text-sm">تسجيل الدخول بالـ PIN</h4>
            <p className="text-xs text-zinc-600 leading-relaxed">
              يقوم موظف الكاشير بإدخال رمز الـ PIN المخصص له في لوحة التحكم لبدء الوردية واستلام الصندوق.
            </p>
          </div>

          <div className="bg-zinc-50 border border-zinc-200/80 rounded-2xl p-5 space-y-2">
            <div className="w-8 h-8 rounded-full bg-rose-600 text-white font-bold flex items-center justify-center text-sm">
              4
            </div>
            <h4 className="font-bold text-zinc-900 text-sm">توصيل الطابعة وقارئ الباركود</h4>
            <p className="text-xs text-zinc-600 leading-relaxed">
              وصّل قارئ الباركود USB وطابعة الإيصالات 80mm؛ النظام يتعرف عليها تلقائياً دون الحاجة لتعريفات معقدة.
            </p>
          </div>
        </div>
      </div>

    </div>
  );
}
