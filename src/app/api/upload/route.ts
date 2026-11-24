import { NextRequest, NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth';
import { getEmployeePermissions } from '@/lib/dal';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import path from 'path';
import fs from 'fs';

// Dynamic safe loader for sharp to prevent serverless function crashes when libvips is absent
async function getSharp() {
  try {
    const mod = await import('sharp');
    return mod.default || mod;
  } catch {
    return null;
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const ALLOWED_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tiff',
  '.mp4', '.webm', '.ogg', '.mov', '.m4v'
]);

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req.headers);
    const isAllowed = await checkRateLimit(ip, 'api_media_upload', 30, 10);
    if (!isAllowed) {
      return NextResponse.json({ success: false, error: 'تم تجاوز الحد المسموح به لرفع الملفات' }, { status: 429 });
    }

    // 1. Authenticate Session
    const session = await getCurrentSession();
    if (!session || !session.employee?.isActive) {
      return NextResponse.json({ success: false, error: 'غير مصرح - يرجى تسجيل الدخول أولاً' }, { status: 401 });
    }

    // 2. Authorize Permissions
    const roleName = session.employee.role?.name?.toUpperCase() || '';
    const isAdmin = roleName === 'ADMIN' || roleName === 'SUPER ADMIN';
    if (!isAdmin) {
      const perms = await getEmployeePermissions(session.employeeId);
      if (!perms.includes('manage:products') && !perms.includes('manage:settings')) {
        return NextResponse.json({ success: false, error: 'غير مصرح: تملك صلاحية إدارة المنتجات أو الإعدادات لرفع الوسائط' }, { status: 403 });
      }
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ success: false, error: 'لم يتم العثور على أي ملف' }, { status: 400 });
    }

    // 3. File Size Validation
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json({ 
        success: false, 
        error: `حجم الملف كبير جداً. الحد الأقصى المسموح هو 10 ميجابايت (الحجم الحالي: ${(file.size / (1024 * 1024)).toFixed(1)} MB)` 
      }, { status: 400 });
    }

    const ext = path.extname(file.name).toLowerCase();
    
    // Disallow SVG and executables to prevent Stored XSS and remote code execution
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json({ success: false, error: 'صيغة الملف غير مدعومة لأسباب أمنية' }, { status: 400 });
    }

    const rawBuffer = Buffer.from(await file.arrayBuffer());
    const isImage = file.type.startsWith('image/') || ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tiff'].includes(ext);

    let finalBuffer = rawBuffer;
    let finalExt = ext;

    // Convert raster images to WebP
    if (isImage && ext !== '.gif') {
      try {
        const sharpInstance = await getSharp();
        if (sharpInstance) {
          finalBuffer = await sharpInstance(rawBuffer)
            .webp({ quality: 82, effort: 4 })
            .toBuffer();
          finalExt = '.webp';
        }
      } catch (sharpError) {
        console.warn('Sharp WebP conversion skipped, using original:', sharpError);
      }
    }

    const filename = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}${finalExt}`;
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const localFilePath = path.join(uploadsDir, filename);
    fs.writeFileSync(localFilePath, finalBuffer);

    return NextResponse.json({
      success: true,
      url: `/uploads/${filename}`
    });
  } catch (error: any) {
    console.error('API Upload Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'حدث خطأ أثناء رفع الملف'
    }, { status: 500 });
  }
}
