import type { FieldError } from "@aabhushan/contracts";

export {
  ApplicationHttpError,
  configurationError,
  conflictError,
  missingOrganizationContextError,
  notFoundError,
  permissionDeniedError,
  validationError,
} from "./http-error";
export { assertAnyPermission, assertPermission } from "./authorize";
export {
  createMetalRate,
  getDeviceSettings,
  getDocumentSequences,
  getPublicShopBranding,
  getReminderSettings,
  getShopProfile,
  listAuditEvents,
  listMetalRates,
  removeShopLogo,
  updateDeviceSettings,
  updateDocumentSequences,
  updateReminderSettings,
  updateShopProfile,
  uploadShopLogo,
} from "./shop-settings";
export type {
  AuditWrite,
  PaginatedRows,
  PaginationInput,
  ShopAssetStorage,
  ShopProfileRecord,
  ShopSettingsRepository,
} from "./shop-settings";
export { inviteStaffMember, listStaffDirectory, suspendStaffMember } from "./staff-directory";
export type { StaffAuthInviteResult, StaffAuthInviter, StaffDirectoryRepository } from "./staff-directory";
export {
  invalidAuthError,
  membershipDeniedError,
  resolveStaffAccess,
  StaffAccessError,
  toCurrentStaffDto,
} from "./staff-access";
export type {
  ResolvedStaffAccess,
  StaffAccessRepository,
  StaffInvitationRecord,
  StaffMembershipRecord,
  StaffUserRecord,
} from "./staff-access";

export {
  adjustArticle,
  bulkDeleteArticles,
  createCatalogueCategory,
  createStockCount,
  createStorageLocation,
  deleteArticle,
  getArticle,
  listArticleMovements,
  listArticles,
  listCatalogueCategories,
  listStorageLocations,
  lookupArticleByBarcode,
  assignArticleBarcode,
  assignArticleBarcodesBatch,
  getArticleTagPreview,
  receiveArticle,
  recordArticleTagPrint,
  releaseArticleFromInspection,
  updateArticle,
} from "./inventory";
export type { ArticleListFilters, InventoryRepository } from "./inventory";

export type { FieldError };
