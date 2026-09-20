export const SHOP_PHONE_COUNTRY_CALLING_CODE = "91";

export const CUSTOMER_CONSENT_CHANNEL_WHATSAPP = "whatsapp" as const;
export const CUSTOMER_CONSENT_PURPOSES = [
  "transactional_invoice",
  "transactional_receipt",
  "due_reminder",
  "girvi_reminder",
] as const;
export const CUSTOMER_CONSENT_STATUSES = ["granted", "revoked"] as const;

export type CustomerConsentChannel = typeof CUSTOMER_CONSENT_CHANNEL_WHATSAPP;
export type CustomerConsentPurpose = (typeof CUSTOMER_CONSENT_PURPOSES)[number];
export type CustomerConsentStatus = (typeof CUSTOMER_CONSENT_STATUSES)[number];

const E164_PATTERN = /^\+[1-9][0-9]{7,14}$/;

export type NormalizedShopPhone =
  | { kind: "empty" }
  | { kind: "invalid"; message: string }
  | { kind: "ok"; normalized: string; display: string };

export function isCustomerConsentPurpose(value: string): value is CustomerConsentPurpose {
  return (CUSTOMER_CONSENT_PURPOSES as readonly string[]).includes(value);
}

export function isE164Phone(value: string): boolean {
  return E164_PATTERN.test(value);
}

export function normalizeShopPhone(input: string | null | undefined): NormalizedShopPhone {
  if (input === undefined || input === null) {
    return { kind: "empty" };
  }

  const display = input.trim();
  if (display.length === 0) {
    return { kind: "empty" };
  }

  const digits = display.replace(/\D/g, "");
  if (digits.length === 0) {
    return { kind: "invalid", message: "Enter a phone number using digits." };
  }

  let e164: string;
  if (display.startsWith("+")) {
    e164 = `+${digits}`;
  } else if (display.startsWith("00")) {
    e164 = `+${digits.replace(/^00/, "")}`;
  } else if (digits.length === 10) {
    e164 = `+${SHOP_PHONE_COUNTRY_CALLING_CODE}${digits}`;
  } else if (digits.length === 11 && digits.startsWith("0")) {
    e164 = `+${SHOP_PHONE_COUNTRY_CALLING_CODE}${digits.slice(1)}`;
  } else if (digits.length === 12 && digits.startsWith(SHOP_PHONE_COUNTRY_CALLING_CODE)) {
    e164 = `+${digits}`;
  } else if (digits.length >= 8 && digits.length <= 15) {
    e164 = `+${digits}`;
  } else {
    return { kind: "invalid", message: "Enter a valid mobile number." };
  }

  if (!isE164Phone(e164)) {
    return { kind: "invalid", message: "Enter a valid mobile number." };
  }

  return { kind: "ok", normalized: e164, display };
}

export function consentRequiresNormalizedPhone(
  channel: string,
  status: CustomerConsentStatus,
): boolean {
  return channel === CUSTOMER_CONSENT_CHANNEL_WHATSAPP && status === "granted";
}

export function customerInitials(displayName: string): string {
  const parts = displayName
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .slice(0, 2);
  if (parts.length === 0) {
    return "";
  }
  return parts.map((part) => part.slice(0, 1).toUpperCase()).join("");
}
