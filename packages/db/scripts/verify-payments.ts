import { randomUUID } from "node:crypto";

import { Pool, type PoolClient } from "pg";

import {
  ApplicationHttpError,
  createInvoiceDraft,
  finalizeInvoice,
  getCustomerSalesStatement,
  getDailyCollections,
  listPayments,
  recordPayment,
  type ResolvedStaffAccess,
} from "@aabhushan/application";
import { INVOICE_V1_POLICY_METHODS, kolkataBusinessDate, permissionsForRole, STAFF_PERMISSION_MAP_VERSION } from "@aabhushan/domain";

import { createCalculationPolicyRepository } from "../src/calculation-policy-repository";
import { createInvoiceRepository } from "../src/invoice-repository";
import { createPaymentRepository } from "../src/payment-repository";

/**
 * Real PostgreSQL checks for spec 09 payments: RLS, locked allocation, overpay
 * rejection, concurrent collections on one invoice, idempotent retry, projection
 * reconciliation, and sales/Girvi separation.
 *
 * Fixture rows are committed because concurrency cannot be proved inside one
 * transaction. Everything created here is deleted afterwards and the invoice and
 * receipt sequences are restored, so shop numbering is unchanged.
 *
 * Usage: DATABASE_URL=... pnpm --filter @aabhushan/db verify:payments
 */
const ORGANIZATION_ID = "11111111-1111-4111-8111-111111111111";
const BRANCH_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_ORGANIZATION_ID = "99999999-9999-4999-8999-999999999999";

type Fixture = {
  staffRow: StaffRow;
  customerId: string;
  articleIds: string[];
  invoiceId: string;
  draftInvoiceId: string;
  concurrentInvoiceId: string;
  invoiceCount: number;
  purity: string;
  businessDate: string;
};

type StaffRow = {
  id: string;
  email: string;
  display_name: string;
  membership_id: string;
  role: "owner" | "admin" | "billing" | "inventory" | "girvi";
};

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  const pool = new Pool({ connectionString: databaseUrl, max: 6 });
  const suffix = randomUUID().slice(0, 8).toUpperCase();
  let fixture: Fixture | null = null;

  try {
    const missing = await withApiRole(pool, async (client) => {
      const payments = await client.query("SELECT count(*)::int AS count FROM app.payments");
      const receipts = await client.query("SELECT count(*)::int AS count FROM app.receipts");
      return (payments.rows[0]?.count as number) + (receipts.rows[0]?.count as number);
    });
    if (missing !== 0) {
      throw new Error(`Missing organization context must deny payments and receipts, got ${String(missing)}.`);
    }

    const wrongOrg = await withApiRole(pool, async (client) => {
      await client.query("SELECT set_config('app.organization_id', $1, true)", [OTHER_ORGANIZATION_ID]);
      const payments = await client.query("SELECT count(*)::int AS count FROM app.payments");
      const receipts = await client.query("SELECT count(*)::int AS count FROM app.receipts");
      return (payments.rows[0]?.count as number) + (receipts.rows[0]?.count as number);
    });
    if (wrongOrg !== 0) {
      throw new Error(`Wrong organization id must deny payments and receipts, got ${String(wrongOrg)}.`);
    }

    const girviLeak = await withApiRole(pool, async (client) => {
      const result = await client.query<{ referenced: string }>(
        `
        SELECT DISTINCT ccu.table_name AS referenced
        FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name AND ccu.constraint_schema = tc.constraint_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = 'app'
          AND tc.table_name IN ('payments', 'payment_allocations', 'receipts')
        `,
      );
      return result.rows.map((row) => row.referenced);
    });
    const girviReferences = girviLeak.filter((table) => table.startsWith("girvi"));
    if (girviReferences.length > 0) {
      throw new Error(`Collection tables must not reference Girvi tables, found ${girviReferences.join(", ")}.`);
    }

    fixture = await setUpFixture(pool, suffix);
    const fx = fixture;
    const access = staffAccess(fx.staffRow);

    // Partial collection: locked allocation, receipt number, reconciled projection.
    const partial = await withOrgTxn(pool, async (client) => {
      const repo = createPaymentRepository(client, ORGANIZATION_ID, BRANCH_ID);
      return recordPayment(
        repo,
        access,
        {
          customer_id: fx.customerId,
          received_business_date: fx.businessDate,
          tenders: [{ method: "cash", amount_inr: "100.00" }],
          allocations: [{ invoice_id: fx.invoiceId, amount_inr: "100.00" }],
        },
        `verify-partial-${suffix}`,
      );
    });
    if (partial.payments.length !== 1) {
      throw new Error("A single tender must post exactly one payment.");
    }
    const partialPayment = partial.payments[0];
    if (!partialPayment?.receipt_number) {
      throw new Error("Every posted collection must carry a receipt number.");
    }
    if (partialPayment.allocations.length !== 1 || partialPayment.allocations[0]?.amount_inr !== "100.00") {
      throw new Error("Payment allocations must sum to the payment amount.");
    }
    await assertInvoiceReconciles(pool, fixture.invoiceId, "100.00");

    // Split tender: one post, two payments, two receipts, allocations still balanced.
    const split = await withOrgTxn(pool, async (client) => {
      const repo = createPaymentRepository(client, ORGANIZATION_ID, BRANCH_ID);
      return recordPayment(
        repo,
        access,
        {
          customer_id: fx.customerId,
          received_business_date: fx.businessDate,
          tenders: [
            { method: "cash", amount_inr: "50.00" },
            { method: "upi", amount_inr: "25.00", reference: `UPI${suffix}` },
          ],
          allocations: [{ invoice_id: fx.invoiceId, amount_inr: "75.00" }],
        },
        `verify-split-${suffix}`,
      );
    });
    if (split.payments.length !== 2) {
      throw new Error("A split tender must post one payment per method.");
    }
    if (split.payments.some((payment) => !payment.receipt_number)) {
      throw new Error("Each split tender payment must receive its own receipt number.");
    }
    if (new Set(split.payments.map((payment) => payment.receipt_number)).size !== 2) {
      throw new Error("Receipt numbers must be unique per payment.");
    }
    await assertInvoiceReconciles(pool, fixture.invoiceId, "175.00");

    // Overpayment is rejected: no customer-advance policy is approved.
    const remaining = await invoiceRemainingDue(pool, fixture.invoiceId);
    await expectApplicationError(
      "overpay rejection",
      async () =>
        withOrgTxn(pool, async (client) => {
          const repo = createPaymentRepository(client, ORGANIZATION_ID, BRANCH_ID);
          return recordPayment(
            repo,
            access,
            {
              customer_id: fx.customerId,
              received_business_date: fx.businessDate,
              tenders: [{ method: "cash", amount_inr: addPaise(remaining, 1) }],
              allocations: [{ invoice_id: fx.invoiceId, amount_inr: addPaise(remaining, 1) }],
            },
            `verify-overpay-${suffix}`,
          );
        }),
      (error) => error.httpStatus === 422,
    );
    await assertInvoiceReconciles(pool, fixture.invoiceId, "175.00");

    // Tender total must equal allocation total; a mismatched split is refused whole.
    await expectApplicationError(
      "tender/allocation mismatch",
      async () =>
        withOrgTxn(pool, async (client) => {
          const repo = createPaymentRepository(client, ORGANIZATION_ID, BRANCH_ID);
          return recordPayment(
            repo,
            access,
            {
              customer_id: fx.customerId,
              tenders: [
                { method: "cash", amount_inr: "10.00" },
                { method: "card", amount_inr: "10.00" },
              ],
              allocations: [{ invoice_id: fx.invoiceId, amount_inr: "15.00" }],
            },
            `verify-mismatch-${suffix}`,
          );
        }),
      (error) => error.httpStatus === 422,
    );

    // Draft invoices cannot receive a collection.
    await expectApplicationError(
      "draft allocation",
      async () =>
        withOrgTxn(pool, async (client) => {
          const repo = createPaymentRepository(client, ORGANIZATION_ID, BRANCH_ID);
          return recordPayment(
            repo,
            access,
            {
              customer_id: fx.customerId,
              tenders: [{ method: "cash", amount_inr: "10.00" }],
              allocations: [{ invoice_id: fx.draftInvoiceId, amount_inr: "10.00" }],
            },
            `verify-draft-${suffix}`,
          );
        }),
      (error) => error.httpStatus === 422,
    );

    // An invoice outside this organization is not found, without leaking existence.
    await expectApplicationError(
      "foreign invoice",
      async () =>
        withOrgTxn(pool, async (client) => {
          const repo = createPaymentRepository(client, ORGANIZATION_ID, BRANCH_ID);
          return recordPayment(
            repo,
            access,
            {
              customer_id: fx.customerId,
              tenders: [{ method: "cash", amount_inr: "10.00" }],
              allocations: [{ invoice_id: randomUUID(), amount_inr: "10.00" }],
            },
            `verify-foreign-${suffix}`,
          );
        }),
      (error) => error.httpStatus === 404 && error.code === "NOT_FOUND",
    );

    // Missing Idempotency-Key is refused before anything is written.
    await expectApplicationError(
      "missing idempotency key",
      async () =>
        withOrgTxn(pool, async (client) => {
          const repo = createPaymentRepository(client, ORGANIZATION_ID, BRANCH_ID);
          return recordPayment(
            repo,
            access,
            {
              customer_id: fx.customerId,
              tenders: [{ method: "cash", amount_inr: "10.00" }],
              allocations: [{ invoice_id: fx.invoiceId, amount_inr: "10.00" }],
            },
            undefined,
          );
        }),
      (error) => error.httpStatus === 422 && error.fieldErrors.some((field) => field.field === "Idempotency-Key"),
    );

    // Lost response: the same key and payload returns the original payment.
    const beforeReplay = await countPayments(pool, fixture.customerId);
    const replay = await withOrgTxn(pool, async (client) => {
      const repo = createPaymentRepository(client, ORGANIZATION_ID, BRANCH_ID);
      return recordPayment(
        repo,
        access,
        {
          customer_id: fx.customerId,
          received_business_date: fx.businessDate,
          tenders: [{ method: "cash", amount_inr: "100.00" }],
          allocations: [{ invoice_id: fx.invoiceId, amount_inr: "100.00" }],
        },
        `verify-partial-${suffix}`,
      );
    });
    if (replay.payments[0]?.id !== partialPayment.id) {
      throw new Error("Repeat post with the same key must return the original payment.");
    }
    const afterReplay = await countPayments(pool, fixture.customerId);
    if (afterReplay !== beforeReplay) {
      throw new Error("Idempotent retry must not post a second payment.");
    }
    await assertInvoiceReconciles(pool, fixture.invoiceId, "175.00");

    // The same key with a different payload is rejected.
    await expectApplicationError(
      "idempotency key reuse",
      async () =>
        withOrgTxn(pool, async (client) => {
          const repo = createPaymentRepository(client, ORGANIZATION_ID, BRANCH_ID);
          return recordPayment(
            repo,
            access,
            {
              customer_id: fx.customerId,
              received_business_date: fx.businessDate,
              tenders: [{ method: "cash", amount_inr: "1.00" }],
              allocations: [{ invoice_id: fx.invoiceId, amount_inr: "1.00" }],
            },
            `verify-partial-${suffix}`,
          );
        }),
      (error) => error.httpStatus === 409 && error.code === "IDEMPOTENCY_KEY_REUSED",
    );

    // Two simultaneous collections for the full due: one posts, one is refused.
    const concurrentDue = await invoiceRemainingDue(pool, fixture.concurrentInvoiceId);
    const attempts = await Promise.allSettled([
      withOrgTxn(pool, async (client) => {
        const repo = createPaymentRepository(client, ORGANIZATION_ID, BRANCH_ID);
        return recordPayment(
          repo,
          access,
          {
            customer_id: fx.customerId,
            received_business_date: fx.businessDate,
            tenders: [{ method: "cash", amount_inr: concurrentDue }],
            allocations: [{ invoice_id: fx.concurrentInvoiceId, amount_inr: concurrentDue }],
          },
          `verify-race-a-${suffix}`,
        );
      }),
      withOrgTxn(pool, async (client) => {
        const repo = createPaymentRepository(client, ORGANIZATION_ID, BRANCH_ID);
        return recordPayment(
          repo,
          access,
          {
            customer_id: fx.customerId,
            received_business_date: fx.businessDate,
            tenders: [{ method: "upi", amount_inr: concurrentDue }],
            allocations: [{ invoice_id: fx.concurrentInvoiceId, amount_inr: concurrentDue }],
          },
          `verify-race-b-${suffix}`,
        );
      }),
    ]);
    const fulfilled = attempts.filter((attempt) => attempt.status === "fulfilled");
    const rejected = attempts.filter((attempt) => attempt.status === "rejected");
    if (fulfilled.length !== 1 || rejected.length !== 1) {
      throw new Error(
        `Exactly one concurrent collection must post, got ${String(fulfilled.length)} accepted.`,
      );
    }
    const raceError = rejected[0]?.status === "rejected" ? rejected[0].reason : null;
    if (!(raceError instanceof ApplicationHttpError) || raceError.httpStatus !== 422) {
      throw new Error("The losing concurrent collection must fail with a 422 allocation error.");
    }
    await assertInvoiceReconciles(pool, fixture.concurrentInvoiceId, concurrentDue);
    const concurrentRemaining = await invoiceRemainingDue(pool, fixture.concurrentInvoiceId);
    if (concurrentRemaining !== "0.00") {
      throw new Error(`Concurrent collections must settle exactly, remaining ${concurrentRemaining}.`);
    }

    // Statement and collections views: sales dues only, receipts grouped by method.
    const statement = await withOrgTxn(pool, async (client) => {
      const repo = createPaymentRepository(client, ORGANIZATION_ID, BRANCH_ID);
      return getCustomerSalesStatement(repo, access, fx.customerId);
    });
    const expectedDue = await customerSalesDue(pool, fixture.customerId);
    if (statement.sales_due_inr !== expectedDue) {
      throw new Error(
        `Statement sales due ${statement.sales_due_inr} must equal finalized invoice dues ${expectedDue}.`,
      );
    }
    if (statement.payments.length === 0) {
      throw new Error("Statement must list the collection history.");
    }

    const collections = await withOrgTxn(pool, async (client) => {
      const repo = createPaymentRepository(client, ORGANIZATION_ID, BRANCH_ID);
      return getDailyCollections(repo, access, { from: fx.businessDate, to: fx.businessDate });
    });
    if (collections.methods.length !== 4) {
      throw new Error("Daily collections must label Cash, UPI, Card, and Bank separately.");
    }
    const methodSum = collections.methods.reduce(
      (total, row) => total + Number(row.amount_inr.replace(".", "")),
      0,
    );
    if (methodSum !== Number(collections.total_inr.replace(".", ""))) {
      throw new Error("Daily collection method amounts must sum to the reported total.");
    }
    const allocatedOnDate = await allocatedForBusinessDate(pool, fixture.businessDate);
    if (allocatedOnDate !== collections.total_inr) {
      throw new Error(
        `Every collected rupee must be allocated to a sales invoice: collected ${collections.total_inr}, allocated ${allocatedOnDate}.`,
      );
    }

    const allTimeCollections = await withOrgTxn(pool, async (client) => {
      const repo = createPaymentRepository(client, ORGANIZATION_ID, BRANCH_ID);
      return getDailyCollections(repo, access, {});
    });
    if (Number(allTimeCollections.total_inr.replace(".", "")) < Number(collections.total_inr.replace(".", ""))) {
      throw new Error("All-time collections must be at least the fixture business-date total.");
    }

    const rangedList = await withOrgTxn(pool, async (client) => {
      const repo = createPaymentRepository(client, ORGANIZATION_ID, BRANCH_ID);
      return listPayments(repo, access, {
        page: 1,
        pageSize: 20,
        sort: "received_at",
        direction: "desc",
        receivedBusinessDateFrom: fx.businessDate,
        receivedBusinessDateTo: fx.businessDate,
      });
    });
    if (rangedList.total === 0) {
      throw new Error("Payment list date range must include collections on the fixture business date.");
    }

    console.log(
      "payments verification passed: RLS denied payments and receipts without organization context, partial and split-tender collections posted with unique receipt numbers, invoice paid/due projections reconciled with allocations, overpayment and tender/allocation mismatch rejected, draft and foreign-invoice allocations rejected, missing Idempotency-Key rejected, idempotent retry returned the original payment without a second post, key reuse with a different payload rejected, two simultaneous full-due collections settled exactly once with the loser refused, statement sales due matched finalized invoice dues, and daily collections stayed fully allocated to sales invoices with no Girvi reference from the collection tables.",
    );
  } finally {
    if (fixture) {
      await tearDownFixture(pool, fixture).catch((error: unknown) => {
        console.error("cleanup failed", error instanceof Error ? error.message : error);
      });
    }
    await pool.end();
  }
}

async function setUpFixture(pool: Pool, suffix: string): Promise<Fixture> {
  return withOrgTxn(pool, async (client) => {
    const staff = await client.query<StaffRow>(
      `
      SELECT su.id, su.email, su.display_name, sm.id AS membership_id, sm.role
      FROM app.staff_users su
      JOIN app.staff_memberships sm ON sm.staff_user_id = su.id
      WHERE sm.organization_id = $1 AND sm.status = 'active'
      LIMIT 1
      `,
      [ORGANIZATION_ID],
    );
    const staffRow = staff.rows[0];
    if (!staffRow) {
      throw new Error("An active staff user is required for payment verification.");
    }

    const policyRepo = createCalculationPolicyRepository(client, ORGANIZATION_ID);
    await policyRepo.upsertApprovedInvoiceV1({
      version: INVOICE_V1_POLICY_METHODS.version,
      makingChargeMethod: INVOICE_V1_POLICY_METHODS.makingChargeMethod,
      wastageMethod: INVOICE_V1_POLICY_METHODS.wastageMethod,
      discountMethod: INVOICE_V1_POLICY_METHODS.discountMethod,
      taxMethod: INVOICE_V1_POLICY_METHODS.taxMethod,
      roundingMode: INVOICE_V1_POLICY_METHODS.roundingMode,
      roundingScale: INVOICE_V1_POLICY_METHODS.roundingScale,
      approvedByStaffUserId: staffRow.id,
    });

    const purity = `VPAY${suffix}`;
    await client.query(
      `
      INSERT INTO app.metal_rates (
        organization_id, metal, purity, rate_per_gram, effective_business_date, created_by_staff_user_id
      )
      VALUES ($1, 'gold', $2, 5000.000000, '2020-01-01'::date, $3)
      `,
      [ORGANIZATION_ID, purity, staffRow.id],
    );

    const customer = await client.query<{ id: string }>(
      `
      INSERT INTO app.customers (organization_id, display_name, phone_normalized, phone_display)
      VALUES ($1, $2, $3, $4)
      RETURNING id
      `,
      [
        ORGANIZATION_ID,
        `Payment Verify ${suffix}`,
        `+9198${suffix.replace(/\D/g, "").padEnd(8, "7").slice(0, 8)}`,
        `98${suffix.slice(0, 8)}`,
      ],
    );
    const customerId = customer.rows[0]?.id;
    if (!customerId) {
      throw new Error("Customer insert failed.");
    }

    const category = await client.query<{ id: string }>(
      `SELECT id FROM app.catalogue_categories WHERE organization_id = $1 LIMIT 1`,
      [ORGANIZATION_ID],
    );
    const categoryId = category.rows[0]?.id;
    if (!categoryId) {
      throw new Error("A catalogue category is required.");
    }

    const articleIds: string[] = [];
    for (const [index, weight] of (["2.0000", "1.0000"] as const).entries()) {
      const article = await client.query<{ id: string }>(
        `
        INSERT INTO app.articles (
          organization_id, branch_id, article_number, category_id, metal, purity,
          gross_weight_grams, non_metal_weight_grams, net_metal_weight_grams,
          receipt_business_date, status, barcode
        )
        VALUES ($1, $2, $3, $4, 'gold', $5, $6::numeric, 0.0000, $6::numeric, CURRENT_DATE, 'available', $7)
        RETURNING id
        `,
        [
          ORGANIZATION_ID,
          BRANCH_ID,
          `PAYV${suffix}${String(index)}`,
          categoryId,
          purity,
          weight,
          `PAYV${suffix}${String(index)}`,
        ],
      );
      const articleId = article.rows[0]?.id;
      if (!articleId) {
        throw new Error("Article insert failed.");
      }
      articleIds.push(articleId);
    }

    const invoiceRepo = createInvoiceRepository(client, ORGANIZATION_ID, BRANCH_ID);
    const access = staffAccess(staffRow);
    const businessDate = kolkataBusinessDate();

    const [firstArticleId, secondArticleId] = articleIds;
    if (!firstArticleId || !secondArticleId) {
      throw new Error("Two verification articles are required.");
    }

    const unpaidDraft = await createInvoiceDraft(invoiceRepo, policyRepo, access, {
      customer_id: customerId,
      business_date: businessDate,
      article_ids: [firstArticleId],
    });
    const unpaid = await finalizeInvoice(
      invoiceRepo,
      policyRepo,
      access,
      unpaidDraft.id,
      { quote_version: unpaidDraft.quote_version },
      `verify-setup-unpaid-${suffix}`,
    );

    const raceDraft = await createInvoiceDraft(invoiceRepo, policyRepo, access, {
      customer_id: customerId,
      business_date: businessDate,
      article_ids: [secondArticleId],
    });
    const race = await finalizeInvoice(
      invoiceRepo,
      policyRepo,
      access,
      raceDraft.id,
      { quote_version: raceDraft.quote_version },
      `verify-setup-race-${suffix}`,
    );

    const emptyDraft = await createInvoiceDraft(invoiceRepo, policyRepo, access, {
      customer_id: customerId,
      business_date: businessDate,
    });

    return {
      staffRow,
      customerId,
      articleIds,
      invoiceId: unpaid.id,
      draftInvoiceId: emptyDraft.id,
      concurrentInvoiceId: race.id,
      invoiceCount: 2,
      purity,
      businessDate,
    };
  });
}

async function tearDownFixture(pool: Pool, fixture: Fixture): Promise<void> {
  await withOrgTxn(pool, async (client) => {
    const invoiceIds = [fixture.invoiceId, fixture.draftInvoiceId, fixture.concurrentInvoiceId];
    const paymentIds = await client.query<{ id: string }>(
      `SELECT id FROM app.payments WHERE organization_id = $1 AND customer_id = $2`,
      [ORGANIZATION_ID, fixture.customerId],
    );
    const ids = paymentIds.rows.map((row) => row.id);

    if (ids.length > 0) {
      await client.query(`DELETE FROM app.receipts WHERE organization_id = $1 AND payment_id = ANY($2::uuid[])`, [
        ORGANIZATION_ID,
        ids,
      ]);
      await client.query(
        `DELETE FROM app.payment_allocations WHERE organization_id = $1 AND payment_id = ANY($2::uuid[])`,
        [ORGANIZATION_ID, ids],
      );
      await client.query(`DELETE FROM app.payments WHERE organization_id = $1 AND id = ANY($2::uuid[])`, [
        ORGANIZATION_ID,
        ids,
      ]);
      await client.query(
        `DELETE FROM app.outbox_events WHERE organization_id = $1 AND event_key = ANY($2::text[])`,
        [ORGANIZATION_ID, ids.map((id) => `receipt.requested:${id}`)],
      );
    }

    await client.query(
      `DELETE FROM app.idempotency_keys WHERE organization_id = $1 AND key LIKE 'verify-%'`,
      [ORGANIZATION_ID],
    );
    await client.query(
      `DELETE FROM app.outbox_events WHERE organization_id = $1 AND event_key = ANY($2::text[])`,
      [ORGANIZATION_ID, invoiceIds.map((id) => `invoice.finalized:${id}`)],
    );
    await client.query(
      `DELETE FROM app.inventory_movements WHERE organization_id = $1 AND article_id = ANY($2::uuid[])`,
      [ORGANIZATION_ID, fixture.articleIds],
    );
    await client.query(`DELETE FROM app.invoice_lines WHERE organization_id = $1 AND invoice_id = ANY($2::uuid[])`, [
      ORGANIZATION_ID,
      invoiceIds,
    ]);
    await client.query(`DELETE FROM app.invoices WHERE organization_id = $1 AND id = ANY($2::uuid[])`, [
      ORGANIZATION_ID,
      invoiceIds,
    ]);
    await client.query(`DELETE FROM app.articles WHERE organization_id = $1 AND id = ANY($2::uuid[])`, [
      ORGANIZATION_ID,
      fixture.articleIds,
    ]);
    await client.query(`DELETE FROM app.customers WHERE organization_id = $1 AND id = $2`, [
      ORGANIZATION_ID,
      fixture.customerId,
    ]);
    await client.query(`DELETE FROM app.metal_rates WHERE organization_id = $1 AND purity = $2`, [
      ORGANIZATION_ID,
      fixture.purity,
    ]);

    // Restore consumed invoice and receipt numbers so shop numbering is unchanged.
    const consumed: Array<{ documentType: string; count: number }> = [
      { documentType: "invoice", count: fixture.invoiceCount },
      { documentType: "receipt", count: ids.length },
    ];
    for (const entry of consumed) {
      await client.query(
        `
        UPDATE app.document_sequences
        SET next_value = GREATEST(1, next_value - $4::int), updated_at = timezone('utc', now())
        WHERE organization_id = $1 AND branch_id = $2 AND document_type = $3
        `,
        [ORGANIZATION_ID, BRANCH_ID, entry.documentType, entry.count],
      );
    }
  });
}

async function assertInvoiceReconciles(pool: Pool, invoiceId: string, expectedPaid: string): Promise<void> {
  const row = await withOrgTxn(pool, async (client) => {
    const result = await client.query<{
      amount_paid_inr: string;
      amount_due_inr: string;
      grand_total_inr: string;
      allocated_inr: string;
    }>(
      `
      SELECT
        i.amount_paid_inr::text, i.amount_due_inr::text, i.grand_total_inr::text,
        COALESCE((
          SELECT sum(pa.amount_inr)
          FROM app.payment_allocations pa
          JOIN app.payments p ON p.id = pa.payment_id AND p.organization_id = pa.organization_id
          WHERE pa.organization_id = i.organization_id AND pa.invoice_id = i.id AND p.status = 'posted'
        ), 0)::text AS allocated_inr
      FROM app.invoices i
      WHERE i.organization_id = $1 AND i.id = $2
      `,
      [ORGANIZATION_ID, invoiceId],
    );
    return result.rows[0];
  });
  if (!row) {
    throw new Error("Invoice could not be read for reconciliation.");
  }
  if (row.allocated_inr !== expectedPaid) {
    throw new Error(`Expected allocations of ${expectedPaid}, found ${row.allocated_inr}.`);
  }
  if (row.amount_paid_inr !== row.allocated_inr) {
    throw new Error(
      `Cached amount_paid_inr ${row.amount_paid_inr} must reconcile with allocations ${row.allocated_inr}.`,
    );
  }
  const expectedDue = (Number(row.grand_total_inr) - Number(row.allocated_inr)).toFixed(2);
  if (row.amount_due_inr !== expectedDue) {
    throw new Error(`Cached amount_due_inr ${row.amount_due_inr} must equal ${expectedDue}.`);
  }
}

async function invoiceRemainingDue(pool: Pool, invoiceId: string): Promise<string> {
  return withOrgTxn(pool, async (client) => {
    const result = await client.query<{ remaining: string }>(
      `
      SELECT (i.grand_total_inr - COALESCE((
        SELECT sum(pa.amount_inr)
        FROM app.payment_allocations pa
        JOIN app.payments p ON p.id = pa.payment_id AND p.organization_id = pa.organization_id
        WHERE pa.organization_id = i.organization_id AND pa.invoice_id = i.id AND p.status = 'posted'
      ), 0))::text AS remaining
      FROM app.invoices i
      WHERE i.organization_id = $1 AND i.id = $2
      `,
      [ORGANIZATION_ID, invoiceId],
    );
    const remaining = result.rows[0]?.remaining;
    if (!remaining) {
      throw new Error("Invoice remaining due could not be read.");
    }
    return remaining;
  });
}

async function customerSalesDue(pool: Pool, customerId: string): Promise<string> {
  return withOrgTxn(pool, async (client) => {
    const result = await client.query<{ due: string }>(
      `
      SELECT COALESCE(sum(amount_due_inr), 0)::text AS due
      FROM app.invoices
      WHERE organization_id = $1 AND customer_id = $2 AND status = 'finalized'
      `,
      [ORGANIZATION_ID, customerId],
    );
    return result.rows[0]?.due ?? "0.00";
  });
}

async function allocatedForBusinessDate(pool: Pool, businessDate: string): Promise<string> {
  return withOrgTxn(pool, async (client) => {
    const result = await client.query<{ allocated: string }>(
      `
      SELECT COALESCE(sum(pa.amount_inr), 0)::text AS allocated
      FROM app.payment_allocations pa
      JOIN app.payments p ON p.id = pa.payment_id AND p.organization_id = pa.organization_id
      WHERE pa.organization_id = $1 AND p.received_business_date = $2::date AND p.status = 'posted'
      `,
      [ORGANIZATION_ID, businessDate],
    );
    return result.rows[0]?.allocated ?? "0.00";
  });
}

async function countPayments(pool: Pool, customerId: string): Promise<number> {
  return withOrgTxn(pool, async (client) => {
    const result = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM app.payments WHERE organization_id = $1 AND customer_id = $2`,
      [ORGANIZATION_ID, customerId],
    );
    return result.rows[0]?.count ?? 0;
  });
}

function addPaise(amount: string, paise: number): string {
  const [whole = "0", fraction = "00"] = amount.split(".");
  const total = BigInt(whole) * 100n + BigInt(`${fraction}00`.slice(0, 2)) + BigInt(paise);
  return `${(total / 100n).toString()}.${(total % 100n).toString().padStart(2, "0")}`;
}

async function expectApplicationError(
  label: string,
  run: () => Promise<unknown>,
  matches: (error: ApplicationHttpError) => boolean,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    if (error instanceof ApplicationHttpError && matches(error)) {
      return;
    }
    throw error instanceof Error ? error : new Error(`${label} failed with a non-error value.`);
  }
  throw new Error(`${label} must be rejected.`);
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
    authUserId: randomUUID(),
  };
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

async function withApiRole<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE app_api");
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
  process.exit(1);
});
