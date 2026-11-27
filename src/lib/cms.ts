import { prisma } from './db';

interface CachedItem {
  value: any;
  expiresAt: number;
}

const inMemoryCMS: Record<string, CachedItem> = (globalThis as any).__ghazal_cms_store || {};
(globalThis as any).__ghazal_cms_store = inMemoryCMS;

const CMS_CACHE_TTL_MS = 60_000; // 60 seconds memory TTL

export async function getCMSContent(key: string, defaultValue: any) {
  const now = Date.now();
  const cached = inMemoryCMS[key];
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  try {
    const setting = await prisma.siteSettings.findUnique({
      where: { key }
    });
    if (setting) {
      let parsed = setting.value;
      try {
        parsed = JSON.parse(setting.value);
      } catch {}
      inMemoryCMS[key] = { value: parsed, expiresAt: now + CMS_CACHE_TTL_MS };
      return parsed;
    }

    // Migrate the legacy in-code value to the database once.
    const seeded = await prisma.siteSettings.create({
      data: { key, value: JSON.stringify(defaultValue) }
    });
    const parsed = JSON.parse(seeded.value);
    inMemoryCMS[key] = { value: parsed, expiresAt: now + CMS_CACHE_TTL_MS };
    return parsed;
  } catch (e) {}

  if (cached) {
    return cached.value;
  }
  return defaultValue;
}

export async function updateCMSContent(key: string, value: any) {
  inMemoryCMS[key] = { value, expiresAt: Date.now() + CMS_CACHE_TTL_MS };
  try {
    return await prisma.siteSettings.upsert({
      where: { key },
      update: { value: JSON.stringify(value) },
      create: { key, value: JSON.stringify(value) }
    });
  } catch (e) {
    return { key, value: JSON.stringify(value) };
  }
}
