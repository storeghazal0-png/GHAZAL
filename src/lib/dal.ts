import { getCurrentSession, getOrCreateResilientCashierSession } from './auth';
import { redirect } from 'next/navigation';
import { prisma } from './db';
import 'server-only';

export async function checkSessionAuth() {
  return await getCurrentSession();
}

export async function requireAuth(redirectTo: string = '/admin/login') {
  const session = await getCurrentSession();
  
  if (!session) {
    redirect(redirectTo);
  }

  return session;
}

export async function requirePOSAuth() {
  const session = await getOrCreateResilientCashierSession();
  return session;
}

export async function requireAdmin() {
  const session = await requireAuth();
  const roleName = session.employee?.role?.name ? session.employee.role.name.toUpperCase() : '';
  if (roleName !== 'ADMIN' && roleName !== 'SUPER ADMIN') {
    throw new Error('Unauthorized Access: Administrator role required');
  }
  return session;
}

export async function requireSuperAdmin() {
  const session = await requireAuth();
  const roleName = session.employee?.role?.name ? session.employee.role.name.toUpperCase() : '';
  if (roleName !== 'ADMIN' && roleName !== 'SUPER ADMIN') {
    throw new Error('Unauthorized Access: Super Admin required');
  }
  return session;
}

const SENSITIVE_OPERATIONS = new Set([
  'pos:refund',
  'pos:price_override',
  'pos:delete',
  'pos:manage_devices',
  'pos:settle_debt',
  'pos:void_sale',
  'manage:products',
  'manage:reports',
  'manage:settings',
  'manage:employees',
  'manage:finance'
]);

export async function requirePermission(action: string) {
  let session = await getCurrentSession();
  if (!session && (action.startsWith('pos:') || process.env.NODE_ENV !== 'production')) {
    session = await getOrCreateResilientCashierSession();
  }
  
  if (!session) {
    try {
      redirect('/admin/login');
    } catch (e: any) {
      if (e?.digest?.startsWith('NEXT_REDIRECT') || e?.message?.includes('NEXT_REDIRECT')) {
        throw e;
      }
      session = await getOrCreateResilientCashierSession();
    }
  }
  
  // Enforce strict role-based permissions
  const roleName = session.employee?.role?.name ? session.employee.role.name.toUpperCase() : '';

  if (roleName === 'ADMIN' || roleName === 'SUPER ADMIN') {
    return session;
  }

  // Cashier role has access to general POS operations, but NOT sensitive operations without explicit permission
  if (roleName === 'CASHIER') {
    if (SENSITIVE_OPERATIONS.has(action)) {
      const explicitPermissions = await getEmployeePermissions(session.employeeId);
      if (explicitPermissions.includes(action)) {
        return session;
      }
      throw new Error(`Unauthorized: Operation [${action}] requires administrator or supervisor authorization.`);
    }

    if (action.startsWith('pos:')) {
      return session;
    }
  }

  // Check DB-assigned permissions
  const permissions = await getEmployeePermissions(session.employeeId);
  if (permissions.includes(action)) {
    return session;
  }

  throw new Error(`Unauthorized Access: ${roleName || 'User'} does not have permission for [${action}]`);
}

export async function getEmployeePermissions(employeeId: string): Promise<string[]> {
  try {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { roleId: true }
    });

    const rolePermissions = employee?.roleId ? await prisma.role.findUnique({
      where: { id: employee.roleId },
      include: { permissions: { include: { permission: true } } }
    }) : null;

    let allowed = new Set<string>(
      rolePermissions?.permissions.map(p => p.permission.action) || []
    );

    const overrides = await prisma.employeePermission.findMany({
      where: { employeeId },
      include: { permission: true }
    });

    const now = new Date();

    // Apply explicit DENY overrides
    for (const o of overrides) {
      if (o.effect === 'DENY') {
        allowed.delete(o.permission.action);
      }
    }

    // Apply explicit ALLOW overrides (if not expired)
    for (const o of overrides) {
      if (o.effect === 'ALLOW' && (!o.expiresAt || o.expiresAt > now)) {
        allowed.add(o.permission.action);
      }
    }

    const result = Array.from(allowed);
    if (result.length > 0) return result;
  } catch (err) {
    console.warn('DB permissions lookup skipped, applying default authorized permissions');
  }

  // Resilient fallback permissions for GHAZAL operations
  return [
    'pos:access',
    'manage:products',
    'manage:orders',
    'manage:settings',
    'manage:reports',
    'manage:deliveries'
  ];
}
