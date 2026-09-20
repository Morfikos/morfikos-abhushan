import {
  TAG_BARCODE_MIN_HEIGHT_MM,
  TAG_TEMPLATE_VERSION,
  articleBarcodePayload,
  canAdjustArticleStatus,
  canReleaseFromInspection,
  articleDeleteBlockedReason,
  articleIsMistakenReceiptDeletable,
  kolkataBusinessDate,
  netMetalWeightIsPositive,
  netMetalWeightMatches,
  tagBarcodeHeightMm,
  tagCanShowLogo,
  type ShopLogoContentType,
} from "@aabhushan/domain";
import type {
  Article,
  ArticleAdjustment,
  ArticleBulkDeleteResult,
  ArticleCreate,
  ArticleInspectionRelease,
  ArticleListItem,
  ArticlePatch,
  ArticlePhotographInput,
  ArticleStatus,
  CatalogueCategory,
  CatalogueCategoryCreate,
  InventoryMovement,
  Metal,
  StockCount,
  StockCountCreate,
  StorageLocation,
  StorageLocationCreate,
  TagPreview,
  TagPrintCreate,
  TagPrintEvent,
} from "@aabhushan/contracts";

import { assertAnyPermission, assertPermission } from "./authorize";
import { conflictError, notFoundError, validationError } from "./http-error";
import type { PaginatedRows, PaginationInput } from "./shop-settings";
import type { ResolvedStaffAccess } from "./staff-access";

export type ArticleListFilters = PaginationInput & {
  q?: string;
  barcode?: string;
  articleNumber?: string;
  categoryId?: string;
  metal?: Metal;
  purity?: string;
  status?: ArticleStatus;
  minGrossWeightGrams?: string;
  maxGrossWeightGrams?: string;
};

export type InventoryAuditWrite = {
  action: string;
  entityType: string;
  entityId?: string;
  reason?: string;
  payload?: Record<string, unknown>;
};

export type InventoryRepository = {
  listCategories(): Promise<CatalogueCategory[]>;
  insertCategory(input: CatalogueCategoryCreate): Promise<CatalogueCategory>;
  listLocations(): Promise<StorageLocation[]>;
  insertLocation(input: StorageLocationCreate): Promise<StorageLocation>;
  categoryExists(categoryId: string): Promise<boolean>;
  locationExists(locationId: string): Promise<boolean>;
  listArticles(input: ArticleListFilters): Promise<PaginatedRows<ArticleListItem>>;
  getArticle(articleId: string): Promise<Article | null>;
  getArticleByBarcode(barcode: string): Promise<Article | null>;
  allocateArticleNumber(): Promise<string>;
  insertArticle(input: {
    articleNumber: string;
    categoryId: string;
    metal: ArticleCreate["metal"];
    purity: string;
    grossWeightGrams: string;
    nonMetalWeightGrams: string;
    netMetalWeightGrams: string;
    huid: string | null;
    supplierRef: string | null;
    karigarRef: string | null;
    receiptBusinessDate: string;
    acquisitionCostInr: string | null;
    locationId: string | null;
    stones: { description: string; weightGrams: string | null }[];
    photograph: ArticlePhotographInput | null;
    actorStaffUserId: string;
  }): Promise<Article>;
  updateArticle(input: {
    articleId: string;
    expectedVersion: number;
    categoryId?: string;
    metal?: ArticleCreate["metal"];
    purity?: string;
    grossWeightGrams?: string;
    nonMetalWeightGrams?: string;
    netMetalWeightGrams?: string;
    huid?: string | null;
    supplierRef?: string | null;
    karigarRef?: string | null;
    locationId?: string | null;
    photograph?: ArticlePhotographInput;
  }): Promise<Article | null>;
  applyStatusChange(input: {
    articleId: string;
    expectedVersion: number;
    fromStatus: ArticleStatus;
    toStatus: ArticleStatus;
    locationId?: string | null;
    movementType: "adjustment" | "inspection_release";
    reason: string | null;
    actorStaffUserId: string;
  }): Promise<Article | null>;
  listMovements(articleId: string): Promise<InventoryMovement[]>;
  getArticlesByIds(articleIds: string[]): Promise<ArticleListItem[]>;
  getArticleDeleteEligibility(articleId: string): Promise<{
    articleNumber: string;
    status: ArticleStatus;
    movementTypes: InventoryMovement["movement_type"][];
    hasStockCountReference: boolean;
  } | null>;
  deleteMistakenReceiptArticle(articleId: string): Promise<void>;
  insertReviewedStockCount(input: {
    countedOn: string;
    notes: string | null;
    actorStaffUserId: string;
    lines: {
      articleId: string;
      articleNumber: string;
      expectedStatus: ArticleStatus;
      countedStatus: StockCountCreate["lines"][number]["counted_status"];
      hasDiscrepancy: boolean;
      adjustmentToStatus: ArticleStatus | null;
    }[];
  }): Promise<StockCount>;
  assignBarcodeIfMissing(articleId: string, payload: string): Promise<{ article: Article; assigned: boolean } | null>;
  getDeviceTagLayout(): Promise<{ tagWidthMm: string; tagHeightMm: string } | null>;
  getShopTagBranding(): Promise<{
    legalName: string;
    logoObjectKey: string | null;
    logoContentType: ShopLogoContentType | null;
  } | null>;
  insertTagPrintEvent(input: {
    articleId: string;
    barcode: string;
    printKind: TagPrintCreate["print_kind"];
    reason: string | null;
    templateVersion: string;
    actorStaffUserId: string;
  }): Promise<TagPrintEvent>;
  writeAudit(event: InventoryAuditWrite & { actorStaffUserId: string | null }): Promise<void>;
};

function missingArticle(): never {
  throw notFoundError("The requested article was not found.");
}

function invalidWeights(): never {
  throw validationError("Net metal weight must equal gross weight minus non-metal weight.", [
    { field: "net_metal_weight_grams", message: "Does not match gross minus non-metal weight." },
  ]);
}

export function assertArticleWeights(input: {
  grossWeightGrams: string;
  nonMetalWeightGrams: string;
  netMetalWeightGrams: string;
}): void {
  if (!netMetalWeightIsPositive(input) || !netMetalWeightMatches(input)) {
    invalidWeights();
  }
}

export async function listCatalogueCategories(
  repository: InventoryRepository,
  access: ResolvedStaffAccess,
): Promise<CatalogueCategory[]> {
  assertPermission(access, "inventory.read");
  return repository.listCategories();
}

export async function createCatalogueCategory(
  repository: InventoryRepository,
  access: ResolvedStaffAccess,
  input: CatalogueCategoryCreate,
): Promise<CatalogueCategory> {
  assertPermission(access, "inventory.write");
  try {
    const category = await repository.insertCategory(input);
    await repository.writeAudit({
      actorStaffUserId: access.staff_user_id,
      action: "inventory.category.create",
      entityType: "catalogue_category",
      entityId: category.id,
      payload: { name: category.name },
    });
    return category;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw conflictError("CATEGORY_NAME_CONFLICT", "A category with this name already exists.");
    }
    throw error;
  }
}

export async function listStorageLocations(
  repository: InventoryRepository,
  access: ResolvedStaffAccess,
): Promise<StorageLocation[]> {
  assertPermission(access, "inventory.read");
  return repository.listLocations();
}

export async function createStorageLocation(
  repository: InventoryRepository,
  access: ResolvedStaffAccess,
  input: StorageLocationCreate,
): Promise<StorageLocation> {
  assertPermission(access, "inventory.write");
  try {
    const location = await repository.insertLocation(input);
    await repository.writeAudit({
      actorStaffUserId: access.staff_user_id,
      action: "inventory.location.create",
      entityType: "storage_location",
      entityId: location.id,
      payload: { name: location.name },
    });
    return location;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw conflictError("LOCATION_NAME_CONFLICT", "A storage location with this name already exists.");
    }
    throw error;
  }
}

export async function listArticles(
  repository: InventoryRepository,
  access: ResolvedStaffAccess,
  input: ArticleListFilters,
): Promise<PaginatedRows<ArticleListItem>> {
  assertPermission(access, "inventory.read");
  return repository.listArticles(input);
}

export async function getArticle(
  repository: InventoryRepository,
  access: ResolvedStaffAccess,
  articleId: string,
): Promise<Article> {
  assertPermission(access, "inventory.read");
  const article = await repository.getArticle(articleId);
  if (!article) {
    missingArticle();
  }
  return article;
}

export async function lookupArticleByBarcode(
  repository: InventoryRepository,
  access: ResolvedStaffAccess,
  barcode: string,
  forSale: boolean,
): Promise<Article> {
  assertAnyPermission(access, ["inventory.read", "billing.write"]);
  const article = await repository.getArticleByBarcode(barcode);
  if (!article) {
    throw notFoundError("Unknown barcode.");
  }
  if (forSale && article.status === "sold") {
    throw conflictError("ARTICLE_SOLD", "This article is sold and cannot be added to a sale.");
  }
  if (forSale && !article.sellable) {
    throw conflictError("ARTICLE_NOT_SELLABLE", "Unavailable.");
  }
  return article;
}

export async function assignArticleBarcode(
  repository: InventoryRepository,
  access: ResolvedStaffAccess,
  articleId: string,
): Promise<Article> {
  assertPermission(access, "inventory.write");
  const current = await repository.getArticle(articleId);
  if (!current) {
    missingArticle();
  }
  let payload: string;
  try {
    payload = articleBarcodePayload(current.article_number);
  } catch {
    throw validationError("This article number cannot be encoded as Code 128.", [
      { field: "article_number", message: "Use A–Z, 0–9, and hyphen only." },
    ]);
  }
  try {
    const result = await repository.assignBarcodeIfMissing(articleId, payload);
    if (!result) {
      missingArticle();
    }
    if (result.assigned) {
      await repository.writeAudit({
        actorStaffUserId: access.staff_user_id,
        action: "inventory.article.barcode.assign",
        entityType: "article",
        entityId: articleId,
        payload: { barcode: result.article.barcode },
      });
    }
    return result.article;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw conflictError("BARCODE_CONFLICT", "That barcode is already assigned in this organization.");
    }
    throw error;
  }
}

export async function assignArticleBarcodesBatch(
  repository: InventoryRepository,
  access: ResolvedStaffAccess,
  articleIds: string[],
): Promise<Article[]> {
  assertPermission(access, "inventory.write");
  const items: Article[] = [];
  for (const articleId of articleIds) {
    items.push(await assignArticleBarcode(repository, access, articleId));
  }
  return items;
}

export async function getArticleTagPreview(
  repository: InventoryRepository,
  access: ResolvedStaffAccess,
  articleId: string,
  renderSvg: (payload: string, options?: { heightMm?: number }) => string,
  loadLogoDataUri: (
    objectKey: string,
    contentType: ShopLogoContentType,
  ) => Promise<string | null>,
): Promise<TagPreview> {
  assertPermission(access, "inventory.read");
  const article = await repository.getArticle(articleId);
  if (!article) {
    missingArticle();
  }
  if (!article.barcode) {
    throw conflictError("BARCODE_REQUIRED", "Assign a barcode before previewing a tag.");
  }
  const layout = await repository.getDeviceTagLayout();
  if (!layout) {
    throw validationError("Device tag dimensions are not configured.");
  }
  const branding = await repository.getShopTagBranding();
  if (!branding) {
    throw validationError("Shop profile is not configured.");
  }

  const tagHeight = Number.parseFloat(layout.tagHeightMm);
  const barcodeHeight = tagBarcodeHeightMm(tagHeight);
  const canShowLogo = tagCanShowLogo(tagHeight);
  let logoDataUri: string | null = null;
  let logoOmittedForHeight = false;
  if (branding.logoObjectKey && branding.logoContentType) {
    if (canShowLogo) {
      logoDataUri = await loadLogoDataUri(branding.logoObjectKey, branding.logoContentType);
    } else {
      logoOmittedForHeight = true;
    }
  }

  const renderHeight = Math.max(TAG_BARCODE_MIN_HEIGHT_MM, barcodeHeight);

  return {
    article_id: article.id,
    article_number: article.article_number,
    barcode: article.barcode,
    metal: article.metal,
    purity: article.purity,
    gross_weight_grams: article.gross_weight_grams,
    net_metal_weight_grams: article.net_metal_weight_grams,
    tag_width_mm: layout.tagWidthMm,
    tag_height_mm: layout.tagHeightMm,
    template_version: TAG_TEMPLATE_VERSION,
    barcode_svg: renderSvg(article.barcode, { heightMm: renderHeight }),
    barcode_height_mm: String(renderHeight),
    legal_name: branding.legalName,
    logo_data_uri: logoDataUri,
    logo_omitted_for_height: logoOmittedForHeight,
    hardware_validated: false,
  };
}

export async function recordArticleTagPrint(
  repository: InventoryRepository,
  access: ResolvedStaffAccess,
  articleId: string,
  input: TagPrintCreate,
): Promise<TagPrintEvent> {
  assertPermission(access, "inventory.write");
  const article = await repository.getArticle(articleId);
  if (!article) {
    missingArticle();
  }
  if (!article.barcode) {
    throw conflictError("BARCODE_REQUIRED", "Assign a barcode before recording a tag print.");
  }
  if (input.template_version !== TAG_TEMPLATE_VERSION) {
    throw validationError("Unknown tag template version.", [
      { field: "template_version", message: `Expected ${TAG_TEMPLATE_VERSION}.` },
    ]);
  }
  const event = await repository.insertTagPrintEvent({
    articleId,
    barcode: article.barcode,
    printKind: input.print_kind,
    reason: input.reason ?? null,
    templateVersion: input.template_version,
    actorStaffUserId: access.staff_user_id,
  });
  await repository.writeAudit({
    actorStaffUserId: access.staff_user_id,
    action: input.print_kind === "reprint" ? "inventory.article.tag.reprint" : "inventory.article.tag.print",
    entityType: "article",
    entityId: articleId,
    ...(input.reason ? { reason: input.reason } : {}),
    payload: {
      barcode: article.barcode,
      print_kind: input.print_kind,
      template_version: input.template_version,
    },
  });
  return event;
}

export async function receiveArticle(
  repository: InventoryRepository,
  access: ResolvedStaffAccess,
  input: ArticleCreate,
  now: Date = new Date(),
): Promise<Article> {
  assertPermission(access, "inventory.write");
  assertArticleWeights({
    grossWeightGrams: input.gross_weight_grams,
    nonMetalWeightGrams: input.non_metal_weight_grams,
    netMetalWeightGrams: input.net_metal_weight_grams,
  });

  if (!(await repository.categoryExists(input.category_id))) {
    throw validationError("Category was not found.", [{ field: "category_id", message: "Unknown category." }]);
  }
  if (input.location_id && !(await repository.locationExists(input.location_id))) {
    throw validationError("Storage location was not found.", [{ field: "location_id", message: "Unknown location." }]);
  }
  if (input.photograph) {
    assertPhotograph(input.photograph);
  }

  const articleNumber = await repository.allocateArticleNumber();
  try {
    const article = await repository.insertArticle({
      articleNumber,
      categoryId: input.category_id,
      metal: input.metal,
      purity: input.purity,
      grossWeightGrams: input.gross_weight_grams,
      nonMetalWeightGrams: input.non_metal_weight_grams,
      netMetalWeightGrams: input.net_metal_weight_grams,
      huid: emptyToNull(input.huid),
      supplierRef: emptyToNull(input.supplier_ref),
      karigarRef: emptyToNull(input.karigar_ref),
      receiptBusinessDate: input.receipt_business_date ?? kolkataBusinessDate(now),
      acquisitionCostInr: input.acquisition_cost_inr ?? null,
      locationId: input.location_id ?? null,
      stones:
        input.stones?.map((stone) => ({
          description: stone.description,
          weightGrams: stone.weight_grams ?? null,
        })) ?? [],
      photograph: input.photograph ?? null,
      actorStaffUserId: access.staff_user_id,
    });
    await repository.writeAudit({
      actorStaffUserId: access.staff_user_id,
      action: "inventory.article.receive",
      entityType: "article",
      entityId: article.id,
      payload: {
        article_number: article.article_number,
        status: article.status,
        net_metal_weight_grams: article.net_metal_weight_grams,
      },
    });
    return article;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw conflictError("ARTICLE_NUMBER_CONFLICT", "An article with this number already exists.");
    }
    if (isCheckViolation(error)) {
      invalidWeights();
    }
    throw error;
  }
}

export async function updateArticle(
  repository: InventoryRepository,
  access: ResolvedStaffAccess,
  articleId: string,
  patch: ArticlePatch,
): Promise<Article> {
  assertPermission(access, "inventory.write");
  const current = await repository.getArticle(articleId);
  if (!current) {
    missingArticle();
  }
  if (current.row_version !== patch.row_version) {
    throw conflictError("STALE_VERSION", "This article was changed by another request. Reload and try again.");
  }

  const identityOrWeightsTouched =
    patch.category_id !== undefined ||
    patch.metal !== undefined ||
    patch.purity !== undefined ||
    patch.gross_weight_grams !== undefined ||
    patch.non_metal_weight_grams !== undefined ||
    patch.net_metal_weight_grams !== undefined;

  if (current.status === "sold" && identityOrWeightsTouched) {
    throw validationError("Sold article identity and weights cannot be edited. Use return or adjustment workflows.", [
      { field: "status", message: "Sold articles are locked." },
    ]);
  }

  const gross = patch.gross_weight_grams ?? current.gross_weight_grams;
  const nonMetal = patch.non_metal_weight_grams ?? current.non_metal_weight_grams;
  const net = patch.net_metal_weight_grams ?? current.net_metal_weight_grams;
  if (identityOrWeightsTouched) {
    assertArticleWeights({
      grossWeightGrams: gross,
      nonMetalWeightGrams: nonMetal,
      netMetalWeightGrams: net,
    });
  }
  if (patch.category_id && !(await repository.categoryExists(patch.category_id))) {
    throw validationError("Category was not found.", [{ field: "category_id", message: "Unknown category." }]);
  }
  if (patch.location_id && !(await repository.locationExists(patch.location_id))) {
    throw validationError("Storage location was not found.", [{ field: "location_id", message: "Unknown location." }]);
  }
  if (patch.photograph) {
    assertPhotograph(patch.photograph);
  }

  const updated = await repository.updateArticle({
    articleId,
    expectedVersion: patch.row_version,
    ...(patch.category_id !== undefined ? { categoryId: patch.category_id } : {}),
    ...(patch.metal !== undefined ? { metal: patch.metal } : {}),
    ...(patch.purity !== undefined ? { purity: patch.purity } : {}),
    ...(patch.gross_weight_grams !== undefined ? { grossWeightGrams: gross } : {}),
    ...(patch.non_metal_weight_grams !== undefined ? { nonMetalWeightGrams: nonMetal } : {}),
    ...(patch.net_metal_weight_grams !== undefined ? { netMetalWeightGrams: net } : {}),
    ...(patch.huid !== undefined ? { huid: emptyToNull(patch.huid) } : {}),
    ...(patch.supplier_ref !== undefined ? { supplierRef: emptyToNull(patch.supplier_ref) } : {}),
    ...(patch.karigar_ref !== undefined ? { karigarRef: emptyToNull(patch.karigar_ref) } : {}),
    ...(patch.location_id !== undefined ? { locationId: patch.location_id } : {}),
    ...(patch.photograph !== undefined ? { photograph: patch.photograph } : {}),
  });
  if (!updated) {
    throw conflictError("STALE_VERSION", "This article was changed by another request. Reload and try again.");
  }
  await repository.writeAudit({
    actorStaffUserId: access.staff_user_id,
    action: "inventory.article.update",
    entityType: "article",
    entityId: updated.id,
    payload: { row_version: updated.row_version },
  });
  return updated;
}

export async function adjustArticle(
  repository: InventoryRepository,
  access: ResolvedStaffAccess,
  articleId: string,
  input: ArticleAdjustment,
): Promise<Article> {
  assertPermission(access, "inventory.write");
  const current = await repository.getArticle(articleId);
  if (!current) {
    missingArticle();
  }
  if (current.row_version !== input.row_version) {
    throw conflictError("STALE_VERSION", "This article was changed by another request. Reload and try again.");
  }
  const toStatus = input.to_status ?? current.status;
  if (toStatus !== current.status && !canAdjustArticleStatus(current.status, toStatus)) {
    throw validationError("This article cannot be adjusted to the requested status.", [
      { field: "to_status", message: "Use inspection release for returned pieces. Sold articles cannot be adjusted here." },
    ]);
  }
  if (input.location_id && !(await repository.locationExists(input.location_id))) {
    throw validationError("Storage location was not found.", [{ field: "location_id", message: "Unknown location." }]);
  }

  const updated = await repository.applyStatusChange({
    articleId,
    expectedVersion: input.row_version,
    fromStatus: current.status,
    toStatus,
    ...(input.location_id !== undefined ? { locationId: input.location_id } : {}),
    movementType: "adjustment",
    reason: input.reason,
    actorStaffUserId: access.staff_user_id,
  });
  if (!updated) {
    throw conflictError("STALE_VERSION", "This article was changed by another request. Reload and try again.");
  }
  await repository.writeAudit({
    actorStaffUserId: access.staff_user_id,
    action: "inventory.article.adjust",
    entityType: "article",
    entityId: updated.id,
    reason: input.reason,
    payload: { from_status: current.status, to_status: updated.status },
  });
  return updated;
}

export async function releaseArticleFromInspection(
  repository: InventoryRepository,
  access: ResolvedStaffAccess,
  articleId: string,
  input: ArticleInspectionRelease,
): Promise<Article> {
  assertPermission(access, "inventory.write");
  const current = await repository.getArticle(articleId);
  if (!current) {
    missingArticle();
  }
  if (current.row_version !== input.row_version) {
    throw conflictError("STALE_VERSION", "This article was changed by another request. Reload and try again.");
  }
  if (!canReleaseFromInspection(current.status, input.to_status)) {
    throw validationError("Only articles under return inspection can be released this way.", [
      { field: "to_status", message: "Inspection release is a stock movement, not a sale." },
    ]);
  }

  const updated = await repository.applyStatusChange({
    articleId,
    expectedVersion: input.row_version,
    fromStatus: current.status,
    toStatus: input.to_status,
    movementType: "inspection_release",
    reason: input.reason ?? "Inspection release",
    actorStaffUserId: access.staff_user_id,
  });
  if (!updated) {
    throw conflictError("STALE_VERSION", "This article was changed by another request. Reload and try again.");
  }
  await repository.writeAudit({
    actorStaffUserId: access.staff_user_id,
    action: "inventory.article.inspection_release",
    entityType: "article",
    entityId: updated.id,
    ...(input.reason ? { reason: input.reason } : {}),
    payload: { from_status: current.status, to_status: updated.status },
  });
  return updated;
}

export async function listArticleMovements(
  repository: InventoryRepository,
  access: ResolvedStaffAccess,
  articleId: string,
): Promise<InventoryMovement[]> {
  assertPermission(access, "inventory.read");
  const article = await repository.getArticle(articleId);
  if (!article) {
    missingArticle();
  }
  return repository.listMovements(articleId);
}

export async function deleteArticle(
  repository: InventoryRepository,
  access: ResolvedStaffAccess,
  articleId: string,
): Promise<void> {
  assertPermission(access, "inventory.write");
  const eligibility = await repository.getArticleDeleteEligibility(articleId);
  if (!eligibility) {
    missingArticle();
  }
  const blocked = articleDeleteBlockedReason({
    status: eligibility.status,
    movementTypes: eligibility.movementTypes,
    hasStockCountReference: eligibility.hasStockCountReference,
  });
  if (blocked || !articleIsMistakenReceiptDeletable(eligibility)) {
    throw conflictError("ARTICLE_NOT_DELETABLE", blocked ?? "This article cannot be deleted.");
  }
  await repository.deleteMistakenReceiptArticle(articleId);
  await repository.writeAudit({
    actorStaffUserId: access.staff_user_id,
    action: "article.delete",
    entityType: "article",
    entityId: articleId,
    payload: { article_number: eligibility.articleNumber },
  });
}

export async function bulkDeleteArticles(
  repository: InventoryRepository,
  access: ResolvedStaffAccess,
  ids: string[],
): Promise<ArticleBulkDeleteResult> {
  assertPermission(access, "inventory.write");
  const uniqueIds = [...new Set(ids)];
  const deletedIds: string[] = [];
  const skipped: ArticleBulkDeleteResult["skipped"] = [];

  for (const articleId of uniqueIds) {
    const eligibility = await repository.getArticleDeleteEligibility(articleId);
    if (!eligibility) {
      skipped.push({
        id: articleId,
        article_number: articleId,
        code: "NOT_FOUND",
        message: "The requested article was not found.",
      });
      continue;
    }
    const blocked = articleDeleteBlockedReason({
      status: eligibility.status,
      movementTypes: eligibility.movementTypes,
      hasStockCountReference: eligibility.hasStockCountReference,
    });
    if (blocked || !articleIsMistakenReceiptDeletable(eligibility)) {
      skipped.push({
        id: articleId,
        article_number: eligibility.articleNumber,
        code: "ARTICLE_NOT_DELETABLE",
        message: blocked ?? "This article cannot be deleted.",
      });
      continue;
    }
    await repository.deleteMistakenReceiptArticle(articleId);
    await repository.writeAudit({
      actorStaffUserId: access.staff_user_id,
      action: "article.delete",
      entityType: "article",
      entityId: articleId,
      payload: { article_number: eligibility.articleNumber, bulk: true },
    });
    deletedIds.push(articleId);
  }

  return { deleted_ids: deletedIds, skipped };
}

export async function createStockCount(
  repository: InventoryRepository,
  access: ResolvedStaffAccess,
  input: StockCountCreate,
): Promise<StockCount> {
  assertPermission(access, "inventory.write");
  const ids = [...new Set(input.lines.map((line) => line.article_id))];
  if (ids.length !== input.lines.length) {
    throw validationError("Each article may appear only once in a stock count.", [
      { field: "lines", message: "Duplicate article lines are not allowed." },
    ]);
  }
  const articles = await repository.getArticlesByIds(ids);
  if (articles.length !== ids.length) {
    throw notFoundError("One or more articles in this count were not found.");
  }
  const byId = new Map(articles.map((article) => [article.id, article]));
  const lines = input.lines.map((line) => {
    const article = byId.get(line.article_id);
    if (!article) {
      throw notFoundError("One or more articles in this count were not found.");
    }
    const countedAsPresent = line.counted_status === "available";
    const countedMissing = line.counted_status === "missing";
    const hasDiscrepancy =
      countedMissing ||
      (countedAsPresent && article.status !== "available") ||
      (!countedAsPresent && article.status === "available");

    let adjustmentToStatus: ArticleStatus | null = null;
    if (article.status !== "sold" && article.status !== "return_inspection") {
      if (countedAsPresent && article.status !== "available") {
        adjustmentToStatus = "available";
      } else if (!countedAsPresent && article.status === "available") {
        adjustmentToStatus = "unavailable";
      }
    }

    return {
      articleId: article.id,
      articleNumber: article.article_number,
      expectedStatus: article.status,
      countedStatus: line.counted_status,
      hasDiscrepancy,
      adjustmentToStatus,
    };
  });

  const count = await repository.insertReviewedStockCount({
    countedOn: input.counted_on,
    notes: input.notes ?? null,
    actorStaffUserId: access.staff_user_id,
    lines,
  });
  await repository.writeAudit({
    actorStaffUserId: access.staff_user_id,
    action: "inventory.stock_count.create",
    entityType: "stock_count",
    entityId: count.id,
    payload: {
      counted_on: count.counted_on,
      discrepancy_count: count.lines.filter((line) => line.has_discrepancy).length,
    },
  });
  return count;
}

function assertPhotograph(input: ArticlePhotographInput): void {
  if (input.byte_size > 5 * 1024 * 1024) {
    throw validationError("Photograph is too large.", [
      { field: "photograph.byte_size", message: "Maximum size is 5 MB." },
    ]);
  }
}

function emptyToNull(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === "23505";
}

function isCheckViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === "23514";
}
