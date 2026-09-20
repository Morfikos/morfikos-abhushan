import Decimal from "decimal.js";

/**
 * Decimal helpers for invoice and Girvi engines.
 * Never use JavaScript Number, parseFloat, or toFixed for financial math.
 */

export const WEIGHT_MAX_INTEGER_DIGITS = 10;
export const WEIGHT_MAX_FRACTIONAL_DIGITS = 4;
export const RATE_MAX_INTEGER_DIGITS = 12;
export const RATE_MAX_FRACTIONAL_DIGITS = 6;
export const MONEY_MAX_INTEGER_DIGITS = 16;
export const MONEY_MAX_FRACTIONAL_DIGITS = 2;
export const PERCENT_MAX_FRACTIONAL_DIGITS = 6;

export const DECIMAL_ROUNDING_MODES = [
  "ROUND_UP",
  "ROUND_DOWN",
  "ROUND_CEIL",
  "ROUND_FLOOR",
  "ROUND_HALF_UP",
  "ROUND_HALF_DOWN",
  "ROUND_HALF_EVEN",
  "ROUND_HALF_CEIL",
  "ROUND_HALF_FLOOR",
] as const;

export type DecimalRoundingMode = (typeof DECIMAL_ROUNDING_MODES)[number];

const DECIMAL_MODE_TO_DECIMAL_JS: Record<DecimalRoundingMode, Decimal.Rounding> = {
  ROUND_UP: Decimal.ROUND_UP,
  ROUND_DOWN: Decimal.ROUND_DOWN,
  ROUND_CEIL: Decimal.ROUND_CEIL,
  ROUND_FLOOR: Decimal.ROUND_FLOOR,
  ROUND_HALF_UP: Decimal.ROUND_HALF_UP,
  ROUND_HALF_DOWN: Decimal.ROUND_HALF_DOWN,
  ROUND_HALF_EVEN: Decimal.ROUND_HALF_EVEN,
  ROUND_HALF_CEIL: Decimal.ROUND_HALF_CEIL,
  ROUND_HALF_FLOOR: Decimal.ROUND_HALF_FLOOR,
};

export function isDecimalRoundingMode(value: string): value is DecimalRoundingMode {
  return (DECIMAL_ROUNDING_MODES as readonly string[]).includes(value);
}

export function decimalFromString(value: string): Decimal {
  try {
    return new Decimal(value);
  } catch {
    throw new Error(`Invalid decimal string: ${value}`);
  }
}

export function assertFiniteDecimal(value: string, field: string): Decimal {
  let parsed: Decimal;
  try {
    parsed = new Decimal(value);
  } catch {
    throw new Error(`${field} must be a decimal string.`);
  }
  if (!parsed.isFinite()) {
    throw new Error(`${field} must be a finite decimal string.`);
  }
  return parsed;
}

function assertPrecision(
  value: Decimal,
  field: string,
  maxIntegerDigits: number,
  maxFractionalDigits: number,
): void {
  if (value.decimalPlaces() > maxFractionalDigits) {
    throw new Error(
      `${field} may have at most ${String(maxFractionalDigits)} fractional digit(s).`,
    );
  }
  const abs = value.abs();
  const integerDigits = abs.truncated().eq(0) ? 1 : abs.truncated().toFixed().length;
  if (integerDigits > maxIntegerDigits) {
    throw new Error(`${field} exceeds the allowed integer precision.`);
  }
}

export function assertWeightGrams(value: string, field = "weight"): Decimal {
  const parsed = assertFiniteDecimal(value, field);
  if (parsed.isNegative()) {
    throw new Error(`${field} must not be negative.`);
  }
  assertPrecision(parsed, field, WEIGHT_MAX_INTEGER_DIGITS, WEIGHT_MAX_FRACTIONAL_DIGITS);
  return parsed;
}

export function assertRatePerGram(value: string, field = "rate_per_gram"): Decimal {
  const parsed = assertFiniteDecimal(value, field);
  if (parsed.isNegative()) {
    throw new Error(`${field} must not be negative.`);
  }
  assertPrecision(parsed, field, RATE_MAX_INTEGER_DIGITS, RATE_MAX_FRACTIONAL_DIGITS);
  return parsed;
}

export function assertMoneyAmount(value: string, field = "amount"): Decimal {
  const parsed = assertFiniteDecimal(value, field);
  assertPrecision(parsed, field, MONEY_MAX_INTEGER_DIGITS, MONEY_MAX_FRACTIONAL_DIGITS);
  return parsed;
}

export function assertPercent(value: string, field = "percent"): Decimal {
  const parsed = assertFiniteDecimal(value, field);
  if (parsed.isNegative()) {
    throw new Error(`${field} must not be negative.`);
  }
  if (parsed.gt(100)) {
    throw new Error(`${field} must be between 0 and 100.`);
  }
  assertPrecision(parsed, field, RATE_MAX_INTEGER_DIGITS, PERCENT_MAX_FRACTIONAL_DIGITS);
  return parsed;
}

export function roundDecimal(
  value: Decimal,
  mode: DecimalRoundingMode,
  scale: number,
): Decimal {
  if (!Number.isInteger(scale) || scale < 0 || scale > 18) {
    throw new Error("Rounding scale must be an integer from 0 to 18.");
  }
  return value.toDecimalPlaces(scale, DECIMAL_MODE_TO_DECIMAL_JS[mode]);
}

export function decimalToPlainString(value: Decimal): string {
  return value.toFixed();
}
