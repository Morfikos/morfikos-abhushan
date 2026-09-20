import { z } from "zod";

/** Inclusive calendar-day span between YYYY-MM-DD bounds (UTC midnight). */
export function businessDateSpanDays(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00.000Z`);
  const end = Date.parse(`${to}T00:00:00.000Z`);
  return Math.round((end - start) / 86_400_000);
}

export const MAX_BUSINESS_DATE_SPAN_DAYS = 366;

/** Shared Zod refine for exact day vs inclusive from/to business-date bounds. */
export function refineBusinessDateBounds(
  value: {
    exact?: string | undefined;
    from?: string | undefined;
    to?: string | undefined;
  },
  ctx: z.RefinementCtx,
  paths: { exact: string; from: string; to: string },
): void {
  if (value.exact && (value.from || value.to)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Use either an exact business date or from/to bounds, not both.",
      path: [paths.exact],
    });
  }
  const from = value.from ?? value.exact;
  const to = value.to ?? value.exact;
  if (from && to && from > to) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Business date from must be on or before to.",
      path: [paths.from],
    });
  }
  if (from && to && businessDateSpanDays(from, to) > MAX_BUSINESS_DATE_SPAN_DAYS) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Business date range cannot exceed ${String(MAX_BUSINESS_DATE_SPAN_DAYS)} days.`,
      path: [paths.to],
    });
  }
}
