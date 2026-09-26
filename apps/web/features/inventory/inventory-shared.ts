import type { ArticleStatus, InventoryMovementType, TagPrintKind } from "@aabhushan/contracts";
import { kolkataBusinessDate } from "@aabhushan/domain";

import { StaffApiError } from "@/lib/staff-api";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

export async function inventoryAccessToken(): Promise<string> {
  const supabase = createBrowserSupabaseClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new StaffApiError(401, "AUTH_INVALID", "Sign in is required.");
  }
  return token;
}

export function articleStatusLabel(status: ArticleStatus): string {
  if (status === "available") {
    return "Available";
  }
  if (status === "sold") {
    return "Sold";
  }
  if (status === "return_inspection") {
    return "Under review";
  }
  return "Unavailable";
}

export function articleStatusColor(status: ArticleStatus): "success" | "blue" | "orange" | "error" {
  if (status === "available") {
    return "success";
  }
  if (status === "sold") {
    return "blue";
  }
  if (status === "return_inspection") {
    return "orange";
  }
  return "error";
}

export function metalBadgeColor(metal: "gold" | "silver" | string): "warning" | "slate" {
  return metal === "silver" ? "slate" : "warning";
}

export function sellableBadgeColor(sellable: boolean): "success" | "orange" {
  return sellable ? "success" : "orange";
}

export function formatGrams(value: string): string {
  return `${value} g`;
}

/** Weight amount only — use when the unit is already in the column header (e.g. Gross (g)). */
export function gramsDisplay(value: string): string {
  return value;
}

/** Calendar-day age from a Kolkata business date to today. Display only. */
export function ageingDaysFromReceipt(receiptBusinessDate: string, now: Date = new Date()): number {
  const today = kolkataBusinessDate(now);
  const [startYear, startMonth, startDay] = receiptBusinessDate.split("-").map(Number);
  const [endYear, endMonth, endDay] = today.split("-").map(Number);
  if (
    startYear === undefined ||
    startMonth === undefined ||
    startDay === undefined ||
    endYear === undefined ||
    endMonth === undefined ||
    endDay === undefined
  ) {
    return 0;
  }
  const startMs = Date.UTC(startYear, startMonth - 1, startDay);
  const endMs = Date.UTC(endYear, endMonth - 1, endDay);
  return Math.max(0, Math.round((endMs - startMs) / 86_400_000));
}

export function movementTypeLabel(type: InventoryMovementType): string {
  if (type === "receipt") {
    return "Receipt";
  }
  if (type === "sale") {
    return "Sale";
  }
  if (type === "return_in") {
    return "Return in";
  }
  if (type === "inspection_release") {
    return "Inspection release";
  }
  return "Adjustment";
}

export function movementTypeDotClass(type: InventoryMovementType): string {
  if (type === "receipt") {
    return "bg-success-solid";
  }
  if (type === "sale") {
    return "bg-quaternary";
  }
  if (type === "return_in") {
    return "bg-warning-solid";
  }
  if (type === "inspection_release") {
    return "bg-brand-solid";
  }
  return "bg-warning-solid";
}

export function inventoryErrorMessage(error: unknown): string {
  if (error instanceof StaffApiError) {
    const field = error.fieldErrors[0];
    return field ? `${error.message} ${field.message}` : error.message;
  }
  return "The request failed. Check the connection and try again. The article was not marked received.";
}

export function scanLookupErrorMessage(error: unknown): string {
  if (error instanceof StaffApiError) {
    if (error.status === 404 || error.code === "NOT_FOUND") {
      return "No article has this barcode.";
    }
    if (error.code === "ARTICLE_SOLD") {
      return "This article is sold.";
    }
    if (error.code === "ARTICLE_NOT_SELLABLE") {
      return "Unavailable.";
    }
    return error.message;
  }
  return "Network error.";
}

export function isScanNotFoundError(error: unknown): boolean {
  return error instanceof StaffApiError && (error.status === 404 || error.code === "NOT_FOUND");
}

export function fieldError(error: unknown, field: string): string | undefined {
  if (!(error instanceof StaffApiError)) {
    return undefined;
  }
  return error.fieldErrors.find((item) => item.field === field)?.message;
}

export async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function tagPrintHref(input: { ids: string[]; kind: TagPrintKind; reason?: string }): string {
  const params = new URLSearchParams({
    ids: input.ids.join(","),
    kind: input.kind,
  });
  if (input.reason) {
    params.set("reason", input.reason);
  }
  return `/print/tags?${params.toString()}`;
}
