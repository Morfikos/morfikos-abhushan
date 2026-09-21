/**
 * Spec 15 reconciliation: seeded fixtures must match hand-computed dashboard tiles.
 * Rows use 1999-03 dates so they cannot collide with live shop activity. The
 * organization-context transaction rolls back after assertions.
 */
import { randomUUID } from "node:crypto";

import { dashboardSectionsForRole, getDashboardReport, type ResolvedStaffAccess } from "@aabhushan/application";
import { permissionsForRole, STAFF_PERMISSION_MAP_VERSION } from "@aabhushan/domain";

import { createPool, createReportsRepository, withOrganizationContext } from "../src/index.ts";

const ORGANIZATION_ID = "11111111-1111-4111-8111-111111111111";
const BRANCH_ID = "22222222-2222-4222-8222-222222222222";

class VerifyRollback extends Error {
  constructor() {
    super("verify-reports rollback");
    this.name = "VerifyRollback";
  }
}

function asMoney(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return "0.00";
  }
  const raw = typeof value === "number" ? value.toFixed(2) : value;
  const negative = raw.startsWith("-");
  const body = negative ? raw.slice(1) : raw;
  const [whole = "0", fraction = ""] = body.split(".");
  return `${negative ? "-" : ""}${whole}.${fraction.padEnd(2, "0").slice(0, 2)}`;
}

function moneyAtLeast(actual: string | null | undefined, minimum: string): boolean {
  return Number.parseFloat(asMoney(actual)) + 1e-9 >= Number.parseFloat(minimum);
}

function accessFor(
  role: ResolvedStaffAccess["membership"]["role"],
  staff: { id: string; email: string; display_name: string },
): ResolvedStaffAccess {
  return {
    staff_user_id: staff.id,
    email: staff.email,
    display_name: staff.display_name,
    membership: {
      id: randomUUID(),
      organization_id: ORGANIZATION_ID,
      branch_id: BRANCH_ID,
      role,
      status: "active",
    },
    permissions: permissionsForRole(role),
    permission_map_version: STAFF_PERMISSION_MAP_VERSION,
    authUserId: randomUUID(),
  };
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  const pool = createPool(databaseUrl);
  const suffix = randomUUID().slice(0, 8).toUpperCase();

  try {
    await withOrganizationContext(pool, { organizationId: ORGANIZATION_ID }, async (client) => {
      const staff = await client.query<{ id: string; email: string; display_name: string }>(
        `SELECT id, email, display_name FROM app.staff_users ORDER BY created_at ASC LIMIT 1`,
      );
      const staffRow = staff.rows[0];
      if (!staffRow) {
        throw new Error("Need a staff user to seed report fixtures.");
      }
      const staffUserId = staffRow.id;
      const customer = await client.query<{ id: string }>(
        `SELECT id FROM app.customers WHERE organization_id = $1 ORDER BY created_at ASC LIMIT 1`,
        [ORGANIZATION_ID],
      );
      const customerId = customer.rows[0]?.id;
      if (!customerId) {
        throw new Error("Need a customer to seed report fixtures.");
      }
      const category = await client.query<{ id: string }>(
        `SELECT id FROM app.catalogue_categories WHERE organization_id = $1 ORDER BY created_at ASC LIMIT 1`,
        [ORGANIZATION_ID],
      );
      const categoryId = category.rows[0]?.id;
      if (!categoryId) {
        throw new Error("Need a catalogue category.");
      }
      const policy = await client.query<{ version: string }>(
        `
        SELECT version FROM app.girvi_calculation_policies
        WHERE organization_id = $1 AND status = 'approved'
        ORDER BY approved_at DESC LIMIT 1
        `,
        [ORGANIZATION_ID],
      );
      const policyVersion = policy.rows[0]?.version ?? null;

      const invoiceId = randomUUID();
      const paymentId = randomUUID();
      const refundId = randomUUID();
      const laterPaymentId = randomUUID();
      const reversedRefundId = randomUUID();
      const articleId = randomUUID();
      const girviId = randomUUID();
      const stockCountId = randomUUID();

      await client.query(
        `
        INSERT INTO app.articles (
          id, organization_id, branch_id, article_number, category_id, metal, purity,
          gross_weight_grams, non_metal_weight_grams, net_metal_weight_grams,
          receipt_business_date, status
        ) VALUES ($1, $2, $3, $4, $5, 'gold', '22K', 10, 0, 10, '1999-03-01', 'available')
        `,
        [articleId, ORGANIZATION_ID, BRANCH_ID, `RPT-${suffix}`, categoryId],
      );

      await client.query(
        `
        INSERT INTO app.invoices (
          id, organization_id, branch_id, invoice_number, customer_id, status, business_date,
          quote_version, calculation_policy_version, grand_total_inr, amount_paid_inr, amount_due_inr,
          finalized_at, finalized_by_staff_user_id
        ) VALUES (
          $1, $2, $3, $4, $5, 'finalized', '1999-03-02',
          1, 'invoice.v1', 1000.00, 650.00, 150.00,
          timestamptz '1999-03-02 12:00:00+05:30', $6
        )
        `,
        [invoiceId, ORGANIZATION_ID, BRANCH_ID, `INV-RPT-${suffix}`, customerId, staffUserId],
      );

      await client.query(
        `
        INSERT INTO app.credit_notes (
          organization_id, branch_id, credit_note_number, invoice_id, amount_inr, issued_at
        ) VALUES (
          $1, $2, $3, $4, 150.00, timestamptz '1999-03-03 12:00:00+05:30'
        )
        `,
        [ORGANIZATION_ID, BRANCH_ID, `CN-RPT-${suffix}`, invoiceId],
      );
      await client.query(
        `
        INSERT INTO app.credit_notes (
          organization_id, branch_id, credit_note_number, invoice_id, amount_inr, issued_at
        ) VALUES (
          $1, $2, $3, $4, 50.00, timestamptz '1999-03-12 12:00:00+05:30'
        )
        `,
        [ORGANIZATION_ID, BRANCH_ID, `CN-RPT-LATER-${suffix}`, invoiceId],
      );

      await client.query(
        `
        INSERT INTO app.payments (
          id, organization_id, branch_id, customer_id, method, amount_inr, status, kind,
          received_business_date, received_by_staff_user_id
        ) VALUES (
          $1, $2, $3, $4, 'cash', 600.00, 'posted', 'collection',
          '1999-03-02', $5
        )
        `,
        [paymentId, ORGANIZATION_ID, BRANCH_ID, customerId, staffUserId],
      );
      await client.query(
        `
        INSERT INTO app.payments (
          id, organization_id, branch_id, customer_id, method, amount_inr, status, kind,
          received_business_date, received_by_staff_user_id, reverses_payment_id
        ) VALUES (
          $1, $2, $3, $4, 'cash', 50.00, 'posted', 'refund',
          '1999-03-04', $5, $6
        )
        `,
        [refundId, ORGANIZATION_ID, BRANCH_ID, customerId, staffUserId, paymentId],
      );
      await client.query(
        `
        INSERT INTO app.payments (
          id, organization_id, branch_id, customer_id, method, amount_inr, status, kind,
          received_business_date, received_by_staff_user_id
        ) VALUES (
          $1, $2, $3, $4, 'cash', 100.00, 'posted', 'collection',
          '1999-03-10', $5
        )
        `,
        [laterPaymentId, ORGANIZATION_ID, BRANCH_ID, customerId, staffUserId],
      );
      await client.query(
        `
        INSERT INTO app.payments (
          id, organization_id, branch_id, customer_id, method, amount_inr, status, kind,
          received_business_date, received_by_staff_user_id, reverses_payment_id
        ) VALUES (
          $1, $2, $3, $4, 'cash', 80.00, 'reversed', 'refund',
          '1999-03-04', $5, $6
        )
        `,
        [reversedRefundId, ORGANIZATION_ID, BRANCH_ID, customerId, staffUserId, paymentId],
      );
      await client.query(
        `
        INSERT INTO app.payment_allocations (organization_id, payment_id, invoice_id, amount_inr)
        VALUES
          ($1, $2, $5, 600.00),
          ($1, $3, $5, 50.00),
          ($1, $4, $5, 100.00)
        `,
        [ORGANIZATION_ID, paymentId, refundId, laterPaymentId, invoiceId],
      );

      await client.query(
        `
        INSERT INTO app.girvi_accounts (
          id, organization_id, branch_id, account_number, customer_id, status, principal_inr,
          start_business_date, maturity_business_date, calculation_policy_version,
          principal_outstanding_inr, interest_outstanding_inr,
          activated_at, activated_by_staff_user_id
        ) VALUES (
          $1, $2, $3, $4, $5, 'active', 5000.00,
          '1999-03-01', '1999-12-01', $6,
          4000.00, 80.00,
          timezone('utc', now()), $7
        )
        `,
        [girviId, ORGANIZATION_ID, BRANCH_ID, `GV-RPT-${suffix}`, customerId, policyVersion, staffUserId],
      );
      await client.query(
        `
        INSERT INTO app.girvi_financial_events (
          organization_id, girvi_account_id, event_type, effective_business_date,
          principal_delta_inr, interest_delta_inr, amount_inr, actor_staff_user_id, event_key
        ) VALUES
          ($1, $2, 'disbursement', '1999-03-01', 5000.00, 0, 5000.00, $3, $4),
          ($1, $2, 'repayment', '1999-03-05', -1000.00, -200.00, 1200.00, $3, $5)
        `,
        [ORGANIZATION_ID, girviId, staffUserId, `rpt-disb-${suffix}`, `rpt-repay-${suffix}`],
      );

      await client.query(
        `
        INSERT INTO app.stock_counts (
          id, organization_id, branch_id, counted_on, status, actor_staff_user_id
        ) VALUES ($1, $2, $3, '1999-03-03', 'reviewed', $4)
        `,
        [stockCountId, ORGANIZATION_ID, BRANCH_ID, staffUserId],
      );
      await client.query(
        `
        INSERT INTO app.stock_count_lines (
          organization_id, stock_count_id, article_id, expected_status, counted_status, has_discrepancy
        ) VALUES ($1, $2, $3, 'available', 'missing', true)
        `,
        [ORGANIZATION_ID, stockCountId, articleId],
      );

      await client.query(
        `
        INSERT INTO app.notifications (
          organization_id, customer_id, purpose, status, dedupe_key, created_at
        ) VALUES
          ($1, $2, 'due_reminder', 'failed', $3, timestamptz '1999-03-03 10:00:00+05:30'),
          ($1, $2, 'due_reminder', 'unknown', $4, timestamptz '1999-03-03 11:00:00+05:30')
        `,
        [ORGANIZATION_ID, customerId, `rpt-fail-${suffix}`, `rpt-unk-${suffix}`],
      );

      const repo = createReportsRepository(client, ORGANIZATION_ID);
      const range = { from: "1999-03-01", to: "1999-03-05" };
      const owner = accessFor("owner", staffRow);
      const dashboard = await getDashboardReport(owner, repo, {
        business_date_from: range.from,
        business_date_to: range.to,
      });
      const fixtureGirvi = await client.query<{
        principal_outstanding_inr: string;
        interest_outstanding_inr: string;
      }>(
        `
        SELECT principal_outstanding_inr::text, interest_outstanding_inr::text
        FROM app.girvi_accounts
        WHERE id = $1
        `,
        [girviId],
      );

      if (!dashboard.sales || dashboard.sales.summary.gross_sales_inr !== "1000.00") {
        throw new Error(`Sales gross expected 1000.00, got ${dashboard.sales?.summary.gross_sales_inr ?? "null"}`);
      }
      if (dashboard.sales.summary.returns_inr !== "150.00") {
        throw new Error(`Returns expected 150.00, got ${dashboard.sales.summary.returns_inr}`);
      }
      if (dashboard.sales.summary.net_sales_inr !== "850.00") {
        throw new Error(`Net sales expected 850.00, got ${dashboard.sales.summary.net_sales_inr}`);
      }
      if (dashboard.sales.summary.invoice_count !== 1) {
        throw new Error(`Invoice count expected 1, got ${String(dashboard.sales.summary.invoice_count)}`);
      }
      if (!dashboard.collections || dashboard.collections.total_net_collected_inr !== "550.00") {
        throw new Error(`Collections expected 550.00, got ${dashboard.collections?.total_net_collected_inr ?? "null"}`);
      }
      if (!dashboard.sales_dues || dashboard.sales_dues.amount_due_inr !== "300.00") {
        throw new Error(`Dues expected 300.00, got ${dashboard.sales_dues?.amount_due_inr ?? "null"}`);
      }
      const fixtureDue = dashboard.sales_dues.open_invoices.find((row) => row.invoice_id === invoiceId);
      if (!fixtureDue || fixtureDue.amount_due_inr !== "300.00") {
        throw new Error(`As-of dues row expected 300.00, got ${fixtureDue?.amount_due_inr ?? "missing"}`);
      }
      const cachedDue = await client.query<{ amount_due_inr: string }>(
        `SELECT amount_due_inr::text FROM app.invoices WHERE id = $1`,
        [invoiceId],
      );
      if (asMoney(cachedDue.rows[0]?.amount_due_inr) !== "150.00") {
        throw new Error(`Cached due expected 150.00 after later payment and credit, got ${cachedDue.rows[0]?.amount_due_inr ?? "null"}`);
      }
      const todayDue = await client.query<{ amount_due_inr: string }>(
        `
        SELECT amount_due_inr::text
        FROM app.sales_dues_as_of($1, (timezone('Asia/Kolkata', now()))::date)
        WHERE invoice_id = $2
        `,
        [ORGANIZATION_ID, invoiceId],
      );
      if (asMoney(todayDue.rows[0]?.amount_due_inr) !== "150.00") {
        throw new Error(`As-of today due expected 150.00 to match the cache, got ${todayDue.rows[0]?.amount_due_inr ?? "null"}`);
      }
      const shopDues = await client.query<{ reconstructed: string; cached: string }>(
        `
        SELECT
          COALESCE((
            SELECT sum(amount_due_inr)
            FROM app.sales_dues_as_of($1, (timezone('Asia/Kolkata', now()))::date)
          ), 0)::text AS reconstructed,
          COALESCE((
            SELECT sum(i.amount_due_inr)
            FROM app.invoices i
            WHERE i.organization_id = $1
              AND i.status = 'finalized'
              AND i.amount_due_inr > 0
              AND i.business_date <= (timezone('Asia/Kolkata', now()))::date
              AND i.finalized_at IS NOT NULL
              AND (timezone('Asia/Kolkata', i.finalized_at))::date <= (timezone('Asia/Kolkata', now()))::date
          ), 0)::text AS cached
        `,
        [ORGANIZATION_ID],
      );
      if (asMoney(shopDues.rows[0]?.reconstructed) !== asMoney(shopDues.rows[0]?.cached)) {
        throw new Error(
          `As-of today dues ${shopDues.rows[0]?.reconstructed ?? "null"} must match cached open dues ${shopDues.rows[0]?.cached ?? "null"}.`,
        );
      }
      if (!dashboard.girvi || dashboard.girvi.activity.disbursed_inr !== "5000.00") {
        throw new Error(`Girvi disbursed expected 5000.00, got ${dashboard.girvi?.activity.disbursed_inr ?? "null"}`);
      }
      if (dashboard.girvi.activity.principal_recovered_inr !== "1000.00") {
        throw new Error(`Principal recovered expected 1000.00, got ${dashboard.girvi.activity.principal_recovered_inr}`);
      }
      if (dashboard.girvi.activity.interest_received_inr !== "200.00") {
        throw new Error(`Interest received expected 200.00, got ${dashboard.girvi.activity.interest_received_inr}`);
      }
      if (asMoney(fixtureGirvi.rows[0]?.principal_outstanding_inr) !== "4000.00") {
        throw new Error(`Fixture Girvi principal expected 4000.00, got ${fixtureGirvi.rows[0]?.principal_outstanding_inr ?? "null"}`);
      }
      if (asMoney(fixtureGirvi.rows[0]?.interest_outstanding_inr) !== "80.00") {
        throw new Error(`Fixture Girvi interest expected 80.00, got ${fixtureGirvi.rows[0]?.interest_outstanding_inr ?? "null"}`);
      }
      if (!moneyAtLeast(dashboard.girvi.position.principal_outstanding_inr, "4000.00")) {
        throw new Error(`Girvi principal tile must include the fixture 4000.00, got ${dashboard.girvi.position.principal_outstanding_inr}`);
      }
      if (dashboard.girvi.position.interest_availability === "available") {
        if (!moneyAtLeast(dashboard.girvi.position.interest_outstanding_inr, "80.00")) {
          throw new Error(`Girvi interest tile must include the fixture 80.00, got ${dashboard.girvi.position.interest_outstanding_inr ?? "null"}`);
        }
      } else if (dashboard.girvi.position.interest_availability !== "unavailable") {
        throw new Error("Interest must be available or Unavailable, never a silent ₹0.");
      } else if (dashboard.girvi.position.interest_outstanding_inr !== null) {
        throw new Error("Unavailable interest must omit the rupee amount.");
      }
      if (!dashboard.operations || dashboard.operations.stock_discrepancy_count < 1) {
        throw new Error("Expected at least one stock discrepancy in range.");
      }
      if (dashboard.operations.failed_notification_count < 1 || dashboard.operations.unknown_notification_count < 1) {
        throw new Error("Expected failed and unknown notifications in range.");
      }
      if (!dashboard.inventory || dashboard.inventory.available_article_count < 1) {
        throw new Error("Expected the fixture article in available inventory.");
      }

      const billing = await getDashboardReport(accessFor("billing", staffRow), repo, {
        business_date_from: range.from,
        business_date_to: range.to,
      });
      if (billing.girvi !== null || billing.inventory !== null) {
        throw new Error("Billing dashboard must omit girvi and inventory JSON.");
      }
      if (!billing.sales || !billing.collections) {
        throw new Error("Billing dashboard must include sales and collections.");
      }

      const inventoryRole = await getDashboardReport(accessFor("inventory", staffRow), repo, {
        business_date_from: range.from,
        business_date_to: range.to,
      });
      if (inventoryRole.sales !== null || inventoryRole.girvi !== null) {
        throw new Error("Inventory dashboard must omit sales and girvi JSON.");
      }

      const csv = await repo.getSales(range);
      if (csv.summary.net_sales_inr !== dashboard.sales.summary.net_sales_inr) {
        throw new Error("Export sales definition drifted from the dashboard tile.");
      }

      const duesRows = await repo.listSalesDues(range);
      const duesExport = duesRows.reduce((sum, row) => sum + Number(row.amount_due_inr), 0);
      if (duesExport.toFixed(2) !== dashboard.sales_dues.amount_due_inr) {
        throw new Error(`Dues export ${duesExport.toFixed(2)} drifted from tile ${dashboard.sales_dues.amount_due_inr}.`);
      }

      if (dashboardSectionsForRole("girvi").includes("sales")) {
        throw new Error("Girvi role must not receive the sales section.");
      }

      throw new VerifyRollback();
    });
  } catch (error) {
    if (error instanceof VerifyRollback) {
      console.log(
        JSON.stringify(
          {
            ok: true,
            sales_net_inr: "850.00",
            collections_inr: "550.00",
            dues_inr: "300.00",
            girvi_disbursed_inr: "5000.00",
            principal_recovered_inr: "1000.00",
            interest_received_inr: "200.00",
          },
          null,
          2,
        ),
      );
      return;
    }
    throw error;
  } finally {
    await pool.end();
  }
}

await main();
