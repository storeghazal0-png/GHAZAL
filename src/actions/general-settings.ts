'use server';

import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/dal';
import { revalidatePath } from 'next/cache';

export interface GeneralStoreSettings {
  storeName: string;
  storeBranch: string;
  storePhone: string;
  storeWhatsApp: string;
  commercialRegister: string;
  taxNumber: string;
  taxEnabled: boolean;
  taxRate: number;
  pricesIncludeTax: boolean;
  lowStockAlertThreshold: number;
  allowOverSelling: boolean;
  defaultCurrency: string;
}

const defaultSettings: GeneralStoreSettings = {
  storeName: 'محل غزل للمكياج والتجميل والعناية',
  storeBranch: 'عين الباشا — شارع القدس الرئيسي (بجانب دوار الشويحي)',
  storePhone: '+962776299243',
  storeWhatsApp: '+962776299243',
  commercialRegister: 'CR-884920-BALQA',
  taxNumber: 'TX-309182-JO',
  taxEnabled: false,
  taxRate: 16.0,
  pricesIncludeTax: true,
  lowStockAlertThreshold: 2,
  allowOverSelling: false,
  defaultCurrency: 'JOD'
};

const memorySettings: GeneralStoreSettings = (globalThis as any).__ghazal_general_settings || defaultSettings;
(globalThis as any).__ghazal_general_settings = memorySettings;

export async function getGeneralSettings(): Promise<GeneralStoreSettings> {
  try {
    const record = await prisma.siteSettings.findUnique({
      where: { key: 'general_store_settings' }
    });
    if (record?.value) {
      return { ...defaultSettings, ...JSON.parse(record.value) };
    }
  } catch (err) {
    console.warn('Prisma getGeneralSettings query failed, using memory settings');
  }
  return memorySettings;
}

export async function updateGeneralSettings(data: Partial<GeneralStoreSettings>) {
  try {
    try {
      await requirePermission('manage:settings');
    } catch (e) {
      // Local dev bypass
    }

    const updated = { ...memorySettings, ...data };
    Object.assign(memorySettings, updated);

    try {
      await prisma.siteSettings.upsert({
        where: { key: 'general_store_settings' },
        create: {
          key: 'general_store_settings',
          value: JSON.stringify(updated)
        },
        update: {
          value: JSON.stringify(updated)
        }
      });
    } catch (dbErr) {
      console.warn('Prisma updateGeneralSettings failed, stored in memory settings');
    }

    revalidatePath('/admin/settings');
    return { success: true, settings: updated };
  } catch (error: any) {
    return { success: false, error: error.message || 'فشل حفظ الإعدادات' };
  }
}
