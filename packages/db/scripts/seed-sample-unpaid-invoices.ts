import { randomUUID } from "node:crypto";

import { Pool } from "pg";

import {
  createInvoiceDraft,
  finalizeInvoice,
  type ResolvedStaffAccess,
} from "@aabhushan/application";
import {
  INVOICE_V1_POLICY_METHODS,
  kolkataBusinessDate,
  normalizeShopPhone,
  permissionsForRole,
  STAFF_PERMISSION_MAP_VERSION,
} from "@aabhushan/domain";

import { createCalculationPolicyRepository } from "../src/calculation-policy-repository";
import { createInvoiceRepository } from "../src/invoice-repository";

/**
 * Create two finalized unpaid invoices for the Anjali Devi demo customer so
 * Payments → Record payment can be exercised locally.
 *
 * Idempotent: articles SEEDDUE01 / SEEDDUE02 are created once; re-runs skip them.
 * Does not consume ART0000N sample stock.
 *
 * Usage: pnpm seed:sample-unpaid-invoices
 * Prerequisites: pnpm seed:sample-customers (Anjali Devi), catalogue category, active staff.
 */
const ORGANIZATION_ID = "11111111-1111-4111-8111-111111111111";
const BRANCH_ID = "22222222-2222-4222-8222-222222222222";
const ANJALI_PHONE = "9876500003";

const FIXTURES = [
  {
    articleNumber: "SEEDDUE01",
    barcode: "SEEDDUE01",
    netGrams: "2.0000",
    idempotencyKey: "seed-unpaid-SEEDDUE01",
  },
  {
    articleNumber: "SEEDDUE02",
    barcode: "SEEDDUE02",
    netGrams: "1.0000",
    idempotencyKey: "seed-unpaid-SEEDDUE02",
  },
] as const;

type StaffRow = {
  id: string;
  email: string;
  display_name: string;
  membership_id: string;
  role: "owner" | "admin" | "billing" | "inventory" | "girvi";
};

type InvoiceSummary = {
  articleNumber: string;
  status: "created" | "already_present";
  invoiceNumber: string | null;
  amountDueInr: string | null;
  invoiceId: string | null;
};

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

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const client = await pool.connect();
  const summaries: InvoiceSummary[] = [];

  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE app_api");
    await client.query("SELECT set_config('app.organization_id', $1, true)", [ORGANIZATION_ID]);

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
    const staffRow = staff.rows[0];
    if (!staffRow) {
      throw new Error("An active staff membership is required. Invite or seed an owner first.");
    }

    const phone = normalizeShopPhone(ANJALI_PHONE);
    if (phone.kind !== "ok") {
      throw new Error(
        `Demo phone for Anjali Devi could not be normalized: ${phone.kind === "invalid" ? phone.message : "empty"}`,
      );
    }
    const customer = await client.query<{ id: string; display_name: string; phone_display: string | null }>(
      `
      SELECT id, display_name, phone_display
      FROM app.customers
      WHERE organization_id = $1 AND phone_normalized = $2
      LIMIT 1
      `,
      [ORGANIZATION_ID, phone.normalized],
    );
    const customerRow = customer.rows[0];
    if (!customerRow) {
      throw new Error(
        "Anjali Devi (9876500003) was not found. Run `pnpm seed:sample-customers` first.",
      );
    }

    const category = await client.query<{ id: string }>(
      `SELECT id FROM app.catalogue_categories WHERE organization_id = $1 ORDER BY name ASC LIMIT 1`,
      [ORGANIZATION_ID],
    );
    const categoryId = category.rows[0]?.id;
    if (!categoryId) {
      throw new Error("A catalogue category is required before seeding unpaid invoices.");
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

    const invoiceRepo = createInvoiceRepository(client, ORGANIZATION_ID, BRANCH_ID);
    const access = staffAccess(staffRow);
    const businessDate = kolkataBusinessDate();

    for (const fixture of FIXTURES) {
      const existing = await client.query<{ id: string; status: string }>(
        `
        SELECT id, status
        FROM app.articles
        WHERE organization_id = $1 AND article_number = $2
        LIMIT 1
        `,
        [ORGANIZATION_ID, fixture.articleNumber],
      );
      const existingArticle = existing.rows[0];

      if (existingArticle) {
        const linked = await client.query<{
          id: string;
          invoice_number: string | null;
          amount_due_inr: string;
        }>(
          `
          SELECT i.id, i.invoice_number, i.amount_due_inr::text
          FROM app.invoice_lines il
          JOIN app.invoices i ON i.id = il.invoice_id AND i.organization_id = il.organization_id
          WHERE il.organization_id = $1 AND il.article_id = $2
          ORDER BY i.created_at DESC
          LIMIT 1
          `,
          [ORGANIZATION_ID, existingArticle.id],
        );
        const invoice = linked.rows[0];
        summaries.push({
          articleNumber: fixture.articleNumber,
          status: "already_present",
          invoiceNumber: invoice?.invoice_number ?? null,
          amountDueInr: invoice?.amount_due_inr ?? null,
          invoiceId: invoice?.id ?? null,
        });
        continue;
      }

      const article = await client.query<{ id: string }>(
        `
        INSERT INTO app.articles (
          organization_id, branch_id, article_number, category_id, metal, purity,
          gross_weight_grams, non_metal_weight_grams, net_metal_weight_grams,
          receipt_business_date, status, barcode
        )
        VALUES (
          $1, $2, $3, $4, 'gold', '22K',
          $5::numeric, 0.0000, $5::numeric,
          $6::date, 'available', $7
        )
        RETURNING id
        `,
        [
          ORGANIZATION_ID,
          BRANCH_ID,
          fixture.articleNumber,
          categoryId,
          fixture.netGrams,
          businessDate,
          fixture.barcode,
        ],
      );
      const articleId = article.rows[0]?.id;
      if (!articleId) {
        throw new Error(`Failed to insert article ${fixture.articleNumber}.`);
      }

      await client.query(
        `
        INSERT INTO app.inventory_movements (
          organization_id, article_id, movement_type, from_status, to_status, actor_staff_user_id
        )
        VALUES ($1, $2, 'receipt', NULL, 'available', $3)
        `,
        [ORGANIZATION_ID, articleId, staffRow.id],
      );

      const draft = await createInvoiceDraft(invoiceRepo, policyRepo, access, {
        customer_id: customerRow.id,
        business_date: businessDate,
        article_ids: [articleId],
      });
      if (draft.quote_error) {
        throw new Error(
          `Draft quote failed for ${fixture.articleNumber}: ${draft.quote_error.code} ${draft.quote_error.message}`,
        );
      }

      const finalized = await finalizeInvoice(
        invoiceRepo,
        policyRepo,
        access,
        draft.id,
        { quote_version: draft.quote_version },
        fixture.idempotencyKey,
      );
      if (finalized.status !== "finalized" || !finalized.invoice_number) {
        throw new Error(`Finalize did not produce a numbered invoice for ${fixture.articleNumber}.`);
      }
      if (finalized.amount_due_inr === "0.00") {
        throw new Error(
          `Expected unpaid due for ${fixture.articleNumber}, got amount_due_inr ${finalized.amount_due_inr}.`,
        );
      }

      summaries.push({
        articleNumber: fixture.articleNumber,
        status: "created",
        invoiceNumber: finalized.invoice_number,
        amountDueInr: finalized.amount_due_inr,
        invoiceId: finalized.id,
      });
    }

    await client.query("COMMIT");

    console.log(
      JSON.stringify(
        {
          customer: {
            display_name: customerRow.display_name,
            phone: customerRow.phone_display ?? ANJALI_PHONE,
            id: customerRow.id,
          },
          invoices: summaries,
          next_step: "Open Payments → Record payment → Anjali Devi",
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
