import type {
  CollectionsByMethodRow,
  CollectionsReport,
  ExportJobStatus,
  ExportType,
  GirviMaturityRow,
  GirviReport,
  InventoryAvailableRow,
  InventoryReport,
  OperationsAttention,
  ReportRange,
  SalesByDateRow,
  SalesDueRow,
  SalesDuesSummary,
  SalesReport,
} from "@aabhushan/contracts";
import { girviAccountIsOverdue, kolkataBusinessDate } from "@aabhushan/domain";
import type { PoolClient } from "pg";

export type ReportRangeInput = {
  from?: string;
  to?: string;
};

export type ExportJobRecord = {
  id: string;
  exportType: ExportType;
  filters: { business_date_from?: string; business_date_to?: string };
  status: ExportJobStatus;
  rowCount: number | null;
  storedObjectId: string | null;
  storedObjectKey: string | null;
  lastError: string | null;
  requestedByStaffUserId: string;
};

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

function asGrams(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return "0.0000";
  }
  const raw = typeof value === "number" ? value.toFixed(4) : value;
  const [whole = "0", fraction = ""] = raw.split(".");
  return `${whole}.${fraction.padEnd(4, "0").slice(0, 4)}`;
}

function asInt(value: string | number | null | undefined): number {
  return Number(value ?? 0);
}

function rangeDto(range: ReportRangeInput): ReportRange {
  return {
    business_date_from: range.from ?? null,
    business_date_to: range.to ?? null,
  };
}

function boundFrom(range: ReportRangeInput): string {
  return range.from ?? "0001-01-01";
}

function boundTo(range: ReportRangeInput): string {
  return range.to ?? "9999-12-31";
}

function asOfDate(range: ReportRangeInput): string {
  return range.to ?? kolkataBusinessDate();
}

type SalesDueQueryRow = {
  invoice_id: string;
  invoice_number: string;
  business_date: string;
  customer_id: string;
  customer_display_name: string;
  grand_total_inr: string | number;
  amount_paid_inr: string | number;
  amount_due_inr: string | number;
};

function mapSalesDueRow(row: SalesDueQueryRow): SalesDueRow {
  return {
    invoice_id: row.invoice_id,
    invoice_number: row.invoice_number,
    business_date: row.business_date,
    customer_id: row.customer_id,
    customer_display_name: row.customer_display_name,
    grand_total_inr: asMoney(row.grand_total_inr),
    amount_paid_inr: asMoney(row.amount_paid_inr),
    amount_due_inr: asMoney(row.amount_due_inr),
  };
}

export function createReportsRepository(client: PoolClient, organizationId: string) {
  async function loadSalesDues(range: ReportRangeInput): Promise<SalesDueRow[]> {
    const result = await client.query<SalesDueQueryRow>(
      `
      SELECT invoice_id, invoice_number, business_date::text, customer_id, customer_display_name,
             grand_total_inr, amount_paid_inr, amount_due_inr
      FROM app.sales_dues_as_of($1, $2::date)
      ORDER BY business_date, invoice_number
      `,
      [organizationId, asOfDate(range)],
    );
    return result.rows.map(mapSalesDueRow);
  }

  return {
    async getSales(range: ReportRangeInput): Promise<SalesReport> {
      const result = await client.query<{
        business_date: string;
        invoice_count: string | number;
        gross_sales_inr: string | number;
        returns_inr: string | number;
      }>(
        `
        SELECT business_date::text, invoice_count, gross_sales_inr, returns_inr
        FROM app.v_sales_by_business_date
        WHERE organization_id = $1
          AND business_date >= $2::date
          AND business_date <= $3::date
        ORDER BY business_date
        `,
        [organizationId, boundFrom(range), boundTo(range)],
      );
      const byDate: SalesByDateRow[] = result.rows.map((row) => {
        const gross = asMoney(row.gross_sales_inr);
        const returns = asMoney(row.returns_inr);
        const netPaise = moneyToPaise(gross) - moneyToPaise(returns);
        return {
          business_date: row.business_date,
          invoice_count: asInt(row.invoice_count),
          gross_sales_inr: gross,
          returns_inr: returns,
          net_sales_inr: paiseToMoney(netPaise),
        };
      });
      const invoiceCount = byDate.reduce((sum, row) => sum + row.invoice_count, 0);
      const gross = paiseToMoney(byDate.reduce((sum, row) => sum + moneyToPaise(row.gross_sales_inr), 0n));
      const returns = paiseToMoney(byDate.reduce((sum, row) => sum + moneyToPaise(row.returns_inr), 0n));
      return {
        range: rangeDto(range),
        summary: {
          invoice_count: invoiceCount,
          gross_sales_inr: gross,
          returns_inr: returns,
          net_sales_inr: paiseToMoney(moneyToPaise(gross) - moneyToPaise(returns)),
        },
        by_business_date: byDate,
      };
    },

    async getCollections(range: ReportRangeInput): Promise<CollectionsReport> {
      const result = await client.query<{
        method: CollectionsByMethodRow["method"];
        net_collected_inr: string | number;
        collection_count: string | number;
        outflow_count: string | number;
      }>(
        `
        SELECT
          method,
          sum(net_collected_inr)::numeric(18, 2) AS net_collected_inr,
          sum(collection_count)::bigint AS collection_count,
          sum(outflow_count)::bigint AS outflow_count
        FROM app.v_collections_by_method
        WHERE organization_id = $1
          AND received_business_date >= $2::date
          AND received_business_date <= $3::date
        GROUP BY method
        ORDER BY method
        `,
        [organizationId, boundFrom(range), boundTo(range)],
      );
      const byMethod: CollectionsByMethodRow[] = result.rows.map((row) => ({
        method: row.method,
        net_collected_inr: asMoney(row.net_collected_inr),
        collection_count: asInt(row.collection_count),
        outflow_count: asInt(row.outflow_count),
      }));
      return {
        range: rangeDto(range),
        total_net_collected_inr: paiseToMoney(
          byMethod.reduce((sum, row) => sum + moneyToPaise(row.net_collected_inr), 0n),
        ),
        collection_count: byMethod.reduce((sum, row) => sum + row.collection_count, 0),
        outflow_count: byMethod.reduce((sum, row) => sum + row.outflow_count, 0),
        by_method: byMethod,
      };
    },

    async getSalesDues(range: ReportRangeInput): Promise<SalesDuesSummary> {
      const openInvoices = await loadSalesDues(range);
      return {
        as_of_business_date: asOfDate(range),
        invoice_count: openInvoices.length,
        amount_due_inr: paiseToMoney(
          openInvoices.reduce((sum, row) => sum + moneyToPaise(row.amount_due_inr), 0n),
        ),
        open_invoices: openInvoices,
      };
    },

    async listSalesDues(range: ReportRangeInput): Promise<SalesDueRow[]> {
      return loadSalesDues(range);
    },

    async getInventory(): Promise<InventoryReport> {
      const result = await client.query<{
        category_id: string;
        category_name: string;
        metal: "gold" | "silver";
        purity: string;
        article_count: string | number;
        net_metal_weight_grams: string | number;
        gross_weight_grams: string | number;
      }>(
        `
        SELECT category_id, category_name, metal, purity, article_count, net_metal_weight_grams, gross_weight_grams
        FROM app.v_inventory_available
        WHERE organization_id = $1
        ORDER BY category_name, metal, purity
        `,
        [organizationId],
      );
      const byCategory: InventoryAvailableRow[] = result.rows.map((row) => ({
        category_id: row.category_id,
        category_name: row.category_name,
        metal: row.metal,
        purity: row.purity,
        article_count: asInt(row.article_count),
        net_metal_weight_grams: asGrams(row.net_metal_weight_grams),
        gross_weight_grams: asGrams(row.gross_weight_grams),
      }));
      return {
        available_article_count: byCategory.reduce((sum, row) => sum + row.article_count, 0),
        available_net_metal_weight_grams: gramsSum(byCategory.map((row) => row.net_metal_weight_grams)),
        by_category: byCategory,
      };
    },

    async getGirvi(range: ReportRangeInput): Promise<GirviReport> {
      const today = kolkataBusinessDate();
      const policy = await client.query<{
        active_account_count: string | number;
        principal_outstanding_inr: string | number;
        interest_outstanding_inr: string | number;
        unapproved_active_count: string | number;
        overdue_account_count: string | number;
        overdue_principal_outstanding_inr: string | number;
      }>(
        `
        SELECT
          count(*) FILTER (WHERE g.status = 'active')::bigint AS active_account_count,
          COALESCE(sum(g.principal_outstanding_inr) FILTER (WHERE g.status = 'active'), 0)::numeric(18, 2)
            AS principal_outstanding_inr,
          COALESCE(sum(g.interest_outstanding_inr) FILTER (WHERE g.status = 'active'), 0)::numeric(18, 2)
            AS interest_outstanding_inr,
          count(*) FILTER (
            WHERE g.status = 'active'
              AND (
                g.calculation_policy_version IS NULL
                OR p.status IS DISTINCT FROM 'approved'
              )
          )::bigint AS unapproved_active_count,
          count(*) FILTER (
            WHERE g.status = 'active' AND g.maturity_business_date < $2::date
          )::bigint AS overdue_account_count,
          COALESCE(sum(g.principal_outstanding_inr) FILTER (
            WHERE g.status = 'active' AND g.maturity_business_date < $2::date
          ), 0)::numeric(18, 2) AS overdue_principal_outstanding_inr
        FROM app.v_girvi_balances g
        LEFT JOIN app.girvi_calculation_policies p
          ON p.organization_id = g.organization_id
         AND p.version = g.calculation_policy_version
        WHERE g.organization_id = $1
        `,
        [organizationId, today],
      );
      const positionRow = policy.rows[0];
      const unapproved = asInt(positionRow?.unapproved_active_count);
      const interestAvailable = unapproved === 0;

      const activity = await client.query<{
        disbursed_inr: string | number;
        principal_recovered_inr: string | number;
        interest_received_inr: string | number;
      }>(
        `
        SELECT
          COALESCE(sum(amount_inr) FILTER (WHERE event_type = 'disbursement'), 0)::numeric(18, 2) AS disbursed_inr,
          COALESCE(sum(-principal_delta_inr) FILTER (
            WHERE event_type IN ('repayment', 'settlement') AND principal_delta_inr < 0
          ), 0)::numeric(18, 2) AS principal_recovered_inr,
          COALESCE(sum(-interest_delta_inr) FILTER (
            WHERE event_type IN ('repayment', 'settlement') AND interest_delta_inr < 0
          ), 0)::numeric(18, 2) AS interest_received_inr
        FROM app.girvi_financial_events
        WHERE organization_id = $1
          AND effective_business_date >= $2::date
          AND effective_business_date <= $3::date
        `,
        [organizationId, boundFrom(range), boundTo(range)],
      );

      const maturities = await client.query<{
        girvi_account_id: string;
        account_number: string;
        customer_id: string;
        customer_display_name: string;
        maturity_business_date: string;
        principal_outstanding_inr: string | number;
        interest_outstanding_inr: string | number;
        status: string;
      }>(
        `
        SELECT girvi_account_id, account_number, customer_id, customer_display_name,
               maturity_business_date::text, principal_outstanding_inr, interest_outstanding_inr, status
        FROM app.v_girvi_balances
        WHERE organization_id = $1
          AND status = 'active'
          AND maturity_business_date >= $2::date
          AND maturity_business_date <= ($2::date + 30)
        ORDER BY maturity_business_date, account_number
        LIMIT 12
        `,
        [organizationId, today],
      );

      const upcoming: GirviMaturityRow[] = maturities.rows.map((row) => ({
        girvi_account_id: row.girvi_account_id,
        account_number: row.account_number,
        customer_id: row.customer_id,
        customer_display_name: row.customer_display_name,
        maturity_business_date: row.maturity_business_date,
        principal_outstanding_inr: asMoney(row.principal_outstanding_inr),
        interest_outstanding_inr: interestAvailable ? asMoney(row.interest_outstanding_inr) : "0.00",
        is_overdue: girviAccountIsOverdue({
          status: row.status,
          maturityBusinessDate: row.maturity_business_date,
          asOfBusinessDate: today,
        }),
      }));

      return {
        range: rangeDto(range),
        position: {
          active_account_count: asInt(positionRow?.active_account_count),
          principal_outstanding_inr: asMoney(positionRow?.principal_outstanding_inr),
          interest_availability: interestAvailable ? "available" : "unavailable",
          interest_outstanding_inr: interestAvailable ? asMoney(positionRow?.interest_outstanding_inr) : null,
          interest_unavailable_reason: interestAvailable
            ? null
            : "Interest is unavailable because one or more active accounts use a calculation policy that is not approved.",
          overdue_account_count: asInt(positionRow?.overdue_account_count),
          overdue_principal_outstanding_inr: asMoney(positionRow?.overdue_principal_outstanding_inr),
        },
        activity: {
          disbursed_inr: asMoney(activity.rows[0]?.disbursed_inr),
          principal_recovered_inr: asMoney(activity.rows[0]?.principal_recovered_inr),
          interest_received_inr: asMoney(activity.rows[0]?.interest_received_inr),
        },
        upcoming_maturities: upcoming,
      };
    },

    async listGirviBalances(): Promise<
      Array<{
        account_number: string;
        customer_display_name: string;
        status: string;
        maturity_business_date: string;
        principal_outstanding_inr: string;
        interest_outstanding_inr: string;
      }>
    > {
      const result = await client.query<{
        account_number: string;
        customer_display_name: string;
        status: string;
        maturity_business_date: string;
        principal_outstanding_inr: string | number;
        interest_outstanding_inr: string | number;
      }>(
        `
        SELECT account_number, customer_display_name, status, maturity_business_date::text,
               principal_outstanding_inr, interest_outstanding_inr
        FROM app.v_girvi_balances
        WHERE organization_id = $1
        ORDER BY account_number
        `,
        [organizationId],
      );
      return result.rows.map((row) => ({
        account_number: row.account_number,
        customer_display_name: row.customer_display_name,
        status: row.status,
        maturity_business_date: row.maturity_business_date,
        principal_outstanding_inr: asMoney(row.principal_outstanding_inr),
        interest_outstanding_inr: asMoney(row.interest_outstanding_inr),
      }));
    },

    async getOperations(range: ReportRangeInput): Promise<OperationsAttention> {
      const latest = await client.query<{ counted_on: string | null }>(
        `
        SELECT counted_on::text
        FROM app.stock_counts
        WHERE organization_id = $1
        ORDER BY counted_on DESC, created_at DESC
        LIMIT 1
        `,
        [organizationId],
      );
      const discrepancies = await client.query<{ count: string | number }>(
        `
        SELECT count(*)::bigint AS count
        FROM app.stock_count_lines l
        JOIN app.stock_counts s
          ON s.id = l.stock_count_id
         AND s.organization_id = l.organization_id
        WHERE l.organization_id = $1
          AND l.has_discrepancy
          AND s.counted_on >= $2::date
          AND s.counted_on <= $3::date
        `,
        [organizationId, boundFrom(range), boundTo(range)],
      );
      const notifications = await client.query<{
        failed_notification_count: string | number;
        unknown_notification_count: string | number;
      }>(
        `
        SELECT
          count(*) FILTER (WHERE status = 'failed')::bigint AS failed_notification_count,
          count(*) FILTER (WHERE status = 'unknown')::bigint AS unknown_notification_count
        FROM app.notifications
        WHERE organization_id = $1
          AND (timezone('Asia/Kolkata', created_at))::date >= $2::date
          AND (timezone('Asia/Kolkata', created_at))::date <= $3::date
        `,
        [organizationId, boundFrom(range), boundTo(range)],
      );
      return {
        stock_discrepancy_count: asInt(discrepancies.rows[0]?.count),
        latest_stock_count_on: latest.rows[0]?.counted_on ?? null,
        failed_notification_count: asInt(notifications.rows[0]?.failed_notification_count),
        unknown_notification_count: asInt(notifications.rows[0]?.unknown_notification_count),
      };
    },

    async countExportRows(exportType: ExportType, range: ReportRangeInput): Promise<number> {
      switch (exportType) {
        case "sales": {
          const sales = await this.getSales(range);
          return sales.by_business_date.length;
        }
        case "dues": {
          const dues = await this.listSalesDues(range);
          return dues.length;
        }
        case "inventory": {
          const inventory = await this.getInventory();
          return inventory.by_category.length;
        }
        case "girvi": {
          const count = await client.query<{ count: string | number }>(
            `SELECT count(*)::bigint AS count FROM app.v_girvi_balances WHERE organization_id = $1`,
            [organizationId],
          );
          return asInt(count.rows[0]?.count) + 3;
        }
        default:
          return 0;
      }
    },

    async insertExportJob(input: {
      exportType: ExportType;
      range: ReportRangeInput;
      requestedByStaffUserId: string;
    }): Promise<string> {
      const result = await client.query<{ id: string }>(
        `
        INSERT INTO app.export_jobs (
          organization_id, export_type, filters, status, requested_by_staff_user_id
        ) VALUES ($1, $2, $3::jsonb, 'pending', $4)
        RETURNING id
        `,
        [
          organizationId,
          input.exportType,
          JSON.stringify({
            ...(input.range.from ? { business_date_from: input.range.from } : {}),
            ...(input.range.to ? { business_date_to: input.range.to } : {}),
          }),
          input.requestedByStaffUserId,
        ],
      );
      return result.rows[0]!.id;
    },

    async getExportJob(id: string): Promise<ExportJobRecord | null> {
      const result = await client.query<{
        id: string;
        export_type: ExportType;
        filters: { business_date_from?: string; business_date_to?: string };
        status: ExportJobStatus;
        row_count: number | null;
        stored_object_id: string | null;
        object_key: string | null;
        last_error: string | null;
        requested_by_staff_user_id: string;
      }>(
        `
        SELECT
          j.id, j.export_type, j.filters, j.status, j.row_count, j.stored_object_id,
          o.object_key, j.last_error, j.requested_by_staff_user_id
        FROM app.export_jobs j
        LEFT JOIN app.stored_objects o
          ON o.id = j.stored_object_id
         AND o.organization_id = j.organization_id
        WHERE j.organization_id = $1 AND j.id = $2
        `,
        [organizationId, id],
      );
      const row = result.rows[0];
      if (!row) {
        return null;
      }
      return {
        id: row.id,
        exportType: row.export_type,
        filters: row.filters ?? {},
        status: row.status,
        rowCount: row.row_count,
        storedObjectId: row.stored_object_id,
        storedObjectKey: row.object_key,
        lastError: row.last_error,
        requestedByStaffUserId: row.requested_by_staff_user_id,
      };
    },

    async listPendingExportJobs(limit = 10): Promise<ExportJobRecord[]> {
      const result = await client.query<{ id: string }>(
        `
        SELECT id
        FROM app.export_jobs
        WHERE organization_id = $1 AND status = 'pending'
        ORDER BY created_at ASC
        LIMIT $2
        `,
        [organizationId, limit],
      );
      const jobs: ExportJobRecord[] = [];
      for (const row of result.rows) {
        const job = await this.getExportJob(row.id);
        if (job) {
          jobs.push(job);
        }
      }
      return jobs;
    },

    async markExportJobRunning(id: string): Promise<void> {
      await client.query(
        `
        UPDATE app.export_jobs
        SET status = 'running', updated_at = timezone('utc', now())
        WHERE organization_id = $1 AND id = $2 AND status = 'pending'
        `,
        [organizationId, id],
      );
    },

    async markExportJobReady(input: {
      id: string;
      storedObjectId: string;
      rowCount: number;
    }): Promise<void> {
      await client.query(
        `
        UPDATE app.export_jobs
        SET status = 'ready', stored_object_id = $3, row_count = $4, last_error = NULL,
            updated_at = timezone('utc', now())
        WHERE organization_id = $1 AND id = $2
        `,
        [organizationId, input.id, input.storedObjectId, input.rowCount],
      );
    },

    async markExportJobFailed(id: string, error: string): Promise<void> {
      await client.query(
        `
        UPDATE app.export_jobs
        SET status = 'failed', last_error = $3, updated_at = timezone('utc', now())
        WHERE organization_id = $1 AND id = $2
        `,
        [organizationId, id, error],
      );
    },

    async insertExportStoredObject(input: {
      objectKey: string;
      checksumSha256: string;
      byteSize: number;
      ownerId: string;
    }): Promise<string> {
      const result = await client.query<{ id: string }>(
        `
        INSERT INTO app.stored_objects (
          organization_id, bucket, object_key, checksum_sha256, content_type, byte_size,
          owner_type, owner_id, visibility, upload_confirmed_at
        ) VALUES ($1, 'shop-assets', $2, $3, 'text/csv', $4, 'export', $5, 'private', timezone('utc', now()))
        RETURNING id
        `,
        [organizationId, input.objectKey, input.checksumSha256, input.byteSize, input.ownerId],
      );
      return result.rows[0]!.id;
    },
  };
}

export async function listOrganizationsNeedingExportWork(client: PoolClient): Promise<string[]> {
  const result = await client.query<{ organization_id: string }>(
    `
    SELECT DISTINCT organization_id
    FROM app.export_jobs
    WHERE status = 'pending'
    ORDER BY organization_id
    `,
  );
  return result.rows.map((row) => row.organization_id);
}

function moneyToPaise(amount: string): bigint {
  const negative = amount.startsWith("-");
  const raw = negative ? amount.slice(1) : amount;
  const [whole = "0", fraction = ""] = raw.split(".");
  const paise = BigInt(whole) * 100n + BigInt(`${fraction}00`.slice(0, 2));
  return negative ? -paise : paise;
}

function paiseToMoney(paise: bigint): string {
  const negative = paise < 0n;
  const absolute = negative ? -paise : paise;
  const whole = absolute / 100n;
  const fraction = absolute % 100n;
  return `${negative ? "-" : ""}${whole.toString()}.${fraction.toString().padStart(2, "0")}`;
}

function gramsSum(values: string[]): string {
  let tenths = 0n;
  for (const value of values) {
    const [whole = "0", fraction = ""] = value.split(".");
    tenths += BigInt(whole) * 10000n + BigInt(`${fraction}0000`.slice(0, 4));
  }
  const whole = tenths / 10000n;
  const fraction = tenths % 10000n;
  return `${whole.toString()}.${fraction.toString().padStart(4, "0")}`;
}
