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

function minCalendarDate(a: CalendarDate, b: CalendarDate): CalendarDate {
  return a.compare(b) <= 0 ? a : b;
}

/** Inclusive YYYY-MM-DD bounds for the active period control. */
export function boundsForPeriod(input: {
  preset: PeriodPreset;
  /** Single day when preset is `today` (any business date, not only Kolkata today). */
  dayDate: CalendarDate;
  customStart: CalendarDate | null;
  customEnd: CalendarDate | null;
}): PeriodBounds {
  const today = kolkataTodayCalendar();
  switch (input.preset) {
    case "all":
      return {};
    case "today":
      return { from: input.dayDate.toString(), to: input.dayDate.toString() };
    case "week": {
      const start = startOfWeek(today, WEEK_LOCALE);
      const end = minCalendarDate(endOfWeek(today, WEEK_LOCALE), today);
      return { from: start.toString(), to: end.toString() };
    }
    case "month": {
      const start = startOfMonth(today);
      const end = minCalendarDate(endOfMonth(today), today);
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
