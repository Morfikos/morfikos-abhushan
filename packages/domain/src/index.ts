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
export {
  ARTICLE_STATUSES,
  INVENTORY_MOVEMENT_TYPES,
  SELLABLE_ARTICLE_STATUS,
  articleDeleteBlockedReason,
  articleIsMistakenReceiptDeletable,
  articleIsSellable,
  canAdjustArticleStatus,
  canReleaseFromInspection,
  isArticleStatus,
  netMetalWeightGrams,
  netMetalWeightIsPositive,
  netMetalWeightMatches,
} from "./article-inventory";
export type { ArticleStatus, InventoryMovementType } from "./article-inventory";
