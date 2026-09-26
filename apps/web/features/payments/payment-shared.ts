import { StaffApiError } from "@/lib/staff-api";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

export async function paymentAccessToken(): Promise<string> {
  const supabase = createBrowserSupabaseClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new StaffApiError(401, "AUTH_INVALID", "Sign in is required.");
  }
  return token;
}

export function paymentErrorMessage(error: unknown): string {
  if (error instanceof StaffApiError) {
    if (error.code === "IDEMPOTENCY_KEY_REUSED") {
      return "This request was already submitted with different details. Start again with a new key.";
    }
    if (error.code === "PAYMENT_ALREADY_REVERSED") {
      return "This payment was reversed. Refund and reverse cannot both apply.";
    }
    if (error.code === "PAYMENT_ALREADY_REFUNDED") {
      return "This payment was refunded and cannot also be reversed.";
    }
    if (error.status === 404) {
      return "The customer or invoice is no longer available. Reload and try again.";
    }
    if (error.status === 403) {
      return "You do not have permission to complete this payment action.";
    }
    const field = error.fieldErrors[0];
    return field ? `${error.message} ${field.message}` : error.message;
  }
  return "The collection was not confirmed by the server. Check the connection and retry with the same details.";
}

export function paymentKindLabel(kind: "collection" | "refund" | "reversal"): string {
  if (kind === "refund") {
    return "Refund";
  }
  if (kind === "reversal") {
    return "Reversal";
  }
  return "Collection";
}

export function paymentKindBadgeColor(kind: "collection" | "refund" | "reversal"): "blue" | "purple" | "orange" {
  if (kind === "refund") {
    return "purple";
  }
  if (kind === "reversal") {
    return "orange";
  }
  return "blue";
}

export function paymentStatusBadgeColor(status: "posted" | "reversed" | string): "success" | "orange" {
  return status === "posted" ? "success" : "orange";
}

export function dueSettledBadgeColor(amountDueInr: string): "success" | "orange" {
  return amountDueInr === "0.00" ? "success" : "orange";
}

export function newPaymentIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `pay-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
