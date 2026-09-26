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
  getMetalRatesCoverage,
  getPublicShopBranding,
  getReminderSettings,
  getShopProfile,
  listAuditEvents,
  listMakingChargeDefaults,
  listMetalRates,
  removeShopLogo,
  updateDeviceSettings,
  updateDocumentSequences,
  updateMetalRate,
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
  createPurityLabel,
  createStockCount,
  createStorageLocation,
  deleteArticle,
  getArticle,
  listArticleMovements,
  listArticles,
  listCatalogueCategories,
  listPurityLabels,
  listStorageLocations,
  lookupArticleByBarcode,
  assignArticleBarcode,
  assignArticleBarcodesBatch,
  getArticleTagPreview,
  patchPurityLabel,
  patchStorageLocation,
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

export {
  activateGirviAccount,
  createGirviDraft,
  deleteGirviDraft,
  getGirviAccount,
  getGirviCollateralFileView,
  hashGirviActivatePayload,
  hashGirviCustodyMovePayload,
  girviRateFromTermsSnapshot,
  listGirviAccounts,
  moveGirviCustodyLocation,
  patchGirviDraft,
  presentGirviOverdue,
  uploadGirviCollateralFile,
} from "./girvi";
export type { GirviListFilters, GirviPostingLock, GirviRepository } from "./girvi";
export {
  getGirviStatement,
  quoteGirviSettlement,
  recordGirviRepayment,
  releaseGirviCollateral,
  settleGirviAccount,
} from "./girvi-settlement";

export {
  ABANDONED_UPLOAD_TTL_MS,
  buildDocumentObjectKey,
  buildStoredObjectKey,
  confirmFileUpload,
  createFileUploadGrant,
  DOCUMENT_SIGNED_URL_SECONDS,
  getDocument,
  getFileAccess,
  getFileAccessByObjectKey,
  getInvoicePrintDto,
  getReceiptPrintDto,
  INVOICE_PDF_TEMPLATE_VERSION,
  listDocumentsForOwner,
  RECEIPT_PDF_TEMPLATE_VERSION,
  GIRVI_ACK_PDF_TEMPLATE_VERSION,
  CREDIT_NOTE_PDF_TEMPLATE_VERSION,
  REFUND_PDF_TEMPLATE_VERSION,
  currentTemplateVersionFor,
  retryDocument,
  SHOP_ASSETS_BUCKET,
  UPLOAD_GRANT_TTL_SECONDS,
} from "./documents";
export type { DocumentsRepository } from "./documents";

export {
  buildExportCsv,
  createExport,
  dashboardSectionsForRole,
  getCollectionsReport,
  getDashboardReport,
  getExportJob,
  getGirviReport,
  getInventoryReport,
  getSalesReport,
  processQueuedExport,
} from "./reports";
export type { ReportRangeInput, ReportsRepository } from "./reports";

export {
  dispatchWhatsAppOutbox,
  evaluateReminders,
  getNotificationAttention,
  isWithinSendWindow,
  listNotifications,
  processNotificationSend,
  retryNotification,
} from "./notifications";
export type { NotificationJobEnqueue, NotificationsRepository, WhatsAppSendAdapter } from "./notifications";

export type { FieldError };
