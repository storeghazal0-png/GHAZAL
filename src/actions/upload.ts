'use server';

import { requirePermission, requireAuth } from '@/lib/dal';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import fs from 'fs';

// Dynamic safe loader for sharp to avoid missing libvips shared library errors in serverless runtimes
async function getSharp() {
  try {
    const mod = await import('sharp');
    return mod.default || mod;
  } catch {
    return null;
  }
}

// Setup Supabase admin client to bypass RLS and create buckets if needed
const getSupabaseAdmin = () => {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false } }
  );
};

export async function generateUploadUrl(filename: string): Promise<{ success: boolean; token?: string; path?: string; publicUrl?: string; error?: string }> {
  try {
    await requirePermission('manage:settings');

    let ext = '';
    const lastDot = filename.lastIndexOf('.');
    if (lastDot !== -1) {
      ext = filename.substring(lastDot).toLowerCase();
    }
    
    const allowedExts = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.mp4', '.webm', '.ogg'];
    if (!allowedExts.includes(ext)) {
      return { success: false, error: 'صيغة الملف غير مدعومة' };
    }

    const newFilename = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}${ext}`;
    const bucketName = 'uploads';
    const supabaseAdmin = getSupabaseAdmin();

    // Ensure bucket exists
    const { data: buckets, error: listError } = await supabaseAdmin.storage.listBuckets();
    if (listError) throw new Error('فشل جلب الحاويات: ' + listError.message);
    
    if (!buckets?.find(b => b.name === bucketName)) {
      const { error: createError } = await supabaseAdmin.storage.createBucket(bucketName, { public: true });
      if (createError) {
        throw new Error(`الرجاء إنشاء Bucket باسم '${bucketName}' من لوحة تحكم Supabase وتعيينه كـ Public. فشل الإنشاء التلقائي: ` + createError.message);
      }
    }

    // Create a signed upload URL valid for 5 minutes
    const { data, error } = await supabaseAdmin.storage.from(bucketName).createSignedUploadUrl(newFilename);

    if (error || !data) {
      throw new Error(error?.message || 'فشل في إنشاء رابط الرفع');
    }

    const { data: publicData } = supabaseAdmin.storage.from(bucketName).getPublicUrl(newFilename);

    return { 
      success: true, 
      token: data.token,
      path: data.path,
      publicUrl: publicData.publicUrl 
    };
  } catch (error: any) {
    console.error('Upload Error:', error);
    return { success: false, error: error.message || 'حدث خطأ' };
  }
}

/**
 * Handles permanent automatic conversion to .webp for all uploaded images,
 * dramatically optimizing file size, reducing bandwidth and database load.
 */
export async function uploadMedia(formData: FormData): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const session = await requireAuth();
    // Allow either manage:products or manage:settings
    if (
      !session.permissions?.includes('manage:products') &&
      !session.permissions?.includes('manage:settings') &&
      session.employee?.role?.name !== 'ADMIN'
    ) {
      await requirePermission('manage:products');
    }

    const file = formData.get('file') as File | null;
    if (!file) return { success: false, error: 'لم يتم العثور على أي ملف' };

    const ext = path.extname(file.name).toLowerCase();
    const allowedExts = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tiff', '.mp4', '.webm', '.ogg'];
    if (!allowedExts.includes(ext)) {
      return { success: false, error: 'صيغة الملف غير مدعومة' };
    }

    const rawBuffer = Buffer.from(await file.arrayBuffer());
    const isImage = file.type.startsWith('image/') || ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tiff'].includes(ext);

    let finalBuffer = rawBuffer;
    let finalExt = ext;
    let finalContentType = file.type || 'application/octet-stream';

    // Automatic permanent conversion to .webp for optimal compression and fast rendering
    if (isImage) {
      try {
        const sharpInstance = await getSharp();
        if (sharpInstance) {
          finalBuffer = await sharpInstance(rawBuffer)
            .webp({ quality: 82, effort: 4 })
            .toBuffer();
          finalExt = '.webp';
          finalContentType = 'image/webp';
        }
      } catch (sharpError) {
        console.warn('Sharp WebP conversion warning, using original buffer:', sharpError);
      }
    }

    const filename = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}${finalExt}`;

    // 1. Save to local public/uploads directory for permanent zero-latency serving
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    const localFilePath = path.join(uploadsDir, filename);
    fs.writeFileSync(localFilePath, finalBuffer);
    const localUrl = `/uploads/${filename}`;

    // 2. Mirror to Supabase storage if reachable
    try {
      const bucketName = 'uploads';
      const supabaseAdmin = getSupabaseAdmin();
      const { data: buckets } = await supabaseAdmin.storage.listBuckets();
      if (buckets?.find(b => b.name === bucketName)) {
        const { error: uploadError } = await supabaseAdmin.storage.from(bucketName).upload(filename, finalBuffer, {
          contentType: finalContentType,
          upsert: true
        });
        if (!uploadError) {
          const { data: publicData } = supabaseAdmin.storage.from(bucketName).getPublicUrl(filename);
          if (publicData?.publicUrl && !publicData.publicUrl.includes('placeholder')) {
            return { success: true, url: publicData.publicUrl };
          }
        }
      }
    } catch {
      // Fallback to local URL cleanly
    }

    return { success: true, url: localUrl };
  } catch (error: any) {
    console.error('Upload Error:', error);
    return { success: false, error: error.message || 'حدث خطأ أثناء رفع وتحويل الصورة' };
  }
}
