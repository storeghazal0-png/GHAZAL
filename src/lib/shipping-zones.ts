export interface ShippingZoneData {
  id: string;
  nameAr: string;
  nameEn: string;
  fee: number; // in minor units (fils)
  cost?: number; // our cost in fils
  estimatedDeliveryTime: string;
  isEnabled: boolean;
  freeShippingThreshold: number | null;
}

export const JORDAN_GOVERNORATES_SHIPPING_ZONES: ShippingZoneData[] = [
  {
    id: 'zone-amman',
    nameAr: 'العاصمة عمّان',
    nameEn: 'Amman',
    fee: 2000,
    cost: 2000,
    estimatedDeliveryTime: 'خلال 2 - 3 أيام عمل',
    isEnabled: true,
    freeShippingThreshold: null
  },
  {
    id: 'zone-balqa',
    nameAr: 'البلقاء',
    nameEn: 'Balqa',
    fee: 2000,
    cost: 2000,
    estimatedDeliveryTime: 'خلال 2 - 3 أيام عمل',
    isEnabled: true,
    freeShippingThreshold: null
  },
  {
    id: 'zone-zarqa',
    nameAr: 'الزرقاء',
    nameEn: 'Zarqa',
    fee: 2000,
    cost: 2000,
    estimatedDeliveryTime: 'خلال 2 - 3 أيام عمل',
    isEnabled: true,
    freeShippingThreshold: null
  },
  {
    id: 'zone-irbid',
    nameAr: 'إربد',
    nameEn: 'Irbid',
    fee: 2000,
    cost: 2000,
    estimatedDeliveryTime: 'خلال 2 - 3 أيام عمل',
    isEnabled: true,
    freeShippingThreshold: null
  },
  {
    id: 'zone-jerash',
    nameAr: 'جرش',
    nameEn: 'Jerash',
    fee: 2000,
    cost: 2000,
    estimatedDeliveryTime: 'خلال 2 - 3 أيام عمل',
    isEnabled: true,
    freeShippingThreshold: null
  },
  {
    id: 'zone-ajloun',
    nameAr: 'عجلون',
    nameEn: 'Ajloun',
    fee: 2000,
    cost: 2000,
    estimatedDeliveryTime: 'خلال 2 - 3 أيام عمل',
    isEnabled: true,
    freeShippingThreshold: null
  },
  {
    id: 'zone-madaba',
    nameAr: 'مادبا',
    nameEn: 'Madaba',
    fee: 2000,
    cost: 2000,
    estimatedDeliveryTime: 'خلال 2 - 3 أيام عمل',
    isEnabled: true,
    freeShippingThreshold: null
  },
  {
    id: 'zone-mafraq',
    nameAr: 'المفرق',
    nameEn: 'Mafraq',
    fee: 2000,
    cost: 2000,
    estimatedDeliveryTime: 'خلال 2 - 3 أيام عمل',
    isEnabled: true,
    freeShippingThreshold: null
  },
  {
    id: 'zone-karak',
    nameAr: 'الكرك',
    nameEn: 'Karak',
    fee: 2000,
    cost: 2000,
    estimatedDeliveryTime: 'خلال 2 - 3 أيام عمل',
    isEnabled: true,
    freeShippingThreshold: null
  },
  {
    id: 'zone-tafilah',
    nameAr: 'الطفيلة',
    nameEn: 'Tafilah',
    fee: 2000,
    cost: 2000,
    estimatedDeliveryTime: 'خلال 2 - 3 أيام عمل',
    isEnabled: true,
    freeShippingThreshold: null
  },
  {
    id: 'zone-maan',
    nameAr: 'معان',
    nameEn: "Ma'an",
    fee: 2000,
    cost: 2000,
    estimatedDeliveryTime: 'خلال 2 - 3 أيام عمل',
    isEnabled: true,
    freeShippingThreshold: null
  },
  {
    id: 'zone-aqaba',
    nameAr: 'العقبة',
    nameEn: 'Aqaba',
    fee: 2000,
    cost: 2000,
    estimatedDeliveryTime: 'خلال 2 - 3 أيام عمل',
    isEnabled: true,
    freeShippingThreshold: null
  }
];

export function getShippingZoneById(id: string): ShippingZoneData | undefined {
  if (!id) return undefined;
  const cleanId = id.trim().toLowerCase();
  return JORDAN_GOVERNORATES_SHIPPING_ZONES.find(
    z => z.id.toLowerCase() === cleanId || 
         z.nameAr.toLowerCase().includes(cleanId) || 
         z.nameEn.toLowerCase().includes(cleanId)
  );
}
