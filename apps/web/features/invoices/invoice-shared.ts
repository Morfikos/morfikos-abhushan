import type { InvoiceLinePricing } from "@aabhushan/contracts";

import { formatInr, isZeroMoney } from "@/lib/money";
import { StaffApiError } from "@/lib/staff-api";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

export { formatInr, isZeroMoney };

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
} {
  if (method === "fixed") {
    return {
      ariaLabel: "Making amount (INR)",
      placeholder: "0.00",
      label: "Making amount (INR)",
    };
  }
  if (method === "per_gram") {
    return {
      ariaLabel: "Making rate (₹/g)",
      placeholder: "0",
      label: "Making rate (₹/g)",
    };
  }
  return {
    ariaLabel: "Making percent",
    placeholder: "0",
    label: "Making percent",
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
