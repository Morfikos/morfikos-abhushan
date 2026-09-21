import { kolkataBusinessDate } from "@aabhushan/domain";

import { StaffApiError } from "@/lib/staff-api";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

export async function girviAccessToken(): Promise<string> {
  const supabase = createBrowserSupabaseClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new StaffApiError(401, "AUTH_INVALID", "Sign in is required.");
  }
  return token;
}

export function girviStatusLabel(status: string, isOverdue: boolean): string {
  if (status === "draft") {
    return "Draft";
  }
  if (status === "settled") {
    // Settled and released are different states with different words: a settled
    // account is paid off while the customer's packets are still in the shop.
    return "Settled · packets in custody";
  }
  if (status === "released") {
    return "Released to customer";
  }
  if (isOverdue) {
    return "Overdue";
  }
  return "Active";
}

export function girviStatusBadgeColor(
  status: string,
  isOverdue: boolean,
): "success" | "gray" | "warning" {
  if (isOverdue) {
    return "warning";
  }
  if (status === "draft") {
    return "gray";
  }
  return "success";
}

export const GIRVI_RATE_PERIOD_LABEL = "per 30 days" as const;

export function newGirviIdempotencyKey(): string {
  return crypto.randomUUID();
}

/** Shop-local today, so a repayment defaults to the business date staff expect. */
export function girviToday(): string {
  return kolkataBusinessDate();
}

export function girviOverdueHint(isOverdue: boolean): string | null {
  if (!isOverdue) {
    return null;
  }
  return "Past maturity. Collateral remains customer jewellery in custody — it is not shop stock.";
}

export function girviErrorMessage(error: unknown): string {
  if (error instanceof StaffApiError) {
    const field = error.fieldErrors[0];
    return field ? `${error.message} ${field.message}` : error.message;
  }
  return "The request failed. Check the connection and try again.";
}

export type CollateralDraftRow = {
  key: string;
  /** Existing collateral item id when editing a draft; omitted for new rows. */
  existingItemId?: string;
  description: string;
  metal: "" | "gold" | "silver";
  purity: string;
  grossWeightGrams: string;
  netMetalWeightGrams: string;
  assessedValueInr: string;
  packetNumber: string;
  custodyLocation: string;
  /** Existing file metadata that must be re-sent on collateral replace. */
  files: { object_key: string; checksum_sha256: string; purpose: string }[];
};

export function emptyCollateralRow(): CollateralDraftRow {
  return {
    key: crypto.randomUUID(),
    description: "",
    metal: "",
    purity: "",
    grossWeightGrams: "",
    netMetalWeightGrams: "",
    assessedValueInr: "",
    packetNumber: "",
    custodyLocation: "",
    files: [],
  };
}
