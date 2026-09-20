import type { PoolClient } from "pg";

import type {
  CreditNote,
  InvoiceCorrections,
  InvoiceReturn,
  InvoiceReturnAcceptResult,
} from "@aabhushan/contracts";
import type { ReturnsRepository } from "@aabhushan/application";

import { asDecimalString, asIsoDateTime } from "./pg-values";
import { createPaymentRepository } from "./payment-repository";

type InvoiceLockRow = {
  id: string;
  invoice_number: string | null;
  customer_id: string;
  status: string;
  grand_total_inr: string | number;
};

type LineRow = {
  id: string;
  article_id: string;
  article_number: string;
  description: string;
  line_total_inr: string | number;
};

type ArticleLockRow = {
  id: string;
  article_number: string;
  status: string;
  row_version: number;
  category_name: string;
};

type ReturnRow = {
  id: string;
  invoice_id: string;
  invoice_number: string | null;
  invoice_line_id: string;
  article_id: string;
  article_number: string;
  article_description: string;
  status: string;
  reason: string;
  accepted_by_staff_user_id: string;
  created_at: Date;
};

type CreditRow = {
  id: string;
  credit_note_number: string;
  invoice_id: string;
  invoice_number: string | null;
  return_id: string | null;
  amount_inr: string | number;
  issued_at: Date;
};

function mapReturn(row: ReturnRow): InvoiceReturn {
  return {
    id: row.id,
    invoice_id: row.invoice_id,
    invoice_number: row.invoice_number,
    invoice_line_id: row.invoice_line_id,
    article_id: row.article_id,
    article_number: row.article_number,
    article_description: row.article_description,
    status: row.status === "rejected" ? "rejected" : "accepted",
    reason: row.reason,
    accepted_by_staff_user_id: row.accepted_by_staff_user_id,
    created_at: asIsoDateTime(row.created_at),
  };
}

function mapCredit(row: CreditRow): CreditNote {
  return {
    id: row.id,
    credit_note_number: row.credit_note_number,
    invoice_id: row.invoice_id,
    invoice_number: row.invoice_number,
    return_id: row.return_id,
    amount_inr: asDecimalString(row.amount_inr),
    issued_at: asIsoDateTime(row.issued_at),
  };
}

const returnSelect = `
  SELECT
    r.id, r.invoice_id, i.invoice_number, r.invoice_line_id, r.article_id,
    l.article_number, l.description AS article_description,
    r.status, r.reason, r.accepted_by_staff_user_id, r.created_at
  FROM app.invoice_returns r
  JOIN app.invoices i ON i.id = r.invoice_id AND i.organization_id = r.organization_id
  JOIN app.invoice_lines l ON l.id = r.invoice_line_id AND l.organization_id = r.organization_id
`;

const creditSelect = `
  SELECT
    cn.id, cn.credit_note_number, cn.invoice_id, i.invoice_number,
    cn.return_id, cn.amount_inr, cn.issued_at
  FROM app.credit_notes cn
  JOIN app.invoices i ON i.id = cn.invoice_id AND i.organization_id = cn.organization_id
`;

export function createReturnsRepository(
  client: PoolClient,
  organizationId: string,
  branchId: string,
): ReturnsRepository {
  const payments = createPaymentRepository(client, organizationId, branchId);

  async function loadReturn(returnId: string): Promise<InvoiceReturn | null> {
    const result = await client.query<ReturnRow>(
      `${returnSelect} WHERE r.organization_id = $1 AND r.id = $2`,
      [organizationId, returnId],
    );
    const row = result.rows[0];
    return row ? mapReturn(row) : null;
  }

  async function loadCreditForReturn(returnId: string): Promise<CreditNote | null> {
    const result = await client.query<CreditRow>(
      `${creditSelect} WHERE cn.organization_id = $1 AND cn.return_id = $2`,
      [organizationId, returnId],
    );
    const row = result.rows[0];
    return row ? mapCredit(row) : null;
  }

  return {
    async lockFinalizedInvoice(invoiceId) {
      const locked = await client.query<InvoiceLockRow>(
        `
        SELECT id, invoice_number, customer_id, status, grand_total_inr
        FROM app.invoices
        WHERE organization_id = $1 AND id = $2
        FOR UPDATE
        `,
        [organizationId, invoiceId],
      );
      const invoice = locked.rows[0];
      if (!invoice) {
        return null;
      }
      const lines = await client.query<LineRow>(
        `
        SELECT id, article_id, article_number, description, line_total_inr
        FROM app.invoice_lines
        WHERE organization_id = $1 AND invoice_id = $2
        ORDER BY line_no ASC
        `,
        [organizationId, invoiceId],
      );
      return {
        id: invoice.id,
        invoiceNumber: invoice.invoice_number,
        customerId: invoice.customer_id,
        status: invoice.status,
        grandTotalInr: asDecimalString(invoice.grand_total_inr),
        lines: lines.rows.map((row) => ({
          id: row.id,
          articleId: row.article_id,
          articleNumber: row.article_number,
          description: row.description,
          lineTotalInr: asDecimalString(row.line_total_inr),
        })),
      };
    },

    async lockArticle(articleId) {
      const result = await client.query<ArticleLockRow>(
        `
        SELECT
          a.id, a.article_number, a.status, a.row_version,
          COALESCE(cc.name, 'Article') AS category_name
        FROM app.articles a
        LEFT JOIN app.catalogue_categories cc
          ON cc.id = a.category_id AND cc.organization_id = a.organization_id
        WHERE a.organization_id = $1 AND a.id = $2
        FOR UPDATE OF a
        `,
        [organizationId, articleId],
      );
      const row = result.rows[0];
      if (!row) {
        return null;
      }
      return {
        id: row.id,
        articleNumber: row.article_number,
        description: `${row.category_name} · ${row.article_number}`,
        status: row.status,
        rowVersion: row.row_version,
      };
    },

    async findAcceptedReturnForLine(invoiceLineId) {
      const result = await client.query<{ id: string }>(
        `
        SELECT id
        FROM app.invoice_returns
        WHERE organization_id = $1 AND invoice_line_id = $2 AND status = 'accepted'
        LIMIT 1
        `,
        [organizationId, invoiceLineId],
      );
      return result.rows[0] ?? null;
    },

    async creditedTotal(invoiceId) {
      const result = await client.query<{ total: string | number }>(
        `
        SELECT COALESCE(sum(amount_inr), 0) AS total
        FROM app.credit_notes
        WHERE organization_id = $1 AND invoice_id = $2
        `,
        [organizationId, invoiceId],
      );
      return asDecimalString(result.rows[0]?.total ?? 0);
    },

    async remainingUnreturnedLineCount(invoiceId) {
      const result = await client.query<{ count: number }>(
        `
        SELECT count(*)::int AS count
        FROM app.invoice_lines l
        WHERE l.organization_id = $1 AND l.invoice_id = $2
          AND NOT EXISTS (
            SELECT 1 FROM app.invoice_returns r
            WHERE r.organization_id = l.organization_id
              AND r.invoice_line_id = l.id
              AND r.status = 'accepted'
          )
        `,
        [organizationId, invoiceId],
      );
      return result.rows[0]?.count ?? 0;
    },

    async insertReturn(input) {
      const result = await client.query<{ id: string }>(
        `
        INSERT INTO app.invoice_returns (
          organization_id, invoice_id, article_id, invoice_line_id, status, reason, accepted_by_staff_user_id
        )
        VALUES ($1, $2, $3, $4, 'accepted', $5, $6)
        RETURNING id
        `,
        [organizationId, input.invoiceId, input.articleId, input.invoiceLineId, input.reason, input.acceptedByStaffUserId],
      );
      const id = result.rows[0]?.id;
      if (!id) {
        throw new Error("Return insert returned no row.");
      }
      return id;
    },

    async allocateCreditNoteNumber() {
      const result = await client.query<{ prefix: string; padding: number; next_value: number }>(
        `
        SELECT prefix, padding, next_value
        FROM app.document_sequences
        WHERE organization_id = $1 AND branch_id = $2 AND document_type = 'credit_note'
        FOR UPDATE
        `,
        [organizationId, branchId],
      );
      const row = result.rows[0];
      if (!row) {
        throw new Error("Credit note document sequence is missing.");
      }
      const number = `${row.prefix}${String(row.next_value).padStart(row.padding, "0")}`;
      await client.query(
        `
        UPDATE app.document_sequences
        SET next_value = next_value + 1, updated_at = timezone('utc', now())
        WHERE organization_id = $1 AND branch_id = $2 AND document_type = 'credit_note'
        `,
        [organizationId, branchId],
      );
      return number;
    },

    async insertCreditNote(input) {
      const result = await client.query<{ id: string }>(
        `
        INSERT INTO app.credit_notes (
          organization_id, branch_id, credit_note_number, invoice_id, return_id, amount_inr
        )
        VALUES ($1, $2, $3, $4, $5, $6::numeric)
        RETURNING id
        `,
        [organizationId, branchId, input.creditNoteNumber, input.invoiceId, input.returnId, input.amountInr],
      );
      const id = result.rows[0]?.id;
      if (!id) {
        throw new Error("Credit note insert returned no row.");
      }
      return id;
    },

    async markArticleReturnInspection(input) {
      const updated = await client.query<{ id: string }>(
        `
        UPDATE app.articles
        SET status = 'return_inspection', row_version = row_version + 1, updated_at = timezone('utc', now())
        WHERE organization_id = $1 AND id = $2 AND row_version = $3 AND status = 'sold'
        RETURNING id
        `,
        [organizationId, input.articleId, input.expectedVersion],
      );
      if (!updated.rows[0]) {
        return false;
      }
      await client.query(
        `
        INSERT INTO app.inventory_movements (
          organization_id, article_id, movement_type, from_status, to_status,
          reason, actor_staff_user_id, related_invoice_id, related_return_id
        )
        VALUES ($1, $2, 'return_in', 'sold', 'return_inspection', $3, $4, $5, $6)
        `,
        [organizationId, input.articleId, input.reason, input.actorStaffUserId, input.invoiceId, input.returnId],
      );
      return true;
    },

    async getAcceptResult(returnId) {
      const accepted = await loadReturn(returnId);
      const credit = await loadCreditForReturn(returnId);
      if (!accepted || !credit) {
        return null;
      }
      const invoice = await client.query<{
        amount_due_inr: string | number;
        amount_paid_inr: string | number;
      }>(
        `SELECT amount_due_inr, amount_paid_inr FROM app.invoices WHERE organization_id = $1 AND id = $2`,
        [organizationId, accepted.invoice_id],
      );
      const totals = invoice.rows[0];
      if (!totals) {
        return null;
      }
      const result: InvoiceReturnAcceptResult = {
        return: accepted,
        credit_note: credit,
        article_status: "return_inspection",
        amount_due_inr: asDecimalString(totals.amount_due_inr),
        amount_paid_inr: asDecimalString(totals.amount_paid_inr),
      };
      return result;
    },

    async getInvoiceCorrections(invoiceId) {
      const invoice = await client.query<{
        id: string;
        invoice_number: string | null;
        customer_id: string;
        grand_total_inr: string | number;
        amount_paid_inr: string | number;
        amount_due_inr: string | number;
        credited_inr: string | number;
        net_collected_inr: string | number;
      }>(
        `
        SELECT
          i.id, i.invoice_number, i.customer_id, i.grand_total_inr,
          i.amount_paid_inr, i.amount_due_inr,
          COALESCE((
            SELECT sum(cn.amount_inr) FROM app.credit_notes cn
            WHERE cn.organization_id = i.organization_id AND cn.invoice_id = i.id
          ), 0) AS credited_inr,
          COALESCE((
            SELECT sum(
              CASE
                WHEN p.kind = 'collection' AND p.status = 'posted' THEN pa.amount_inr
                WHEN p.kind = 'refund' AND p.status = 'posted' THEN -pa.amount_inr
                ELSE 0
              END
            )
            FROM app.payment_allocations pa
            JOIN app.payments p ON p.id = pa.payment_id AND p.organization_id = pa.organization_id
            WHERE pa.organization_id = i.organization_id AND pa.invoice_id = i.id
          ), 0) AS net_collected_inr
        FROM app.invoices i
        WHERE i.organization_id = $1 AND i.id = $2
        `,
        [organizationId, invoiceId],
      );
      const row = invoice.rows[0];
      if (!row) {
        return null;
      }

      const returns = await client.query<ReturnRow>(
        `${returnSelect} WHERE r.organization_id = $1 AND r.invoice_id = $2 ORDER BY r.created_at ASC, r.id ASC`,
        [organizationId, invoiceId],
      );
      const credits = await client.query<CreditRow>(
        `${creditSelect} WHERE cn.organization_id = $1 AND cn.invoice_id = $2 ORDER BY cn.issued_at ASC, cn.id ASC`,
        [organizationId, invoiceId],
      );
      const invoicePayments = await payments.getInvoicePayments(invoiceId);
      const corrections: InvoiceCorrections = {
        invoice_id: row.id,
        invoice_number: row.invoice_number,
        customer_id: row.customer_id,
        grand_total_inr: asDecimalString(row.grand_total_inr),
        credited_inr: asDecimalString(row.credited_inr),
        net_collected_inr: asDecimalString(row.net_collected_inr),
        amount_paid_inr: asDecimalString(row.amount_paid_inr),
        amount_due_inr: asDecimalString(row.amount_due_inr),
        returns: returns.rows.map(mapReturn),
        credit_notes: credits.rows.map(mapCredit),
        payments: invoicePayments?.items ?? [],
      };
      return corrections;
    },

    writeAudit: payments.writeAudit,
    findIdempotency: payments.findIdempotency,
    insertIdempotency: payments.insertIdempotency,
    insertOutbox: payments.insertOutbox,
  };
}
