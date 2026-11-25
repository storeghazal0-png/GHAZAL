'use server';

import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/dal';
import { revalidatePath } from 'next/cache';
import { JORDAN_GOVERNORATES_SHIPPING_ZONES } from '@/lib/shipping-zones';
import { getCourierCompaniesAction } from '@/actions/settlements';

export interface ShippingZoneItem {
  id: string;
  nameAr: string;
  nameEn: string;
  fee: number; // Customer price in fils (سعر البيع للزبون)
  cost: number; // Our delivery company cost in fils (تكلفة الشحن علينا)
  estimatedDeliveryTime?: string;
  isEnabled: boolean;
}

const BASE_JORDAN_GOVERNORATES: ShippingZoneItem[] = JORDAN_GOVERNORATES_SHIPPING_ZONES.map(z => ({
  id: z.id,
  nameAr: z.nameAr,
  nameEn: z.nameEn,
  fee: z.fee ?? 2000,
  cost: z.cost ?? 2000,
  estimatedDeliveryTime: z.estimatedDeliveryTime || 'خلال 2 - 3 أيام عمل',
  isEnabled: z.isEnabled
}));

async function resolveDefaultCompanyId(): Promise<string> {
  if ((globalThis as any).__ghazal_default_courier_id) {
    return (globalThis as any).__ghazal_default_courier_id;
  }
  try {
    const companies = await getCourierCompaniesAction();
    const def = companies.find(c => c.isDefaultStoreCourier) || companies[0];
    if (def) {
      (globalThis as any).__ghazal_default_courier_id = def.id;
      return def.id;
    }
  } catch {}
  return 'comp-shibli';
}

async function getCompanyShippingRatesFromDb(): Promise<Record<string, ShippingZoneItem[]>> {
  try {
    const setting = await prisma.siteSettings.findUnique({
      where: { key: 'ghazal_company_shipping_rates' }
    });
    if (setting?.value) {
      return JSON.parse(setting.value);
    }
  } catch (err) {
    console.warn('Error reading ghazal_company_shipping_rates from DB:', err);
  }
  return {
    'comp-shibli': BASE_JORDAN_GOVERNORATES.map(z => ({ ...z, fee: 2000, cost: 2000 }))
  };
}

async function saveCompanyShippingRatesToDb(rates: Record<string, ShippingZoneItem[]>): Promise<void> {
  try {
    await prisma.siteSettings.upsert({
      where: { key: 'ghazal_company_shipping_rates' },
      update: { value: JSON.stringify(rates) },
      create: { key: 'ghazal_company_shipping_rates', value: JSON.stringify(rates) }
    });
  } catch (err) {
    console.warn('Error saving ghazal_company_shipping_rates to DB:', err);
  }
  (globalThis as any).__ghazal_company_shipping_rates = rates;
}

export async function initializeShippingZones() {
  try {
    await requirePermission('manage:settings');
    const count = await prisma.shippingZone.count();
    if (count === 0) {
      for (const gov of BASE_JORDAN_GOVERNORATES) {
        await prisma.shippingZone.create({
          data: {
            nameAr: gov.nameAr,
            nameEn: gov.nameEn,
            fee: 2000,
            cost: 2000,
            estimatedDeliveryTime: gov.estimatedDeliveryTime || 'خلال 2 - 3 أيام عمل',
            isEnabled: true
          }
        });
      }
    }
  } catch (e) {
    console.warn('initializeShippingZones error:', e);
  }
}

export async function getShippingZonesForCompany(companyId?: string): Promise<ShippingZoneItem[]> {
  const targetId = companyId || await resolveDefaultCompanyId();
  const ratesMap = await getCompanyShippingRatesFromDb();
  if (ratesMap[targetId]) {
    return ratesMap[targetId];
  }

  // Fallback to DB shippingZone table
  const dbZones = await getShippingZonesList();
  ratesMap[targetId] = dbZones;
  await saveCompanyShippingRatesToDb(ratesMap);
  return dbZones;
}

export async function getAllCompanyShippingZonesAction(): Promise<{
  defaultCompanyId: string;
  rates: Record<string, ShippingZoneItem[]>;
}> {
  const defaultCompanyId = await resolveDefaultCompanyId();
  const ratesMap = await getCompanyShippingRatesFromDb();
  return {
    defaultCompanyId,
    rates: ratesMap
  };
}

export async function getShippingZonesList(): Promise<ShippingZoneItem[]> {
  try {
    const dbZones = await prisma.shippingZone.findMany({
      orderBy: { nameAr: 'asc' }
    });
    if (dbZones && dbZones.length > 0) {
      return dbZones.map((z: any) => ({
        id: z.id,
        nameAr: z.nameAr,
        nameEn: z.nameEn,
        fee: z.fee ?? 2000,
        cost: z.cost ?? 2000,
        estimatedDeliveryTime: z.estimatedDeliveryTime || 'خلال 2 - 3 أيام عمل',
        isEnabled: z.isEnabled
      }));
    }
  } catch (err) {
    console.warn('getShippingZonesList error:', err);
  }

  return BASE_JORDAN_GOVERNORATES;
}

export async function updateShippingZone(
  id: string,
  data: { fee: number; cost?: number; isEnabled: boolean },
  companyId?: string
) {
  await requirePermission('manage:settings');
  
  const targetCompanyId = companyId || await resolveDefaultCompanyId();
  const ratesMap = await getCompanyShippingRatesFromDb();

  if (!ratesMap[targetCompanyId]) {
    ratesMap[targetCompanyId] = BASE_JORDAN_GOVERNORATES.map(z => ({ ...z }));
  }

  const zones = ratesMap[targetCompanyId];
  const idx = zones.findIndex((z: ShippingZoneItem) => z.id === id);
  const cost = data.cost !== undefined ? data.cost : 2000;
  if (idx > -1) {
    zones[idx] = {
      ...zones[idx],
      fee: data.fee,
      cost,
      isEnabled: data.isEnabled
    };
  }

  await saveCompanyShippingRatesToDb(ratesMap);

  // Update in database table
  try {
    await prisma.shippingZone.update({
      where: { id },
      data: {
        fee: data.fee,
        cost: cost,
        isEnabled: data.isEnabled
      }
    });
  } catch (err) {
    console.warn('Prisma updateShippingZone error:', err);
  }
  
  revalidatePath('/admin/settings/shipping');
  revalidatePath('/admin/deliveries');
  revalidatePath('/[locale]/checkout', 'page');
  return { success: true };
}
