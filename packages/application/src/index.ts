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
  deleteMakingChargeDefault,
  getDeviceSettings,
  getDocumentSequences,
  getPublicShopBranding,
  getReminderSettings,
  getShopProfile,
  listAuditEvents,
  listMakingChargeDefaults,
  listMetalRates,
  removeShopLogo,
  updateDeviceSettings,
  updateDocumentSequences,
  updateReminderSettings,
  updateShopProfile,
  uploadShopLogo,
  upsertMakingChargeDefault,
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

export {
  createCustomer,
  getCustomer,
  listCustomerConsents,
  listCustomerIdentityFiles,
  listCustomers,
  putCustomerConsents,
  updateCustomer,
} from "./customers";
export type { CustomerListFilters, CustomerRepository } from "./customers";

export {
  createInvoiceDraft,
  finalizeInvoice,
  getInvoice,
  hashFinalizePayload,
  listInvoices,
  patchInvoiceDraft,
  quickReceiveArticleOntoDraft,
  quoteInvoiceForStaff,
  refreshDraftQuote,
} from "./invoices";
export type {
  InvoiceDraftLineInput,
  InvoiceListFilters,
  InvoiceQuoteRepository,
  InvoiceQuoteTotals,
  InvoiceRepository,
  LockedArticle,
} from "./invoices";

export {
  collectionsPeriodFromQuery,
  getCustomerSalesStatement,
  getDailyCollections,
  getPayment,
  hashPaymentPayload,
  listInvoicePayments,
  listPayments,
  paymentListDateFilters,
  recordPayment,
  splitTendersAcrossAllocations,
} from "./payments";
export type {
  CollectionsPeriodFilter,
  LockedInvoiceForAllocation,
  PaymentListFilters,
  PaymentRepository,
} from "./payments";

export {
  acceptInvoiceReturn,
  creditAmountForReturnedLine,
  getInvoiceCorrections,
  refundPayment,
  reversePayment,
} from "./returns";
export type {
  LockedArticleForReturn,
  LockedFinalizedInvoice,
  LockedPaymentForCorrection,
  PaymentCorrectionRepository,
  ReturnsRepository,
} from "./returns";

export type { FieldError };
