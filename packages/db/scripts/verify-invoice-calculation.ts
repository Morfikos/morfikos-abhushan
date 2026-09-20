import { Pool } from "pg";

import {
  CalculationDomainError,
  INVOICE_V1_POLICY_METHODS,
  quoteInvoice,
  type CalculationPolicy,
} from "@aabhushan/domain";
import { createCalculationPolicyRepository } from "../src/calculation-policy-repository";

/**
 * Real PostgreSQL checks for calculation_policies RLS and approved invoice.v1 quotes.
 * Usage: pnpm --filter @aabhushan/db verify:invoice-calculation
 */
const ORGANIZATION_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ORGANIZATION_ID = "99999999-9999-4999-8999-999999999999";

async function withApiRole<T>(pool: Pool, fn: (client: import("pg").PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE app_api");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function withOrg<T>(pool: Pool, fn: (client: import("pg").PoolClient) => Promise<T>): Promise<T> {
  return withApiRole(pool, async (client) => {
    await client.query("SELECT set_config('app.organization_id', $1, true)", [ORGANIZATION_ID]);
    return fn(client);
  });
}

function sampleLine() {
  return {
    lineId: "line-1",
    metal: "gold" as const,
    purity: "22K",
    grossWeightGrams: "5.0000",
    nonMetalWeightGrams: "0.0000",
    netMetalWeightGrams: "5.0000",
    ratePerGram: "6500.000000",
    makingChargeInput: { method: "fixed" as const, amountInr: "0.00" },
    wastageInput: { method: "none" as const },
    stoneCharges: [] as [],
    lineDiscountInput: null,
  };
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  const pool = new Pool({ connectionString: databaseUrl, max: 2 });

  try {
    const missing = await withApiRole(pool, async (client) => {
      const result = await client.query("SELECT count(*)::int AS count FROM app.calculation_policies");
      return result.rows[0]?.count as number;
    });
    if (missing !== 0) {
      throw new Error(`Missing organization context should deny calculation_policies, got ${String(missing)}.`);
    }

    const wrongOrg = await withApiRole(pool, async (client) => {
      await client.query("SELECT set_config('app.organization_id', $1, true)", [OTHER_ORGANIZATION_ID]);
      const result = await client.query("SELECT count(*)::int AS count FROM app.calculation_policies");
      return result.rows[0]?.count as number;
    });
    if (wrongOrg !== 0) {
      throw new Error(`Wrong organization id should deny calculation_policies, got ${String(wrongOrg)}.`);
    }

    const outcome = await withOrg(pool, async (client) => {
      const repo = createCalculationPolicyRepository(client, ORGANIZATION_ID);
      const version = `invoice.draft.verify.${Date.now()}`;
      const draft = await repo.insertDraft({ version });
      if (draft.status !== "draft") {
        throw new Error("Inserted policy must be draft.");
      }
      if (draft.makingChargeMethod !== null || draft.roundingMode !== null) {
        throw new Error("Draft policy must not invent method defaults.");
      }

      const loaded = await repo.findByVersion(version);
      if (!loaded || loaded.id !== draft.id) {
        throw new Error("findByVersion must return the draft.");
      }

      const policy: CalculationPolicy = {
        version: draft.version,
        status: draft.status,
        currency: draft.currency,
        weightUnit: draft.weightUnit,
        rateUnit: draft.rateUnit,
        makingChargeMethod: draft.makingChargeMethod,
        wastageMethod: draft.wastageMethod,
        discountMethod: draft.discountMethod,
        taxMethod: draft.taxMethod,
        roundingMode: draft.roundingMode,
        roundingScale: draft.roundingScale,
      };

      try {
        quoteInvoice(
          {
            policyVersion: version,
            businessDate: "2026-09-20",
            lines: [sampleLine()],
            invoiceDiscountInput: null,
            taxInput: { method: "gst_jewellery_intra" },
          },
          policy,
        );
        throw new Error("Draft policy quote must fail.");
      } catch (error) {
        if (!(error instanceof CalculationDomainError) || error.code !== "CALCULATION_POLICY_UNAPPROVED") {
          throw error instanceof Error ? error : new Error("Expected CALCULATION_POLICY_UNAPPROVED.");
        }
      }

      await client.query(`DELETE FROM app.calculation_policies WHERE id = $1`, [draft.id]);

      const staff = await client.query<{ id: string }>(
        `
        SELECT su.id
        FROM app.staff_users su
        JOIN app.staff_memberships sm ON sm.staff_user_id = su.id
        WHERE sm.organization_id = $1 AND sm.status = 'active'
        LIMIT 1
        `,
        [ORGANIZATION_ID],
      );
      const staffId = staff.rows[0]?.id;
      if (!staffId) {
        throw new Error("Active staff required to verify approved invoice.v1 upsert.");
      }

      const approved = await repo.upsertApprovedInvoiceV1({
        version: INVOICE_V1_POLICY_METHODS.version,
        makingChargeMethod: INVOICE_V1_POLICY_METHODS.makingChargeMethod,
        wastageMethod: INVOICE_V1_POLICY_METHODS.wastageMethod,
        discountMethod: INVOICE_V1_POLICY_METHODS.discountMethod,
        taxMethod: INVOICE_V1_POLICY_METHODS.taxMethod,
        roundingMode: INVOICE_V1_POLICY_METHODS.roundingMode,
        roundingScale: INVOICE_V1_POLICY_METHODS.roundingScale,
        approvedByStaffUserId: staffId,
      });
      if (approved.status !== "approved" || approved.version !== "invoice.v1") {
        throw new Error("upsertApprovedInvoiceV1 must return approved invoice.v1.");
      }

      const latest = await repo.findLatestApproved();
      if (!latest || latest.version !== "invoice.v1") {
        throw new Error("findLatestApproved must return invoice.v1 after upsert.");
      }

      const quote = quoteInvoice(
        {
          policyVersion: "invoice.v1",
          businessDate: "2026-09-20",
          lines: [sampleLine()],
          invoiceDiscountInput: null,
          taxInput: { method: "gst_jewellery_intra" },
        },
        latest,
      );
      if (quote.grandTotalInr !== "33475.00" || quote.metalValueInr !== "32500.00") {
        throw new Error(
          `Approved invoice.v1 quote mismatch: metal=${quote.metalValueInr} total=${quote.grandTotalInr}`,
        );
      }

      return { approved_version: latest.version, sample_grand_total: quote.grandTotalInr };
    });

    console.log(
      JSON.stringify(
        {
          rls: "passed",
          draft_insert: "passed",
          fail_closed_quote: "passed",
          approved_invoice_v1_quote: "passed",
          ...outcome,
        },
        null,
        2,
      ),
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
