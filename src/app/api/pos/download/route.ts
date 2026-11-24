import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const fileType = searchParams.get('file') || 'zip';

    let fileName = 'GHAZAL-POS-Setup.zip';
    let contentType = 'application/zip';
    let targetPath = path.join(process.cwd(), 'public', 'downloads', 'GHAZAL-POS-Setup.zip');

    if (fileType === 'sql') {
      fileName = 'ghazal-database-schema.sql';
      contentType = 'application/sql';
      targetPath = path.join(process.cwd(), 'public', 'downloads', 'ghazal-database-schema.sql');
    } else if (fileType === 'bat') {
      fileName = 'تشغيل برنامج الكاشير - GHAZAL POS.bat';
      contentType = 'text/plain; charset=utf-8';
      targetPath = path.join(process.cwd(), 'تشغيل برنامج الكاشير - GHAZAL POS.bat');
    }

    if (!fs.existsSync(targetPath)) {
      if (fileType === 'zip' && process.env.POS_ZIP_DOWNLOAD_URL) {
        return NextResponse.redirect(process.env.POS_ZIP_DOWNLOAD_URL, 307);
      }
      return new NextResponse('الملف غير متوفر حالياً على هذا الخادم، يرجى التواصل مع المسؤول أو مراجعة متغير POS_ZIP_DOWNLOAD_URL.', { status: 404 });
    }

    const stat = fs.statSync(targetPath);
    const fileStream = fs.createReadStream(targetPath);

    // Convert node read stream to Web ReadableStream
    const readableStream = new ReadableStream({
      start(controller) {
        fileStream.on('data', (chunk) => controller.enqueue(chunk));
        fileStream.on('end', () => controller.close());
        fileStream.on('error', (err) => controller.error(err));
      },
    });

    return new NextResponse(readableStream, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${fileName.replace(/[^\x00-\x7F]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        'Content-Length': stat.size.toString(),
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    console.error('Download error:', error);
    return new NextResponse('حدث خطأ أثناء تنزيل الملف', { status: 500 });
  }
}
