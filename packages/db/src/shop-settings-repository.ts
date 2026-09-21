import type { PoolClient } from "pg";

import type {
  AuditEvent,
  DeviceSettings,
  DeviceSettingsPatch,
  DocumentSequence,
  MakingChargeDefault,
  MetalRate,
  ReminderSettings,
  ReminderSettingsPatch,
  ShopProfilePatch,
} from "@aabhushan/contracts";
import { makingChargeSchema } from "@aabhushan/contracts";
import type {
  PaginationInput,
  PaginatedRows,
  ShopProfileRecord,
  ShopSettingsRepository,
} from "@aabhushan/application";
import type { ShopLogoContentType } from "@aabhushan/domain";

import { asBusinessDate, asDecimalString, asIsoDateTime, asLocalTime } from "./pg-values";

const RATE_SORT_COLUMNS = {
  effective_business_date: "effective_business_date",
  metal: "metal",
  purity: "purity",
  created_at: "created_at",
} as const;

const MAKING_DEFAULT_SORT_COLUMNS = {
  metal: "metal",
  purity: "purity",
  updated_at: "updated_at",
} as const;

const AUDIT_SORT_COLUMNS = {
  created_at: "created_at",
  action: "action",
  entity_type: "entity_type",
} as const;

type ProfileRow = {
  id: string;
  organization_id: string;
  legal_name: string;
  address_line: string | null;
  phone: string | null;
  invoice_footer: string | null;
  logo_object_key: string | null;
  logo_content_type: string | null;
  logo_byte_size: number | null;
  logo_checksum_sha256: string | null;
  time_zone: string;
  branch_id: string;
  branch_name: string;
  branch_address_line: string | null;
  branch_is_active: boolean;
};

type RateRow = {
  id: string;
  metal: string;
  purity: string;
  rate_per_gram: string;
  effective_business_date: Date | string;
  created_by_staff_user_id: string;
  created_at: Date;
};

type MakingDefaultRow = {
  id: string;
  metal: string;
  purity: string;
  making_charge: unknown;
  updated_by_staff_user_id: string;
  updated_at: Date;
};

type SequenceRow = {
  document_type: string;
  prefix: string;
  padding: number;
  next_value: number;
};

type DeviceRow = {
  scan_terminator: string;
  expected_suffix: string;
  tag_width_mm: string;
  tag_height_mm: string;
  invoice_paper_size: string;
};

type ReminderRow = {
  girvi_reminders_enabled: boolean;
  invoice_due_reminders_enabled: boolean;
  send_window_start: string;
  send_window_end: string;
  language: string;
};

type AuditRow = {
  id: string;
  actor_staff_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  reason: string | null;
  payload: Record<string, unknown> | null;
  created_at: Date;
};

function asLogoContentType(value: string | null): ShopLogoContentType | null {
  if (value === "image/jpeg" || value === "image/png" || value === "image/webp") {
    return value;
  }
  return null;
}

function mapProfile(row: ProfileRow): ShopProfileRecord {
  return {
    id: row.id,
    organization_id: row.organization_id,
    legal_name: row.legal_name,
    address_line: row.address_line,
    phone: row.phone,
    invoice_footer: row.invoice_footer,
    logo_object_key: row.logo_object_key,
    logo_content_type: asLogoContentType(row.logo_content_type),
    logo_byte_size: row.logo_byte_size,
    logo_checksum_sha256: row.logo_checksum_sha256,
    time_zone: "Asia/Kolkata",
    branch: {
      id: row.branch_id,
      name: row.branch_name,
      address_line: row.branch_address_line,
      is_active: row.branch_is_active,
    },
  };
}

function mapRate(row: RateRow): MetalRate {
  return {
    id: row.id,
    metal: row.metal === "silver" ? "silver" : "gold",
    purity: row.purity,
    rate_per_gram: asDecimalString(row.rate_per_gram),
    effective_business_date: asBusinessDate(row.effective_business_date),
    created_by_staff_user_id: row.created_by_staff_user_id,
    created_at: asIsoDateTime(row.created_at),
  };
}

function mapMakingDefault(row: MakingDefaultRow): MakingChargeDefault {
  return {
    id: row.id,
    metal: row.metal === "silver" ? "silver" : "gold",
    purity: row.purity,
    making_charge: makingChargeSchema.parse(row.making_charge),
    updated_by_staff_user_id: row.updated_by_staff_user_id,
    updated_at: asIsoDateTime(row.updated_at),
  };
}

function mapSequence(row: SequenceRow): DocumentSequence {
  const documentType =
    row.document_type === "receipt" ||
    row.document_type === "girvi_account" ||
    row.document_type === "article" ||
    row.document_type === "credit_note" ||
    row.document_type === "refund"
      ? row.document_type
      : "invoice";

  return {
    document_type: documentType,
    prefix: row.prefix,
    padding: row.padding,
    next_value: row.next_value,
  };
}

function mapDevices(row: DeviceRow): DeviceSettings {
  const terminator = row.scan_terminator === "Tab" || row.scan_terminator === "None" ? row.scan_terminator : "Enter";
  const paper = row.invoice_paper_size === "A4" || row.invoice_paper_size === "80mm" ? row.invoice_paper_size : "A5";

  return {
    scan_terminator: terminator,
    expected_suffix: row.expected_suffix,
    tag_width_mm: asDecimalString(row.tag_width_mm),
    tag_height_mm: asDecimalString(row.tag_height_mm),
    invoice_paper_size: paper,
    hardware_validated: false,
  };
}

function mapReminders(row: ReminderRow): ReminderSettings {
  return {
    girvi_reminders_enabled: row.girvi_reminders_enabled,
    invoice_due_reminders_enabled: row.invoice_due_reminders_enabled,
    send_window_start: asLocalTime(row.send_window_start),
    send_window_end: asLocalTime(row.send_window_end),
    language: row.language === "hi" ? "hi" : "en",
  };
}

function mapAudit(row: AuditRow): AuditEvent {
  return {
    id: row.id,
    actor_staff_user_id: row.actor_staff_user_id,
    action: row.action,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    reason: row.reason,
    payload: row.payload,
    created_at: asIsoDateTime(row.created_at),
  };
}

const profileSql = `
SELECT
  p.id,
  p.organization_id,
  p.legal_name,
  p.address_line,
  p.phone,
  p.invoice_footer,
  p.logo_object_key,
  p.logo_content_type,
  p.logo_byte_size,
  p.logo_checksum_sha256,
  o.time_zone,
  b.id AS branch_id,
  b.name AS branch_name,
  b.address_line AS branch_address_line,
  b.is_active AS branch_is_active
FROM app.shop_profiles p
INNER JOIN app.organizations o ON o.id = p.organization_id
INNER JOIN app.branches b ON b.organization_id = p.organization_id AND b.is_active
LIMIT 1
`;

export function createShopSettingsRepository(client: PoolClient, organizationId: string): ShopSettingsRepository & {
  listAudit(input: PaginationInput): Promise<PaginatedRows<AuditEvent>>;
} {
  return {
    async getProfile(): Promise<ShopProfileRecord> {
      const result = await client.query<ProfileRow>(profileSql);
      const row = result.rows[0];
      if (!row) {
        throw new Error("Shop profile is missing for the current organization.");
      }
      return mapProfile(row);
    },

    async updateProfile(patch: ShopProfilePatch): Promise<ShopProfileRecord> {
      await client.query(
        `
        UPDATE app.shop_profiles
        SET
          legal_name = COALESCE($2, legal_name),
          address_line = CASE WHEN $3::boolean THEN $4 ELSE address_line END,
          phone = CASE WHEN $5::boolean THEN $6 ELSE phone END,
          invoice_footer = CASE WHEN $7::boolean THEN $8 ELSE invoice_footer END,
          updated_at = timezone('utc', now())
        WHERE organization_id = $1
        `,
        [
          organizationId,
          patch.legal_name ?? null,
          patch.address_line !== undefined,
          patch.address_line ?? null,
          patch.phone !== undefined,
          patch.phone ?? null,
          patch.invoice_footer !== undefined,
          patch.invoice_footer ?? null,
        ],
      );
      return this.getProfile();
    },

    async updateLogo(input) {
      await client.query(
        `
        UPDATE app.shop_profiles
        SET
          logo_object_key = $2,
          logo_content_type = $3,
          logo_byte_size = $4,
          logo_checksum_sha256 = $5,
          updated_at = timezone('utc', now())
        WHERE organization_id = $1
        `,
        [organizationId, input.objectKey, input.contentType, input.byteSize, input.checksumSha256],
      );
      return this.getProfile();
    },

    async clearLogo() {
      await client.query(
        `
        UPDATE app.shop_profiles
        SET
          logo_object_key = NULL,
          logo_content_type = NULL,
          logo_byte_size = NULL,
          logo_checksum_sha256 = NULL,
          updated_at = timezone('utc', now())
        WHERE organization_id = $1
        `,
        [organizationId],
      );
      return this.getProfile();
    },

    async listRates(input: PaginationInput): Promise<PaginatedRows<MetalRate>> {
      const sort = RATE_SORT_COLUMNS[input.sort as keyof typeof RATE_SORT_COLUMNS] ?? "effective_business_date";
      const direction = input.direction === "asc" ? "ASC" : "DESC";
      const offset = (input.page - 1) * input.pageSize;
      const list = await client.query<RateRow>(
        `
        SELECT id, metal, purity, rate_per_gram, effective_business_date, created_by_staff_user_id, created_at
        FROM app.metal_rates
        WHERE organization_id = $1
        ORDER BY ${sort} ${direction}, created_at DESC
        LIMIT $2 OFFSET $3
        `,
        [organizationId, input.pageSize, offset],
      );
      const count = await client.query<{ total: string }>(
        `SELECT count(*)::text AS total FROM app.metal_rates WHERE organization_id = $1`,
        [organizationId],
      );
      return {
        items: list.rows.map(mapRate),
        total: Number.parseInt(count.rows[0]?.total ?? "0", 10),
      };
    },

    async ratesCoverageForBusinessDate(businessDate: string): Promise<{ gold: boolean; silver: boolean }> {
      const result = await client.query<{ metal: "gold" | "silver" }>(
        `
        SELECT DISTINCT metal
        FROM app.metal_rates
        WHERE organization_id = $1
          AND effective_business_date = $2::date
          AND metal IN ('gold', 'silver')
        `,
        [organizationId, businessDate],
      );
      const metals = new Set(result.rows.map((row) => row.metal));
      return {
        gold: metals.has("gold"),
        silver: metals.has("silver"),
      };
    },

    async insertRate(input) {
      const result = await client.query<RateRow>(
        `
        INSERT INTO app.metal_rates (
          organization_id, metal, purity, rate_per_gram, effective_business_date, created_by_staff_user_id
        )
        VALUES ($1, $2, $3, $4::numeric, $5::date, $6)
        RETURNING id, metal, purity, rate_per_gram, effective_business_date, created_by_staff_user_id, created_at
        `,
        [organizationId, input.metal, input.purity, input.ratePerGram, input.effectiveBusinessDate, input.createdByStaffUserId],
      );
      const row = result.rows[0];
      if (!row) {
        throw new Error("Metal rate insert returned no row.");
      }
      return mapRate(row);
    },

    async activePurityLabelExists(label: string) {
      const result = await client.query<{ exists: boolean }>(
        `
        SELECT EXISTS(
          SELECT 1 FROM app.purity_labels
          WHERE organization_id = $1
            AND is_active
            AND lower(trim(label)) = lower(trim($2))
        ) AS exists
        `,
        [organizationId, label],
      );
      return result.rows[0]?.exists === true;
    },

    async listMakingChargeDefaults(input: PaginationInput): Promise<PaginatedRows<MakingChargeDefault>> {
      const sort =
        MAKING_DEFAULT_SORT_COLUMNS[input.sort as keyof typeof MAKING_DEFAULT_SORT_COLUMNS] ?? "metal";
      const direction = input.direction === "asc" ? "ASC" : "DESC";
      const offset = (input.page - 1) * input.pageSize;
      const list = await client.query<MakingDefaultRow>(
        `
        SELECT id, metal, purity, making_charge, updated_by_staff_user_id, updated_at
        FROM app.making_charge_defaults
        WHERE organization_id = $1
        ORDER BY ${sort} ${direction}, purity ASC
        LIMIT $2 OFFSET $3
        `,
        [organizationId, input.pageSize, offset],
      );
      const count = await client.query<{ total: string }>(
        `SELECT count(*)::text AS total FROM app.making_charge_defaults WHERE organization_id = $1`,
        [organizationId],
      );
      return {
        items: list.rows.map(mapMakingDefault),
        total: Number.parseInt(count.rows[0]?.total ?? "0", 10),
      };
    },

    async upsertMakingChargeDefault(input) {
      const result = await client.query<MakingDefaultRow>(
        `
        INSERT INTO app.making_charge_defaults (
          organization_id, metal, purity, making_charge, updated_by_staff_user_id
        )
        VALUES ($1, $2, $3, $4::jsonb, $5)
        ON CONFLICT (organization_id, metal, purity)
        DO UPDATE SET
          making_charge = EXCLUDED.making_charge,
          updated_by_staff_user_id = EXCLUDED.updated_by_staff_user_id,
          updated_at = timezone('utc', now())
        RETURNING id, metal, purity, making_charge, updated_by_staff_user_id, updated_at
        `,
        [organizationId, input.metal, input.purity, JSON.stringify(input.makingCharge), input.updatedByStaffUserId],
      );
      const row = result.rows[0];
      if (!row) {
        throw new Error("Making charge default upsert returned no row.");
      }
      return mapMakingDefault(row);
    },

    async deleteMakingChargeDefault(id: string) {
      const result = await client.query(
        `
        DELETE FROM app.making_charge_defaults
        WHERE organization_id = $1 AND id = $2
        `,
        [organizationId, id],
      );
      return (result.rowCount ?? 0) > 0;
    },

    async listSequences(): Promise<DocumentSequence[]> {
      const result = await client.query<SequenceRow>(
        `
        SELECT document_type, prefix, padding, next_value
        FROM app.document_sequences
        WHERE organization_id = $1
        ORDER BY document_type
        `,
        [organizationId],
      );
      return result.rows.map(mapSequence);
    },

    async updateSequences(items: DocumentSequence[]): Promise<DocumentSequence[]> {
      for (const item of items) {
        await client.query(
          `
          UPDATE app.document_sequences
          SET prefix = $3, padding = $4, next_value = $5, updated_at = timezone('utc', now())
          WHERE organization_id = $1 AND document_type = $2
          `,
          [organizationId, item.document_type, item.prefix, item.padding, item.next_value],
        );
      }
      return this.listSequences();
    },

    async getDevices(): Promise<DeviceSettings> {
      const result = await client.query<DeviceRow>(
        `
        SELECT scan_terminator, expected_suffix, tag_width_mm, tag_height_mm, invoice_paper_size
        FROM app.device_settings
        WHERE organization_id = $1
        LIMIT 1
        `,
        [organizationId],
      );
      const row = result.rows[0];
      if (!row) {
        throw new Error("Device settings are missing for the current organization.");
      }
      return mapDevices(row);
    },

    async updateDevices(patch: DeviceSettingsPatch): Promise<DeviceSettings> {
      await client.query(
        `
        UPDATE app.device_settings
        SET
          scan_terminator = COALESCE($2, scan_terminator),
          expected_suffix = COALESCE($3, expected_suffix),
          tag_width_mm = COALESCE($4::numeric, tag_width_mm),
          tag_height_mm = COALESCE($5::numeric, tag_height_mm),
          invoice_paper_size = COALESCE($6, invoice_paper_size),
          updated_at = timezone('utc', now())
        WHERE organization_id = $1
        `,
        [
          organizationId,
          patch.scan_terminator ?? null,
          patch.expected_suffix ?? null,
          patch.tag_width_mm ?? null,
          patch.tag_height_mm ?? null,
          patch.invoice_paper_size ?? null,
        ],
      );
      return this.getDevices();
    },

    async getReminders(): Promise<ReminderSettings> {
      const result = await client.query<ReminderRow>(
        `
        SELECT girvi_reminders_enabled, invoice_due_reminders_enabled, send_window_start, send_window_end, language
        FROM app.reminder_settings
        WHERE organization_id = $1
        LIMIT 1
        `,
        [organizationId],
      );
      const row = result.rows[0];
      if (!row) {
        throw new Error("Reminder settings are missing for the current organization.");
      }
      return mapReminders(row);
    },

    async updateReminders(patch: ReminderSettingsPatch): Promise<ReminderSettings> {
      await client.query(
        `
        UPDATE app.reminder_settings
        SET
          girvi_reminders_enabled = COALESCE($2, girvi_reminders_enabled),
          invoice_due_reminders_enabled = COALESCE($3, invoice_due_reminders_enabled),
          send_window_start = COALESCE($4::time, send_window_start),
          send_window_end = COALESCE($5::time, send_window_end),
          language = COALESCE($6, language),
          updated_at = timezone('utc', now())
        WHERE organization_id = $1
        `,
        [
          organizationId,
          patch.girvi_reminders_enabled ?? null,
          patch.invoice_due_reminders_enabled ?? null,
          patch.send_window_start ?? null,
          patch.send_window_end ?? null,
          patch.language ?? null,
        ],
      );
      return this.getReminders();
    },

    async writeAudit(event) {
      await client.query(
        `
        INSERT INTO app.audit_events (
          organization_id, actor_staff_user_id, action, entity_type, entity_id, reason, payload
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
        `,
        [
          organizationId,
          event.actorStaffUserId,
          event.action,
          event.entityType,
          event.entityId ?? null,
          event.reason ?? null,
          event.payload ? JSON.stringify(event.payload) : null,
        ],
      );
    },

    async listAudit(input: PaginationInput): Promise<PaginatedRows<AuditEvent>> {
      const sort = AUDIT_SORT_COLUMNS[input.sort as keyof typeof AUDIT_SORT_COLUMNS] ?? "created_at";
      const direction = input.direction === "asc" ? "ASC" : "DESC";
      const offset = (input.page - 1) * input.pageSize;
      const list = await client.query<AuditRow>(
        `
        SELECT id, actor_staff_user_id, action, entity_type, entity_id, reason, payload, created_at
        FROM app.audit_events
        WHERE organization_id = $1
        ORDER BY ${sort} ${direction}, created_at DESC
        LIMIT $2 OFFSET $3
        `,
        [organizationId, input.pageSize, offset],
      );
      const count = await client.query<{ total: string }>(
        `SELECT count(*)::text AS total FROM app.audit_events WHERE organization_id = $1`,
        [organizationId],
      );
      return {
        items: list.rows.map(mapAudit),
        total: Number.parseInt(count.rows[0]?.total ?? "0", 10),
      };
    },
  };
}
