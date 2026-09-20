import type { DecimalRoundingMode } from "./decimal";
import { isDecimalRoundingMode } from "./decimal";

/**
 * Versioned invoice calculation policy.
 * invoice.v1 methods are owner-approved (20 September 2026).
 */

export const CALCULATION_POLICY_STATUSES = ["draft", "approved", "retired"] as const;
export type CalculationPolicyStatus = (typeof CALCULATION_POLICY_STATUSES)[number];

export const CALCULATION_CURRENCIES = ["INR"] as const;
export type CalculationCurrency = (typeof CALCULATION_CURRENCIES)[number];

export const CALCULATION_WEIGHT_UNITS = ["g"] as const;
export type CalculationWeightUnit = (typeof CALCULATION_WEIGHT_UNITS)[number];

export const CALCULATION_RATE_UNITS = ["per_g"] as const;
export type CalculationRateUnit = (typeof CALCULATION_RATE_UNITS)[number];

/** Per-line making: fixed ₹, ₹/g net metal, or % of metal value. */
export const APPROVED_MAKING_CHARGE_METHODS = [
  "fixed",
  "per_gram",
  "percent_of_metal",
] as const;
export type ApprovedMakingChargeMethod = (typeof APPROVED_MAKING_CHARGE_METHODS)[number];

/** Wastage as % of net metal weight × metal rate; default none/zero. */
export const APPROVED_WASTAGE_METHODS = ["none", "percent_of_net_weight"] as const;
export type ApprovedWastageMethod = (typeof APPROVED_WASTAGE_METHODS)[number];

/** Line then invoice discounts in ₹ or %. */
export const APPROVED_DISCOUNT_METHODS = ["amount", "percent"] as const;
export type ApprovedDiscountMethod = (typeof APPROVED_DISCOUNT_METHODS)[number];

/**
 * Tax-exclusive 3% GST on taxable jewellery value (metal+making+wastage+stones−discounts).
 * MVP default supply mode is intra-state CGST+SGST until place-of-supply UI exists.
 */
export const APPROVED_TAX_METHODS = ["gst_jewellery_intra", "gst_jewellery_igst"] as const;
export type ApprovedTaxMethod = (typeof APPROVED_TAX_METHODS)[number];

/** Policy column values describing the approved method families. */
export const INVOICE_V1_POLICY_METHODS = {
  version: "invoice.v1",
  makingChargeMethod: "line_fixed_per_gram_or_percent",
  wastageMethod: "percent_of_net_weight",
  discountMethod: "line_then_invoice_amount_or_percent",
  taxMethod: "gst_jewellery_3pct_exclusive",
  roundingMode: "ROUND_HALF_UP" as const,
  /** Component and tax amounts round to paise; final payable rounds to ₹1 separately. */
  roundingScale: 2,
} as const;

export type CalculationPolicy = {
  version: string;
  status: CalculationPolicyStatus;
  currency: CalculationCurrency;
  weightUnit: CalculationWeightUnit;
  rateUnit: CalculationRateUnit;
  makingChargeMethod: string | null;
  wastageMethod: string | null;
  discountMethod: string | null;
  taxMethod: string | null;
  roundingMode: DecimalRoundingMode | null;
  roundingScale: number | null;
};

export function isCalculationPolicyStatus(value: string): value is CalculationPolicyStatus {
  return (CALCULATION_POLICY_STATUSES as readonly string[]).includes(value);
}

export function isApprovedMakingChargeMethod(value: string): value is ApprovedMakingChargeMethod {
  return (APPROVED_MAKING_CHARGE_METHODS as readonly string[]).includes(value);
}

export function isApprovedWastageMethod(value: string): value is ApprovedWastageMethod {
  return (APPROVED_WASTAGE_METHODS as readonly string[]).includes(value);
}

export function isApprovedDiscountMethod(value: string): value is ApprovedDiscountMethod {
  return (APPROVED_DISCOUNT_METHODS as readonly string[]).includes(value);
}

export function isApprovedTaxMethod(value: string): value is ApprovedTaxMethod {
  return (APPROVED_TAX_METHODS as readonly string[]).includes(value);
}

export function calculationPolicyIsApproved(policy: CalculationPolicy): boolean {
  return policy.status === "approved";
}

export function assertRoundingConfigured(policy: CalculationPolicy): {
  mode: DecimalRoundingMode;
  scale: number;
} {
  if (policy.roundingMode === null || policy.roundingScale === null) {
    throw new Error("Rounding mode and scale must be set on an approved calculation policy.");
  }
  if (!isDecimalRoundingMode(policy.roundingMode)) {
    throw new Error(`Unsupported rounding mode: ${policy.roundingMode}`);
  }
  if (!Number.isInteger(policy.roundingScale) || policy.roundingScale < 0) {
    throw new Error("Rounding scale must be a non-negative integer.");
  }
  return { mode: policy.roundingMode, scale: policy.roundingScale };
}
