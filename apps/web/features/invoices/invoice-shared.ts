import type { InvoiceLinePricing } from "@aabhushan/contracts";

import { formatInr, isZeroMoney } from "@/lib/money";
import { compareMoney, subtractMoney } from "@/lib/money";
import { StaffApiError } from "@/lib/staff-api";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

export { formatInr, isZeroMoney, compareMoney, subtractMoney };

export async function invoiceAccessToken(): Promise<string> {
  const supabase = createBrowserSupabaseClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new StaffApiError(401, "AUTH_INVALID", "Sign in is required.");
  }
  return token;
}

export function formatGrams(value: string): string {
  return `${value} g`;
}

/** Counter display: two decimal grams, independent of stored precision. */
export function formatGramsDisplay(value: string): string {
  const grams = Number.parseFloat(value);
  if (!Number.isFinite(grams)) {
    return formatGrams(value);
  }
  return `${grams.toFixed(2)} g`;
}

export function invoiceStatusColor(status: "draft" | "finalized" | string): "success" | "gray" {
  return status === "finalized" ? "success" : "gray";
}

/** Strip trailing ` · ART…` when description already embeds the article number (display only). */
export function lineArticleTitle(description: string, articleNumber: string): string {
  const suffix = ` · ${articleNumber}`;
  if (description.endsWith(suffix)) {
    return description.slice(0, -suffix.length);
  }
  return description;
}

export function lineHasExtraPricing(pricing: InvoiceLinePricing | undefined | null): boolean {
  if (!pricing) {
    return false;
  }
  if (pricing.wastage?.method === "percent_of_net_weight") {
    return true;
  }
  if ((pricing.stone_charges?.length ?? 0) > 0) {
    return true;
  }
  return Boolean(pricing.line_discount);
}

type MakingMethod = InvoiceLinePricing["making_charge"]["method"];

export function defaultMakingValue(method: MakingMethod): string {
  return method === "fixed" ? "0.00" : "0";
}

export function makingValueFieldMeta(method: MakingMethod): {
  ariaLabel: string;
  placeholder: string;
  label: string;
  unit: "money" | "per_gram" | "percent";
} {
  if (method === "fixed") {
    return {
      ariaLabel: "Making amount",
      placeholder: "0.00",
      label: "Making",
      unit: "money",
    };
  }
  if (method === "per_gram") {
    return {
      ariaLabel: "Making rate per gram",
      placeholder: "0",
      label: "Making",
      unit: "per_gram",
    };
  }
  return {
    ariaLabel: "Making percent",
    placeholder: "0",
    label: "Making",
    unit: "percent",
  };
}

/** Client-side making value checks aligned with contracts money/rate/percent shapes. */
export function validateMakingValue(
  method: MakingMethod,
  value: string,
): { valid: boolean; hint: string | null } {
  const trimmed = value.trim();
  if (method === "fixed") {
    if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
      return { valid: false, hint: "Enter a non-negative amount with up to 2 decimals." };
    }
    return { valid: true, hint: null };
  }
  if (method === "per_gram") {
    if (!/^\d+(\.\d{1,6})?$/.test(trimmed)) {
      return { valid: false, hint: "Enter a non-negative rate with up to 6 decimals." };
    }
    return { valid: true, hint: null };
  }
  if (!/^\d+(\.\d{1,6})?$/.test(trimmed)) {
    return { valid: false, hint: "Enter a percent between 0 and 100." };
  }
  if (Number(trimmed) > 100) {
    return { valid: false, hint: "Percent must be between 0 and 100." };
  }
  return { valid: true, hint: null };
}

export function invoiceErrorMessage(error: unknown): string {
  if (error instanceof StaffApiError) {
    if (error.code === "CALCULATION_POLICY_UNAPPROVED" || error.code === "CALCULATION_RULE_UNSUPPORTED") {
      return "Calculations are blocked pending owner invoice examples. Draft lines were saved without totals.";
    }
    if (error.code === "ARTICLE_ALREADY_ON_DRAFT") {
      return "That article is already on this invoice.";
    }
    if (error.status === 404 || error.code === "NOT_FOUND") {
      const lower = error.message.toLowerCase();
      if (lower.includes("barcode") || lower.includes("article") || !error.message) {
        return "Unknown barcode.";
      }
      return error.message;
    }
    if (error.code === "ARTICLE_SOLD") {
      return "This article is sold.";
    }
    if (error.code === "ARTICLE_NOT_SELLABLE") {
      return "Unavailable.";
    }
    if (error.code === "STALE_QUOTE") {
      return "Totals changed. Review the updated quote and finalize again.";
    }
    if (error.code === "RETURN_ALREADY_ACCEPTED") {
      return "This invoice line has already been returned.";
    }
    if (error.code === "PAYMENT_ALREADY_REVERSED") {
      return "This payment was reversed. Refund and reverse cannot both apply.";
    }
    if (error.code === "PAYMENT_ALREADY_REFUNDED") {
      return "This payment was refunded and cannot also be reversed.";
    }
    const field = error.fieldErrors[0];
    return field ? `${error.message} ${field.message}` : error.message;
  }
  return "The request failed. Check the connection and try again.";
}

export function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `pos-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** Preview credit for a return line — mirrors server `creditAmountForReturnedLine`. */
export function previewReturnCreditAmount(input: {
  lineTotalInr: string;
  grandTotalInr: string;
  alreadyCreditedInr: string;
  remainingUnreturnedCount: number;
}): string {
  const remaining = subtractMoney(input.grandTotalInr, input.alreadyCreditedInr);
  if (isZeroMoney(remaining) || remaining.startsWith("-")) {
    return "0.00";
  }
  if (input.remainingUnreturnedCount <= 1) {
    return remaining;
  }
  return compareMoney(input.lineTotalInr, remaining) <= 0 ? input.lineTotalInr : remaining;
}

export function formatMetalPurityLabel(metal: string, purity: string): string {
  const metalLabel = metal ? metal.charAt(0).toUpperCase() + metal.slice(1).toLowerCase() : metal;
  return `${metalLabel} ${purity}`;
}

export function invoicePaymentBadge(input: {
  amountDueInr: string;
  returnedLineCount: number;
  lineCount: number;
}): { label: string; color: "gray" | "error"; appearance?: "soft" | "solid" | "outline" } {
  if (input.returnedLineCount > 0) {
    if (input.returnedLineCount >= input.lineCount) {
      return {
        label: "Returned",
        color: "gray",
        appearance: "outline",
      };
    }
    return {
      label: "Partially returned",
      color: "gray",
      appearance: "outline",
    };
  }
  if (!isZeroMoney(input.amountDueInr)) {
    return { label: "Partially paid", color: "error" };
  }
  return {
    label: "Paid",
    color: "gray",
    appearance: "solid",
  };
}
