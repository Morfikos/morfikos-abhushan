/**
 * Pure invoice and Girvi calculations live here in later units.
 * This package must stay free of HTTP, React, database, and provider SDKs.
 */
export const domainPackage = "domain" as const;

export {
  permissionsForRole,
  roleHasPermission,
  STAFF_PERMISSION_MAP_VERSION,
} from "./staff-permissions";
export { kolkataBusinessDate, SHOP_TIME_ZONE } from "./business-date";
