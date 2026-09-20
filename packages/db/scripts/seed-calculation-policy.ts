import { Pool } from "pg";

import { INVOICE_V1_POLICY_METHODS } from "@aabhushan/domain";

import { createCalculationPolicyRepository } from "../src/calculation-policy-repository";

/**
 * Seed the owner-approved invoice.v1 calculation policy for the single shop org.
 * Idempotent. Usage: pnpm --filter @aabhushan/db seed:calculation-policy
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
      WHERE sm.organization_id = $1 AND sm.status = 'active'
      ORDER BY su.created_at ASC
      LIMIT 1
      `,
      [ORGANIZATION_ID],
    );
    const staffRow = staff.rows[0];
    if (!staffRow) {
      throw new Error("An active staff membership is required to approve the calculation policy.");
    }

    const repo = createCalculationPolicyRepository(client, ORGANIZATION_ID);
    const policy = await repo.upsertApprovedInvoiceV1({
      version: INVOICE_V1_POLICY_METHODS.version,
      makingChargeMethod: INVOICE_V1_POLICY_METHODS.makingChargeMethod,
      wastageMethod: INVOICE_V1_POLICY_METHODS.wastageMethod,
      discountMethod: INVOICE_V1_POLICY_METHODS.discountMethod,
      taxMethod: INVOICE_V1_POLICY_METHODS.taxMethod,
      roundingMode: INVOICE_V1_POLICY_METHODS.roundingMode,
      roundingScale: INVOICE_V1_POLICY_METHODS.roundingScale,
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
          making_charge_method: policy.makingChargeMethod,
          wastage_method: policy.wastageMethod,
          discount_method: policy.discountMethod,
          tax_method: policy.taxMethod,
          rounding_mode: policy.roundingMode,
          rounding_scale: policy.roundingScale,
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
