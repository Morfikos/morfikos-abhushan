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
export {
  TAG_BARCODE_MIN_HEIGHT_MM,
  TAG_FOOTER_HEIGHT_MM,
  TAG_HEADER_HEIGHT_MM,
  TAG_INSET_MM,
  TAG_LOGO_MAX_MM,
  TAG_TEMPLATE_VERSION,
  articleBarcodePayload,
  isCode128SafePayload,
  tagBarcodeHeightMm,
  tagCanShowLogo,
  tagUsableHeightMm,
} from "./article-barcode";
export { SHOP_LOGO_MAX_BYTES, detectShopLogoContentType } from "./shop-logo";
export type { ShopLogoContentType } from "./shop-logo";
