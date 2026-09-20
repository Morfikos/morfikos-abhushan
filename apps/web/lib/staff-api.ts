import {
  auditListSchema,
  currentStaffSchema,
  deviceSettingsSchema,
  documentSequencesSchema,
  metalRateListSchema,
  metalRateSchema,
  reminderSettingsSchema,
  shopProfileSchema,
  staffDirectoryItemSchema,
  staffListSchema,
  articleListSchema,
  articleSchema,
  catalogueCategoryListSchema,
  catalogueCategorySchema,
  inventoryMovementListSchema,
  stockCountSchema,
  storageLocationListSchema,
  storageLocationSchema,
  articleBulkDeleteResultSchema,
  type Article,
  type ArticleAdjustment,
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
  type ReminderSettings,
  type ReminderSettingsPatch,
  type ShopProfile,
  type ShopProfilePatch,
  type StaffDirectoryItem,
  type StaffInviteRequest,
  type StaffList,
  type StockCount,
  type StockCountCreate,
  type StorageLocation,
  type StorageLocationCreate,
  type StorageLocationList,
} from "@aabhushan/contracts";

import { publicEnv } from "@/lib/public-env";

export class StaffApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors: { field: string; message: string }[];

  constructor(status: number, code: string, message: string, fieldErrors: { field: string; message: string }[] = []) {
    super(message);
    this.name = "StaffApiError";
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

function apiUrl(path: string): string {
  return `${publicEnv.NEXT_PUBLIC_API_URL}${path}`;
}

async function staffRequest<T>(
  accessToken: string,
  path: string,
  options: { method?: string; body?: unknown; schema: { parse: (value: unknown) => T } },
): Promise<T> {
  const response = await fetch(apiUrl(path), {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : null,
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

export async function createMetalRateRequest(accessToken: string, input: MetalRateCreate): Promise<MetalRate> {
  return staffRequest(accessToken, "/api/v1/shop/rates", { method: "POST", body: input, schema: metalRateSchema });
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

export async function fetchStorageLocations(accessToken: string): Promise<StorageLocationList> {
  return staffRequest(accessToken, "/api/v1/storage-locations", { schema: storageLocationListSchema });
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

export type ArticleListQuery = {
  page: number;
  pageSize: number;
  q?: string;
  barcode?: string;
  articleNumber?: string;
  categoryId?: string;
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
