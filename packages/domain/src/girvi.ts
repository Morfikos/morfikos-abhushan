import Decimal from "decimal.js";

import type { DecimalRoundingMode } from "./decimal";
import { assertMoneyAmount, assertPercent, isDecimalRoundingMode, roundDecimal } from "./decimal";

/**
 * Girvi interest, repayment allocation, and settlement for owner-approved
 * `girvi.v1` (21 September 2026). Any other method, an unapproved policy, or an
 * account whose frozen terms predate approval fails closed with
 * `CALCULATION_RULE_UNSUPPORTED`. Never approximate an unknown method.
 */

export const GIRVI_CALCULATION_UNSUPPORTED_CODE = "CALCULATION_RULE_UNSUPPORTED" as const;
export const GIRVI_AS_OF_BEFORE_LEDGER_CODE = "GIRVI_AS_OF_BEFORE_LEDGER" as const;
export const GIRVI_BACKDATED_EVENT_CODE = "GIRVI_BACKDATED_EVENT" as const;
export const GIRVI_OVERPAYMENT_CODE = "GIRVI_OVERPAYMENT" as const;

export class GirviCalculationUnsupportedError extends Error {
  readonly code = GIRVI_CALCULATION_UNSUPPORTED_CODE;

  constructor(message = "This Girvi account has no approved calculation method, so balances cannot be calculated.") {
    super(message);
    this.name = "GirviCalculationUnsupportedError";
  }
}

export class GirviAsOfBeforeLedgerError extends Error {
  readonly code = GIRVI_AS_OF_BEFORE_LEDGER_CODE;

  constructor(message = "The as-of date is before the latest posted event on this account.") {
    super(message);
    this.name = "GirviAsOfBeforeLedgerError";
  }
}

export class GirviBackdatedEventError extends Error {
  readonly code = GIRVI_BACKDATED_EVENT_CODE;

  constructor(message = "Backdated posting is disabled. The business date must be on or after the latest posted event.") {
    super(message);
    this.name = "GirviBackdatedEventError";
  }
}

export class GirviOverpaymentError extends Error {
  readonly code = GIRVI_OVERPAYMENT_CODE;

  constructor(message = "The amount is more than the settlement payable. Customer credit is not supported.") {
    super(message);
    this.name = "GirviOverpaymentError";
  }
}

/** Method families frozen on every `girvi.v1` account. Owner-approved. */
export const GIRVI_V1_POLICY_METHODS = {
  version: "girvi.v1",
  /** Rate is entered as a percentage per 30 days. "Monthly" is deliberately not used. */
  ratePeriod: "percent_per_30_days",
  interestMethod: "simple_on_outstanding_principal",
  /** Actual calendar days ÷ 30; start date counted, settlement date excluded. */
  dayCountConvention: "actual_days_over_30",
  minimumPeriod: "none",
  gracePeriod: "none",
  extraCharges: "none",
  allocationOrder: "interest_then_principal",
  principalReductionRule: "effective_on_repayment_business_date",
  roundingMode: "ROUND_HALF_UP" as DecimalRoundingMode,
  /** Payable interest rounds to paise. Settlement payable is never rounded to ₹1. */
  roundingScale: 2,
  backdatingPolicy: "disabled",
} as const;

/** Days in the approved rate period. Not a month length. */
const GIRVI_V1_RATE_PERIOD_DAYS = 30;

export const GIRVI_CALCULATION_POLICY_STATUSES = ["draft", "approved", "retired"] as const;
export type GirviCalculationPolicyStatus = (typeof GIRVI_CALCULATION_POLICY_STATUSES)[number];

export function isGirviCalculationPolicyStatus(value: string): value is GirviCalculationPolicyStatus {
  return (GIRVI_CALCULATION_POLICY_STATUSES as readonly string[]).includes(value);
}

export type GirviCalculationPolicy = {
  version: string;
  status: GirviCalculationPolicyStatus;
  ratePeriod: string | null;
  interestMethod: string | null;
  dayCountConvention: string | null;
  minimumPeriod: string | null;
  gracePeriod: string | null;
  extraCharges: string | null;
  allocationOrder: string | null;
  principalReductionRule: string | null;
  roundingMode: DecimalRoundingMode | null;
  roundingScale: number | null;
  backdatingPolicy: string | null;
};

/**
 * Reason the policy cannot be used for live math, or null when it matches the
 * approved `girvi.v1` method families exactly.
 */
export function girviPolicyUnsupportedReason(policy: GirviCalculationPolicy | null): string | null {
  if (!policy) {
    return "No Girvi calculation policy is configured for this shop.";
  }
  if (policy.status !== "approved") {
    return `Girvi calculation policy ${policy.version} is ${policy.status}, not approved.`;
  }
  if (policy.version !== GIRVI_V1_POLICY_METHODS.version) {
    return `Girvi calculation policy ${policy.version} is not a supported method version.`;
  }
  const mismatches: string[] = [];
  if (policy.ratePeriod !== GIRVI_V1_POLICY_METHODS.ratePeriod) {
    mismatches.push("rate period");
  }
  if (policy.interestMethod !== GIRVI_V1_POLICY_METHODS.interestMethod) {
    mismatches.push("interest method");
  }
  if (policy.dayCountConvention !== GIRVI_V1_POLICY_METHODS.dayCountConvention) {
    mismatches.push("day count");
  }
  if (policy.minimumPeriod !== GIRVI_V1_POLICY_METHODS.minimumPeriod) {
    mismatches.push("minimum period");
  }
  if (policy.gracePeriod !== GIRVI_V1_POLICY_METHODS.gracePeriod) {
    mismatches.push("grace period");
  }
  if (policy.extraCharges !== GIRVI_V1_POLICY_METHODS.extraCharges) {
    mismatches.push("extra charges");
  }
  if (policy.allocationOrder !== GIRVI_V1_POLICY_METHODS.allocationOrder) {
    mismatches.push("allocation order");
  }
  if (policy.principalReductionRule !== GIRVI_V1_POLICY_METHODS.principalReductionRule) {
    mismatches.push("principal reduction rule");
  }
  if (policy.backdatingPolicy !== GIRVI_V1_POLICY_METHODS.backdatingPolicy) {
    mismatches.push("backdating policy");
  }
  if (policy.roundingMode === null || !isDecimalRoundingMode(policy.roundingMode)) {
    mismatches.push("rounding mode");
  }
  if (policy.roundingScale === null || !Number.isInteger(policy.roundingScale) || policy.roundingScale < 0) {
    mismatches.push("rounding scale");
  }
  if (mismatches.length > 0) {
    return `Girvi calculation policy ${policy.version} does not match the approved method: ${mismatches.join(", ")}.`;
  }
  return null;
}

/** Terms frozen per account. Changing shop defaults later never rewrites these. */
export type GirviApprovedInterestTerms = {
  status: "approved";
  policy_version: string;
  rate_percent_per_30_days: string;
  method: string;
  day_count: string;
  allocation_order: string;
  minimum_period: string;
  grace_period: string;
  extra_charges: string;
  principal_reduction: string;
  backdating: string;
  rounding_mode: DecimalRoundingMode;
  rounding_scale: number;
};

export type GirviUnsupportedInterestTerms = {
  status: "unsupported";
  message: string;
  rate_percent_per_30_days: string | null;
};

export type GirviInterestTerms = GirviApprovedInterestTerms | GirviUnsupportedInterestTerms;

export type GirviTermsSnapshot = {
  principal_inr: string;
  start_business_date: string;
  maturity_business_date: string;
  interest: GirviInterestTerms;
};

export function buildGirviTermsSnapshot(input: {
  principalInr: string;
  startBusinessDate: string;
  maturityBusinessDate: string;
  interestRatePercentPer30Days?: string | null;
  policy?: GirviCalculationPolicy | null;
}): GirviTermsSnapshot {
  const rate = input.interestRatePercentPer30Days ?? null;
  return {
    principal_inr: input.principalInr,
    start_business_date: input.startBusinessDate,
    maturity_business_date: input.maturityBusinessDate,
    interest: buildGirviInterestTerms(rate, input.policy ?? null),
  };
}

function buildGirviInterestTerms(
  rate: string | null,
  policy: GirviCalculationPolicy | null,
): GirviInterestTerms {
  if (rate === null) {
    return {
      status: "unsupported",
      message:
        "No interest rate is recorded. Enter the rate as a percentage per 30 days to enable statements, repayment allocation, and settlement.",
      rate_percent_per_30_days: null,
    };
  }
  const reason = girviPolicyUnsupportedReason(policy);
  if (reason !== null || policy === null) {
    return {
      status: "unsupported",
      message: reason ?? "No Girvi calculation policy is configured for this shop.",
      rate_percent_per_30_days: rate,
    };
  }
  assertPercent(rate, "interest_rate_percent_per_30_days");
  const { mode, scale } = assertGirviRounding(policy);
  return {
    status: "approved",
    policy_version: policy.version,
    rate_percent_per_30_days: rate,
    method: GIRVI_V1_POLICY_METHODS.interestMethod,
    day_count: GIRVI_V1_POLICY_METHODS.dayCountConvention,
    allocation_order: GIRVI_V1_POLICY_METHODS.allocationOrder,
    minimum_period: GIRVI_V1_POLICY_METHODS.minimumPeriod,
    grace_period: GIRVI_V1_POLICY_METHODS.gracePeriod,
    extra_charges: GIRVI_V1_POLICY_METHODS.extraCharges,
    principal_reduction: GIRVI_V1_POLICY_METHODS.principalReductionRule,
    backdating: GIRVI_V1_POLICY_METHODS.backdatingPolicy,
    rounding_mode: mode,
    rounding_scale: scale,
  };
}

function assertGirviRounding(policy: GirviCalculationPolicy): { mode: DecimalRoundingMode; scale: number } {
  if (policy.roundingMode === null || !isDecimalRoundingMode(policy.roundingMode)) {
    throw new GirviCalculationUnsupportedError("The Girvi calculation policy has no rounding mode.");
  }
  if (policy.roundingScale === null || !Number.isInteger(policy.roundingScale) || policy.roundingScale < 0) {
    throw new GirviCalculationUnsupportedError("The Girvi calculation policy has no rounding scale.");
  }
  return { mode: policy.roundingMode, scale: policy.roundingScale };
}

export function girviTermsAreApproved(terms: GirviTermsSnapshot): terms is GirviTermsSnapshot & {
  interest: GirviApprovedInterestTerms;
} {
  return terms.interest.status === "approved";
}

/**
 * Calendar-date arithmetic for Asia/Kolkata business dates. Integer days-from-civil,
 * never elapsed milliseconds divided by a fixed day length.
 */
const BUSINESS_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function daysFromCivil(year: number, month: number, day: number): number {
  const shiftedYear = month <= 2 ? year - 1 : year;
  const era = Math.floor(shiftedYear / 400);
  const yearOfEra = shiftedYear - era * 400;
  const marchIndexedMonth = (month + 9) % 12;
  const dayOfYear = Math.floor((153 * marchIndexedMonth + 2) / 5) + day - 1;
  const dayOfEra =
    yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146097 + dayOfEra - 719468;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return isLeap ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function girviBusinessDateOrdinal(value: string): number {
  const match = BUSINESS_DATE_PATTERN.exec(value);
  if (!match) {
    throw new Error(`Business date must be YYYY-MM-DD, got ${value}.`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new Error(`Business date ${value} is not a real calendar date.`);
  }
  return daysFromCivil(year, month, day);
}

/** Elapsed calendar days from `from` (counted) up to `to` (excluded). */
export function girviElapsedDays(fromBusinessDate: string, toBusinessDate: string): number {
  return girviBusinessDateOrdinal(toBusinessDate) - girviBusinessDateOrdinal(fromBusinessDate);
}

export const GIRVI_LEDGER_EVENT_TYPES = [
  "disbursement",
  /** Imported opening position at a cutover date; written only by the spec 16 import. */
  "opening_balance",
  /** Unpaid interest recognized without a payment, such as a pre-cutover balance. */
  "interest_recognized",
  "repayment",
  "settlement",
  "waiver",
] as const;
export type GirviLedgerEventType = (typeof GIRVI_LEDGER_EVENT_TYPES)[number];

/**
 * A posted, immutable financial event. Positive principal increases the
 * outstanding loan; negative principal repays it. Positive interest recognizes
 * unpaid interest (opening balances only); negative interest pays or waives it.
 */
export type GirviLedgerEvent = {
  eventType: GirviLedgerEventType;
  effectiveBusinessDate: string;
  principalDeltaInr: string;
  interestDeltaInr: string;
  /** Deterministic order for several events on the same business date. */
  sequence: number;
};

export type GirviAccrualSegment = {
  fromBusinessDate: string;
  toBusinessDate: string;
  days: number;
  principalInr: string;
  interestInr: string;
};

export type GirviStatement = {
  policyVersion: string;
  ratePercentPer30Days: string;
  roundingMode: DecimalRoundingMode;
  roundingScale: number;
  startBusinessDate: string;
  maturityBusinessDate: string;
  asOfBusinessDate: string;
  principalOutstandingInr: string;
  interestOutstandingInr: string;
  payoffInr: string;
  principalRecoveredInr: string;
  interestReceivedInr: string;
  interestWaivedInr: string;
  principalWaivedInr: string;
  accrualSegments: GirviAccrualSegment[];
};

function sortLedgerEvents(events: readonly GirviLedgerEvent[]): GirviLedgerEvent[] {
  return [...events].sort((left, right) => {
    const leftDay = girviBusinessDateOrdinal(left.effectiveBusinessDate);
    const rightDay = girviBusinessDateOrdinal(right.effectiveBusinessDate);
    if (leftDay !== rightDay) {
      return leftDay - rightDay;
    }
    return left.sequence - right.sequence;
  });
}

/**
 * Simple interest on outstanding principal, split at every principal change.
 * Interest accrues at high precision and rounds only when money moves.
 */
export function computeGirviStatement(input: {
  terms: GirviTermsSnapshot;
  policy: GirviCalculationPolicy | null;
  events: readonly GirviLedgerEvent[];
  asOfBusinessDate: string;
}): GirviStatement {
  const terms = input.terms;
  if (terms.interest.status !== "approved") {
    throw new GirviCalculationUnsupportedError(terms.interest.message);
  }
  const policyReason = girviPolicyUnsupportedReason(input.policy);
  if (policyReason !== null || input.policy === null) {
    throw new GirviCalculationUnsupportedError(
      policyReason ?? "No Girvi calculation policy is configured for this shop.",
    );
  }
  if (input.policy.version !== terms.interest.policy_version) {
    throw new GirviCalculationUnsupportedError(
      `This account is frozen on ${terms.interest.policy_version}, which is not the approved ${input.policy.version} method.`,
    );
  }

  const mode = terms.interest.rounding_mode;
  const scale = terms.interest.rounding_scale;
  const rate = assertPercent(terms.interest.rate_percent_per_30_days, "rate_percent_per_30_days");
  const periodDays = new Decimal(GIRVI_V1_RATE_PERIOD_DAYS);

  const asOf = input.asOfBusinessDate;
  girviBusinessDateOrdinal(asOf);
  const money = (value: Decimal): string => roundDecimal(value, mode, scale).toFixed(scale);

  let principal = new Decimal(0);
  let unpaidInterest = new Decimal(0);
  let principalRecovered = new Decimal(0);
  let interestReceived = new Decimal(0);
  let interestWaived = new Decimal(0);
  let principalWaived = new Decimal(0);
  let cursor = terms.start_business_date;
  const segments: GirviAccrualSegment[] = [];

  const accrueTo = (toBusinessDate: string): void => {
    const days = girviElapsedDays(cursor, toBusinessDate);
    if (days <= 0) {
      return;
    }
    const interest = principal.times(rate).dividedBy(100).times(days).dividedBy(periodDays);
    segments.push({
      fromBusinessDate: cursor,
      toBusinessDate,
      days,
      principalInr: money(principal),
      interestInr: money(interest),
    });
    unpaidInterest = unpaidInterest.plus(interest);
    cursor = toBusinessDate;
  };

  for (const event of sortLedgerEvents(input.events)) {
    if (girviElapsedDays(cursor, event.effectiveBusinessDate) < 0) {
      throw new GirviBackdatedEventError();
    }
    accrueTo(event.effectiveBusinessDate);
    cursor = event.effectiveBusinessDate;

    const principalDelta = assertMoneyAmount(event.principalDeltaInr, "principal_delta_inr");
    const interestDelta = assertMoneyAmount(event.interestDeltaInr, "interest_delta_inr");

    // Money moves here, so the carried interest becomes an exact payable figure.
    unpaidInterest = roundDecimal(unpaidInterest, mode, scale).plus(interestDelta);
    principal = principal.plus(principalDelta);

    if (principalDelta.isNegative()) {
      if (event.eventType === "waiver") {
        principalWaived = principalWaived.plus(principalDelta.negated());
      } else {
        principalRecovered = principalRecovered.plus(principalDelta.negated());
      }
    }
    if (interestDelta.isNegative()) {
      if (event.eventType === "waiver") {
        interestWaived = interestWaived.plus(interestDelta.negated());
      } else {
        interestReceived = interestReceived.plus(interestDelta.negated());
      }
    }
  }

  if (girviElapsedDays(cursor, asOf) < 0) {
    throw new GirviAsOfBeforeLedgerError();
  }
  accrueTo(asOf);

  const principalOutstanding = roundDecimal(principal, mode, scale);
  const interestOutstanding = roundDecimal(unpaidInterest, mode, scale);

  return {
    policyVersion: terms.interest.policy_version,
    ratePercentPer30Days: terms.interest.rate_percent_per_30_days,
    roundingMode: mode,
    roundingScale: scale,
    startBusinessDate: terms.start_business_date,
    maturityBusinessDate: terms.maturity_business_date,
    asOfBusinessDate: asOf,
    principalOutstandingInr: money(principalOutstanding),
    interestOutstandingInr: money(interestOutstanding),
    payoffInr: money(principalOutstanding.plus(interestOutstanding)),
    principalRecoveredInr: money(principalRecovered),
    interestReceivedInr: money(interestReceived),
    interestWaivedInr: money(interestWaived),
    principalWaivedInr: money(principalWaived),
    accrualSegments: segments,
  };
}

export type GirviRepaymentAllocation = {
  amountInr: string;
  interestPaidInr: string;
  principalPaidInr: string;
  interestRemainingInr: string;
  principalRemainingInr: string;
  payoffBeforeInr: string;
  payoffAfterInr: string;
  clearsAccount: boolean;
};

/**
 * Approved order: clear outstanding interest first, then reduce principal.
 * Overpayment past the settlement payable is rejected; there is no customer credit.
 */
export function allocateGirviRepayment(input: {
  statement: GirviStatement;
  amountInr: string;
}): GirviRepaymentAllocation {
  const amount = assertMoneyAmount(input.amountInr, "amount_inr");
  if (amount.lessThanOrEqualTo(0)) {
    throw new Error("amount_inr must be greater than zero.");
  }
  const interestOutstanding = new Decimal(input.statement.interestOutstandingInr);
  const principalOutstanding = new Decimal(input.statement.principalOutstandingInr);
  const payoffBefore = interestOutstanding.plus(principalOutstanding);
  if (amount.greaterThan(payoffBefore)) {
    throw new GirviOverpaymentError();
  }

  const scale = input.statement.roundingScale;
  const money = (value: Decimal): string => value.toFixed(scale);
  const interestPaid = Decimal.min(amount, interestOutstanding);
  const principalPaid = amount.minus(interestPaid);
  const interestRemaining = interestOutstanding.minus(interestPaid);
  const principalRemaining = principalOutstanding.minus(principalPaid);
  const payoffAfter = interestRemaining.plus(principalRemaining);

  return {
    amountInr: money(amount),
    interestPaidInr: money(interestPaid),
    principalPaidInr: money(principalPaid),
    interestRemainingInr: money(interestRemaining),
    principalRemainingInr: money(principalRemaining),
    payoffBeforeInr: money(payoffBefore),
    payoffAfterInr: money(payoffAfter),
    clearsAccount: payoffAfter.isZero(),
  };
}

export function girviStatementIsCleared(statement: GirviStatement): boolean {
  return new Decimal(statement.payoffInr).isZero();
}

/**
 * Presentation-only overdue flag. Never changes custody ownership or account status enum.
 * Overdue means active and past maturity; jewellery remains customer collateral in custody.
 */
export function girviAccountIsOverdue(input: {
  status: string;
  maturityBusinessDate: string;
  asOfBusinessDate: string;
}): boolean {
  return input.status === "active" && input.maturityBusinessDate < input.asOfBusinessDate;
}
