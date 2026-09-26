import {
  auditListSchema,
  currentStaffSchema,
  deviceSettingsSchema,
  documentSequencesSchema,
  metalRateListSchema,
  metalRateSchema,
  metalRatesCoverageSchema,
  makingChargeDefaultListSchema,
  makingChargeDefaultSchema,
  reminderSettingsSchema,
  collectionsReportSchema,
  dashboardReportSchema,
  exportResultSchema,
  shopBrandingPublicSchema,
  shopProfileSchema,
  staffDirectoryItemSchema,
  staffListSchema,
  articleListSchema,
  articleSchema,
  articleBarcodeBatchResultSchema,
  catalogueCategoryListSchema,
  catalogueCategorySchema,
  inventoryMovementListSchema,
  stockCountSchema,
  storageLocationListSchema,
  storageLocationSchema,
  purityLabelListSchema,
  purityLabelSchema,
  tagPreviewSchema,
  tagPrintEventSchema,
  articleBulkDeleteResultSchema,
  type Article,
  type ArticleAdjustment,
  type ArticleBarcodeBatchResult,
  type ArticleBulkDeleteResult,
  type ArticleCreate,
  type ArticleInspectionRelease,
  type ArticleList,
  type ArticlePatch,
  type AuditList,
  type CatalogueCategory,
  type CatalogueCategoryCreate,
  type CatalogueCategoryList,
  type CurrentStaff,
  type DeviceSettings,
  type DeviceSettingsPatch,
  type DocumentSequences,
  type DocumentSequencesPatch,
  type InventoryMovementList,
  type MetalRate,
  type MetalRateCreate,
  type MetalRateList,
  type MetalRatePatch,
  type PurityLabel,
  type PurityLabelCreate,
  type PurityLabelList,
  type PurityLabelPatch,
  type StorageLocation,
  type StorageLocationCreate,
  type StorageLocationList,
  type StorageLocationPatch,
  type MetalRatesCoverage,
  type MakingChargeDefault,
  type MakingChargeDefaultList,
  type MakingChargeDefaultUpsert,
  type ReminderSettings,
  type ReminderSettingsPatch,
  type ShopBrandingPublic,
  type ShopProfile,
  type ShopProfilePatch,
  type StaffDirectoryItem,
  type StaffInviteRequest,
  type StaffList,
  type StockCount,
  type StockCountCreate,
  type TagPreview,
  type TagPrintCreate,
  type TagPrintEvent,
  customerConsentListSchema,
  customerIdentityFileListSchema,
  customerListSchema,
  customerSchema,
  type Customer,
  type CustomerConsentList,
  type CustomerConsentsPut,
  type CustomerCreate,
  type CustomerIdentityFileList,
  type CustomerList,
  type CustomerPatch,
  invoiceListSchema,
  invoiceQuoteResponseSchema,
  invoiceSchema,
  customerSalesStatementSchema,
  dailyCollectionsSchema,
  invoicePaymentsSchema,
  invoiceReturnAcceptResultSchema,
  invoiceCorrectionsSchema,
  paymentCreateResultSchema,
  paymentListSchema,
  paymentSchema,
  type CustomerSalesStatement,
  type CollectionsReport,
  type DailyCollections,
  type InvoiceCorrections,
  type InvoicePayments,
  type InvoiceReturnAcceptResult,
  type InvoiceReturnCreate,
  type Payment,
  type PaymentCreate,
  type PaymentCreateResult,
  type PaymentList,
  type PaymentMethod,
  type PaymentRefundCreate,
  type PaymentReversalCreate,
  type Invoice,
  type InvoiceDraftCreate,
  type InvoiceDraftPatch,
  type InvoiceDraftQuickArticle,
  type InvoiceFinalize,
  type InvoiceList,
  type InvoiceQuoteRequest,
  type InvoiceQuoteResponse,
  girviAccountActivateSchema,
  girviAccountCreateSchema,
  girviAccountListSchema,
  girviAccountPatchSchema,
  girviAccountSchema,
  girviCustodyMoveCreateSchema,
  girviCustodyMoveResultSchema,
  girviReleaseCreateSchema,
  girviReleaseResultSchema,
  girviRepaymentCreateSchema,
  girviRepaymentResultSchema,
  girviSettlementCreateSchema,
  girviSettlementQuoteSchema,
  girviSettlementResultSchema,
  girviStatementSchema,
  documentListSchema,
  documentSchema,
  invoicePrintSchema,
  receiptPrintSchema,
  type GirviAccount,
  type GirviAccountActivate,
  type GirviAccountCreate,
  type GirviAccountList,
  type GirviAccountListQuery,
  type GirviAccountPatch,
  type GirviAccountStatus,
  type GirviCustodyMoveCreate,
  type GirviCustodyMoveResult,
  type GirviReleaseCreate,
  type GirviReleaseResult,
  type GirviRepaymentCreate,
  type GirviRepaymentResult,
  type GirviSettlementCreate,
  type GirviSettlementQuote,
  type GirviSettlementResult,
  type GirviStatementDto,
  type Document,
  type DocumentList,
  type InvoicePrint,
  type ReceiptPrint,
} from "@aabhushan/contracts";

import { publicEnv } from "@/lib/public-env";

export class StaffApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors: { field: string; message: string }[];
  readonly existingCustomerId: string | undefined;

  constructor(
    status: number,
    code: string,
    message: string,
    fieldErrors: { field: string; message: string }[] = [],
    existingCustomerId?: string,
  ) {
    super(message);
    this.name = "StaffApiError";
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
    this.existingCustomerId = existingCustomerId;
  }
}

function apiUrl(path: string): string {
  return `${publicEnv.NEXT_PUBLIC_API_URL}${path}`;
}

export async function staffRequest<T>(
  accessToken: string,
  path: string,
  options: {
    method?: string;
    body?: unknown;
    schema: { parse: (value: unknown) => T };
    headers?: Record<string, string>;
  },
): Promise<T> {
  const response = await fetch(apiUrl(path), {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(options.headers ?? {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : null,
    cache: "no-store",
  });

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const record =
      typeof body === "object" && body !== null
        ? (body as { code?: unknown; message?: unknown; field_errors?: unknown; existing_customer_id?: unknown })
        : {};
    const code = typeof record.code === "string" ? record.code : "REQUEST_FAILED";
    const message = typeof record.message === "string" ? record.message : "The request failed.";
    const fieldErrors = Array.isArray(record.field_errors)
      ? record.field_errors.flatMap((item) => {
          if (typeof item !== "object" || item === null) {
            return [];
          }
          const field = "field" in item && typeof item.field === "string" ? item.field : "";
          const fieldMessage = "message" in item && typeof item.message === "string" ? item.message : "";
          return field && fieldMessage ? [{ field, message: fieldMessage }] : [];
        })
      : [];
    const existingCustomerId =
      typeof record.existing_customer_id === "string" ? record.existing_customer_id : undefined;
    throw new StaffApiError(response.status, code, message, fieldErrors, existingCustomerId);
  }

  return options.schema.parse(body);
}

export async function fetchCurrentStaff(accessToken: string): Promise<CurrentStaff> {
  return staffRequest(accessToken, "/api/v1/me", { schema: currentStaffSchema });
}

export async function fetchShopProfile(accessToken: string): Promise<ShopProfile> {
  return staffRequest(accessToken, "/api/v1/shop/profile", { schema: shopProfileSchema });
}

export async function patchShopProfile(accessToken: string, patch: ShopProfilePatch): Promise<ShopProfile> {
  return staffRequest(accessToken, "/api/v1/shop/profile", { method: "PATCH", body: patch, schema: shopProfileSchema });
}

export async function uploadShopLogoRequest(accessToken: string, file: File): Promise<ShopProfile> {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(apiUrl("/api/v1/shop/logo"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    body: form,
    cache: "no-store",
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const record = typeof body === "object" && body !== null ? (body as { code?: unknown; message?: unknown; field_errors?: unknown }) : {};
    const code = typeof record.code === "string" ? record.code : "REQUEST_FAILED";
    const message = typeof record.message === "string" ? record.message : "The request failed.";
    const fieldErrors = Array.isArray(record.field_errors)
      ? record.field_errors.flatMap((item) => {
          if (typeof item !== "object" || item === null) {
            return [];
          }
          const field = "field" in item && typeof item.field === "string" ? item.field : "";
          const fieldMessage = "message" in item && typeof item.message === "string" ? item.message : "";
          return field && fieldMessage ? [{ field, message: fieldMessage }] : [];
        })
      : [];
    throw new StaffApiError(response.status, code, message, fieldErrors);
  }
  return shopProfileSchema.parse(body);
}

export async function removeShopLogoRequest(accessToken: string): Promise<ShopProfile> {
  return staffRequest(accessToken, "/api/v1/shop/logo", { method: "DELETE", schema: shopProfileSchema });
}

export async function fetchPublicShopBranding(): Promise<ShopBrandingPublic> {
  const response = await fetch(apiUrl("/api/v1/public/shop-branding"), {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new StaffApiError(response.status, "REQUEST_FAILED", "Could not load shop branding.");
  }
  return shopBrandingPublicSchema.parse(body);
}

export async function fetchMetalRates(
  accessToken: string,
  query: { page: number; pageSize: number },
): Promise<MetalRateList> {
  const params = new URLSearchParams({
    page: String(query.page),
    page_size: String(query.pageSize),
    sort: "effective_business_date",
    direction: "desc",
  });
  return staffRequest(accessToken, `/api/v1/shop/rates?${params.toString()}`, { schema: metalRateListSchema });
}

export async function fetchMetalRatesCoverage(
  accessToken: string,
  businessDate?: string,
): Promise<MetalRatesCoverage> {
  const params = new URLSearchParams();
  if (businessDate) {
    params.set("business_date", businessDate);
  }
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  return staffRequest(accessToken, `/api/v1/shop/rates/coverage${suffix}`, {
    schema: metalRatesCoverageSchema,
  });
}

export async function createMetalRateRequest(accessToken: string, input: MetalRateCreate): Promise<MetalRate> {
  return staffRequest(accessToken, "/api/v1/shop/rates", { method: "POST", body: input, schema: metalRateSchema });
}

export async function patchMetalRateRequest(
  accessToken: string,
  rateId: string,
  input: MetalRatePatch,
): Promise<MetalRate> {
  return staffRequest(accessToken, `/api/v1/shop/rates/${rateId}`, {
    method: "PATCH",
    body: input,
    schema: metalRateSchema,
  });
}

export async function fetchMakingChargeDefaults(
  accessToken: string,
  query: { page: number; pageSize: number },
): Promise<MakingChargeDefaultList> {
  const params = new URLSearchParams({
    page: String(query.page),
    page_size: String(query.pageSize),
    sort: "metal",
    direction: "asc",
  });
  return staffRequest(accessToken, `/api/v1/shop/making-defaults?${params.toString()}`, {
    schema: makingChargeDefaultListSchema,
  });
}

export async function upsertMakingChargeDefaultRequest(
  accessToken: string,
  input: MakingChargeDefaultUpsert,
): Promise<MakingChargeDefault> {
  return staffRequest(accessToken, "/api/v1/shop/making-defaults", {
    method: "PUT",
    body: input,
    schema: makingChargeDefaultSchema,
  });
}

export async function deleteMakingChargeDefaultRequest(accessToken: string, id: string): Promise<void> {
  const response = await fetch(apiUrl(`/api/v1/shop/making-defaults/${id}`), {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  if (response.status === 204) {
    return;
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  const record =
    typeof body === "object" && body !== null
      ? (body as { code?: unknown; message?: unknown; field_errors?: unknown })
      : {};
  const code = typeof record.code === "string" ? record.code : "REQUEST_FAILED";
  const message = typeof record.message === "string" ? record.message : "The request failed.";
  throw new StaffApiError(response.status, code, message);
}

export async function fetchSequences(accessToken: string): Promise<DocumentSequences> {
  return staffRequest(accessToken, "/api/v1/shop/sequences", { schema: documentSequencesSchema });
}

export async function patchSequences(accessToken: string, patch: DocumentSequencesPatch): Promise<DocumentSequences> {
  return staffRequest(accessToken, "/api/v1/shop/sequences", { method: "PATCH", body: patch, schema: documentSequencesSchema });
}

export async function fetchDevices(accessToken: string): Promise<DeviceSettings> {
  return staffRequest(accessToken, "/api/v1/shop/devices", { schema: deviceSettingsSchema });
}

export async function patchDevices(accessToken: string, patch: DeviceSettingsPatch): Promise<DeviceSettings> {
  return staffRequest(accessToken, "/api/v1/shop/devices", { method: "PATCH", body: patch, schema: deviceSettingsSchema });
}

export async function fetchReminders(accessToken: string): Promise<ReminderSettings> {
  return staffRequest(accessToken, "/api/v1/shop/reminders", { schema: reminderSettingsSchema });
}

export async function patchReminders(accessToken: string, patch: ReminderSettingsPatch): Promise<ReminderSettings> {
  return staffRequest(accessToken, "/api/v1/shop/reminders", { method: "PATCH", body: patch, schema: reminderSettingsSchema });
}

export async function fetchStaffDirectory(accessToken: string, query: { page: number; pageSize: number }): Promise<StaffList> {
  const params = new URLSearchParams({
    page: String(query.page),
    page_size: String(query.pageSize),
    sort: "invited_at",
    direction: "desc",
  });
  return staffRequest(accessToken, `/api/v1/staff?${params.toString()}`, { schema: staffListSchema });
}

export async function inviteStaffRequest(accessToken: string, input: StaffInviteRequest): Promise<StaffDirectoryItem> {
  return staffRequest(accessToken, "/api/v1/staff", { method: "POST", body: input, schema: staffDirectoryItemSchema });
}

export async function suspendStaffRequest(accessToken: string, staffUserId: string): Promise<StaffDirectoryItem> {
  return staffRequest(accessToken, `/api/v1/staff/${staffUserId}/suspend`, {
    method: "POST",
    body: {},
    schema: staffDirectoryItemSchema,
  });
}

export async function fetchAudit(accessToken: string, query: { page: number; pageSize: number }): Promise<AuditList> {
  const params = new URLSearchParams({
    page: String(query.page),
    page_size: String(query.pageSize),
    sort: "created_at",
    direction: "desc",
  });
  return staffRequest(accessToken, `/api/v1/audit?${params.toString()}`, { schema: auditListSchema });
}

export async function fetchCatalogueCategories(accessToken: string): Promise<CatalogueCategoryList> {
  return staffRequest(accessToken, "/api/v1/catalogue-categories", { schema: catalogueCategoryListSchema });
}

export async function createCatalogueCategoryRequest(
  accessToken: string,
  input: CatalogueCategoryCreate,
): Promise<CatalogueCategory> {
  return staffRequest(accessToken, "/api/v1/catalogue-categories", {
    method: "POST",
    body: input,
    schema: catalogueCategorySchema,
  });
}

export async function fetchStorageLocations(
  accessToken: string,
  options?: { includeInactive?: boolean },
): Promise<StorageLocationList> {
  const params = new URLSearchParams();
  if (options?.includeInactive) {
    params.set("include_inactive", "1");
  }
  const query = params.toString();
  return staffRequest(accessToken, `/api/v1/storage-locations${query ? `?${query}` : ""}`, {
    schema: storageLocationListSchema,
  });
}

export async function createStorageLocationRequest(
  accessToken: string,
  input: StorageLocationCreate,
): Promise<StorageLocation> {
  return staffRequest(accessToken, "/api/v1/storage-locations", {
    method: "POST",
    body: input,
    schema: storageLocationSchema,
  });
}

export async function patchStorageLocationRequest(
  accessToken: string,
  locationId: string,
  input: StorageLocationPatch,
): Promise<StorageLocation> {
  return staffRequest(accessToken, `/api/v1/storage-locations/${locationId}`, {
    method: "PATCH",
    body: input,
    schema: storageLocationSchema,
  });
}

export async function fetchPurityLabels(
  accessToken: string,
  options?: { includeInactive?: boolean },
): Promise<PurityLabelList> {
  const params = new URLSearchParams();
  if (options?.includeInactive) {
    params.set("include_inactive", "1");
  }
  const query = params.toString();
  return staffRequest(accessToken, `/api/v1/purity-labels${query ? `?${query}` : ""}`, {
    schema: purityLabelListSchema,
  });
}

export async function createPurityLabelRequest(
  accessToken: string,
  input: PurityLabelCreate,
): Promise<PurityLabel> {
  return staffRequest(accessToken, "/api/v1/purity-labels", {
    method: "POST",
    body: input,
    schema: purityLabelSchema,
  });
}

export async function patchPurityLabelRequest(
  accessToken: string,
  purityLabelId: string,
  input: PurityLabelPatch,
): Promise<PurityLabel> {
  return staffRequest(accessToken, `/api/v1/purity-labels/${purityLabelId}`, {
    method: "PATCH",
    body: input,
    schema: purityLabelSchema,
  });
}

export type ArticleListQuery = {
  page: number;
  pageSize: number;
  q?: string;
  barcode?: string;
  articleNumber?: string;
  categoryId?: string;
  metal?: "gold" | "silver";
  purity?: string;
  status?: string;
  minGrossWeightGrams?: string;
  maxGrossWeightGrams?: string;
};

export async function fetchArticles(accessToken: string, query: ArticleListQuery): Promise<ArticleList> {
  const params = new URLSearchParams({
    page: String(query.page),
    page_size: String(query.pageSize),
    sort: "created_at",
    direction: "desc",
  });
  if (query.q) params.set("q", query.q);
  if (query.barcode) params.set("barcode", query.barcode);
  if (query.articleNumber) params.set("article_number", query.articleNumber);
  if (query.categoryId) params.set("category_id", query.categoryId);
  if (query.metal) params.set("metal", query.metal);
  if (query.purity) params.set("purity", query.purity);
  if (query.status) params.set("status", query.status);
  if (query.minGrossWeightGrams) params.set("min_gross_weight_grams", query.minGrossWeightGrams);
  if (query.maxGrossWeightGrams) params.set("max_gross_weight_grams", query.maxGrossWeightGrams);
  return staffRequest(accessToken, `/api/v1/articles?${params.toString()}`, { schema: articleListSchema });
}

export async function fetchArticle(accessToken: string, articleId: string): Promise<Article> {
  return staffRequest(accessToken, `/api/v1/articles/${articleId}`, { schema: articleSchema });
}

export async function lookupArticle(accessToken: string, barcode: string, forSale = false): Promise<Article> {
  const params = new URLSearchParams({ barcode });
  if (forSale) {
    params.set("for_sale", "true");
  }
  return staffRequest(accessToken, `/api/v1/articles/lookup?${params.toString()}`, { schema: articleSchema });
}

export async function receiveArticleRequest(accessToken: string, input: ArticleCreate): Promise<Article> {
  return staffRequest(accessToken, "/api/v1/articles", { method: "POST", body: input, schema: articleSchema });
}

export async function patchArticleRequest(accessToken: string, articleId: string, input: ArticlePatch): Promise<Article> {
  return staffRequest(accessToken, `/api/v1/articles/${articleId}`, { method: "PATCH", body: input, schema: articleSchema });
}

export async function adjustArticleRequest(
  accessToken: string,
  articleId: string,
  input: ArticleAdjustment,
): Promise<Article> {
  return staffRequest(accessToken, `/api/v1/articles/${articleId}/adjustments`, {
    method: "POST",
    body: input,
    schema: articleSchema,
  });
}

export async function releaseArticleInspectionRequest(
  accessToken: string,
  articleId: string,
  input: ArticleInspectionRelease,
): Promise<Article> {
  return staffRequest(accessToken, `/api/v1/articles/${articleId}/inspection-release`, {
    method: "POST",
    body: input,
    schema: articleSchema,
  });
}

export async function fetchArticleMovements(accessToken: string, articleId: string): Promise<InventoryMovementList> {
  return staffRequest(accessToken, `/api/v1/articles/${articleId}/movements`, { schema: inventoryMovementListSchema });
}

export async function createStockCountRequest(accessToken: string, input: StockCountCreate): Promise<StockCount> {
  return staffRequest(accessToken, "/api/v1/stock-counts", { method: "POST", body: input, schema: stockCountSchema });
}

export async function deleteArticleRequest(accessToken: string, articleId: string): Promise<void> {
  const response = await fetch(apiUrl(`/api/v1/articles/${articleId}`), {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  if (response.status === 204) {
    return;
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  const parsed = body as { code?: string; message?: string; field_errors?: { field: string; message: string }[] } | null;
  throw new StaffApiError(
    response.status,
    parsed?.code ?? "REQUEST_FAILED",
    parsed?.message ?? "The request failed.",
    parsed?.field_errors ?? [],
  );
}

export async function bulkDeleteArticlesRequest(
  accessToken: string,
  ids: string[],
): Promise<ArticleBulkDeleteResult> {
  return staffRequest(accessToken, "/api/v1/articles/bulk-delete", {
    method: "POST",
    body: { ids },
    schema: articleBulkDeleteResultSchema,
  });
}

export async function assignArticleBarcodeRequest(accessToken: string, articleId: string): Promise<Article> {
  return staffRequest(accessToken, `/api/v1/articles/${articleId}/barcode`, {
    method: "POST",
    body: {},
    schema: articleSchema,
  });
}

export async function assignArticleBarcodesBatchRequest(
  accessToken: string,
  ids: string[],
): Promise<ArticleBarcodeBatchResult> {
  return staffRequest(accessToken, "/api/v1/articles/barcodes/batch", {
    method: "POST",
    body: { ids },
    schema: articleBarcodeBatchResultSchema,
  });
}

export async function fetchTagPreview(accessToken: string, articleId: string): Promise<TagPreview> {
  return staffRequest(accessToken, `/api/v1/articles/${articleId}/tag-preview`, { schema: tagPreviewSchema });
}

export async function recordTagPrintRequest(
  accessToken: string,
  articleId: string,
  input: TagPrintCreate,
): Promise<TagPrintEvent> {
  return staffRequest(accessToken, `/api/v1/articles/${articleId}/tag-prints`, {
    method: "POST",
    body: input,
    schema: tagPrintEventSchema,
  });
}

export async function fetchCustomers(
  accessToken: string,
  input: {
    page: number;
    pageSize: number;
    sort?: "name" | "created_at" | "phone";
    direction?: "asc" | "desc";
    q?: string;
    isActive?: boolean;
    isWalkIn?: boolean;
    whatsappConsent?: "granted" | "revoked" | "none";
  },
): Promise<CustomerList> {
  const params = new URLSearchParams({
    page: String(input.page),
    page_size: String(input.pageSize),
    sort: input.sort ?? "created_at",
    direction: input.direction ?? "desc",
  });
  if (input.q) {
    params.set("q", input.q);
  }
  if (input.isActive === false) {
    params.set("is_active", "false");
  } else if (input.isActive === true) {
    params.set("is_active", "true");
  }
  if (input.isWalkIn === true) {
    params.set("is_walk_in", "true");
  } else if (input.isWalkIn === false) {
    params.set("is_walk_in", "false");
  }
  if (input.whatsappConsent) {
    params.set("whatsapp_consent", input.whatsappConsent);
  }
  return staffRequest(accessToken, `/api/v1/customers?${params.toString()}`, { schema: customerListSchema });
}

export async function fetchCustomer(accessToken: string, customerId: string): Promise<Customer> {
  return staffRequest(accessToken, `/api/v1/customers/${customerId}`, { schema: customerSchema });
}

export async function createCustomerRequest(accessToken: string, input: CustomerCreate): Promise<Customer> {
  return staffRequest(accessToken, "/api/v1/customers", { method: "POST", body: input, schema: customerSchema });
}

export async function patchCustomerRequest(
  accessToken: string,
  customerId: string,
  input: CustomerPatch,
): Promise<Customer> {
  return staffRequest(accessToken, `/api/v1/customers/${customerId}`, {
    method: "PATCH",
    body: input,
    schema: customerSchema,
  });
}

export async function fetchCustomerConsents(accessToken: string, customerId: string): Promise<CustomerConsentList> {
  return staffRequest(accessToken, `/api/v1/customers/${customerId}/consents`, { schema: customerConsentListSchema });
}

export async function putCustomerConsentsRequest(
  accessToken: string,
  customerId: string,
  input: CustomerConsentsPut,
): Promise<CustomerConsentList> {
  return staffRequest(accessToken, `/api/v1/customers/${customerId}/consents`, {
    method: "PUT",
    body: input,
    schema: customerConsentListSchema,
  });
}

export async function fetchCustomerIdentityFiles(
  accessToken: string,
  customerId: string,
): Promise<CustomerIdentityFileList> {
  return staffRequest(accessToken, `/api/v1/customers/${customerId}/identity-files`, {
    schema: customerIdentityFileListSchema,
  });
}

export async function quoteInvoiceRequest(
  accessToken: string,
  input: InvoiceQuoteRequest,
): Promise<InvoiceQuoteResponse> {
  return staffRequest(accessToken, "/api/v1/invoices/quote", {
    method: "POST",
    body: input,
    schema: invoiceQuoteResponseSchema,
  });
}

export async function createInvoiceDraftRequest(
  accessToken: string,
  input: InvoiceDraftCreate,
): Promise<Invoice> {
  return staffRequest(accessToken, "/api/v1/invoices/drafts", {
    method: "POST",
    body: input,
    schema: invoiceSchema,
  });
}

export async function fetchInvoiceDraft(accessToken: string, invoiceId: string): Promise<Invoice> {
  return staffRequest(accessToken, `/api/v1/invoices/drafts/${invoiceId}`, { schema: invoiceSchema });
}

export async function patchInvoiceDraftRequest(
  accessToken: string,
  invoiceId: string,
  input: InvoiceDraftPatch,
): Promise<Invoice> {
  return staffRequest(accessToken, `/api/v1/invoices/drafts/${invoiceId}`, {
    method: "PATCH",
    body: input,
    schema: invoiceSchema,
  });
}

export async function quickReceiveArticleOntoDraftRequest(
  accessToken: string,
  invoiceId: string,
  input: InvoiceDraftQuickArticle,
): Promise<Invoice> {
  return staffRequest(accessToken, `/api/v1/invoices/drafts/${invoiceId}/quick-articles`, {
    method: "POST",
    body: input,
    schema: invoiceSchema,
  });
}

export async function fetchInvoices(
  accessToken: string,
  query: {
    page: number;
    pageSize: number;
    sort?: "updated_at" | "business_date" | "grand_total_inr" | "status";
    direction?: "asc" | "desc";
    status?: "draft" | "finalized";
    customerId?: string;
    businessDateFrom?: string;
    businessDateTo?: string;
    q?: string;
    hasDue?: boolean;
  },
): Promise<InvoiceList> {
  const params = new URLSearchParams({
    page: String(query.page),
    page_size: String(query.pageSize),
    sort: query.sort ?? "updated_at",
    direction: query.direction ?? "desc",
  });
  if (query.status) {
    params.set("status", query.status);
  }
  if (query.customerId) {
    params.set("customer_id", query.customerId);
  }
  if (query.businessDateFrom) {
    params.set("business_date_from", query.businessDateFrom);
  }
  if (query.businessDateTo) {
    params.set("business_date_to", query.businessDateTo);
  }
  if (query.q) {
    params.set("q", query.q);
  }
  if (query.hasDue === true) {
    params.set("has_due", "1");
  } else if (query.hasDue === false) {
    params.set("has_due", "0");
  }
  return staffRequest(accessToken, `/api/v1/invoices?${params.toString()}`, { schema: invoiceListSchema });
}

export async function fetchInvoice(accessToken: string, invoiceId: string): Promise<Invoice> {
  return staffRequest(accessToken, `/api/v1/invoices/${invoiceId}`, { schema: invoiceSchema });
}

export async function finalizeInvoiceRequest(
  accessToken: string,
  invoiceId: string,
  input: InvoiceFinalize,
  idempotencyKey: string,
): Promise<Invoice> {
  return staffRequest(accessToken, `/api/v1/invoices/${invoiceId}/finalize`, {
    method: "POST",
    body: input,
    schema: invoiceSchema,
    headers: { "Idempotency-Key": idempotencyKey },
  });
}

export async function acceptInvoiceReturnRequest(
  accessToken: string,
  invoiceId: string,
  input: InvoiceReturnCreate,
  idempotencyKey: string,
): Promise<InvoiceReturnAcceptResult> {
  return staffRequest(accessToken, `/api/v1/invoices/${invoiceId}/returns`, {
    method: "POST",
    body: input,
    schema: invoiceReturnAcceptResultSchema,
    headers: { "Idempotency-Key": idempotencyKey },
  });
}

export async function fetchInvoiceCorrections(
  accessToken: string,
  invoiceId: string,
): Promise<InvoiceCorrections> {
  return staffRequest(accessToken, `/api/v1/invoices/${invoiceId}/corrections`, {
    schema: invoiceCorrectionsSchema,
  });
}

export async function recordPaymentRequest(
  accessToken: string,
  input: PaymentCreate,
  idempotencyKey: string,
): Promise<PaymentCreateResult> {
  return staffRequest(accessToken, "/api/v1/payments", {
    method: "POST",
    body: input,
    schema: paymentCreateResultSchema,
    headers: { "Idempotency-Key": idempotencyKey },
  });
}

export async function fetchPayments(
  accessToken: string,
  query: {
    page: number;
    pageSize: number;
    sort?: "received_at" | "received_business_date" | "amount_inr";
    direction?: "asc" | "desc";
    customerId?: string;
    invoiceId?: string;
    method?: PaymentMethod;
    receivedBusinessDate?: string;
    receivedBusinessDateFrom?: string;
    receivedBusinessDateTo?: string;
    q?: string;
  },
): Promise<PaymentList> {
  const params = new URLSearchParams({
    page: String(query.page),
    page_size: String(query.pageSize),
    sort: query.sort ?? "received_at",
    direction: query.direction ?? "desc",
  });
  if (query.customerId) {
    params.set("customer_id", query.customerId);
  }
  if (query.invoiceId) {
    params.set("invoice_id", query.invoiceId);
  }
  if (query.method) {
    params.set("method", query.method);
  }
  if (query.receivedBusinessDate) {
    params.set("received_business_date", query.receivedBusinessDate);
  }
  if (query.receivedBusinessDateFrom) {
    params.set("received_business_date_from", query.receivedBusinessDateFrom);
  }
  if (query.receivedBusinessDateTo) {
    params.set("received_business_date_to", query.receivedBusinessDateTo);
  }
  if (query.q) {
    params.set("q", query.q);
  }
  return staffRequest(accessToken, `/api/v1/payments?${params.toString()}`, { schema: paymentListSchema });
}

export async function fetchPayment(accessToken: string, paymentId: string): Promise<Payment> {
  return staffRequest(accessToken, `/api/v1/payments/${paymentId}`, { schema: paymentSchema });
}

export async function refundPaymentRequest(
  accessToken: string,
  paymentId: string,
  input: PaymentRefundCreate,
  idempotencyKey: string,
): Promise<Payment> {
  return staffRequest(accessToken, `/api/v1/payments/${paymentId}/refunds`, {
    method: "POST",
    body: input,
    schema: paymentSchema,
    headers: { "Idempotency-Key": idempotencyKey },
  });
}

export async function reversePaymentRequest(
  accessToken: string,
  paymentId: string,
  input: PaymentReversalCreate,
  idempotencyKey: string,
): Promise<Payment> {
  return staffRequest(accessToken, `/api/v1/payments/${paymentId}/reversals`, {
    method: "POST",
    body: input,
    schema: paymentSchema,
    headers: { "Idempotency-Key": idempotencyKey },
  });
}

export async function fetchInvoicePayments(accessToken: string, invoiceId: string): Promise<InvoicePayments> {
  return staffRequest(accessToken, `/api/v1/invoices/${invoiceId}/payments`, { schema: invoicePaymentsSchema });
}

export async function fetchCustomerSalesStatement(
  accessToken: string,
  customerId: string,
): Promise<CustomerSalesStatement> {
  return staffRequest(accessToken, `/api/v1/customers/${customerId}/sales-statement`, {
    schema: customerSalesStatementSchema,
  });
}

export async function fetchDailyCollections(
  accessToken: string,
  period?: { businessDate?: string; from?: string; to?: string },
): Promise<DailyCollections> {
  const params = new URLSearchParams();
  if (period?.businessDate) {
    params.set("business_date", period.businessDate);
  }
  if (period?.from) {
    params.set("business_date_from", period.from);
  }
  if (period?.to) {
    params.set("business_date_to", period.to);
  }
  const query = params.toString();
  return staffRequest(accessToken, `/api/v1/collections/daily${query ? `?${query}` : ""}`, {
    schema: dailyCollectionsSchema,
  });
}

/** Net collections (in minus refunds/reversals) for a period, by method and business date. */
export async function fetchCollectionsReport(
  accessToken: string,
  range: { from?: string; to?: string },
): Promise<CollectionsReport> {
  return staffRequest(accessToken, `/api/v1/reports/collections${reportRangeQuery(range)}`, {
    schema: collectionsReportSchema,
  });
}

export async function fetchGirviAccounts(
  accessToken: string,
  filters: {
    page: number;
    pageSize: number;
    sort?: GirviAccountListQuery["sort"];
    direction?: GirviAccountListQuery["direction"];
    status?: GirviAccountStatus;
    customerId?: string;
    maturityFrom?: string;
    maturityTo?: string;
    isOverdue?: boolean;
    q?: string;
  },
): Promise<GirviAccountList> {
  const params = new URLSearchParams({
    page: String(filters.page),
    page_size: String(filters.pageSize),
    sort: filters.sort ?? "created_at",
    direction: filters.direction ?? "desc",
  });
  if (filters.status) {
    params.set("status", filters.status);
  }
  if (filters.customerId) {
    params.set("customer_id", filters.customerId);
  }
  if (filters.maturityFrom) {
    params.set("maturity_from", filters.maturityFrom);
  }
  if (filters.maturityTo) {
    params.set("maturity_to", filters.maturityTo);
  }
  if (filters.isOverdue === true) {
    params.set("is_overdue", "true");
  }
  if (filters.q) {
    params.set("q", filters.q);
  }
  return staffRequest(accessToken, `/api/v1/girvi/accounts?${params.toString()}`, {
    schema: girviAccountListSchema,
  });
}

export async function fetchGirviAccount(accessToken: string, accountId: string): Promise<GirviAccount> {
  return staffRequest(accessToken, `/api/v1/girvi/accounts/${accountId}`, { schema: girviAccountSchema });
}

export async function createGirviAccount(
  accessToken: string,
  input: GirviAccountCreate,
): Promise<GirviAccount> {
  girviAccountCreateSchema.parse(input);
  return staffRequest(accessToken, "/api/v1/girvi/accounts", {
    method: "POST",
    body: input,
    schema: girviAccountSchema,
  });
}

export async function patchGirviAccount(
  accessToken: string,
  accountId: string,
  input: GirviAccountPatch,
): Promise<GirviAccount> {
  girviAccountPatchSchema.parse(input);
  return staffRequest(accessToken, `/api/v1/girvi/accounts/${accountId}`, {
    method: "PATCH",
    body: input,
    schema: girviAccountSchema,
  });
}

export async function discardGirviDraftRequest(
  accessToken: string,
  accountId: string,
  rowVersion: number,
): Promise<void> {
  const response = await fetch(
    apiUrl(`/api/v1/girvi/accounts/${accountId}?row_version=${encodeURIComponent(String(rowVersion))}`),
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    },
  );
  if (response.status === 204) {
    return;
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  const parsed = body as { code?: string; message?: string; field_errors?: { field: string; message: string }[] } | null;
  throw new StaffApiError(
    response.status,
    parsed?.code ?? "REQUEST_FAILED",
    parsed?.message ?? "The request failed.",
    parsed?.field_errors ?? [],
  );
}

export async function activateGirviAccountRequest(
  accessToken: string,
  accountId: string,
  input: GirviAccountActivate,
  idempotencyKey: string,
): Promise<GirviAccount> {
  girviAccountActivateSchema.parse(input);
  return staffRequest(accessToken, `/api/v1/girvi/accounts/${accountId}/activate`, {
    method: "POST",
    body: input,
    schema: girviAccountSchema,
    headers: { "Idempotency-Key": idempotencyKey },
  });
}

/** Reading a statement never posts interest; it recalculates from frozen terms. */
export async function fetchGirviStatement(
  accessToken: string,
  accountId: string,
  asOf?: string,
): Promise<GirviStatementDto> {
  const query = asOf ? `?as_of=${encodeURIComponent(asOf)}` : "";
  return staffRequest(accessToken, `/api/v1/girvi/accounts/${accountId}/statement${query}`, {
    schema: girviStatementSchema,
  });
}

export async function recordGirviRepaymentRequest(
  accessToken: string,
  accountId: string,
  input: GirviRepaymentCreate,
  idempotencyKey: string,
): Promise<GirviRepaymentResult> {
  girviRepaymentCreateSchema.parse(input);
  return staffRequest(accessToken, `/api/v1/girvi/accounts/${accountId}/repayments`, {
    method: "POST",
    body: input,
    schema: girviRepaymentResultSchema,
    headers: { "Idempotency-Key": idempotencyKey },
  });
}

export async function quoteGirviSettlementRequest(
  accessToken: string,
  accountId: string,
  businessDate?: string,
): Promise<GirviSettlementQuote> {
  return staffRequest(accessToken, `/api/v1/girvi/accounts/${accountId}/settlement-quote`, {
    method: "POST",
    body: businessDate ? { business_date: businessDate } : {},
    schema: girviSettlementQuoteSchema,
  });
}

export async function settleGirviAccountRequest(
  accessToken: string,
  accountId: string,
  input: GirviSettlementCreate,
  idempotencyKey: string,
): Promise<GirviSettlementResult> {
  girviSettlementCreateSchema.parse(input);
  return staffRequest(accessToken, `/api/v1/girvi/accounts/${accountId}/settle`, {
    method: "POST",
    body: input,
    schema: girviSettlementResultSchema,
    headers: { "Idempotency-Key": idempotencyKey },
  });
}

export async function releaseGirviCollateralRequest(
  accessToken: string,
  accountId: string,
  input: GirviReleaseCreate,
  idempotencyKey: string,
): Promise<GirviReleaseResult> {
  girviReleaseCreateSchema.parse(input);
  return staffRequest(accessToken, `/api/v1/girvi/accounts/${accountId}/release`, {
    method: "POST",
    body: input,
    schema: girviReleaseResultSchema,
    headers: { "Idempotency-Key": idempotencyKey },
  });
}

export async function moveGirviCustodyRequest(
  accessToken: string,
  accountId: string,
  input: GirviCustodyMoveCreate,
  idempotencyKey: string,
): Promise<GirviCustodyMoveResult> {
  girviCustodyMoveCreateSchema.parse(input);
  return staffRequest(accessToken, `/api/v1/girvi/accounts/${accountId}/custody-moves`, {
    method: "POST",
    body: input,
    schema: girviCustodyMoveResultSchema,
    headers: { "Idempotency-Key": idempotencyKey },
  });
}

export async function uploadGirviCollateralFileRequest(
  accessToken: string,
  accountId: string,
  itemId: string,
  file: File,
  purpose: "collateral_photo" | "packet_photo" = "collateral_photo",
): Promise<import("@aabhushan/contracts").GirviCollateralFileUploadResult> {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(
    apiUrl(
      `/api/v1/girvi/accounts/${accountId}/collateral/${itemId}/files?purpose=${encodeURIComponent(purpose)}`,
    ),
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      body: form,
    },
  );
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) {
    const parsed = body as { code?: string; message?: string; field_errors?: { field: string; message: string }[] } | null;
    throw new StaffApiError(
      response.status,
      parsed?.code ?? "REQUEST_FAILED",
      parsed?.message ?? "The request failed.",
      parsed?.field_errors ?? [],
    );
  }
  return body as import("@aabhushan/contracts").GirviCollateralFileUploadResult;
}

export async function fetchGirviCollateralFileView(
  accessToken: string,
  accountId: string,
  itemId: string,
  fileId: string,
): Promise<import("@aabhushan/contracts").GirviCollateralFileView> {
  return staffRequest(
    accessToken,
    `/api/v1/girvi/accounts/${accountId}/collateral/${itemId}/files/${fileId}`,
    {
      schema: {
        parse: (value) => value as import("@aabhushan/contracts").GirviCollateralFileView,
      },
    },
  );
}

export async function fetchOwnerDocuments(
  accessToken: string,
  input: { ownerType: "invoice" | "receipt" | "girvi"; ownerId: string },
): Promise<DocumentList> {
  const params = new URLSearchParams({
    owner_type: input.ownerType,
    owner_id: input.ownerId,
  });
  return staffRequest(accessToken, `/api/v1/documents?${params.toString()}`, {
    schema: documentListSchema,
  });
}

export async function retryDocumentRequest(accessToken: string, documentId: string): Promise<Document> {
  return staffRequest(accessToken, `/api/v1/documents/${documentId}/retry`, {
    method: "POST",
    schema: documentSchema,
  });
}

export async function fetchInvoicePrint(accessToken: string, invoiceId: string): Promise<InvoicePrint> {
  return staffRequest(accessToken, `/api/v1/invoices/${invoiceId}/print`, {
    schema: invoicePrintSchema,
  });
}

export async function fetchReceiptPrint(accessToken: string, paymentId: string): Promise<ReceiptPrint> {
  return staffRequest(accessToken, `/api/v1/payments/${paymentId}/print`, {
    schema: receiptPrintSchema,
  });
}

export async function fetchNotifications(
  accessToken: string,
  input: {
    page: number;
    pageSize: number;
    status?: import("@aabhushan/contracts").NotificationStatus;
    purpose?: import("@aabhushan/contracts").NotificationPurpose;
    customerId?: string;
  },
): Promise<import("@aabhushan/contracts").NotificationListResponse> {
  const params = new URLSearchParams({
    page: String(input.page),
    page_size: String(input.pageSize),
  });
  if (input.status) {
    params.set("status", input.status);
  }
  if (input.purpose) {
    params.set("purpose", input.purpose);
  }
  if (input.customerId) {
    params.set("customer_id", input.customerId);
  }
  return staffRequest(accessToken, `/api/v1/notifications?${params.toString()}`, {
    schema: {
      parse: (value) => value as import("@aabhushan/contracts").NotificationListResponse,
    },
  });
}

export async function fetchNotificationAttention(
  accessToken: string,
): Promise<import("@aabhushan/contracts").NotificationAttention> {
  return staffRequest(accessToken, "/api/v1/notifications/attention", {
    schema: {
      parse: (value) => value as import("@aabhushan/contracts").NotificationAttention,
    },
  });
}

export async function retryNotificationRequest(
  accessToken: string,
  notificationId: string,
): Promise<{ notification: import("@aabhushan/contracts").Notification }> {
  return staffRequest(accessToken, `/api/v1/notifications/${notificationId}/retry`, {
    method: "POST",
    schema: {
      parse: (value) => value as { notification: import("@aabhushan/contracts").Notification },
    },
  });
}

function reportRangeQuery(input: { from?: string; to?: string }): string {
  const params = new URLSearchParams();
  if (input.from) {
    params.set("business_date_from", input.from);
  }
  if (input.to) {
    params.set("business_date_to", input.to);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export async function fetchDashboardReport(
  accessToken: string,
  range: { from?: string; to?: string },
): Promise<import("@aabhushan/contracts").DashboardReport> {
  return staffRequest(accessToken, `/api/v1/reports/dashboard${reportRangeQuery(range)}`, {
    schema: dashboardReportSchema,
  });
}

export async function createExportRequest(
  accessToken: string,
  input: import("@aabhushan/contracts").ExportCreate,
): Promise<import("@aabhushan/contracts").ExportResult> {
  return staffRequest(accessToken, "/api/v1/exports", {
    method: "POST",
    body: input,
    schema: exportResultSchema,
  });
}

export async function fetchExportJob(
  accessToken: string,
  exportJobId: string,
): Promise<import("@aabhushan/contracts").ExportResult> {
  return staffRequest(accessToken, `/api/v1/exports/${exportJobId}`, {
    schema: exportResultSchema,
  });
}
