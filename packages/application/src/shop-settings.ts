import type {
  AuditEvent,
  DeviceSettings,
  DeviceSettingsPatch,
  DocumentSequence,
  MetalRate,
  MetalRateCreate,
  ReminderSettings,
  ReminderSettingsPatch,
  ShopProfile,
  ShopProfilePatch,
} from "@aabhushan/contracts";
import { kolkataBusinessDate } from "@aabhushan/domain";

import { assertPermission } from "./authorize";
import { conflictError, validationError } from "./http-error";
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

export type ShopSettingsRepository = {
  getProfile(): Promise<ShopProfile>;
  updateProfile(patch: ShopProfilePatch): Promise<ShopProfile>;
  listRates(input: PaginationInput): Promise<PaginatedRows<MetalRate>>;
  insertRate(input: {
    metal: MetalRateCreate["metal"];
    purity: string;
    ratePerGram: string;
    effectiveBusinessDate: string;
    createdByStaffUserId: string;
  }): Promise<MetalRate>;
  listSequences(): Promise<DocumentSequence[]>;
  updateSequences(items: DocumentSequence[]): Promise<DocumentSequence[]>;
  getDevices(): Promise<DeviceSettings>;
  updateDevices(patch: DeviceSettingsPatch): Promise<DeviceSettings>;
  getReminders(): Promise<ReminderSettings>;
  updateReminders(patch: ReminderSettingsPatch): Promise<ReminderSettings>;
  writeAudit(event: AuditWrite & { actorStaffUserId: string | null }): Promise<void>;
};

export async function getShopProfile(repository: ShopSettingsRepository): Promise<ShopProfile> {
  return repository.getProfile();
}

export async function updateShopProfile(
  repository: ShopSettingsRepository,
  access: ResolvedStaffAccess,
  patch: ShopProfilePatch,
): Promise<ShopProfile> {
  assertPermission(access, "settings.write");
  const profile = await repository.updateProfile(patch);
  await repository.writeAudit({
    actorStaffUserId: access.staff_user_id,
    action: "shop.profile.update",
    entityType: "shop_profile",
    entityId: profile.id,
    payload: patch,
  });
  return profile;
}

export async function listMetalRates(
  repository: ShopSettingsRepository,
  access: ResolvedStaffAccess,
  input: PaginationInput,
): Promise<PaginatedRows<MetalRate>> {
  assertPermission(access, "rates.read");
  return repository.listRates(input);
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
  assertPermission(access, "settings.write");
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
