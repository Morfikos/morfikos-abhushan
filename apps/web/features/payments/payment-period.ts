import {
  periodCaption as sharedPeriodCaption,
  type PeriodBounds,
  type PeriodPreset,
} from "@/lib/period-bounds";

export {
  boundsForPeriod,
  kolkataTodayCalendar,
  type PeriodBounds,
  type PeriodPreset,
} from "@/lib/period-bounds";

const COLLECTIONS_COPY = {
  allTime: "All-time collections. These are collections, not sales totals.",
  onDay: (date: string) => `Money received on ${date}. These are collections, not sales totals.`,
  fromTo: (from: string, to: string) =>
    `Money received from ${from} to ${to}. These are collections, not sales totals.`,
  fromOnward: (from: string) =>
    `Money received from ${from} onward. These are collections, not sales totals.`,
  through: (to: string) => `Money received through ${to}. These are collections, not sales totals.`,
} as const;

export function periodCaption(preset: PeriodPreset, bounds: PeriodBounds): string {
  return sharedPeriodCaption(preset, bounds, COLLECTIONS_COPY);
}
