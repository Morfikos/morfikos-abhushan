import { createHash } from "node:crypto";

import type {
  InvoiceCorrections,
  InvoiceReturnAcceptResult,
  InvoiceReturnCreate,
  Payment,
  PaymentKind,
  PaymentMethod,
  PaymentRefundCreate,
  PaymentReversalCreate,
} from "@aabhushan/contracts";
import { decimalFromString, kolkataBusinessDate } from "@aabhushan/domain";

import { assertAnyPermission, assertPermission } from "./authorize";
import { conflictError, notFoundError, validationError } from "./http-error";
import type { PaymentRepository } from "./payments";
import type { ResolvedStaffAccess } from "./staff-access";

const ACCEPT_RETURN_OPERATION = "invoice.return.accept";
const REFUND_OPERATION = "payment.refund";
const REVERSAL_OPERATION = "payment.reverse";

export type LockedArticleForReturn = {
  id: string;
  articleNumber: string;
  description: string;
  status: string;
  rowVersion: number;
};

export type LockedInvoiceLineForReturn = {
  id: string;
  articleId: string;
  articleNumber: string;
  description: string;
  lineTotalInr: string;
};

export type LockedFinalizedInvoice = {
  id: string;
  invoiceNumber: string | null;
  customerId: string;
  status: string;
  grandTotalInr: string;
  lines: LockedInvoiceLineForReturn[];
};

export type LockedPaymentForCorrection = {
  id: string;
  customerId: string;
  method: PaymentMethod;
  amountInr: string;
  status: "posted" | "reversed";
  kind: PaymentKind;
  reversesPaymentId: string | null;
  reversedByPaymentId: string | null;
  allocations: Array<{ invoiceId: string; amountInr: string }>;
};

export type ReturnsRepository = {
  lockFinalizedInvoice(invoiceId: string): Promise<LockedFinalizedInvoice | null>;
  lockArticle(articleId: string): Promise<LockedArticleForReturn | null>;
  findAcceptedReturnForLine(invoiceLineId: string): Promise<{ id: string } | null>;
  creditedTotal(invoiceId: string): Promise<string>;
  remainingUnreturnedLineCount(invoiceId: string): Promise<number>;
  insertReturn(input: {
    invoiceId: string;
    articleId: string;
    invoiceLineId: string;
    reason: string;
    acceptedByStaffUserId: string;
  }): Promise<string>;
  allocateCreditNoteNumber(): Promise<string>;
  insertCreditNote(input: {
    invoiceId: string;
    returnId: string;
    creditNoteNumber: string;
    amountInr: string;
  }): Promise<string>;
  markArticleReturnInspection(input: {
    articleId: string;
    expectedVersion: number;
    actorStaffUserId: string;
    invoiceId: string;
    returnId: string;
    reason: string;
  }): Promise<boolean>;
  getAcceptResult(returnId: string): Promise<InvoiceReturnAcceptResult | null>;
  getInvoiceCorrections(invoiceId: string): Promise<InvoiceCorrections | null>;
  writeAudit(event: {
    actorStaffUserId: string;
    action: string;
    entityType: string;
    entityId: string;
    payload: Record<string, unknown>;
  }): Promise<void>;
  findIdempotency(input: {
    operation: string;
    key: string;
  }): Promise<{ requestHash: string; responseStatus: number; responseBody: unknown } | null>;
  insertIdempotency(input: {
    operation: string;
    key: string;
    requestHash: string;
    responseStatus: number;
    responseBody: unknown;
  }): Promise<void>;
  insertOutbox(input: {
    eventKey: string;
    eventType: string;
    payload: Record<string, unknown>;
  }): Promise<void>;
};

export type PaymentCorrectionRepository = PaymentRepository & {
  lockPaymentForUpdate(paymentId: string): Promise<LockedPaymentForCorrection | null>;
  refundedAmountForPayment(paymentId: string): Promise<string>;
  refundedAllocationsForPayment(paymentId: string): Promise<Array<{ invoiceId: string; amountInr: string }>>;
  insertCompensatingPayment(input: {
    customerId: string;
    method: PaymentMethod;
    amountInr: string;
    reference: string | null;
    kind: "refund" | "reversal";
    reversesPaymentId: string;
    receivedBusinessDate: string;
    receivedByStaffUserId: string;
  }): Promise<string>;
  markPaymentReversed(input: { paymentId: string; reversedByPaymentId: string }): Promise<boolean>;
  allocateRefundNumber(): Promise<string>;
};

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

function hashBody(body: unknown): string {
  return createHash("sha256").update(canonicalJson(body)).digest("hex");
}

function requireIdempotencyKey(idempotencyKey: string | undefined, action: string): string {
  if (!idempotencyKey || !idempotencyKey.trim()) {
    throw validationError(`Idempotency-Key header is required to ${action}.`, [
      { field: "Idempotency-Key", message: "Provide a non-empty Idempotency-Key header." },
    ]);
  }
  return idempotencyKey.trim();
}

function moneySum(amounts: string[]): string {
  let total = decimalFromString("0");
  for (const amount of amounts) {
    total = total.plus(decimalFromString(amount));
  }
  return total.toFixed(2);
}

function moneyMinus(left: string, right: string): string {
  return decimalFromString(left).minus(decimalFromString(right)).toFixed(2);
}

function moneyGt(left: string, right: string): boolean {
  return decimalFromString(left).gt(decimalFromString(right));
}

function moneyLt(left: string, right: string): boolean {
  return decimalFromString(left).lt(decimalFromString(right));
}

function moneyLte(left: string, right: string): boolean {
  return decimalFromString(left).lte(decimalFromString(right));
}

function moneyMin(left: string, right: string): string {
  return moneyGt(left, right) ? decimalFromString(right).toFixed(2) : decimalFromString(left).toFixed(2);
}

function isZeroMoney(amount: string): boolean {
  return decimalFromString(amount).isZero();
}

async function replayOrReject(
  repo: { findIdempotency: ReturnsRepository["findIdempotency"] },
  operation: string,
  key: string,
  requestHash: string,
): Promise<unknown | null> {
  const existing = await repo.findIdempotency({ operation, key });
  if (!existing) {
    return null;
  }
  if (existing.requestHash !== requestHash) {
    throw conflictError(
      "IDEMPOTENCY_KEY_REUSED",
      "This Idempotency-Key was already used with a different payload.",
    );
  }
  return existing.responseBody;
}

export function creditAmountForReturnedLine(input: {
  lineTotalInr: string;
  grandTotalInr: string;
  alreadyCreditedInr: string;
  remainingUnreturnedCount: number;
}): string {
  const remainingCreditable = moneyMinus(input.grandTotalInr, input.alreadyCreditedInr);
  if (moneyLte(remainingCreditable, "0.00")) {
    throw validationError("This invoice has already been fully credited.", [
      { field: "invoice_line_id", message: "No remaining sale amount can be credited." },
    ]);
  }
  if (input.remainingUnreturnedCount <= 1) {
    return remainingCreditable;
  }
  const credit = moneyMin(input.lineTotalInr, remainingCreditable);
  if (isZeroMoney(credit) || moneyLt(credit, "0.00")) {
    throw validationError("This line has no sale amount left to credit.", [
      { field: "invoice_line_id", message: "Credit amount must be greater than zero." },
    ]);
  }
  return credit;
}

/**
 * Accepts a return against a finalized invoice line. Writes a new return and
 * credit note, moves the article to return_inspection, and never edits issued
 * invoice amounts or line snapshots.
 */
export async function acceptInvoiceReturn(
  repo: ReturnsRepository,
  paymentRepo: PaymentRepository,
  access: ResolvedStaffAccess,
  invoiceId: string,
  body: InvoiceReturnCreate,
  idempotencyKey: string | undefined,
): Promise<InvoiceReturnAcceptResult> {
  assertPermission(access, "billing.write");
  const key = requireIdempotencyKey(idempotencyKey, "accept a return");
  const requestHash = hashBody({ invoice_id: invoiceId, ...body });
  const replay = await replayOrReject(repo, ACCEPT_RETURN_OPERATION, key, requestHash);
  if (replay) {
    return replay as InvoiceReturnAcceptResult;
  }

  const invoice = await repo.lockFinalizedInvoice(invoiceId);
  if (!invoice) {
    throw notFoundError("Invoice was not found.");
  }
  if (invoice.status !== "finalized") {
    throw validationError("Only finalized invoices can receive a return.", [
      { field: "invoice_id", message: "This invoice is still a draft." },
    ]);
  }

  const line = invoice.lines.find((item) => item.id === body.invoice_line_id);
  if (!line) {
    throw validationError("The invoice line was not found on this invoice.", [
      { field: "invoice_line_id", message: "Choose a line from this invoice." },
    ]);
  }
  if (line.articleId !== body.article_id) {
    throw validationError("The article does not match this invoice line.", [
      { field: "article_id", message: "Article and invoice line must refer to the same piece." },
    ]);
  }

  const existingReturn = await repo.findAcceptedReturnForLine(line.id);
  if (existingReturn) {
    throw conflictError("RETURN_ALREADY_ACCEPTED", "This invoice line has already been returned.");
  }

  const article = await repo.lockArticle(line.articleId);
  if (!article) {
    throw notFoundError("Article was not found.");
  }
  if (article.status === "return_inspection") {
    throw conflictError("RETURN_ALREADY_ACCEPTED", "This article is already under return inspection.");
  }
  if (article.status !== "sold") {
    throw validationError("Only a sold article on this invoice can be returned.", [
      { field: "article_id", message: "This article was already adjusted out of sold stock." },
    ]);
  }

  const alreadyCredited = await repo.creditedTotal(invoice.id);
  const remainingUnreturned = await repo.remainingUnreturnedLineCount(invoice.id);
  const creditAmount = creditAmountForReturnedLine({
    lineTotalInr: line.lineTotalInr,
    grandTotalInr: invoice.grandTotalInr,
    alreadyCreditedInr: alreadyCredited,
    remainingUnreturnedCount: remainingUnreturned,
  });

  const returnId = await repo.insertReturn({
    invoiceId: invoice.id,
    articleId: article.id,
    invoiceLineId: line.id,
    reason: body.reason,
    acceptedByStaffUserId: access.staff_user_id,
  });
  const creditNoteNumber = await repo.allocateCreditNoteNumber();
  await repo.insertCreditNote({
    invoiceId: invoice.id,
    returnId,
    creditNoteNumber,
    amountInr: creditAmount,
  });

  const moved = await repo.markArticleReturnInspection({
    articleId: article.id,
    expectedVersion: article.rowVersion,
    actorStaffUserId: access.staff_user_id,
    invoiceId: invoice.id,
    returnId,
    reason: body.reason,
  });
  if (!moved) {
    throw conflictError("STALE_VERSION", "This article was changed by another request. Retry the same key.");
  }

  await paymentRepo.syncInvoicePaidFromAllocations(invoice.id);
  await repo.writeAudit({
    actorStaffUserId: access.staff_user_id,
    action: "invoice.return.accept",
    entityType: "invoice_return",
    entityId: returnId,
    payload: {
      invoice_id: invoice.id,
      invoice_line_id: line.id,
      article_id: article.id,
      credit_note_number: creditNoteNumber,
      amount_inr: creditAmount,
      customer_acknowledged: true,
      reason: body.reason,
    },
  });
  await repo.insertOutbox({
    eventKey: `credit_note.requested:${returnId}`,
    eventType: "credit_note.requested",
    payload: { return_id: returnId, credit_note_number: creditNoteNumber, invoice_id: invoice.id },
  });

  const result = await repo.getAcceptResult(returnId);
  if (!result) {
    throw new Error("Accepted return could not be reloaded.");
  }
  await repo.insertIdempotency({
    operation: ACCEPT_RETURN_OPERATION,
    key,
    requestHash,
    responseStatus: 201,
    responseBody: result,
  });
  return result;
}

export async function getInvoiceCorrections(
  repo: ReturnsRepository,
  access: ResolvedStaffAccess,
  invoiceId: string,
): Promise<InvoiceCorrections> {
  assertAnyPermission(access, ["billing.write", "payments.write", "reports.read"]);
  const corrections = await repo.getInvoiceCorrections(invoiceId);
  if (!corrections) {
    throw notFoundError("Invoice was not found.");
  }
  return corrections;
}

function refundSlicesForAmount(
  allocations: Array<{ invoiceId: string; amountInr: string }>,
  alreadyRefundedByInvoice: Map<string, string>,
  refundAmount: string,
): Array<{ invoiceId: string; amountInr: string }> {
  let remaining = decimalFromString(refundAmount);
  const slices: Array<{ invoiceId: string; amountInr: string }> = [];
  const ordered = [...allocations].sort((left, right) => left.invoiceId.localeCompare(right.invoiceId));
  for (const allocation of ordered) {
    if (remaining.lte(0)) {
      break;
    }
    const already = alreadyRefundedByInvoice.get(allocation.invoiceId) ?? "0.00";
    const available = moneyMinus(allocation.amountInr, already);
    if (isZeroMoney(available) || moneyLt(available, "0.00")) {
      continue;
    }
    const slice = moneyMin(available, remaining.toFixed(2));
    slices.push({ invoiceId: allocation.invoiceId, amountInr: slice });
    remaining = remaining.minus(decimalFromString(slice));
  }
  if (!remaining.isZero()) {
    throw validationError("Refund amount cannot exceed net collected on the related invoice after prior refunds.", [
      { field: "amount_inr", message: "Reduce the refund to the remaining collected amount." },
    ]);
  }
  return slices;
}

/**
 * Posts a linked refund against a posted collection. The original payment is
 * kept. Refund and reversal cannot both subtract the same payment.
 */
export async function refundPayment(
  repo: PaymentCorrectionRepository,
  access: ResolvedStaffAccess,
  paymentId: string,
  body: PaymentRefundCreate,
  idempotencyKey: string | undefined,
  now: Date = new Date(),
): Promise<Payment> {
  assertPermission(access, "refunds.approve");
  const key = requireIdempotencyKey(idempotencyKey, "record a refund");
  const requestHash = hashBody({ payment_id: paymentId, ...body });
  const replay = await replayOrReject(repo, REFUND_OPERATION, key, requestHash);
  if (replay) {
    return replay as Payment;
  }

  const original = await repo.lockPaymentForUpdate(paymentId);
  if (!original) {
    throw notFoundError("Payment was not found.");
  }
  if (original.kind !== "collection") {
    throw validationError("Only a posted collection can be refunded.", [
      { field: "payment_id", message: "Refunds apply to collections, not to refunds or reversals." },
    ]);
  }
  if (original.status !== "posted" || original.reversedByPaymentId) {
    throw conflictError("PAYMENT_ALREADY_REVERSED", "This payment was reversed and cannot also be refunded.");
  }

  const alreadyRefunded = await repo.refundedAmountForPayment(original.id);
  const remainingOnPayment = moneyMinus(original.amountInr, alreadyRefunded);
  if (isZeroMoney(remainingOnPayment) || moneyLt(remainingOnPayment, "0.00")) {
    throw validationError("This collection has already been fully refunded.", [
      { field: "amount_inr", message: "No remaining collected amount can be refunded." },
    ]);
  }

  const refundAmount = body.amount_inr
    ? decimalFromString(body.amount_inr).toFixed(2)
    : remainingOnPayment;
  if (moneyGt(refundAmount, remainingOnPayment)) {
    throw validationError("Refund amount cannot exceed net collected on the related invoice after prior refunds.", [
      { field: "amount_inr", message: `At most ${remainingOnPayment} remains refundable on this payment.` },
    ]);
  }

  const invoiceIds = original.allocations.map((item) => item.invoiceId);
  const locked = await repo.lockInvoicesAscending(invoiceIds);
  if (locked.length !== invoiceIds.length) {
    throw notFoundError("One or more invoices were not found.");
  }

  const alreadyByInvoice = new Map<string, string>();
  for (const allocation of await repo.refundedAllocationsForPayment(original.id)) {
    const current = alreadyByInvoice.get(allocation.invoiceId) ?? "0.00";
    alreadyByInvoice.set(allocation.invoiceId, moneySum([current, allocation.amountInr]));
  }

  const slices = refundSlicesForAmount(original.allocations, alreadyByInvoice, refundAmount);
  for (const slice of slices) {
    const invoice = locked.find((item) => item.id === slice.invoiceId);
    if (!invoice) {
      throw notFoundError("One or more invoices were not found.");
    }
    if (moneyGt(slice.amountInr, invoice.allocatedInr)) {
      throw validationError("Refund amount cannot exceed net collected on the related invoice after prior refunds.", [
        { field: "amount_inr", message: `Invoice ${invoice.invoiceNumber ?? invoice.id} has ${invoice.allocatedInr} collected.` },
      ]);
    }
  }

  const receivedBusinessDate = kolkataBusinessDate(now);
  const compensatingId = await repo.insertCompensatingPayment({
    customerId: original.customerId,
    method: body.method ?? original.method,
    amountInr: refundAmount,
    reference: body.reason,
    kind: "refund",
    reversesPaymentId: original.id,
    receivedBusinessDate,
    receivedByStaffUserId: access.staff_user_id,
  });
  for (const slice of slices) {
    await repo.insertAllocation({
      paymentId: compensatingId,
      invoiceId: slice.invoiceId,
      amountInr: slice.amountInr,
    });
  }
  const refundNumber = await repo.allocateRefundNumber();
  await repo.insertReceipt({ paymentId: compensatingId, receiptNumber: refundNumber });

  for (const invoiceId of [...new Set(invoiceIds)].sort()) {
    await repo.syncInvoicePaidFromAllocations(invoiceId);
  }

  await repo.writeAudit({
    actorStaffUserId: access.staff_user_id,
    action: "payment.refund",
    entityType: "payment",
    entityId: compensatingId,
    payload: {
      reverses_payment_id: original.id,
      amount_inr: refundAmount,
      refund_number: refundNumber,
      reason: body.reason,
    },
  });
  await repo.insertOutbox({
    eventKey: `refund.requested:${compensatingId}`,
    eventType: "refund.requested",
    payload: { payment_id: compensatingId, refund_number: refundNumber, reverses_payment_id: original.id },
  });

  const result = await repo.getPayment(compensatingId);
  if (!result) {
    throw new Error("Refund payment could not be reloaded.");
  }
  await repo.insertIdempotency({
    operation: REFUND_OPERATION,
    key,
    requestHash,
    responseStatus: 201,
    responseBody: result,
  });
  return result;
}

/**
 * Posts a linked reversal of a mistaken collection. Original row is marked
 * reversed and kept. A payment that was refunded cannot also be reversed.
 */
export async function reversePayment(
  repo: PaymentCorrectionRepository,
  access: ResolvedStaffAccess,
  paymentId: string,
  body: PaymentReversalCreate,
  idempotencyKey: string | undefined,
  now: Date = new Date(),
): Promise<Payment> {
  assertPermission(access, "refunds.approve");
  const key = requireIdempotencyKey(idempotencyKey, "reverse a payment");
  const requestHash = hashBody({ payment_id: paymentId, ...body });
  const replay = await replayOrReject(repo, REVERSAL_OPERATION, key, requestHash);
  if (replay) {
    return replay as Payment;
  }

  const original = await repo.lockPaymentForUpdate(paymentId);
  if (!original) {
    throw notFoundError("Payment was not found.");
  }
  if (original.kind !== "collection") {
    throw validationError("Only a posted collection can be reversed.", [
      { field: "payment_id", message: "Reversals apply to collections, not to refunds or reversals." },
    ]);
  }
  if (original.status !== "posted" || original.reversedByPaymentId) {
    throw conflictError("PAYMENT_ALREADY_REVERSED", "This payment has already been reversed.");
  }

  const alreadyRefunded = await repo.refundedAmountForPayment(original.id);
  if (!isZeroMoney(alreadyRefunded)) {
    throw conflictError(
      "PAYMENT_ALREADY_REFUNDED",
      "This payment was refunded and cannot also be reversed.",
    );
  }

  const invoiceIds = original.allocations.map((item) => item.invoiceId);
  const locked = await repo.lockInvoicesAscending(invoiceIds);
  if (locked.length !== invoiceIds.length) {
    throw notFoundError("One or more invoices were not found.");
  }

  const receivedBusinessDate = kolkataBusinessDate(now);
  const compensatingId = await repo.insertCompensatingPayment({
    customerId: original.customerId,
    method: original.method,
    amountInr: original.amountInr,
    reference: body.reason,
    kind: "reversal",
    reversesPaymentId: original.id,
    receivedBusinessDate,
    receivedByStaffUserId: access.staff_user_id,
  });
  for (const allocation of original.allocations) {
    await repo.insertAllocation({
      paymentId: compensatingId,
      invoiceId: allocation.invoiceId,
      amountInr: allocation.amountInr,
    });
  }
  const marked = await repo.markPaymentReversed({
    paymentId: original.id,
    reversedByPaymentId: compensatingId,
  });
  if (!marked) {
    throw conflictError("PAYMENT_ALREADY_REVERSED", "This payment has already been reversed.");
  }

  for (const invoiceId of [...new Set(invoiceIds)].sort()) {
    await repo.syncInvoicePaidFromAllocations(invoiceId);
  }

  await repo.writeAudit({
    actorStaffUserId: access.staff_user_id,
    action: "payment.reverse",
    entityType: "payment",
    entityId: compensatingId,
    payload: {
      reverses_payment_id: original.id,
      amount_inr: original.amountInr,
      reason: body.reason,
    },
  });
  await repo.insertOutbox({
    eventKey: `payment.reversed:${original.id}`,
    eventType: "payment.reversed",
    payload: { payment_id: original.id, reversal_payment_id: compensatingId },
  });

  const result = await repo.getPayment(compensatingId);
  if (!result) {
    throw new Error("Reversal payment could not be reloaded.");
  }
  await repo.insertIdempotency({
    operation: REVERSAL_OPERATION,
    key,
    requestHash,
    responseStatus: 201,
    responseBody: result,
  });
  return result;
}
