import Decimal from "decimal.js";

import {
  assertRoundingConfigured,
  calculationPolicyIsApproved,
  INVOICE_V1_POLICY_METHODS,
  isApprovedDiscountMethod,
  isApprovedMakingChargeMethod,
  isApprovedTaxMethod,
  isApprovedWastageMethod,
  type CalculationPolicy,
} from "./calculation-policy";
import {
  assertMoneyAmount,
  assertPercent,
  assertRatePerGram,
  assertWeightGrams,
  roundDecimal,
  type DecimalRoundingMode,
} from "./decimal";
import { netMetalWeightMatches } from "./article-inventory";

/**
 * Pure invoice quote engine (owner-approved invoice.v1).
 *
 * Order: metal → making → wastage → stones → line discount → allocated invoice
 * discount → taxable; sum taxable + GST + round-off = payable.
 */

export const CALCULATION_ERROR_CODES = [
  "CALCULATION_POLICY_UNAPPROVED",
  "CALCULATION_RULE_UNSUPPORTED",
  "CALCULATION_INPUT_INVALID",
] as const;

export type CalculationErrorCode = (typeof CALCULATION_ERROR_CODES)[number];

export class CalculationDomainError extends Error {
  readonly code: CalculationErrorCode;
  readonly field: string | undefined;

  constructor(code: CalculationErrorCode, message: string, field?: string) {
    super(message);
    this.name = "CalculationDomainError";
    this.code = code;
    this.field = field;
  }
}

export type StoneChargeInput = {
  description: string;
  amountInr: string;
};

export type MakingChargeInput =
  | { method: "fixed"; amountInr: string }
  | { method: "per_gram"; ratePerGram: string }
  | { method: "percent_of_metal"; percent: string };

export type WastageInput =
  | { method: "none" }
  | { method: "percent_of_net_weight"; percent: string };

export type LineDiscountInput =
  | { method: "amount"; amountInr: string }
  | { method: "percent"; percent: string };

export type InvoiceDiscountInput =
  | { method: "amount"; amountInr: string }
  | { method: "percent"; percent: string };

export type TaxInput =
  | { method: "gst_jewellery_intra" }
  | { method: "gst_jewellery_igst" };

export type InvoiceQuoteLineInput = {
  lineId: string;
  articleId?: string;
  metal: "gold" | "silver";
  purity: string;
  grossWeightGrams: string;
  nonMetalWeightGrams: string;
  netMetalWeightGrams: string;
  ratePerGram: string;
  makingChargeInput: MakingChargeInput;
  wastageInput: WastageInput | null;
  stoneCharges: StoneChargeInput[];
  lineDiscountInput: LineDiscountInput | null;
};

export type InvoiceQuoteInput = {
  policyVersion: string;
  businessDate: string;
  lines: InvoiceQuoteLineInput[];
  invoiceDiscountInput: InvoiceDiscountInput | null;
  /** Defaults to gst_jewellery_intra when omitted (MVP single-branch). */
  taxInput: TaxInput | null;
};

export type InvoiceQuoteLineBreakdown = {
  lineId: string;
  articleId: string | null;
  metalValueInr: string;
  makingChargeInr: string;
  wastageInr: string;
  stoneChargesInr: string;
  lineDiscountInr: string;
  invoiceDiscountAllocatedInr: string;
  taxableInr: string;
  lineSubtotalInr: string;
};

export type InvoiceQuoteResult = {
  policyVersion: string;
  currency: "INR";
  lines: InvoiceQuoteLineBreakdown[];
  metalValueInr: string;
  makingChargeInr: string;
  wastageInr: string;
  stoneChargesInr: string;
  lineDiscountsInr: string;
  invoiceDiscountInr: string;
  taxableInr: string;
  cgstInr: string;
  sgstInr: string;
  igstInr: string;
  taxInr: string;
  roundOffInr: string;
  grandTotalInr: string;
  roundingApplied: {
    mode: DecimalRoundingMode;
    scale: number;
    stage: "grand_total";
  };
};

function inputInvalid(message: string, field?: string): never {
  throw new CalculationDomainError("CALCULATION_INPUT_INVALID", message, field);
}

function policyUnapproved(message: string): never {
  throw new CalculationDomainError("CALCULATION_POLICY_UNAPPROVED", message);
}

function ruleUnsupported(message: string, field?: string): never {
  throw new CalculationDomainError("CALCULATION_RULE_UNSUPPORTED", message, field);
}

function moneyString(value: Decimal): string {
  return value.toFixed(2);
}

function assertInvoiceV1Policy(policy: CalculationPolicy): {
  mode: DecimalRoundingMode;
  scale: number;
} {
  if (policy.version !== INVOICE_V1_POLICY_METHODS.version) {
    ruleUnsupported(
      `Policy version ${policy.version} has no implemented calculator. Use ${INVOICE_V1_POLICY_METHODS.version}.`,
      "policy_version",
    );
  }
  if (policy.makingChargeMethod !== INVOICE_V1_POLICY_METHODS.makingChargeMethod) {
    ruleUnsupported("Making-charge family on policy does not match invoice.v1.", "making_charge_method");
  }
  if (policy.wastageMethod !== INVOICE_V1_POLICY_METHODS.wastageMethod) {
    ruleUnsupported("Wastage family on policy does not match invoice.v1.", "wastage_method");
  }
  if (policy.discountMethod !== INVOICE_V1_POLICY_METHODS.discountMethod) {
    ruleUnsupported("Discount family on policy does not match invoice.v1.", "discount_method");
  }
  if (policy.taxMethod !== INVOICE_V1_POLICY_METHODS.taxMethod) {
    ruleUnsupported("Tax family on policy does not match invoice.v1.", "tax_method");
  }
  return assertRoundingConfigured(policy);
}

function computeMaking(
  input: MakingChargeInput,
  netMetal: Decimal,
  metalValue: Decimal,
  fieldPrefix: string,
): Decimal {
  if (!isApprovedMakingChargeMethod(input.method)) {
    ruleUnsupported(`Unsupported making-charge method: ${input.method}`, `${fieldPrefix}.making_charge`);
  }
  if (input.method === "fixed") {
    try {
      return assertMoneyAmount(input.amountInr, `${fieldPrefix}.making_charge.amount_inr`);
    } catch (error) {
      inputInvalid(error instanceof Error ? error.message : "Invalid making amount.");
    }
  }
  if (input.method === "per_gram") {
    try {
      const rate = assertRatePerGram(input.ratePerGram, `${fieldPrefix}.making_charge.rate_per_gram`);
      return netMetal.times(rate);
    } catch (error) {
      inputInvalid(error instanceof Error ? error.message : "Invalid making rate.");
    }
  }
  try {
    const percent = assertPercent(input.percent, `${fieldPrefix}.making_charge.percent`);
    return metalValue.times(percent).dividedBy(100);
  } catch (error) {
    inputInvalid(error instanceof Error ? error.message : "Invalid making percent.");
  }
}

function computeWastage(
  input: WastageInput | null,
  netMetal: Decimal,
  ratePerGram: Decimal,
  fieldPrefix: string,
): Decimal {
  if (input === null || input.method === "none") {
    return new Decimal(0);
  }
  if (!isApprovedWastageMethod(input.method)) {
    ruleUnsupported(`Unsupported wastage method: ${input.method}`, `${fieldPrefix}.wastage`);
  }
  try {
    const percent = assertPercent(input.percent, `${fieldPrefix}.wastage.percent`);
    return netMetal.times(percent).dividedBy(100).times(ratePerGram);
  } catch (error) {
    inputInvalid(error instanceof Error ? error.message : "Invalid wastage percent.");
  }
}

function computeStoneTotal(stones: StoneChargeInput[], fieldPrefix: string): Decimal {
  let total = new Decimal(0);
  for (let i = 0; i < stones.length; i += 1) {
    const stone = stones[i];
    if (!stone) {
      continue;
    }
    if (stone.description.trim().length === 0) {
      inputInvalid("Stone description is required.", `${fieldPrefix}.stone_charges[${String(i)}].description`);
    }
    try {
      const amount = assertMoneyAmount(stone.amountInr, `${fieldPrefix}.stone_charges[${String(i)}].amount_inr`);
      if (amount.isNegative()) {
        inputInvalid("Stone charge must not be negative.", `${fieldPrefix}.stone_charges[${String(i)}].amount_inr`);
      }
      total = total.plus(amount);
    } catch (error) {
      inputInvalid(error instanceof Error ? error.message : "Invalid stone amount.");
    }
  }
  return total;
}

function computeDiscount(
  input: LineDiscountInput | InvoiceDiscountInput,
  base: Decimal,
  field: string,
): Decimal {
  if (!isApprovedDiscountMethod(input.method)) {
    ruleUnsupported(`Unsupported discount method: ${input.method}`, field);
  }
  let discount: Decimal;
  try {
    if (input.method === "amount") {
      discount = assertMoneyAmount(input.amountInr, `${field}.amount_inr`);
    } else {
      const percent = assertPercent(input.percent, `${field}.percent`);
      discount = base.times(percent).dividedBy(100);
    }
  } catch (error) {
    inputInvalid(error instanceof Error ? error.message : "Invalid discount.");
  }
  if (discount.isNegative()) {
    inputInvalid("Discount must not be negative.", field);
  }
  if (discount.gt(base)) {
    inputInvalid("Discount exceeds the eligible base; reduce the discount.", field);
  }
  return discount;
}

type WorkingLine = {
  lineId: string;
  articleId: string | null;
  metalValue: Decimal;
  making: Decimal;
  wastage: Decimal;
  stones: Decimal;
  lineDiscount: Decimal;
  afterLineDiscount: Decimal;
};

/**
 * Quote an invoice under an explicit approved policy.
 */
export function quoteInvoice(input: InvoiceQuoteInput, policy: CalculationPolicy): InvoiceQuoteResult {
  if (input.policyVersion !== policy.version) {
    inputInvalid(
      `Quote policy version ${input.policyVersion} does not match loaded policy ${policy.version}.`,
      "policy_version",
    );
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.businessDate)) {
    inputInvalid("business_date must be YYYY-MM-DD.", "business_date");
  }

  if (input.lines.length === 0) {
    inputInvalid("At least one invoice line is required.", "lines");
  }

  if (!calculationPolicyIsApproved(policy)) {
    policyUnapproved(
      `Calculation policy ${policy.version} is ${policy.status}; only an approved policy may produce live totals.`,
    );
  }

  const { mode, scale } = assertInvoiceV1Policy(policy);
  const moneyScale = scale;

  const working: WorkingLine[] = [];

  for (let index = 0; index < input.lines.length; index += 1) {
    const line = input.lines[index];
    if (!line) {
      continue;
    }
    const prefix = `lines[${String(index)}]`;

    let netMetal: Decimal;
    let rate: Decimal;
    try {
      assertWeightGrams(line.grossWeightGrams, `${prefix}.gross_weight_grams`);
      assertWeightGrams(line.nonMetalWeightGrams, `${prefix}.non_metal_weight_grams`);
      netMetal = assertWeightGrams(line.netMetalWeightGrams, `${prefix}.net_metal_weight_grams`);
      rate = assertRatePerGram(line.ratePerGram, `${prefix}.rate_per_gram`);
    } catch (error) {
      inputInvalid(error instanceof Error ? error.message : "Invalid decimal input.");
    }

    if (line.purity.trim().length === 0) {
      inputInvalid("Purity is required.", `${prefix}.purity`);
    }
    if (rate.lte(0)) {
      inputInvalid("Metal rate must be greater than zero.", `${prefix}.rate_per_gram`);
    }
    if (netMetal.lte(0)) {
      inputInvalid("Net metal weight must be positive.", `${prefix}.net_metal_weight_grams`);
    }
    if (
      !netMetalWeightMatches({
        grossWeightGrams: line.grossWeightGrams,
        nonMetalWeightGrams: line.nonMetalWeightGrams,
        netMetalWeightGrams: line.netMetalWeightGrams,
      })
    ) {
      inputInvalid(
        "Net metal weight must equal gross weight minus non-metal weight.",
        `${prefix}.net_metal_weight_grams`,
      );
    }

    const metalValue = roundDecimal(netMetal.times(rate), mode, moneyScale);
    const making = roundDecimal(computeMaking(line.makingChargeInput, netMetal, metalValue, prefix), mode, moneyScale);
    const wastage = roundDecimal(computeWastage(line.wastageInput, netMetal, rate, prefix), mode, moneyScale);
    const stones = roundDecimal(computeStoneTotal(line.stoneCharges, prefix), mode, moneyScale);
    const eligible = metalValue.plus(making).plus(wastage).plus(stones);
    const lineDiscount = line.lineDiscountInput
      ? roundDecimal(computeDiscount(line.lineDiscountInput, eligible, `${prefix}.line_discount`), mode, moneyScale)
      : new Decimal(0);
    const afterLineDiscount = eligible.minus(lineDiscount);

    working.push({
      lineId: line.lineId,
      articleId: line.articleId ?? null,
      metalValue,
      making,
      wastage,
      stones,
      lineDiscount,
      afterLineDiscount,
    });
  }

  const subtotalAfterLineDiscounts = working.reduce(
    (sum, line) => sum.plus(line.afterLineDiscount),
    new Decimal(0),
  );

  let invoiceDiscount = new Decimal(0);
  if (input.invoiceDiscountInput) {
    invoiceDiscount = roundDecimal(
      computeDiscount(input.invoiceDiscountInput, subtotalAfterLineDiscounts, "invoice_discount"),
      mode,
      moneyScale,
    );
  }

  const allocations: Decimal[] = working.map(() => new Decimal(0));
  if (invoiceDiscount.gt(0)) {
    if (subtotalAfterLineDiscounts.lte(0)) {
      inputInvalid("Cannot apply an invoice discount when the eligible subtotal is zero.", "invoice_discount");
    }
    let allocated = new Decimal(0);
    for (let i = 0; i < working.length; i += 1) {
      const line = working[i]!;
      if (i === working.length - 1) {
        allocations[i] = invoiceDiscount.minus(allocated);
      } else {
        const share = roundDecimal(
          invoiceDiscount.times(line.afterLineDiscount).dividedBy(subtotalAfterLineDiscounts),
          mode,
          moneyScale,
        );
        allocations[i] = share;
        allocated = allocated.plus(share);
      }
      if (allocations[i]!.gt(line.afterLineDiscount)) {
        inputInvalid("Allocated invoice discount exceeds a line base.", "invoice_discount");
      }
    }
  }

  const taxMethod: TaxInput["method"] = input.taxInput?.method ?? "gst_jewellery_intra";
  if (input.taxInput && !isApprovedTaxMethod(input.taxInput.method)) {
    ruleUnsupported(`Unsupported tax method: ${input.taxInput.method}`, "tax");
  }

  const lines: InvoiceQuoteLineBreakdown[] = [];
  let metalSum = new Decimal(0);
  let makingSum = new Decimal(0);
  let wastageSum = new Decimal(0);
  let stoneSum = new Decimal(0);
  let lineDiscountSum = new Decimal(0);
  let taxableSum = new Decimal(0);

  for (let i = 0; i < working.length; i += 1) {
    const line = working[i]!;
    const allocated = allocations[i] ?? new Decimal(0);
    const taxable = line.afterLineDiscount.minus(allocated);
    metalSum = metalSum.plus(line.metalValue);
    makingSum = makingSum.plus(line.making);
    wastageSum = wastageSum.plus(line.wastage);
    stoneSum = stoneSum.plus(line.stones);
    lineDiscountSum = lineDiscountSum.plus(line.lineDiscount);
    taxableSum = taxableSum.plus(taxable);
    lines.push({
      lineId: line.lineId,
      articleId: line.articleId,
      metalValueInr: moneyString(line.metalValue),
      makingChargeInr: moneyString(line.making),
      wastageInr: moneyString(line.wastage),
      stoneChargesInr: moneyString(line.stones),
      lineDiscountInr: moneyString(line.lineDiscount),
      invoiceDiscountAllocatedInr: moneyString(allocated),
      taxableInr: moneyString(taxable),
      lineSubtotalInr: moneyString(taxable),
    });
  }

  let cgst = new Decimal(0);
  let sgst = new Decimal(0);
  let igst = new Decimal(0);
  if (taxMethod === "gst_jewellery_intra") {
    cgst = roundDecimal(taxableSum.times("0.015"), mode, moneyScale);
    sgst = roundDecimal(taxableSum.times("0.015"), mode, moneyScale);
  } else {
    igst = roundDecimal(taxableSum.times("0.03"), mode, moneyScale);
  }
  const tax = cgst.plus(sgst).plus(igst);
  const beforeRound = taxableSum.plus(tax);
  const payable = roundDecimal(beforeRound, mode, 0);
  const roundOff = payable.minus(beforeRound);

  return {
    policyVersion: policy.version,
    currency: "INR",
    lines,
    metalValueInr: moneyString(metalSum),
    makingChargeInr: moneyString(makingSum),
    wastageInr: moneyString(wastageSum),
    stoneChargesInr: moneyString(stoneSum),
    lineDiscountsInr: moneyString(lineDiscountSum),
    invoiceDiscountInr: moneyString(invoiceDiscount),
    taxableInr: moneyString(taxableSum),
    cgstInr: moneyString(cgst),
    sgstInr: moneyString(sgst),
    igstInr: moneyString(igst),
    taxInr: moneyString(tax),
    roundOffInr: moneyString(roundOff),
    grandTotalInr: moneyString(payable),
    roundingApplied: {
      mode,
      scale: 0,
      stage: "grand_total",
    },
  };
}

