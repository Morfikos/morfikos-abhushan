import type {
  AuditEvent,
  DeviceSettings,
  DeviceSettingsPatch,
  DocumentSequence,
  MetalRate,
  MetalRateCreate,
  MakingCharge,
  MakingChargeDefault,
  MakingChargeDefaultUpsert,
  MetalRatesCoverage,
  ReminderSettings,
  ReminderSettingsPatch,
  ShopBrandingPublic,
  ShopProfile,
  ShopProfilePatch,
} from "@aabhushan/contracts";
import {
  detectShopLogoContentType,
  kolkataBusinessDate,
  SHOP_LOGO_MAX_BYTES,
  type ShopLogoContentType,
} from "@aabhushan/domain";

import { assertAnyPermission, assertPermission } from "./authorize";
import { configurationError, conflictError, notFoundError, validationError } from "./http-error";
import type { ResolvedStaffAccess } from "./staff-access";

export type PaginationInput = {
  page: number;
  pageSize: number;
  sort: string;
  direction: "asc" | "desc";
};

export type PaginatedRows<T> = {
  items: T[];
  total: number;
};

export type AuditWrite = {
  action: string;
  entityType: string;
  entityId?: string;
  reason?: string;
  payload?: Record<string, unknown>;
};

export type ShopAssetStorage = {
  uploadLogo(input: {
    organizationId: string;
    bytes: Buffer;
    contentType: ShopLogoContentType;
    previousObjectKey: string | null;
  }): Promise<{ objectKey: string; checksumSha256: string; byteSize: number; contentType: ShopLogoContentType }>;
  /**
   * Private object under shop-assets. Used for Girvi collateral, article photos,
   * identity files, and generated PDFs. Callers own the object-key path prefix.
   */
  uploadPrivateObject(input: {
    objectKey: string;
    bytes: Buffer;
    contentType: string;
    upsert?: boolean;
  }): Promise<{ objectKey: string; checksumSha256: string; byteSize: number; contentType: string }>;
  createSignedUploadUrl(
    objectKey: string,
    expiresInSeconds?: number,
  ): Promise<{ signedUrl: string; token: string; path: string; expiresInSeconds: number }>;
  removeObject(objectKey: string): Promise<void>;
  createSignedUrl(objectKey: string, expiresInSeconds?: number): Promise<string>;
  downloadAsDataUri(objectKey: string, contentType: string): Promise<string | null>;
};

/** Persistence shape; object keys never leave the server on client DTOs. */
export type ShopProfileRecord = {
  id: string;
  organization_id: string;
  legal_name: string;
  address_line: string | null;
  phone: string | null;
  invoice_footer: string | null;
  logo_object_key: string | null;
  logo_content_type: ShopLogoContentType | null;
  logo_byte_size: number | null;
  logo_checksum_sha256: string | null;
  time_zone: "Asia/Kolkata";
  branch: {
    id: string;
    name: string;
    address_line: string | null;
    is_active: boolean;
  };
};

export type ShopSettingsRepository = {
  getProfile(): Promise<ShopProfileRecord>;
  updateProfile(patch: ShopProfilePatch): Promise<ShopProfileRecord>;
  updateLogo(input: {
    objectKey: string;
    contentType: ShopLogoContentType;
    byteSize: number;
    checksumSha256: string;
  }): Promise<ShopProfileRecord>;
  clearLogo(): Promise<ShopProfileRecord>;
  listRates(input: PaginationInput): Promise<PaginatedRows<MetalRate>>;
  ratesCoverageForBusinessDate(businessDate: string): Promise<{ gold: boolean; silver: boolean }>;
  insertRate(input: {
    metal: MetalRateCreate["metal"];
    purity: string;
    ratePerGram: string;
    effectiveBusinessDate: string;
    createdByStaffUserId: string;
  }): Promise<MetalRate>;
  listMakingChargeDefaults(input: PaginationInput): Promise<PaginatedRows<MakingChargeDefault>>;
  upsertMakingChargeDefault(input: {
    metal: MakingChargeDefaultUpsert["metal"];
    purity: string;
    makingCharge: MakingCharge;
    updatedByStaffUserId: string;
  }): Promise<MakingChargeDefault>;
  deleteMakingChargeDefault(id: string): Promise<boolean>;
  listSequences(): Promise<DocumentSequence[]>;
  updateSequences(items: DocumentSequence[]): Promise<DocumentSequence[]>;
  getDevices(): Promise<DeviceSettings>;
  updateDevices(patch: DeviceSettingsPatch): Promise<DeviceSettings>;
  getReminders(): Promise<ReminderSettings>;
  updateReminders(patch: ReminderSettingsPatch): Promise<ReminderSettings>;
  writeAudit(event: AuditWrite & { actorStaffUserId: string | null }): Promise<void>;
};

export async function toShopProfileDto(
  record: ShopProfileRecord,
  storage: ShopAssetStorage | null,
): Promise<ShopProfile> {
  let logoUrl: string | null = null;
  if (record.logo_object_key && storage) {
    try {
      logoUrl = await storage.createSignedUrl(record.logo_object_key);
    } catch {
      logoUrl = null;
    }
  }
  return {
    id: record.id,
    organization_id: record.organization_id,
    legal_name: record.legal_name,
    address_line: record.address_line,
    phone: record.phone,
    invoice_footer: record.invoice_footer,
    logo_url: logoUrl,
    has_logo: Boolean(record.logo_object_key),
    time_zone: "Asia/Kolkata",
    branch: record.branch,
  };
}

export async function getShopProfile(
  repository: ShopSettingsRepository,
  storage: ShopAssetStorage | null,
): Promise<ShopProfile> {
  return toShopProfileDto(await repository.getProfile(), storage);
}

export async function getPublicShopBranding(
  repository: ShopSettingsRepository,
  storage: ShopAssetStorage | null,
): Promise<ShopBrandingPublic> {
  const profile = await toShopProfileDto(await repository.getProfile(), storage);
  return {
    legal_name: profile.legal_name,
    logo_url: profile.logo_url,
  };
}

export async function updateShopProfile(
  repository: ShopSettingsRepository,
  access: ResolvedStaffAccess,
  patch: ShopProfilePatch,
  storage: ShopAssetStorage | null,
): Promise<ShopProfile> {
  assertPermission(access, "settings.write");
  const record = await repository.updateProfile(patch);
  await repository.writeAudit({
    actorStaffUserId: access.staff_user_id,
    action: "shop.profile.update",
    entityType: "shop_profile",
    entityId: record.id,
    payload: patch,
  });
  return toShopProfileDto(record, storage);
}

export async function uploadShopLogo(
  repository: ShopSettingsRepository,
  access: ResolvedStaffAccess,
  storage: ShopAssetStorage | null,
  input: { bytes: Buffer; declaredContentType: string },
): Promise<ShopProfile> {
  assertPermission(access, "settings.write");
  if (!storage) {
    throw configurationError(
      "Shop logo storage is not configured. Set SUPABASE_SECRET_KEY and create the shop-assets bucket.",
    );
  }
  if (input.bytes.length === 0 || input.bytes.length > SHOP_LOGO_MAX_BYTES) {
    throw validationError("Shop logo must be between 1 byte and 1 MB.", [
      { field: "file", message: "Maximum size is 1 MB." },
    ]);
  }
  const detected = detectShopLogoContentType(input.bytes);
  if (!detected) {
    throw validationError("Shop logo must be a JPEG, PNG, or WebP image.", [
      { field: "file", message: "Unrecognized image bytes." },
    ]);
  }
  if (
    input.declaredContentType &&
    input.declaredContentType !== detected &&
    !(input.declaredContentType === "image/jpg" && detected === "image/jpeg")
  ) {
    throw validationError("Declared content type does not match the image bytes.", [
      { field: "file", message: `Expected ${detected}.` },
    ]);
  }

  const current = await repository.getProfile();
  const uploaded = await storage.uploadLogo({
    organizationId: access.membership.organization_id,
    bytes: input.bytes,
    contentType: detected,
    previousObjectKey: current.logo_object_key,
  });
  const record = await repository.updateLogo({
    objectKey: uploaded.objectKey,
    contentType: uploaded.contentType,
    byteSize: uploaded.byteSize,
    checksumSha256: uploaded.checksumSha256,
  });
  await repository.writeAudit({
    actorStaffUserId: access.staff_user_id,
    action: "shop.logo.upload",
    entityType: "shop_profile",
    entityId: record.id,
    payload: {
      content_type: uploaded.contentType,
      byte_size: uploaded.byteSize,
      checksum_sha256: uploaded.checksumSha256,
    },
  });
  return toShopProfileDto(record, storage);
}

export async function removeShopLogo(
  repository: ShopSettingsRepository,
  access: ResolvedStaffAccess,
  storage: ShopAssetStorage | null,
): Promise<ShopProfile> {
  assertPermission(access, "settings.write");
  const current = await repository.getProfile();
  if (!current.logo_object_key) {
    return toShopProfileDto(current, storage);
  }
  const previousKey = current.logo_object_key;
  const record = await repository.clearLogo();
  if (storage) {
    try {
      await storage.removeObject(previousKey);
    } catch {
      // Metadata already cleared; orphan cleanup can follow later.
    }
  }
  await repository.writeAudit({
    actorStaffUserId: access.staff_user_id,
    action: "shop.logo.remove",
    entityType: "shop_profile",
    entityId: record.id,
    payload: {},
  });
  return toShopProfileDto(record, storage);
}

export async function listMetalRates(
  repository: ShopSettingsRepository,
  access: ResolvedStaffAccess,
  input: PaginationInput,
): Promise<PaginatedRows<MetalRate>> {
  assertPermission(access, "rates.read");
  return repository.listRates(input);
}

export async function getMetalRatesCoverage(
  repository: ShopSettingsRepository,
  access: ResolvedStaffAccess,
  businessDate?: string,
  now: Date = new Date(),
): Promise<MetalRatesCoverage> {
  assertAnyPermission(access, ["rates.read", "rates.write", "billing.write"]);
  const date = businessDate ?? kolkataBusinessDate(now);
  const coverage = await repository.ratesCoverageForBusinessDate(date);
  return {
    business_date: date,
    gold: coverage.gold,
    silver: coverage.silver,
  };
}

export async function createMetalRate(
  repository: ShopSettingsRepository,
  access: ResolvedStaffAccess,
  input: MetalRateCreate,
  now: Date = new Date(),
): Promise<MetalRate> {
  assertPermission(access, "rates.write");
  const effectiveBusinessDate = input.effective_business_date ?? kolkataBusinessDate(now);

  try {
    const rate = await repository.insertRate({
      metal: input.metal,
      purity: input.purity,
      ratePerGram: input.rate_per_gram,
      effectiveBusinessDate,
      createdByStaffUserId: access.staff_user_id,
    });
    await repository.writeAudit({
      actorStaffUserId: access.staff_user_id,
      action: "shop.rate.create",
      entityType: "metal_rate",
      entityId: rate.id,
      payload: {
        metal: rate.metal,
        purity: rate.purity,
        rate_per_gram: rate.rate_per_gram,
        effective_business_date: rate.effective_business_date,
      },
    });
    return rate;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw conflictError(
        "RATE_DATE_CONFLICT",
        "A rate already exists for this metal, purity, and business date. Insert a new dated row instead of editing history.",
      );
    }
    throw error;
  }
}

export async function listMakingChargeDefaults(
  repository: ShopSettingsRepository,
  access: ResolvedStaffAccess,
  input: PaginationInput,
): Promise<PaginatedRows<MakingChargeDefault>> {
  assertPermission(access, "rates.read");
  return repository.listMakingChargeDefaults(input);
}

export async function upsertMakingChargeDefault(
  repository: ShopSettingsRepository,
  access: ResolvedStaffAccess,
  input: MakingChargeDefaultUpsert,
): Promise<MakingChargeDefault> {
  assertPermission(access, "rates.write");
  const row = await repository.upsertMakingChargeDefault({
    metal: input.metal,
    purity: input.purity,
    makingCharge: input.making_charge,
    updatedByStaffUserId: access.staff_user_id,
  });
  await repository.writeAudit({
    actorStaffUserId: access.staff_user_id,
    action: "shop.making_default.upsert",
    entityType: "making_charge_default",
    entityId: row.id,
    payload: {
      metal: row.metal,
      purity: row.purity,
      making_charge: row.making_charge,
    },
  });
  return row;
}

export async function deleteMakingChargeDefault(
  repository: ShopSettingsRepository,
  access: ResolvedStaffAccess,
  id: string,
): Promise<void> {
  assertPermission(access, "rates.write");
  const deleted = await repository.deleteMakingChargeDefault(id);
  if (!deleted) {
    throw notFoundError("Making default was not found.");
  }
  await repository.writeAudit({
    actorStaffUserId: access.staff_user_id,
    action: "shop.making_default.delete",
    entityType: "making_charge_default",
    entityId: id,
    payload: {},
  });
}

export async function getDocumentSequences(
  repository: ShopSettingsRepository,
  access: ResolvedStaffAccess,
): Promise<DocumentSequence[]> {
  assertPermission(access, "settings.write");
  return repository.listSequences();
}

export async function updateDocumentSequences(
  repository: ShopSettingsRepository,
  access: ResolvedStaffAccess,
  items: DocumentSequence[],
): Promise<DocumentSequence[]> {
  assertPermission(access, "settings.write");
  for (const item of items) {
    if (item.next_value < 1) {
      throw validationError("Sequence next_value cannot be less than 1.", [
        { field: "next_value", message: "Must be at least 1." },
      ]);
    }
  }
  const sequences = await repository.updateSequences(items);
  await repository.writeAudit({
    actorStaffUserId: access.staff_user_id,
    action: "shop.sequences.update",
    entityType: "document_sequence",
    payload: { items },
  });
  return sequences;
}

export async function getDeviceSettings(
  repository: ShopSettingsRepository,
  access: ResolvedStaffAccess,
): Promise<DeviceSettings> {
  assertAnyPermission(access, ["settings.write", "inventory.read", "billing.write"]);
  return repository.getDevices();
}

export async function updateDeviceSettings(
  repository: ShopSettingsRepository,
  access: ResolvedStaffAccess,
  patch: DeviceSettingsPatch,
): Promise<DeviceSettings> {
  assertPermission(access, "settings.write");
  const devices = await repository.updateDevices(patch);
  await repository.writeAudit({
    actorStaffUserId: access.staff_user_id,
    action: "shop.devices.update",
    entityType: "device_settings",
    payload: patch,
  });
  return devices;
}

export async function getReminderSettings(
  repository: ShopSettingsRepository,
  access: ResolvedStaffAccess,
): Promise<ReminderSettings> {
  assertPermission(access, "settings.write");
  return repository.getReminders();
}

export async function updateReminderSettings(
  repository: ShopSettingsRepository,
  access: ResolvedStaffAccess,
  patch: ReminderSettingsPatch,
): Promise<ReminderSettings> {
  assertPermission(access, "settings.write");
  const reminders = await repository.updateReminders(patch);
  await repository.writeAudit({
    actorStaffUserId: access.staff_user_id,
    action: "shop.reminders.update",
    entityType: "reminder_settings",
    payload: patch,
  });
  return reminders;
}

export async function listAuditEvents(
  repository: { listAudit(input: PaginationInput): Promise<PaginatedRows<AuditEvent>> },
  access: ResolvedStaffAccess,
  input: PaginationInput,
): Promise<PaginatedRows<AuditEvent>> {
  assertPermission(access, "audit.read");
  return repository.listAudit(input);
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === "23505";
}
