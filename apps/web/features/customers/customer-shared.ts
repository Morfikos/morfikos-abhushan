import type { CustomerConsentPurpose, CustomerConsentStatus } from "@aabhushan/contracts";
import { CUSTOMER_CONSENT_PURPOSES } from "@aabhushan/domain";

import { StaffApiError } from "@/lib/staff-api";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

export async function customerAccessToken(): Promise<string> {
  const supabase = createBrowserSupabaseClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new StaffApiError(401, "AUTH_INVALID", "Sign in is required.");
  }
  return token;
}

export const WHATSAPP_PURPOSES = CUSTOMER_CONSENT_PURPOSES;

export function consentPurposeLabel(purpose: CustomerConsentPurpose): string {
  if (purpose === "transactional_invoice") {
    return "Invoices";
  }
  if (purpose === "transactional_receipt") {
    return "Receipts";
  }
  if (purpose === "due_reminder") {
    return "Due reminders";
  }
  return "Girvi reminders";
}

export function whatsappConsentLabel(status: CustomerConsentStatus | null): string {
  if (status === "granted") {
    return "WhatsApp granted";
  }
  if (status === "revoked") {
    return "WhatsApp revoked";
  }
  return "No WhatsApp consent";
}

export function fieldError(error: unknown, field: string): string | undefined {
  if (!(error instanceof StaffApiError)) {
    return undefined;
  }
  return error.fieldErrors.find((item) => item.field === field)?.message;
}

export function customerErrorMessage(error: unknown): string {
  if (error instanceof StaffApiError) {
    if (error.code === "PHONE_CONFLICT") {
      return error.existingCustomerId
        ? "A customer with this phone number already exists. Open that profile instead of creating a duplicate."
        : "A customer with this phone number already exists.";
    }
    const field = error.fieldErrors[0];
    return field ? `${error.message} ${field.message}` : error.message;
  }
  return "The request failed. Check the connection and try again. The customer was not saved.";
}
