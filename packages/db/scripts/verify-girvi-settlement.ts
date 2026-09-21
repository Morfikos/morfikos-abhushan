import { randomUUID } from "node:crypto";

import { Pool, type PoolClient } from "pg";

import {
  ApplicationHttpError,
  activateGirviAccount,
  createGirviDraft,
  getGirviStatement,
  quoteGirviSettlement,
  recordGirviRepayment,
  releaseGirviCollateral,
  settleGirviAccount,
  type ResolvedStaffAccess,
} from "@aabhushan/application";
import {
  GIRVI_V1_POLICY_METHODS,
  permissionsForRole,
  STAFF_PERMISSION_MAP_VERSION,
} from "@aabhushan/domain";

import { createGirviRepository } from "../src/girvi-repository";
import { createGirviCalculationPolicyRepository } from "../src/girvi-calculation-policy-repository";

/**
 * Real PostgreSQL checks for spec 12 on approved `girvi.v1`.
 *
 * Proves: statements never post interest, repayment allocates interest before
 * principal and locks the account, concurrent repayments cannot spend the same
 * funds twice, overpayment and backdating are refused, release is blocked while
 * money is due, settlement and release are two rows, and released collateral
 * never becomes inventory.
 *
 * Usage: DATABASE_URL=... pnpm --filter @aabhushan/db verify:girvi-settlement
 */
const ORGANIZATION_ID = "11111111-1111-4111-8111-111111111111";
const BRANCH_ID = "22222222-2222-4222-8222-222222222222";

type StaffRow = {
  id: string;
  email: string;
  display_name: string;
  membership_id: string;
  role: "owner" | "admin" | "billing" | "inventory" | "girvi";
};

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}.`);
  }
}

async function expectHttpError(
  label: string,
  status: number,
  code: string | null,
  run: () => Promise<unknown>,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    if (!(error instanceof ApplicationHttpError)) {
      throw error;
    }
    if (error.httpStatus !== status || (code !== null && error.code !== code)) {
      throw new Error(
        `${label}: expected ${String(status)} ${code ?? "any"}, got ${String(error.httpStatus)} ${error.code}.`,
      );
    }
    return;
  }
  throw new Error(`${label}: expected ${String(status)} ${code ?? "any"} but the call succeeded.`);
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  const pool = new Pool({ connectionString: databaseUrl, max: 6 });
  const suffix = randomUUID().slice(0, 8).toUpperCase();
  const createdAccountIds: string[] = [];

  try {
    // Seed the approved policy in its own transaction so every later check sees it.
    const policyStaff = await withOrgTxn(pool, async (client) => {
      const staff = await loadStaff(client);
      const policies = createGirviCalculationPolicyRepository(client, ORGANIZATION_ID);
      await policies.upsertApproved({
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
        approvedByStaffUserId: staff.id,
      });
      return staff;
    });

    const girviAccess = staffAccess({ ...policyStaff, role: "girvi" });
    const ownerAccess = staffAccess({ ...policyStaff, role: "owner" });

    const customerId = await withOrgTxn(pool, async (client) => {
      const digits = suffix.replace(/\D/g, "").padEnd(8, "7").slice(0, 8);
      const inserted = await client.query<{ id: string }>(
        `
        INSERT INTO app.customers (organization_id, display_name, phone_normalized, phone_display, is_active)
        VALUES ($1, $2, $3, $4, true)
        RETURNING id
        `,
        [ORGANIZATION_ID, `Girvi Settle ${suffix}`, `+9197${digits}`, `97${digits}`],
      );
      const id = inserted.rows[0]?.id;
      if (!id) {
        throw new Error("Failed to insert the verification customer.");
      }
      return id;
    });

    /** Open an activated account with the approved rate and one packet. */
    async function openAccount(label: string, startBusinessDate: string): Promise<{
      accountId: string;
      packetNumber: string;
    }> {
      const packetNumber = `SET-${suffix}-${label}`;
      const accountId = await withOrgTxn(pool, async (client) => {
        const repo = createGirviRepository(client, ORGANIZATION_ID, BRANCH_ID);
        const draft = await createGirviDraft(repo, girviAccess, {
          customer_id: customerId,
          principal_inr: "10000.00",
          interest_rate_percent_per_30_days: "2",
          start_business_date: startBusinessDate,
          maturity_business_date: "2027-12-31",
          collateral: [
            {
              description: `Bangle ${label}`,
              metal: "gold",
              purity: "22K",
              packet_number: packetNumber,
              custody_location: "Safe A",
            },
          ],
        });
        const activated = await activateGirviAccount(
          repo,
          girviAccess,
          draft.id,
          {
            row_version: draft.row_version,
            confirm_principal_inr: draft.principal_inr,
            confirm_packet_numbers: [packetNumber],
          },
          randomUUID(),
        );
        if (activated.terms_snapshot.interest.status !== "approved") {
          throw new Error("Activation with an approved policy must freeze approved interest terms.");
        }
        assertEqual(activated.principal_outstanding_inr, "10000.00", "Activation principal projection");
        assertEqual(activated.interest_outstanding_inr, "0.00", "Activation interest projection");
        return activated.id;
      });
      createdAccountIds.push(accountId);
      return { accountId, packetNumber };
    }

    // ---- Statement is read-only and matches the approved fixtures. ----
    const main1 = await openAccount("A", "2026-01-01");

    await withOrgTxn(pool, async (client) => {
      const repo = createGirviRepository(client, ORGANIZATION_ID, BRANCH_ID);
      const sameDay = await getGirviStatement(repo, girviAccess, main1.accountId, "2026-01-01");
      assertEqual(sameDay.interest_outstanding_inr, "0.00", "Same-day interest");
      assertEqual(sameDay.payoff_inr, "10000.00", "Same-day payable");
      assertEqual(sameDay.rate_period_label, "per 30 days", "Rate period label");

      const thirtyOne = await getGirviStatement(repo, girviAccess, main1.accountId, "2026-02-01");
      assertEqual(thirtyOne.interest_outstanding_inr, "206.67", "31-day interest");
      assertEqual(thirtyOne.payoff_inr, "10206.67", "31-day payable");

      const eventCount = await client.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM app.girvi_financial_events WHERE organization_id = $1 AND girvi_account_id = $2`,
        [ORGANIZATION_ID, main1.accountId],
      );
      assertEqual(eventCount.rows[0]?.count, 1, "Reading statements must not post interest events");
    });

    // ---- Repayment: interest first, principal reduced from the repayment date. ----
    const repaymentKey = `verify-girvi-repay-${suffix}`;
    await withOrgTxn(pool, async (client) => {
      const repo = createGirviRepository(client, ORGANIZATION_ID, BRANCH_ID);
      const result = await recordGirviRepayment(
        repo,
        girviAccess,
        main1.accountId,
        {
          business_date: "2026-01-16",
          amount_inr: "2000.00",
          method: "cash",
          confirm_interest_paid_inr: "100.00",
          confirm_principal_paid_inr: "1900.00",
        },
        repaymentKey,
      );
      assertEqual(result.allocation.interest_paid_inr, "100.00", "Interest paid on 15 days");
      assertEqual(result.allocation.principal_paid_inr, "1900.00", "Principal paid");
      assertEqual(result.allocation.principal_outstanding_inr, "8100.00", "Principal after repayment");
      assertEqual(result.account.principal_outstanding_inr, "8100.00", "Account principal projection");

      const settleQuote = await quoteGirviSettlement(repo, girviAccess, main1.accountId, "2026-01-31");
      assertEqual(settleQuote.interest_outstanding_inr, "81.00", "Interest on reduced principal");
      assertEqual(settleQuote.payoff_inr, "8181.00", "Payable after partial repayment");
    });

    // A retried repayment with the same key must not take the money twice.
    await withOrgTxn(pool, async (client) => {
      const repo = createGirviRepository(client, ORGANIZATION_ID, BRANCH_ID);
      const retry = await recordGirviRepayment(
        repo,
        girviAccess,
        main1.accountId,
        {
          business_date: "2026-01-16",
          amount_inr: "2000.00",
          method: "cash",
          confirm_interest_paid_inr: "100.00",
          confirm_principal_paid_inr: "1900.00",
        },
        repaymentKey,
      );
      assertEqual(retry.allocation.principal_outstanding_inr, "8100.00", "Retried repayment principal");
      const repayments = await client.query<{ count: number }>(
        `
        SELECT count(*)::int AS count FROM app.girvi_financial_events
        WHERE organization_id = $1 AND girvi_account_id = $2 AND event_type = 'repayment'
        `,
        [ORGANIZATION_ID, main1.accountId],
      );
      assertEqual(repayments.rows[0]?.count, 1, "Retried repayment must not write a second event");
    });

    // Backdating before the posted repayment must be refused.
    await withOrgTxn(pool, async (client) => {
      const repo = createGirviRepository(client, ORGANIZATION_ID, BRANCH_ID);
      await expectHttpError("Backdated repayment", 422, "GIRVI_BACKDATED_EVENT", () =>
        recordGirviRepayment(
          repo,
          girviAccess,
          main1.accountId,
          {
            business_date: "2026-01-10",
            amount_inr: "100.00",
            method: "cash",
            confirm_interest_paid_inr: "100.00",
            confirm_principal_paid_inr: "0.00",
          },
          randomUUID(),
        ),
      );

      await expectHttpError("Overpayment", 422, "GIRVI_OVERPAYMENT", () =>
        recordGirviRepayment(
          repo,
          girviAccess,
          main1.accountId,
          {
            business_date: "2026-01-31",
            amount_inr: "99999.00",
            method: "cash",
            confirm_interest_paid_inr: "81.00",
            confirm_principal_paid_inr: "99918.00",
          },
          randomUUID(),
        ),
      );

      await expectHttpError("Stale split", 409, "STALE_GIRVI_QUOTE", () =>
        recordGirviRepayment(
          repo,
          girviAccess,
          main1.accountId,
          {
            business_date: "2026-01-31",
            amount_inr: "100.00",
            method: "cash",
            confirm_interest_paid_inr: "0.00",
            confirm_principal_paid_inr: "100.00",
          },
          randomUUID(),
        ),
      );

      await expectHttpError("Release while money is due", 422, null, () =>
        releaseGirviCollateral(
          repo,
          ownerAccess,
          main1.accountId,
          {
            verify_packet_numbers: [main1.packetNumber],
            recipient_name: "Customer",
            customer_acknowledged: true,
          },
          randomUUID(),
        ),
      );
    });

    // ---- Concurrent repayments must not allocate the same funds twice. ----
    const concurrent = await openAccount("B", "2026-03-01");
    const concurrentOutcomes = await Promise.allSettled([
      withOrgTxn(pool, async (client) => {
        const repo = createGirviRepository(client, ORGANIZATION_ID, BRANCH_ID);
        return recordGirviRepayment(
          repo,
          girviAccess,
          concurrent.accountId,
          {
            business_date: "2026-03-31",
            amount_inr: "5000.00",
            method: "cash",
            confirm_interest_paid_inr: "200.00",
            confirm_principal_paid_inr: "4800.00",
          },
          randomUUID(),
        );
      }),
      withOrgTxn(pool, async (client) => {
        const repo = createGirviRepository(client, ORGANIZATION_ID, BRANCH_ID);
        return recordGirviRepayment(
          repo,
          girviAccess,
          concurrent.accountId,
          {
            business_date: "2026-03-31",
            amount_inr: "5000.00",
            method: "cash",
            confirm_interest_paid_inr: "200.00",
            confirm_principal_paid_inr: "4800.00",
          },
          randomUUID(),
        );
      }),
    ]);

    const succeeded = concurrentOutcomes.filter((outcome) => outcome.status === "fulfilled");
    if (succeeded.length !== 1) {
      throw new Error(
        `Concurrent repayments must allocate the same interest once: ${String(succeeded.length)} succeeded.`,
      );
    }
    await withOrgTxn(pool, async (client) => {
      const projection = await client.query<{ principal: string; interest: string }>(
        `
        SELECT principal_outstanding_inr::text AS principal, interest_outstanding_inr::text AS interest
        FROM app.girvi_accounts WHERE organization_id = $1 AND id = $2
        `,
        [ORGANIZATION_ID, concurrent.accountId],
      );
      assertEqual(projection.rows[0]?.principal, "5200.00", "Concurrent repayment principal projection");
      assertEqual(projection.rows[0]?.interest, "0.00", "Concurrent repayment interest projection");
    });

    // ---- Settlement, then release, as two separate audited rows. ----
    const settleKey = `verify-girvi-settle-${suffix}`;
    await withOrgTxn(pool, async (client) => {
      const repo = createGirviRepository(client, ORGANIZATION_ID, BRANCH_ID);
      const quote = await quoteGirviSettlement(repo, girviAccess, main1.accountId, "2026-01-31");
      assertEqual(quote.payoff_inr, "8181.00", "Settlement quote payable");

      await expectHttpError("Stale settlement quote", 409, "STALE_GIRVI_QUOTE", () =>
        settleGirviAccount(
          repo,
          girviAccess,
          main1.accountId,
          {
            business_date: "2026-01-31",
            confirm_payoff_inr: "8000.00",
            amount_inr: "8000.00",
            method: "cash",
          },
          randomUUID(),
        ),
      );

      const settled = await settleGirviAccount(
        repo,
        girviAccess,
        main1.accountId,
        {
          business_date: "2026-01-31",
          confirm_payoff_inr: quote.payoff_inr,
          amount_inr: quote.payoff_inr,
          method: "cash",
        },
        settleKey,
      );
      assertEqual(settled.account.status, "settled", "Status after settlement");
      assertEqual(settled.settlement.collateral_still_in_custody, true, "Packets stay in custody");
      assertEqual(settled.account.principal_outstanding_inr, "0.00", "Principal cleared");
      assertEqual(settled.account.interest_outstanding_inr, "0.00", "Interest cleared");
      assertEqual(
        settled.account.collateral.every((item) => item.status === "in_custody"),
        true,
        "Settlement must not release collateral",
      );
    });

    // Retried settlement returns the first response and writes nothing new.
    await withOrgTxn(pool, async (client) => {
      const repo = createGirviRepository(client, ORGANIZATION_ID, BRANCH_ID);
      const retry = await settleGirviAccount(
        repo,
        girviAccess,
        main1.accountId,
        {
          business_date: "2026-01-31",
          confirm_payoff_inr: "8181.00",
          amount_inr: "8181.00",
          method: "cash",
        },
        settleKey,
      );
      assertEqual(retry.account.status, "settled", "Retried settlement status");
      const settlements = await client.query<{ count: number }>(
        `
        SELECT count(*)::int AS count FROM app.girvi_financial_events
        WHERE organization_id = $1 AND girvi_account_id = $2 AND event_type = 'settlement'
        `,
        [ORGANIZATION_ID, main1.accountId],
      );
      assertEqual(settlements.rows[0]?.count, 1, "Retried settlement must not post twice");
    });

    const releaseKey = `verify-girvi-release-${suffix}`;
    await withOrgTxn(pool, async (client) => {
      const repo = createGirviRepository(client, ORGANIZATION_ID, BRANCH_ID);

      await expectHttpError("Release without the girvi.release permission", 403, "PERMISSION_DENIED", () =>
        releaseGirviCollateral(
          repo,
          staffAccess({ ...policyStaff, role: "billing" }),
          main1.accountId,
          {
            verify_packet_numbers: [main1.packetNumber],
            recipient_name: "Customer",
            customer_acknowledged: true,
          },
          randomUUID(),
        ),
      );

      await expectHttpError("Packet mismatch", 409, "PACKET_MISMATCH", () =>
        releaseGirviCollateral(
          repo,
          ownerAccess,
          main1.accountId,
          {
            verify_packet_numbers: ["WRONG-PACKET"],
            recipient_name: "Customer",
            customer_acknowledged: true,
          },
          randomUUID(),
        ),
      );

      const released = await releaseGirviCollateral(
        repo,
        ownerAccess,
        main1.accountId,
        {
          verify_packet_numbers: [main1.packetNumber],
          recipient_name: `Customer ${suffix}`,
          customer_acknowledged: true,
        },
        releaseKey,
      );
      assertEqual(released.account.status, "released", "Status after release");
      assertEqual(released.release.packet_numbers_verified[0], main1.packetNumber, "Verified packet recorded");
      assertEqual(
        released.account.collateral.every((item) => item.status === "released"),
        true,
        "Collateral status after release",
      );
      if (!released.release.settlement_event_id) {
        throw new Error("A settled release must reference its settlement event.");
      }

      const rows = await client.query<{ settlements: number; releases: number }>(
        `
        SELECT
          (SELECT count(*)::int FROM app.girvi_financial_events
            WHERE organization_id = $1 AND girvi_account_id = $2 AND event_type = 'settlement') AS settlements,
          (SELECT count(*)::int FROM app.girvi_release_events
            WHERE organization_id = $1 AND girvi_account_id = $2) AS releases
        `,
        [ORGANIZATION_ID, main1.accountId],
      );
      assertEqual(rows.rows[0]?.settlements, 1, "One settlement row");
      assertEqual(rows.rows[0]?.releases, 1, "One release row");

      const custody = await client.query<{ count: number }>(
        `
        SELECT count(*)::int AS count FROM app.girvi_custody_events
        WHERE organization_id = $1 AND girvi_account_id = $2 AND event_type = 'released'
        `,
        [ORGANIZATION_ID, main1.accountId],
      );
      assertEqual(custody.rows[0]?.count, 1, "Release must write a custody released event");

      // Released jewellery is never shop stock.
      if (await repo.articleExistsWithBarcode(main1.packetNumber)) {
        throw new Error("Released collateral must not appear as an article barcode.");
      }
    });

    await withOrgTxn(pool, async (client) => {
      const repo = createGirviRepository(client, ORGANIZATION_ID, BRANCH_ID);
      await expectHttpError("Second release", 409, "GIRVI_ALREADY_RELEASED", () =>
        releaseGirviCollateral(
          repo,
          ownerAccess,
          main1.accountId,
          {
            verify_packet_numbers: [main1.packetNumber],
            recipient_name: "Customer",
            customer_acknowledged: true,
          },
          randomUUID(),
        ),
      );
    });

    // ---- Waiver path: only owner or admin, reason required, release allowed after. ----
    const waived = await openAccount("C", "2026-05-01");
    await withOrgTxn(pool, async (client) => {
      const repo = createGirviRepository(client, ORGANIZATION_ID, BRANCH_ID);
      const quote = await quoteGirviSettlement(repo, girviAccess, waived.accountId, "2026-05-31");

      await expectHttpError("Waiver by a girvi-only role", 403, "PERMISSION_DENIED", () =>
        settleGirviAccount(
          repo,
          girviAccess,
          waived.accountId,
          {
            business_date: "2026-05-31",
            confirm_payoff_inr: quote.payoff_inr,
            amount_inr: "9000.00",
            method: "cash",
            waiver_inr: subtract(quote.payoff_inr, "9000.00"),
            waiver_reason: "Long-standing customer, remainder written off.",
          },
          randomUUID(),
        ),
      );

      const settled = await settleGirviAccount(
        repo,
        ownerAccess,
        waived.accountId,
        {
          business_date: "2026-05-31",
          confirm_payoff_inr: quote.payoff_inr,
          amount_inr: "9000.00",
          method: "cash",
          waiver_inr: subtract(quote.payoff_inr, "9000.00"),
          waiver_reason: "Long-standing customer, remainder written off.",
        },
        randomUUID(),
      );
      if (!settled.settlement.waiver_event_id) {
        throw new Error("A waived settlement must write a waiver event.");
      }
      assertEqual(settled.account.status, "settled", "Status after waived settlement");
      assertEqual(settled.account.principal_outstanding_inr, "0.00", "Principal cleared by waiver");
    });

    console.log(
      "girvi settlement verification passed: statements never posted interest, approved girvi.v1 matched the 31-day and partial-repayment fixtures, repayment allocated interest before principal and reduced principal from its business date, retried repayment/settle/release keys posted once, backdating and overpayment and stale quotes were refused, concurrent repayments allocated the same interest only once, release was blocked while money was due and needed girvi.release plus a matching packet, settlement and release were two separate rows with the packets staying in custody in between, released collateral never became an article, and waivers needed an owner or admin with a recorded reason.",
    );
  } finally {
    await pool.end();
  }
}

/** Paise-accurate difference for the waiver fixture. */
function subtract(left: string, right: string): string {
  const toPaise = (amount: string): bigint => {
    const [whole = "0", fraction = ""] = amount.split(".");
    return BigInt(whole) * 100n + BigInt(`${fraction}00`.slice(0, 2));
  };
  const paise = toPaise(left) - toPaise(right);
  return `${(paise / 100n).toString()}.${(paise % 100n).toString().padStart(2, "0")}`;
}

function staffAccess(row: StaffRow): ResolvedStaffAccess {
  return {
    staff_user_id: row.id,
    email: row.email,
    display_name: row.display_name,
    membership: {
      id: row.membership_id,
      organization_id: ORGANIZATION_ID,
      branch_id: BRANCH_ID,
      role: row.role,
      status: "active",
    },
    permissions: permissionsForRole(row.role),
    permission_map_version: STAFF_PERMISSION_MAP_VERSION,
  };
}

async function loadStaff(client: PoolClient): Promise<StaffRow> {
  const staff = await client.query<StaffRow>(
    `
    SELECT su.id, su.email, su.display_name, sm.id AS membership_id, sm.role
    FROM app.staff_users su
    JOIN app.staff_memberships sm ON sm.staff_user_id = su.id
    WHERE sm.organization_id = $1 AND sm.status = 'active'
    ORDER BY su.created_at ASC
    LIMIT 1
    `,
    [ORGANIZATION_ID],
  );
  const row = staff.rows[0];
  if (!row) {
    throw new Error("An active staff user is required for Girvi settlement verification.");
  }
  return row;
}

async function withOrgTxn<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE app_api");
    await client.query("SELECT set_config('app.organization_id', $1, true)", [ORGANIZATION_ID]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
