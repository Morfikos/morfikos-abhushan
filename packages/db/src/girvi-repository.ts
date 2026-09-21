import type { PoolClient } from "pg";

import type {
  GirviAccount,
  GirviAccountListItem,
  GirviAccountStatus,
  GirviCollateralFile,
  GirviCollateralItem,
  GirviCollateralStatus,
  GirviCustodyEvent,
  GirviCustodyEventType,
  GirviFinancialEvent,
  GirviFinancialEventType,
  GirviReleaseEvent,
  GirviTermsSnapshotDto,
  PaymentMethod,
} from "@aabhushan/contracts";
import type { GirviRepository } from "@aabhushan/application";
import { girviRateFromTermsSnapshot } from "@aabhushan/application";
import type { GirviLedgerEvent, GirviLedgerEventType } from "@aabhushan/domain";
import { girviAccountIsOverdue, kolkataBusinessDate } from "@aabhushan/domain";

import { findApprovedGirviPolicy } from "./girvi-calculation-policy-repository";
import { asBusinessDate, asDecimalString, asIsoDateTime } from "./pg-values";

type AccountRow = {
  id: string;
  account_number: string;
  customer_id: string;
  customer_display_name: string;
  status: string;
  principal_inr: string | number;
  principal_outstanding_inr: string | number;
  interest_outstanding_inr: string | number;
  start_business_date: Date | string;
  maturity_business_date: Date | string;
  terms_snapshot: unknown;
  calculation_policy_version: string | null;
  activated_at: Date | null;
  activated_by_staff_user_id: string | null;
  settled_at: Date | null;
  settled_by_staff_user_id: string | null;
  released_at: Date | null;
  released_by_staff_user_id: string | null;
  row_version: number;
  created_at: Date;
  updated_at: Date;
};

type CollateralRow = {
  id: string;
  description: string;
  metal: string | null;
  purity: string | null;
  gross_weight_grams: string | number | null;
  net_metal_weight_grams: string | number | null;
  assessed_value_inr: string | number | null;
  packet_number: string;
  custody_location: string;
  status: string;
};

type FileRow = {
  id: string;
  collateral_item_id: string;
  object_key: string;
  checksum_sha256: string;
  purpose: string;
  uploaded_by_staff_user_id: string;
  created_at: Date;
};

type CustodyRow = {
  id: string;
  event_type: string;
  packet_number: string;
  custody_location: string | null;
  collateral_item_id: string | null;
  actor_staff_user_id: string;
  occurred_at: Date;
  notes: string | null;
};

type FinancialRow = {
  id: string;
  event_type: string;
  effective_business_date: Date | string;
  principal_delta_inr: string | number;
  interest_delta_inr: string | number;
  amount_inr: string | number;
  method: string | null;
  notes: string | null;
  posting_sequence: number;
  actor_staff_user_id: string;
  event_key: string;
  created_at: Date;
};

type ReleaseRow = {
  id: string;
  girvi_account_id: string;
  settlement_event_id: string | null;
  packet_numbers_verified: string[];
  staff_acknowledged_by: string;
  customer_acknowledged: boolean;
  recipient_name: string;
  waiver_reason: string | null;
  notes: string | null;
  created_at: Date;
};

const FINANCIAL_EVENT_COLUMNS = `id, event_type, effective_business_date, principal_delta_inr,
           interest_delta_inr, amount_inr, method, notes, posting_sequence,
           actor_staff_user_id, event_key, created_at`;

const ACCOUNT_COLUMNS = `a.id, a.account_number, a.customer_id, c.display_name AS customer_display_name,
      a.status, a.principal_inr, a.principal_outstanding_inr, a.interest_outstanding_inr,
      a.start_business_date, a.maturity_business_date,
      a.terms_snapshot, a.calculation_policy_version, a.activated_at, a.activated_by_staff_user_id,
      a.settled_at, a.settled_by_staff_user_id, a.released_at, a.released_by_staff_user_id,
      a.row_version, a.created_at, a.updated_at`;

const SORT_COLUMNS = {
  created_at: "a.created_at",
  maturity_business_date: "a.maturity_business_date",
  account_number: "a.account_number",
  principal_inr: "a.principal_inr",
} as const;

function asStatus(value: string): GirviAccountStatus {
  if (value === "active" || value === "settled" || value === "released" || value === "draft") {
    return value;
  }
  return "draft";
}

function asCollateralStatus(value: string): GirviCollateralStatus {
  return value === "released" ? "released" : "in_custody";
}

function asCustodyType(value: string): GirviCustodyEventType {
  if (value === "location_changed" || value === "released") {
    return value;
  }
  return "received";
}

const FINANCIAL_EVENT_TYPES = [
  "disbursement",
  "opening_balance",
  "interest_accrual",
  "interest_recognized",
  "repayment",
  "settlement",
  "waiver",
] as const satisfies readonly GirviFinancialEventType[];

function asFinancialType(value: string): GirviFinancialEventType {
  const match = FINANCIAL_EVENT_TYPES.find((type) => type === value);
  if (!match) {
    throw new Error(`Unknown Girvi financial event type: ${value}`);
  }
  return match;
}

function asPaymentMethod(value: string | null): PaymentMethod | null {
  if (value === "cash" || value === "upi" || value === "card" || value === "bank") {
    return value;
  }
  return null;
}

/**
 * Reads the frozen terms as stored. A snapshot written before `girvi.v1` approval
 * stays `unsupported`, which is what blocks its payoff APIs.
 */
function asTermsSnapshot(value: unknown): GirviTermsSnapshotDto {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const interest =
    record.interest && typeof record.interest === "object"
      ? (record.interest as Record<string, unknown>)
      : {};
  const principal = String(record.principal_inr ?? "0.00");
  const start = String(record.start_business_date ?? "1970-01-01");
  const maturity = String(record.maturity_business_date ?? "1970-01-01");
  const rate =
    typeof interest.rate_percent_per_30_days === "string" ? interest.rate_percent_per_30_days : null;

  if (interest.status === "approved" && rate !== null) {
    return {
      principal_inr: principal,
      start_business_date: start,
      maturity_business_date: maturity,
      interest: {
        status: "approved",
        policy_version: String(interest.policy_version ?? "girvi.v1"),
        rate_percent_per_30_days: rate,
        method: String(interest.method ?? ""),
        day_count: String(interest.day_count ?? ""),
        allocation_order: String(interest.allocation_order ?? ""),
        minimum_period: String(interest.minimum_period ?? ""),
        grace_period: String(interest.grace_period ?? ""),
        extra_charges: String(interest.extra_charges ?? ""),
        principal_reduction: String(interest.principal_reduction ?? ""),
        backdating: String(interest.backdating ?? ""),
        rounding_mode: String(interest.rounding_mode ?? ""),
        rounding_scale: typeof interest.rounding_scale === "number" ? interest.rounding_scale : 2,
      },
    };
  }

  return {
    principal_inr: principal,
    start_business_date: start,
    maturity_business_date: maturity,
    interest: {
      status: "unsupported",
      message: String(
        interest.message ??
          "No approved interest method is frozen on this account, so balances cannot be calculated.",
      ),
      rate_percent_per_30_days: rate,
    },
  };
}

function mapFile(row: FileRow): GirviCollateralFile {
  return {
    id: row.id,
    object_key: row.object_key,
    checksum_sha256: row.checksum_sha256,
    purpose: row.purpose,
    uploaded_by_staff_user_id: row.uploaded_by_staff_user_id,
    created_at: asIsoDateTime(row.created_at),
  };
}

function mapCollateral(row: CollateralRow, files: GirviCollateralFile[]): GirviCollateralItem {
  return {
    id: row.id,
    description: row.description,
    metal: row.metal === "gold" || row.metal === "silver" ? row.metal : null,
    purity: row.purity,
    gross_weight_grams: row.gross_weight_grams === null ? null : asDecimalString(row.gross_weight_grams),
    net_metal_weight_grams:
      row.net_metal_weight_grams === null ? null : asDecimalString(row.net_metal_weight_grams),
    assessed_value_inr: row.assessed_value_inr === null ? null : asDecimalString(row.assessed_value_inr),
    packet_number: row.packet_number,
    custody_location: row.custody_location,
    status: asCollateralStatus(row.status),
    files,
  };
}

function mapCustody(row: CustodyRow): GirviCustodyEvent {
  return {
    id: row.id,
    event_type: asCustodyType(row.event_type),
    packet_number: row.packet_number,
    custody_location: row.custody_location,
    collateral_item_id: row.collateral_item_id,
    actor_staff_user_id: row.actor_staff_user_id,
    occurred_at: asIsoDateTime(row.occurred_at),
    notes: row.notes,
  };
}

function mapFinancial(row: FinancialRow): GirviFinancialEvent {
  return {
    id: row.id,
    event_type: asFinancialType(row.event_type),
    effective_business_date: asBusinessDate(row.effective_business_date),
    principal_delta_inr: asDecimalString(row.principal_delta_inr),
    interest_delta_inr: asDecimalString(row.interest_delta_inr),
    amount_inr: asDecimalString(row.amount_inr),
    method: asPaymentMethod(row.method),
    notes: row.notes,
    posting_sequence: row.posting_sequence,
    actor_staff_user_id: row.actor_staff_user_id,
    event_key: row.event_key,
    created_at: asIsoDateTime(row.created_at),
  };
}

/** `interest_accrual` is a legacy constraint value the girvi.v1 engine never posts. */
function asLedgerEventType(value: string): GirviLedgerEventType {
  const type = asFinancialType(value);
  if (type === "interest_accrual") {
    throw new Error(
      "A posted interest_accrual event is not part of girvi.v1. Review the account before calculating a balance.",
    );
  }
  return type;
}

function mapLedgerEvent(row: FinancialRow): GirviLedgerEvent {
  return {
    eventType: asLedgerEventType(row.event_type),
    effectiveBusinessDate: asBusinessDate(row.effective_business_date),
    principalDeltaInr: asDecimalString(row.principal_delta_inr),
    interestDeltaInr: asDecimalString(row.interest_delta_inr),
    sequence: row.posting_sequence,
  };
}

function mapRelease(row: ReleaseRow): GirviReleaseEvent {
  return {
    id: row.id,
    girvi_account_id: row.girvi_account_id,
    settlement_event_id: row.settlement_event_id,
    packet_numbers_verified: row.packet_numbers_verified,
    staff_acknowledged_by: row.staff_acknowledged_by,
    customer_acknowledged: row.customer_acknowledged,
    recipient_name: row.recipient_name,
    waiver_reason: row.waiver_reason,
    notes: row.notes,
    created_at: asIsoDateTime(row.created_at),
  };
}

function mapListItem(row: AccountRow & { collateral_count: number }): GirviAccountListItem {
  const maturity = asBusinessDate(row.maturity_business_date);
  const status = asStatus(row.status);
  return {
    id: row.id,
    account_number: row.account_number,
    customer_id: row.customer_id,
    customer_display_name: row.customer_display_name,
    status,
    is_overdue: girviAccountIsOverdue({
      status,
      maturityBusinessDate: maturity,
      asOfBusinessDate: kolkataBusinessDate(),
    }),
    principal_inr: asDecimalString(row.principal_inr),
    principal_outstanding_inr: asDecimalString(row.principal_outstanding_inr),
    interest_outstanding_inr: asDecimalString(row.interest_outstanding_inr),
    start_business_date: asBusinessDate(row.start_business_date),
    maturity_business_date: maturity,
    collateral_count: row.collateral_count,
    activated_at: row.activated_at ? asIsoDateTime(row.activated_at) : null,
    created_at: asIsoDateTime(row.created_at),
  };
}

async function loadAccountDetail(
  client: PoolClient,
  organizationId: string,
  accountId: string,
): Promise<GirviAccount | null> {
  const accountResult = await client.query<AccountRow>(
    `
    SELECT
      ${ACCOUNT_COLUMNS}
    FROM app.girvi_accounts a
    JOIN app.customers c ON c.id = a.customer_id AND c.organization_id = a.organization_id
    WHERE a.organization_id = $1 AND a.id = $2
    `,
    [organizationId, accountId],
  );
  const account = accountResult.rows[0];
  if (!account) {
    return null;
  }

  const collateralResult = await client.query<CollateralRow>(
    `
    SELECT id, description, metal, purity, gross_weight_grams, net_metal_weight_grams,
           assessed_value_inr, packet_number, custody_location, status
    FROM app.girvi_collateral_items
    WHERE organization_id = $1 AND girvi_account_id = $2
    ORDER BY created_at ASC
    `,
    [organizationId, accountId],
  );

  const filesResult = await client.query<FileRow>(
    `
    SELECT id, collateral_item_id, object_key, checksum_sha256, purpose,
           uploaded_by_staff_user_id, created_at
    FROM app.girvi_collateral_files
    WHERE organization_id = $1 AND girvi_account_id = $2
    ORDER BY created_at ASC
    `,
    [organizationId, accountId],
  );

  const filesByItem = new Map<string, GirviCollateralFile[]>();
  for (const file of filesResult.rows) {
    const list = filesByItem.get(file.collateral_item_id) ?? [];
    list.push(mapFile(file));
    filesByItem.set(file.collateral_item_id, list);
  }

  const custodyResult = await client.query<CustodyRow>(
    `
    SELECT id, event_type, packet_number, custody_location, collateral_item_id,
           actor_staff_user_id, occurred_at, notes
    FROM app.girvi_custody_events
    WHERE organization_id = $1 AND girvi_account_id = $2
    ORDER BY occurred_at ASC
    `,
    [organizationId, accountId],
  );

  const financialResult = await client.query<FinancialRow>(
    `
    SELECT ${FINANCIAL_EVENT_COLUMNS}
    FROM app.girvi_financial_events
    WHERE organization_id = $1 AND girvi_account_id = $2
    ORDER BY effective_business_date ASC, posting_sequence ASC
    `,
    [organizationId, accountId],
  );

  const releaseResult = await client.query<ReleaseRow>(
    `
    SELECT id, girvi_account_id, settlement_event_id, packet_numbers_verified,
           staff_acknowledged_by, customer_acknowledged, recipient_name, waiver_reason, notes, created_at
    FROM app.girvi_release_events
    WHERE organization_id = $1 AND girvi_account_id = $2
    ORDER BY created_at ASC
    `,
    [organizationId, accountId],
  );

  const status = asStatus(account.status);
  const maturity = asBusinessDate(account.maturity_business_date);

  return {
    id: account.id,
    account_number: account.account_number,
    customer_id: account.customer_id,
    customer_display_name: account.customer_display_name,
    status,
    is_overdue: girviAccountIsOverdue({
      status,
      maturityBusinessDate: maturity,
      asOfBusinessDate: kolkataBusinessDate(),
    }),
    principal_inr: asDecimalString(account.principal_inr),
    principal_outstanding_inr: asDecimalString(account.principal_outstanding_inr),
    interest_outstanding_inr: asDecimalString(account.interest_outstanding_inr),
    start_business_date: asBusinessDate(account.start_business_date),
    maturity_business_date: maturity,
    terms_snapshot: asTermsSnapshot(account.terms_snapshot),
    calculation_policy_version: account.calculation_policy_version,
    activated_at: account.activated_at ? asIsoDateTime(account.activated_at) : null,
    activated_by_staff_user_id: account.activated_by_staff_user_id,
    settled_at: account.settled_at ? asIsoDateTime(account.settled_at) : null,
    settled_by_staff_user_id: account.settled_by_staff_user_id,
    released_at: account.released_at ? asIsoDateTime(account.released_at) : null,
    released_by_staff_user_id: account.released_by_staff_user_id,
    row_version: account.row_version,
    collateral: collateralResult.rows.map((row) => mapCollateral(row, filesByItem.get(row.id) ?? [])),
    custody_events: custodyResult.rows.map(mapCustody),
    financial_events: financialResult.rows.map(mapFinancial),
    release_events: releaseResult.rows.map(mapRelease),
    created_at: asIsoDateTime(account.created_at),
    updated_at: asIsoDateTime(account.updated_at),
  };
}

export function createGirviRepository(
  client: PoolClient,
  organizationId: string,
  branchId: string,
): GirviRepository {
  return {
    async customerExists(customerId) {
      const result = await client.query<{ id: string }>(
        `SELECT id FROM app.customers WHERE organization_id = $1 AND id = $2`,
        [organizationId, customerId],
      );
      return Boolean(result.rows[0]);
    },

    async findInCustodyPacketConflicts(packetNumbers, excludeAccountId) {
      if (packetNumbers.length === 0) {
        return [];
      }
      const result = await client.query<{ packet_number: string }>(
        `
        SELECT DISTINCT packet_number
        FROM app.girvi_collateral_items
        WHERE organization_id = $1
          AND status = 'in_custody'
          AND packet_number = ANY($2::text[])
          AND ($3::uuid IS NULL OR girvi_account_id <> $3::uuid)
        ORDER BY packet_number
        `,
        [organizationId, packetNumbers, excludeAccountId ?? null],
      );
      return result.rows.map((row) => row.packet_number);
    },

    async insertDraftAccount(input) {
      const result = await client.query<{ id: string }>(
        `
        INSERT INTO app.girvi_accounts (
          organization_id, branch_id, account_number, customer_id, status,
          principal_inr, start_business_date, maturity_business_date, terms_snapshot
        )
        VALUES ($1, $2, $3, $4, 'draft', $5, $6, $7, $8::jsonb)
        RETURNING id
        `,
        [
          organizationId,
          branchId,
          input.accountNumber,
          input.customerId,
          input.principalInr,
          input.startBusinessDate,
          input.maturityBusinessDate,
          JSON.stringify(input.termsSnapshot),
        ],
      );
      const id = result.rows[0]?.id;
      if (!id) {
        throw new Error("Failed to insert Girvi draft.");
      }
      return id;
    },

    async replaceCollateral(input) {
      await client.query(
        `DELETE FROM app.girvi_collateral_items WHERE organization_id = $1 AND girvi_account_id = $2`,
        [organizationId, input.accountId],
      );

      for (const item of input.items) {
        const inserted = await client.query<{ id: string }>(
          `
          INSERT INTO app.girvi_collateral_items (
            organization_id, girvi_account_id, description, metal, purity,
            gross_weight_grams, net_metal_weight_grams, assessed_value_inr,
            packet_number, custody_location, status
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'in_custody')
          RETURNING id
          `,
          [
            organizationId,
            input.accountId,
            item.description,
            item.metal ?? null,
            item.purity ?? null,
            item.gross_weight_grams ?? null,
            item.net_metal_weight_grams ?? null,
            item.assessed_value_inr ?? null,
            item.packet_number,
            item.custody_location,
          ],
        );
        const itemId = inserted.rows[0]?.id;
        if (!itemId) {
          throw new Error("Failed to insert collateral item.");
        }

        for (const file of item.files ?? []) {
          await client.query(
            `
            INSERT INTO app.girvi_collateral_files (
              organization_id, girvi_account_id, collateral_item_id,
              object_key, checksum_sha256, uploaded_by_staff_user_id, purpose
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            `,
            [
              organizationId,
              input.accountId,
              itemId,
              file.object_key,
              file.checksum_sha256,
              input.actorStaffUserId,
              file.purpose,
            ],
          );
        }
      }
    },

    async getAccount(accountId) {
      return loadAccountDetail(client, organizationId, accountId);
    },

    async listCollateralObjectKeys(accountId) {
      const result = await client.query<{ object_key: string }>(
        `
        SELECT object_key
        FROM app.girvi_collateral_files
        WHERE organization_id = $1 AND girvi_account_id = $2
        `,
        [organizationId, accountId],
      );
      return result.rows.map((row) => row.object_key);
    },

    async deleteDraftAccount(accountId, expectedRowVersion) {
      const result = await client.query(
        `
        DELETE FROM app.girvi_accounts
        WHERE organization_id = $1 AND id = $2 AND status = 'draft' AND row_version = $3
        `,
        [organizationId, accountId, expectedRowVersion],
      );
      return (result.rowCount ?? 0) > 0;
    },

    async listAccounts(filters) {
      const values: unknown[] = [organizationId];
      const where = ["a.organization_id = $1"];

      if (filters.status) {
        values.push(filters.status);
        where.push(`a.status = $${String(values.length)}`);
      }
      if (filters.customerId) {
        values.push(filters.customerId);
        where.push(`a.customer_id = $${String(values.length)}`);
      }
      if (filters.maturityFrom) {
        values.push(filters.maturityFrom);
        where.push(`a.maturity_business_date >= $${String(values.length)}`);
      }
      if (filters.maturityTo) {
        values.push(filters.maturityTo);
        where.push(`a.maturity_business_date <= $${String(values.length)}`);
      }
      if (filters.isOverdue === true) {
        values.push(kolkataBusinessDate());
        where.push(`a.status = 'active' AND a.maturity_business_date < $${String(values.length)}`);
      }
      if (filters.q) {
        values.push(`%${filters.q}%`);
        where.push(
          `(a.account_number ILIKE $${String(values.length)} OR c.display_name ILIKE $${String(values.length)})`,
        );
      }

      const sortColumn = SORT_COLUMNS[filters.sort];
      const direction = filters.direction === "asc" ? "ASC" : "DESC";
      const offset = (filters.page - 1) * filters.pageSize;

      const countResult = await client.query<{ total: number }>(
        `
        SELECT count(*)::int AS total
        FROM app.girvi_accounts a
        JOIN app.customers c ON c.id = a.customer_id AND c.organization_id = a.organization_id
        WHERE ${where.join(" AND ")}
        `,
        values,
      );

      values.push(filters.pageSize);
      values.push(offset);
      const listResult = await client.query<AccountRow & { collateral_count: number }>(
        `
        SELECT
          ${ACCOUNT_COLUMNS},
          (
            SELECT count(*)::int FROM app.girvi_collateral_items ci
            WHERE ci.organization_id = a.organization_id AND ci.girvi_account_id = a.id
          ) AS collateral_count
        FROM app.girvi_accounts a
        JOIN app.customers c ON c.id = a.customer_id AND c.organization_id = a.organization_id
        WHERE ${where.join(" AND ")}
        ORDER BY ${sortColumn} ${direction}, a.id ${direction}
        LIMIT $${String(values.length - 1)} OFFSET $${String(values.length)}
        `,
        values,
      );

      return {
        items: listResult.rows.map(mapListItem),
        total: countResult.rows[0]?.total ?? 0,
      };
    },

    async updateDraftAccount(input) {
      const sets: string[] = ["updated_at = timezone('utc', now())", "row_version = row_version + 1"];
      const values: unknown[] = [organizationId, input.accountId, input.expectedRowVersion];

      if (input.principalInr !== undefined) {
        values.push(input.principalInr);
        sets.push(`principal_inr = $${String(values.length)}`);
      }
      if (input.startBusinessDate !== undefined) {
        values.push(input.startBusinessDate);
        sets.push(`start_business_date = $${String(values.length)}`);
      }
      if (input.maturityBusinessDate !== undefined) {
        values.push(input.maturityBusinessDate);
        sets.push(`maturity_business_date = $${String(values.length)}`);
      }
      if (input.termsSnapshot !== undefined) {
        values.push(JSON.stringify(input.termsSnapshot));
        sets.push(`terms_snapshot = $${String(values.length)}::jsonb`);
      }

      const result = await client.query(
        `
        UPDATE app.girvi_accounts
        SET ${sets.join(", ")}
        WHERE organization_id = $1 AND id = $2 AND status = 'draft' AND row_version = $3
        `,
        values,
      );
      return (result.rowCount ?? 0) > 0;
    },

    async lockDraftForActivate(accountId) {
      const locked = await client.query<{
        id: string;
        status: string;
        customer_id: string;
        principal_inr: string | number;
        start_business_date: Date | string;
        maturity_business_date: Date | string;
        terms_snapshot: unknown;
        row_version: number;
      }>(
        `
        SELECT id, status, customer_id, principal_inr, start_business_date, maturity_business_date,
               terms_snapshot, row_version
        FROM app.girvi_accounts
        WHERE organization_id = $1 AND id = $2
        FOR UPDATE
        `,
        [organizationId, accountId],
      );
      const row = locked.rows[0];
      if (!row) {
        return null;
      }

      const packets = await client.query<{ packet_number: string }>(
        `
        SELECT packet_number
        FROM app.girvi_collateral_items
        WHERE organization_id = $1 AND girvi_account_id = $2
        ORDER BY packet_number ASC
        `,
        [organizationId, accountId],
      );

      const missingPhotos = await client.query<{ packet_number: string }>(
        `
        SELECT ci.packet_number
        FROM app.girvi_collateral_items ci
        LEFT JOIN app.girvi_collateral_files cf
          ON cf.organization_id = ci.organization_id
         AND cf.collateral_item_id = ci.id
        WHERE ci.organization_id = $1 AND ci.girvi_account_id = $2
        GROUP BY ci.id, ci.packet_number
        HAVING count(cf.id) = 0
        ORDER BY ci.packet_number ASC
        `,
        [organizationId, accountId],
      );

      return {
        id: row.id,
        status: row.status,
        customerId: row.customer_id,
        principalInr: asDecimalString(row.principal_inr),
        startBusinessDate: asBusinessDate(row.start_business_date),
        maturityBusinessDate: asBusinessDate(row.maturity_business_date),
        interestRatePercentPer30Days: girviRateFromTermsSnapshot(row.terms_snapshot),
        rowVersion: row.row_version,
        packetNumbers: packets.rows.map((p) => p.packet_number),
        packetsMissingPhotos: missingPhotos.rows.map((p) => p.packet_number),
      };
    },

    async allocateGirviAccountNumber() {
      const result = await client.query<{
        prefix: string;
        padding: number;
        next_value: number;
      }>(
        `
        SELECT prefix, padding, next_value
        FROM app.document_sequences
        WHERE organization_id = $1 AND branch_id = $2 AND document_type = 'girvi_account'
        FOR UPDATE
        `,
        [organizationId, branchId],
      );
      const row = result.rows[0];
      if (!row) {
        throw new Error("Girvi account document sequence is missing.");
      }
      const accountNumber = `${row.prefix}${String(row.next_value).padStart(row.padding, "0")}`;
      await client.query(
        `
        UPDATE app.document_sequences
        SET next_value = next_value + 1, updated_at = timezone('utc', now())
        WHERE organization_id = $1 AND branch_id = $2 AND document_type = 'girvi_account'
        `,
        [organizationId, branchId],
      );
      return accountNumber;
    },

    async activateAccount(input) {
      const result = await client.query(
        `
        UPDATE app.girvi_accounts
        SET
          status = 'active',
          account_number = $4,
          terms_snapshot = $5::jsonb,
          calculation_policy_version = $6,
          principal_outstanding_inr = principal_inr,
          interest_outstanding_inr = 0,
          activated_at = timezone('utc', now()),
          activated_by_staff_user_id = $7,
          row_version = row_version + 1,
          updated_at = timezone('utc', now())
        WHERE organization_id = $1 AND id = $2 AND status = 'draft' AND row_version = $3
        `,
        [
          organizationId,
          input.accountId,
          input.expectedRowVersion,
          input.accountNumber,
          JSON.stringify(input.termsSnapshot),
          input.calculationPolicyVersion,
          input.activatedByStaffUserId,
        ],
      );
      return (result.rowCount ?? 0) > 0;
    },

    async insertCustodyReceivedEvents(input) {
      await client.query(
        `
        INSERT INTO app.girvi_custody_events (
          organization_id, girvi_account_id, collateral_item_id, event_type,
          packet_number, custody_location, actor_staff_user_id, notes
        )
        SELECT
          organization_id, girvi_account_id, id, 'received',
          packet_number, custody_location, $3, 'Received into packet at activation'
        FROM app.girvi_collateral_items
        WHERE organization_id = $1 AND girvi_account_id = $2
        `,
        [organizationId, input.accountId, input.actorStaffUserId],
      );
    },

    async insertDisbursement(input) {
      await client.query(
        `
        INSERT INTO app.girvi_financial_events (
          organization_id, girvi_account_id, event_type, effective_business_date,
          principal_delta_inr, interest_delta_inr, amount_inr, actor_staff_user_id, event_key
        )
        VALUES ($1, $2, 'disbursement', $3, $4, 0, $4, $5, $6)
        `,
        [
          organizationId,
          input.accountId,
          input.effectiveBusinessDate,
          input.principalInr,
          input.actorStaffUserId,
          input.eventKey,
        ],
      );
    },

    async writeAudit(event) {
      await client.query(
        `
        INSERT INTO app.audit_events (
          organization_id, actor_staff_user_id, action, entity_type, entity_id, payload
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb)
        `,
        [
          organizationId,
          event.actorStaffUserId,
          event.action,
          event.entityType,
          event.entityId,
          JSON.stringify(event.payload),
        ],
      );
    },

    async findIdempotency(input) {
      const result = await client.query<{
        request_hash: string;
        response_status: number | null;
        response_body: unknown;
      }>(
        `
        SELECT request_hash, response_status, response_body
        FROM app.idempotency_keys
        WHERE organization_id = $1 AND operation = $2 AND key = $3
        `,
        [organizationId, input.operation, input.key],
      );
      const row = result.rows[0];
      if (!row || row.response_status === null || row.response_body === null || row.response_body === undefined) {
        return null;
      }
      return {
        requestHash: row.request_hash,
        responseStatus: row.response_status,
        responseBody: row.response_body,
      };
    },

    async insertIdempotency(input) {
      await client.query(
        `
        INSERT INTO app.idempotency_keys (
          organization_id, key, operation, request_hash, response_status, response_body
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb)
        `,
        [
          organizationId,
          input.key,
          input.operation,
          input.requestHash,
          input.responseStatus,
          JSON.stringify(input.responseBody),
        ],
      );
    },

    async insertOutbox(input) {
      await client.query(
        `
        INSERT INTO app.outbox_events (organization_id, event_key, event_type, payload)
        VALUES ($1, $2, $3, $4::jsonb)
        `,
        [organizationId, input.eventKey, input.eventType, JSON.stringify(input.payload)],
      );
    },

    async articleExistsWithBarcode(barcode) {
      const result = await client.query<{ id: string }>(
        `SELECT id FROM app.articles WHERE organization_id = $1 AND barcode = $2`,
        [organizationId, barcode],
      );
      return Boolean(result.rows[0]);
    },

    async findApprovedCalculationPolicy() {
      return findApprovedGirviPolicy(client, organizationId);
    },

    async lockAccountForPosting(accountId) {
      const result = await client.query<{
        id: string;
        account_number: string;
        status: string;
        customer_id: string;
        principal_inr: string | number;
        start_business_date: Date | string;
        maturity_business_date: Date | string;
        terms_snapshot: unknown;
        calculation_policy_version: string | null;
        row_version: number;
      }>(
        `
        SELECT id, account_number, status, customer_id, principal_inr, start_business_date,
               maturity_business_date, terms_snapshot, calculation_policy_version, row_version
        FROM app.girvi_accounts
        WHERE organization_id = $1 AND id = $2
        FOR UPDATE
        `,
        [organizationId, accountId],
      );
      const row = result.rows[0];
      if (!row) {
        return null;
      }
      return {
        id: row.id,
        accountNumber: row.account_number,
        status: row.status,
        customerId: row.customer_id,
        principalInr: asDecimalString(row.principal_inr),
        startBusinessDate: asBusinessDate(row.start_business_date),
        maturityBusinessDate: asBusinessDate(row.maturity_business_date),
        termsSnapshot:
          row.terms_snapshot && typeof row.terms_snapshot === "object"
            ? (row.terms_snapshot as Record<string, unknown>)
            : {},
        calculationPolicyVersion: row.calculation_policy_version,
        rowVersion: row.row_version,
      };
    },

    async loadLedgerEvents(accountId) {
      const result = await client.query<FinancialRow>(
        `
        SELECT ${FINANCIAL_EVENT_COLUMNS}
        FROM app.girvi_financial_events
        WHERE organization_id = $1 AND girvi_account_id = $2
        ORDER BY effective_business_date ASC, posting_sequence ASC
        `,
        [organizationId, accountId],
      );
      return result.rows.map(mapLedgerEvent);
    },

    async nextPostingSequence(accountId, businessDate) {
      const result = await client.query<{ next_sequence: number }>(
        `
        SELECT COALESCE(max(posting_sequence), 0) + 1 AS next_sequence
        FROM app.girvi_financial_events
        WHERE organization_id = $1 AND girvi_account_id = $2 AND effective_business_date = $3
        `,
        [organizationId, accountId, businessDate],
      );
      return result.rows[0]?.next_sequence ?? 1;
    },

    async latestLedgerBusinessDate(accountId) {
      const result = await client.query<{ latest: Date | string | null }>(
        `
        SELECT max(effective_business_date) AS latest
        FROM app.girvi_financial_events
        WHERE organization_id = $1 AND girvi_account_id = $2
        `,
        [organizationId, accountId],
      );
      const latest = result.rows[0]?.latest ?? null;
      return latest === null ? null : asBusinessDate(latest);
    },

    async insertFinancialEvent(input) {
      const result = await client.query<{ id: string }>(
        `
        INSERT INTO app.girvi_financial_events (
          organization_id, girvi_account_id, event_type, effective_business_date,
          principal_delta_inr, interest_delta_inr, amount_inr, method, notes,
          posting_sequence, actor_staff_user_id, event_key
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id
        `,
        [
          organizationId,
          input.accountId,
          input.eventType,
          input.effectiveBusinessDate,
          input.principalDeltaInr,
          input.interestDeltaInr,
          input.amountInr,
          input.method ?? null,
          input.notes ?? null,
          input.postingSequence,
          input.actorStaffUserId,
          input.eventKey,
        ],
      );
      const id = result.rows[0]?.id;
      if (!id) {
        throw new Error("Failed to insert the Girvi financial event.");
      }
      return id;
    },

    async updateBalanceProjections(input) {
      await client.query(
        `
        UPDATE app.girvi_accounts
        SET principal_outstanding_inr = $3,
            interest_outstanding_inr = $4,
            row_version = row_version + 1,
            updated_at = timezone('utc', now())
        WHERE organization_id = $1 AND id = $2
        `,
        [organizationId, input.accountId, input.principalOutstandingInr, input.interestOutstandingInr],
      );
    },

    async markAccountSettled(input) {
      await client.query(
        `
        UPDATE app.girvi_accounts
        SET status = 'settled',
            settled_at = timezone('utc', now()),
            settled_by_staff_user_id = $3,
            row_version = row_version + 1,
            updated_at = timezone('utc', now())
        WHERE organization_id = $1 AND id = $2 AND status = 'active'
        `,
        [organizationId, input.accountId, input.actorStaffUserId],
      );
    },

    async findLatestSettlementEventId(accountId) {
      const result = await client.query<{ id: string }>(
        `
        SELECT id
        FROM app.girvi_financial_events
        WHERE organization_id = $1 AND girvi_account_id = $2 AND event_type = 'settlement'
        ORDER BY effective_business_date DESC, posting_sequence DESC
        LIMIT 1
        `,
        [organizationId, accountId],
      );
      return result.rows[0]?.id ?? null;
    },

    async listInCustodyPacketNumbers(accountId) {
      const result = await client.query<{ packet_number: string }>(
        `
        SELECT packet_number
        FROM app.girvi_collateral_items
        WHERE organization_id = $1 AND girvi_account_id = $2 AND status = 'in_custody'
        ORDER BY packet_number ASC
        `,
        [organizationId, accountId],
      );
      return result.rows.map((row) => row.packet_number);
    },

    async findReleaseEvent(accountId) {
      const result = await client.query<ReleaseRow>(
        `
        SELECT id, girvi_account_id, settlement_event_id, packet_numbers_verified,
               staff_acknowledged_by, customer_acknowledged, recipient_name, waiver_reason, notes, created_at
        FROM app.girvi_release_events
        WHERE organization_id = $1 AND girvi_account_id = $2
        LIMIT 1
        `,
        [organizationId, accountId],
      );
      const row = result.rows[0];
      return row ? mapRelease(row) : null;
    },

    async insertReleaseEvent(input) {
      const result = await client.query<ReleaseRow>(
        `
        INSERT INTO app.girvi_release_events (
          organization_id, girvi_account_id, settlement_event_id, packet_numbers_verified,
          staff_acknowledged_by, customer_acknowledged, recipient_name, waiver_reason, notes
        )
        VALUES ($1, $2, $3, $4::text[], $5, $6, $7, $8, $9)
        RETURNING id, girvi_account_id, settlement_event_id, packet_numbers_verified,
                  staff_acknowledged_by, customer_acknowledged, recipient_name, waiver_reason, notes, created_at
        `,
        [
          organizationId,
          input.accountId,
          input.settlementEventId,
          input.packetNumbersVerified,
          input.staffAcknowledgedBy,
          input.customerAcknowledged,
          input.recipientName,
          input.waiverReason ?? null,
          input.notes ?? null,
        ],
      );
      const row = result.rows[0];
      if (!row) {
        throw new Error("Failed to insert the Girvi release event.");
      }
      return mapRelease(row);
    },

    async releaseCollateral(input) {
      // Custody events first, while the items still carry their in-custody location.
      await client.query(
        `
        INSERT INTO app.girvi_custody_events (
          organization_id, girvi_account_id, collateral_item_id, event_type,
          packet_number, custody_location, actor_staff_user_id, notes
        )
        SELECT organization_id, girvi_account_id, id, 'released',
               packet_number, custody_location, $3, $4
        FROM app.girvi_collateral_items
        WHERE organization_id = $1 AND girvi_account_id = $2 AND status = 'in_custody'
        `,
        [
          organizationId,
          input.accountId,
          input.actorStaffUserId,
          input.notes ?? `Released to ${input.recipientName}`,
        ],
      );

      // Released collateral leaves custody. It never becomes a saleable article.
      await client.query(
        `
        UPDATE app.girvi_collateral_items
        SET status = 'released', updated_at = timezone('utc', now())
        WHERE organization_id = $1 AND girvi_account_id = $2 AND status = 'in_custody'
        `,
        [organizationId, input.accountId],
      );

      await client.query(
        `
        UPDATE app.girvi_accounts
        SET status = 'released',
            released_at = timezone('utc', now()),
            released_by_staff_user_id = $3,
            row_version = row_version + 1,
            updated_at = timezone('utc', now())
        WHERE organization_id = $1 AND id = $2
        `,
        [organizationId, input.accountId, input.actorStaffUserId],
      );
    },

    async lockCollateralItemForMove(accountId, collateralItemId) {
      const result = await client.query<{
        account_status: string;
        item_id: string;
        packet_number: string;
        custody_location: string;
        item_status: string;
      }>(
        `
        SELECT
          a.status AS account_status,
          ci.id AS item_id,
          ci.packet_number,
          ci.custody_location,
          ci.status AS item_status
        FROM app.girvi_collateral_items ci
        JOIN app.girvi_accounts a
          ON a.id = ci.girvi_account_id AND a.organization_id = ci.organization_id
        WHERE ci.organization_id = $1
          AND ci.girvi_account_id = $2
          AND ci.id = $3
        FOR UPDATE OF ci, a
        `,
        [organizationId, accountId, collateralItemId],
      );
      const row = result.rows[0];
      if (!row) {
        return null;
      }
      return {
        accountStatus: row.account_status,
        itemId: row.item_id,
        packetNumber: row.packet_number,
        custodyLocation: row.custody_location,
        itemStatus: row.item_status,
      };
    },

    async moveCollateralLocation(input) {
      await client.query(
        `
        UPDATE app.girvi_collateral_items
        SET custody_location = $4, updated_at = timezone('utc', now())
        WHERE organization_id = $1 AND girvi_account_id = $2 AND id = $3 AND status = 'in_custody'
        `,
        [organizationId, input.accountId, input.collateralItemId, input.custodyLocation],
      );

      const inserted = await client.query<CustodyRow>(
        `
        INSERT INTO app.girvi_custody_events (
          organization_id, girvi_account_id, collateral_item_id, event_type,
          packet_number, custody_location, actor_staff_user_id, notes
        )
        SELECT
          organization_id, girvi_account_id, id, 'location_changed',
          packet_number, custody_location, $4, $5
        FROM app.girvi_collateral_items
        WHERE organization_id = $1 AND girvi_account_id = $2 AND id = $3
        RETURNING id, event_type, packet_number, custody_location, collateral_item_id,
                  actor_staff_user_id, occurred_at, notes
        `,
        [
          organizationId,
          input.accountId,
          input.collateralItemId,
          input.actorStaffUserId,
          input.notes ?? null,
        ],
      );
      const row = inserted.rows[0];
      if (!row) {
        throw new Error("Failed to insert location_changed custody event.");
      }
      return mapCustody(row);
    },

    async lockDraftCollateralItem(accountId, collateralItemId) {
      const result = await client.query<{ account_status: string; item_id: string }>(
        `
        SELECT a.status AS account_status, ci.id AS item_id
        FROM app.girvi_collateral_items ci
        JOIN app.girvi_accounts a
          ON a.id = ci.girvi_account_id AND a.organization_id = ci.organization_id
        WHERE ci.organization_id = $1
          AND ci.girvi_account_id = $2
          AND ci.id = $3
        FOR UPDATE OF ci, a
        `,
        [organizationId, accountId, collateralItemId],
      );
      const row = result.rows[0];
      if (!row) {
        return null;
      }
      return { accountStatus: row.account_status, itemId: row.item_id };
    },

    async insertCollateralFile(input) {
      const result = await client.query<FileRow>(
        `
        INSERT INTO app.girvi_collateral_files (
          organization_id, girvi_account_id, collateral_item_id,
          object_key, checksum_sha256, uploaded_by_staff_user_id, purpose
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, collateral_item_id, object_key, checksum_sha256, purpose,
                  uploaded_by_staff_user_id, created_at
        `,
        [
          organizationId,
          input.accountId,
          input.collateralItemId,
          input.objectKey,
          input.checksumSha256,
          input.uploadedByStaffUserId,
          input.purpose,
        ],
      );
      const row = result.rows[0];
      if (!row) {
        throw new Error("Failed to insert collateral file metadata.");
      }
      return mapFile(row);
    },

    async getCollateralFile(accountId, collateralItemId, fileId) {
      const result = await client.query<FileRow>(
        `
        SELECT id, collateral_item_id, object_key, checksum_sha256, purpose,
               uploaded_by_staff_user_id, created_at
        FROM app.girvi_collateral_files
        WHERE organization_id = $1
          AND girvi_account_id = $2
          AND collateral_item_id = $3
          AND id = $4
        `,
        [organizationId, accountId, collateralItemId, fileId],
      );
      const row = result.rows[0];
      return row ? mapFile(row) : null;
    },
  };
}
