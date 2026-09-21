const MONEY_PATTERN = /^\d+(\.\d{1,2})?$/;

/** Display formatting only. The decimal string stays the source for any later calculation. */
export function formatInr(amount: string): string {
  const negative = amount.startsWith("-");
  const raw = negative ? amount.slice(1) : amount;
  const [whole = "0", fraction = "00"] = raw.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const frac = `${fraction}00`.slice(0, 2);
  return `${negative ? "-" : ""}₹${grouped}.${frac}`;
}

/** Axis tick formatter: 0, 80k, 1.6L (Indian-style compact INR, no ₹). */
export function formatInrCompact(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 100_000) {
    const lakhs = abs / 100_000;
    const body = lakhs >= 10 ? lakhs.toFixed(0) : lakhs.toFixed(1).replace(/\.0$/, "");
    return `${sign}${body}L`;
  }
  if (abs >= 1_000) {
    const thousands = abs / 1_000;
    const body = thousands >= 10 ? thousands.toFixed(0) : thousands.toFixed(1).replace(/\.0$/, "");
    return `${sign}${body}k`;
  }
  return `${sign}${Math.round(abs).toString()}`;
}

export function isZeroMoney(amount: string | undefined | null): boolean {
  if (!amount) {
    return true;
  }
  return /^-?0+(\.0+)?$/.test(amount);
}

export function isPositiveMoney(value: string): boolean {
  const trimmed = value.trim();
  return MONEY_PATTERN.test(trimmed) && !/^0+(\.0+)?$/.test(trimmed);
}

export function isMoneyShape(value: string): boolean {
  return MONEY_PATTERN.test(value.trim());
}

function moneyToPaise(amount: string): bigint {
  const trimmed = amount.trim();
  const negative = trimmed.startsWith("-");
  const raw = negative ? trimmed.slice(1) : trimmed;
  if (!MONEY_PATTERN.test(raw)) {
    return 0n;
  }
  const [whole = "0", fraction = ""] = raw.split(".");
  const paise = BigInt(whole) * 100n + BigInt(`${fraction}00`.slice(0, 2));
  return negative ? -paise : paise;
}

function paiseToMoney(paise: bigint): string {
  const negative = paise < 0n;
  const absolute = negative ? -paise : paise;
  const whole = absolute / 100n;
  const fraction = absolute % 100n;
  return `${negative ? "-" : ""}${whole.toString()}.${fraction.toString().padStart(2, "0")}`;
}

/** Sums validated money strings without floating-point drift for display and gating. */
export function sumMoney(amounts: string[]): string {
  let paise = 0n;
  for (const amount of amounts) {
    paise += moneyToPaise(amount);
  }
  return paiseToMoney(paise);
}

/**
 * Orders money by value in paise. Comparing the decimal strings instead would sort
 * "9.00" above "10000.00" and refuse a legitimate partial collection.
 */
export function compareMoney(left: string, right: string): number {
  const leftPaise = moneyToPaise(left);
  const rightPaise = moneyToPaise(right);
  if (leftPaise === rightPaise) {
    return 0;
  }
  return leftPaise > rightPaise ? 1 : -1;
}

export function moneyEquals(left: string, right: string): boolean {
  return compareMoney(left, right) === 0;
}

/** left − right as a signed canonical money string. */
export function subtractMoney(left: string, right: string): string {
  return paiseToMoney(moneyToPaise(left) - moneyToPaise(right));
}
