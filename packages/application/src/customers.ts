import type {
  Customer,
  CustomerConsent,
  CustomerConsentWrite,
  CustomerCreate,
  CustomerIdentityFile,
  CustomerListItem,
  CustomerPatch,
  ReminderLanguage,
} from "@aabhushan/contracts";
import {
  consentRequiresNormalizedPhone,
  normalizeShopPhone,
} from "@aabhushan/domain";

import { assertAnyPermission, assertPermission } from "./authorize";
import { conflictError, notFoundError, validationError } from "./http-error";
import type { PaginatedRows, PaginationInput } from "./shop-settings";
import type { ResolvedStaffAccess } from "./staff-access";

export type CustomerListFilters = PaginationInput & {
  q?: string;
  isActive?: boolean;
  isWalkIn?: boolean;
  whatsappConsent?: "granted" | "revoked" | "none";
};

export type CustomerAuditWrite = {
  action: string;
  entityType: string;
  entityId?: string;
  reason?: string;
  payload?: Record<string, unknown>;
};

export type CustomerPhoneFields = {
  phoneNormalized: string | null;
  phoneDisplay: string | null;
};

export type CustomerRepository = {
  listCustomers(input: CustomerListFilters): Promise<PaginatedRows<CustomerListItem>>;
  getCustomer(customerId: string): Promise<Customer | null>;
  findIdByNormalizedPhone(phoneNormalized: string): Promise<string | null>;
  insertCustomer(input: {
    displayName: string;
    phoneNormalized: string | null;
    phoneDisplay: string | null;
    email: string | null;
    addressLine: string | null;
    notes: string | null;
    consents: CustomerConsentWrite[];
    defaultLanguage: ReminderLanguage;
  }): Promise<Customer>;
  updateCustomer(input: {
    customerId: string;
    displayName?: string;
    phoneNormalized?: string | null;
    phoneDisplay?: string | null;
    email?: string | null;
    addressLine?: string | null;
    notes?: string | null;
    isActive?: boolean;
  }): Promise<Customer | null>;
  listConsents(customerId: string): Promise<CustomerConsent[]>;
  upsertConsents(input: {
    customerId: string;
    items: CustomerConsentWrite[];
    defaultLanguage: ReminderLanguage;
  }): Promise<CustomerConsent[]>;
  listIdentityFiles(customerId: string): Promise<CustomerIdentityFile[]>;
  getDefaultLanguage(): Promise<ReminderLanguage>;
  writeAudit(event: CustomerAuditWrite & { actorStaffUserId: string | null }): Promise<void>;
};

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

function parsePhone(value: string | null | undefined): CustomerPhoneFields {
  const parsed = normalizeShopPhone(value ?? null);
  if (parsed.kind === "empty") {
    return { phoneNormalized: null, phoneDisplay: null };
  }
  if (parsed.kind === "invalid") {
    throw validationError("Enter a valid mobile number.", [{ field: "phone", message: parsed.message }]);
  }
  return { phoneNormalized: parsed.normalized, phoneDisplay: parsed.display };
}

function parseEmail(value: string | null | undefined): string | null {
  const trimmed = emptyToNull(value);
  return trimmed ? trimmed.toLowerCase() : null;
}

function whatsappGrantWithoutPhone(
  phoneNormalized: string | null,
  consents: readonly { channel: string; status: "granted" | "revoked" }[],
): boolean {
  if (phoneNormalized) {
    return false;
  }
  return consents.some((item) => consentRequiresNormalizedPhone(item.channel, item.status));
}

function phoneConflict(access: ResolvedStaffAccess, existingId: string | null): never {
  throw conflictError(
    "PHONE_CONFLICT",
    "A customer with this phone number already exists.",
    access.permissions.includes("customers.read") || access.permissions.includes("customers.write")
      ? existingId
        ? { existingCustomerId: existingId }
        : undefined
      : undefined,
  );
}

async function requireReadableCustomer(repository: CustomerRepository, customerId: string): Promise<Customer> {
  const customer = await repository.getCustomer(customerId);
  if (!customer) {
    throw notFoundError("The requested customer was not found.");
  }
  return customer;
}

export async function listCustomers(
  repository: CustomerRepository,
  access: ResolvedStaffAccess,
  input: CustomerListFilters,
): Promise<PaginatedRows<CustomerListItem>> {
  assertAnyPermission(access, ["customers.read", "customers.write"]);
  return repository.listCustomers(input);
}

export async function getCustomer(
  repository: CustomerRepository,
  access: ResolvedStaffAccess,
  customerId: string,
): Promise<Customer> {
  assertAnyPermission(access, ["customers.read", "customers.write"]);
  return requireReadableCustomer(repository, customerId);
}

export async function createCustomer(
  repository: CustomerRepository,
  access: ResolvedStaffAccess,
  input: CustomerCreate,
): Promise<Customer> {
  assertPermission(access, "customers.write");
  const phone = parsePhone(input.phone);
  const consents = input.consents ?? [];
  if (whatsappGrantWithoutPhone(phone.phoneNormalized, consents)) {
    throw validationError("WhatsApp consent requires a phone number.", [
      { field: "phone", message: "Add a phone number before granting WhatsApp consent." },
      { field: "consents", message: "WhatsApp consent cannot be granted without a normalized phone." },
    ]);
  }

  if (phone.phoneNormalized) {
    const existingId = await repository.findIdByNormalizedPhone(phone.phoneNormalized);
    if (existingId) {
      phoneConflict(access, existingId);
    }
  }

  const defaultLanguage = await repository.getDefaultLanguage();
  try {
    const customer = await repository.insertCustomer({
      displayName: input.display_name.trim(),
      phoneNormalized: phone.phoneNormalized,
      phoneDisplay: phone.phoneDisplay,
      email: parseEmail(input.email),
      addressLine: emptyToNull(input.address_line),
      notes: emptyToNull(input.notes),
      consents,
      defaultLanguage,
    });
    await repository.writeAudit({
      actorStaffUserId: access.staff_user_id,
      action: "customer.create",
      entityType: "customer",
      entityId: customer.id,
      payload: { has_phone: Boolean(phone.phoneNormalized), consent_count: consents.length },
    });
    return customer;
  } catch (error) {
    if (isUniqueViolation(error) && phone.phoneNormalized) {
      const existingId = await repository.findIdByNormalizedPhone(phone.phoneNormalized);
      phoneConflict(access, existingId);
    }
    throw error;
  }
}

export async function updateCustomer(
  repository: CustomerRepository,
  access: ResolvedStaffAccess,
  customerId: string,
  input: CustomerPatch,
): Promise<Customer> {
  assertPermission(access, "customers.write");
  const current = await requireReadableCustomer(repository, customerId);
  const phone =
    input.phone === undefined
      ? { phoneNormalized: current.phone_normalized, phoneDisplay: current.phone_display }
      : parsePhone(input.phone);

  if (whatsappGrantWithoutPhone(phone.phoneNormalized, current.consents)) {
    throw validationError("WhatsApp consent requires a phone number.", [
      { field: "phone", message: "Revoke WhatsApp consent before removing the phone number." },
    ]);
  }

  if (phone.phoneNormalized) {
    const existingId = await repository.findIdByNormalizedPhone(phone.phoneNormalized);
    if (existingId && existingId !== customerId) {
      phoneConflict(access, existingId);
    }
  }

  try {
    const updated = await repository.updateCustomer({
      customerId,
      ...(input.display_name !== undefined ? { displayName: input.display_name.trim() } : {}),
      ...(input.phone !== undefined
        ? { phoneNormalized: phone.phoneNormalized, phoneDisplay: phone.phoneDisplay }
        : {}),
      ...(input.email !== undefined ? { email: parseEmail(input.email) } : {}),
      ...(input.address_line !== undefined ? { addressLine: emptyToNull(input.address_line) } : {}),
      ...(input.notes !== undefined ? { notes: emptyToNull(input.notes) } : {}),
      ...(input.is_active !== undefined ? { isActive: input.is_active } : {}),
    });
    if (!updated) {
      throw notFoundError("The requested customer was not found.");
    }
    await repository.writeAudit({
      actorStaffUserId: access.staff_user_id,
      action: "customer.update",
      entityType: "customer",
      entityId: customerId,
      payload: { has_phone: Boolean(updated.phone_normalized) },
    });
    return updated;
  } catch (error) {
    if (isUniqueViolation(error) && phone.phoneNormalized) {
      const existingId = await repository.findIdByNormalizedPhone(phone.phoneNormalized);
      phoneConflict(access, existingId);
    }
    throw error;
  }
}

export async function listCustomerConsents(
  repository: CustomerRepository,
  access: ResolvedStaffAccess,
  customerId: string,
): Promise<CustomerConsent[]> {
  assertPermission(access, "customers.write");
  await requireReadableCustomer(repository, customerId);
  return repository.listConsents(customerId);
}

export async function putCustomerConsents(
  repository: CustomerRepository,
  access: ResolvedStaffAccess,
  customerId: string,
  items: CustomerConsentWrite[],
): Promise<CustomerConsent[]> {
  assertPermission(access, "customers.write");
  const customer = await requireReadableCustomer(repository, customerId);
  if (whatsappGrantWithoutPhone(customer.phone_normalized, items)) {
    throw validationError("WhatsApp consent requires a phone number.", [
      { field: "consents", message: "WhatsApp consent cannot be granted without a normalized phone." },
    ]);
  }
  const defaultLanguage = await repository.getDefaultLanguage();
  const consents = await repository.upsertConsents({ customerId, items, defaultLanguage });
  await repository.writeAudit({
    actorStaffUserId: access.staff_user_id,
    action: "customer.consents.update",
    entityType: "customer",
    entityId: customerId,
    payload: { consent_count: items.length },
  });
  return consents;
}

export async function listCustomerIdentityFiles(
  repository: CustomerRepository,
  access: ResolvedStaffAccess,
  customerId: string,
): Promise<CustomerIdentityFile[]> {
  assertPermission(access, "identity_documents.read");
  await requireReadableCustomer(repository, customerId);
  return repository.listIdentityFiles(customerId);
}
