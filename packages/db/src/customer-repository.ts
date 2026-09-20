import type { PoolClient } from "pg";

import type {
  Customer,
  CustomerConsent,
  CustomerConsentPurpose,
  CustomerConsentStatus,
  CustomerConsentWrite,
  CustomerListItem,
  ReminderLanguage,
} from "@aabhushan/contracts";
import type { CustomerListFilters, CustomerRepository } from "@aabhushan/application";

import { asIsoDateTime } from "./pg-values";

const CUSTOMER_SORT_COLUMNS = {
  name: "c.display_name",
  created_at: "c.created_at",
  phone: "c.phone_normalized",
} as const;

const EMPTY_ACTIVITY = { items: [] as never[], total: 0 as const };

type CustomerRow = {
  id: string;
  display_name: string;
  phone_normalized: string | null;
  phone_display: string | null;
  email: string | null;
  address_line: string | null;
  notes: string | null;
  is_active: boolean;
  whatsapp_consent: string | null;
  created_at: Date;
  updated_at: Date;
};

type ConsentRow = {
  id: string;
  channel: string;
  purpose: string;
  status: string;
  granted_at: Date | null;
  revoked_at: Date | null;
  language: string | null;
};

type IdentityRow = {
  id: string;
  object_key: string;
  checksum_sha256: string;
  uploaded_by_staff_user_id: string;
  purpose: string;
  created_at: Date;
};

function asConsentStatus(value: string): CustomerConsentStatus {
  return value === "revoked" ? "revoked" : "granted";
}

function asConsentPurpose(value: string): CustomerConsentPurpose {
  if (value === "transactional_receipt") {
    return "transactional_receipt";
  }
  if (value === "due_reminder") {
    return "due_reminder";
  }
  if (value === "girvi_reminder") {
    return "girvi_reminder";
  }
  return "transactional_invoice";
}

function asLanguage(value: string | null): ReminderLanguage | null {
  if (value === "en" || value === "hi") {
    return value;
  }
  return null;
}

function asWhatsAppConsent(value: string | null): CustomerConsentStatus | null {
  if (value === "granted" || value === "revoked") {
    return value;
  }
  return null;
}

function mapConsent(row: ConsentRow): CustomerConsent {
  return {
    id: row.id,
    channel: "whatsapp",
    purpose: asConsentPurpose(row.purpose),
    status: asConsentStatus(row.status),
    granted_at: row.granted_at ? asIsoDateTime(row.granted_at) : null,
    revoked_at: row.revoked_at ? asIsoDateTime(row.revoked_at) : null,
    language: asLanguage(row.language),
  };
}

function mapListItem(row: CustomerRow): CustomerListItem {
  return {
    id: row.id,
    display_name: row.display_name,
    phone_normalized: row.phone_normalized,
    phone_display: row.phone_display,
    email: row.email,
    is_active: row.is_active,
    whatsapp_consent: asWhatsAppConsent(row.whatsapp_consent),
    created_at: asIsoDateTime(row.created_at),
  };
}

function mapCustomer(row: CustomerRow, consents: CustomerConsent[]): Customer {
  return {
    ...mapListItem(row),
    address_line: row.address_line,
    notes: row.notes,
    updated_at: asIsoDateTime(row.updated_at),
    consents,
    sales: EMPTY_ACTIVITY,
    girvi: EMPTY_ACTIVITY,
    notifications: EMPTY_ACTIVITY,
  };
}

function likePattern(value: string): string {
  return `%${value.replace(/[\\%_]/g, "\\$&")}%`;
}

const customerSelect = `
SELECT
  c.id,
  c.display_name,
  c.phone_normalized,
  c.phone_display,
  c.email,
  c.address_line,
  c.notes,
  c.is_active,
  c.created_at,
  c.updated_at,
  (
    SELECT CASE
      WHEN bool_or(cc.status = 'granted') THEN 'granted'
      WHEN bool_or(cc.status = 'revoked') THEN 'revoked'
      ELSE NULL
    END
    FROM app.customer_consents cc
    WHERE cc.organization_id = c.organization_id
      AND cc.customer_id = c.id
      AND cc.channel = 'whatsapp'
  ) AS whatsapp_consent
FROM app.customers c
`;

export function createCustomerRepository(client: PoolClient, organizationId: string): CustomerRepository {
  async function listConsentsFor(customerId: string): Promise<CustomerConsent[]> {
    const result = await client.query<ConsentRow>(
      `
      SELECT id, channel, purpose, status, granted_at, revoked_at, language
      FROM app.customer_consents
      WHERE organization_id = $1 AND customer_id = $2
      ORDER BY purpose
      `,
      [organizationId, customerId],
    );
    return result.rows.map(mapConsent);
  }

  async function getCustomerRow(customerId: string): Promise<CustomerRow | null> {
    const result = await client.query<CustomerRow>(`${customerSelect} WHERE c.organization_id = $1 AND c.id = $2`, [
      organizationId,
      customerId,
    ]);
    return result.rows[0] ?? null;
  }

  async function loadCustomer(customerId: string): Promise<Customer | null> {
    const row = await getCustomerRow(customerId);
    if (!row) {
      return null;
    }
    return mapCustomer(row, await listConsentsFor(customerId));
  }

  return {
    async listCustomers(input: CustomerListFilters): Promise<{ items: CustomerListItem[]; total: number }> {
      const sort = CUSTOMER_SORT_COLUMNS[input.sort as keyof typeof CUSTOMER_SORT_COLUMNS] ?? "c.created_at";
      const direction = input.direction === "asc" ? "ASC" : "DESC";
      const offset = (input.page - 1) * input.pageSize;
      const q = input.q?.trim() ? likePattern(input.q.trim()) : null;
      const list = await client.query<CustomerRow>(
        `
        ${customerSelect}
        WHERE c.organization_id = $1
          AND c.is_active = $2
          AND (
            $3::text IS NULL
            OR c.display_name ILIKE $3 ESCAPE '\\'
            OR COALESCE(c.phone_display, '') ILIKE $3 ESCAPE '\\'
            OR COALESCE(c.phone_normalized, '') ILIKE $3 ESCAPE '\\'
          )
        ORDER BY ${sort} ${direction} NULLS LAST, c.id ASC
        LIMIT $4 OFFSET $5
        `,
        [organizationId, input.isActive, q, input.pageSize, offset],
      );
      const count = await client.query<{ total: string }>(
        `
        SELECT count(*)::text AS total
        FROM app.customers c
        WHERE c.organization_id = $1
          AND c.is_active = $2
          AND (
            $3::text IS NULL
            OR c.display_name ILIKE $3 ESCAPE '\\'
            OR COALESCE(c.phone_display, '') ILIKE $3 ESCAPE '\\'
            OR COALESCE(c.phone_normalized, '') ILIKE $3 ESCAPE '\\'
          )
        `,
        [organizationId, input.isActive, q],
      );
      return {
        items: list.rows.map(mapListItem),
        total: Number.parseInt(count.rows[0]?.total ?? "0", 10),
      };
    },

    async getCustomer(customerId) {
      return loadCustomer(customerId);
    },

    async findIdByNormalizedPhone(phoneNormalized) {
      const result = await client.query<{ id: string }>(
        `
        SELECT id
        FROM app.customers
        WHERE organization_id = $1 AND phone_normalized = $2
        LIMIT 1
        `,
        [organizationId, phoneNormalized],
      );
      return result.rows[0]?.id ?? null;
    },

    async insertCustomer(input) {
      const inserted = await client.query<{ id: string }>(
        `
        INSERT INTO app.customers (
          organization_id, display_name, phone_normalized, phone_display, email, address_line, notes
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
        `,
        [
          organizationId,
          input.displayName,
          input.phoneNormalized,
          input.phoneDisplay,
          input.email,
          input.addressLine,
          input.notes,
        ],
      );
      const customerId = inserted.rows[0]?.id;
      if (!customerId) {
        throw new Error("Customer insert returned no id.");
      }
      if (input.consents.length > 0) {
        await upsertConsentRows(client, organizationId, customerId, input.consents, input.defaultLanguage);
      }
      const customer = await loadCustomer(customerId);
      if (!customer) {
        throw new Error("Customer insert could not be reloaded.");
      }
      return customer;
    },

    async updateCustomer(input) {
      const current = await getCustomerRow(input.customerId);
      if (!current) {
        return null;
      }
      await client.query(
        `
        UPDATE app.customers
        SET
          display_name = COALESCE($3, display_name),
          phone_normalized = CASE WHEN $4::boolean THEN $5 ELSE phone_normalized END,
          phone_display = CASE WHEN $4::boolean THEN $6 ELSE phone_display END,
          email = CASE WHEN $7::boolean THEN $8 ELSE email END,
          address_line = CASE WHEN $9::boolean THEN $10 ELSE address_line END,
          notes = CASE WHEN $11::boolean THEN $12 ELSE notes END,
          is_active = COALESCE($13, is_active),
          updated_at = timezone('utc', now())
        WHERE organization_id = $1 AND id = $2
        `,
        [
          organizationId,
          input.customerId,
          input.displayName ?? null,
          input.phoneNormalized !== undefined,
          input.phoneNormalized ?? null,
          input.phoneDisplay ?? null,
          input.email !== undefined,
          input.email ?? null,
          input.addressLine !== undefined,
          input.addressLine ?? null,
          input.notes !== undefined,
          input.notes ?? null,
          input.isActive ?? null,
        ],
      );
      return loadCustomer(input.customerId);
    },

    async listConsents(customerId) {
      return listConsentsFor(customerId);
    },

    async upsertConsents(input) {
      await upsertConsentRows(client, organizationId, input.customerId, input.items, input.defaultLanguage);
      return listConsentsFor(input.customerId);
    },

    async listIdentityFiles(customerId) {
      const result = await client.query<IdentityRow>(
        `
        SELECT id, object_key, checksum_sha256, uploaded_by_staff_user_id, purpose, created_at
        FROM app.customer_identity_files
        WHERE organization_id = $1 AND customer_id = $2
        ORDER BY created_at DESC
        `,
        [organizationId, customerId],
      );
      return result.rows.map((row) => ({
        id: row.id,
        object_key: row.object_key,
        checksum_sha256: row.checksum_sha256,
        uploaded_by_staff_user_id: row.uploaded_by_staff_user_id,
        purpose: row.purpose,
        created_at: asIsoDateTime(row.created_at),
      }));
    },

    async getDefaultLanguage() {
      const result = await client.query<{ language: string }>(
        `SELECT language FROM app.reminder_settings WHERE organization_id = $1 LIMIT 1`,
        [organizationId],
      );
      return result.rows[0]?.language === "hi" ? "hi" : "en";
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
  };
}

async function upsertConsentRows(
  client: PoolClient,
  organizationId: string,
  customerId: string,
  items: CustomerConsentWrite[],
  defaultLanguage: ReminderLanguage,
): Promise<void> {
  for (const item of items) {
    const language = item.language ?? defaultLanguage;
    await client.query(
      `
      INSERT INTO app.customer_consents (
        organization_id, customer_id, channel, purpose, status, granted_at, revoked_at, language
      )
      VALUES (
        $1, $2, $3, $4, $5,
        CASE WHEN $5 = 'granted' THEN timezone('utc', now()) ELSE NULL END,
        CASE WHEN $5 = 'revoked' THEN timezone('utc', now()) ELSE NULL END,
        $6
      )
      ON CONFLICT (organization_id, customer_id, channel, purpose)
      DO UPDATE SET
        status = EXCLUDED.status,
        granted_at = CASE
          WHEN EXCLUDED.status = 'granted' THEN COALESCE(app.customer_consents.granted_at, timezone('utc', now()))
          ELSE app.customer_consents.granted_at
        END,
        revoked_at = CASE
          WHEN EXCLUDED.status = 'revoked' THEN timezone('utc', now())
          ELSE NULL
        END,
        language = COALESCE(EXCLUDED.language, app.customer_consents.language),
        updated_at = timezone('utc', now())
      `,
      [organizationId, customerId, item.channel, item.purpose, item.status, language],
    );
  }
}
