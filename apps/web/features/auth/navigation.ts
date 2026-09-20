import type { StaffPermission } from "@aabhushan/contracts";
import { Bell01, CreditCard02, Home01, Package, Receipt, Scale01, Settings01, Users01 } from "@untitledui/icons";

export type StaffNavItem = {
  href: string;
  label: string;
  permission: StaffPermission | null;
  icon: typeof Home01;
};

export const STAFF_NAV_ITEMS: StaffNavItem[] = [
  { href: "/dashboard", label: "Dashboard", permission: null, icon: Home01 },
  { href: "/inventory", label: "Inventory", permission: "inventory.read", icon: Package },
  { href: "/invoices", label: "Invoices/POS", permission: "billing.write", icon: Receipt },
  { href: "/payments", label: "Payments", permission: "payments.write", icon: CreditCard02 },
  { href: "/customers", label: "Customers", permission: "customers.read", icon: Users01 },
  { href: "/girvi", label: "Girvi", permission: "girvi.write", icon: Scale01 },
  { href: "/notifications", label: "Notifications", permission: "reports.read", icon: Bell01 },
  { href: "/settings", label: "Settings", permission: "settings.write", icon: Settings01 },
];

export function navigationForPermissions(permissions: readonly StaffPermission[]): StaffNavItem[] {
  return STAFF_NAV_ITEMS.filter((item) => item.permission === null || permissions.includes(item.permission));
}
