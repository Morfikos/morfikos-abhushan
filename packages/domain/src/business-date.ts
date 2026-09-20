/**
 * Asia/Kolkata calendar dates for shop operations. Do not derive a business
 * date by dividing elapsed milliseconds by a fixed day length.
 */
export const SHOP_TIME_ZONE = "Asia/Kolkata" as const;

export function kolkataBusinessDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SHOP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
