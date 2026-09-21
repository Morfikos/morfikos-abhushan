import { Pool } from "pg";

import { girviRateFromTermsSnapshot } from "@aabhushan/application";
import {
  buildGirviTermsSnapshot,
  computeGirviStatement,
  GIRVI_V1_POLICY_METHODS,
  kolkataBusinessDate,
  type GirviCalculationPolicy,
} from "@aabhushan/domain";

import { createGirviCalculationPolicyRepository } from "../src/girvi-calculation-policy-repository";
import { createGirviRepository } from "../src/girvi-repository";

/**
 * Ensure approved girvi.v1 and convert eligible active accounts that were
 * activated without an approved policy snapshot.
 *
 * Dry-run by default. Mutate with: pnpm repair:girvi-policy-snapshots -- --apply
 */
const ORGANIZATION_ID = "11111111-1111-4111-8111-111111111111";
const BRANCH_ID = "22222222-2222-4222-8222-222222222222";

type CandidateRow = {
  id: string;
  account_number: string;
  principal_inr: string | number;
  start_business_date: Date | string;
  maturity_business_date: Date | string;
  terms_snapshot: unknown;
  calculation_policy_version: string | null;
};

function asBusinessDate(value: Date | string): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).slice(0, 10);
}

function asMoneyString(value: string | number): string {
  if (typeof value === "number") {
    return value.toFixed(2);
  }
  const [whole = "0", fraction = ""] = value.split(".");
  return `${whole}.${fraction.padEnd(2, "0").slice(0, 2)}`;
}

function toPolicyInput(record: GirviCalculationPolicy): GirviCalculationPolicy {
  return {
    version: record.version,
    status: record.status,
    ratePeriod: record.ratePeriod,
    interestMethod: record.interestMethod,
    dayCountConvention: record.dayCountConvention,
    minimumPeriod: record.minimumPeriod,
    gracePeriod: record.gracePeriod,
    extraCharges: record.extraCharges,
    allocationOrder: record.allocationOrder,
    principalReductionRule: record.principalReductionRule,
    roundingMode: record.roundingMode,
    roundingScale: record.roundingScale,
    backdatingPolicy: record.backdatingPolicy,
  };
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const client = await pool.connect();

  const skippedNoRate: { id: string; account_number: string }[] = [];
  const repaired: {
    id: string;
    account_number: string;
    interest_outstanding_inr: string;
    principal_outstanding_inr: string;
  }[] = [];
  const failed: { id: string; account_number: string; error: string }[] = [];
  let ensuredPolicy: string | null = null;
  let candidates: CandidateRow[] = [];

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

    const policyRepo = createGirviCalculationPolicyRepository(client, ORGANIZATION_ID);
    let policyRecord = await policyRepo.findApproved();

    if (apply) {
      policyRecord = await policyRepo.upsertApproved({
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
    }

    if (!policyRecord || policyRecord.status !== "approved") {
      if (!apply) {
        throw new Error(
          "No approved Girvi calculation policy found. Re-run with --apply to seed girvi.v1 and repair accounts.",
        );
      }
      throw new Error("Failed to ensure an approved Girvi calculation policy.");
    }
    ensuredPolicy = policyRecord.version;
    const policy = toPolicyInput(policyRecord);

    const candidateResult = await client.query<CandidateRow>(
      `
      SELECT
        g.id,
        g.account_number,
        g.principal_inr,
        g.start_business_date,
        g.maturity_business_date,
        g.terms_snapshot,
        g.calculation_policy_version
      FROM app.girvi_accounts g
      LEFT JOIN app.girvi_calculation_policies p
        ON p.organization_id = g.organization_id
       AND p.version = g.calculation_policy_version
      WHERE g.organization_id = $1
        AND g.status = 'active'
        AND (
          g.calculation_policy_version IS NULL
          OR p.status IS DISTINCT FROM 'approved'
        )
      ORDER BY g.account_number
      `,
      [ORGANIZATION_ID],
    );
    candidates = candidateResult.rows;

    if (apply) {
      const girviRepo = createGirviRepository(client, ORGANIZATION_ID, BRANCH_ID);
      const asOf = kolkataBusinessDate();

      for (const row of candidates) {
        const rate = girviRateFromTermsSnapshot(row.terms_snapshot);
        if (rate === null) {
          skippedNoRate.push({ id: row.id, account_number: row.account_number });
          continue;
        }

        try {
          const terms = buildGirviTermsSnapshot({
            principalInr: asMoneyString(row.principal_inr),
            startBusinessDate: asBusinessDate(row.start_business_date),
            maturityBusinessDate: asBusinessDate(row.maturity_business_date),
            interestRatePercentPer30Days: rate,
            policy,
          });
          if (terms.interest.status !== "approved") {
            skippedNoRate.push({ id: row.id, account_number: row.account_number });
            continue;
          }

          await client.query(
            `
            UPDATE app.girvi_accounts
            SET terms_snapshot = $3::jsonb,
                calculation_policy_version = $4,
                row_version = row_version + 1,
                updated_at = timezone('utc', now())
            WHERE organization_id = $1 AND id = $2 AND status = 'active'
            `,
            [ORGANIZATION_ID, row.id, JSON.stringify(terms), terms.interest.policy_version],
          );

          const events = await girviRepo.loadLedgerEvents(row.id);
          const statement = computeGirviStatement({
            terms,
            policy,
            events,
            asOfBusinessDate: asOf,
          });

          await girviRepo.updateBalanceProjections({
            accountId: row.id,
            principalOutstandingInr: statement.principalOutstandingInr,
            interestOutstandingInr: statement.interestOutstandingInr,
          });

          repaired.push({
            id: row.id,
            account_number: row.account_number,
            principal_outstanding_inr: statement.principalOutstandingInr,
            interest_outstanding_inr: statement.interestOutstandingInr,
          });
        } catch (error) {
          failed.push({
            id: row.id,
            account_number: row.account_number,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } else {
      for (const row of candidates) {
        if (girviRateFromTermsSnapshot(row.terms_snapshot) === null) {
          skippedNoRate.push({ id: row.id, account_number: row.account_number });
        }
      }
    }

    if (apply && failed.length > 0) {
      await client.query("ROLLBACK");
      console.log(
        JSON.stringify(
          {
            dry_run: false,
            organization_id: ORGANIZATION_ID,
            ensured_policy: ensuredPolicy,
            candidates: candidates.length,
            repaired: [],
            skipped_no_rate: skippedNoRate,
            failed,
            note: "Rolled back because one or more accounts failed to repair.",
          },
          null,
          2,
        ),
      );
      process.exitCode = 1;
      return;
    }

    await client.query("COMMIT");
    console.log(
      JSON.stringify(
        {
          dry_run: !apply,
          organization_id: ORGANIZATION_ID,
          ensured_policy: ensuredPolicy,
          candidates: candidates.map((row) => ({
            id: row.id,
            account_number: row.account_number,
            calculation_policy_version: row.calculation_policy_version,
            has_rate: girviRateFromTermsSnapshot(row.terms_snapshot) !== null,
          })),
          candidate_count: candidates.length,
          repaired,
          skipped_no_rate: skippedNoRate,
          failed,
          note: apply
            ? "Active accounts with a recorded rate now snapshot approved girvi.v1; balances refreshed from statement."
            : "Dry-run only. Re-run with --apply to seed/ensure girvi.v1 and repair eligible accounts.",
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
