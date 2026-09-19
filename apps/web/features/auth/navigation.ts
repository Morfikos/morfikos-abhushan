import type { StaffPermission } from "@aabhushan/contracts";

export type StaffNavItem = {
  href: string;
  label: string;
  permission: StaffPermission | null;
};

export const STAFF_NAV_ITEMS: StaffNavItem[] = [
  { href: "/dashboard", label: "Dashboard", permission: null },
  { href: "/inventory", label: "Inventory", permission: "inventory.read" },
  { href: "/invoices", label: "Invoices", permission: "billing.write" },
  { href: "/payments", label: "Payments", permission: "payments.write" },
  { href: "/customers", label: "Customers", permission: "customers.read" },
  { href: "/girvi", label: "Girvi", permission: "girvi.write" },
  { href: "/notifications", label: "Notifications", permission: "reports.read" },
  { href: "/settings", label: "Settings", permission: "settings.write" },
];

export function navigationForPermissions(permissions: readonly StaffPermission[]): StaffNavItem[] {
  return STAFF_NAV_ITEMS.filter((item) => item.permission === null || permissions.includes(item.permission));
}
