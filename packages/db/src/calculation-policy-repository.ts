import type { PoolClient } from "pg";

import type { CalculationPolicy, CalculationPolicyStatus, DecimalRoundingMode } from "@aabhushan/domain";
import { isCalculationPolicyStatus, isDecimalRoundingMode } from "@aabhushan/domain";

import { asIsoDateTime } from "./pg-values";

export type CalculationPolicyRecord = CalculationPolicy & {
  id: string;
  organizationId: string;
  approvedAt: string | null;
  approvedByStaffUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

type PolicyRow = {
  id: string;
  organization_id: string;
  version: string;
  status: string;
  currency: string;
  weight_unit: string;
  rate_unit: string;
  making_charge_method: string | null;
  wastage_method: string | null;
  discount_method: string | null;
  tax_method: string | null;
  rounding_mode: string | null;
  rounding_scale: number | null;
  approved_at: Date | string | null;
  approved_by_staff_user_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

function mapPolicy(row: PolicyRow): CalculationPolicyRecord {
  if (!isCalculationPolicyStatus(row.status)) {
    throw new Error(`Invalid calculation policy status: ${row.status}`);
  }
  if (row.currency !== "INR") {
    throw new Error(`Unsupported calculation currency: ${row.currency}`);
  }
  if (row.weight_unit !== "g" || row.rate_unit !== "per_g") {
    throw new Error("Unsupported calculation units.");
  }
  let roundingMode: DecimalRoundingMode | null = null;
  if (row.rounding_mode !== null) {
    if (!isDecimalRoundingMode(row.rounding_mode)) {
      throw new Error(`Unsupported rounding mode: ${row.rounding_mode}`);
    }
    roundingMode = row.rounding_mode;
  }

  return {
    id: row.id,
    organizationId: row.organization_id,
    version: row.version,
    status: row.status,
    currency: "INR",
    weightUnit: "g",
    rateUnit: "per_g",
    makingChargeMethod: row.making_charge_method,
    wastageMethod: row.wastage_method,
    discountMethod: row.discount_method,
    taxMethod: row.tax_method,
    roundingMode,
    roundingScale: row.rounding_scale,
    approvedAt: row.approved_at ? asIsoDateTime(row.approved_at) : null,
    approvedByStaffUserId: row.approved_by_staff_user_id,
    createdAt: asIsoDateTime(row.created_at),
    updatedAt: asIsoDateTime(row.updated_at),
  };
}

export function createCalculationPolicyRepository(client: PoolClient, organizationId: string) {
  return {
    async findByVersion(version: string): Promise<CalculationPolicyRecord | null> {
      const result = await client.query<PolicyRow>(
        `
        SELECT *
        FROM app.calculation_policies
        WHERE organization_id = $1 AND version = $2
        LIMIT 1
        `,
        [organizationId, version],
      );
      const row = result.rows[0];
      return row ? mapPolicy(row) : null;
    },

    async findApprovedByVersion(version: string): Promise<CalculationPolicyRecord | null> {
      const result = await client.query<PolicyRow>(
        `
        SELECT *
        FROM app.calculation_policies
        WHERE organization_id = $1 AND version = $2 AND status = 'approved'
        LIMIT 1
        `,
        [organizationId, version],
      );
      const row = result.rows[0];
      return row ? mapPolicy(row) : null;
    },

    async findLatestApproved(): Promise<CalculationPolicyRecord | null> {
      const result = await client.query<PolicyRow>(
        `
        SELECT *
        FROM app.calculation_policies
        WHERE organization_id = $1 AND status = 'approved'
        ORDER BY approved_at DESC NULLS LAST, updated_at DESC
        LIMIT 1
        `,
        [organizationId],
      );
      const row = result.rows[0];
      return row ? mapPolicy(row) : null;
    },

    async insertDraft(input: {
      version: string;
      status?: CalculationPolicyStatus;
    }): Promise<CalculationPolicyRecord> {
      const result = await client.query<PolicyRow>(
        `
        INSERT INTO app.calculation_policies (
          organization_id, version, status
        )
        VALUES ($1, $2, $3)
        RETURNING *
        `,
        [organizationId, input.version, input.status ?? "draft"],
      );
      const row = result.rows[0];
      if (!row) {
        throw new Error("Failed to insert calculation policy.");
      }
      return mapPolicy(row);
    },

    /**
     * Idempotent upsert of the owner-approved invoice.v1 policy methods.
     */
    async upsertApprovedInvoiceV1(input: {
      version: string;
      makingChargeMethod: string;
      wastageMethod: string;
      discountMethod: string;
      taxMethod: string;
      roundingMode: string;
      roundingScale: number;
      approvedByStaffUserId: string;
    }): Promise<CalculationPolicyRecord> {
      const result = await client.query<PolicyRow>(
        `
        INSERT INTO app.calculation_policies (
          organization_id, version, status,
          making_charge_method, wastage_method, discount_method, tax_method,
          rounding_mode, rounding_scale,
          approved_at, approved_by_staff_user_id
        )
        VALUES (
          $1, $2, 'approved',
          $3, $4, $5, $6,
          $7, $8,
          timezone('utc', now()), $9
        )
        ON CONFLICT (organization_id, version) DO UPDATE SET
          status = 'approved',
          making_charge_method = EXCLUDED.making_charge_method,
          wastage_method = EXCLUDED.wastage_method,
          discount_method = EXCLUDED.discount_method,
          tax_method = EXCLUDED.tax_method,
          rounding_mode = EXCLUDED.rounding_mode,
          rounding_scale = EXCLUDED.rounding_scale,
          approved_at = COALESCE(app.calculation_policies.approved_at, timezone('utc', now())),
          approved_by_staff_user_id = COALESCE(
            app.calculation_policies.approved_by_staff_user_id,
            EXCLUDED.approved_by_staff_user_id
          ),
          updated_at = timezone('utc', now())
        RETURNING *
        `,
        [
          organizationId,
          input.version,
          input.makingChargeMethod,
          input.wastageMethod,
          input.discountMethod,
          input.taxMethod,
          input.roundingMode,
          input.roundingScale,
          input.approvedByStaffUserId,
        ],
      );
      const row = result.rows[0];
      if (!row) {
        throw new Error("Failed to upsert approved calculation policy.");
      }
      return mapPolicy(row);
    },
  };
}

export type CalculationPolicyRepository = ReturnType<typeof createCalculationPolicyRepository>;
