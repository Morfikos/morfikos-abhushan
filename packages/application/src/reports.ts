import { createHash, randomUUID } from "node:crypto";

import type {
  CollectionsReport,
  DashboardReport,
  ExportCreate,
  ExportResult,
  ExportType,
  GirviReport,
  InventoryReport,
  ReportMetricSection,
  ReportRangeQuery,
  SalesReport,
  StaffRole,
} from "@aabhushan/contracts";
import { MAX_INLINE_EXPORT_ROWS } from "@aabhushan/contracts";
import { kolkataBusinessDate } from "@aabhushan/domain";

import { assertAnyPermission, assertPermission } from "./authorize";
import { notFoundError, permissionDeniedError } from "./http-error";
import type { ResolvedStaffAccess } from "./staff-access";
import type { ShopAssetStorage } from "./shop-settings";

export const EXPORT_SIGNED_URL_SECONDS = 900;

export type ReportRangeInput = {
  from?: string;
  to?: string;
};

export type ReportsRepository = {
  getSales(range: ReportRangeInput): Promise<SalesReport>;
  getCollections(range: ReportRangeInput): Promise<CollectionsReport>;
  getSalesDues(range: ReportRangeInput): Promise<DashboardReport["sales_dues"]>;
  listSalesDues(range: ReportRangeInput): Promise<
    Array<{
      invoice_id: string;
      invoice_number: string;
      business_date: string;
      customer_id: string;
      customer_display_name: string;
      grand_total_inr: string;
      amount_paid_inr: string;
      amount_due_inr: string;
    }>
  >;
  getInventory(): Promise<InventoryReport>;
  getGirvi(range: ReportRangeInput): Promise<GirviReport>;
  listGirviBalances(): Promise<
    Array<{
      account_number: string;
      customer_display_name: string;
      status: string;
      maturity_business_date: string;
      principal_outstanding_inr: string;
      interest_outstanding_inr: string;
    }>
  >;
  getOperations(range: ReportRangeInput): Promise<DashboardReport["operations"]>;
  countExportRows(exportType: ExportType, range: ReportRangeInput): Promise<number>;
  insertExportJob(input: {
    exportType: ExportType;
    range: ReportRangeInput;
    requestedByStaffUserId: string;
  }): Promise<string>;
  getExportJob(id: string): Promise<{
    id: string;
    exportType: ExportType;
    filters: { business_date_from?: string; business_date_to?: string };
    status: ExportResult["status"];
    rowCount: number | null;
    storedObjectId: string | null;
    storedObjectKey: string | null;
    lastError: string | null;
    requestedByStaffUserId: string;
  } | null>;
  listPendingExportJobs(limit?: number): Promise<
    Array<{
      id: string;
      exportType: ExportType;
      filters: { business_date_from?: string; business_date_to?: string };
      status: ExportResult["status"];
    }>
  >;
  markExportJobRunning(id: string): Promise<void>;
  markExportJobReady(input: { id: string; storedObjectId: string; rowCount: number }): Promise<void>;
  markExportJobFailed(id: string, error: string): Promise<void>;
  insertExportStoredObject(input: {
    objectKey: string;
    checksumSha256: string;
    byteSize: number;
    ownerId: string;
  }): Promise<string>;
};

/** Spec 03 `reports.read` is limited by role. Unauthorized sections are omitted, not zeroed. */
export function dashboardSectionsForRole(role: StaffRole): ReportMetricSection[] {
  switch (role) {
    case "owner":
    case "admin":
      return ["sales", "collections", "inventory", "girvi", "operations"];
    case "billing":
      return ["sales", "collections", "operations"];
    case "inventory":
      return ["inventory", "operations"];
    case "girvi":
      return ["girvi", "operations"];
    default:
      return [];
  }
}

function rangeFromQuery(query: ReportRangeQuery): ReportRangeInput {
  return {
    ...(query.business_date_from ? { from: query.business_date_from } : {}),
    ...(query.business_date_to ? { to: query.business_date_to } : {}),
  };
}

function assertSalesReports(access: ResolvedStaffAccess): void {
  assertPermission(access, "reports.read");
  const role = access.membership.role;
  if (role !== "owner" && role !== "admin" && role !== "billing") {
    throw permissionDeniedError("This role cannot read sales or collections reports.");
  }
}

function assertInventoryReports(access: ResolvedStaffAccess): void {
  const role = access.membership.role;
  if (role === "owner" || role === "admin" || role === "inventory") {
    assertAnyPermission(access, ["reports.read", "inventory.read"]);
    return;
  }
  throw permissionDeniedError("This role cannot read inventory reports.");
}

function assertGirviReports(access: ResolvedStaffAccess): void {
  const role = access.membership.role;
  if (role === "owner" || role === "admin" || role === "girvi") {
    assertAnyPermission(access, ["reports.read", "girvi.write"]);
    return;
  }
  throw permissionDeniedError("This role cannot read Girvi reports.");
}

function assertExportType(access: ResolvedStaffAccess, exportType: ExportType): void {
  assertPermission(access, "reports.read");
  if (exportType === "sales" || exportType === "dues") {
    assertSalesReports(access);
    return;
  }
  if (exportType === "inventory") {
    assertInventoryReports(access);
    return;
  }
  assertGirviReports(access);
}

export async function getDashboardReport(
  access: ResolvedStaffAccess,
  repo: ReportsRepository,
  query: ReportRangeQuery,
): Promise<DashboardReport> {
  assertPermission(access, "reports.read");
  const range = rangeFromQuery(query);
  const sections = dashboardSectionsForRole(access.membership.role);
  const include = (section: ReportMetricSection) => sections.includes(section);

  const sales = include("sales") ? await repo.getSales(range) : null;
  const collections = include("collections") ? await repo.getCollections(range) : null;
  const salesDues = include("sales") ? await repo.getSalesDues(range) : null;
  const inventory = include("inventory") ? await repo.getInventory() : null;
  const girvi = include("girvi") ? await repo.getGirvi(range) : null;
  const operations = include("operations") ? await repo.getOperations(range) : null;

  return {
    range: {
      business_date_from: query.business_date_from ?? null,
      business_date_to: query.business_date_to ?? null,
    },
    sections,
    sales,
    collections,
    sales_dues: salesDues,
    inventory,
    girvi,
    operations,
  };
}

export async function getSalesReport(
  access: ResolvedStaffAccess,
  repo: ReportsRepository,
  query: ReportRangeQuery,
): Promise<SalesReport> {
  assertSalesReports(access);
  return repo.getSales(rangeFromQuery(query));
}

export async function getCollectionsReport(
  access: ResolvedStaffAccess,
  repo: ReportsRepository,
  query: ReportRangeQuery,
): Promise<CollectionsReport> {
  assertSalesReports(access);
  return repo.getCollections(rangeFromQuery(query));
}

export async function getInventoryReport(
  access: ResolvedStaffAccess,
  repo: ReportsRepository,
): Promise<InventoryReport> {
  assertInventoryReports(access);
  return repo.getInventory();
}

export async function getGirviReport(
  access: ResolvedStaffAccess,
  repo: ReportsRepository,
  query: ReportRangeQuery,
): Promise<GirviReport> {
  assertGirviReports(access);
  return repo.getGirvi(rangeFromQuery(query));
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replaceAll("\"", "\"\"")}"`;
  }
  return value;
}

function csvLines(headers: string[], rows: string[][]): string {
  return [headers, ...rows].map((line) => line.map(csvEscape).join(",")).join("\n") + "\n";
}

export async function buildExportCsv(
  repo: ReportsRepository,
  exportType: ExportType,
  range: ReportRangeInput,
): Promise<{ csv: string; rowCount: number; filename: string }> {
  const stamp = `${range.from ?? "all"}-${range.to ?? kolkataBusinessDate()}`;
  if (exportType === "sales") {
    const sales = await repo.getSales(range);
    const csv = csvLines(
      ["business_date", "invoice_count", "gross_sales_inr", "returns_inr", "net_sales_inr"],
      sales.by_business_date.map((row) => [
        row.business_date,
        String(row.invoice_count),
        row.gross_sales_inr,
        row.returns_inr,
        row.net_sales_inr,
      ]),
    );
    return { csv, rowCount: sales.by_business_date.length, filename: `sales-${stamp}.csv` };
  }
  if (exportType === "dues") {
    const dues = await repo.listSalesDues(range);
    const csv = csvLines(
      [
        "invoice_number",
        "business_date",
        "customer_display_name",
        "grand_total_inr",
        "amount_paid_inr",
        "amount_due_inr",
      ],
      dues.map((row) => [
        row.invoice_number,
        row.business_date,
        row.customer_display_name,
        row.grand_total_inr,
        row.amount_paid_inr,
        row.amount_due_inr,
      ]),
    );
    return { csv, rowCount: dues.length, filename: `dues-${stamp}.csv` };
  }
  if (exportType === "inventory") {
    const inventory = await repo.getInventory();
    const csv = csvLines(
      ["category_name", "metal", "purity", "article_count", "net_metal_weight_grams", "gross_weight_grams"],
      inventory.by_category.map((row) => [
        row.category_name,
        row.metal,
        row.purity,
        String(row.article_count),
        row.net_metal_weight_grams,
        row.gross_weight_grams,
      ]),
    );
    return { csv, rowCount: inventory.by_category.length, filename: `inventory-${stamp}.csv` };
  }

  const girvi = await repo.getGirvi(range);
  const accounts = await repo.listGirviBalances();
  const girviRows = [
    ["activity", "disbursed", girvi.activity.disbursed_inr, "", "", "", "", ""],
    ["activity", "principal_recovered", girvi.activity.principal_recovered_inr, "", "", "", "", ""],
    ["activity", "interest_received", girvi.activity.interest_received_inr, "", "", "", "", ""],
    ...accounts.map((row) => [
      "account",
      "",
      "",
      row.account_number,
      row.customer_display_name,
      row.maturity_business_date,
      row.principal_outstanding_inr,
      row.interest_outstanding_inr,
    ]),
  ];
  const csv = csvLines(
    [
      "kind",
      "metric",
      "amount_inr",
      "account_number",
      "customer_display_name",
      "maturity_business_date",
      "principal_outstanding_inr",
      "interest_outstanding_inr",
    ],
    girviRows,
  );
  return { csv, rowCount: girviRows.length, filename: `girvi-${stamp}.csv` };
}

export async function createExport(
  access: ResolvedStaffAccess,
  repo: ReportsRepository,
  input: ExportCreate,
): Promise<ExportResult> {
  assertExportType(access, input.export_type);
  const range = {
    ...(input.business_date_from ? { from: input.business_date_from } : {}),
    ...(input.business_date_to ? { to: input.business_date_to } : {}),
  };
  const rowCount = await repo.countExportRows(input.export_type, range);
  const rangeDto = {
    business_date_from: input.business_date_from ?? null,
    business_date_to: input.business_date_to ?? null,
  };

  if (rowCount > MAX_INLINE_EXPORT_ROWS) {
    const id = await repo.insertExportJob({
      exportType: input.export_type,
      range,
      requestedByStaffUserId: access.staff_user_id,
    });
    return {
      export_type: input.export_type,
      range: rangeDto,
      delivery: "queued",
      row_count: rowCount,
      filename: null,
      csv: null,
      export_job_id: id,
      status: "pending",
      download_url: null,
    };
  }

  const built = await buildExportCsv(repo, input.export_type, range);
  return {
    export_type: input.export_type,
    range: rangeDto,
    delivery: "inline",
    row_count: built.rowCount,
    filename: built.filename,
    csv: built.csv,
    export_job_id: null,
    status: "ready",
    download_url: null,
  };
}

export async function getExportJob(
  access: ResolvedStaffAccess,
  repo: ReportsRepository,
  storage: ShopAssetStorage | null,
  id: string,
): Promise<ExportResult> {
  assertPermission(access, "reports.read");
  const job = await repo.getExportJob(id);
  if (!job) {
    throw notFoundError("Export job was not found.");
  }
  assertExportType(access, job.exportType);
  const range = {
    business_date_from: job.filters.business_date_from ?? null,
    business_date_to: job.filters.business_date_to ?? null,
  };
  let downloadUrl: string | null = null;
  if (job.status === "ready" && job.storedObjectKey && storage) {
    downloadUrl = await storage.createSignedUrl(job.storedObjectKey, EXPORT_SIGNED_URL_SECONDS);
  }
  return {
    export_type: job.exportType,
    range,
    delivery: "queued",
    row_count: job.rowCount ?? 0,
    filename: job.storedObjectKey ? `${job.exportType}.csv` : null,
    csv: null,
    export_job_id: job.id,
    status: job.status,
    download_url: downloadUrl,
  };
}

export async function processQueuedExport(
  repo: ReportsRepository,
  storage: ShopAssetStorage,
  organizationId: string,
  jobId: string,
): Promise<void> {
  const job = await repo.getExportJob(jobId);
  if (!job || job.status !== "pending") {
    return;
  }
  await repo.markExportJobRunning(jobId);
  try {
    const range = {
      ...(job.filters.business_date_from ? { from: job.filters.business_date_from } : {}),
      ...(job.filters.business_date_to ? { to: job.filters.business_date_to } : {}),
    };
    const built = await buildExportCsv(repo, job.exportType, range);
    const bytes = Buffer.from(built.csv, "utf8");
    const objectKey = `${organizationId}/export/${job.exportType}/${jobId}/${randomUUID()}.csv`;
    const uploaded = await storage.uploadPrivateObject({
      objectKey,
      bytes,
      contentType: "text/csv",
      upsert: true,
    });
    const storedObjectId = await repo.insertExportStoredObject({
      objectKey: uploaded.objectKey,
      checksumSha256: uploaded.checksumSha256 || createHash("sha256").update(bytes).digest("hex"),
      byteSize: uploaded.byteSize,
      ownerId: jobId,
    });
    await repo.markExportJobReady({ id: jobId, storedObjectId, rowCount: built.rowCount });
  } catch (error) {
    const message = error instanceof Error ? error.message : "EXPORT_FAILED";
    await repo.markExportJobFailed(jobId, message);
    throw error;
  }
}

