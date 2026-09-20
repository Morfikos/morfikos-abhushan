import type { PoolClient } from "pg";

import type {
  CustomerSalesStatement,
  DailyCollections,
  InvoicePayments,
  Payment,
  PaymentAllocation,
  PaymentKind,
  PaymentMethod,
  PaymentStatus,
} from "@aabhushan/contracts";
import type { PaymentCorrectionRepository } from "@aabhushan/application";
import { kolkataBusinessDate } from "@aabhushan/domain";

import { asBusinessDate, asDecimalString, asIsoDateTime } from "./pg-values";

type PaymentRow = {
  id: string;
  customer_id: string;
  customer_display_name: string;
  method: string;
  amount_inr: string | number;
  reference: string | null;
  status: string;
  kind: string;
  received_business_date: Date | string;
  received_at: Date;
  received_by_staff_user_id: string;
  receipt_number: string | null;
  receipt_issued_at: Date | null;
  reverses_payment_id: string | null;
  reversed_by_payment_id: string | null;
};

type AllocationRow = {
  id: string;
  payment_id: string;
  invoice_id: string;
  invoice_number: string | null;
  business_date: Date | string;
  amount_inr: string | number;
};

const PAYMENT_SORT_COLUMNS = {
  received_at: "p.received_at",
  received_business_date: "p.received_business_date",
  amount_inr: "p.amount_inr",
} as const;

const PAYMENT_METHODS: readonly PaymentMethod[] = ["cash", "upi", "card", "bank"];

function asMethod(value: string): PaymentMethod {
  return PAYMENT_METHODS.includes(value as PaymentMethod) ? (value as PaymentMethod) : "cash";
}

function asPaymentStatus(value: string): PaymentStatus {
  return value === "reversed" ? "reversed" : "posted";
}

function asPaymentKind(value: string): PaymentKind {
  if (value === "refund" || value === "reversal") {
    return value;
  }
  return "collection";
}

const NET_COLLECTED_SQL = `
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
  ), 0)
`;

const CREDITED_SQL = `
  COALESCE((
    SELECT sum(cn.amount_inr)
    FROM app.credit_notes cn
    WHERE cn.organization_id = i.organization_id AND cn.invoice_id = i.id
  ), 0)
`;

const paymentSelect = `
  SELECT
    p.id, p.customer_id, c.display_name AS customer_display_name,
    p.method, p.amount_inr, p.reference, p.status, p.kind,
    p.received_business_date, p.received_at, p.received_by_staff_user_id,
    r.receipt_number, r.issued_at AS receipt_issued_at,
    p.reverses_payment_id, p.reversed_by_payment_id
  FROM app.payments p
  JOIN app.customers c ON c.id = p.customer_id AND c.organization_id = p.organization_id
  LEFT JOIN app.receipts r ON r.payment_id = p.id AND r.organization_id = p.organization_id
`;

export function createPaymentRepository(
  client: PoolClient,
  organizationId: string,
  branchId: string,
): PaymentCorrectionRepository {
  async function loadAllocations(paymentIds: string[]): Promise<Map<string, PaymentAllocation[]>> {
    const byPayment = new Map<string, PaymentAllocation[]>();
    if (paymentIds.length === 0) {
      return byPayment;
    }
    const result = await client.query<AllocationRow>(
      `
      SELECT pa.id, pa.payment_id, pa.invoice_id, i.invoice_number, i.business_date, pa.amount_inr
      FROM app.payment_allocations pa
      JOIN app.invoices i ON i.id = pa.invoice_id AND i.organization_id = pa.organization_id
      WHERE pa.organization_id = $1 AND pa.payment_id = ANY($2::uuid[])
      ORDER BY pa.created_at ASC, pa.id ASC
      `,
      [organizationId, paymentIds],
    );
    for (const row of result.rows) {
      const list = byPayment.get(row.payment_id) ?? [];
      list.push({
        id: row.id,
        invoice_id: row.invoice_id,
        invoice_number: row.invoice_number,
        business_date: asBusinessDate(row.business_date),
        amount_inr: asDecimalString(row.amount_inr),
      });
      byPayment.set(row.payment_id, list);
    }
    return byPayment;
  }

  async function mapPayments(rows: PaymentRow[]): Promise<Payment[]> {
    const allocations = await loadAllocations(rows.map((row) => row.id));
    return rows.map((row) => ({
      id: row.id,
      customer_id: row.customer_id,
      customer_display_name: row.customer_display_name,
      method: asMethod(row.method),
      amount_inr: asDecimalString(row.amount_inr),
      reference: row.reference,
      status: asPaymentStatus(row.status),
      kind: asPaymentKind(row.kind),
      received_business_date: asBusinessDate(row.received_business_date),
      received_at: asIsoDateTime(row.received_at),
      received_by_staff_user_id: row.received_by_staff_user_id,
      receipt_number: row.receipt_number,
      receipt_issued_at: row.receipt_issued_at ? asIsoDateTime(row.receipt_issued_at) : null,
      reverses_payment_id: row.reverses_payment_id,
      reversed_by_payment_id: row.reversed_by_payment_id,
      allocations: allocations.get(row.id) ?? [],
    }));
  }

  return {
    async customerExists(customerId) {
      const result = await client.query<{ id: string }>(
        `SELECT id FROM app.customers WHERE organization_id = $1 AND id = $2`,
        [organizationId, customerId],
      );
      return Boolean(result.rows[0]);
    },

    async lockInvoicesAscending(invoiceIds) {
      if (invoiceIds.length === 0) {
        return [];
      }
      const sorted = [...new Set(invoiceIds)].sort();
      const locked = await client.query<{ id: string }>(
        `
        SELECT i.id
        FROM app.invoices i
        WHERE i.organization_id = $1 AND i.id = ANY($2::uuid[])
        ORDER BY i.id ASC
        FOR UPDATE
        `,
        [organizationId, sorted],
      );
      if (locked.rows.length === 0) {
        return [];
      }

      // Read state in a separate statement so READ COMMITTED takes a fresh
      // snapshot after the lock: allocations committed by the transaction we
      // waited for must be visible before the remaining due is checked.
      const result = await client.query<{
        id: string;
        invoice_number: string | null;
        customer_id: string;
        status: string;
        grand_total_inr: string | number;
        allocated_inr: string | number;
        credited_inr: string | number;
      }>(
        `
        SELECT
          i.id, i.invoice_number, i.customer_id, i.status, i.grand_total_inr,
          ${NET_COLLECTED_SQL} AS allocated_inr,
          ${CREDITED_SQL} AS credited_inr
        FROM app.invoices i
        WHERE i.organization_id = $1 AND i.id = ANY($2::uuid[])
        ORDER BY i.id ASC
        `,
        [organizationId, locked.rows.map((row) => row.id)],
      );
      return result.rows.map((row) => ({
        id: row.id,
        invoiceNumber: row.invoice_number,
        customerId: row.customer_id,
        status: row.status,
        grandTotalInr: asDecimalString(row.grand_total_inr),
        allocatedInr: asDecimalString(row.allocated_inr),
        creditedInr: asDecimalString(row.credited_inr),
      }));
    },

    async insertPayment(input) {
      const result = await client.query<{ id: string }>(
        `
        INSERT INTO app.payments (
          organization_id, branch_id, customer_id, method, amount_inr, reference,
          status, received_business_date, received_by_staff_user_id
        )
        VALUES ($1, $2, $3, $4, $5::numeric, $6, 'posted', $7::date, $8)
        RETURNING id
        `,
        [
          organizationId,
          branchId,
          input.customerId,
          input.method,
          input.amountInr,
          input.reference,
          input.receivedBusinessDate,
          input.receivedByStaffUserId,
        ],
      );
      const id = result.rows[0]?.id;
      if (!id) {
        throw new Error("Payment insert returned no row.");
      }
      return id;
    },

    async insertAllocation(input) {
      await client.query(
        `
        INSERT INTO app.payment_allocations (organization_id, payment_id, invoice_id, amount_inr)
        VALUES ($1, $2, $3, $4::numeric)
        `,
        [organizationId, input.paymentId, input.invoiceId, input.amountInr],
      );
    },

    async allocateReceiptNumber() {
      return allocateReceiptNumber(client, organizationId, branchId);
    },

    async insertReceipt(input) {
      await client.query(
        `
        INSERT INTO app.receipts (organization_id, branch_id, receipt_number, payment_id)
        VALUES ($1, $2, $3, $4)
        `,
        [organizationId, branchId, input.receiptNumber, input.paymentId],
      );
    },

    async syncInvoicePaidFromAllocations(invoiceId) {
      await client.query(
        `
        UPDATE app.invoices i
        SET
          amount_paid_inr = GREATEST(0, collected.total),
          amount_due_inr = GREATEST(0, i.grand_total_inr - credited.total - GREATEST(0, collected.total)),
          row_version = i.row_version + 1,
          updated_at = timezone('utc', now())
        FROM (
          SELECT COALESCE(sum(
            CASE
              WHEN p.kind = 'collection' AND p.status = 'posted' THEN pa.amount_inr
              WHEN p.kind = 'refund' AND p.status = 'posted' THEN -pa.amount_inr
              ELSE 0
            END
          ), 0) AS total
          FROM app.payment_allocations pa
          JOIN app.payments p ON p.id = pa.payment_id AND p.organization_id = pa.organization_id
          WHERE pa.organization_id = $1 AND pa.invoice_id = $2
        ) AS collected,
        (
          SELECT COALESCE(sum(cn.amount_inr), 0) AS total
          FROM app.credit_notes cn
          WHERE cn.organization_id = $1 AND cn.invoice_id = $2
        ) AS credited
        WHERE i.organization_id = $1 AND i.id = $2
        `,
        [organizationId, invoiceId],
      );
    },

    async getPayment(paymentId) {
      const result = await client.query<PaymentRow>(
        `${paymentSelect} WHERE p.organization_id = $1 AND p.id = $2`,
        [organizationId, paymentId],
      );
      const rows = await mapPayments(result.rows);
      return rows[0] ?? null;
    },

    async listPayments(filters) {
      const sortColumn = PAYMENT_SORT_COLUMNS[filters.sort];
      const direction = filters.direction === "asc" ? "ASC" : "DESC";
      const params: unknown[] = [organizationId];
      const where: string[] = ["p.organization_id = $1"];

      if (filters.customerId) {
        params.push(filters.customerId);
        where.push(`p.customer_id = $${String(params.length)}`);
      }
      if (filters.method) {
        params.push(filters.method);
        where.push(`p.method = $${String(params.length)}`);
      }
      if (filters.receivedBusinessDate) {
        params.push(filters.receivedBusinessDate);
        where.push(`p.received_business_date = $${String(params.length)}::date`);
      }
      if (filters.receivedBusinessDateFrom) {
        params.push(filters.receivedBusinessDateFrom);
        where.push(`p.received_business_date >= $${String(params.length)}::date`);
      }
      if (filters.receivedBusinessDateTo) {
        params.push(filters.receivedBusinessDateTo);
        where.push(`p.received_business_date <= $${String(params.length)}::date`);
      }
      if (filters.invoiceId) {
        params.push(filters.invoiceId);
        where.push(
          `EXISTS (
            SELECT 1 FROM app.payment_allocations pa
            WHERE pa.organization_id = p.organization_id
              AND pa.payment_id = p.id
              AND pa.invoice_id = $${String(params.length)}
          )`,
        );
      }
      if (filters.q) {
        params.push(`%${filters.q}%`);
        const term = `$${String(params.length)}`;
        where.push(
          `(c.display_name ILIKE ${term}
            OR COALESCE(p.reference, '') ILIKE ${term}
            OR EXISTS (
              SELECT 1 FROM app.receipts r2
              WHERE r2.organization_id = p.organization_id AND r2.payment_id = p.id
                AND r2.receipt_number ILIKE ${term}
            )
            OR EXISTS (
              SELECT 1
              FROM app.payment_allocations pa2
              JOIN app.invoices i2 ON i2.id = pa2.invoice_id AND i2.organization_id = pa2.organization_id
              WHERE pa2.organization_id = p.organization_id AND pa2.payment_id = p.id
                AND COALESCE(i2.invoice_number, '') ILIKE ${term}
            ))`,
        );
      }

      const filter = where.join(" AND ");
      const countResult = await client.query<{ count: number }>(
        `
        SELECT count(*)::int AS count
        FROM app.payments p
        JOIN app.customers c ON c.id = p.customer_id AND c.organization_id = p.organization_id
        WHERE ${filter}
        `,
        params,
      );
      const total = countResult.rows[0]?.count ?? 0;
      const offset = (filters.page - 1) * filters.pageSize;
      params.push(filters.pageSize, offset);
      const limitParam = `$${String(params.length - 1)}`;
      const offsetParam = `$${String(params.length)}`;

      const result = await client.query<PaymentRow>(
        `
        ${paymentSelect}
        WHERE ${filter}
        ORDER BY ${sortColumn} ${direction}, p.id ASC
        LIMIT ${limitParam} OFFSET ${offsetParam}
        `,
        params,
      );

      return { items: await mapPayments(result.rows), total };
    },

    async getInvoicePayments(invoiceId) {
      const invoice = await client.query<{
        id: string;
        invoice_number: string | null;
        grand_total_inr: string | number;
        amount_paid_inr: string | number;
        amount_due_inr: string | number;
        allocated_inr: string | number;
      }>(
        `
        SELECT
          i.id, i.invoice_number, i.grand_total_inr, i.amount_paid_inr, i.amount_due_inr,
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
          ), 0) AS allocated_inr
        FROM app.invoices i
        WHERE i.organization_id = $1 AND i.id = $2
        `,
        [organizationId, invoiceId],
      );
      const row = invoice.rows[0];
      if (!row) {
        return null;
      }

      const payments = await client.query<PaymentRow>(
        `
        ${paymentSelect}
        WHERE p.organization_id = $1
          AND EXISTS (
            SELECT 1 FROM app.payment_allocations pa
            WHERE pa.organization_id = p.organization_id AND pa.payment_id = p.id AND pa.invoice_id = $2
          )
        ORDER BY p.received_at DESC, p.id ASC
        `,
        [organizationId, invoiceId],
      );

      const result: InvoicePayments = {
        invoice_id: row.id,
        invoice_number: row.invoice_number,
        grand_total_inr: asDecimalString(row.grand_total_inr),
        amount_paid_inr: asDecimalString(row.amount_paid_inr),
        amount_due_inr: asDecimalString(row.amount_due_inr),
        allocated_inr: asDecimalString(row.allocated_inr),
        items: await mapPayments(payments.rows),
      };
      return result;
    },

    async getCustomerSalesStatement(customerId) {
      const customer = await client.query<{ id: string; display_name: string }>(
        `SELECT id, display_name FROM app.customers WHERE organization_id = $1 AND id = $2`,
        [organizationId, customerId],
      );
      const customerRow = customer.rows[0];
      if (!customerRow) {
        return null;
      }

      const invoices = await client.query<{
        id: string;
        invoice_number: string | null;
        business_date: Date | string;
        grand_total_inr: string | number;
        amount_paid_inr: string | number;
        amount_due_inr: string | number;
      }>(
        `
        SELECT id, invoice_number, business_date, grand_total_inr, amount_paid_inr, amount_due_inr
        FROM app.invoices
        WHERE organization_id = $1 AND customer_id = $2 AND status = 'finalized' AND amount_due_inr > 0
        ORDER BY business_date ASC, invoice_number ASC
        `,
        [organizationId, customerId],
      );

      const totals = await client.query<{ sales_due_inr: string | number; finalized_count: number }>(
        `
        SELECT
          COALESCE(sum(amount_due_inr), 0) AS sales_due_inr,
          count(*)::int AS finalized_count
        FROM app.invoices
        WHERE organization_id = $1 AND customer_id = $2 AND status = 'finalized'
        `,
        [organizationId, customerId],
      );

      const payments = await client.query<PaymentRow>(
        `
        ${paymentSelect}
        WHERE p.organization_id = $1 AND p.customer_id = $2
        ORDER BY p.received_at DESC, p.id ASC
        LIMIT 50
        `,
        [organizationId, customerId],
      );

      const statement: CustomerSalesStatement = {
        customer_id: customerRow.id,
        display_name: customerRow.display_name,
        sales_due_inr: asDecimalString(totals.rows[0]?.sales_due_inr ?? 0),
        finalized_invoice_count: totals.rows[0]?.finalized_count ?? 0,
        outstanding_invoices: invoices.rows.map((row) => ({
          invoice_id: row.id,
          invoice_number: row.invoice_number,
          business_date: asBusinessDate(row.business_date),
          grand_total_inr: asDecimalString(row.grand_total_inr),
          amount_paid_inr: asDecimalString(row.amount_paid_inr),
          amount_due_inr: asDecimalString(row.amount_due_inr),
        })),
        payments: await mapPayments(payments.rows),
        credit_notes: (
          await client.query<{
            id: string;
            credit_note_number: string;
            invoice_id: string;
            invoice_number: string | null;
            amount_inr: string | number;
            issued_at: Date;
          }>(
            `
            SELECT cn.id, cn.credit_note_number, cn.invoice_id, i.invoice_number, cn.amount_inr, cn.issued_at
            FROM app.credit_notes cn
            JOIN app.invoices i ON i.id = cn.invoice_id AND i.organization_id = cn.organization_id
            WHERE cn.organization_id = $1 AND i.customer_id = $2
            ORDER BY cn.issued_at DESC, cn.id ASC
            LIMIT 50
            `,
            [organizationId, customerId],
          )
        ).rows.map((row) => ({
          id: row.id,
          credit_note_number: row.credit_note_number,
          invoice_id: row.invoice_id,
          invoice_number: row.invoice_number,
          amount_inr: asDecimalString(row.amount_inr),
          issued_at: asIsoDateTime(row.issued_at),
        })),
      };
      return statement;
    },

    async getDailyCollections(period) {
      const params: unknown[] = [organizationId];
      const where = [
        "organization_id = $1",
        "status = 'posted'",
        "kind = 'collection'",
      ];
      if (period.from) {
        params.push(period.from);
        where.push(`received_business_date >= $${String(params.length)}::date`);
      }
      if (period.to) {
        params.push(period.to);
        where.push(`received_business_date <= $${String(params.length)}::date`);
      }
      const filter = where.join(" AND ");
      const labelDate = period.to ?? period.from ?? kolkataBusinessDate();

      const result = await client.query<{
        method: string;
        amount_inr: string | number;
        payment_count: number;
      }>(
        `
        SELECT method, sum(amount_inr) AS amount_inr, count(*)::int AS payment_count
        FROM app.payments
        WHERE ${filter}
        GROUP BY method
        ORDER BY method ASC
        `,
        params,
      );

      const byMethod = new Map(
        result.rows.map((row) => [
          asMethod(row.method),
          { amount: asDecimalString(row.amount_inr), count: row.payment_count },
        ]),
      );

      const totalResult = await client.query<{ total_inr: string | number; payment_count: number }>(
        `
        SELECT COALESCE(sum(amount_inr), 0) AS total_inr, count(*)::int AS payment_count
        FROM app.payments
        WHERE ${filter}
        `,
        params,
      );

      const collections: DailyCollections = {
        business_date: labelDate,
        methods: PAYMENT_METHODS.map((method) => ({
          method,
          amount_inr: byMethod.get(method)?.amount ?? "0.00",
          payment_count: byMethod.get(method)?.count ?? 0,
        })),
        total_inr: asDecimalString(totalResult.rows[0]?.total_inr ?? 0),
        payment_count: totalResult.rows[0]?.payment_count ?? 0,
      };
      return collections;
    },

    async writeAudit(event) {
      await client.query(
        `
        INSERT INTO app.audit_events (
          organization_id, actor_staff_user_id, action, entity_type, entity_id, payload
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb)
        `,
        [
          organizationId,
          event.actorStaffUserId,
          event.action,
          event.entityType,
          event.entityId,
          JSON.stringify(event.payload),
        ],
      );
    },

    async findIdempotency(input) {
      const result = await client.query<{
        request_hash: string;
        response_status: number | null;
        response_body: unknown;
      }>(
        `
        SELECT request_hash, response_status, response_body
        FROM app.idempotency_keys
        WHERE organization_id = $1 AND operation = $2 AND key = $3
        `,
        [organizationId, input.operation, input.key],
      );
      const row = result.rows[0];
      if (!row || row.response_status === null || row.response_body === null || row.response_body === undefined) {
        return null;
      }
      return {
        requestHash: row.request_hash,
        responseStatus: row.response_status,
        responseBody: row.response_body,
      };
    },

    async insertIdempotency(input) {
      await client.query(
        `
        INSERT INTO app.idempotency_keys (
          organization_id, key, operation, request_hash, response_status, response_body
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb)
        `,
        [
          organizationId,
          input.key,
          input.operation,
          input.requestHash,
          input.responseStatus,
          JSON.stringify(input.responseBody),
        ],
      );
    },

    async insertOutbox(input) {
      await client.query(
        `
        INSERT INTO app.outbox_events (organization_id, event_key, event_type, payload)
        VALUES ($1, $2, $3, $4::jsonb)
        `,
        [organizationId, input.eventKey, input.eventType, JSON.stringify(input.payload)],
      );
    },

    async lockPaymentForUpdate(paymentId) {
      const locked = await client.query<{ id: string }>(
        `
        SELECT id FROM app.payments
        WHERE organization_id = $1 AND id = $2
        FOR UPDATE
        `,
        [organizationId, paymentId],
      );
      if (!locked.rows[0]) {
        return null;
      }
      const result = await client.query<{
        id: string;
        customer_id: string;
        method: string;
        amount_inr: string | number;
        status: string;
        kind: string;
        reverses_payment_id: string | null;
        reversed_by_payment_id: string | null;
      }>(
        `
        SELECT id, customer_id, method, amount_inr, status, kind, reverses_payment_id, reversed_by_payment_id
        FROM app.payments
        WHERE organization_id = $1 AND id = $2
        `,
        [organizationId, paymentId],
      );
      const row = result.rows[0];
      if (!row) {
        return null;
      }
      const allocations = await client.query<{ invoice_id: string; amount_inr: string | number }>(
        `
        SELECT invoice_id, amount_inr
        FROM app.payment_allocations
        WHERE organization_id = $1 AND payment_id = $2
        ORDER BY invoice_id ASC
        `,
        [organizationId, paymentId],
      );
      return {
        id: row.id,
        customerId: row.customer_id,
        method: asMethod(row.method),
        amountInr: asDecimalString(row.amount_inr),
        status: asPaymentStatus(row.status),
        kind: asPaymentKind(row.kind),
        reversesPaymentId: row.reverses_payment_id,
        reversedByPaymentId: row.reversed_by_payment_id,
        allocations: allocations.rows.map((item) => ({
          invoiceId: item.invoice_id,
          amountInr: asDecimalString(item.amount_inr),
        })),
      };
    },

    async refundedAmountForPayment(paymentId) {
      const result = await client.query<{ total: string | number }>(
        `
        SELECT COALESCE(sum(amount_inr), 0) AS total
        FROM app.payments
        WHERE organization_id = $1 AND reverses_payment_id = $2 AND kind = 'refund' AND status = 'posted'
        `,
        [organizationId, paymentId],
      );
      return asDecimalString(result.rows[0]?.total ?? 0);
    },

    async refundedAllocationsForPayment(paymentId) {
      const result = await client.query<{ invoice_id: string; amount_inr: string | number }>(
        `
        SELECT pa.invoice_id, pa.amount_inr
        FROM app.payment_allocations pa
        JOIN app.payments p ON p.id = pa.payment_id AND p.organization_id = pa.organization_id
        WHERE pa.organization_id = $1
          AND p.reverses_payment_id = $2
          AND p.kind = 'refund'
          AND p.status = 'posted'
        `,
        [organizationId, paymentId],
      );
      return result.rows.map((row) => ({
        invoiceId: row.invoice_id,
        amountInr: asDecimalString(row.amount_inr),
      }));
    },

    async insertCompensatingPayment(input) {
      const result = await client.query<{ id: string }>(
        `
        INSERT INTO app.payments (
          organization_id, branch_id, customer_id, method, amount_inr, reference,
          status, kind, reverses_payment_id, received_business_date, received_by_staff_user_id
        )
        VALUES ($1, $2, $3, $4, $5::numeric, $6, 'posted', $7, $8, $9::date, $10)
        RETURNING id
        `,
        [
          organizationId,
          branchId,
          input.customerId,
          input.method,
          input.amountInr,
          input.reference,
          input.kind,
          input.reversesPaymentId,
          input.receivedBusinessDate,
          input.receivedByStaffUserId,
        ],
      );
      const id = result.rows[0]?.id;
      if (!id) {
        throw new Error("Compensating payment insert returned no row.");
      }
      return id;
    },

    async markPaymentReversed(input) {
      const result = await client.query<{ id: string }>(
        `
        UPDATE app.payments
        SET status = 'reversed', reversed_by_payment_id = $3
        WHERE organization_id = $1 AND id = $2 AND status = 'posted' AND kind = 'collection' AND reversed_by_payment_id IS NULL
        RETURNING id
        `,
        [organizationId, input.paymentId, input.reversedByPaymentId],
      );
      return Boolean(result.rows[0]);
    },

    async allocateRefundNumber() {
      const result = await client.query<{ prefix: string; padding: number; next_value: number }>(
        `
        SELECT prefix, padding, next_value
        FROM app.document_sequences
        WHERE organization_id = $1 AND branch_id = $2 AND document_type = 'refund'
        FOR UPDATE
        `,
        [organizationId, branchId],
      );
      const row = result.rows[0];
      if (!row) {
        throw new Error("Refund document sequence is missing.");
      }
      const refundNumber = `${row.prefix}${String(row.next_value).padStart(row.padding, "0")}`;
      await client.query(
        `
        UPDATE app.document_sequences
        SET next_value = next_value + 1, updated_at = timezone('utc', now())
        WHERE organization_id = $1 AND branch_id = $2 AND document_type = 'refund'
        `,
        [organizationId, branchId],
      );
      return refundNumber;
    },
  };
}

/** Receipt numbers come from the shared branch document sequence under a row lock. */
export async function allocateReceiptNumber(
  client: PoolClient,
  organizationId: string,
  branchId: string,
): Promise<string> {
  const result = await client.query<{ prefix: string; padding: number; next_value: number }>(
    `
    SELECT prefix, padding, next_value
    FROM app.document_sequences
    WHERE organization_id = $1 AND branch_id = $2 AND document_type = 'receipt'
    FOR UPDATE
    `,
    [organizationId, branchId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error("Receipt document sequence is missing.");
  }
  const receiptNumber = `${row.prefix}${String(row.next_value).padStart(row.padding, "0")}`;
  await client.query(
    `
    UPDATE app.document_sequences
    SET next_value = next_value + 1, updated_at = timezone('utc', now())
    WHERE organization_id = $1 AND branch_id = $2 AND document_type = 'receipt'
    `,
    [organizationId, branchId],
  );
  return receiptNumber;
}
