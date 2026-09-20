import { z } from "zod";

export const fieldErrorSchema = z.object({
  field: z.string(),
  message: z.string(),
});

export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  request_id: z.string(),
  field_errors: z.array(fieldErrorSchema).default([]),
  existing_customer_id: z.string().uuid().optional(),
});

export type FieldError = z.infer<typeof fieldErrorSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;

export function createApiError(input: {
  code: string;
  message: string;
  request_id: string;
  field_errors?: FieldError[];
  existing_customer_id?: string;
}): ApiError {
  return apiErrorSchema.parse({
    code: input.code,
    message: input.message,
    request_id: input.request_id,
    field_errors: input.field_errors ?? [],
    ...(input.existing_customer_id ? { existing_customer_id: input.existing_customer_id } : {}),
  });
}

export const apiVersionDocument = {
  openapi: "3.1.0",
  info: {
    title: "Aabhushan API",
    version: "v1",
    description: "Versioned staff API discovery document. No business data is included.",
  },
  servers: [{ url: "/api/v1" }],
  paths: {
    "/health/live": {
      get: {
        summary: "Process liveness",
        responses: { "200": { description: "Process is live" } },
      },
    },
    "/health/ready": {
      get: {
        summary: "Readiness including configuration and database ping",
        responses: {
          "200": { description: "Ready" },
          "503": { description: "Not ready" },
        },
      },
    },
    "/api/v1": {
      get: {
        summary: "OpenAPI version document",
        responses: { "200": { description: "Version document" } },
      },
    },
    "/me": {
      get: {
        summary: "Current staff profile, membership, role, and permissions",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Authenticated membership" },
          "401": { description: "Missing or invalid token" },
          "403": { description: "Disabled, suspended, or missing membership" },
        },
      },
    },
    "/auth/session/introspect": {
      post: {
        summary: "Explicit backend session check for a bearer token",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Active membership" },
          "401": { description: "Missing or invalid token" },
          "403": { description: "Disabled, suspended, or missing membership" },
        },
      },
    },
    "/shop/profile": {
      get: { summary: "Shop legal profile and active branch; logo_url is short-lived when present" },
      patch: { summary: "Update shop profile", security: [{ bearerAuth: [] }] },
    },
    "/shop/logo": {
      post: { summary: "Upload or replace the shop logo (multipart image)" },
      delete: { summary: "Remove the shop logo" },
    },
    "/public/shop-branding": {
      get: { summary: "Public shop name and optional logo URL for auth chrome" },
    },
    "/shop/rates": {
      get: { summary: "Paginated metal rates" },
      post: { summary: "Insert a dated metal rate; never rewrite a previous row" },
    },
    "/shop/sequences": {
      get: { summary: "Document sequence configuration" },
      patch: { summary: "Update prefixes, padding, and next values" },
    },
    "/shop/devices": {
      get: { summary: "Printer and scanner defaults (unvalidated placeholders)" },
      patch: { summary: "Update device defaults" },
    },
    "/shop/reminders": {
      get: { summary: "Reminder preference storage; nothing is sent" },
      patch: { summary: "Update reminder preferences" },
    },
    "/staff": {
      get: { summary: "Paginated staff directory" },
      post: { summary: "Invite staff with admin, billing, inventory, or girvi" },
    },
    "/staff/{id}/suspend": {
      post: { summary: "Suspend a membership; blocked on the next API call" },
    },
    "/audit": {
      get: { summary: "Paginated audit events" },
    },
    "/catalogue-categories": {
      get: { summary: "Catalogue categories for receiving and filters" },
      post: { summary: "Create a catalogue category" },
    },
    "/storage-locations": {
      get: { summary: "Branch storage locations" },
      post: { summary: "Create a storage location" },
    },
    "/articles": {
      get: { summary: "Paginated saleable-inventory article list" },
      post: { summary: "Receive an article and write a receipt movement" },
    },
    "/articles/lookup": {
      get: { summary: "Lookup by barcode; unknown, unavailable, and sold POS add fail explicitly" },
    },
    "/articles/barcodes/batch": {
      post: { summary: "Assign missing Code 128 barcodes only; existing identifiers are kept" },
    },
    "/articles/{id}/barcode": {
      post: { summary: "Idempotent assign of a permanent Code 128 barcode" },
    },
    "/articles/{id}/tag-preview": {
      get: { summary: "Tag print DTO with inline Code 128 SVG; not a public image URL" },
    },
    "/articles/{id}/tag-prints": {
      post: { summary: "Record a physical tag print or reprint; reprint requires a reason" },
    },
    "/articles/bulk-delete": {
      post: { summary: "Hard-delete mistaken receipt articles; skips ineligible ids" },
    },
    "/articles/{id}": {
      get: { summary: "Article detail including weights, files, and internal cost" },
      patch: { summary: "Update an unsold article; 409 on stale row_version" },
      delete: { summary: "Hard-delete a mistaken receipt article only" },
    },
    "/articles/{id}/adjustments": {
      post: { summary: "Reviewed stock adjustment with required reason" },
    },
    "/articles/{id}/inspection-release": {
      post: { summary: "Release a return_inspection article to available or unavailable" },
    },
    "/articles/{id}/movements": {
      get: { summary: "Append-only movement history" },
    },
    "/stock-counts": {
      post: { summary: "Reviewed physical count; discrepancies write adjustments" },
    },
    "/customers": {
      get: { summary: "Paginated customer directory; q searches name and phone" },
      post: { summary: "Create an organization-scoped customer; duplicate phone is 409" },
    },
    "/customers/{id}": {
      get: { summary: "Customer profile with consents; sales and Girvi stay empty until later specs" },
      patch: { summary: "Update customer contact fields; duplicate phone is 409" },
    },
    "/customers/{id}/consents": {
      get: { summary: "Consent rows per channel and purpose" },
      put: { summary: "Grant or revoke consents; WhatsApp grant requires a normalized phone" },
    },
    "/customers/{id}/identity-files": {
      get: { summary: "Restricted identity-file metadata; billing-only staff receive 403" },
    },
    "/invoices/quote": {
      post: {
        summary:
          "Server-authoritative invoice quote; fails closed until an approved calculation policy has owner-confirmed methods",
      },
    },
    "/invoices/drafts": {
      post: { summary: "Create a resumable invoice draft; does not reserve stock" },
    },
    "/invoices/drafts/{id}": {
      get: { summary: "Load an invoice draft with lines and latest quote error if any" },
      patch: { summary: "Add or remove article lines on a draft; duplicate article is 409" },
    },
    "/invoices": {
      get: { summary: "Paginated invoice list including drafts and finalized sales" },
    },
    "/invoices/{id}": {
      get: { summary: "Invoice detail with immutable line snapshots when finalized" },
    },
    "/invoices/{id}/finalize": {
      post: {
        summary:
          "Atomically finalize a draft (locks, quote, stock, payments, audit, outbox). Requires Idempotency-Key. Live success blocked until approved calculation fixtures.",
      },
    },
    "/invoices/{id}/payments": {
      get: { summary: "Collections allocated to one invoice with receipt numbers" },
    },
    "/invoices/{id}/returns": {
      post: {
        summary:
          "Accept a return of a finalized invoice line. Writes a credit note, moves the article to return_inspection, and requires Idempotency-Key. Does not edit the issued invoice.",
      },
    },
    "/invoices/{id}/corrections": {
      get: { summary: "Linked returns, credit notes, refunds, and reversals for one finalized invoice" },
    },
    "/payments": {
      get: { summary: "Paginated manually verified collections; not a sales measure" },
      post: {
        summary:
          "Post split tenders with invoice allocations under row locks. Requires Idempotency-Key. Overpayment is rejected; no gateway or bank confirmation is implied.",
      },
    },
    "/payments/{id}": {
      get: { summary: "One collection with its allocations and receipt number" },
    },
    "/payments/{id}/refunds": {
      post: {
        summary:
          "Refund money already collected against a posted collection. Requires refunds.approve and Idempotency-Key. Does not delete the original payment.",
      },
    },
    "/payments/{id}/reversals": {
      post: {
        summary:
          "Reverse a mistaken posted collection with a linked compensating payment. Requires refunds.approve and Idempotency-Key. Cannot reverse a payment that was refunded.",
      },
    },
    "/customers/{id}/sales-statement": {
      get: { summary: "Sales dues and collection history only; Girvi balances are never included" },
    },
    "/collections/daily": {
      get: {
        summary:
          "Collections received for a business date, inclusive from/to range, or all-time when dates omitted; grouped by method; separate from sales",
      },
    },
  },
} as const;

export {
  PUBLIC_SELF_SIGNUP_ENABLED,
  currentStaffMembershipSchema,
  currentStaffSchema,
  sessionIntrospectionSchema,
  staffInvitationStatusSchema,
  staffMembershipStatusSchema,
  staffPermissionSchema,
  staffRoleSchema,
} from "./staff";
export type {
  CurrentStaff,
  SessionIntrospection,
  StaffInvitationStatus,
  StaffMembershipStatus,
  StaffPermission,
  StaffRole,
} from "./staff";
export { paginationDirectionSchema, paginationQuerySchema, paginatedResponseSchema } from "./pagination";
export type { PaginationQuery } from "./pagination";
export { AUDIT_SORT_FIELDS, auditEventSchema, auditListQuerySchema, auditListSchema } from "./audit";
export type { AuditEvent, AuditList } from "./audit";
export {
  invitibleStaffRoleSchema,
  STAFF_SORT_FIELDS,
  staffDirectoryItemSchema,
  staffInviteRequestSchema,
  staffListQuerySchema,
  staffListSchema,
} from "./staff-directory";
export type { InvitibleStaffRole, StaffDirectoryItem, StaffInviteRequest, StaffList } from "./staff-directory";
export {
  METAL_RATE_SORT_FIELDS,
  businessDateSchema,
  deviceSettingsPatchSchema,
  deviceSettingsSchema,
  documentSequenceSchema,
  documentSequencesPatchSchema,
  documentSequencesSchema,
  documentTypeSchema,
  invoicePaperSizeSchema,
  localTimeSchema,
  metalRateCreateSchema,
  metalRateListQuerySchema,
  metalRateListSchema,
  metalRateSchema,
  metalSchema,
  reminderLanguageSchema,
  reminderSettingsPatchSchema,
  reminderSettingsSchema,
  scanTerminatorSchema,
  shopProfilePatchSchema,
  shopProfileSchema,
  shopBrandingPublicSchema,
} from "./shop";
export type {
  DeviceSettings,
  DeviceSettingsPatch,
  DocumentSequence,
  DocumentSequences,
  DocumentSequencesPatch,
  DocumentType,
  InvoicePaperSize,
  Metal,
  MetalRate,
  MetalRateCreate,
  MetalRateList,
  ReminderLanguage,
  ReminderSettings,
  ReminderSettingsPatch,
  ScanTerminator,
  ShopBrandingPublic,
  ShopProfile,
  ShopProfilePatch,
} from "./shop";
export {
  ARTICLE_PHOTO_MAX_BYTES,
  ARTICLE_SORT_FIELDS,
  articleAdjustmentSchema,
  articleBulkDeleteResultSchema,
  articleBarcodeBatchResultSchema,
  articleBarcodeBatchSchema,
  articleBulkDeleteSchema,
  articleCreateSchema,
  articleFileSchema,
  articleInspectionReleaseSchema,
  articleListQuerySchema,
  articleListSchema,
  articleLookupQuerySchema,
  articlePatchSchema,
  articlePhotographInputSchema,
  articleSchema,
  articleStatusSchema,
  catalogueCategoryCreateSchema,
  catalogueCategoryListSchema,
  catalogueCategorySchema,
  inventoryMovementListSchema,
  inventoryMovementSchema,
  inventoryMovementTypeSchema,
  stockCountCreateSchema,
  stockCountSchema,
  storageLocationCreateSchema,
  tagPreviewSchema,
  tagPrintCreateSchema,
  tagPrintEventSchema,
  tagPrintKindSchema,
  storageLocationListSchema,
  storageLocationSchema,
} from "./inventory";
export type {
  Article,
  ArticleAdjustment,
  ArticleBarcodeBatch,
  ArticleBarcodeBatchResult,
  ArticleBulkDelete,
  ArticleBulkDeleteResult,
  ArticleCreate,
  ArticleFile,
  ArticleInspectionRelease,
  ArticleList,
  ArticleListItem,
  ArticlePatch,
  ArticlePhotographInput,
  ArticleStatus,
  CatalogueCategory,
  CatalogueCategoryCreate,
  CatalogueCategoryList,
  InventoryMovement,
  InventoryMovementList,
  InventoryMovementType,
  StockCount,
  StockCountCreate,
  StorageLocation,
  StorageLocationCreate,
  StorageLocationList,
  TagPreview,
  TagPrintCreate,
  TagPrintEvent,
  TagPrintKind,
} from "./inventory";
export {
  CUSTOMER_SORT_FIELDS,
  customerConsentChannelSchema,
  customerConsentListSchema,
  customerConsentPurposeSchema,
  customerConsentSchema,
  customerConsentStatusSchema,
  customerConsentWriteSchema,
  customerConsentsPutSchema,
  customerCreateSchema,
  customerIdentityFileListSchema,
  customerIdentityFileSchema,
  customerListQuerySchema,
  customerListSchema,
  customerPatchSchema,
  customerSchema,
  customerWhatsAppConsentFilterSchema,
} from "./customers";
export type {
  Customer,
  CustomerConsent,
  CustomerConsentChannel,
  CustomerConsentList,
  CustomerConsentPurpose,
  CustomerConsentStatus,
  CustomerConsentWrite,
  CustomerConsentsPut,
  CustomerCreate,
  CustomerIdentityFile,
  CustomerIdentityFileList,
  CustomerList,
  CustomerListItem,
  CustomerListQuery,
  CustomerPatch,
  CustomerWhatsAppConsentFilter,
} from "./customers";
export {
  DEFAULT_INVOICE_LINE_PRICING,
  INVOICE_SORT_FIELDS,
  MAKING_CHARGE_DEFAULT_SORT_FIELDS,
  calculationPolicySchema,
  calculationPolicyStatusSchema,
  invoiceDraftCreateSchema,
  invoiceDraftPatchSchema,
  invoiceDraftQuickArticleSchema,
  invoiceFinalizePaymentSchema,
  invoiceFinalizeSchema,
  invoiceLinePricingSchema,
  invoiceListItemSchema,
  invoiceListQuerySchema,
  invoiceListSchema,
  invoiceLineSchema,
  invoiceQuoteErrorSchema,
  invoiceQuoteLineBreakdownSchema,
  invoiceQuoteLineRequestSchema,
  invoiceQuoteRequestSchema,
  invoiceQuoteResponseSchema,
  invoiceSchema,
  invoiceStatusSchema,
  makingChargeDefaultListQuerySchema,
  makingChargeDefaultListSchema,
  makingChargeDefaultSchema,
  makingChargeDefaultUpsertSchema,
  makingChargeSchema,
  paymentMethodSchema,
} from "./invoices";
export {
  PAYMENT_SORT_FIELDS,
  customerSalesStatementSchema,
  dailyCollectionMethodSchema,
  dailyCollectionsQuerySchema,
  dailyCollectionsSchema,
  invoicePaymentsSchema,
  outstandingInvoiceSchema,
  paymentAllocationInputSchema,
  paymentAllocationSchema,
  paymentCreateResultSchema,
  paymentCreateSchema,
  paymentKindSchema,
  paymentListQuerySchema,
  paymentListSchema,
  paymentSchema,
  paymentStatusSchema,
  paymentTenderSchema,
} from "./payments";
export { businessDateSpanDays, MAX_BUSINESS_DATE_SPAN_DAYS, refineBusinessDateBounds } from "./business-date-range";
export type {
  CustomerSalesStatement,
  DailyCollections,
  DailyCollectionsQuery,
  InvoicePayments,
  OutstandingInvoice,
  Payment,
  PaymentAllocation,
  PaymentAllocationInput,
  PaymentCreate,
  PaymentCreateResult,
  PaymentKind,
  PaymentList,
  PaymentListQuery,
  PaymentStatus,
  PaymentTender,
} from "./payments";
export {
  creditNoteSchema,
  invoiceCorrectionsSchema,
  invoiceReturnAcceptResultSchema,
  invoiceReturnCreateSchema,
  invoiceReturnSchema,
  invoiceReturnStatusSchema,
  paymentRefundCreateSchema,
  paymentReversalCreateSchema,
} from "./returns";
export type {
  CreditNote,
  InvoiceCorrections,
  InvoiceReturn,
  InvoiceReturnAcceptResult,
  InvoiceReturnCreate,
  InvoiceReturnStatus,
  PaymentRefundCreate,
  PaymentReversalCreate,
} from "./returns";
export type {
  CalculationPolicyDto,
  Invoice,
  InvoiceDraftCreate,
  InvoiceDraftPatch,
  InvoiceDraftQuickArticle,
  InvoiceFinalize,
  InvoiceFinalizePayment,
  InvoiceLinePricing,
  InvoiceList,
  InvoiceListItem,
  InvoiceListQuery,
  InvoiceLine,
  InvoiceQuoteError,
  InvoiceQuoteLineRequest,
  InvoiceQuoteRequest,
  InvoiceQuoteResponse,
  InvoiceStatus,
  MakingCharge,
  MakingChargeDefault,
  MakingChargeDefaultList,
  MakingChargeDefaultUpsert,
  PaymentMethod,
} from "./invoices";
