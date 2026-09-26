/**
 * Spec 13 verification: a finalized invoice stays finalized when PDF generation fails,
 * document retry is idempotent on source_event_key, receipt retry is idempotent, and a
 * new outbox event type (girvi.released) can insert a pending document row.
 *
 * Usage: pnpm --filter @aabhushan/db verify:documents
 */
import { createHash, randomUUID } from "node:crypto";

import { Client } from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

async function main(): Promise<void> {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN");
    const org = await client.query<{ id: string; branch_id: string }>(
      `
      SELECT o.id, b.id AS branch_id
      FROM app.organizations o
      JOIN app.branches b ON b.organization_id = o.id
      ORDER BY o.created_at ASC
      LIMIT 1
      `,
    );
    const organizationId = org.rows[0]?.id;
    const branchId = org.rows[0]?.branch_id;
    if (!organizationId || !branchId) {
      throw new Error("No organization/branch found");
    }
    await client.query("SELECT set_config('app.organization_id', $1, true)", [organizationId]);

    const staff = await client.query<{ id: string }>(
      `
      SELECT su.id
      FROM app.staff_users su
      JOIN app.staff_memberships sm ON sm.staff_user_id = su.id
      WHERE sm.organization_id = $1 AND sm.status = 'active'
      LIMIT 1
      `,
      [organizationId],
    );
    const staffUserId = staff.rows[0]?.id;
    if (!staffUserId) {
      throw new Error("No active staff user found");
    }

    const customer = await client.query<{ id: string }>(
      `
      INSERT INTO app.customers (organization_id, display_name, phone_normalized, phone_display, is_active)
      VALUES ($1, 'Doc Verify Customer', NULL, NULL, true)
      RETURNING id
      `,
      [organizationId],
    );
    const customerId = customer.rows[0]!.id;
    const invoiceId = randomUUID();

    await client.query(
      `
      INSERT INTO app.invoices (
        id, organization_id, branch_id, customer_id, status, business_date,
        quote_version, metal_value_inr, making_charges_inr, wastage_inr, stone_charges_inr,
        discount_inr, tax_inr, round_off_inr, grand_total_inr, amount_paid_inr, amount_due_inr,
        invoice_number, finalized_at, finalized_by_staff_user_id, calculation_policy_version
      ) VALUES (
        $1, $2, $3, $4, 'finalized', CURRENT_DATE,
        1, 0, 0, 0, 0, 0, 0, 0, 100.00, 0, 100.00,
        $5, timezone('utc', now()), $6, 'invoice.v1'
      )
      `,
      [invoiceId, organizationId, branchId, customerId, `DOC-VERIFY-${invoiceId.slice(0, 8)}`, staffUserId],
    );

    const eventKey = `invoice.finalized:${invoiceId}`;
    const docInsert = await client.query<{ id: string; status: string }>(
      `
      INSERT INTO app.documents (
        organization_id, document_type, template_version, status, source_event_key, owner_type, owner_id, last_error_code
      ) VALUES ($1, 'invoice_pdf', 'invoice.pdf.v2', 'failed', $2, 'invoice', $3, 'PDF_GENERATION_FAILED')
      ON CONFLICT (organization_id, source_event_key) DO UPDATE SET
        status = 'failed',
        last_error_code = 'PDF_GENERATION_FAILED',
        updated_at = timezone('utc', now())
      RETURNING id, status
      `,
      [organizationId, eventKey, invoiceId],
    );

    const stillFinalized = await client.query<{ status: string }>(
      `SELECT status FROM app.invoices WHERE organization_id = $1 AND id = $2`,
      [organizationId, invoiceId],
    );
    if (stillFinalized.rows[0]?.status !== "finalized") {
      throw new Error("Invoice status changed when document failed — sale must survive PDF failure");
    }

    const retry = await client.query<{ id: string; status: string }>(
      `
      INSERT INTO app.documents (
        organization_id, document_type, template_version, status, source_event_key, owner_type, owner_id
      ) VALUES ($1, 'invoice_pdf', 'invoice.pdf.v2', 'pending', $2, 'invoice', $3)
      ON CONFLICT (organization_id, source_event_key) DO UPDATE SET
        status = 'pending',
        stored_object_id = NULL,
        last_error_code = NULL,
        updated_at = timezone('utc', now())
      RETURNING id, status
      `,
      [organizationId, eventKey, invoiceId],
    );
    if (retry.rows[0]?.id !== docInsert.rows[0]?.id) {
      throw new Error("Retry must reuse the same document row via source_event_key");
    }
    if (retry.rows[0]?.status !== "pending") {
      throw new Error("Retry must reset document status to pending");
    }

    const paymentId = randomUUID();
    await client.query(
      `
      INSERT INTO app.payments (
        id, organization_id, branch_id, customer_id, method, amount_inr, status, kind,
        received_business_date, received_by_staff_user_id
      ) VALUES (
        $1, $2, $3, $4, 'cash', 50.00, 'posted', 'collection', CURRENT_DATE, $5
      )
      `,
      [paymentId, organizationId, branchId, customerId, staffUserId],
    );
    await client.query(
      `
      INSERT INTO app.receipts (organization_id, branch_id, payment_id, receipt_number)
      VALUES ($1, $2, $3, $4)
      `,
      [organizationId, branchId, paymentId, `RCPT-VERIFY-${paymentId.slice(0, 8)}`],
    );

    const receiptEventKey = `receipt.requested:${paymentId}`;
    const receiptDoc = await client.query<{ id: string }>(
      `
      INSERT INTO app.documents (
        organization_id, document_type, template_version, status, source_event_key, owner_type, owner_id, last_error_code
      ) VALUES ($1, 'receipt_pdf', 'receipt.pdf.v3', 'failed', $2, 'receipt', $3, 'PDF_GENERATION_FAILED')
      ON CONFLICT (organization_id, source_event_key) DO UPDATE SET
        status = 'failed',
        last_error_code = 'PDF_GENERATION_FAILED',
        updated_at = timezone('utc', now())
      RETURNING id
      `,
      [organizationId, receiptEventKey, paymentId],
    );
    const receiptRetry = await client.query<{ id: string; status: string }>(
      `
      INSERT INTO app.documents (
        organization_id, document_type, template_version, status, source_event_key, owner_type, owner_id
      ) VALUES ($1, 'receipt_pdf', 'receipt.pdf.v3', 'pending', $2, 'receipt', $3)
      ON CONFLICT (organization_id, source_event_key) DO UPDATE SET
        status = 'pending',
        stored_object_id = NULL,
        last_error_code = NULL,
        updated_at = timezone('utc', now())
      RETURNING id, status
      `,
      [organizationId, receiptEventKey, paymentId],
    );
    if (receiptRetry.rows[0]?.id !== receiptDoc.rows[0]?.id) {
      throw new Error("Receipt retry must reuse the same document row via source_event_key");
    }
    if (receiptRetry.rows[0]?.status !== "pending") {
      throw new Error("Receipt retry must reset document status to pending");
    }

    const girviAccountId = randomUUID();
    const girviEventKey = `girvi.released:${girviAccountId}`;
    const girviDoc = await client.query<{ id: string; status: string; document_type: string }>(
      `
      INSERT INTO app.documents (
        organization_id, document_type, template_version, status, source_event_key, owner_type, owner_id
      ) VALUES ($1, 'girvi_ack_pdf', 'girvi_ack.pdf.v2', 'pending', $2, 'girvi', $3)
      ON CONFLICT (organization_id, source_event_key) DO UPDATE SET
        status = 'pending',
        updated_at = timezone('utc', now())
      RETURNING id, status, document_type
      `,
      [organizationId, girviEventKey, girviAccountId],
    );
    if (girviDoc.rows[0]?.status !== "pending" || girviDoc.rows[0]?.document_type !== "girvi_ack_pdf") {
      throw new Error("girvi.released must be able to insert a pending girvi_ack_pdf document");
    }

    const checksum = createHash("sha256").update(randomUUID()).digest("hex");
    await client.query(
      `
      INSERT INTO app.stored_objects (
        organization_id, bucket, object_key, checksum_sha256, content_type, byte_size,
        owner_type, owner_id, visibility, upload_confirmed_at
      ) VALUES ($1, 'shop-assets', $2, $3, 'image/jpeg', 12, 'article', $4, 'private', NULL)
      `,
      [organizationId, `${organizationId}/article/${randomUUID()}/probe.jpg`, checksum, randomUUID()],
    );

    console.log(
      "verify:documents passed — sale stays finalized on PDF failure; invoice/receipt retry idempotent; girvi.released pending insert ok",
    );
    await client.query("ROLLBACK");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
