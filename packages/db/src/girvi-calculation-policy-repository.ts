import type { PoolClient } from "pg";

import type { GirviCalculationPolicy, GirviCalculationPolicyStatus } from "@aabhushan/domain";
import { isDecimalRoundingMode, isGirviCalculationPolicyStatus } from "@aabhushan/domain";

import { asIsoDateTime } from "./pg-values";

export type GirviCalculationPolicyRecord = GirviCalculationPolicy & {
  id: string;
  organizationId: string;
  approvedAt: string | null;
  approvedByStaffUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type GirviPolicyRow = {
  id: string;
  organization_id: string;
  version: string;
  status: string;
  rate_period: string | null;
  interest_method: string | null;
  day_count_convention: string | null;
  minimum_period: string | null;
  grace_period: string | null;
  extra_charges: string | null;
  allocation_order: string | null;
  principal_reduction_rule: string | null;
  rounding_mode: string | null;
  rounding_scale: number | null;
  backdating_policy: string | null;
  approved_at: Date | string | null;
  approved_by_staff_user_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

/**
 * An unreadable rounding mode is left as null rather than guessed, so
 * `girviPolicyUnsupportedReason` blocks the policy instead of approximating it.
 */
export function mapGirviPolicy(row: GirviPolicyRow): GirviCalculationPolicyRecord {
  if (!isGirviCalculationPolicyStatus(row.status)) {
    throw new Error(`Invalid Girvi calculation policy status: ${row.status}`);
  }
  const status: GirviCalculationPolicyStatus = row.status;
  const roundingMode =
    row.rounding_mode !== null && isDecimalRoundingMode(row.rounding_mode) ? row.rounding_mode : null;

  return {
    id: row.id,
    organizationId: row.organization_id,
    version: row.version,
    status,
    ratePeriod: row.rate_period,
    interestMethod: row.interest_method,
    dayCountConvention: row.day_count_convention,
    minimumPeriod: row.minimum_period,
    gracePeriod: row.grace_period,
    extraCharges: row.extra_charges,
    allocationOrder: row.allocation_order,
    principalReductionRule: row.principal_reduction_rule,
    roundingMode,
    roundingScale: row.rounding_scale,
    backdatingPolicy: row.backdating_policy,
    approvedAt: row.approved_at ? asIsoDateTime(row.approved_at) : null,
    approvedByStaffUserId: row.approved_by_staff_user_id,
    createdAt: asIsoDateTime(row.created_at),
    updatedAt: asIsoDateTime(row.updated_at),
  };
}

export async function findGirviPolicyByVersion(
  client: PoolClient,
  organizationId: string,
  version: string,
): Promise<GirviCalculationPolicyRecord | null> {
  const result = await client.query<GirviPolicyRow>(
    `
    SELECT *
    FROM app.girvi_calculation_policies
    WHERE organization_id = $1 AND version = $2
    LIMIT 1
    `,
    [organizationId, version],
  );
  const row = result.rows[0];
  return row ? mapGirviPolicy(row) : null;
}

export async function findApprovedGirviPolicy(
  client: PoolClient,
  organizationId: string,
): Promise<GirviCalculationPolicyRecord | null> {
  const result = await client.query<GirviPolicyRow>(
    `
    SELECT *
    FROM app.girvi_calculation_policies
    WHERE organization_id = $1 AND status = 'approved'
    ORDER BY approved_at DESC NULLS LAST
    LIMIT 1
    `,
    [organizationId],
  );
  const row = result.rows[0];
  return row ? mapGirviPolicy(row) : null;
}

export function createGirviCalculationPolicyRepository(client: PoolClient, organizationId: string) {
  return {
    async findByVersion(version: string): Promise<GirviCalculationPolicyRecord | null> {
      return findGirviPolicyByVersion(client, organizationId, version);
    },

    async findApproved(): Promise<GirviCalculationPolicyRecord | null> {
      return findApprovedGirviPolicy(client, organizationId);
    },

    /** Idempotent upsert of the owner-approved method families for one version. */
    async upsertApproved(input: {
      version: string;
      ratePeriod: string;
      interestMethod: string;
      dayCountConvention: string;
      minimumPeriod: string;
      gracePeriod: string;
      extraCharges: string;
      allocationOrder: string;
      principalReductionRule: string;
      roundingMode: string;
      roundingScale: number;
      backdatingPolicy: string;
      approvedByStaffUserId: string;
    }): Promise<GirviCalculationPolicyRecord> {
      const result = await client.query<GirviPolicyRow>(
        `
        INSERT INTO app.girvi_calculation_policies (
          organization_id, version, status, rate_period, interest_method, day_count_convention,
          minimum_period, grace_period, extra_charges, allocation_order, principal_reduction_rule,
          rounding_mode, rounding_scale, backdating_policy, approved_at, approved_by_staff_user_id
        )
        VALUES (
          $1, $2, 'approved', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
          timezone('utc', now()), $14
        )
        ON CONFLICT (organization_id, version) DO UPDATE
        SET
          status = 'approved',
          rate_period = EXCLUDED.rate_period,
          interest_method = EXCLUDED.interest_method,
          day_count_convention = EXCLUDED.day_count_convention,
          minimum_period = EXCLUDED.minimum_period,
          grace_period = EXCLUDED.grace_period,
          extra_charges = EXCLUDED.extra_charges,
          allocation_order = EXCLUDED.allocation_order,
          principal_reduction_rule = EXCLUDED.principal_reduction_rule,
          rounding_mode = EXCLUDED.rounding_mode,
          rounding_scale = EXCLUDED.rounding_scale,
          backdating_policy = EXCLUDED.backdating_policy,
          approved_at = COALESCE(app.girvi_calculation_policies.approved_at, EXCLUDED.approved_at),
          approved_by_staff_user_id = COALESCE(
            app.girvi_calculation_policies.approved_by_staff_user_id,
            EXCLUDED.approved_by_staff_user_id
          ),
          updated_at = timezone('utc', now())
        RETURNING *
        `,
        [
          organizationId,
          input.version,
          input.ratePeriod,
          input.interestMethod,
          input.dayCountConvention,
          input.minimumPeriod,
          input.gracePeriod,
          input.extraCharges,
          input.allocationOrder,
          input.principalReductionRule,
          input.roundingMode,
          input.roundingScale,
          input.backdatingPolicy,
          input.approvedByStaffUserId,
        ],
      );
      const row = result.rows[0];
      if (!row) {
        throw new Error("Failed to upsert the Girvi calculation policy.");
      }
      return mapGirviPolicy(row);
    },
  };
}
