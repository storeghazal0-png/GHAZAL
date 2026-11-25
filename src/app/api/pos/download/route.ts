import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// GitHub Release asset URL (115MB GHAZAL POS Setup bundle)
const GITHUB_RELEASE_ZIP_URL = 'https://github.com/storeghazal0-png/GHAZAL/releases/download/v1.0.0/GHAZAL-POS-Setup.zip';
const GITHUB_RAW_SQL_URL = 'https://raw.githubusercontent.com/storeghazal0-png/GHAZAL/main/public/downloads/ghazal-database-schema.sql';
const GITHUB_RAW_BAT_URL = 'https://raw.githubusercontent.com/storeghazal0-png/GHAZAL/main/public/downloads/run-pos.bat';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const fileType = searchParams.get('file') || 'zip';

    // 1. ZIP File download (115MB Bundle)
    if (fileType === 'zip') {
      const zipUrl = process.env.POS_ZIP_DOWNLOAD_URL || GITHUB_RELEASE_ZIP_URL;
      // Redirect to high-speed CDN to avoid Netlify 50MB serverless limit and guarantee instant downloads
      return NextResponse.redirect(zipUrl, 302);
    }

    // 2. SQL Schema download
    if (fileType === 'sql') {
      const localSqlPath = path.join(process.cwd(), 'public', 'downloads', 'ghazal-database-schema.sql');
      if (fs.existsSync(localSqlPath)) {
        const fileContent = fs.readFileSync(localSqlPath, 'utf8');
        return new NextResponse(fileContent, {
          status: 200,
          headers: {
            'Content-Type': 'application/sql; charset=utf-8',
            'Content-Disposition': 'attachment; filename="ghazal-database-schema.sql"',
            'Cache-Control': 'public, max-age=3600',
          },
        });
      }
      return NextResponse.redirect(GITHUB_RAW_SQL_URL, 302);
    }

    // 3. BAT File download
    if (fileType === 'bat') {
      const possiblePaths = [
        path.join(process.cwd(), 'public', 'downloads', 'تشغيل برنامج الكاشير - GHAZAL POS.bat'),
        path.join(process.cwd(), 'public', 'downloads', 'run-pos.bat'),
        path.join(process.cwd(), 'تشغيل برنامج الكاشير - GHAZAL POS.bat'),
      ];
      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          const fileContent = fs.readFileSync(p, 'utf8');
          const fileName = 'تشغيل برنامج الكاشير - GHAZAL POS.bat';
          return new NextResponse(fileContent, {
            status: 200,
            headers: {
              'Content-Type': 'text/plain; charset=utf-8',
              'Content-Disposition': `attachment; filename="${fileName.replace(/[^\x00-\x7F]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
              'Cache-Control': 'public, max-age=3600',
            },
          });
        }
      }
      return NextResponse.redirect(GITHUB_RAW_BAT_URL, 302);
    }

    return new NextResponse('نوع الملف غير معروف', { status: 400 });
  } catch (error) {
    console.error('Download error:', error);
    return new NextResponse('حدث خطأ أثناء تنزيل الملف', { status: 500 });
  }
}
