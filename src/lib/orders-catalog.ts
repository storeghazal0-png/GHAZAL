export interface DemoOrderItem {
  id: string;
  orderId: string;
  productId: string;
  variantId: string;
  sku: string;
  name: string;
  size: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface DemoOrderStatusHistory {
  id: string;
  orderId: string;
  status: string;
  notes: string | null;
  createdAt: string;
}

export interface DemoOrder {
  id: string;
  reference: string;
  customerName: string;
  customerPhone: string;
  status: string; // 'NEW', 'PREPARING', 'PREPARED', 'SHIPPED', 'DELIVERED', 'CANCELLED'
  totalAmount: number;
  shippingCost: number;
  notes?: string | null;
  addressStreet?: string;
  addressBuilding?: string;
  addressApartment?: string;
  items: DemoOrderItem[];
  statusHistory: DemoOrderStatusHistory[];
  createdAt: string;
  updatedAt: string;
}

const INITIAL_GHAZAL_DEMO_ORDERS: DemoOrder[] = [];

export const GHAZAL_DEMO_ORDERS: DemoOrder[] = (globalThis as any).__ghazal_demo_orders || [];
(globalThis as any).__ghazal_demo_orders = GHAZAL_DEMO_ORDERS;

// In-memory only: no disk persistence
function persistOrdersToDisk(_orders?: any): void {}

export function getDemoOrders(tab?: string, search?: string): DemoOrder[] {
  let list = GHAZAL_DEMO_ORDERS;

  const tabStatusMap: Record<string, string[]> = {
    'NEW': ['PENDING', 'AWAITING_WHATSAPP', 'NEW'],
    'PREPARING': ['CONFIRMED', 'PREPARING', 'CONFIRMED_PREPARING'],
    'PREPARED': ['PREPARED', 'READY_FOR_DELIVERY', 'AWAITING_DELIVERY'],
    'SHIPPED': ['SHIPPED', 'OUT_FOR_DELIVERY', 'WITH_COURIER'],
    'COMPLETED': ['DELIVERED', 'COMPLETED'],
    'CANCELLED': ['CANCELLED']
  };

  if (tab && tab !== 'ALL') {
    const allowed = tabStatusMap[tab] || tabStatusMap['NEW'];
    list = list.filter(o => allowed.includes(o.status));
  }

  if (search && search.trim()) {
    const q = search.trim().toLowerCase();
    list = list.filter(o =>
      o.reference.toLowerCase().includes(q) ||
      o.customerName.toLowerCase().includes(q) ||
      o.customerPhone.includes(q) ||
      (o.addressStreet && o.addressStreet.toLowerCase().includes(q)) ||
      o.items.some(it => it.name.toLowerCase().includes(q))
    );
  }

  return list;
}

export function saveDemoOrder(order: DemoOrder): void {
  const existingIdx = GHAZAL_DEMO_ORDERS.findIndex(o => 
    o.id.toLowerCase() === order.id.toLowerCase() || 
    o.reference.toLowerCase() === order.reference.toLowerCase()
  );
  if (existingIdx !== -1) {
    GHAZAL_DEMO_ORDERS[existingIdx] = { ...GHAZAL_DEMO_ORDERS[existingIdx], ...order };
  } else {
    GHAZAL_DEMO_ORDERS.unshift(order);
  }
}

export function getDemoOrderById(id: string): DemoOrder | undefined {
  if (!id) return undefined;

  const decoded = decodeURIComponent(id).trim().toLowerCase();

  // 1. Direct exact or reference match
  const direct = GHAZAL_DEMO_ORDERS.find(o => 
    o.id.toLowerCase() === decoded || 
    o.reference.toLowerCase() === decoded
  );
  if (direct) return direct;

  // 2. Partial / substring match
  const partial = GHAZAL_DEMO_ORDERS.find(o => 
    o.id.toLowerCase().includes(decoded) || 
    o.reference.toLowerCase().includes(decoded) ||
    decoded.includes(o.id.toLowerCase()) ||
    decoded.includes(o.reference.toLowerCase())
  );
  if (partial) return partial;

  // 3. Numeric suffix match (e.g. '1001', '1', '001')
  const numericMatch = decoded.replace(/\D/g, '');
  if (numericMatch) {
    const numOrder = GHAZAL_DEMO_ORDERS.find(o => 
      o.reference.endsWith(numericMatch) || 
      o.id.endsWith(numericMatch)
    );
    if (numOrder) return numOrder;
  }

  return undefined;
}

export function updateDemoOrderStatus(orderId: string, newStatus: string, shippingCost?: number): boolean {
  const order = getDemoOrderById(orderId);
  if (!order) return false;

  order.status = newStatus;
  if (shippingCost !== undefined) {
    const subtotal = order.totalAmount - order.shippingCost;
    order.shippingCost = shippingCost;
    order.totalAmount = subtotal + shippingCost;
  }
  order.updatedAt = new Date().toISOString();

  order.statusHistory.unshift({
    id: `hist-${Date.now()}`,
    orderId,
    status: newStatus,
    notes: `تم تغيير حالة الطلب إلى: ${newStatus}`,
    createdAt: new Date().toISOString()
  });

  persistOrdersToDisk(GHAZAL_DEMO_ORDERS);
  return true;
}

export function addDemoOrderItem(orderId: string, itemData: any, reason: string): boolean {
  const order = getDemoOrderById(orderId);
  if (!order) return false;
  if (order.status === 'DELIVERED' || order.status === 'COMPLETED' || order.status === 'CANCELLED') {
    return false;
  }

  const oldTotal = order.totalAmount;
  const itemTotal = itemData.unitPrice * itemData.quantity;
  const newTotal = oldTotal + itemTotal;

  const newItem: DemoOrderItem = {
    id: `item-${Date.now()}`,
    orderId,
    productId: itemData.productId,
    variantId: itemData.variantId || itemData.productId,
    sku: itemData.sku || `SKU-${Date.now().toString(36)}`,
    name: itemData.productName,
    size: itemData.variantLabel || 'قياسي',
    quantity: itemData.quantity,
    unitPrice: itemData.unitPrice,
    total: itemTotal
  };

  order.items.push(newItem);
  order.totalAmount = newTotal;
  order.updatedAt = new Date().toISOString();

  const formattedNote = `[تعديل فاتورة - إضافة منتج] تم إضافة: ${itemData.productName} ${itemData.variantLabel ? `(${itemData.variantLabel})` : ''} | الكمية: ${itemData.quantity} | السعر: ${(itemData.unitPrice / 1000).toFixed(3)} د.أ | المبلغ المضاف: ${(itemTotal / 1000).toFixed(3)} د.أ | تغير السعر من ${(oldTotal / 1000).toFixed(3)} د.أ إلى ${(newTotal / 1000).toFixed(3)} د.أ لضمان النزاهة بين البائع والعميل | سبب التعديل: ${reason}`;

  order.statusHistory.unshift({
    id: `hist-${Date.now()}`,
    orderId,
    status: order.status,
    notes: formattedNote,
    createdAt: new Date().toISOString()
  });

  persistOrdersToDisk(GHAZAL_DEMO_ORDERS);
  return true;
}

export function removeDemoOrderItem(orderId: string, orderItemId: string, reason: string): { success: boolean; error?: string } {
  const order = getDemoOrderById(orderId);
  if (!order) return { success: false, error: 'الطلب غير موجود' };
  if (order.status === 'DELIVERED' || order.status === 'COMPLETED' || order.status === 'CANCELLED') {
    return { success: false, error: 'لا يمكن تعديل طلب مكتمل أو ملغي' };
  }

  const itemIdx = order.items.findIndex(i => i.id === orderItemId);
  if (itemIdx === -1) return { success: false, error: 'البند غير موجود في هذا الطلب' };

  if (order.items.length <= 1) {
    return { success: false, error: 'لا يمكن حذف كافة الأصناف؛ يفضل إلغاء الطلب بالكامل' };
  }

  const item = order.items[itemIdx];
  const deductedAmount = item.total;
  const oldTotal = order.totalAmount;
  const newTotal = Math.max(order.shippingCost, oldTotal - deductedAmount);
  order.items.splice(itemIdx, 1);
  order.totalAmount = newTotal;
  order.updatedAt = new Date().toISOString();

  const formattedNote = `[تعديل فاتورة - حذف منتج] تم حذف: ${item.name} | الكمية: ${item.quantity} | المبلغ المخصوم: ${(deductedAmount / 1000).toFixed(3)} د.أ | تغير السعر من ${(oldTotal / 1000).toFixed(3)} د.أ إلى ${(newTotal / 1000).toFixed(3)} د.أ لضمان النزاهة بين البائع والعميل | سبب التعديل: ${reason}`;

  order.statusHistory.unshift({
    id: `hist-${Date.now()}`,
    orderId,
    status: order.status,
    notes: formattedNote,
    createdAt: new Date().toISOString()
  });

  persistOrdersToDisk(GHAZAL_DEMO_ORDERS);
  return { success: true };
}
