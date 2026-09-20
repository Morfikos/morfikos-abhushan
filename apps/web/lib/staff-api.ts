import {
  auditListSchema,
  currentStaffSchema,
  deviceSettingsSchema,
  documentSequencesSchema,
  metalRateListSchema,
  metalRateSchema,
  reminderSettingsSchema,
  shopProfileSchema,
  staffDirectoryItemSchema,
  staffListSchema,
  type AuditList,
  type CurrentStaff,
  type DeviceSettings,
  type DeviceSettingsPatch,
  type DocumentSequences,
  type DocumentSequencesPatch,
  type MetalRate,
  type MetalRateCreate,
  type MetalRateList,
  type ReminderSettings,
  type ReminderSettingsPatch,
  type ShopProfile,
  type ShopProfilePatch,
  type StaffDirectoryItem,
  type StaffInviteRequest,
  type StaffList,
} from "@aabhushan/contracts";

import { publicEnv } from "@/lib/public-env";

export class StaffApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "StaffApiError";
    this.status = status;
    this.code = code;
  }
}

function apiUrl(path: string): string {
  return `${publicEnv.NEXT_PUBLIC_API_URL}${path}`;
}

async function staffRequest<T>(
  accessToken: string,
  path: string,
  options: { method?: string; body?: unknown; schema: { parse: (value: unknown) => T } },
): Promise<T> {
  const response = await fetch(apiUrl(path), {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : null,
    cache: "no-store",
  });

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const record = typeof body === "object" && body !== null ? (body as { code?: unknown; message?: unknown }) : {};
    const code = typeof record.code === "string" ? record.code : "REQUEST_FAILED";
    const message = typeof record.message === "string" ? record.message : "The request failed.";
    throw new StaffApiError(response.status, code, message);
  }

  return options.schema.parse(body);
}

export async function fetchCurrentStaff(accessToken: string): Promise<CurrentStaff> {
  return staffRequest(accessToken, "/api/v1/me", { schema: currentStaffSchema });
}

export async function fetchShopProfile(accessToken: string): Promise<ShopProfile> {
  return staffRequest(accessToken, "/api/v1/shop/profile", { schema: shopProfileSchema });
}

export async function patchShopProfile(accessToken: string, patch: ShopProfilePatch): Promise<ShopProfile> {
  return staffRequest(accessToken, "/api/v1/shop/profile", { method: "PATCH", body: patch, schema: shopProfileSchema });
}

export async function fetchMetalRates(
  accessToken: string,
  query: { page: number; pageSize: number },
): Promise<MetalRateList> {
  const params = new URLSearchParams({
    page: String(query.page),
    page_size: String(query.pageSize),
    sort: "effective_business_date",
    direction: "desc",
  });
  return staffRequest(accessToken, `/api/v1/shop/rates?${params.toString()}`, { schema: metalRateListSchema });
}

export async function createMetalRateRequest(accessToken: string, input: MetalRateCreate): Promise<MetalRate> {
  return staffRequest(accessToken, "/api/v1/shop/rates", { method: "POST", body: input, schema: metalRateSchema });
}

export async function fetchSequences(accessToken: string): Promise<DocumentSequences> {
  return staffRequest(accessToken, "/api/v1/shop/sequences", { schema: documentSequencesSchema });
}

export async function patchSequences(accessToken: string, patch: DocumentSequencesPatch): Promise<DocumentSequences> {
  return staffRequest(accessToken, "/api/v1/shop/sequences", { method: "PATCH", body: patch, schema: documentSequencesSchema });
}

export async function fetchDevices(accessToken: string): Promise<DeviceSettings> {
  return staffRequest(accessToken, "/api/v1/shop/devices", { schema: deviceSettingsSchema });
}

export async function patchDevices(accessToken: string, patch: DeviceSettingsPatch): Promise<DeviceSettings> {
  return staffRequest(accessToken, "/api/v1/shop/devices", { method: "PATCH", body: patch, schema: deviceSettingsSchema });
}

export async function fetchReminders(accessToken: string): Promise<ReminderSettings> {
  return staffRequest(accessToken, "/api/v1/shop/reminders", { schema: reminderSettingsSchema });
}

export async function patchReminders(accessToken: string, patch: ReminderSettingsPatch): Promise<ReminderSettings> {
  return staffRequest(accessToken, "/api/v1/shop/reminders", { method: "PATCH", body: patch, schema: reminderSettingsSchema });
}

export async function fetchStaffDirectory(accessToken: string, query: { page: number; pageSize: number }): Promise<StaffList> {
  const params = new URLSearchParams({
    page: String(query.page),
    page_size: String(query.pageSize),
    sort: "invited_at",
    direction: "desc",
  });
  return staffRequest(accessToken, `/api/v1/staff?${params.toString()}`, { schema: staffListSchema });
}

export async function inviteStaffRequest(accessToken: string, input: StaffInviteRequest): Promise<StaffDirectoryItem> {
  return staffRequest(accessToken, "/api/v1/staff", { method: "POST", body: input, schema: staffDirectoryItemSchema });
}

export async function suspendStaffRequest(accessToken: string, staffUserId: string): Promise<StaffDirectoryItem> {
  return staffRequest(accessToken, `/api/v1/staff/${staffUserId}/suspend`, {
    method: "POST",
    body: {},
    schema: staffDirectoryItemSchema,
  });
}

export async function fetchAudit(accessToken: string, query: { page: number; pageSize: number }): Promise<AuditList> {
  const params = new URLSearchParams({
    page: String(query.page),
    page_size: String(query.pageSize),
    sort: "created_at",
    direction: "desc",
  });
  return staffRequest(accessToken, `/api/v1/audit?${params.toString()}`, { schema: auditListSchema });
}
