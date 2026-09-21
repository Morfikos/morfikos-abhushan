import { Pool } from "pg";

import { GIRVI_V1_POLICY_METHODS } from "@aabhushan/domain";

import { createGirviCalculationPolicyRepository } from "../src/girvi-calculation-policy-repository";

/**
 * Seed the owner-approved girvi.v1 calculation policy for the single shop org.
 * Idempotent. Usage: pnpm --filter @aabhushan/db seed:girvi-calculation-policy
 *
 * Until this runs, every Girvi payoff API fails closed with
 * CALCULATION_RULE_UNSUPPORTED instead of guessing interest.
 */
const ORGANIZATION_ID = "11111111-1111-4111-8111-111111111111";

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE app_api");
    await client.query("SELECT set_config('app.organization_id', $1, true)", [ORGANIZATION_ID]);

    const staff = await client.query<{ id: string; email: string }>(
      `
      SELECT su.id, su.email
      FROM app.staff_users su
      JOIN app.staff_memberships sm ON sm.staff_user_id = su.id
      WHERE sm.organization_id = $1 AND sm.status = 'active' AND sm.role IN ('owner', 'admin')
      ORDER BY su.created_at ASC
      LIMIT 1
      `,
      [ORGANIZATION_ID],
    );
    const staffRow = staff.rows[0];
    if (!staffRow) {
      throw new Error("An active owner or admin membership is required to approve the Girvi policy.");
    }

    const repo = createGirviCalculationPolicyRepository(client, ORGANIZATION_ID);
    const policy = await repo.upsertApproved({
      version: GIRVI_V1_POLICY_METHODS.version,
      ratePeriod: GIRVI_V1_POLICY_METHODS.ratePeriod,
      interestMethod: GIRVI_V1_POLICY_METHODS.interestMethod,
      dayCountConvention: GIRVI_V1_POLICY_METHODS.dayCountConvention,
      minimumPeriod: GIRVI_V1_POLICY_METHODS.minimumPeriod,
      gracePeriod: GIRVI_V1_POLICY_METHODS.gracePeriod,
      extraCharges: GIRVI_V1_POLICY_METHODS.extraCharges,
      allocationOrder: GIRVI_V1_POLICY_METHODS.allocationOrder,
      principalReductionRule: GIRVI_V1_POLICY_METHODS.principalReductionRule,
      roundingMode: GIRVI_V1_POLICY_METHODS.roundingMode,
      roundingScale: GIRVI_V1_POLICY_METHODS.roundingScale,
      backdatingPolicy: GIRVI_V1_POLICY_METHODS.backdatingPolicy,
      approvedByStaffUserId: staffRow.id,
    });

    await client.query("COMMIT");
    console.log(
      JSON.stringify(
        {
          organization_id: ORGANIZATION_ID,
          version: policy.version,
          status: policy.status,
          approved_by: staffRow.email,
          rate_period: policy.ratePeriod,
          interest_method: policy.interestMethod,
          day_count_convention: policy.dayCountConvention,
          allocation_order: policy.allocationOrder,
          principal_reduction_rule: policy.principalReductionRule,
          rounding_mode: policy.roundingMode,
          rounding_scale: policy.roundingScale,
          backdating_policy: policy.backdatingPolicy,
          note: "Accounts activated before this approval keep unsupported terms and are not converted.",
        },
        null,
        2,
      ),
    );
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
