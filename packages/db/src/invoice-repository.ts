import type { PoolClient } from "pg";

import type {
  Invoice,
  InvoiceLine,
  InvoiceLinePricing,
  InvoiceListItem,
  InvoiceStatus,
  Metal,
} from "@aabhushan/contracts";
import { DEFAULT_INVOICE_LINE_PRICING, invoiceLinePricingSchema, makingChargeSchema } from "@aabhushan/contracts";
import { decimalFromString } from "@aabhushan/domain";
import type { InvoiceRepository } from "@aabhushan/application";

import { allocateReceiptNumber } from "./payment-repository";
import { asBusinessDate, asDecimalString, asIsoDateTime } from "./pg-values";

type InvoiceRow = {
  id: string;
  invoice_number: string | null;
  customer_id: string;
  customer_display_name: string;
  status: string;
  business_date: Date | string;
  quote_version: number;
  calculation_policy_version: string | null;
  metal_value_inr: string | number;
  making_charges_inr: string | number;
  wastage_inr: string | number;
  stone_charges_inr: string | number;
  discount_inr: string | number;
  tax_inr: string | number;
  round_off_inr: string | number;
  grand_total_inr: string | number;
  amount_paid_inr: string | number;
  amount_due_inr: string | number;
  invoice_discount_input: unknown;
  finalized_at: Date | null;
  finalized_by_staff_user_id: string | null;
  row_version: number;
  created_at: Date;
  updated_at: Date;
};

type InvoiceLineRow = {
  id: string;
  line_no: number;
  article_id: string;
  article_number: string;
  barcode: string | null;
  description: string;
  metal: string;
  purity: string;
  gross_weight_grams: string | number;
  non_metal_weight_grams: string | number;
  net_metal_weight_grams: string | number;
  rate_per_gram: string | number | null;
  metal_value_inr: string | number;
  making_charge_inr: string | number;
  wastage_inr: string | number;
  stone_charges_inr: string | number;
  line_discount_inr: string | number;
  line_total_inr: string | number;
  pricing_input: unknown;
};

type ListRow = {
  id: string;
  invoice_number: string | null;
  customer_id: string;
  customer_display_name: string;
  customer_phone_display: string | null;
  status: string;
  business_date: Date | string;
  grand_total_inr: string | number;
  amount_paid_inr: string | number;
  amount_due_inr: string | number;
  quote_version: number;
  line_count: number;
  finalized_at: Date | null;
  updated_at: Date;
};

type ArticleSnapshotRow = {
  id: string;
  article_number: string;
  barcode: string | null;
  metal: string;
  purity: string;
  gross_weight_grams: string | number;
  non_metal_weight_grams: string | number;
  net_metal_weight_grams: string | number;
  status: string;
  category_name: string;
  row_version: number;
};

const INVOICE_SORT_COLUMNS = {
  updated_at: "i.updated_at",
  business_date: "i.business_date",
  grand_total_inr: "i.grand_total_inr",
  status: "i.status",
} as const;

function asStatus(value: string): InvoiceStatus {
  return value === "finalized" ? "finalized" : "draft";
}

function asMetal(value: string): Metal {
  return value === "silver" ? "silver" : "gold";
}

function money(value: string | number): string {
  return asDecimalString(value);
}

function parseLinePricing(value: unknown): InvoiceLinePricing {
  const parsed = invoiceLinePricingSchema.safeParse(value ?? DEFAULT_INVOICE_LINE_PRICING);
  return parsed.success ? parsed.data : DEFAULT_INVOICE_LINE_PRICING;
}

function parseInvoiceDiscount(value: unknown): Invoice["invoice_discount"] {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (record.method === "amount" && typeof record.amount_inr === "string") {
    return { method: "amount", amount_inr: record.amount_inr };
  }
  if (record.method === "percent" && typeof record.percent === "string") {
    return { method: "percent", percent: record.percent };
  }
  return null;
}

function mapLine(row: InvoiceLineRow): InvoiceLine {
  return {
    id: row.id,
    line_no: row.line_no,
    article_id: row.article_id,
    article_number: row.article_number,
    barcode: row.barcode,
    description: row.description,
    metal: asMetal(row.metal),
    purity: row.purity,
    gross_weight_grams: asDecimalString(row.gross_weight_grams),
    non_metal_weight_grams: asDecimalString(row.non_metal_weight_grams),
    net_metal_weight_grams: asDecimalString(row.net_metal_weight_grams),
    rate_per_gram: row.rate_per_gram === null ? null : asDecimalString(row.rate_per_gram),
    metal_value_inr: money(row.metal_value_inr),
    making_charge_inr: money(row.making_charge_inr),
    wastage_inr: money(row.wastage_inr),
    stone_charges_inr: money(row.stone_charges_inr),
    line_discount_inr: money(row.line_discount_inr),
    line_total_inr: money(row.line_total_inr),
    pricing: parseLinePricing(row.pricing_input),
  };
}

function mapInvoice(row: InvoiceRow, lines: InvoiceLine[]): Invoice {
  return {
    id: row.id,
    invoice_number: row.invoice_number,
    customer_id: row.customer_id,
    customer_display_name: row.customer_display_name,
    status: asStatus(row.status),
    business_date: asBusinessDate(row.business_date),
    quote_version: row.quote_version,
    calculation_policy_version: row.calculation_policy_version,
    metal_value_inr: money(row.metal_value_inr),
    making_charges_inr: money(row.making_charges_inr),
    wastage_inr: money(row.wastage_inr),
    stone_charges_inr: money(row.stone_charges_inr),
    discount_inr: money(row.discount_inr),
    tax_inr: money(row.tax_inr),
    round_off_inr: money(row.round_off_inr),
    grand_total_inr: money(row.grand_total_inr),
    amount_paid_inr: money(row.amount_paid_inr),
    amount_due_inr: money(row.amount_due_inr),
    invoice_discount: parseInvoiceDiscount(row.invoice_discount_input),
    finalized_at: row.finalized_at ? asIsoDateTime(row.finalized_at) : null,
    finalized_by_staff_user_id: row.finalized_by_staff_user_id,
    row_version: row.row_version,
    lines,
    quote_error: null,
    created_at: asIsoDateTime(row.created_at),
    updated_at: asIsoDateTime(row.updated_at),
  };
}

function mapListItem(row: ListRow): InvoiceListItem {
  return {
    id: row.id,
    invoice_number: row.invoice_number,
    customer_id: row.customer_id,
    customer_display_name: row.customer_display_name,
    customer_phone_display: row.customer_phone_display,
    status: asStatus(row.status),
    business_date: asBusinessDate(row.business_date),
    grand_total_inr: money(row.grand_total_inr),
    amount_paid_inr: money(row.amount_paid_inr),
    amount_due_inr: money(row.amount_due_inr),
    quote_version: row.quote_version,
    line_count: row.line_count,
    finalized_at: row.finalized_at ? asIsoDateTime(row.finalized_at) : null,
    updated_at: asIsoDateTime(row.updated_at),
  };
}

const invoiceSelect = `
  SELECT
    i.id, i.invoice_number, i.customer_id, c.display_name AS customer_display_name,
    i.status, i.business_date, i.quote_version, i.calculation_policy_version,
    i.metal_value_inr, i.making_charges_inr, i.wastage_inr, i.stone_charges_inr,
    i.discount_inr, i.tax_inr, i.round_off_inr, i.grand_total_inr,
    i.amount_paid_inr, i.amount_due_inr, i.invoice_discount_input,
    i.finalized_at, i.finalized_by_staff_user_id,
    i.row_version, i.created_at, i.updated_at
  FROM app.invoices i
  JOIN app.customers c ON c.id = i.customer_id AND c.organization_id = i.organization_id
`;

export function createInvoiceRepository(
  client: PoolClient,
  organizationId: string,
  branchId: string,
): InvoiceRepository {
  async function loadLines(invoiceId: string): Promise<InvoiceLine[]> {
    const result = await client.query<InvoiceLineRow>(
      `
      SELECT id, line_no, article_id, article_number, barcode, description, metal, purity,
             gross_weight_grams, non_metal_weight_grams, net_metal_weight_grams, rate_per_gram,
             metal_value_inr, making_charge_inr, wastage_inr, stone_charges_inr,
             line_discount_inr, line_total_inr, pricing_input
      FROM app.invoice_lines
      WHERE organization_id = $1 AND invoice_id = $2
      ORDER BY line_no ASC
      `,
      [organizationId, invoiceId],
    );
    return result.rows.map(mapLine);
  }

  async function loadInvoice(invoiceId: string): Promise<Invoice | null> {
    const result = await client.query<InvoiceRow>(`${invoiceSelect} WHERE i.organization_id = $1 AND i.id = $2`, [
      organizationId,
      invoiceId,
    ]);
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return mapInvoice(row, await loadLines(invoiceId));
  }

  return {
    async createDraft(input) {
      const totals = input.quoteTotals;
      const inserted = await client.query<{ id: string }>(
        `
        INSERT INTO app.invoices (
          organization_id, branch_id, customer_id, status, business_date,
          quote_version, calculation_policy_version,
          metal_value_inr, making_charges_inr, wastage_inr, stone_charges_inr,
          discount_inr, tax_inr, round_off_inr, grand_total_inr, amount_paid_inr, amount_due_inr,
          invoice_discount_input
        )
        VALUES (
          $1, $2, $3, 'draft', $4::date,
          1, $5,
          $6::numeric, $7::numeric, $8::numeric, $9::numeric,
          $10::numeric, $11::numeric, $12::numeric, $13::numeric, 0, $13::numeric,
          $14::jsonb
        )
        RETURNING id
        `,
        [
          organizationId,
          branchId,
          input.customerId,
          input.businessDate,
          totals?.calculationPolicyVersion ?? null,
          totals?.metalValueInr ?? "0",
          totals?.makingChargesInr ?? "0",
          totals?.wastageInr ?? "0",
          totals?.stoneChargesInr ?? "0",
          totals?.discountInr ?? "0",
          totals?.taxInr ?? "0",
          totals?.roundOffInr ?? "0",
          totals?.grandTotalInr ?? "0",
          input.invoiceDiscount === null ? null : JSON.stringify(input.invoiceDiscount),
        ],
      );
      const invoiceId = inserted.rows[0]?.id;
      if (!invoiceId) {
        throw new Error("Invoice draft insert returned no row.");
      }
      if (input.lines.length > 0) {
        await insertLines(client, organizationId, invoiceId, input.lines);
      }
      const invoice = await loadInvoice(invoiceId);
      if (!invoice) {
        throw new Error("Created draft could not be reloaded.");
      }
      return invoice;
    },

    async getInvoice(invoiceId) {
      return loadInvoice(invoiceId);
    },

    async listInvoices(input) {
      const sortColumn = INVOICE_SORT_COLUMNS[input.sort];
      const direction = input.direction === "asc" ? "ASC" : "DESC";
      const params: unknown[] = [organizationId];
      const filters: string[] = ["i.organization_id = $1"];

      if (input.status) {
        params.push(input.status);
        filters.push(`i.status = $${String(params.length)}`);
      }
      if (input.customerId) {
        params.push(input.customerId);
        filters.push(`i.customer_id = $${String(params.length)}`);
      }
      if (input.businessDateFrom) {
        params.push(input.businessDateFrom);
        filters.push(`i.business_date >= $${String(params.length)}::date`);
      }
      if (input.businessDateTo) {
        params.push(input.businessDateTo);
        filters.push(`i.business_date <= $${String(params.length)}::date`);
      }
      if (input.q) {
        params.push(`%${input.q}%`);
        filters.push(
          `(c.display_name ILIKE $${String(params.length)} OR COALESCE(i.invoice_number, '') ILIKE $${String(params.length)} OR COALESCE(c.phone_display, '') ILIKE $${String(params.length)} OR COALESCE(c.phone_normalized, '') ILIKE $${String(params.length)})`,
        );
      }
      if (input.hasDue === true) {
        filters.push("i.amount_due_inr > 0");
      } else if (input.hasDue === false) {
        filters.push("i.amount_due_inr = 0");
      }

      const where = filters.join(" AND ");
      const countResult = await client.query<{ count: number }>(
        `
        SELECT count(*)::int AS count
        FROM app.invoices i
        JOIN app.customers c ON c.id = i.customer_id AND c.organization_id = i.organization_id
        WHERE ${where}
        `,
        params,
      );
      const total = countResult.rows[0]?.count ?? 0;
      const offset = (input.page - 1) * input.pageSize;
      params.push(input.pageSize, offset);
      const limitParam = `$${String(params.length - 1)}`;
      const offsetParam = `$${String(params.length)}`;

      const result = await client.query<ListRow>(
        `
        SELECT
          i.id, i.invoice_number, i.customer_id, c.display_name AS customer_display_name,
          c.phone_display AS customer_phone_display,
          i.status, i.business_date, i.grand_total_inr, i.amount_paid_inr, i.amount_due_inr,
          i.quote_version, COALESCE(lc.line_count, 0)::int AS line_count,
          i.finalized_at, i.updated_at
        FROM app.invoices i
        JOIN app.customers c ON c.id = i.customer_id AND c.organization_id = i.organization_id
        LEFT JOIN (
          SELECT invoice_id, count(*)::int AS line_count
          FROM app.invoice_lines
          WHERE organization_id = $1
          GROUP BY invoice_id
        ) lc ON lc.invoice_id = i.id
        WHERE ${where}
        ORDER BY ${sortColumn} ${direction}, i.id ASC
        LIMIT ${limitParam} OFFSET ${offsetParam}
        `,
        params,
      );

      return { items: result.rows.map(mapListItem), total };
    },

    async patchDraft(input) {
      if (input.customerId !== undefined) {
        await client.query(
          `
          UPDATE app.invoices
          SET customer_id = $3, updated_at = timezone('utc', now())
          WHERE organization_id = $1 AND id = $2 AND status = 'draft'
          `,
          [organizationId, input.invoiceId, input.customerId],
        );
      }

      await client.query(`DELETE FROM app.invoice_lines WHERE organization_id = $1 AND invoice_id = $2`, [
        organizationId,
        input.invoiceId,
      ]);

      if (input.lines.length > 0) {
        await insertLines(client, organizationId, input.invoiceId, input.lines);
      }

      const totals = input.quoteTotals;
      await client.query(
        `
        UPDATE app.invoices
        SET
          quote_version = quote_version + 1,
          calculation_policy_version = $3,
          metal_value_inr = $4::numeric,
          making_charges_inr = $5::numeric,
          wastage_inr = $6::numeric,
          stone_charges_inr = $7::numeric,
          discount_inr = $8::numeric,
          tax_inr = $9::numeric,
          round_off_inr = $10::numeric,
          grand_total_inr = $11::numeric,
          amount_due_inr = $11::numeric - amount_paid_inr,
          invoice_discount_input = $12::jsonb,
          updated_at = timezone('utc', now())
        WHERE organization_id = $1 AND id = $2 AND status = 'draft'
        `,
        [
          organizationId,
          input.invoiceId,
          totals?.calculationPolicyVersion ?? null,
          totals?.metalValueInr ?? "0",
          totals?.makingChargesInr ?? "0",
          totals?.wastageInr ?? "0",
          totals?.stoneChargesInr ?? "0",
          totals?.discountInr ?? "0",
          totals?.taxInr ?? "0",
          totals?.roundOffInr ?? "0",
          totals?.grandTotalInr ?? "0",
          input.invoiceDiscount === null ? null : JSON.stringify(input.invoiceDiscount),
        ],
      );

      const invoice = await loadInvoice(input.invoiceId);
      if (!invoice) {
        throw new Error("Patched draft could not be reloaded.");
      }
      return invoice;
    },

    async lockDraftForUpdate(invoiceId) {
      const result = await client.query<InvoiceRow>(
        `
        SELECT
          i.id, i.invoice_number, i.customer_id, c.display_name AS customer_display_name,
          i.status, i.business_date, i.quote_version, i.calculation_policy_version,
          i.metal_value_inr, i.making_charges_inr, i.wastage_inr, i.stone_charges_inr,
          i.discount_inr, i.tax_inr, i.round_off_inr, i.grand_total_inr,
          i.amount_paid_inr, i.amount_due_inr, i.invoice_discount_input,
          i.finalized_at, i.finalized_by_staff_user_id,
          i.row_version, i.created_at, i.updated_at
        FROM app.invoices i
        JOIN app.customers c ON c.id = i.customer_id AND c.organization_id = i.organization_id
        WHERE i.organization_id = $1 AND i.id = $2
        FOR UPDATE OF i
        `,
        [organizationId, invoiceId],
      );
      const row = result.rows[0];
      if (!row) {
        return null;
      }
      return mapInvoice(row, await loadLines(invoiceId));
    },

    async lockArticlesAscending(articleIds) {
      if (articleIds.length === 0) {
        return [];
      }
      const sorted = [...articleIds].sort();
      const result = await client.query<ArticleSnapshotRow>(
        `
        SELECT
          a.id, a.article_number, a.barcode, a.metal, a.purity,
          a.gross_weight_grams, a.non_metal_weight_grams, a.net_metal_weight_grams,
          a.status, a.row_version, COALESCE(cc.name, 'Article') AS category_name
        FROM app.articles a
        LEFT JOIN app.catalogue_categories cc
          ON cc.id = a.category_id AND cc.organization_id = a.organization_id
        WHERE a.organization_id = $1 AND a.id = ANY($2::uuid[])
        ORDER BY a.id ASC
        FOR UPDATE OF a
        `,
        [organizationId, sorted],
      );
      return result.rows.map((row) => ({
        id: row.id,
        articleNumber: row.article_number,
        barcode: row.barcode,
        metal: asMetal(row.metal),
        purity: row.purity,
        grossWeightGrams: asDecimalString(row.gross_weight_grams),
        nonMetalWeightGrams: asDecimalString(row.non_metal_weight_grams),
        netMetalWeightGrams: asDecimalString(row.net_metal_weight_grams),
        status: row.status,
        categoryName: row.category_name,
        rowVersion: row.row_version,
        description: `${row.category_name} · ${row.article_number}`,
      }));
    },

    async findRatePerGram(input) {
      const result = await client.query<{ rate_per_gram: string | number }>(
        `
        SELECT rate_per_gram
        FROM app.metal_rates
        WHERE organization_id = $1
          AND metal = $2
          AND purity = $3
          AND effective_business_date <= $4::date
        ORDER BY effective_business_date DESC, created_at DESC
        LIMIT 1
        `,
        [organizationId, input.metal, input.purity, input.businessDate],
      );
      const row = result.rows[0];
      return row ? asDecimalString(row.rate_per_gram) : null;
    },

    async findMakingChargeDefault(input) {
      const result = await client.query<{ making_charge: unknown }>(
        `
        SELECT making_charge
        FROM app.making_charge_defaults
        WHERE organization_id = $1 AND metal = $2 AND purity = $3
        LIMIT 1
        `,
        [organizationId, input.metal, input.purity],
      );
      const raw = result.rows[0]?.making_charge;
      if (!raw || typeof raw !== "object") {
        return null;
      }
      const parsed = makingChargeSchema.safeParse(raw);
      return parsed.success ? parsed.data : null;
    },

    async allocateInvoiceNumber() {
      const result = await client.query<{ prefix: string; padding: number; next_value: number }>(
        `
        SELECT prefix, padding, next_value
        FROM app.document_sequences
        WHERE organization_id = $1 AND branch_id = $2 AND document_type = 'invoice'
        FOR UPDATE
        `,
        [organizationId, branchId],
      );
      const row = result.rows[0];
      if (!row) {
        throw new Error("Invoice document sequence is missing.");
      }
      const invoiceNumber = `${row.prefix}${String(row.next_value).padStart(row.padding, "0")}`;
      await client.query(
        `
        UPDATE app.document_sequences
        SET next_value = next_value + 1, updated_at = timezone('utc', now())
        WHERE organization_id = $1 AND branch_id = $2 AND document_type = 'invoice'
        `,
        [organizationId, branchId],
      );
      return invoiceNumber;
    },

    async markFinalized(input) {
      const quote = input.quote;
      const discountInr = decimalFromString(quote.line_discounts_inr)
        .plus(quote.invoice_discount_inr)
        .toFixed(2);
      await client.query(
        `
        UPDATE app.invoices
        SET
          status = 'finalized',
          invoice_number = $3,
          calculation_policy_version = $4,
          metal_value_inr = $5::numeric,
          making_charges_inr = $6::numeric,
          wastage_inr = $7::numeric,
          stone_charges_inr = $8::numeric,
          discount_inr = $9::numeric,
          tax_inr = $10::numeric,
          round_off_inr = $11::numeric,
          grand_total_inr = $12::numeric,
          amount_paid_inr = $13::numeric,
          amount_due_inr = $14::numeric,
          finalized_at = timezone('utc', now()),
          finalized_by_staff_user_id = $15,
          row_version = row_version + 1,
          updated_at = timezone('utc', now())
        WHERE organization_id = $1 AND id = $2 AND status = 'draft'
        `,
        [
          organizationId,
          input.invoiceId,
          input.invoiceNumber,
          quote.policy_version,
          quote.metal_value_inr,
          quote.making_charge_inr,
          quote.wastage_inr,
          quote.stone_charges_inr,
          discountInr,
          quote.tax_inr,
          quote.round_off_inr,
          quote.grand_total_inr,
          input.amountPaidInr,
          input.amountDueInr,
          input.finalizedByStaffUserId,
        ],
      );

      for (const line of input.lineSnapshots) {
        await client.query(
          `
          UPDATE app.invoice_lines
          SET
            article_number = $4,
            barcode = $5,
            description = $6,
            metal = $7,
            purity = $8,
            gross_weight_grams = $9::numeric,
            non_metal_weight_grams = $10::numeric,
            net_metal_weight_grams = $11::numeric,
            rate_per_gram = $12::numeric,
            metal_value_inr = $13::numeric,
            making_charge_inr = $14::numeric,
            wastage_inr = $15::numeric,
            stone_charges_inr = $16::numeric,
            line_discount_inr = $17::numeric,
            line_total_inr = $18::numeric
          WHERE organization_id = $1 AND invoice_id = $2 AND article_id = $3
          `,
          [
            organizationId,
            input.invoiceId,
            line.articleId,
            line.articleNumber,
            line.barcode,
            line.description,
            line.metal,
            line.purity,
            line.grossWeightGrams,
            line.nonMetalWeightGrams,
            line.netMetalWeightGrams,
            line.ratePerGram,
            line.metalValueInr,
            line.makingChargeInr,
            line.wastageInr,
            line.stoneChargesInr,
            line.lineDiscountInr,
            line.lineTotalInr,
          ],
        );
      }
    },

    async insertSaleMovements(input) {
      for (const articleId of input.articleIds) {
        const updated = await client.query<{ id: string; row_version: number }>(
          `
          UPDATE app.articles
          SET status = 'sold', row_version = row_version + 1, updated_at = timezone('utc', now())
          WHERE organization_id = $1 AND id = $2 AND status = 'available'
          RETURNING id, row_version
          `,
          [organizationId, articleId],
        );
        if (!updated.rows[0]) {
          throw new Error(`Article ${articleId} could not be marked sold.`);
        }
        await client.query(
          `
          INSERT INTO app.inventory_movements (
            organization_id, article_id, movement_type, from_status, to_status,
            actor_staff_user_id, related_invoice_id
          )
          VALUES ($1, $2, 'sale', 'available', 'sold', $3, $4)
          `,
          [organizationId, articleId, input.actorStaffUserId, input.invoiceId],
        );
      }
    },

    async insertPayments(input) {
      const posted: Array<{ paymentId: string; receiptNumber: string }> = [];
      for (const payment of input.payments) {
        const inserted = await client.query<{ id: string }>(
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
            payment.method,
            payment.amountInr,
            payment.reference,
            input.businessDate,
            input.actorStaffUserId,
          ],
        );
        const paymentId = inserted.rows[0]?.id;
        if (!paymentId) {
          throw new Error("Payment insert returned no row.");
        }
        await client.query(
          `
          INSERT INTO app.payment_allocations (organization_id, payment_id, invoice_id, amount_inr)
          VALUES ($1, $2, $3, $4::numeric)
          `,
          [organizationId, paymentId, input.invoiceId, payment.amountInr],
        );
        const receiptNumber = await allocateReceiptNumber(client, organizationId, branchId);
        await client.query(
          `
          INSERT INTO app.receipts (organization_id, branch_id, receipt_number, payment_id)
          VALUES ($1, $2, $3, $4)
          `,
          [organizationId, branchId, receiptNumber, paymentId],
        );
        posted.push({ paymentId, receiptNumber });
      }
      return posted;
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

    async customerExists(customerId) {
      const result = await client.query<{ id: string }>(
        `SELECT id FROM app.customers WHERE organization_id = $1 AND id = $2`,
        [organizationId, customerId],
      );
      return Boolean(result.rows[0]);
    },
  };
}

async function insertLines(
  client: PoolClient,
  organizationId: string,
  invoiceId: string,
  lines: Array<{
    lineNo: number;
    articleId: string;
    articleNumber: string;
    barcode: string | null;
    description: string;
    metal: Metal;
    purity: string;
    grossWeightGrams: string;
    nonMetalWeightGrams: string;
    netMetalWeightGrams: string;
    ratePerGram: string | null;
    metalValueInr: string;
    makingChargeInr: string;
    wastageInr: string;
    stoneChargesInr: string;
    lineDiscountInr: string;
    lineTotalInr: string;
    pricing: InvoiceLinePricing;
  }>,
): Promise<void> {
  for (const line of lines) {
    await client.query(
      `
      INSERT INTO app.invoice_lines (
        organization_id, invoice_id, line_no, article_id, article_number, barcode, description,
        metal, purity, gross_weight_grams, non_metal_weight_grams, net_metal_weight_grams,
        rate_per_gram, metal_value_inr, making_charge_inr, wastage_inr, stone_charges_inr,
        line_discount_inr, line_total_inr, pricing_input
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10::numeric, $11::numeric, $12::numeric,
        $13::numeric, $14::numeric, $15::numeric, $16::numeric, $17::numeric,
        $18::numeric, $19::numeric, $20::jsonb
      )
      `,
      [
        organizationId,
        invoiceId,
        line.lineNo,
        line.articleId,
        line.articleNumber,
        line.barcode,
        line.description,
        line.metal,
        line.purity,
        line.grossWeightGrams,
        line.nonMetalWeightGrams,
        line.netMetalWeightGrams,
        line.ratePerGram,
        line.metalValueInr,
        line.makingChargeInr,
        line.wastageInr,
        line.stoneChargesInr,
        line.lineDiscountInr,
        line.lineTotalInr,
        JSON.stringify(line.pricing),
      ],
    );
  }
}
