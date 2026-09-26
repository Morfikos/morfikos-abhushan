"use client";

import { Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import type { DashboardReport, ExportType, ReportMetricSection } from "@aabhushan/contracts";
import type { CalendarDate, DateValue } from "@internationalized/date";
import { parseDate } from "@internationalized/date";
import type { DateRange } from "react-aria-components";
import { Home01 } from "@untitledui/icons";

import { DateRangePicker } from "@/components/application/date-picker/date-range-picker";
import { DashboardBodySkeleton } from "@/components/application/skeleton/skeleton";
import { Button } from "@/components/base/buttons/button";
import { ButtonGroup, ButtonGroupItem } from "@/components/base/button-group/button-group";
import { Dropdown } from "@/components/base/dropdown/dropdown";
import { MoneyText } from "@/components/shared/money-text";
import { StaffPageHeader } from "@/components/shared/staff-page-header";
import { staffHasPermission, useStaff } from "@/features/auth/staff-shell";
import {
  PeriodSalesCollectionsChart,
  TodaySalesCollectionsPanel,
} from "@/features/dashboard/dashboard-charts";
import {
  collectionsContextLine,
  deriveChecklist,
  duesContextLine,
  exportItemsForRole,
  formatDashboardDayLabel,
  formatShortDay,
  listHref,
  PERIOD_PRESETS,
  salesContextLine,
  VALUE_TONE_CLASS,
  visualChartSpan,
  type ChecklistRow,
} from "@/features/dashboard/dashboard-shared";
import { type ListFilterCodec, useSyncedListFilters } from "@/lib/list-search-params";
import { isPositiveMoney, isZeroMoney } from "@/lib/money";
import {
  boundsForPeriod,
  customPeriodFromParams,
  kolkataTodayCalendar,
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

function DashboardPanel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}): ReactNode {
  return (
    <div className={cx("flex flex-col border-2 border-primary bg-primary", className)}>
      {children}
    </div>
  );
}

function PanelHeader({
  title,
  action,
}: {
  title: ReactNode;
  action?: ReactNode;
}): ReactNode {
  return (
    <div className="flex items-center justify-between gap-2 border-b-2 border-primary px-3 py-2">
      <h2 className="text-sm font-bold text-primary">{title}</h2>
      {action}
    </div>
  );
}

function BeforeClosingChecklist({ rows }: { rows: ChecklistRow[] }): ReactNode {
  if (rows.length === 0) {
    return (
      <p className="border border-secondary bg-primary px-3 py-2 text-sm text-tertiary">
        Nothing to clear before closing.
      </p>
    );
  }

  return (
    <div className="flex flex-col border-2 border-primary bg-primary">
      <div className="flex items-center justify-between gap-2 bg-primary-solid px-3 py-1.5 text-[10px] font-semibold tracking-wider text-white uppercase">
        <span>
          Before closing · {String(rows.length)} to do
        </span>
        <span className="font-normal tracking-normal text-white/70 normal-case">
          clears as each is done
        </span>
      </div>
      <ul>
        {rows.map((row, index) => (
          <li
            key={row.id}
            className={cx(
              "grid grid-cols-[14px_2.5rem_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 text-sm",
              index < rows.length - 1 && "border-b border-secondary",
            )}
          >
            <span
              className="size-3 shrink-0 border border-primary"
              aria-hidden
            />
            <span className="text-base font-extrabold tabular-nums text-brand-secondary">
              {String(row.count)}
            </span>
            <span className="min-w-0">
              <strong className="font-semibold text-primary">{row.task}</strong>
              <span className="text-tertiary"> · {row.reason}</span>
            </span>
            <Button color="link-color" size="sm" href={row.href} className="px-0 font-bold">
              {row.hrefLabel}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TotalsRow({
  report,
  periodPreset,
  periodBounds,
}: {
  report: DashboardReport;
  periodPreset: PeriodPreset;
  periodBounds: { from?: string; to?: string };
}): ReactNode {
  const cells: ReactNode[] = [];

  if (report.sales) {
    cells.push(
      <TotalsCell
        key="sales"
        label="Sales"
        value={
          <MoneyText
            amount={report.sales.summary.net_sales_inr}
            as="p"
            className={`text-xl font-extrabold ${VALUE_TONE_CLASS.positive}`}
          />
        }
        context={salesContextLine(report.sales)}
        href={listHref("/invoices", {
          status: "finalized",
          from: periodBounds.from,
          to: periodBounds.to,
        })}
        hrefLabel="Invoices"
      />,
    );
  }

  if (report.collections) {
    cells.push(
      <TotalsCell
        key="collections"
        label="Collections"
        value={
          <MoneyText
            amount={report.collections.total_net_collected_inr}
            as="p"
            className={`text-xl font-extrabold ${VALUE_TONE_CLASS.default}`}
          />
        }
        context={collectionsContextLine(report.collections, periodPreset)}
        href={listHref("/payments", { from: periodBounds.from, to: periodBounds.to })}
        hrefLabel="Payments"
      />,
    );
  }

  if (report.sales_dues) {
    const duePositive = isPositiveMoney(report.sales_dues.amount_due_inr);
    cells.push(
      <TotalsCell
        key="dues"
        label="Sales dues"
        value={
          <MoneyText
            amount={report.sales_dues.amount_due_inr}
            as="p"
            className={`text-xl font-extrabold ${
              duePositive ? VALUE_TONE_CLASS.attention : VALUE_TONE_CLASS.default
            }`}
          />
        }
        context={duesContextLine(report.sales_dues)}
        href={listHref("/invoices", { status: "finalized", due: "1" })}
        hrefLabel="Open dues"
      />,
    );
  }

  if (report.girvi) {
    cells.push(
      <TotalsCell
        key="girvi-principal"
        label="Girvi principal"
        value={
          <MoneyText
            amount={report.girvi.position.principal_outstanding_inr}
            as="p"
            className={`text-xl font-extrabold ${VALUE_TONE_CLASS.default}`}
          />
        }
        context={
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
        hrefLabel="Girvi"
      />,
    );

    const interestUnavailable = report.girvi.position.interest_availability === "unavailable";
    cells.push(
      <TotalsCell
        key="girvi-interest"
        label="Accrued interest"
        value={
          !interestUnavailable && report.girvi.position.interest_outstanding_inr ? (
            <MoneyText
              amount={report.girvi.position.interest_outstanding_inr}
              as="p"
              className={`text-xl font-extrabold ${VALUE_TONE_CLASS.default}`}
            />
          ) : (
            <p className={`text-xl font-extrabold ${VALUE_TONE_CLASS.warning}`}>Unavailable</p>
          )
        }
        context={
          interestUnavailable
            ? report.girvi.position.unapproved_active_account_count > 0
              ? `${String(report.girvi.position.unapproved_active_account_count)} accounts need a rate`
              : (report.girvi.position.interest_unavailable_reason ??
                "Interest unavailable until rates are set")
            : "Unpaid interest on active accounts"
        }
        href="/girvi?status=active"
        hrefLabel={interestUnavailable ? "Review" : "Girvi"}
      />,
    );
  }

  if (cells.length === 0) {
    return null;
  }

  return (
    <div
      className={cx(
        "grid border-2 border-primary bg-primary",
        cells.length >= 5
          ? "sm:grid-cols-2 lg:grid-cols-5"
          : cells.length === 4
            ? "sm:grid-cols-2 lg:grid-cols-4"
            : cells.length === 3
              ? "sm:grid-cols-3"
              : cells.length === 2
                ? "sm:grid-cols-2"
                : "grid-cols-1",
      )}
    >
      {cells}
    </div>
  );
}

function TotalsCell({
  label,
  value,
  context,
  href,
  hrefLabel,
}: {
  label: string;
  value: ReactNode;
  context: ReactNode;
  href: string;
  hrefLabel: string;
}): ReactNode {
  return (
    <div className="flex flex-col gap-0.5 border-b border-secondary p-2.5 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0 lg:border-b-0">
      <span className="text-[10px] font-semibold tracking-wider text-tertiary uppercase">
        {label}
      </span>
      {value}
      <span className="text-[10px] text-tertiary">{context}</span>
      <Button color="link-color" size="sm" href={href} className="mt-0.5 self-start px-0 text-xs font-semibold">
        {hrefLabel}
      </Button>
    </div>
  );
}

function OpenSalesDuesPanel({
  dues,
}: {
  dues: NonNullable<DashboardReport["sales_dues"]>;
}): ReactNode {
  const rows = dues.open_invoices;
  const visible = rows.slice(0, 5);
  const more = rows.length - visible.length;
  const asOf = dues.as_of_business_date
    ? formatShortDay(dues.as_of_business_date)
    : "today";

  return (
    <DashboardPanel>
      <PanelHeader
        title={
          <>
            Open sales dues · <MoneyText amount={dues.amount_due_inr} className="font-bold" />
          </>
        }
        action={
          <Button
            color="link-color"
            size="sm"
            href={listHref("/invoices", { status: "finalized", due: "1" })}
            className="px-0 text-xs font-semibold"
          >
            View all
          </Button>
        }
      />
      {rows.length === 0 ? (
        <p className="px-3 py-3 text-sm text-tertiary">No open sales dues as of this date.</p>
      ) : (
        <ul>
          {visible.map((row, index) => (
            <li
              key={row.invoice_id}
              className={cx(
                "grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-2.5 px-3 py-2.5 text-sm",
                index < visible.length - 1 && "border-b border-secondary",
              )}
            >
              <Button
                color="link-color"
                size="sm"
                href={`/invoices/${row.invoice_id}`}
                className="px-0 font-mono text-xs font-semibold"
              >
                {row.invoice_number}
              </Button>
              <span className="min-w-0 truncate">
                {row.customer_display_name}{" "}
                <span className="text-tertiary">· {formatShortDay(row.business_date)}</span>
              </span>
              <MoneyText
                amount={row.amount_due_inr}
                className="font-extrabold text-error-primary"
              />
            </li>
          ))}
          {more > 0 ? (
            <li className="border-t border-secondary px-3 py-1.5 text-xs text-tertiary">
              +{String(more)} more
            </li>
          ) : null}
        </ul>
      )}
      <p className="border-t border-secondary px-3 py-1.5 text-[10px] text-tertiary">
        As of {asOf} · later payments not included
      </p>
    </DashboardPanel>
  );
}

function AvailableStockPanel({
  inventory,
}: {
  inventory: NonNullable<DashboardReport["inventory"]>;
}): ReactNode {
  return (
    <DashboardPanel>
      <PanelHeader
        title={
          <>
            Available stock · {String(inventory.available_article_count)}{" "}
            {inventory.available_article_count === 1 ? "piece" : "pieces"} ·{" "}
            {inventory.available_net_metal_weight_grams} g
          </>
        }
        action={
          <Button
            color="link-color"
            size="sm"
            href="/inventory?status=available"
            className="px-0 text-xs font-semibold"
          >
            Inventory
          </Button>
        }
      />
      {inventory.by_category.length === 0 ? (
        <p className="px-3 py-3 text-sm text-tertiary">No available articles.</p>
      ) : (
        <ul>
          <li className="grid grid-cols-[minmax(0,1fr)_5rem_3rem_5rem] items-center gap-2 border-b border-secondary px-3 py-1.5 text-[10px] font-semibold tracking-wide text-tertiary uppercase">
            <span>Category</span>
            <span>Metal purity</span>
            <span className="text-right">Pieces</span>
            <span className="text-right">Net g</span>
          </li>
          {inventory.by_category.map((row, index) => (
            <li
              key={`${row.category_id}-${row.metal}-${row.purity}`}
              className={cx(
                "grid grid-cols-[minmax(0,1fr)_5rem_3rem_5rem] items-center gap-2 px-3 py-2.5 text-sm",
                index < inventory.by_category.length - 1 && "border-b border-secondary",
              )}
            >
              <span className="truncate">{row.category_name}</span>
              <span className="capitalize text-tertiary">
                {row.metal} {row.purity}
              </span>
              <span className="text-right tabular-nums">{row.article_count}</span>
              <span className="text-right font-semibold tabular-nums">
                {row.net_metal_weight_grams} g
              </span>
            </li>
          ))}
        </ul>
      )}
    </DashboardPanel>
  );
}

function GirviTodayPanel({
  girvi,
  periodPreset,
}: {
  girvi: NonNullable<DashboardReport["girvi"]>;
  periodPreset: PeriodPreset;
}): ReactNode {
  const activity = girvi.activity;
  const cells = [
    { label: "Disbursed", amount: activity.disbursed_inr },
    { label: "Principal back", amount: activity.principal_recovered_inr },
    { label: "Interest in", amount: activity.interest_received_inr },
  ];
  const maturities = girvi.upcoming_maturities;
  const title =
    periodPreset === "today"
      ? "Girvi today"
      : periodPreset === "week"
        ? "Girvi this week"
        : periodPreset === "month"
          ? "Girvi this month"
          : "Girvi this range";

  return (
    <DashboardPanel>
      <PanelHeader
        title={title}
        action={
          <Button
            color="link-color"
            size="sm"
            href="/girvi"
            className="px-0 text-xs font-semibold"
          >
            Girvi
          </Button>
        }
      />
      <div className="grid grid-cols-3 text-xs">
        {cells.map((cell, index) => (
          <div
            key={cell.label}
            className={cx(
              "px-3 py-2",
              index < cells.length - 1 && "border-r border-secondary",
            )}
          >
            <p className="text-tertiary">{cell.label}</p>
            {isZeroMoney(cell.amount) ? (
              <p className="font-bold text-quaternary">—</p>
            ) : (
              <MoneyText amount={cell.amount} className="font-bold text-primary" />
            )}
          </div>
        ))}
      </div>
      <p className="border-t border-secondary px-3 py-1.5 text-xs text-tertiary">
        {maturities.length === 0
          ? "No maturities in the next 30 days"
          : `${String(maturities.length)} ${maturities.length === 1 ? "maturity" : "maturities"} in the next 30 days`}
      </p>
    </DashboardPanel>
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

  const todayLabel = formatDashboardDayLabel(kolkataTodayCalendar().toString());

  return (
    <section className="flex flex-col gap-4">
      <Suspense
        fallback={
          <>
            <StaffPageHeader
              title="Dashboard"
              description={`${todayLabel} · sales, collections, dues and Girvi kept separate`}
              icon={Home01}
            />
            <DashboardBodySkeleton layout="today" label="Loading dashboard" />
          </>
        }
      >
        <DashboardWorkspaceLoaded />
      </Suspense>
    </section>
  );
}

function DashboardWorkspaceLoaded() {
  const { filters: periodFilters, setFilters: setPeriodFilters } = useSyncedListFilters(
    "/dashboard",
    dashboardPeriodCodec,
  );
  const { periodPreset, dayDate, customStart, customEnd } = periodFilters;

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

  const customRangeValue = useMemo<DateRange | null>(() => {
    if (!customStart || !customEnd) {
      return null;
    }
    return { start: customStart, end: customEnd };
  }, [customEnd, customStart]);

  const todayLabel = formatDashboardDayLabel(kolkataTodayCalendar().toString());
  const layout = periodPreset === "today" ? "today" : "period";
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

  const periodActions = (
    <div className="flex flex-wrap items-center gap-2">
      <ButtonGroup
        size="sm"
        selection="filter"
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
      <DashboardExportMenu periodBounds={periodBounds} />
    </div>
  );

  return (
    <>
      <StaffPageHeader
        title="Dashboard"
        description={`${todayLabel} · sales, collections, dues and Girvi kept separate`}
        icon={Home01}
        actions={periodActions}
      />
      <DashboardWorkspaceBody periodFilters={periodFilters} layout={layout} />
    </>
  );
}

function DashboardExportMenu({
  periodBounds,
}: {
  periodBounds: { from?: string; to?: string };
}): ReactNode {
  const staff = useStaff();
  const items = exportItemsForRole(staff.membership.role);
  const showDuesNote = items.some((item) => item.type === "dues");
  const duesAsOf =
    !periodBounds.to || periodBounds.to === kolkataTodayCalendar().toString()
      ? "today"
      : formatShortDay(periodBounds.to);

  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [queuedExport, setQueuedExport] = useState<{
    id: string;
    exportType: ExportType;
    startedAt: number;
  } | null>(null);

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
      setExportMessage(
        value === "saved" ? "Export saved." : "Export is generating. Waiting for a private download link…",
      );
    },
    onError: (error) => {
      setExportMessage(error instanceof StaffApiError ? error.message : "Export failed.");
    },
  });

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Dropdown.Root>
        <Button
          color="secondary"
          size="sm"
          isLoading={exportMutation.isPending || queuedExport !== null}
        >
          Export ▾
        </Button>
        <Dropdown.Popover className="w-64">
          <Dropdown.Menu
            onAction={(key) => {
              if (typeof key === "string") {
                exportMutation.mutate(key as ExportType);
              }
            }}
          >
            {items.map((item) => (
              <Dropdown.Item key={item.type} id={item.type} label={item.label} />
            ))}
          </Dropdown.Menu>
          {showDuesNote ? (
            <p className="border-t border-secondary px-3 py-2 text-xs text-quaternary">
              Dues export uses outstanding balances as of {duesAsOf}.
            </p>
          ) : null}
        </Dropdown.Popover>
      </Dropdown.Root>
      {exportMessage ? <p className="max-w-xs text-right text-xs text-secondary">{exportMessage}</p> : null}
    </div>
  );
}

function DashboardWorkspaceBody({
  periodFilters,
  layout,
}: {
  periodFilters: DashboardPeriodFilters;
  layout: "today" | "period";
}): ReactNode {
  const staff = useStaff();
  const { periodPreset, dayDate, customStart, customEnd } = periodFilters;

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

  const query = useQuery({
    queryKey: ["reports", "dashboard", staff.membership.organization_id, periodBounds.from, periodBounds.to],
    queryFn: async () => fetchDashboardReport(await dashboardAccessToken(), periodBounds),
    placeholderData: keepPreviousData,
  });

  const report = query.data;
  const isToday = layout === "today";
  const chartSpan = useMemo(
    () => visualChartSpan(periodPreset, periodBounds, dayDate.toString()),
    [dayDate, periodBounds, periodPreset],
  );

  if (query.isLoading && !query.data) {
    return <DashboardBodySkeleton layout={layout} label="Loading dashboard" />;
  }

  if (query.isError) {
    return (
      <p className="text-sm text-error-primary">
        {query.error instanceof StaffApiError ? query.error.message : "Dashboard could not be loaded."}
      </p>
    );
  }

  if (!report) {
    return null;
  }

  const checklist = deriveChecklist(report);
  const roleNote =
    report.sections.length < ALL_DASHBOARD_SECTIONS.length ? (
      <p className="text-xs text-tertiary">
        Showing {report.sections.map((section) => SECTION_LABELS[section]).join(", ")} for your role.
      </p>
    ) : null;

  const showChecklist = report.operations !== null || report.girvi !== null;

  return (
    <div className="flex flex-col gap-3.5">
      {roleNote}
      {showChecklist ? <BeforeClosingChecklist rows={checklist} /> : null}

      <TotalsRow report={report} periodPreset={periodPreset} periodBounds={periodBounds} />

      {isToday ? (
        <div className="grid gap-3.5 lg:grid-cols-2">
          {report.sales_dues ? <OpenSalesDuesPanel dues={report.sales_dues} /> : null}
          {report.sales || report.collections ? (
            <DashboardPanel>
              <TodaySalesCollectionsPanel
                salesInr={report.sales?.summary.net_sales_inr}
                collectionsInr={report.collections?.total_net_collected_inr}
                collectionsByMethod={report.collections?.by_method}
              />
            </DashboardPanel>
          ) : null}
          {report.inventory ? <AvailableStockPanel inventory={report.inventory} /> : null}
          {report.girvi ? <GirviTodayPanel girvi={report.girvi} periodPreset={periodPreset} /> : null}
        </div>
      ) : (
        <div className="flex flex-col gap-3.5">
          {(report.sales || report.collections) && chartSpan ? (
            <PeriodSalesCollectionsChart
              salesByDate={report.sales?.by_business_date}
              collectionsByDate={report.collections?.by_business_date}
              salesTotalInr={report.sales?.summary.net_sales_inr}
              collectionsTotalInr={report.collections?.total_net_collected_inr}
              periodPreset={periodPreset}
              spanFrom={chartSpan.from}
              spanTo={chartSpan.to}
            />
          ) : null}
          <div className="grid gap-3.5 lg:grid-cols-2">
            {report.sales_dues ? <OpenSalesDuesPanel dues={report.sales_dues} /> : null}
            {report.inventory ? <AvailableStockPanel inventory={report.inventory} /> : null}
            {report.girvi ? <GirviTodayPanel girvi={report.girvi} periodPreset={periodPreset} /> : null}
          </div>
        </div>
      )}
    </div>
  );
}
