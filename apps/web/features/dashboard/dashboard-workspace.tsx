"use client";

import { Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import type { ExportType, ReportMetricSection } from "@aabhushan/contracts";
import type { CalendarDate, DateValue } from "@internationalized/date";
import { parseDate } from "@internationalized/date";
import type { DateRange } from "react-aria-components";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Home01 } from "@untitledui/icons";

import { DatePicker } from "@/components/application/date-picker/date-picker";
import { DateRangePicker } from "@/components/application/date-picker/date-range-picker";
import { EmptyState } from "@/components/application/empty-state/empty-state";
import {
  DashboardBodySkeleton,
} from "@/components/application/skeleton/skeleton";
import { Table, TableCard } from "@/components/application/table/table";
import { ChartTooltipContent } from "@/components/application/charts/charts-base";
import { Button } from "@/components/base/buttons/button";
import { ButtonGroup, ButtonGroupItem } from "@/components/base/button-group/button-group";
import { MoneyText } from "@/components/shared/money-text";
import { SectionCard } from "@/components/shared/section-card";
import { StaffPageHeader } from "@/components/shared/staff-page-header";
import { staffHasPermission, useStaff } from "@/features/auth/staff-shell";
import { type ListFilterCodec, useSyncedListFilters } from "@/lib/list-search-params";
import { formatInr, formatInrCompact, isPositiveMoney } from "@/lib/money";
import { paymentMethodLabel } from "@/lib/payment-methods";
import {
  boundsForPeriod,
  customPeriodFromParams,
  kolkataTodayCalendar,
  periodCaption,
  type PeriodPreset,
} from "@/lib/period-bounds";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { createExportRequest, fetchDashboardReport, fetchExportJob, StaffApiError } from "@/lib/staff-api";

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

type DashboardPeriodFilters = {
  periodPreset: PeriodPreset;
  dayDate: CalendarDate;
  customStart: CalendarDate | null;
  customEnd: CalendarDate | null;
};

const dashboardPeriodDefaults: DashboardPeriodFilters = {
  periodPreset: "today",
  dayDate: kolkataTodayCalendar(),
  customStart: null,
  customEnd: null,
};

const dashboardPeriodCodec: ListFilterCodec<DashboardPeriodFilters> = {
  ownedKeys: ["from", "to"],
  defaults: dashboardPeriodDefaults,
  parse(params) {
    const drilledPeriod = customPeriodFromParams(params.get("from"), params.get("to"));
    if (drilledPeriod) {
      return {
        periodPreset: "custom",
        dayDate: kolkataTodayCalendar(),
        customStart: drilledPeriod.customStart,
        customEnd: drilledPeriod.customEnd,
      };
    }
    return {
      periodPreset: "today",
      dayDate: kolkataTodayCalendar(),
      customStart: null,
      customEnd: null,
    };
  },
  serialize(value) {
    const bounds = boundsForPeriod({
      preset: value.periodPreset,
      dayDate: value.dayDate,
      customStart: value.customStart,
      customEnd: value.customEnd,
    });
    const today = kolkataTodayCalendar().toString();
    if (value.periodPreset === "today" && bounds.from === today && bounds.to === today) {
      return { from: undefined, to: undefined };
    }
    return { from: bounds.from, to: bounds.to };
  },
  chips() {
    return [];
  },
};

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

const SALES_STROKE = "#2c5ce6";
const SALES_FILL = "#2c5ce6";
const COLLECTIONS_STROKE = "#717680";

function dayOfMonthLabel(businessDate: string): string {
  const day = businessDate.slice(8, 10);
  return day || businessDate;
}

type TrendPoint = {
  business_date: string;
  net_sales_inr: number | null;
  net_collected_inr: number | null;
};

function mergeTrendPoints(
  salesDates: { business_date: string; net_sales_inr: string }[] | undefined,
  collectionDates: { business_date: string; net_collected_inr: string }[] | undefined,
): TrendPoint[] {
  const map = new Map<string, TrendPoint>();
  for (const row of salesDates ?? []) {
    map.set(row.business_date, {
      business_date: row.business_date,
      net_sales_inr: Number(row.net_sales_inr),
      net_collected_inr: null,
    });
  }
  for (const row of collectionDates ?? []) {
    const existing = map.get(row.business_date);
    if (existing) {
      existing.net_collected_inr = Number(row.net_collected_inr);
    } else {
      map.set(row.business_date, {
        business_date: row.business_date,
        net_sales_inr: null,
        net_collected_inr: Number(row.net_collected_inr),
      });
    }
  }
  return [...map.values()].sort((a, b) => a.business_date.localeCompare(b.business_date));
}

function TrendLegend({ showSales, showCollections }: { showSales: boolean; showCollections: boolean }) {
  return (
    <ul className="flex flex-wrap items-center gap-4 text-sm text-tertiary">
      {showSales ? (
        <li className="flex items-center gap-2">
          <span className="block size-2 rounded-full" style={{ backgroundColor: SALES_STROKE }} />
          Sales
        </li>
      ) : null}
      {showCollections ? (
        <li className="flex items-center gap-2">
          <span
            className="block h-0.5 w-4"
            style={{
              backgroundImage: `repeating-linear-gradient(90deg, ${COLLECTIONS_STROKE} 0 3px, transparent 3px 6px)`,
            }}
          />
          Collections
        </li>
      ) : null}
    </ul>
  );
}

function MethodBreakdown({
  rows,
}: {
  rows: { method: "cash" | "upi" | "card" | "bank"; net_collected_inr: string }[];
}) {
  if (rows.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-2 border-t border-secondary pt-3">
      <p className="text-sm font-medium text-secondary">By method</p>
      <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {rows.map((row) => (
          <div key={row.method} className="flex items-baseline justify-between gap-2 sm:flex-col sm:items-start">
            <dt className="text-xs text-tertiary">{paymentMethodLabel(row.method)}</dt>
            <MoneyText amount={row.net_collected_inr} as="dd" className="text-sm font-medium text-primary" />
          </div>
        ))}
      </dl>
    </div>
  );
}

function CompactTrendSummary({
  points,
  showSales,
  showCollections,
}: {
  points: TrendPoint[];
  showSales: boolean;
  showCollections: boolean;
}) {
  const point = points[0];
  if (!point) {
    return null;
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-tertiary">{point.business_date}</p>
      <dl className="grid gap-2 sm:grid-cols-2">
        {showSales ? (
          <div>
            <dt className="text-xs text-tertiary">Net sales</dt>
            {point.net_sales_inr === null ? (
              <dd className="text-sm font-medium text-primary">—</dd>
            ) : (
              <MoneyText
                amount={point.net_sales_inr.toFixed(2)}
                as="dd"
                className="text-sm font-medium text-primary"
              />
            )}
          </div>
        ) : null}
        {showCollections ? (
          <div>
            <dt className="text-xs text-tertiary">Collections</dt>
            {point.net_collected_inr === null ? (
              <dd className="text-sm font-medium text-primary">—</dd>
            ) : (
              <MoneyText
                amount={point.net_collected_inr.toFixed(2)}
                as="dd"
                className="text-sm font-medium text-primary"
              />
            )}
          </div>
        ) : null}
      </dl>
    </div>
  );
}

function SalesCollectionsTrendCard({
  salesByDate,
  collectionsByDate,
  collectionsByMethod,
}: {
  salesByDate?: { business_date: string; net_sales_inr: string }[];
  collectionsByDate?: { business_date: string; net_collected_inr: string }[];
  collectionsByMethod?: { method: "cash" | "upi" | "card" | "bank"; net_collected_inr: string }[];
}) {
  const showSales = salesByDate !== undefined;
  const showCollections = collectionsByDate !== undefined;
  const points = mergeTrendPoints(salesByDate, collectionsByDate);
  const hasAnyValue = points.some(
    (point) =>
      (showSales && point.net_sales_inr !== null) || (showCollections && point.net_collected_inr !== null),
  );
  const title =
    showSales && showCollections
      ? "Sales and collections by business date"
      : showSales
        ? "Sales by business date"
        : "Collections by business date";

  return (
    <SectionCard>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-lg font-semibold text-primary">{title}</h2>
        {hasAnyValue && points.length >= 2 ? (
          <TrendLegend showSales={showSales} showCollections={showCollections} />
        ) : null}
      </div>

      {!hasAnyValue ? (
        <EmptyState size="sm">
          <EmptyState.Header pattern="none">
            <EmptyState.Content>
              <EmptyState.Title>
                {showSales && showCollections
                  ? "No sales or collections in this range"
                  : showSales
                    ? "No sales in this range"
                    : "No collections in this range"}
              </EmptyState.Title>
              <EmptyState.Description>
                {showCollections
                  ? "Posted sales payments appear here. Girvi is never included."
                  : "Finalized invoices and credit notes will appear here."}
              </EmptyState.Description>
            </EmptyState.Content>
          </EmptyState.Header>
        </EmptyState>
      ) : points.length < 2 ? (
        <CompactTrendSummary points={points} showSales={showSales} showCollections={showCollections} />
      ) : (
        <div className="-mx-1 overflow-x-auto px-1">
          <div className="h-72 min-w-[min(100%,28rem)] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={points}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#e9eaeb" />
                <XAxis
                  dataKey="business_date"
                  tickFormatter={dayOfMonthLabel}
                  tick={{ fill: "#717680", fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={24}
                />
                <YAxis
                  tickFormatter={formatInrCompact}
                  tick={{ fill: "#717680", fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  width={44}
                />
                <Tooltip content={<ChartTooltipContent />} />
                {showSales ? (
                  <Area
                    type="monotone"
                    dataKey="net_sales_inr"
                    name="Sales (₹)"
                    stroke={SALES_STROKE}
                    fill={SALES_FILL}
                    fillOpacity={0.12}
                    strokeWidth={2}
                    connectNulls={false}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                ) : null}
                {showCollections ? (
                  <Line
                    type="monotone"
                    dataKey="net_collected_inr"
                    name="Collections (₹)"
                    stroke={COLLECTIONS_STROKE}
                    strokeDasharray="6 4"
                    strokeWidth={2}
                    connectNulls={false}
                    dot={false}
                    activeDot={{ r: 3 }}
                  />
                ) : null}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {hasAnyValue ? (
        <p className="text-xs text-tertiary">
          Series are distinguished by stroke pattern as well as colour. Gaps in the source data are left as
          gaps; no interpolation.
        </p>
      ) : null}

      {showCollections && collectionsByMethod ? <MethodBreakdown rows={collectionsByMethod} /> : null}
    </SectionCard>
  );
}

const VALUE_TONE_CLASS = {
  default: "text-primary",
  positive: "text-success-primary",
  attention: "text-error-primary",
  warning: "text-warning-primary",
} as const;

type MetricValueTone = keyof typeof VALUE_TONE_CLASS;

function MetricTile({
  label,
  value,
  valueTone = "default",
  hint,
  href,
  hrefLabel = "Open source list",
  secondaryHref,
  secondaryLabel,
}: {
  label: string;
  value: ReactNode;
  valueTone?: MetricValueTone;
  hint?: ReactNode;
  href?: string;
  hrefLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
}) {
  return (
    <div className="flex min-w-48 flex-1 flex-col gap-1 rounded-xl bg-primary p-4 ring-1 ring-secondary">
      <p className="text-sm font-semibold text-tertiary">{label}</p>
      {typeof value === "string" ? (
        <p className={`text-display-xs font-semibold tabular-nums ${VALUE_TONE_CLASS[valueTone]}`}>{value}</p>
      ) : (
        value
      )}
      {hint ? <p className="text-xs text-quaternary">{hint}</p> : null}
      {href || (secondaryHref && secondaryLabel) ? (
        <div className="mt-1 flex flex-col items-start gap-0.5">
          {href ? (
            <Button color="link-color" size="sm" href={href} className="self-start px-0">
              {hrefLabel}
            </Button>
          ) : null}
          {secondaryHref && secondaryLabel ? (
            <Button color="link-color" size="sm" href={secondaryHref} className="self-start px-0">
              {secondaryLabel}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function DashboardWorkspace() {
  const staff = useStaff();
  const router = useRouter();
  const allowed = staffHasPermission(staff, "reports.read");

  useEffect(() => {
    if (!allowed) {
      router.replace("/access-denied");
    }
  }, [allowed, router]);

  if (!allowed) {
    return null;
  }

  return (
    <section className="flex flex-col gap-6">
      <StaffPageHeader
        title="Dashboard"
        description="Sales, collections, dues, Girvi principal, and interest stay separate."
        icon={Home01}
      />
      <Suspense fallback={<DashboardBodySkeleton label="Loading dashboard" />}>
        <DashboardWorkspaceBody />
      </Suspense>
    </section>
  );
}

function DashboardWorkspaceBody() {
  const staff = useStaff();
  const { filters: periodFilters, setFilters: setPeriodFilters } = useSyncedListFilters(
    "/dashboard",
    dashboardPeriodCodec,
  );
  const { periodPreset, dayDate, customStart, customEnd } = periodFilters;
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [queuedExport, setQueuedExport] = useState<{
    id: string;
    exportType: ExportType;
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

  const query = useQuery({
    queryKey: ["reports", "dashboard", staff.membership.organization_id, periodBounds.from, periodBounds.to],
    queryFn: async () => fetchDashboardReport(await dashboardAccessToken(), periodBounds),
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
    mutationFn: async (exportType: ExportType) => {
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

  function selectPeriod(next: PeriodPreset) {
    setPeriodFilters((current) => {
      const updated: DashboardPeriodFilters = { ...current, periodPreset: next };
      if (next === "today" || next === "week" || next === "month") {
        updated.dayDate = kolkataTodayCalendar();
        updated.customStart = null;
        updated.customEnd = null;
      }
      if (next === "custom" && !current.customStart && !current.customEnd) {
        const today = kolkataTodayCalendar();
        updated.customStart = today;
        updated.customEnd = today;
      }
      return updated;
    });
  }

  const report = query.data;
  const caption = periodCaption(periodPreset, periodBounds, {
    allTime: "All recorded dates",
    onDay: (date) => `On ${date}`,
    fromTo: (from, to) => `${from} to ${to}`,
    fromOnward: (from) => `From ${from}`,
    through: (to) => `Through ${to}`,
  });

  const periodActions = (
    <div className="flex flex-wrap items-end gap-2">
      <ButtonGroup
        selectedKeys={new Set([periodPreset])}
        disallowEmptySelection
        onSelectionChange={(keys) => {
          const [first] = keys;
          if (typeof first === "string") {
            selectPeriod(first as PeriodPreset);
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
              setPeriodFilters((current) => ({ ...current, dayDate: next }));
            }
          }}
        />
      ) : null}
      {periodPreset === "custom" ? (
        <DateRangePicker
          aria-label="Business date range"
          value={customRangeValue}
          onChange={(value) => {
            setPeriodFilters((current) => ({
              ...current,
              customStart: asCalendarDate(value?.start ?? null),
              customEnd: asCalendarDate(value?.end ?? null),
            }));
          }}
        />
      ) : null}
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-sm text-tertiary">
          {caption}.
          {report && report.sections.length < ALL_DASHBOARD_SECTIONS.length ? (
            <>
              {" "}
              Showing {report.sections.map((section) => SECTION_LABELS[section]).join(", ")} for your role.
            </>
          ) : null}
        </p>
        {periodActions}
      </div>

      {query.isLoading && !query.data ? <DashboardBodySkeleton label="Loading dashboard" /> : null}
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
                value={
                  <MoneyText
                    amount={report.sales.summary.net_sales_inr}
                    as="p"
                    className={`text-display-xs font-semibold ${VALUE_TONE_CLASS.positive}`}
                  />
                }
                valueTone="positive"
                hint={`${String(report.sales.summary.invoice_count)} invoices · returns ${formatInr(report.sales.summary.returns_inr)}`}
                href={listHref("/invoices", {
                  status: "finalized",
                  from: periodBounds.from,
                  to: periodBounds.to,
                })}
                hrefLabel="Open invoices"
              />
            ) : null}
            {report.collections ? (
              <MetricTile
                label="Collections"
                value={
                  <MoneyText
                    amount={report.collections.total_net_collected_inr}
                    as="p"
                    className={`text-display-xs font-semibold ${VALUE_TONE_CLASS.default}`}
                  />
                }
                hint="Cash, UPI, card, and bank received in the period. Excludes Girvi."
                href={listHref("/payments", { from: periodBounds.from, to: periodBounds.to })}
                hrefLabel="Open payments"
              />
            ) : null}
            {report.sales_dues ? (
              <MetricTile
                label="Outstanding sales dues"
                value={
                  <MoneyText
                    amount={report.sales_dues.amount_due_inr}
                    as="p"
                    className={`text-display-xs font-semibold ${
                      isPositiveMoney(report.sales_dues.amount_due_inr)
                        ? VALUE_TONE_CLASS.attention
                        : VALUE_TONE_CLASS.default
                    }`}
                  />
                }
                valueTone={isPositiveMoney(report.sales_dues.amount_due_inr) ? "attention" : "default"}
                hint={`As of ${report.sales_dues.as_of_business_date ?? "today"} · ${String(report.sales_dues.invoice_count)} invoices`}
                href={listHref("/invoices", { status: "finalized", due: "1" })}
                hrefLabel="Open dues"
              />
            ) : null}
            {report.girvi ? (
              <MetricTile
                label="Girvi principal"
                value={
                  <MoneyText
                    amount={report.girvi.position.principal_outstanding_inr}
                    as="p"
                    className={`text-display-xs font-semibold ${VALUE_TONE_CLASS.default}`}
                  />
                }
                hint={
                  <>
                    {String(report.girvi.position.active_account_count)} active ·{" "}
                    {report.girvi.position.overdue_account_count > 0 ? (
                      <span className="text-error-primary">
                        {String(report.girvi.position.overdue_account_count)} overdue
                      </span>
                    ) : (
                      `${String(report.girvi.position.overdue_account_count)} overdue`
                    )}
                  </>
                }
                href="/girvi?status=active"
                hrefLabel="Open active Girvi"
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
                  report.girvi.position.interest_outstanding_inr ? (
                    <MoneyText
                      amount={report.girvi.position.interest_outstanding_inr}
                      as="p"
                      className={`text-display-xs font-semibold ${VALUE_TONE_CLASS.default}`}
                    />
                  ) : (
                    "Unavailable"
                  )
                }
                valueTone={
                  report.girvi.position.interest_availability === "unavailable" ? "warning" : "default"
                }
                hint={
                  report.girvi.position.interest_availability === "unavailable"
                    ? report.girvi.position.unapproved_active_account_count > 0
                      ? `${String(report.girvi.position.unapproved_active_account_count)} active accounts need an approved interest rate.`
                      : (report.girvi.position.interest_unavailable_reason ??
                        "Interest is unavailable until active accounts have an approved interest rate.")
                    : "Unpaid interest on active accounts. Not principal."
                }
                href="/girvi?status=active"
                hrefLabel={
                  report.girvi.position.interest_availability === "unavailable"
                    ? "Review active Girvi"
                    : "Open active Girvi"
                }
              />
            ) : null}
          </div>

          {report.sales || report.collections || report.sales_dues || report.inventory || report.girvi ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-secondary">Export statements</p>
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
                {report.collections ? (
                  <Button
                    color="secondary"
                    size="sm"
                    onPress={() => exportMutation.mutate("collections")}
                    isLoading={
                      (exportMutation.isPending && exportMutation.variables === "collections") ||
                      queuedExport?.exportType === "collections"
                    }
                  >
                    Export collections CSV
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
            </div>
          ) : null}

          {report.sales_dues ? (
            <SectionCard
              title="Open sales dues"
              description={`As of ${report.sales_dues.as_of_business_date ?? "today"}.`}
            >
              {report.sales_dues.open_invoices.length === 0 ? (
                <p className="text-sm text-tertiary">No open sales dues as of this date.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm text-secondary">
                      Total due{" "}
                      <MoneyText amount={report.sales_dues.amount_due_inr} className="font-medium text-primary" />
                    </p>
                    <Button
                      color="link-color"
                      size="sm"
                      href={listHref("/invoices", { status: "finalized", due: "1" })}
                      className="px-0"
                    >
                      View all dues
                    </Button>
                  </div>
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
                            <Table.Cell className="text-right tabular-nums">
                              <MoneyText amount={row.amount_due_inr} />
                            </Table.Cell>
                          </Table.Row>
                        )}
                      </Table.Body>
                    </Table>
                  </TableCard.Root>
                  <p className="text-xs text-tertiary">Later payments and credits after this as-of date are not included.</p>
                </div>
              )}
            </SectionCard>
          ) : null}

          {report.sales || report.collections ? (
            <SalesCollectionsTrendCard
              salesByDate={report.sales?.by_business_date}
              collectionsByDate={report.collections?.by_business_date}
              collectionsByMethod={report.collections?.by_method}
            />
          ) : null}

          {report.inventory ? (
            <SectionCard
              title="Available inventory"
              description={`${String(report.inventory.available_article_count)} pieces · ${report.inventory.available_net_metal_weight_grams} g net metal`}
            >
              <div className="flex flex-col gap-3">
                <div className="flex justify-end">
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
              </div>
            </SectionCard>
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
                            <MoneyText amount={row.principal_outstanding_inr} />
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
            <section className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold text-primary">Operational attention</h2>
              <div className="flex flex-wrap gap-3">
                <MetricTile
                  label="Stock discrepancies"
                  value={String(report.operations.stock_discrepancy_count)}
                  valueTone={report.operations.stock_discrepancy_count > 0 ? "warning" : "default"}
                  hint={
                    report.operations.latest_stock_count_on
                      ? `Last count ${report.operations.latest_stock_count_on}`
                      : "No stock count recorded yet"
                  }
                  href="/inventory/stock-counts/new"
                  hrefLabel="Start stock count"
                  secondaryHref="/inventory?status=available"
                  secondaryLabel="Open inventory"
                />
                <MetricTile
                  label="Failed notifications"
                  value={String(report.operations.failed_notification_count)}
                  valueTone={report.operations.failed_notification_count > 0 ? "attention" : "default"}
                  hint="WhatsApp delivery failed; retry only when safe."
                  href="/notifications?status=failed"
                  hrefLabel="Open failed"
                />
                <MetricTile
                  label="Unknown notifications"
                  value={String(report.operations.unknown_notification_count)}
                  valueTone={report.operations.unknown_notification_count > 0 ? "warning" : "default"}
                  hint="Status unclear. Check status before retrying."
                  href="/notifications?status=unknown"
                  hrefLabel="Open unknown"
                />
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
