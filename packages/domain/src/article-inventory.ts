import Decimal from "decimal.js";

/**
 * Saleable-article inventory rules. Weight arithmetic uses decimal.js;
 * never convert NUMERIC weights to JavaScript Number.
 */
function weight(value: string): Decimal {
  return new Decimal(value);
}

export const ARTICLE_STATUSES = ["available", "sold", "return_inspection", "unavailable"] as const;
export type ArticleStatus = (typeof ARTICLE_STATUSES)[number];

export const INVENTORY_MOVEMENT_TYPES = [
  "receipt",
  "sale",
  "return_in",
  "inspection_release",
  "adjustment",
] as const;
export type InventoryMovementType = (typeof INVENTORY_MOVEMENT_TYPES)[number];

export const SELLABLE_ARTICLE_STATUS: ArticleStatus = "available";

export function isArticleStatus(value: string): value is ArticleStatus {
  return (ARTICLE_STATUSES as readonly string[]).includes(value);
}

export function articleIsSellable(status: ArticleStatus): boolean {
  return status === SELLABLE_ARTICLE_STATUS;
}

export function netMetalWeightGrams(grossWeightGrams: string, nonMetalWeightGrams: string): string {
  return weight(grossWeightGrams).minus(weight(nonMetalWeightGrams)).toString();
}

export function netMetalWeightMatches(input: {
  grossWeightGrams: string;
  nonMetalWeightGrams: string;
  netMetalWeightGrams: string;
}): boolean {
  return weight(input.grossWeightGrams).minus(weight(input.nonMetalWeightGrams)).eq(weight(input.netMetalWeightGrams));
}

export function netMetalWeightIsPositive(input: {
  grossWeightGrams: string;
  nonMetalWeightGrams: string;
}): boolean {
  return weight(input.grossWeightGrams).minus(weight(input.nonMetalWeightGrams)).gt(0);
}

export function canAdjustArticleStatus(from: ArticleStatus, to: ArticleStatus): boolean {
  if (from === "sold" || from === "return_inspection") {
    return false;
  }
  return to === "available" || to === "unavailable";
}

export function canReleaseFromInspection(from: ArticleStatus, to: ArticleStatus): boolean {
  return from === "return_inspection" && (to === "available" || to === "unavailable");
}

/**
 * Hard-delete is only for mistaken receipts: available status, receipt-only
 * movements, and no stock-count references. Sold, adjusted, counted, and
 * under-review articles must keep their history.
 */
export function articleIsMistakenReceiptDeletable(input: {
  status: ArticleStatus;
  movementTypes: readonly InventoryMovementType[];
  hasStockCountReference: boolean;
}): boolean {
  if (input.status !== "available") {
    return false;
  }
  if (input.hasStockCountReference) {
    return false;
  }
  if (input.movementTypes.length === 0) {
    return false;
  }
  return input.movementTypes.every((type) => type === "receipt");
}

export function articleDeleteBlockedReason(input: {
  status: ArticleStatus;
  movementTypes: readonly InventoryMovementType[];
  hasStockCountReference: boolean;
}): string | null {
  if (articleIsMistakenReceiptDeletable(input)) {
    return null;
  }
  if (input.status === "sold") {
    return "Sold articles cannot be deleted.";
  }
  if (input.status === "return_inspection") {
    return "Articles under review cannot be deleted.";
  }
  if (input.status === "unavailable") {
    return "Unavailable articles cannot be deleted.";
  }
  if (input.hasStockCountReference) {
    return "Articles included in a stock count cannot be deleted.";
  }
  return "This article has stock history and cannot be deleted.";
}
