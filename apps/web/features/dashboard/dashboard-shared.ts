import type { DashboardReport, ExportType } from "@aabhushan/contracts";
import { endOfMonth, endOfWeek, parseDate, startOfMonth, startOfWeek } from "@internationalized/date";

import { formatInr, isPositiveMoney, isZeroMoney, subtractMoney } from "@/lib/money";
import { paymentMethodLabel } from "@/lib/payment-methods";
import { kolkataTodayCalendar, type PeriodBounds, type PeriodPreset } from "@/lib/period-bounds";

const WEEK_LOCALE = "en-IN";

export const VALUE_TONE_CLASS = {
  default: "text-primary",
  positive: "text-success-primary",
  attention: "text-error-primary",
  warning: "text-warning-primary",
} as const;

export type MetricValueTone = keyof typeof VALUE_TONE_CLASS;

/** Chart ink (neutral-900) and brand accent for series distinction by pattern + colour. */
export const CHART_INK = "#111111";
export const CHART_ACCENT = "#FB4D17";
export const CHART_ACCENT_TEXT = "#C03E16";
export const CHART_HATCH_LIGHT = "#FFEDEB";
export const CHART_HATCH_MID = "#FFDAD2";
export const CHART_GRID = "#CFCBC9";

export const PERIOD_PRESETS: { id: PeriodPreset; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "custom", label: "Custom ▾" },
];

export const EXPORT_ITEMS: { type: ExportType; label: string; section: "sales" | "collections" | "sales_dues" | "inventory" | "girvi" }[] = [
  { type: "sales", label: "Sales CSV", section: "sales" },
  { type: "collections", label: "Collections CSV", section: "collections" },
  { type: "dues", label: "Dues CSV", section: "sales_dues" },
  { type: "inventory", label: "Inventory CSV", section: "inventory" },
  { type: "girvi", label: "Girvi CSV", section: "girvi" },
];

export function listHref(path: string, params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      search.set(key, value);
    }
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

/** `{Weekday} {D} {Mon} {YYYY}` in en-IN, e.g. Wed 23 Sep 2026. */
export function formatDashboardDayLabel(businessDate: string): string {
  const parsed = parseDate(businessDate);
  const asDate = new Date(parsed.year, parsed.month - 1, parsed.day);
  return asDate.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** `{Weekday} {D} {Mon}` without year, e.g. Wed 23 Sep. */
export function formatShortWeekdayDay(businessDate: string): string {
  const parsed = parseDate(businessDate);
  const asDate = new Date(parsed.year, parsed.month - 1, parsed.day);
  return asDate.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/** Shorter `{D} {Mon}` for as-of hints. */
export function formatShortDay(businessDate: string): string {
  const parsed = parseDate(businessDate);
  const asDate = new Date(parsed.year, parsed.month - 1, parsed.day);
  return asDate.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
}

export function formatDayOfMonth(businessDate: string): string {
  return businessDate.slice(8, 10).replace(/^0/, "") || businessDate;
}

export type ChecklistRow = {
  id: string;
  count: number;
  task: string;
  reason: string;
  href: string;
  hrefLabel: string;
};

export function deriveChecklist(report: DashboardReport): ChecklistRow[] {
  const rows: ChecklistRow[] = [];
  const ops = report.operations;
  const girvi = report.girvi;
  const today = kolkataTodayCalendar().toString();

  if (ops && ops.failed_notification_count > 0) {
    rows.push({
      id: "failed-wa",
      count: ops.failed_notification_count,
      task: "Retry failed WhatsApp messages",
      reason: "check each is safe to resend",
      href: "/notifications?status=failed",
      hrefLabel: "Open failed",
    });
  }

  if (ops && ops.unknown_notification_count > 0) {
    rows.push({
      id: "unknown-wa",
      count: ops.unknown_notification_count,
      task: "Check notifications with unknown status",
      reason: "check status before retrying",
      href: "/notifications?status=unknown",
      hrefLabel: "Open unknown",
    });
  }

  if (girvi && girvi.position.overdue_account_count > 0) {
    rows.push({
      id: "girvi-overdue",
      count: girvi.position.overdue_account_count,
      task: "Follow up overdue Girvi accounts",
      reason: `of ${String(girvi.position.active_account_count)} active`,
      href: "/girvi?status=active&overdue=1",
      hrefLabel: "Open overdue",
    });
  }

  if (girvi && girvi.position.unapproved_active_account_count > 0) {
    rows.push({
      id: "girvi-rate",
      count: girvi.position.unapproved_active_account_count,
      task: "Set an interest rate on Girvi accounts",
      reason: "accrued interest shows Unavailable until then",
      href: "/girvi?status=active",
      hrefLabel: "Review",
    });
  }

  if (ops) {
    if (ops.stock_discrepancy_count > 0) {
      rows.push({
        id: "stock-discrepancy",
        count: ops.stock_discrepancy_count,
        task: `Resolve ${String(ops.stock_discrepancy_count)} stock discrepancies`,
        reason: "count again to clear them",
        href: "/inventory/stock-counts/new",
        hrefLabel: "Start stock count",
      });
    } else if (!ops.latest_stock_count_on || ops.latest_stock_count_on !== today) {
      rows.push({
        id: "stock-count",
        count: 1,
        task: "Record today's stock count",
        reason: "no count yet, so discrepancies can't be checked",
        href: "/inventory/stock-counts/new",
        hrefLabel: "Start stock count",
      });
    }
  }

  return rows;
}

export function salesContextLine(report: NonNullable<DashboardReport["sales"]>): string {
  const invoices = report.summary.invoice_count;
  const invoiceWord = invoices === 1 ? "invoice" : "invoices";
  if (isZeroMoney(report.summary.returns_inr)) {
    return `${String(invoices)} ${invoiceWord} · no returns`;
  }
  return `${String(invoices)} ${invoiceWord} · returns ${formatInr(report.summary.returns_inr)}`;
}

export function collectionsContextLine(
  report: NonNullable<DashboardReport["collections"]>,
  periodPreset: PeriodPreset,
): string {
  const methods = [...report.by_method].sort((a, b) => {
    const aPaise = Number(a.net_collected_inr);
    const bPaise = Number(b.net_collected_inr);
    return bPaise - aPaise;
  });
  const top = methods.find((row) => isPositiveMoney(row.net_collected_inr));
  const methodLabel = top ? paymentMethodLabel(top.method) : null;
  if (periodPreset === "today") {
    return methodLabel ? `${methodLabel} · excludes Girvi` : "excludes Girvi";
  }
  const receipts = report.collection_count;
  const receiptWord = receipts === 1 ? "receipt" : "receipts";
  if (methodLabel) {
    return `${String(receipts)} ${receiptWord} · ${methodLabel}`;
  }
  return `${String(receipts)} ${receiptWord} · excludes Girvi`;
}

export function duesContextLine(report: NonNullable<DashboardReport["sales_dues"]>): string {
  const asOf = report.as_of_business_date;
  const today = kolkataTodayCalendar().toString();
  const asOfLabel =
    !asOf || asOf === today ? "as of today" : `as of ${formatShortDay(asOf)}`;
  const invoices = report.invoice_count;
  const invoiceWord = invoices === 1 ? "invoice" : "invoices";
  return `${String(invoices)} ${invoiceWord} · ${asOfLabel}`;
}

export function collectedPercent(salesInr: string, collectionsInr: string): number | null {
  const sales = Number(salesInr);
  if (!Number.isFinite(sales) || sales <= 0) {
    return null;
  }
  const collected = Number(collectionsInr);
  if (!Number.isFinite(collected)) {
    return null;
  }
  return Math.round((collected / sales) * 100);
}

export function periodDueFromSalesCollections(salesInr: string, collectionsInr: string): string {
  const due = subtractMoney(salesInr, collectionsInr);
  if (!isPositiveMoney(due)) {
    return "0.00";
  }
  return due;
}

export type TrendPoint = {
  business_date: string;
  net_sales_inr: number | null;
  net_collected_inr: number | null;
};

export function mergeTrendPoints(
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

/** Inclusive calendar days from from..to as YYYY-MM-DD strings. */
export function enumerateDates(from: string, to: string): string[] {
  const start = parseDate(from);
  const end = parseDate(to);
  const dates: string[] = [];
  let cursor = start;
  while (cursor.compare(end) <= 0) {
    dates.push(cursor.toString());
    cursor = cursor.add({ days: 1 });
  }
  return dates;
}

/**
 * Visual chart span for the period. Month/Week show the full calendar window
 * (including future days for the shaded band) even when the API range is
 * clamped to today.
 */
export function visualChartSpan(
  periodPreset: PeriodPreset,
  periodBounds: PeriodBounds,
  dayDateIso: string,
): { from: string; to: string } | null {
  if (!periodBounds.from || !periodBounds.to) {
    return null;
  }
  if (periodPreset === "month") {
    const day = parseDate(dayDateIso);
    const start = startOfMonth(day);
    const end = endOfMonth(day);
    return { from: start.toString(), to: end.toString() };
  }
  if (periodPreset === "week") {
    const day = parseDate(dayDateIso);
    const start = startOfWeek(day, WEEK_LOCALE);
    const end = endOfWeek(day, WEEK_LOCALE);
    return { from: start.toString(), to: end.toString() };
  }
  return { from: periodBounds.from, to: periodBounds.to };
}

/** Role-gated export menu items (same rules as dashboardSectionsForRole). */
export function exportItemsForRole(role: string): typeof EXPORT_ITEMS {
  const allowed = new Set<string>();
  if (role === "owner" || role === "admin") {
    allowed.add("sales").add("collections").add("sales_dues").add("inventory").add("girvi");
  } else if (role === "billing") {
    allowed.add("sales").add("collections").add("sales_dues");
  } else if (role === "inventory") {
    allowed.add("inventory");
  } else if (role === "girvi") {
    allowed.add("girvi");
  }
  return EXPORT_ITEMS.filter((item) => allowed.has(item.section));
}
