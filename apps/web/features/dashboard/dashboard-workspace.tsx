"use client";

import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import type { ReportMetricSection } from "@aabhushan/contracts";
import type { CalendarDate, DateValue } from "@internationalized/date";
import { parseDate } from "@internationalized/date";
import type { DateRange } from "react-aria-components";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { DatePicker } from "@/components/application/date-picker/date-picker";
import { DateRangePicker } from "@/components/application/date-picker/date-range-picker";
import { EmptyState } from "@/components/application/empty-state/empty-state";
import {
  ChartSkeleton,
  MetricTilesSkeleton,
  PanelSkeleton,
  TableSkeleton,
} from "@/components/application/skeleton/skeleton";
import { Table, TableCard } from "@/components/application/table/table";
import { ChartLegendContent, ChartTooltipContent } from "@/components/application/charts/charts-base";
import { Button } from "@/components/base/buttons/button";
import { ButtonGroup, ButtonGroupItem } from "@/components/base/button-group/button-group";
import { staffHasPermission, useStaff } from "@/features/auth/staff-shell";
import { formatInr } from "@/lib/money";
import { paymentMethodLabel } from "@/lib/payment-methods";
import {
  boundsForPeriod,
  kolkataTodayCalendar,
  periodCaption,
  type PeriodPreset,
} from "@/lib/period-bounds";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { createExportRequest, fetchDashboardReport, fetchExportJob, StaffApiError } from "@/lib/staff-api";
import { cx } from "@/utils/cx";

const ALL_DASHBOARD_SECTIONS: ReportMetricSection[] = [
  "sales",
  "collections",
  "inventory",
  "girvi",
  "operations",
];

const SECTION_LABELS: Record<ReportMetricSection, string> = {
  sales: "Sales",
  collections: "Collections",
  inventory: "Inventory",
  girvi: "Girvi",
  operations: "Operations",
};

const PERIOD_PRESETS: { id: PeriodPreset; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "custom", label: "Custom" },
];

function asCalendarDate(value: DateValue | null | undefined): CalendarDate | null {
  if (!value) {
    return null;
  }
  return parseDate(value.toString());
}

async function dashboardAccessToken(): Promise<string> {
  const supabase = createBrowserSupabaseClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new StaffApiError(401, "AUTH_INVALID", "Sign in is required.");
  }
  return token;
}

function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function listHref(path: string, params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      search.set(key, value);
    }
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

function MetricTile({
  label,
  value,
  hint,
  href,
  hrefLabel = "Open source list",
  secondaryHref,
  secondaryLabel,
}: {
  label: string;
  value: string;
  hint?: string;
  href?: string;
  hrefLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
}) {
  return (
    <div className="flex min-w-[12rem] flex-1 flex-col gap-1 rounded-xl bg-primary p-4 ring-1 ring-secondary">
      <p className="text-sm font-semibold text-tertiary">{label}</p>
      <p className="text-display-xs font-semibold tabular-nums text-primary">{value}</p>
      {hint ? <p className="text-xs text-quaternary">{hint}</p> : null}
      {href ? (
        <Button color="link-color" size="sm" href={href} className="mt-1 self-start px-0">
          {hrefLabel}
        </Button>
      ) : null}
      {secondaryHref && secondaryLabel ? (
        <Button color="link-color" size="sm" href={secondaryHref} className="self-start px-0">
          {secondaryLabel}
        </Button>
      ) : null}
    </div>
  );
}

export function DashboardWorkspace() {
  const staff = useStaff();
  const router = useRouter();
  const allowed = staffHasPermission(staff, "reports.read");
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>("today");
  const [dayDate, setDayDate] = useState(() => kolkataTodayCalendar());
  const [customStart, setCustomStart] = useState<CalendarDate | null>(null);
  const [customEnd, setCustomEnd] = useState<CalendarDate | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [queuedExport, setQueuedExport] = useState<{
    id: string;
    exportType: "inventory" | "sales" | "dues" | "girvi";
    startedAt: number;
  } | null>(null);

  const periodBounds = useMemo(
    () =>
      boundsForPeriod({
        preset: periodPreset,
        dayDate,
        customStart,
        customEnd,
      }),
    [customEnd, customStart, dayDate, periodPreset],
  );

  const customRangeValue = useMemo<DateRange | null>(() => {
    if (!customStart || !customEnd) {
      return null;
    }
    return { start: customStart, end: customEnd };
  }, [customEnd, customStart]);

  useEffect(() => {
    if (!allowed) {
      router.replace("/access-denied");
    }
  }, [allowed, router]);

  const query = useQuery({
    queryKey: ["reports", "dashboard", staff.membership.organization_id, periodBounds.from, periodBounds.to],
    queryFn: async () => fetchDashboardReport(await dashboardAccessToken(), periodBounds),
    enabled: allowed,
    placeholderData: keepPreviousData,
  });

  const exportJobQuery = useQuery({
    queryKey: ["exports", "job", queuedExport?.id],
    queryFn: async () => fetchExportJob(await dashboardAccessToken(), queuedExport!.id),
    enabled: queuedExport !== null,
    refetchInterval: (jobQuery) => {
      if (!queuedExport) {
        return false;
      }
      const status = jobQuery.state.data?.status;
      if (status === "ready" || status === "failed") {
        return false;
      }
      if (Date.now() - queuedExport.startedAt > 30_000) {
        return false;
      }
      return 1_500;
    },
  });

  useEffect(() => {
    if (!queuedExport) {
      return;
    }
    const data = exportJobQuery.data;
    if (data?.status === "ready" && data.download_url) {
      window.location.assign(data.download_url);
      setExportMessage("Export saved.");
      setQueuedExport(null);
      return;
    }
    if (data?.status === "failed") {
      setExportMessage("The export job failed.");
      setQueuedExport(null);
    }
  }, [exportJobQuery.data, queuedExport]);

  useEffect(() => {
    if (!queuedExport) {
      return;
    }
    const remaining = 30_000 - (Date.now() - queuedExport.startedAt);
    const timer = window.setTimeout(() => {
      setQueuedExport((current) => (current?.id === queuedExport.id ? null : current));
      setExportMessage((current) =>
        current === "Export saved." ? current : "The export is still pending. Try again shortly.",
      );
    }, Math.max(remaining, 0));
    return () => window.clearTimeout(timer);
  }, [queuedExport]);

  const exportMutation = useMutation({
    mutationFn: async (exportType: "inventory" | "sales" | "dues" | "girvi") => {
      setExportMessage(null);
      setQueuedExport(null);
      const result = await createExportRequest(await dashboardAccessToken(), {
        export_type: exportType,
        ...(periodBounds.from ? { business_date_from: periodBounds.from } : {}),
        ...(periodBounds.to ? { business_date_to: periodBounds.to } : {}),
      });
      if (result.delivery === "inline" && result.csv && result.filename) {
        downloadCsv(result.filename, result.csv);
        return "saved" as const;
      }
      if (!result.export_job_id) {
        throw new StaffApiError(422, "EXPORT_QUEUED", "The export was queued but no job id was returned.");
      }
      setQueuedExport({ id: result.export_job_id, exportType, startedAt: Date.now() });
      return "queued" as const;
    },
    onSuccess: (value) => {
      setExportMessage(value === "saved" ? "Export saved." : "Export is generating. Waiting for a private download link…");
    },
    onError: (error) => {
      setExportMessage(error instanceof StaffApiError ? error.message : "Export failed.");
    },
  });

  if (!allowed) {
    return null;
  }

  const report = query.data;
  const caption = periodCaption(periodPreset, periodBounds, {
    allTime: "All recorded dates",
    onDay: (date) => `On ${date}`,
    fromTo: (from, to) => `${from} to ${to}`,
    fromOnward: (from) => `From ${from}`,
    through: (to) => `Through ${to}`,
  });

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-display-xs font-semibold text-primary">Dashboard</h1>
          <p className="text-md text-tertiary">
            Sales, collections, dues, Girvi principal, and interest stay separate. {caption}.
          </p>
          {report && report.sections.length < ALL_DASHBOARD_SECTIONS.length ? (
            <p className="text-sm text-tertiary">
              Showing {report.sections.map((section) => SECTION_LABELS[section]).join(", ")} for your role.
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <ButtonGroup
            selectedKeys={new Set([periodPreset])}
            disallowEmptySelection
            onSelectionChange={(keys) => {
              const [first] = keys;
              if (typeof first === "string") {
                setPeriodPreset(first as PeriodPreset);
              }
            }}
          >
            {PERIOD_PRESETS.map((preset) => (
              <ButtonGroupItem key={preset.id} id={preset.id}>
                {preset.label}
              </ButtonGroupItem>
            ))}
          </ButtonGroup>
          {periodPreset === "today" || periodPreset === "week" || periodPreset === "month" ? (
            <DatePicker
              aria-label="Business date"
              value={dayDate}
              onChange={(value) => {
                const next = asCalendarDate(value);
                if (next) {
                  setDayDate(next);
                }
              }}
            />
          ) : null}
          {periodPreset === "custom" ? (
            <DateRangePicker
              aria-label="Business date range"
              value={customRangeValue}
              onChange={(value) => {
                setCustomStart(asCalendarDate(value?.start ?? null));
                setCustomEnd(asCalendarDate(value?.end ?? null));
              }}
            />
          ) : null}
        </div>
      </div>

      {query.isLoading && !query.data ? (
        <div className="flex flex-col gap-6">
          <MetricTilesSkeleton count={5} label="Loading dashboard" />
          <TableSkeleton columns={4} rows={5} titleWidth="w-36" label="Loading sales dues" />
          <ChartSkeleton label="Loading sales chart" />
          <ChartSkeleton label="Loading collections chart" />
          <TableSkeleton columns={5} rows={5} titleWidth="w-40" label="Loading inventory" />
          <TableSkeleton columns={5} rows={5} titleWidth="w-44" label="Loading Girvi" />
          <PanelSkeleton rows={3} label="Loading operations" />
        </div>
      ) : null}
      {query.isError ? (
        <p className="text-sm text-error-primary">
          {query.error instanceof StaffApiError ? query.error.message : "Dashboard could not be loaded."}
        </p>
      ) : null}

      {report ? (
        <>
          <div className="flex flex-wrap gap-3">
            {report.sales ? (
              <MetricTile
                label="Sales"
                value={formatInr(report.sales.summary.net_sales_inr)}
                hint={`${String(report.sales.summary.invoice_count)} invoices · returns ${formatInr(report.sales.summary.returns_inr)}`}
                href={listHref("/invoices", {
                  status: "finalized",
                  from: periodBounds.from,
                  to: periodBounds.to,
                })}
              />
            ) : null}
            {report.collections ? (
              <MetricTile
                label="Collections"
                value={formatInr(report.collections.total_net_collected_inr)}
                hint="Posted payments minus refunds and reversals. Excludes Girvi."
                href={listHref("/payments", { from: periodBounds.from, to: periodBounds.to })}
              />
            ) : null}
            {report.sales_dues ? (
              <MetricTile
                label="Outstanding sales dues"
                value={formatInr(report.sales_dues.amount_due_inr)}
                hint={`As of ${report.sales_dues.as_of_business_date ?? "today"} · ${String(report.sales_dues.invoice_count)} invoices`}
                href={listHref("/invoices", { status: "finalized", due: "1" })}
              />
            ) : null}
            {report.girvi ? (
              <MetricTile
                label="Girvi principal"
                value={formatInr(report.girvi.position.principal_outstanding_inr)}
                hint={`${String(report.girvi.position.active_account_count)} active · ${String(report.girvi.position.overdue_account_count)} overdue`}
                href="/girvi?status=active"
                secondaryHref={
                  report.girvi.position.overdue_account_count > 0 ? "/girvi?status=active&overdue=1" : undefined
                }
                secondaryLabel={report.girvi.position.overdue_account_count > 0 ? "Open overdue accounts" : undefined}
              />
            ) : null}
            {report.girvi ? (
              <MetricTile
                label="Accrued interest"
                value={
                  report.girvi.position.interest_availability === "available" &&
                  report.girvi.position.interest_outstanding_inr
                    ? formatInr(report.girvi.position.interest_outstanding_inr)
                    : "Unavailable"
                }
                hint={
                  report.girvi.position.interest_unavailable_reason ??
                  "Unpaid interest on active accounts. Not principal."
                }
                href="/girvi?status=active"
              />
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            {report.sales ? (
              <Button
                color="secondary"
                size="sm"
                onPress={() => exportMutation.mutate("sales")}
                isLoading={
                  (exportMutation.isPending && exportMutation.variables === "sales") ||
                  queuedExport?.exportType === "sales"
                }
              >
                Export sales CSV
              </Button>
            ) : null}
            {report.sales_dues ? (
              <Button
                color="secondary"
                size="sm"
                onPress={() => exportMutation.mutate("dues")}
                isLoading={
                  (exportMutation.isPending && exportMutation.variables === "dues") ||
                  queuedExport?.exportType === "dues"
                }
              >
                Export dues CSV
              </Button>
            ) : null}
            {report.inventory ? (
              <Button
                color="secondary"
                size="sm"
                onPress={() => exportMutation.mutate("inventory")}
                isLoading={
                  (exportMutation.isPending && exportMutation.variables === "inventory") ||
                  queuedExport?.exportType === "inventory"
                }
              >
                Export inventory CSV
              </Button>
            ) : null}
            {report.girvi ? (
              <Button
                color="secondary"
                size="sm"
                onPress={() => exportMutation.mutate("girvi")}
                isLoading={
                  (exportMutation.isPending && exportMutation.variables === "girvi") ||
                  queuedExport?.exportType === "girvi"
                }
              >
                Export Girvi CSV
              </Button>
            ) : null}
          </div>
          {report.sales_dues ? (
            <p className="text-xs text-quaternary">
              Dues export uses outstanding balances as of {report.sales_dues.as_of_business_date ?? "today"}.
            </p>
          ) : null}
          {exportMessage ? <p className="text-sm text-secondary">{exportMessage}</p> : null}

          {report.sales_dues ? (
            <section className="flex flex-col gap-3">
              <div>
                <h2 className="text-lg font-semibold text-primary">Open sales dues</h2>
                <p className="text-sm text-tertiary">
                  Reconstructed as of {report.sales_dues.as_of_business_date ?? "today"}. Later payments and credits are
                  not included.
                </p>
              </div>
              {report.sales_dues.open_invoices.length === 0 ? (
                <p className="text-sm text-tertiary">No open sales dues as of this date.</p>
              ) : (
                <TableCard.Root>
                  <Table aria-label="Open sales dues">
                    <Table.Header>
                      <Table.Head id="invoice" label="Invoice" isRowHeader />
                      <Table.Head id="customer" label="Customer" />
                      <Table.Head id="date" label="Business date" />
                      <Table.Head id="due" label="Due" className="text-right" />
                    </Table.Header>
                    <Table.Body items={report.sales_dues.open_invoices}>
                      {(row) => (
                        <Table.Row id={row.invoice_id}>
                          <Table.Cell>
                            <Button color="link-color" size="sm" href={`/invoices/${row.invoice_id}`} className="px-0">
                              {row.invoice_number}
                            </Button>
                          </Table.Cell>
                          <Table.Cell>{row.customer_display_name}</Table.Cell>
                          <Table.Cell className="tabular-nums">{row.business_date}</Table.Cell>
                          <Table.Cell className="text-right tabular-nums">{formatInr(row.amount_due_inr)}</Table.Cell>
                        </Table.Row>
                      )}
                    </Table.Body>
                  </Table>
                </TableCard.Root>
              )}
            </section>
          ) : null}

          {report.sales ? (
            <section className="flex flex-col gap-3 rounded-xl bg-primary p-4 ring-1 ring-secondary">
              <div>
                <h2 className="text-lg font-semibold text-primary">Sales by date</h2>
                <p className="text-sm text-tertiary">Gross sales, returns, and net sales are labelled separately.</p>
              </div>
              {report.sales.by_business_date.length === 0 ? (
                <EmptyState size="sm">
                  <EmptyState.Header pattern="none">
                    <EmptyState.Content>
                      <EmptyState.Title>No sales in this range</EmptyState.Title>
                      <EmptyState.Description>Finalized invoices and credit notes will appear here.</EmptyState.Description>
                    </EmptyState.Content>
                  </EmptyState.Header>
                </EmptyState>
              ) : (
                <div className="-mx-1 overflow-x-auto px-1">
                  <div className="h-72 min-w-[min(100%,28rem)] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={report.sales.by_business_date.map((row) => ({
                        business_date: row.business_date,
                        gross_sales_inr: Number(row.gross_sales_inr),
                        returns_inr: Number(row.returns_inr),
                        net_sales_inr: Number(row.net_sales_inr),
                      }))}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="business_date" />
                      <YAxis />
                      <Tooltip content={<ChartTooltipContent />} />
                      <Legend content={<ChartLegendContent />} />
                      <Line
                        type="monotone"
                        dataKey="gross_sales_inr"
                        name="Gross sales (₹)"
                        stroke="#173fbf"
                        strokeDasharray="0"
                        dot={{ r: 3 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="returns_inr"
                        name="Returns (₹)"
                        stroke="#b42318"
                        strokeDasharray="6 4"
                        dot={{ r: 2 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="net_sales_inr"
                        name="Net sales (₹)"
                        stroke="#027a48"
                        strokeDasharray="2 2"
                        dot={{ r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                  </div>
                </div>
              )}
            </section>
          ) : null}

          {report.collections ? (
            <section className="flex flex-col gap-3 rounded-xl bg-primary p-4 ring-1 ring-secondary">
              <div>
                <h2 className="text-lg font-semibold text-primary">Collections by method</h2>
                <p className="text-sm text-tertiary">Each bar is labelled by method. Colour is not the only distinction.</p>
              </div>
              {report.collections.by_method.length === 0 ? (
                <EmptyState size="sm">
                  <EmptyState.Header pattern="none">
                    <EmptyState.Content>
                      <EmptyState.Title>No collections in this range</EmptyState.Title>
                      <EmptyState.Description>Posted sales payments appear here. Girvi is never included.</EmptyState.Description>
                    </EmptyState.Content>
                  </EmptyState.Header>
                </EmptyState>
              ) : (
                <div className="-mx-1 overflow-x-auto px-1">
                  <div className="h-64 min-w-[min(100%,24rem)] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={report.collections.by_method.map((row) => ({
                        method_label: paymentMethodLabel(row.method),
                        net_collected_inr: Number(row.net_collected_inr),
                      }))}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="method_label" />
                      <YAxis />
                      <Tooltip content={<ChartTooltipContent />} />
                      <Legend content={<ChartLegendContent />} />
                      <Bar dataKey="net_collected_inr" name="Net collected (₹)" fill="#2c5ce6" />
                    </BarChart>
                  </ResponsiveContainer>
                  </div>
                </div>
              )}
            </section>
          ) : null}

          {report.inventory ? (
            <section className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold text-primary">Available inventory</h2>
                  <p className="text-sm text-tertiary">
                    {String(report.inventory.available_article_count)} pieces ·{" "}
                    {report.inventory.available_net_metal_weight_grams} g net metal
                  </p>
                </div>
                <Button color="link-color" size="sm" href="/inventory?status=available" className="px-0">
                  Open inventory
                </Button>
              </div>
              {report.inventory.by_category.length === 0 ? (
                <p className="text-sm text-tertiary">No available articles.</p>
              ) : (
                <TableCard.Root>
                  <Table aria-label="Available inventory by category">
                    <Table.Header>
                      <Table.Head id="category" label="Category" isRowHeader />
                      <Table.Head id="metal" label="Metal" />
                      <Table.Head id="purity" label="Purity" />
                      <Table.Head id="count" label="Pieces" className="text-right" />
                      <Table.Head id="net" label="Net g" className="text-right" />
                    </Table.Header>
                    <Table.Body items={report.inventory.by_category}>
                      {(row) => (
                        <Table.Row id={`${row.category_id}-${row.metal}-${row.purity}`}>
                          <Table.Cell>{row.category_name}</Table.Cell>
                          <Table.Cell className="capitalize">{row.metal}</Table.Cell>
                          <Table.Cell>{row.purity}</Table.Cell>
                          <Table.Cell className="text-right tabular-nums">{row.article_count}</Table.Cell>
                          <Table.Cell className="text-right tabular-nums">{row.net_metal_weight_grams}</Table.Cell>
                        </Table.Row>
                      )}
                    </Table.Body>
                  </Table>
                </TableCard.Root>
              )}
            </section>
          ) : null}

          {report.girvi ? (
            <section className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold text-primary">Girvi activity and maturities</h2>
                  <p className="text-sm text-tertiary">
                    Disbursed {formatInr(report.girvi.activity.disbursed_inr)} · Principal recovered{" "}
                    {formatInr(report.girvi.activity.principal_recovered_inr)} · Interest received{" "}
                    {formatInr(report.girvi.activity.interest_received_inr)}
                  </p>
                </div>
                <Button color="link-color" size="sm" href="/girvi" className="px-0">
                  Open Girvi
                </Button>
              </div>
              {report.girvi.upcoming_maturities.length === 0 ? (
                <p className="text-sm text-tertiary">No maturities in the next 30 days.</p>
              ) : (
                <TableCard.Root>
                  <Table aria-label="Upcoming Girvi maturities">
                    <Table.Header>
                      <Table.Head id="account" label="Account" isRowHeader />
                      <Table.Head id="customer" label="Customer" />
                      <Table.Head id="maturity" label="Maturity" />
                      <Table.Head id="principal" label="Principal" className="text-right" />
                      <Table.Head id="status" label="Status" />
                    </Table.Header>
                    <Table.Body items={report.girvi.upcoming_maturities}>
                      {(row) => (
                        <Table.Row id={row.girvi_account_id}>
                          <Table.Cell>
                            <Button color="link-color" size="sm" href={`/girvi/${row.girvi_account_id}`} className="px-0">
                              {row.account_number}
                            </Button>
                          </Table.Cell>
                          <Table.Cell>{row.customer_display_name}</Table.Cell>
                          <Table.Cell className="tabular-nums">{row.maturity_business_date}</Table.Cell>
                          <Table.Cell className="text-right tabular-nums">
                            {formatInr(row.principal_outstanding_inr)}
                          </Table.Cell>
                          <Table.Cell>{row.is_overdue ? "Overdue" : "Upcoming"}</Table.Cell>
                        </Table.Row>
                      )}
                    </Table.Body>
                  </Table>
                </TableCard.Root>
              )}
            </section>
          ) : null}

          {report.operations ? (
            <section className={cx("flex flex-col gap-2 rounded-xl bg-primary p-4 ring-1 ring-secondary")}>
              <h2 className="text-lg font-semibold text-primary">Operational attention</h2>
              <p className="text-sm text-tertiary">
                Stock discrepancies: {report.operations.stock_discrepancy_count}
                {report.operations.latest_stock_count_on
                  ? ` · last count ${report.operations.latest_stock_count_on}`
                  : ""}
              </p>
              <p className="text-sm text-tertiary">
                Notifications failed {report.operations.failed_notification_count} · unknown{" "}
                {report.operations.unknown_notification_count}
              </p>
              <div className="flex flex-wrap gap-3">
                <Button color="link-color" size="sm" href="/inventory/stock-counts/new" className="px-0">
                  Start stock count
                </Button>
                <Button color="link-color" size="sm" href="/inventory?status=available" className="px-0">
                  Open inventory
                </Button>
                <Button color="link-color" size="sm" href="/notifications?status=failed" className="px-0">
                  Failed notifications
                </Button>
                <Button color="link-color" size="sm" href="/notifications?status=unknown" className="px-0">
                  Unknown notifications
                </Button>
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
