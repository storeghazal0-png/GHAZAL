'use server';

import { requirePermission, requireAuth } from '@/lib/dal';
import { createClient } from '@supabase/supabase-js';

// Dynamic safe loader for sharp to avoid missing libvips shared library errors in serverless runtimes
async function getSharp() {
  try {
    const mod = await import('sharp');
    return mod.default || mod;
  } catch {
    return null;
  }
}

const BUCKET = 'product-uploads';

// Setup Supabase admin client to bypass RLS
const getSupabaseAdmin = () => {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('Supabase env vars not configured');
  return createClient(url, key, { auth: { persistSession: false } });
};

async function ensureBucket(supabase: ReturnType<typeof getSupabaseAdmin>) {
  const { data: buckets } = await supabase.storage.listBuckets();
  if (!buckets?.find(b => b.name === BUCKET)) {
    await supabase.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: 10 * 1024 * 1024,
    });
  }
}

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
    const supabaseAdmin = getSupabaseAdmin();
    await ensureBucket(supabaseAdmin);

    const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUploadUrl(newFilename);
    if (error || !data) throw new Error(error?.message || 'فشل في إنشاء رابط الرفع');

    const { data: publicData } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(newFilename);

    return {
      success: true,
      token: data.token,
      path: data.path,
      publicUrl: publicData.publicUrl
    };
  } catch (error: any) {
    console.error('generateUploadUrl Error:', error);
    return { success: false, error: error.message || 'حدث خطأ' };
  }
}

/**
 * Server Action: upload a file directly to Supabase Storage.
 * No local filesystem writes — safe for Netlify and all serverless runtimes.
 */
export async function uploadMedia(formData: FormData): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const session = await requireAuth();
    if (
      !session.permissions?.includes('manage:products') &&
      !session.permissions?.includes('manage:settings') &&
      session.employee?.role?.name !== 'ADMIN'
    ) {
      await requirePermission('manage:products');
    }

    const file = formData.get('file') as File | null;
    if (!file) return { success: false, error: 'لم يتم العثور على أي ملف' };

    const lastDot = file.name.lastIndexOf('.');
    const ext = lastDot !== -1 ? file.name.substring(lastDot).toLowerCase() : '';
    const allowedExts = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tiff', '.mp4', '.webm', '.ogg'];
    if (!allowedExts.includes(ext)) {
      return { success: false, error: 'صيغة الملف غير مدعومة' };
    }

    const rawBuffer = Buffer.from(await file.arrayBuffer());
    const isImage = file.type.startsWith('image/') || ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tiff'].includes(ext);

    let finalBuffer = rawBuffer;
    let finalExt = ext;
    let finalContentType = file.type || 'application/octet-stream';

    // Convert to WebP for optimal size (skip GIF to preserve animation)
    if (isImage && ext !== '.gif') {
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
        console.warn('Sharp WebP conversion skipped, using original:', sharpError);
      }
    }

    const filename = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}${finalExt}`;
    const supabaseAdmin = getSupabaseAdmin();
    await ensureBucket(supabaseAdmin);

    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(filename, finalBuffer, {
        contentType: finalContentType,
        upsert: false,
        cacheControl: '31536000',
      });

    if (uploadError) {
      console.error('Supabase Storage upload error:', uploadError);
      return { success: false, error: `فشل رفع الملف: ${uploadError.message}` };
    }

    const { data: publicData } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(uploadData.path);
    return { success: true, url: publicData.publicUrl };

  } catch (error: any) {
    console.error('uploadMedia Error:', error);
    return { success: false, error: error.message || 'حدث خطأ أثناء رفع وتحويل الصورة' };
  }
}
