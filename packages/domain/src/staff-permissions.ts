import type { StaffPermission, StaffRole } from "@aabhushan/contracts";

export const STAFF_PERMISSION_MAP_VERSION = 2;

const OWNER_ADMIN_PERMISSIONS = [
  "staff.manage",
  "settings.write",
  "rates.read",
  "rates.write",
  "inventory.read",
  "inventory.write",
  "billing.write",
  "payments.write",
  "refunds.approve",
  "customers.read",
  "customers.write",
  "girvi.write",
  "girvi.release",
  "identity_documents.read",
  "reports.read",
  "audit.read",
] as const satisfies readonly StaffPermission[];

const ROLE_PERMISSIONS: Record<StaffRole, readonly StaffPermission[]> = {
  owner: OWNER_ADMIN_PERMISSIONS,
  admin: OWNER_ADMIN_PERMISSIONS,
  billing: [
    "rates.read",
    "inventory.read",
    "billing.write",
    "payments.write",
    "customers.read",
    "customers.write",
    "reports.read",
  ],
  inventory: ["inventory.read", "inventory.write", "customers.read", "reports.read"],
  girvi: ["customers.read", "customers.write", "girvi.write", "reports.read"],
};

export function permissionsForRole(role: StaffRole): StaffPermission[] {
  return [...ROLE_PERMISSIONS[role]];
}

export function roleHasPermission(role: StaffRole, permission: StaffPermission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
