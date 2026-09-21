import { z } from "zod";

import { refineBusinessDateBounds } from "./business-date-range";
import { businessDateSchema } from "./shop";

const moneyAmountSchema = z
  .string()
  .regex(/^-?\d+(\.\d{1,2})?$/, "Use a money decimal string with at most 2 fractional digits.");

const gramsAmountSchema = z
  .string()
  .regex(/^-?\d+(\.\d{1,4})?$/, "Use a weight decimal string with at most 4 fractional digits.");

/**
 * Inclusive business-date range for every report. Omitting both bounds means
 * all-time; the shared refine caps the span so a range cannot scan unbounded
 * history.
 */
export const reportRangeQuerySchema = z
  .object({
    business_date_from: businessDateSchema.optional(),
    business_date_to: businessDateSchema.optional(),
  })
  .superRefine((value, ctx) => {
    refineBusinessDateBounds(
      { from: value.business_date_from, to: value.business_date_to },
      ctx,
      {
        exact: "business_date_from",
        from: "business_date_from",
        to: "business_date_to",
      },
    );
  });

export type ReportRangeQuery = z.infer<typeof reportRangeQuerySchema>;

export const reportRangeSchema = z.object({
  business_date_from: businessDateSchema.nullable(),
  business_date_to: businessDateSchema.nullable(),
});

export type ReportRange = z.infer<typeof reportRangeSchema>;

export const reportMetricSectionSchema = z.enum(["sales", "collections", "inventory", "girvi", "operations"]);
export type ReportMetricSection = z.infer<typeof reportMetricSectionSchema>;

/**
 * Sales measured from finalized invoices only, net of credit notes.
 * `net_sales_inr` = `gross_sales_inr` - `returns_inr`.
 */
export const salesSummarySchema = z.object({
  invoice_count: z.number().int().nonnegative(),
  gross_sales_inr: moneyAmountSchema,
  returns_inr: moneyAmountSchema,
  net_sales_inr: moneyAmountSchema,
});

export type SalesSummary = z.infer<typeof salesSummarySchema>;

export const salesByDateRowSchema = z.object({
  business_date: businessDateSchema,
  invoice_count: z.number().int().nonnegative(),
  gross_sales_inr: moneyAmountSchema,
  returns_inr: moneyAmountSchema,
  net_sales_inr: moneyAmountSchema,
});

export type SalesByDateRow = z.infer<typeof salesByDateRowSchema>;

export const salesReportSchema = z.object({
  range: reportRangeSchema,
  summary: salesSummarySchema,
  by_business_date: z.array(salesByDateRowSchema),
});

export type SalesReport = z.infer<typeof salesReportSchema>;

export const collectionMethodSchema = z.enum(["cash", "upi", "card", "bank"]);
export type CollectionMethod = z.infer<typeof collectionMethodSchema>;

/**
 * Collections are posted sales payments minus refunds and reversals. Girvi money
 * is never recorded in payments, so it cannot be counted here.
 */
export const collectionsByMethodRowSchema = z.object({
  method: collectionMethodSchema,
  net_collected_inr: moneyAmountSchema,
  collection_count: z.number().int().nonnegative(),
  outflow_count: z.number().int().nonnegative(),
});

export type CollectionsByMethodRow = z.infer<typeof collectionsByMethodRowSchema>;

export const collectionsByDateRowSchema = z.object({
  business_date: businessDateSchema,
  net_collected_inr: moneyAmountSchema,
  collection_count: z.number().int().nonnegative(),
  outflow_count: z.number().int().nonnegative(),
});

export type CollectionsByDateRow = z.infer<typeof collectionsByDateRowSchema>;

export const collectionsReportSchema = z.object({
  range: reportRangeSchema,
  total_net_collected_inr: moneyAmountSchema,
  collection_count: z.number().int().nonnegative(),
  outflow_count: z.number().int().nonnegative(),
  by_method: z.array(collectionsByMethodRowSchema),
  by_business_date: z.array(collectionsByDateRowSchema),
});

export type CollectionsReport = z.infer<typeof collectionsReportSchema>;

export const salesDueRowSchema = z.object({
  invoice_id: z.string().uuid(),
  invoice_number: z.string().min(1),
  business_date: businessDateSchema,
  customer_id: z.string().uuid(),
  customer_display_name: z.string().min(1),
  grand_total_inr: moneyAmountSchema,
  amount_paid_inr: moneyAmountSchema,
  amount_due_inr: moneyAmountSchema,
});

export type SalesDueRow = z.infer<typeof salesDueRowSchema>;

/**
 * Customer sales dues are reconstructed as of the range end from invoices,
 * credits, and allocations. `open_invoices` are the rows behind the tile.
 */
export const salesDuesSummarySchema = z.object({
  as_of_business_date: businessDateSchema.nullable(),
  invoice_count: z.number().int().nonnegative(),
  amount_due_inr: moneyAmountSchema,
  open_invoices: z.array(salesDueRowSchema),
});

export type SalesDuesSummary = z.infer<typeof salesDuesSummarySchema>;

export const inventoryAvailableRowSchema = z.object({
  category_id: z.string().uuid(),
  category_name: z.string().min(1),
  metal: z.enum(["gold", "silver"]),
  purity: z.string().min(1),
  article_count: z.number().int().nonnegative(),
  net_metal_weight_grams: gramsAmountSchema,
  gross_weight_grams: gramsAmountSchema,
});

export type InventoryAvailableRow = z.infer<typeof inventoryAvailableRowSchema>;

export const inventoryReportSchema = z.object({
  available_article_count: z.number().int().nonnegative(),
  available_net_metal_weight_grams: gramsAmountSchema,
  by_category: z.array(inventoryAvailableRowSchema),
});

export type InventoryReport = z.infer<typeof inventoryReportSchema>;

/**
 * Accrued unpaid interest is only reported when every active account's frozen
 * policy version is approved. Otherwise the tile is `unavailable` with a reason
 * instead of a zero that pretends to be calculated.
 */
export const girviInterestAvailabilitySchema = z.enum(["available", "unavailable"]);
export type GirviInterestAvailability = z.infer<typeof girviInterestAvailabilitySchema>;

export const girviPositionSchema = z.object({
  active_account_count: z.number().int().nonnegative(),
  principal_outstanding_inr: moneyAmountSchema,
  interest_availability: girviInterestAvailabilitySchema,
  interest_outstanding_inr: moneyAmountSchema.nullable(),
  interest_unavailable_reason: z.string().min(1).nullable(),
  unapproved_active_account_count: z.number().int().nonnegative(),
  overdue_account_count: z.number().int().nonnegative(),
  overdue_principal_outstanding_inr: moneyAmountSchema,
});

export type GirviPosition = z.infer<typeof girviPositionSchema>;

export const girviActivitySchema = z.object({
  disbursed_inr: moneyAmountSchema,
  principal_recovered_inr: moneyAmountSchema,
  interest_received_inr: moneyAmountSchema,
});

export type GirviActivity = z.infer<typeof girviActivitySchema>;

export const girviMaturityRowSchema = z.object({
  girvi_account_id: z.string().uuid(),
  account_number: z.string().min(1),
  customer_id: z.string().uuid(),
  customer_display_name: z.string().min(1),
  maturity_business_date: businessDateSchema,
  principal_outstanding_inr: moneyAmountSchema,
  interest_outstanding_inr: moneyAmountSchema,
  is_overdue: z.boolean(),
});

export type GirviMaturityRow = z.infer<typeof girviMaturityRowSchema>;

export const girviReportSchema = z.object({
  range: reportRangeSchema,
  position: girviPositionSchema,
  activity: girviActivitySchema,
  upcoming_maturities: z.array(girviMaturityRowSchema),
});

export type GirviReport = z.infer<typeof girviReportSchema>;

/** Operational attention: nothing here is a financial measure. */
export const operationsAttentionSchema = z.object({
  stock_discrepancy_count: z.number().int().nonnegative(),
  latest_stock_count_on: businessDateSchema.nullable(),
  failed_notification_count: z.number().int().nonnegative(),
  unknown_notification_count: z.number().int().nonnegative(),
});

export type OperationsAttention = z.infer<typeof operationsAttentionSchema>;

/**
 * Dashboard sections are omitted entirely when the role may not read them.
 * A `null` section means "not authorized", not "zero".
 */
export const dashboardReportSchema = z.object({
  range: reportRangeSchema,
  sections: z.array(reportMetricSectionSchema),
  sales: salesReportSchema.nullable(),
  collections: collectionsReportSchema.nullable(),
  sales_dues: salesDuesSummarySchema.nullable(),
  inventory: inventoryReportSchema.nullable(),
  girvi: girviReportSchema.nullable(),
  operations: operationsAttentionSchema.nullable(),
});

export type DashboardReport = z.infer<typeof dashboardReportSchema>;

export const exportTypeSchema = z.enum(["inventory", "sales", "dues", "collections", "girvi"]);
export type ExportType = z.infer<typeof exportTypeSchema>;

export const exportJobStatusSchema = z.enum(["pending", "running", "ready", "failed"]);
export type ExportJobStatus = z.infer<typeof exportJobStatusSchema>;

export const exportCreateSchema = z
  .object({
    export_type: exportTypeSchema,
    business_date_from: businessDateSchema.optional(),
    business_date_to: businessDateSchema.optional(),
  })
  .superRefine((value, ctx) => {
    refineBusinessDateBounds(
      { from: value.business_date_from, to: value.business_date_to },
      ctx,
      {
        exact: "business_date_from",
        from: "business_date_from",
        to: "business_date_to",
      },
    );
  });

export type ExportCreate = z.infer<typeof exportCreateSchema>;

/**
 * Small exports return CSV inline so the browser can save it without a public
 * bucket. Larger ones become a queued job the worker renders to private storage.
 */
export const exportResultSchema = z.object({
  export_type: exportTypeSchema,
  range: reportRangeSchema,
  delivery: z.enum(["inline", "queued"]),
  row_count: z.number().int().nonnegative(),
  filename: z.string().min(1).nullable(),
  csv: z.string().nullable(),
  export_job_id: z.string().uuid().nullable(),
  status: exportJobStatusSchema,
  download_url: z.string().url().nullable(),
});

export type ExportResult = z.infer<typeof exportResultSchema>;

/** Inline CSV bound; above this an export is queued instead of streamed. */
export const MAX_INLINE_EXPORT_ROWS = 5_000;
