import { kolkataBusinessDate } from "@aabhushan/domain";
import {
  CalendarDate,
  endOfMonth,
  endOfWeek,
  parseDate,
  startOfMonth,
  startOfWeek,
} from "@internationalized/date";

/** ISO week (Monday start) for India shop calendar labels. */
const WEEK_LOCALE = "en-IN";

export type PeriodPreset = "all" | "today" | "week" | "month" | "custom";

export type PeriodBounds = {
  from?: string;
  to?: string;
};

export function kolkataTodayCalendar(): CalendarDate {
  return parseDate(kolkataBusinessDate());
}

const BUSINESS_DATE_PARAM = /^\d{4}-\d{2}-\d{2}$/;

export function calendarDateFromParam(value: string | null): CalendarDate | null {
  if (!value || !BUSINESS_DATE_PARAM.test(value)) {
    return null;
  }
  try {
    return parseDate(value);
  } catch {
    return null;
  }
}

/** Custom range when a drill-through link supplies both bounds. */
export function customPeriodFromParams(from: string | null, to: string | null): {
  preset: "custom";
  customStart: CalendarDate;
  customEnd: CalendarDate;
} | null {
  const start = calendarDateFromParam(from);
  const end = calendarDateFromParam(to);
  if (!start || !end) {
    return null;
  }
  if (start.compare(end) <= 0) {
    return { preset: "custom", customStart: start, customEnd: end };
  }
  return { preset: "custom", customStart: end, customEnd: start };
}

/** Inclusive YYYY-MM-DD bounds for the active period control. */
export function boundsForPeriod(input: {
  preset: PeriodPreset;
  /** Single day when preset is `today` (any business date, not only Kolkata today). */
  dayDate: CalendarDate;
  customStart: CalendarDate | null;
  customEnd: CalendarDate | null;
  /**
   * When true (default), Week/Month end is capped at Kolkata today (past activity lists).
   * When false, Week/Month run through the calendar end (e.g. maturity windows).
   */
  clampEndToToday?: boolean;
}): PeriodBounds {
  const today = kolkataTodayCalendar();
  const clampEndToToday = input.clampEndToToday !== false;
  switch (input.preset) {
    case "all":
      return {};
    case "today":
      return { from: input.dayDate.toString(), to: input.dayDate.toString() };
    case "week": {
      const start = startOfWeek(input.dayDate, WEEK_LOCALE);
      const weekEnd = endOfWeek(input.dayDate, WEEK_LOCALE);
      const end =
        clampEndToToday && weekEnd.compare(today) > 0 && start.compare(today) <= 0 ? today : weekEnd;
      return { from: start.toString(), to: end.toString() };
    }
    case "month": {
      const start = startOfMonth(input.dayDate);
      const monthEnd = endOfMonth(input.dayDate);
      const end =
        clampEndToToday && monthEnd.compare(today) > 0 && start.compare(today) <= 0 ? today : monthEnd;
      return { from: start.toString(), to: end.toString() };
    }
    case "custom": {
      if (!input.customStart || !input.customEnd) {
        return {};
      }
      const from = input.customStart;
      const to = input.customEnd;
      if (from.compare(to) > 0) {
        return { from: to.toString(), to: from.toString() };
      }
      return { from: from.toString(), to: to.toString() };
    }
    default:
      return {};
  }
}

/** Shared period wording; pass domain-specific all-time / activity phrases. */
export function periodCaption(
  preset: PeriodPreset,
  bounds: PeriodBounds,
  copy: {
    allTime: string;
    onDay: (date: string) => string;
    fromTo: (from: string, to: string) => string;
    fromOnward: (from: string) => string;
    through: (to: string) => string;
  },
): string {
  if (preset === "all" || (!bounds.from && !bounds.to)) {
    return copy.allTime;
  }
  if (bounds.from && bounds.to && bounds.from === bounds.to) {
    return copy.onDay(bounds.from);
  }
  if (bounds.from && bounds.to) {
    return copy.fromTo(bounds.from, bounds.to);
  }
  if (bounds.from) {
    return copy.fromOnward(bounds.from);
  }
  return copy.through(bounds.to ?? "");
}
