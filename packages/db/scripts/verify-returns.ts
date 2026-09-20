import { randomUUID } from "node:crypto";

import { Pool, type PoolClient } from "pg";

import {
  ApplicationHttpError,
  acceptInvoiceReturn,
  createInvoiceDraft,
  finalizeInvoice,
  getCustomerSalesStatement,
  getInvoice,
  getInvoiceCorrections,
  patchInvoiceDraft,
  recordPayment,
  refundPayment,
  reversePayment,
  type ResolvedStaffAccess,
} from "@aabhushan/application";
import { decimalFromString, INVOICE_V1_POLICY_METHODS, kolkataBusinessDate, permissionsForRole, STAFF_PERMISSION_MAP_VERSION } from "@aabhushan/domain";

import { createCalculationPolicyRepository } from "../src/calculation-policy-repository";
import { createInvoiceRepository } from "../src/invoice-repository";
import { createPaymentRepository } from "../src/payment-repository";
import { createReturnsRepository } from "../src/return-repository";

/**
 * Real PostgreSQL checks for spec 10: no in-place invoice edit, inspection-gated
 * restock, credit notes reducing due, refund/reversal guards, idempotency, and
 * org isolation.
 *
 * Usage: DATABASE_URL=... pnpm --filter @aabhushan/db verify:returns
 */
const ORGANIZATION_ID = "11111111-1111-4111-8111-111111111111";
const BRANCH_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_ORGANIZATION_ID = "99999999-9999-4999-8999-999999999999";

type StaffRow = {
  id: string;
  email: string;
  display_name: string;
  membership_id: string;
  role: "owner" | "admin" | "billing" | "inventory" | "girvi";
};

type Fixture = {
  staffRow: StaffRow;
  customerId: string;
  articleIds: string[];
  paidInvoiceId: string;
  unpaidInvoiceId: string;
  invoiceCount: number;
  purity: string;
  businessDate: string;
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
      const returns = await client.query("SELECT count(*)::int AS count FROM app.invoice_returns");
      const credits = await client.query("SELECT count(*)::int AS count FROM app.credit_notes");
      return (returns.rows[0]?.count as number) + (credits.rows[0]?.count as number);
    });
    if (missing !== 0) {
      throw new Error(`Missing organization context must deny returns and credit notes, got ${String(missing)}.`);
    }

    const wrongOrg = await withApiRole(pool, async (client) => {
      await client.query("SELECT set_config('app.organization_id', $1, true)", [OTHER_ORGANIZATION_ID]);
      const returns = await client.query("SELECT count(*)::int AS count FROM app.invoice_returns");
      const credits = await client.query("SELECT count(*)::int AS count FROM app.credit_notes");
      return (returns.rows[0]?.count as number) + (credits.rows[0]?.count as number);
    });
    if (wrongOrg !== 0) {
      throw new Error(`Wrong organization id must deny returns and credit notes, got ${String(wrongOrg)}.`);
    }

    fixture = await setUpFixture(pool, suffix);
    const fx = fixture;
    const owner = staffAccess(fx.staffRow);
    const billing = staffAccess({ ...fx.staffRow, role: "billing" });

    const paidBefore = await withOrgTxn(pool, async (client) => {
      const repo = createInvoiceRepository(client, ORGANIZATION_ID, BRANCH_ID);
      return getInvoice(repo, owner, fx.paidInvoiceId);
    });
    const line = paidBefore.lines[0];
    const returnedArticleId = fx.articleIds[0];
    if (!line || !returnedArticleId) {
      throw new Error("Paid invoice must have a line to return.");
    }

    const accepted = await withOrgTxn(pool, async (client) => {
      const returnsRepo = createReturnsRepository(client, ORGANIZATION_ID, BRANCH_ID);
      const paymentRepo = createPaymentRepository(client, ORGANIZATION_ID, BRANCH_ID);
      return acceptInvoiceReturn(
        returnsRepo,
        paymentRepo,
        owner,
        fx.paidInvoiceId,
        {
          invoice_line_id: line.id,
          article_id: line.article_id,
          reason: "Customer changed mind",
          customer_acknowledged: true,
        },
        `verify-return-${suffix}`,
      );
    });
    if (accepted.article_status !== "return_inspection") {
      throw new Error("Accepted return must place the article under review, not available.");
    }
    if (accepted.credit_note.amount_inr !== paidBefore.grand_total_inr) {
      throw new Error(
        `Single-line credit ${accepted.credit_note.amount_inr} must equal invoice grand total ${paidBefore.grand_total_inr}.`,
      );
    }

    const paidAfter = await withOrgTxn(pool, async (client) => {
      const repo = createInvoiceRepository(client, ORGANIZATION_ID, BRANCH_ID);
      return getInvoice(repo, owner, fx.paidInvoiceId);
    });
    if (paidAfter.grand_total_inr !== paidBefore.grand_total_inr || paidAfter.lines[0]?.line_total_inr !== line.line_total_inr) {
      throw new Error("Finalized invoice amounts and line snapshots must not change in place.");
    }
    if (paidAfter.amount_due_inr !== "0.00") {
      throw new Error(`Paid-up return must leave due at 0.00, got ${paidAfter.amount_due_inr}.`);
    }

    const articleStatus = await withOrgTxn(pool, async (client) => {
      const result = await client.query<{ status: string }>(
        `SELECT status FROM app.articles WHERE organization_id = $1 AND id = $2`,
        [ORGANIZATION_ID, returnedArticleId],
      );
      return result.rows[0]?.status;
    });
    if (articleStatus !== "return_inspection") {
      throw new Error(`Returned article status must be return_inspection, got ${String(articleStatus)}.`);
    }

    await expectApplicationError(
      "POS add of uninspected return",
      async () => {
        await withOrgTxn(pool, async (client) => {
          const invoiceRepo = createInvoiceRepository(client, ORGANIZATION_ID, BRANCH_ID);
          const policyRepo = createCalculationPolicyRepository(client, ORGANIZATION_ID);
          const draft = await createInvoiceDraft(invoiceRepo, policyRepo, owner, {
            customer_id: fx.customerId,
            business_date: fx.businessDate,
          });
          await patchInvoiceDraft(invoiceRepo, policyRepo, owner, draft.id, {
            add_article_ids: [returnedArticleId],
          });
        });
      },
      (error) => error.code === "ARTICLE_NOT_SELLABLE",
    );

    const replay = await withOrgTxn(pool, async (client) => {
      const returnsRepo = createReturnsRepository(client, ORGANIZATION_ID, BRANCH_ID);
      const paymentRepo = createPaymentRepository(client, ORGANIZATION_ID, BRANCH_ID);
      return acceptInvoiceReturn(
        returnsRepo,
        paymentRepo,
        owner,
        fx.paidInvoiceId,
        {
          invoice_line_id: line.id,
          article_id: line.article_id,
          reason: "Customer changed mind",
          customer_acknowledged: true,
        },
        `verify-return-${suffix}`,
      );
    });
    if (replay.return.id !== accepted.return.id || replay.credit_note.id !== accepted.credit_note.id) {
      throw new Error("Idempotent return retry must return the original return and credit note.");
    }

    await expectApplicationError(
      "second return of the same line",
      async () => {
        await withOrgTxn(pool, async (client) => {
          const returnsRepo = createReturnsRepository(client, ORGANIZATION_ID, BRANCH_ID);
          const paymentRepo = createPaymentRepository(client, ORGANIZATION_ID, BRANCH_ID);
          await acceptInvoiceReturn(
            returnsRepo,
            paymentRepo,
            owner,
            fx.paidInvoiceId,
            {
              invoice_line_id: line.id,
              article_id: line.article_id,
              reason: "Retry",
              customer_acknowledged: true,
            },
            `verify-return-dup-${suffix}`,
          );
        });
      },
      (error) => error.httpStatus === 409,
    );

    const collection = await withOrgTxn(pool, async (client) => {
      const result = await client.query<{ id: string }>(
        `
        SELECT p.id
        FROM app.payments p
        JOIN app.payment_allocations pa ON pa.payment_id = p.id AND pa.organization_id = p.organization_id
        WHERE p.organization_id = $1 AND pa.invoice_id = $2 AND p.kind = 'collection' AND p.status = 'posted'
        LIMIT 1
        `,
        [ORGANIZATION_ID, fx.paidInvoiceId],
      );
      return result.rows[0]?.id;
    });
    if (!collection) {
      throw new Error("Paid invoice must have a posted collection to refund.");
    }

    await expectApplicationError(
      "billing refund without refunds.approve",
      async () => {
        await withOrgTxn(pool, async (client) => {
          const repo = createPaymentRepository(client, ORGANIZATION_ID, BRANCH_ID);
          await refundPayment(repo, billing, collection, { reason: "Not allowed" }, `verify-refund-billing-${suffix}`);
        });
      },
      (error) => error.httpStatus === 403,
    );

    const refund = await withOrgTxn(pool, async (client) => {
      const repo = createPaymentRepository(client, ORGANIZATION_ID, BRANCH_ID);
      return refundPayment(
        repo,
        owner,
        collection,
        { reason: "Return of paid jewellery", amount_inr: paidBefore.grand_total_inr },
        `verify-refund-${suffix}`,
      );
    });
    if (refund.kind !== "refund") {
      throw new Error("Refund must write a compensating payment of kind refund.");
    }

    const afterRefund = await withOrgTxn(pool, async (client) => {
      const repo = createInvoiceRepository(client, ORGANIZATION_ID, BRANCH_ID);
      return getInvoice(repo, owner, fx.paidInvoiceId);
    });
    if (afterRefund.amount_due_inr !== "0.00" || afterRefund.amount_paid_inr !== "0.00") {
      throw new Error(
        `Credit plus refund of a paid invoice must leave paid and due at 0.00, got paid ${afterRefund.amount_paid_inr} due ${afterRefund.amount_due_inr}.`,
      );
    }

    const refundReplay = await withOrgTxn(pool, async (client) => {
      const repo = createPaymentRepository(client, ORGANIZATION_ID, BRANCH_ID);
      return refundPayment(
        repo,
        owner,
        collection,
        { reason: "Return of paid jewellery", amount_inr: paidBefore.grand_total_inr },
        `verify-refund-${suffix}`,
      );
    });
    if (refundReplay.id !== refund.id) {
      throw new Error("Idempotent refund retry must return the original refund payment.");
    }

    await expectApplicationError(
      "second refund of the same collection",
      async () => {
        await withOrgTxn(pool, async (client) => {
          const repo = createPaymentRepository(client, ORGANIZATION_ID, BRANCH_ID);
          await refundPayment(repo, owner, collection, { reason: "Again" }, `verify-refund-dup-${suffix}`);
        });
      },
      (error) => error.httpStatus === 422,
    );

    await expectApplicationError(
      "reverse after refund",
      async () => {
        await withOrgTxn(pool, async (client) => {
          const repo = createPaymentRepository(client, ORGANIZATION_ID, BRANCH_ID);
          await reversePayment(repo, owner, collection, { reason: "Cannot reverse" }, `verify-reverse-blocked-${suffix}`);
        });
      },
      (error) => error.httpStatus === 409,
    );

    const unpaidCollection = await withOrgTxn(pool, async (client) => {
      const repo = createPaymentRepository(client, ORGANIZATION_ID, BRANCH_ID);
      const posted = await recordPayment(
        repo,
        owner,
        {
          customer_id: fx.customerId,
          received_business_date: fx.businessDate,
          tenders: [{ method: "cash", amount_inr: "100.00" }],
          allocations: [{ invoice_id: fx.unpaidInvoiceId, amount_inr: "100.00" }],
        },
        `verify-unpaid-collect-${suffix}`,
      );
      const paymentId = posted.payments[0]?.id;
      if (!paymentId) {
        throw new Error("Unpaid invoice collection did not post.");
      }
      return paymentId;
    });

    await expectApplicationError(
      "refund larger than net collected",
      async () => {
        await withOrgTxn(pool, async (client) => {
          const repo = createPaymentRepository(client, ORGANIZATION_ID, BRANCH_ID);
          await refundPayment(
            repo,
            owner,
            unpaidCollection,
            { reason: "Too much", amount_inr: "200.00" },
            `verify-refund-over-${suffix}`,
          );
        });
      },
      (error) => error.httpStatus === 422,
    );

    const reversal = await withOrgTxn(pool, async (client) => {
      const repo = createPaymentRepository(client, ORGANIZATION_ID, BRANCH_ID);
      return reversePayment(repo, owner, unpaidCollection, { reason: "Wrong invoice" }, `verify-reverse-${suffix}`);
    });
    if (reversal.kind !== "reversal") {
      throw new Error("Reversal must write a compensating payment of kind reversal.");
    }

    await expectApplicationError(
      "refund after reversal",
      async () => {
        await withOrgTxn(pool, async (client) => {
          const repo = createPaymentRepository(client, ORGANIZATION_ID, BRANCH_ID);
          await refundPayment(repo, owner, unpaidCollection, { reason: "Cannot refund" }, `verify-refund-blocked-${suffix}`);
        });
      },
      (error) => error.httpStatus === 409,
    );

    const corrections = await withOrgTxn(pool, async (client) => {
      const repo = createReturnsRepository(client, ORGANIZATION_ID, BRANCH_ID);
      return getInvoiceCorrections(repo, owner, fx.paidInvoiceId);
    });
    if (corrections.returns.length !== 1 || corrections.credit_notes.length !== 1) {
      throw new Error("Invoice corrections must list the linked return and credit note.");
    }
    const reconstructedDue = decimalFromString(corrections.grand_total_inr)
      .minus(corrections.credited_inr)
      .minus(corrections.net_collected_inr);
    if (reconstructedDue.lt(0) ? corrections.amount_due_inr !== "0.00" : reconstructedDue.toFixed(2) !== corrections.amount_due_inr) {
      throw new Error(
        `Statement due ${corrections.amount_due_inr} must match invoice + payments + credits + refunds.`,
      );
    }

    const statement = await withOrgTxn(pool, async (client) => {
      const repo = createPaymentRepository(client, ORGANIZATION_ID, BRANCH_ID);
      return getCustomerSalesStatement(repo, owner, fx.customerId);
    });
    if (statement.credit_notes.length < 1) {
      throw new Error("Customer statement must label credit notes separately from collections.");
    }
    if (!statement.payments.some((item) => item.kind === "refund")) {
      throw new Error("Customer statement must include the refund as a distinct payment kind.");
    }

    console.log(
      "returns verification passed: missing org context denied returns and credit notes, accepted return wrote a credit note and moved stock to return_inspection without editing the issued invoice, POS rejected the uninspected article, duplicate return was 409, idempotent return and refund retries reused the original rows, billing could not refund, credit plus refund of a paid invoice left due at zero, refund and reversal could not both subtract the same payment, and the customer statement reconstructed due from invoice + payments + credits + refunds.",
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
      throw new Error("An active staff user is required for returns verification.");
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

    const purity = `VRET${suffix}`;
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
        `Returns Verify ${suffix}`,
        `+9197${suffix.replace(/\D/g, "").padEnd(8, "6").slice(0, 8)}`,
        `97${suffix.slice(0, 8)}`,
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
          `RETV${suffix}${String(index)}`,
          categoryId,
          purity,
          weight,
          `RETV${suffix}${String(index)}`,
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

    const paidDraft = await createInvoiceDraft(invoiceRepo, policyRepo, access, {
      customer_id: customerId,
      business_date: businessDate,
      article_ids: [firstArticleId],
    });
    const paidQuote = paidDraft.grand_total_inr;
    const paid = await finalizeInvoice(
      invoiceRepo,
      policyRepo,
      access,
      paidDraft.id,
      {
        quote_version: paidDraft.quote_version,
        payments: [{ method: "cash", amount_inr: paidQuote }],
      },
      `verify-setup-paid-${suffix}`,
    );

    const unpaidDraft = await createInvoiceDraft(invoiceRepo, policyRepo, access, {
      customer_id: customerId,
      business_date: businessDate,
      article_ids: [secondArticleId],
    });
    const unpaid = await finalizeInvoice(
      invoiceRepo,
      policyRepo,
      access,
      unpaidDraft.id,
      { quote_version: unpaidDraft.quote_version },
      `verify-setup-unpaid-${suffix}`,
    );

    return {
      staffRow,
      customerId,
      articleIds,
      paidInvoiceId: paid.id,
      unpaidInvoiceId: unpaid.id,
      invoiceCount: 2,
      purity,
      businessDate,
    };
  });
}

async function tearDownFixture(pool: Pool, fixture: Fixture): Promise<void> {
  await withOrgTxn(pool, async (client) => {
    const invoiceIds = [fixture.paidInvoiceId, fixture.unpaidInvoiceId];
    const extraDrafts = await client.query<{ id: string }>(
      `SELECT id FROM app.invoices WHERE organization_id = $1 AND customer_id = $2`,
      [ORGANIZATION_ID, fixture.customerId],
    );
    const allInvoiceIds = [...new Set([...invoiceIds, ...extraDrafts.rows.map((row) => row.id)])];

    const paymentIds = await client.query<{ id: string }>(
      `SELECT id FROM app.payments WHERE organization_id = $1 AND customer_id = $2`,
      [ORGANIZATION_ID, fixture.customerId],
    );
    const ids = paymentIds.rows.map((row) => row.id);
    const returnIds = await client.query<{ id: string }>(
      `SELECT id FROM app.invoice_returns WHERE organization_id = $1 AND invoice_id = ANY($2::uuid[])`,
      [ORGANIZATION_ID, allInvoiceIds],
    );
    const returns = returnIds.rows.map((row) => row.id);

    if (returns.length > 0) {
      await client.query(`DELETE FROM app.credit_notes WHERE organization_id = $1 AND return_id = ANY($2::uuid[])`, [
        ORGANIZATION_ID,
        returns,
      ]);
      await client.query(
        `UPDATE app.inventory_movements SET related_return_id = NULL WHERE organization_id = $1 AND related_return_id = ANY($2::uuid[])`,
        [ORGANIZATION_ID, returns],
      );
      await client.query(`DELETE FROM app.invoice_returns WHERE organization_id = $1 AND id = ANY($2::uuid[])`, [
        ORGANIZATION_ID,
        returns,
      ]);
    }

    if (ids.length > 0) {
      await client.query(`DELETE FROM app.receipts WHERE organization_id = $1 AND payment_id = ANY($2::uuid[])`, [
        ORGANIZATION_ID,
        ids,
      ]);
      await client.query(
        `DELETE FROM app.payment_allocations WHERE organization_id = $1 AND payment_id = ANY($2::uuid[])`,
        [ORGANIZATION_ID, ids],
      );
      await client.query(`UPDATE app.payments SET reversed_by_payment_id = NULL WHERE organization_id = $1 AND id = ANY($2::uuid[])`, [
        ORGANIZATION_ID,
        ids,
      ]);
      await client.query(`DELETE FROM app.payments WHERE organization_id = $1 AND id = ANY($2::uuid[])`, [
        ORGANIZATION_ID,
        ids,
      ]);
    }

    await client.query(
      `DELETE FROM app.idempotency_keys WHERE organization_id = $1 AND key LIKE 'verify-%'`,
      [ORGANIZATION_ID],
    );
    await client.query(
      `DELETE FROM app.outbox_events WHERE organization_id = $1 AND (
        event_key = ANY($2::text[])
        OR event_key LIKE 'credit_note.requested:%'
        OR event_key LIKE 'refund.requested:%'
        OR event_key LIKE 'payment.reversed:%'
        OR event_key LIKE 'receipt.requested:%'
        OR event_key LIKE 'invoice.finalized:%'
      )`,
      [ORGANIZATION_ID, allInvoiceIds.map((id) => `invoice.finalized:${id}`)],
    );
    await client.query(
      `DELETE FROM app.inventory_movements WHERE organization_id = $1 AND article_id = ANY($2::uuid[])`,
      [ORGANIZATION_ID, fixture.articleIds],
    );
    await client.query(`DELETE FROM app.invoice_lines WHERE organization_id = $1 AND invoice_id = ANY($2::uuid[])`, [
      ORGANIZATION_ID,
      allInvoiceIds,
    ]);
    await client.query(`DELETE FROM app.invoices WHERE organization_id = $1 AND id = ANY($2::uuid[])`, [
      ORGANIZATION_ID,
      allInvoiceIds,
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

    const consumed: Array<{ documentType: string; count: number }> = [
      { documentType: "invoice", count: allInvoiceIds.length },
      { documentType: "receipt", count: ids.length },
      { documentType: "credit_note", count: returns.length },
      { documentType: "refund", count: 1 },
      { documentType: "article", count: fixture.articleIds.length },
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
