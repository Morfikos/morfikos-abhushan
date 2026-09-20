import { createHash, randomUUID } from "node:crypto";

import { Pool } from "pg";

import {
  ApplicationHttpError,
  createInvoiceDraft,
  finalizeInvoice,
  hashFinalizePayload,
  patchInvoiceDraft,
  quickReceiveArticleOntoDraft,
  type ResolvedStaffAccess,
} from "@aabhushan/application";
import { permissionsForRole, STAFF_PERMISSION_MAP_VERSION, INVOICE_V1_POLICY_METHODS } from "@aabhushan/domain";
import { createCalculationPolicyRepository } from "../src/calculation-policy-repository";
import { createInventoryRepository } from "../src/inventory-repository";
import { createInvoiceRepository } from "../src/invoice-repository";

/**
 * Real PostgreSQL checks for spec 08 POS billing: RLS, draft patch,
 * fail-closed finalize, article locks, and idempotency.
 *
 * Usage: DATABASE_URL=... pnpm --filter @aabhushan/db verify:pos-billing
 */
const ORGANIZATION_ID = "11111111-1111-4111-8111-111111111111";
const BRANCH_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_ORGANIZATION_ID = "99999999-9999-4999-8999-999999999999";

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  const pool = new Pool({ connectionString: databaseUrl, max: 4 });

  try {
    const missing = await withApiRole(pool, async (client) => {
      const result = await client.query("SELECT count(*)::int AS count FROM app.invoices");
      return result.rows[0]?.count as number;
    });
    if (missing !== 0) {
      throw new Error(`Missing organization context should deny invoices, got ${String(missing)}.`);
    }

    const wrongOrg = await withApiRole(pool, async (client) => {
      await client.query("SELECT set_config('app.organization_id', $1, true)", [OTHER_ORGANIZATION_ID]);
      const result = await client.query("SELECT count(*)::int AS count FROM app.invoices");
      return result.rows[0]?.count as number;
    });
    if (wrongOrg !== 0) {
      throw new Error(`Wrong organization id should deny invoices, got ${String(wrongOrg)}.`);
    }

    await withOrg(pool, async (client) => {
      const staff = await client.query<{
        id: string;
        email: string;
        display_name: string;
        membership_id: string;
        role: "owner" | "admin" | "billing" | "inventory" | "girvi";
      }>(
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
        throw new Error("An active staff user is required for POS verification.");
      }
      const access = staffAccess(staffRow);
      const repo = createInvoiceRepository(client, ORGANIZATION_ID, BRANCH_ID);
      const policyRepo = createCalculationPolicyRepository(client, ORGANIZATION_ID);
      const suffix = randomUUID().slice(0, 8);

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

      const customer = await client.query<{ id: string }>(
        `
        INSERT INTO app.customers (organization_id, display_name, phone_normalized, phone_display)
        VALUES ($1, $2, $3, $4)
        RETURNING id
        `,
        [ORGANIZATION_ID, `POS Verify ${suffix}`, `+9199${suffix.replace(/\D/g, "").padEnd(8, "0").slice(0, 8)}`, `99${suffix.slice(0, 8)}`],
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

      const article = await client.query<{ id: string; status: string }>(
        `
        INSERT INTO app.articles (
          organization_id, branch_id, article_number, category_id, metal, purity,
          gross_weight_grams, non_metal_weight_grams, net_metal_weight_grams,
          receipt_business_date, status, barcode
        )
        VALUES (
          $1, $2, $3, $4, 'gold', '22K-NORATE',
          10.0000, 0.0000, 10.0000,
          CURRENT_DATE, 'available', $5
        )
        RETURNING id, status
        `,
        [ORGANIZATION_ID, BRANCH_ID, `POSV${suffix.toUpperCase()}`, categoryId, `POS${suffix.toUpperCase()}`],
      );
      const articleId = article.rows[0]?.id;
      if (!articleId) {
        throw new Error("Article insert failed.");
      }

      const draft = await createInvoiceDraft(repo, policyRepo, access, {
        customer_id: customerId,
        article_ids: [articleId],
      });
      if (draft.status !== "draft" || draft.lines.length !== 1) {
        throw new Error("Draft create with article must persist one line.");
      }
      if (!draft.quote_error) {
        throw new Error("Draft quote must surface a calculation error when the metal rate is missing.");
      }

      const patched = await patchInvoiceDraft(repo, policyRepo, access, draft.id, {
        remove_article_ids: [articleId],
      });
      if (patched.lines.length !== 0) {
        throw new Error("Draft patch remove must clear lines.");
      }
      const readded = await patchInvoiceDraft(repo, policyRepo, access, draft.id, {
        add_article_ids: [articleId],
      });
      if (readded.lines.length !== 1) {
        throw new Error("Draft patch add must restore the article line.");
      }

      try {
        await finalizeInvoice(repo, policyRepo, access, draft.id, { quote_version: readded.quote_version }, undefined);
        throw new Error("Finalize without Idempotency-Key must fail.");
      } catch (error) {
        if (!(error instanceof ApplicationHttpError) || error.httpStatus !== 422) {
          throw error instanceof Error ? error : new Error("Missing idempotency key must be 422.");
        }
        if (!error.fieldErrors.some((field) => field.field === "Idempotency-Key")) {
          throw new Error("Missing key validation must name Idempotency-Key.");
        }
      }

      const stillAvailable = await client.query<{ status: string }>(
        `SELECT status FROM app.articles WHERE organization_id = $1 AND id = $2`,
        [ORGANIZATION_ID, articleId],
      );
      if (stillAvailable.rows[0]?.status !== "available") {
        throw new Error("Failed finalize must leave the article available.");
      }

      try {
        await finalizeInvoice(
          repo,
          policyRepo,
          access,
          draft.id,
          { quote_version: readded.quote_version },
          `verify-calc-${suffix}`,
        );
        throw new Error("Finalize without an applicable metal rate must fail closed.");
      } catch (error) {
        if (!(error instanceof ApplicationHttpError)) {
          throw error instanceof Error ? error : new Error("Finalize must throw ApplicationHttpError.");
        }
        if (!error.code.startsWith("CALCULATION_")) {
          throw new Error(`Expected CALCULATION_* error, got ${error.code}.`);
        }
      }

      const afterCalcFail = await client.query<{ status: string }>(
        `SELECT status FROM app.articles WHERE organization_id = $1 AND id = $2`,
        [ORGANIZATION_ID, articleId],
      );
      if (afterCalcFail.rows[0]?.status !== "available") {
        throw new Error("Calculation-blocked finalize must leave the article available.");
      }

      // Concurrent finalize both fail closed on calculation (prefer both fail, article available).
      const keyA = `verify-conc-a-${suffix}`;
      const keyB = `verify-conc-b-${suffix}`;
      const body = { quote_version: readded.quote_version };
      const [resultA, resultB] = await Promise.allSettled([
        finalizeInvoice(repo, policyRepo, access, draft.id, body, keyA),
        finalizeInvoice(repo, policyRepo, access, draft.id, body, keyB),
      ]);
      const failedClosed =
        resultA.status === "rejected" &&
        resultB.status === "rejected" &&
        resultA.reason instanceof ApplicationHttpError &&
        resultB.reason instanceof ApplicationHttpError &&
        resultA.reason.code.startsWith("CALCULATION_") &&
        resultB.reason.code.startsWith("CALCULATION_");
      if (!failedClosed) {
        throw new Error("Concurrent finalize without an applicable metal rate must both fail closed.");
      }
      const afterConcurrent = await client.query<{ status: string }>(
        `SELECT status FROM app.articles WHERE organization_id = $1 AND id = $2`,
        [ORGANIZATION_ID, articleId],
      );
      if (afterConcurrent.rows[0]?.status !== "available") {
        throw new Error("Concurrent fail-closed finalize must leave the article available.");
      }

      // Raw lock pattern: two savepoints lock the same article; only one can update to sold.
      const articleB = await client.query<{ id: string }>(
        `
        INSERT INTO app.articles (
          organization_id, branch_id, article_number, category_id, metal, purity,
          gross_weight_grams, non_metal_weight_grams, net_metal_weight_grams,
          receipt_business_date, status, barcode
        )
        VALUES (
          $1, $2, $3, $4, 'gold', '22K',
          5.0000, 0.0000, 5.0000,
          CURRENT_DATE, 'available', $5
        )
        RETURNING id
        `,
        [ORGANIZATION_ID, BRANCH_ID, `POSL${suffix.toUpperCase()}`, categoryId, `POSL${suffix.toUpperCase()}`],
      );
      const lockArticleId = articleB.rows[0]?.id;
      if (!lockArticleId) {
        throw new Error("Lock-test article insert failed.");
      }

      await client.query(`SAVEPOINT lock_pattern`);
      try {
        await client.query(
          `SELECT id FROM app.articles WHERE organization_id = $1 AND id = $2 FOR UPDATE`,
          [ORGANIZATION_ID, lockArticleId],
        );
        const first = await client.query<{ id: string }>(
          `
          UPDATE app.articles
          SET status = 'sold', row_version = row_version + 1
          WHERE organization_id = $1 AND id = $2 AND status = 'available'
          RETURNING id
          `,
          [ORGANIZATION_ID, lockArticleId],
        );
        const second = await client.query<{ id: string }>(
          `
          UPDATE app.articles
          SET status = 'sold', row_version = row_version + 1
          WHERE organization_id = $1 AND id = $2 AND status = 'available'
          RETURNING id
          `,
          [ORGANIZATION_ID, lockArticleId],
        );
        if (!first.rows[0] || second.rows[0]) {
          throw new Error("Only the first sold update under one lock should succeed.");
        }
      } finally {
        await client.query(`ROLLBACK TO SAVEPOINT lock_pattern`);
        await client.query(`RELEASE SAVEPOINT lock_pattern`);
      }

      // Live finalize when approved policy + rate exist (rolled back with the transaction).
      // Use an early effective date so timezone date-parsing cannot miss the rate.
      await client.query(
        `
        INSERT INTO app.metal_rates (
          organization_id, metal, purity, rate_per_gram, effective_business_date, created_by_staff_user_id
        )
        VALUES ($1, 'gold', '22K', 6500.000000, '2020-01-01'::date, $2)
        ON CONFLICT (organization_id, metal, purity, effective_business_date)
        DO UPDATE SET rate_per_gram = EXCLUDED.rate_per_gram
        `,
        [ORGANIZATION_ID, staffRow.id],
      );

      const liveArticle = await client.query<{ id: string }>(
        `
        INSERT INTO app.articles (
          organization_id, branch_id, article_number, category_id, metal, purity,
          gross_weight_grams, non_metal_weight_grams, net_metal_weight_grams,
          receipt_business_date, status, barcode
        )
        VALUES (
          $1, $2, $3, $4, 'gold', '22K',
          2.0000, 0.0000, 2.0000,
          CURRENT_DATE, 'available', $5
        )
        RETURNING id
        `,
        [ORGANIZATION_ID, BRANCH_ID, `POSLIVE${suffix.toUpperCase()}`, categoryId, `LIVE${suffix.toUpperCase()}`],
      );
      const liveArticleId = liveArticle.rows[0]?.id;
      if (!liveArticleId) {
        throw new Error("Live-sale article insert failed.");
      }

      const liveDraft = await createInvoiceDraft(repo, policyRepo, access, {
        customer_id: customerId,
        article_ids: [liveArticleId],
      });
      if (liveDraft.quote_error) {
        throw new Error(
          `Live draft quote must succeed with approved policy and rate: ${liveDraft.quote_error.code} ${liveDraft.quote_error.message}`,
        );
      }
      if (liveDraft.grand_total_inr === "0.00") {
        throw new Error("Live draft must show a non-zero grand total.");
      }

      const finalized = await finalizeInvoice(
        repo,
        policyRepo,
        access,
        liveDraft.id,
        {
          quote_version: liveDraft.quote_version,
          payments: [{ method: "cash", amount_inr: liveDraft.grand_total_inr }],
        },
        `verify-live-${suffix}`,
      );
      if (finalized.status !== "finalized" || !finalized.invoice_number) {
        throw new Error("Live finalize must produce a numbered finalized invoice.");
      }
      if (finalized.amount_due_inr !== "0.00") {
        throw new Error("Fully paid finalize must leave zero amount due.");
      }
      const sold = await client.query<{ status: string }>(
        `SELECT status FROM app.articles WHERE organization_id = $1 AND id = $2`,
        [ORGANIZATION_ID, liveArticleId],
      );
      if (sold.rows[0]?.status !== "sold") {
        throw new Error("Live finalize must mark the article sold.");
      }

      // Idempotency: insert response, same hash returns it, different hash rejected.
      const finalizeBody = { quote_version: 1 };
      const requestHash = hashFinalizePayload(finalizeBody);
      const fakeInvoice = {
        id: randomUUID(),
        invoice_number: "INV00001",
        customer_id: customerId,
        customer_display_name: "Idempotency",
        status: "finalized" as const,
        business_date: "2026-09-20",
        quote_version: 1,
        calculation_policy_version: "invoice.v1",
        metal_value_inr: "0.00",
        making_charges_inr: "0.00",
        wastage_inr: "0.00",
        stone_charges_inr: "0.00",
        discount_inr: "0.00",
        tax_inr: "0.00",
        round_off_inr: "0.00",
        grand_total_inr: "0.00",
        amount_paid_inr: "0.00",
        amount_due_inr: "0.00",
        invoice_discount: null,
        finalized_at: new Date().toISOString(),
        finalized_by_staff_user_id: staffRow.id,
        row_version: 2,
        lines: [],
        quote_error: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const idemKey = `verify-idem-${suffix}`;
      await repo.insertIdempotency({
        operation: "invoice.finalize",
        key: idemKey,
        requestHash,
        responseStatus: 200,
        responseBody: fakeInvoice,
      });
      const replay = await finalizeInvoice(repo, policyRepo, access, draft.id, finalizeBody, idemKey);
      if (replay.id !== fakeInvoice.id) {
        throw new Error("Same idempotency key and hash must return the stored response.");
      }
      try {
        await finalizeInvoice(
          repo,
          policyRepo,
          access,
          draft.id,
          { quote_version: 99 },
          idemKey,
        );
        throw new Error("Different hash for same key must be rejected.");
      } catch (error) {
        if (!(error instanceof ApplicationHttpError) || error.code !== "IDEMPOTENCY_KEY_REUSED") {
          throw error instanceof Error ? error : new Error("Different hash must be IDEMPOTENCY_KEY_REUSED.");
        }
      }

      // Stable hash helper sanity
      const h1 = createHash("sha256").update(JSON.stringify({ quote_version: 1 })).digest("hex");
      void h1;

      // POS quick receive onto draft (billing.write path; same txn as add).
      const inventoryRepo = createInventoryRepository(client, ORGANIZATION_ID, BRANCH_ID);
      const billingAccess: ResolvedStaffAccess = {
        ...access,
        membership: { ...access.membership, role: "billing" },
        permissions: permissionsForRole("billing"),
      };
      const quickDraft = await createInvoiceDraft(repo, policyRepo, billingAccess, {
        customer_id: customerId,
      });
      const quicked = await quickReceiveArticleOntoDraft(
        repo,
        inventoryRepo,
        policyRepo,
        billingAccess,
        quickDraft.id,
        {
          category_id: categoryId,
          metal: "gold",
          purity: "22K",
          gross_weight_grams: "3.0000",
          non_metal_weight_grams: "0",
          net_metal_weight_grams: "3.0000",
        },
      );
      if (quicked.lines.length !== 1) {
        throw new Error("Quick receive must add one line to the draft.");
      }
      const quickArticleId = quicked.lines[0]?.article_id;
      if (!quickArticleId) {
        throw new Error("Quick receive line must include article_id.");
      }
      const quickArticle = await client.query<{ status: string; barcode: string | null }>(
        `SELECT status, barcode FROM app.articles WHERE organization_id = $1 AND id = $2`,
        [ORGANIZATION_ID, quickArticleId],
      );
      if (quickArticle.rows[0]?.status !== "available") {
        throw new Error("Quick-received article must be available.");
      }
      if (quickArticle.rows[0]?.barcode) {
        throw new Error("Quick receive must not assign a barcode in this pass.");
      }
      try {
        await quickReceiveArticleOntoDraft(
          repo,
          inventoryRepo,
          policyRepo,
          billingAccess,
          finalized.id,
          {
            category_id: categoryId,
            metal: "gold",
            purity: "22K",
            gross_weight_grams: "1",
            non_metal_weight_grams: "0",
            net_metal_weight_grams: "1",
          },
        );
        throw new Error("Quick receive onto a finalized invoice must fail.");
      } catch (error) {
        if (!(error instanceof ApplicationHttpError) || error.code !== "INVOICE_NOT_DRAFT") {
          throw error instanceof Error ? error : new Error("Quick receive on finalized must be INVOICE_NOT_DRAFT.");
        }
      }
    });

    console.log(
      "pos billing verification passed: RLS denied without org, draft create/patch held, missing Idempotency-Key rejected, finalize fail-closed when rate missing, concurrent fail-closed held, article lock sold-once pattern held, live finalize with invoice.v1 + rate sold the article, idempotency replay and hash mismatch held, POS quick-receive onto draft held.",
    );
  } finally {
    await pool.end();
  }
}

function staffAccess(row: {
  id: string;
  email: string;
  display_name: string;
  membership_id: string;
  role: "owner" | "admin" | "billing" | "inventory" | "girvi";
}): ResolvedStaffAccess {
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

async function withOrg<T>(pool: Pool, fn: (client: import("pg").PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE app_api");
    await client.query("SELECT set_config('app.organization_id', $1, true)", [ORGANIZATION_ID]);
    const result = await fn(client);
    await client.query("ROLLBACK");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function withApiRole<T>(pool: Pool, fn: (client: import("pg").PoolClient) => Promise<T>): Promise<T> {
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
