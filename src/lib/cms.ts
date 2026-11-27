import { prisma } from './db';

const inMemoryCMS: Record<string, any> = (globalThis as any).__ghazal_cms_store || {};
(globalThis as any).__ghazal_cms_store = inMemoryCMS;

export async function getCMSContent(key: string, defaultValue: any) {
  try {
    const setting = await prisma.siteSettings.findUnique({
      where: { key }
    });
    if (setting) {
      try {
        return JSON.parse(setting.value);
      } catch {
        return setting.value;
      }
    }

    // Migrate the legacy in-code value to the database once. After this
    // first read, the database is the source of truth for the CMS field.
    const seeded = await prisma.siteSettings.create({
      data: { key, value: JSON.stringify(defaultValue) }
    });
    return JSON.parse(seeded.value);
  } catch (e) {}

  if (inMemoryCMS[key] !== undefined) {
    return inMemoryCMS[key];
  }
  return defaultValue;
}

export async function updateCMSContent(key: string, value: any) {
  inMemoryCMS[key] = value;
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
