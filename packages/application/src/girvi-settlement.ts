import { createHash } from "node:crypto";

import type {
  GirviAccount,
  GirviReleaseCreate,
  GirviReleaseResult,
  GirviRepaymentCreate,
  GirviRepaymentResult,
  GirviSettlementCreate,
  GirviSettlementQuote,
  GirviSettlementResult,
  GirviStatementDto,
  GirviTermsSnapshotDto,
} from "@aabhushan/contracts";
import type { GirviStatement, GirviTermsSnapshot } from "@aabhushan/domain";
import {
  GirviAsOfBeforeLedgerError,
  GirviBackdatedEventError,
  GirviCalculationUnsupportedError,
  GirviOverpaymentError,
  allocateGirviRepayment,
  computeGirviStatement,
  girviAccountIsOverdue,
  girviElapsedDays,
  kolkataBusinessDate,
} from "@aabhushan/domain";

import { assertPermission } from "./authorize";
import type { GirviPostingLock, GirviRepository } from "./girvi";
import { ApplicationHttpError, conflictError, notFoundError, validationError } from "./http-error";
import type { ResolvedStaffAccess } from "./staff-access";

/**
 * Spec 12 posting services on owner-approved `girvi.v1`.
 *
 * Reads never write interest: a statement or a reminder job calculates from the
 * frozen terms plus posted events and changes nothing. Repayment, settlement,
 * and release each lock the account, and physical release is a second action
 * behind `girvi.release`.
 */

const REPAYMENT_OPERATION = "girvi.repayment";
const SETTLE_OPERATION = "girvi.settle";
const RELEASE_OPERATION = "girvi.release";

const RATE_PERIOD_LABEL = "per 30 days" as const;

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

function hashPayload(operation: string, accountId: string, body: unknown): string {
  return createHash("sha256")
    .update(canonicalJson({ operation, account_id: accountId, body }))
    .digest("hex");
}

function calculationUnsupportedError(message: string): ApplicationHttpError {
  return new ApplicationHttpError("CALCULATION_RULE_UNSUPPORTED", message, 422);
}

/** Domain refusals become readable HTTP failures; nothing is approximated. */
function rethrowGirviDomainError(error: unknown): never {
  if (error instanceof GirviCalculationUnsupportedError) {
    throw calculationUnsupportedError(error.message);
  }
  if (error instanceof GirviAsOfBeforeLedgerError) {
    throw new ApplicationHttpError(
      "GIRVI_AS_OF_BEFORE_LEDGER",
      "Choose a date on or after the latest posted repayment or settlement on this account.",
      422,
      [{ field: "as_of", message: "On or after the latest posted event." }],
    );
  }
  if (error instanceof GirviBackdatedEventError) {
    throw new ApplicationHttpError(
      "GIRVI_BACKDATED_EVENT",
      "Backdated posting is disabled. Use a business date on or after the latest posted event.",
      422,
      [{ field: "business_date", message: "On or after the latest posted event." }],
    );
  }
  if (error instanceof GirviOverpaymentError) {
    throw new ApplicationHttpError(
      "GIRVI_OVERPAYMENT",
      "The amount is more than the settlement payable. Customer credit is not supported.",
      422,
      [{ field: "amount_inr", message: "Not more than the settlement payable." }],
    );
  }
  throw error;
}

function termsFromSnapshot(snapshot: GirviTermsSnapshotDto | Record<string, unknown>): GirviTermsSnapshot {
  return snapshot as unknown as GirviTermsSnapshot;
}

function assertNotFutureBusinessDate(businessDate: string, field: string): void {
  if (girviElapsedDays(kolkataBusinessDate(), businessDate) > 0) {
    throw validationError("Future-dated Girvi posting is disabled. Use today or an earlier business date.", [
      { field, message: "Today or earlier." },
    ]);
  }
}

/**
 * Backdating is disabled: a new event must not land before an already posted one,
 * which would rewrite interest that the shop has already acted on.
 */
async function assertNotBackdated(
  repo: GirviRepository,
  accountId: string,
  businessDate: string,
): Promise<void> {
  const latest = await repo.latestLedgerBusinessDate(accountId);
  if (latest !== null && girviElapsedDays(latest, businessDate) < 0) {
    throw new ApplicationHttpError(
      "GIRVI_BACKDATED_EVENT",
      `Backdated posting is disabled. The latest posted event on this account is ${latest}.`,
      422,
      [{ field: "business_date", message: `On or after ${latest}.` }],
    );
  }
}

function assertPostable(locked: GirviPostingLock): void {
  if (locked.status === "draft") {
    throw validationError("Activate the Girvi account before recording money against it.");
  }
  if (locked.status === "released") {
    throw validationError("This account is released. Its collateral has already been handed back.");
  }
}

async function statementFor(
  repo: GirviRepository,
  account: {
    id: string;
    termsSnapshot: GirviTermsSnapshotDto | Record<string, unknown>;
  },
  asOfBusinessDate: string,
): Promise<GirviStatement> {
  const policy = await repo.findApprovedCalculationPolicy();
  const events = await repo.loadLedgerEvents(account.id);
  try {
    return computeGirviStatement({
      terms: termsFromSnapshot(account.termsSnapshot),
      policy,
      events,
      asOfBusinessDate,
    });
  } catch (error) {
    return rethrowGirviDomainError(error);
  }
}

function toStatementDto(
  account: { id: string; account_number: string; status: GirviAccount["status"] },
  statement: GirviStatement,
): GirviStatementDto {
  return {
    girvi_account_id: account.id,
    account_number: account.account_number,
    status: account.status,
    policy_version: statement.policyVersion,
    rate_percent_per_30_days: statement.ratePercentPer30Days,
    rate_period_label: RATE_PERIOD_LABEL,
    start_business_date: statement.startBusinessDate,
    maturity_business_date: statement.maturityBusinessDate,
    as_of_business_date: statement.asOfBusinessDate,
    is_overdue: girviAccountIsOverdue({
      status: account.status,
      maturityBusinessDate: statement.maturityBusinessDate,
      asOfBusinessDate: statement.asOfBusinessDate,
    }),
    principal_outstanding_inr: statement.principalOutstandingInr,
    interest_outstanding_inr: statement.interestOutstandingInr,
    payoff_inr: statement.payoffInr,
    principal_recovered_inr: statement.principalRecoveredInr,
    interest_received_inr: statement.interestReceivedInr,
    principal_waived_inr: statement.principalWaivedInr,
    interest_waived_inr: statement.interestWaivedInr,
    accrual_segments: statement.accrualSegments.map((segment) => ({
      from_business_date: segment.fromBusinessDate,
      to_business_date: segment.toBusinessDate,
      days: segment.days,
      principal_inr: segment.principalInr,
      interest_inr: segment.interestInr,
    })),
  };
}

function assertIdempotencyKey(key: string | undefined, action: string): string {
  if (!key || key.trim().length === 0) {
    throw validationError(`Idempotency-Key is required to ${action}.`, [
      { field: "Idempotency-Key", message: "Required for this operation." },
    ]);
  }
  return key;
}

function assertWaiverAuthorized(access: ResolvedStaffAccess): void {
  if (access.membership.role !== "owner" && access.membership.role !== "admin") {
    throw new ApplicationHttpError(
      "PERMISSION_DENIED",
      "Only an owner or admin can waive a Girvi balance.",
      403,
    );
  }
}

function moneyEquals(left: string, right: string): boolean {
  return toPaise(left) === toPaise(right);
}

function toPaise(amount: string): bigint {
  const negative = amount.startsWith("-");
  const raw = negative ? amount.slice(1) : amount;
  const [whole = "0", fraction = ""] = raw.split(".");
  const paise = BigInt(whole) * 100n + BigInt(`${fraction}00`.slice(0, 2));
  return negative ? -paise : paise;
}

function money(paise: bigint): string {
  const negative = paise < 0n;
  const absolute = negative ? -paise : paise;
  return `${negative ? "-" : ""}${(absolute / 100n).toString()}.${(absolute % 100n).toString().padStart(2, "0")}`;
}

export async function getGirviStatement(
  repo: GirviRepository,
  access: ResolvedStaffAccess,
  accountId: string,
  asOfBusinessDate?: string,
): Promise<GirviStatementDto> {
  assertPermission(access, "girvi.write");

  const account = await repo.getAccount(accountId);
  if (!account) {
    throw notFoundError("Girvi account not found.");
  }
  if (account.status === "draft") {
    throw validationError("Activate the Girvi account to see a statement.");
  }

  const asOf = asOfBusinessDate ?? kolkataBusinessDate();
  assertNotFutureBusinessDate(asOf, "as_of");
  const statement = await statementFor(repo, { id: account.id, termsSnapshot: account.terms_snapshot }, asOf);
  return toStatementDto(account, statement);
}

export async function quoteGirviSettlement(
  repo: GirviRepository,
  access: ResolvedStaffAccess,
  accountId: string,
  businessDate?: string,
): Promise<GirviSettlementQuote> {
  assertPermission(access, "girvi.write");

  const account = await repo.getAccount(accountId);
  if (!account) {
    throw notFoundError("Girvi account not found.");
  }
  if (account.status !== "active") {
    throw validationError(
      account.status === "draft"
        ? "Activate the Girvi account before quoting a settlement."
        : "This account is already settled.",
    );
  }

  const asOf = businessDate ?? kolkataBusinessDate();
  assertNotFutureBusinessDate(asOf, "business_date");
  const statement = await statementFor(repo, { id: account.id, termsSnapshot: account.terms_snapshot }, asOf);

  return {
    girvi_account_id: account.id,
    business_date: asOf,
    principal_outstanding_inr: statement.principalOutstandingInr,
    interest_outstanding_inr: statement.interestOutstandingInr,
    payoff_inr: statement.payoffInr,
    rate_percent_per_30_days: statement.ratePercentPer30Days,
    rate_period_label: RATE_PERIOD_LABEL,
    quoted_at: new Date().toISOString(),
  };
}

export async function recordGirviRepayment(
  repo: GirviRepository,
  access: ResolvedStaffAccess,
  accountId: string,
  body: GirviRepaymentCreate,
  idempotencyKey: string | undefined,
): Promise<GirviRepaymentResult> {
  assertPermission(access, "girvi.write");
  const key = assertIdempotencyKey(idempotencyKey, "record a Girvi repayment");
  const requestHash = hashPayload(REPAYMENT_OPERATION, accountId, body);

  const existing = await repo.findIdempotency({ operation: REPAYMENT_OPERATION, key });
  if (existing) {
    if (existing.requestHash !== requestHash) {
      throw conflictError(
        "IDEMPOTENCY_KEY_REUSE",
        "This Idempotency-Key was already used with a different repayment.",
      );
    }
    return existing.responseBody as GirviRepaymentResult;
  }

  const locked = await repo.lockAccountForPosting(accountId);
  if (!locked) {
    throw notFoundError("Girvi account not found.");
  }
  assertPostable(locked);
  if (locked.status !== "active") {
    throw validationError("This account is already settled. Repayments are only recorded on active accounts.");
  }
  assertNotFutureBusinessDate(body.business_date, "business_date");
  await assertNotBackdated(repo, accountId, body.business_date);

  const statement = await statementFor(repo, locked, body.business_date);
  let allocation;
  try {
    allocation = allocateGirviRepayment({ statement, amountInr: body.amount_inr });
  } catch (error) {
    return rethrowGirviDomainError(error);
  }

  if (
    !moneyEquals(allocation.interestPaidInr, body.confirm_interest_paid_inr) ||
    !moneyEquals(allocation.principalPaidInr, body.confirm_principal_paid_inr)
  ) {
    throw conflictError(
      "STALE_GIRVI_QUOTE",
      `The interest and principal split changed. Interest is now ₹${allocation.interestPaidInr} and principal ₹${allocation.principalPaidInr}. Review and confirm again.`,
    );
  }

  const postingSequence = await repo.nextPostingSequence(accountId, body.business_date);
  const eventKey = `girvi.repayment:${accountId}:${body.business_date}:${String(postingSequence)}`;
  const financialEventId = await repo.insertFinancialEvent({
    accountId,
    eventType: "repayment",
    effectiveBusinessDate: body.business_date,
    principalDeltaInr: money(-toPaise(allocation.principalPaidInr)),
    interestDeltaInr: money(-toPaise(allocation.interestPaidInr)),
    amountInr: allocation.amountInr,
    method: body.method,
    ...(body.notes !== undefined ? { notes: body.notes } : {}),
    postingSequence,
    actorStaffUserId: access.staff_user_id,
    eventKey,
  });

  await repo.updateBalanceProjections({
    accountId,
    principalOutstandingInr: allocation.principalRemainingInr,
    interestOutstandingInr: allocation.interestRemainingInr,
  });

  await repo.writeAudit({
    actorStaffUserId: access.staff_user_id,
    action: "girvi.repayment.record",
    entityType: "girvi_account",
    entityId: accountId,
    payload: {
      financial_event_id: financialEventId,
      business_date: body.business_date,
      method: body.method,
      amount_inr: allocation.amountInr,
      interest_paid_inr: allocation.interestPaidInr,
      principal_paid_inr: allocation.principalPaidInr,
      principal_outstanding_inr: allocation.principalRemainingInr,
      interest_outstanding_inr: allocation.interestRemainingInr,
    },
  });

  await repo.insertOutbox({
    eventKey: `girvi.repayment.recorded:${financialEventId}`,
    eventType: "girvi.repayment.recorded",
    payload: {
      girvi_account_id: accountId,
      account_number: locked.accountNumber,
      customer_id: locked.customerId,
      financial_event_id: financialEventId,
      amount_inr: allocation.amountInr,
      interest_paid_inr: allocation.interestPaidInr,
      principal_paid_inr: allocation.principalPaidInr,
    },
  });

  const account = await repo.getAccount(accountId);
  if (!account) {
    throw notFoundError("Girvi account not found after the repayment.");
  }

  const result: GirviRepaymentResult = {
    account,
    allocation: {
      financial_event_id: financialEventId,
      business_date: body.business_date,
      method: body.method,
      amount_inr: allocation.amountInr,
      interest_paid_inr: allocation.interestPaidInr,
      principal_paid_inr: allocation.principalPaidInr,
      interest_outstanding_inr: allocation.interestRemainingInr,
      principal_outstanding_inr: allocation.principalRemainingInr,
      payoff_inr: allocation.payoffAfterInr,
      clears_account: allocation.clearsAccount,
    },
  };

  await repo.insertIdempotency({
    operation: REPAYMENT_OPERATION,
    key,
    requestHash,
    responseStatus: 201,
    responseBody: result,
  });

  return result;
}

export async function settleGirviAccount(
  repo: GirviRepository,
  access: ResolvedStaffAccess,
  accountId: string,
  body: GirviSettlementCreate,
  idempotencyKey: string | undefined,
): Promise<GirviSettlementResult> {
  assertPermission(access, "girvi.write");
  const key = assertIdempotencyKey(idempotencyKey, "settle a Girvi account");
  const requestHash = hashPayload(SETTLE_OPERATION, accountId, body);

  const existing = await repo.findIdempotency({ operation: SETTLE_OPERATION, key });
  if (existing) {
    if (existing.requestHash !== requestHash) {
      throw conflictError(
        "IDEMPOTENCY_KEY_REUSE",
        "This Idempotency-Key was already used with a different settlement.",
      );
    }
    return existing.responseBody as GirviSettlementResult;
  }

  const locked = await repo.lockAccountForPosting(accountId);
  if (!locked) {
    throw notFoundError("Girvi account not found.");
  }
  assertPostable(locked);
  if (locked.status !== "active") {
    throw conflictError("GIRVI_ALREADY_SETTLED", "This account is already settled.");
  }
  assertNotFutureBusinessDate(body.business_date, "business_date");
  await assertNotBackdated(repo, accountId, body.business_date);

  const waiverPaise = toPaise(body.waiver_inr ?? "0.00");
  const collectedPaise = toPaise(body.amount_inr);
  if (waiverPaise > 0n) {
    if (!body.waiver_reason) {
      throw validationError("A waiver needs a recorded reason.", [
        { field: "waiver_reason", message: "Required when waiving a balance." },
      ]);
    }
    assertWaiverAuthorized(access);
  }

  const statement = await statementFor(repo, locked, body.business_date);
  if (!moneyEquals(statement.payoffInr, body.confirm_payoff_inr)) {
    throw conflictError(
      "STALE_GIRVI_QUOTE",
      `The settlement payable is now ₹${statement.payoffInr}. Recalculate the quote and confirm again.`,
    );
  }
  if (collectedPaise + waiverPaise !== toPaise(statement.payoffInr)) {
    throw validationError(
      `The collected amount plus any waiver must equal the settlement payable of ₹${statement.payoffInr}.`,
      [{ field: "amount_inr", message: "Collected plus waiver must equal the payable." }],
    );
  }
  if (collectedPaise > 0n && !body.method) {
    throw validationError("Choose how the settlement amount was collected.", [
      { field: "method", message: "Required when collecting money." },
    ]);
  }

  let collected;
  try {
    collected =
      collectedPaise > 0n
        ? allocateGirviRepayment({ statement, amountInr: body.amount_inr })
        : {
            amountInr: "0.00",
            interestPaidInr: "0.00",
            principalPaidInr: "0.00",
            interestRemainingInr: statement.interestOutstandingInr,
            principalRemainingInr: statement.principalOutstandingInr,
            payoffBeforeInr: statement.payoffInr,
            payoffAfterInr: statement.payoffInr,
            clearsAccount: toPaise(statement.payoffInr) === 0n,
          };
  } catch (error) {
    return rethrowGirviDomainError(error);
  }

  let postingSequence = await repo.nextPostingSequence(accountId, body.business_date);
  const settlementEventId = await repo.insertFinancialEvent({
    accountId,
    eventType: "settlement",
    effectiveBusinessDate: body.business_date,
    principalDeltaInr: money(-toPaise(collected.principalPaidInr)),
    interestDeltaInr: money(-toPaise(collected.interestPaidInr)),
    amountInr: collected.amountInr,
    ...(body.method !== undefined ? { method: body.method } : {}),
    ...(body.notes !== undefined ? { notes: body.notes } : {}),
    postingSequence,
    actorStaffUserId: access.staff_user_id,
    eventKey: `girvi.settlement:${accountId}`,
  });

  let waiverEventId: string | null = null;
  if (waiverPaise > 0n) {
    postingSequence += 1;
    waiverEventId = await repo.insertFinancialEvent({
      accountId,
      eventType: "waiver",
      effectiveBusinessDate: body.business_date,
      principalDeltaInr: money(-toPaise(collected.principalRemainingInr)),
      interestDeltaInr: money(-toPaise(collected.interestRemainingInr)),
      amountInr: money(waiverPaise),
      ...(body.waiver_reason !== undefined ? { notes: body.waiver_reason } : {}),
      postingSequence,
      actorStaffUserId: access.staff_user_id,
      eventKey: `girvi.waiver:${accountId}`,
    });
  }

  await repo.updateBalanceProjections({
    accountId,
    principalOutstandingInr: "0.00",
    interestOutstandingInr: "0.00",
  });
  await repo.markAccountSettled({ accountId, actorStaffUserId: access.staff_user_id });

  await repo.writeAudit({
    actorStaffUserId: access.staff_user_id,
    action: "girvi.settle",
    entityType: "girvi_account",
    entityId: accountId,
    payload: {
      settlement_event_id: settlementEventId,
      waiver_event_id: waiverEventId,
      business_date: body.business_date,
      payoff_inr: statement.payoffInr,
      amount_inr: collected.amountInr,
      waiver_inr: money(waiverPaise),
      waiver_reason: body.waiver_reason ?? null,
    },
  });

  await repo.insertOutbox({
    eventKey: `girvi.settled:${accountId}`,
    eventType: "girvi.settled",
    payload: {
      girvi_account_id: accountId,
      account_number: locked.accountNumber,
      customer_id: locked.customerId,
      settlement_event_id: settlementEventId,
      payoff_inr: statement.payoffInr,
    },
  });

  const account = await repo.getAccount(accountId);
  if (!account) {
    throw notFoundError("Girvi account not found after settlement.");
  }

  const result: GirviSettlementResult = {
    account,
    settlement: {
      financial_event_id: settlementEventId,
      waiver_event_id: waiverEventId,
      business_date: body.business_date,
      amount_inr: collected.amountInr,
      interest_paid_inr: collected.interestPaidInr,
      principal_paid_inr: collected.principalPaidInr,
      waiver_inr: money(waiverPaise),
      collateral_still_in_custody: true,
    },
  };

  await repo.insertIdempotency({
    operation: SETTLE_OPERATION,
    key,
    requestHash,
    responseStatus: 201,
    responseBody: result,
  });

  return result;
}

export async function releaseGirviCollateral(
  repo: GirviRepository,
  access: ResolvedStaffAccess,
  accountId: string,
  body: GirviReleaseCreate,
  idempotencyKey: string | undefined,
): Promise<GirviReleaseResult> {
  assertPermission(access, "girvi.release");
  const key = assertIdempotencyKey(idempotencyKey, "release Girvi collateral");
  const requestHash = hashPayload(RELEASE_OPERATION, accountId, body);

  const existing = await repo.findIdempotency({ operation: RELEASE_OPERATION, key });
  if (existing) {
    if (existing.requestHash !== requestHash) {
      throw conflictError(
        "IDEMPOTENCY_KEY_REUSE",
        "This Idempotency-Key was already used with a different release.",
      );
    }
    return existing.responseBody as GirviReleaseResult;
  }

  const locked = await repo.lockAccountForPosting(accountId);
  if (!locked) {
    throw notFoundError("Girvi account not found.");
  }
  if (locked.status === "draft") {
    throw validationError("A draft Girvi account has no collateral in custody to release.");
  }
  if (locked.status === "released" || (await repo.findReleaseEvent(accountId))) {
    throw conflictError("GIRVI_ALREADY_RELEASED", "This collateral was already released.");
  }

  const statement = await statementFor(repo, locked, kolkataBusinessDate());
  const outstanding = toPaise(statement.payoffInr);
  if (outstanding > 0n) {
    throw validationError(
      `₹${statement.payoffInr} is still due. Settle the balance, or settle with an authorized waiver, before releasing collateral.`,
      [{ field: "settlement", message: "Clear or waive the balance first." }],
    );
  }
  if (locked.status !== "settled") {
    throw validationError(
      "Record the settlement before releasing collateral. Settlement and handover are separate steps.",
    );
  }

  const settlementEventId = await repo.findLatestSettlementEventId(accountId);
  if (settlementEventId === null && !body.waiver_reason) {
    throw validationError(
      "This account has no settlement event, so a recorded waiver reason is required to release.",
      [{ field: "waiver_reason", message: "Required without a settlement event." }],
    );
  }
  if (body.waiver_reason) {
    assertWaiverAuthorized(access);
  }

  const expected = (await repo.listInCustodyPacketNumbers(accountId)).map((packet) => packet.trim()).sort();
  const verified = body.verify_packet_numbers.map((packet) => packet.trim()).sort();
  if (
    expected.length !== verified.length ||
    expected.some((packet, index) => packet !== verified[index])
  ) {
    throw conflictError(
      "PACKET_MISMATCH",
      `The verified packets do not match custody. Expected: ${expected.join(", ") || "none"}.`,
    );
  }

  const release = await repo.insertReleaseEvent({
    accountId,
    settlementEventId,
    packetNumbersVerified: expected,
    staffAcknowledgedBy: access.staff_user_id,
    customerAcknowledged: body.customer_acknowledged,
    recipientName: body.recipient_name,
    ...(body.waiver_reason !== undefined ? { waiverReason: body.waiver_reason } : {}),
    ...(body.notes !== undefined ? { notes: body.notes } : {}),
  });

  await repo.releaseCollateral({
    accountId,
    actorStaffUserId: access.staff_user_id,
    recipientName: body.recipient_name,
    ...(body.notes !== undefined ? { notes: body.notes } : {}),
  });

  await repo.writeAudit({
    actorStaffUserId: access.staff_user_id,
    action: "girvi.release",
    entityType: "girvi_account",
    entityId: accountId,
    payload: {
      release_event_id: release.id,
      settlement_event_id: settlementEventId,
      packet_numbers: expected,
      recipient_name: body.recipient_name,
      waiver_reason: body.waiver_reason ?? null,
    },
  });

  await repo.insertOutbox({
    eventKey: `girvi.released:${accountId}`,
    eventType: "girvi.released",
    payload: {
      girvi_account_id: accountId,
      account_number: locked.accountNumber,
      customer_id: locked.customerId,
      release_event_id: release.id,
      packet_numbers: expected,
    },
  });

  const account = await repo.getAccount(accountId);
  if (!account) {
    throw notFoundError("Girvi account not found after release.");
  }

  const result: GirviReleaseResult = { account, release };

  await repo.insertIdempotency({
    operation: RELEASE_OPERATION,
    key,
    requestHash,
    responseStatus: 201,
    responseBody: result,
  });

  return result;
}
