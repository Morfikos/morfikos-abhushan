const MONEY_PATTERN = /^\d+(\.\d{1,2})?$/;
/** Display-only: accept DB-scale decimals (e.g. numeric(18,6)); output is always 2dp. */
const SIGNED_MONEY_PATTERN = /^-?\d+(\.\d+)?$/;

/**
 * Indian integer grouping: last three digits, then pairs.
 * `250000` → `2,50,000`. String-only — never Number / Intl.
 */
export function groupIndianInteger(whole: string): string {
  const digits = whole.replace(/^0+(?=\d)/, "") || "0";
  if (digits.length <= 3) {
    return digits;
  }
  const lastThree = digits.slice(-3);
  const head = digits.slice(0, -3);
  const pairs: string[] = [];
  let remaining = head;
  while (remaining.length > 2) {
    pairs.unshift(remaining.slice(-2));
    remaining = remaining.slice(0, -2);
  }
  if (remaining.length > 0) {
    pairs.unshift(remaining);
  }
  return `${pairs.join(",")},${lastThree}`;
}

function isZeroBody(raw: string): boolean {
  return /^0+(\.0+)?$/.test(raw);
}

/**
 * Staff and document display: Indian grouping, two decimals, ₹ prefix.
 * Empty or non-numeric input returns an em dash so a missing amount is not shown as zero.
 */
export function formatInr(amount: string): string {
  const trimmed = amount.trim();
  if (!trimmed || !SIGNED_MONEY_PATTERN.test(trimmed)) {
    return "—";
  }
  const negative = trimmed.startsWith("-");
  const raw = negative ? trimmed.slice(1) : trimmed;
  if (isZeroBody(raw)) {
    return "₹0.00";
  }
  const [whole = "0", fraction = ""] = raw.split(".");
  const grouped = groupIndianInteger(whole);
  const frac = `${fraction}00`.slice(0, 2);
  return `${negative ? "-" : ""}₹${grouped}.${frac}`;
}

/**
 * Indian grouping without ₹ (MoneyInput already shows a prefix).
 * Incomplete drafts (`1500.`, `.`) are returned unchanged.
 */
export function formatMoneyInputDisplay(amount: string): string {
  const trimmed = amount.trim();
  if (!trimmed || !MONEY_PATTERN.test(trimmed)) {
    return trimmed;
  }
  const [whole = "0", fraction = ""] = trimmed.split(".");
  const grouped = groupIndianInteger(whole);
  const frac = `${fraction}00`.slice(0, 2);
  return `${grouped}.${frac}`;
}
