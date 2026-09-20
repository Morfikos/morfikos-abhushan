import { createHash } from "node:crypto";

import type {
  CustomerSalesStatement,
  DailyCollections,
  InvoicePayments,
  Payment,
  PaymentCreate,
  PaymentCreateResult,
  PaymentMethod,
} from "@aabhushan/contracts";
import { decimalFromString, kolkataBusinessDate } from "@aabhushan/domain";

import { assertAnyPermission, assertPermission } from "./authorize";
import { conflictError, notFoundError, validationError } from "./http-error";
import type { ResolvedStaffAccess } from "./staff-access";

const RECORD_PAYMENT_OPERATION = "payment.record";

/** Sales collections only. Girvi principal and interest are settled in spec 12. */
export type LockedInvoiceForAllocation = {
  id: string;
  invoiceNumber: string | null;
  customerId: string;
  status: string;
  grandTotalInr: string;
  allocatedInr: string;
  creditedInr: string;
};

export type PaymentListFilters = {
  page: number;
  pageSize: number;
  sort: "received_at" | "received_business_date" | "amount_inr";
  direction: "asc" | "desc";
  customerId?: string;
  invoiceId?: string;
  method?: PaymentMethod;
  /** Exact day; treated as from=to when range bounds are omitted. */
  receivedBusinessDate?: string;
  receivedBusinessDateFrom?: string;
  receivedBusinessDateTo?: string;
  q?: string;
};

/** Inclusive business-date bounds for collections aggregates. Omit both for all-time. */
export type CollectionsPeriodFilter = {
  from?: string;
  to?: string;
};

export type PaymentRepository = {
  customerExists(customerId: string): Promise<boolean>;
  /** Locks the named invoices in id order and reports allocations already posted. */
  lockInvoicesAscending(invoiceIds: string[]): Promise<LockedInvoiceForAllocation[]>;
  insertPayment(input: {
    customerId: string;
    method: PaymentMethod;
    amountInr: string;
    reference: string | null;
    receivedBusinessDate: string;
    receivedByStaffUserId: string;
  }): Promise<string>;
  insertAllocation(input: { paymentId: string; invoiceId: string; amountInr: string }): Promise<void>;
  allocateReceiptNumber(): Promise<string>;
  insertReceipt(input: { paymentId: string; receiptNumber: string }): Promise<void>;
  /** Recomputes the invoice paid/due projection from posted allocations under the same lock. */
  syncInvoicePaidFromAllocations(invoiceId: string): Promise<void>;
  getPayment(paymentId: string): Promise<Payment | null>;
  listPayments(filters: PaymentListFilters): Promise<{ items: Payment[]; total: number }>;
  getInvoicePayments(invoiceId: string): Promise<InvoicePayments | null>;
  getCustomerSalesStatement(customerId: string): Promise<CustomerSalesStatement | null>;
  getDailyCollections(period: CollectionsPeriodFilter): Promise<DailyCollections>;
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

export function hashPaymentPayload(body: PaymentCreate): string {
  return createHash("sha256").update(canonicalJson(body)).digest("hex");
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

function moneyEquals(left: string, right: string): boolean {
  return decimalFromString(left).eq(decimalFromString(right));
}

function moneyMin(left: string, right: string): string {
  return moneyGt(left, right) ? decimalFromString(right).toFixed(2) : decimalFromString(left).toFixed(2);
}

function isZeroMoney(amount: string): boolean {
  return decimalFromString(amount).isZero();
}

type TenderSlice = {
  tenderIndex: number;
  invoiceId: string;
  amountInr: string;
};

/**
 * Splits tenders across invoice allocations in request order so every payment's
 * allocations sum to that payment's amount and every allocation is fully funded.
 */
export function splitTendersAcrossAllocations(
  tenders: Array<{ amount_inr: string }>,
  allocations: Array<{ invoice_id: string; amount_inr: string }>,
): TenderSlice[] {
  const slices: TenderSlice[] = [];
  let tenderIndex = 0;
  let tenderRemaining = tenders[0] ? decimalFromString(tenders[0].amount_inr).toFixed(2) : "0.00";

  for (const allocation of allocations) {
    let allocationRemaining = decimalFromString(allocation.amount_inr).toFixed(2);
    while (!isZeroMoney(allocationRemaining)) {
      while (isZeroMoney(tenderRemaining)) {
        tenderIndex += 1;
        const nextTender = tenders[tenderIndex];
        if (!nextTender) {
          throw validationError("Tender amounts do not cover the requested allocations.", [
            { field: "tenders", message: "Tender total must equal the allocation total." },
          ]);
        }
        tenderRemaining = decimalFromString(nextTender.amount_inr).toFixed(2);
      }
      const slice = moneyMin(tenderRemaining, allocationRemaining);
      slices.push({ tenderIndex, invoiceId: allocation.invoice_id, amountInr: slice });
      tenderRemaining = moneyMinus(tenderRemaining, slice);
      allocationRemaining = moneyMinus(allocationRemaining, slice);
    }
  }

  return slices;
}

/**
 * Posts manually verified collections against finalized invoices.
 *
 * Invoices are locked in id order before any insert, allocations may not exceed
 * the remaining due under that lock, and overpayment is rejected because no
 * customer-advance policy is approved. Receipt documents are queued through the
 * outbox; nothing is sent from this transaction.
 */
export async function recordPayment(
  repo: PaymentRepository,
  access: ResolvedStaffAccess,
  body: PaymentCreate,
  idempotencyKey: string | undefined,
  now: Date = new Date(),
): Promise<PaymentCreateResult> {
  assertPermission(access, "payments.write");

  if (!idempotencyKey || !idempotencyKey.trim()) {
    throw validationError("Idempotency-Key header is required to record a payment.", [
      { field: "Idempotency-Key", message: "Provide a non-empty Idempotency-Key header." },
    ]);
  }
  const key = idempotencyKey.trim();
  const requestHash = hashPaymentPayload(body);

  const existingKey = await repo.findIdempotency({ operation: RECORD_PAYMENT_OPERATION, key });
  if (existingKey) {
    if (existingKey.requestHash !== requestHash) {
      throw conflictError(
        "IDEMPOTENCY_KEY_REUSED",
        "This Idempotency-Key was already used with a different payment payload.",
      );
    }
    return existingKey.responseBody as PaymentCreateResult;
  }

  const tenderTotal = moneySum(body.tenders.map((tender) => tender.amount_inr));
  const allocationTotal = moneySum(body.allocations.map((allocation) => allocation.amount_inr));
  if (!moneyEquals(tenderTotal, allocationTotal)) {
    throw validationError("Tender total must equal the allocation total.", [
      {
        field: "allocations",
        message: `Tenders total ${tenderTotal} but allocations total ${allocationTotal}.`,
      },
    ]);
  }

  if (!(await repo.customerExists(body.customer_id))) {
    throw notFoundError("Customer was not found.");
  }

  const invoiceIds = body.allocations.map((allocation) => allocation.invoice_id);
  const locked = await repo.lockInvoicesAscending(invoiceIds);
  if (locked.length !== invoiceIds.length) {
    throw notFoundError("One or more invoices were not found.");
  }

  const lockedById = new Map(locked.map((invoice) => [invoice.id, invoice]));
  for (const allocation of body.allocations) {
    const invoice = lockedById.get(allocation.invoice_id);
    if (!invoice) {
      throw notFoundError("One or more invoices were not found.");
    }
    if (invoice.status !== "finalized") {
      throw validationError("Only finalized invoices can receive a collection.", [
        { field: "allocations", message: "This invoice is still a draft." },
      ]);
    }
    if (invoice.customerId !== body.customer_id) {
      throw validationError("Each allocated invoice must belong to the paying customer.", [
        { field: "allocations", message: "This invoice belongs to another customer." },
      ]);
    }
    const remainingDue = moneyMinus(moneyMinus(invoice.grandTotalInr, invoice.creditedInr), invoice.allocatedInr);
    if (moneyLte(remainingDue, "0.00") || moneyGt(allocation.amount_inr, remainingDue)) {
      throw validationError("Allocation cannot exceed the remaining invoice due.", [
        {
          field: "allocations",
          message: `Invoice ${invoice.invoiceNumber ?? invoice.id} has ${moneyLt(remainingDue, "0.00") ? "0.00" : remainingDue} due. Overpayment is not permitted.`,
        },
      ]);
    }
  }

  const receivedBusinessDate = body.received_business_date ?? kolkataBusinessDate(now);
  const slices = splitTendersAcrossAllocations(body.tenders, body.allocations);

  const paymentIds: string[] = [];
  for (let index = 0; index < body.tenders.length; index += 1) {
    const tender = body.tenders[index];
    if (!tender) {
      continue;
    }
    const paymentId = await repo.insertPayment({
      customerId: body.customer_id,
      method: tender.method,
      amountInr: decimalFromString(tender.amount_inr).toFixed(2),
      reference: tender.reference?.trim() ? tender.reference.trim() : null,
      receivedBusinessDate,
      receivedByStaffUserId: access.staff_user_id,
    });
    paymentIds.push(paymentId);

    for (const slice of slices.filter((item) => item.tenderIndex === index)) {
      await repo.insertAllocation({
        paymentId,
        invoiceId: slice.invoiceId,
        amountInr: slice.amountInr,
      });
    }

    const receiptNumber = await repo.allocateReceiptNumber();
    await repo.insertReceipt({ paymentId, receiptNumber });
    await repo.writeAudit({
      actorStaffUserId: access.staff_user_id,
      action: "payment.record",
      entityType: "payment",
      entityId: paymentId,
      payload: {
        customer_id: body.customer_id,
        method: tender.method,
        amount_inr: tender.amount_inr,
        receipt_number: receiptNumber,
        received_business_date: receivedBusinessDate,
      },
    });
    await repo.insertOutbox({
      eventKey: `receipt.requested:${paymentId}`,
      eventType: "receipt.requested",
      payload: { payment_id: paymentId, receipt_number: receiptNumber },
    });
  }

  for (const invoiceId of [...new Set(invoiceIds)].sort()) {
    await repo.syncInvoicePaidFromAllocations(invoiceId);
  }

  const payments: Payment[] = [];
  for (const paymentId of paymentIds) {
    const payment = await repo.getPayment(paymentId);
    if (!payment) {
      throw new Error("Posted payment could not be reloaded.");
    }
    payments.push(payment);
  }

  const result: PaymentCreateResult = { payments, total_inr: tenderTotal };
  await repo.insertIdempotency({
    operation: RECORD_PAYMENT_OPERATION,
    key,
    requestHash,
    responseStatus: 201,
    responseBody: result,
  });

  return result;
}

export async function getPayment(
  repo: PaymentRepository,
  access: ResolvedStaffAccess,
  paymentId: string,
): Promise<Payment> {
  assertAnyPermission(access, ["payments.write", "reports.read"]);
  const payment = await repo.getPayment(paymentId);
  if (!payment) {
    throw notFoundError("Payment was not found.");
  }
  return payment;
}

export async function listPayments(
  repo: PaymentRepository,
  access: ResolvedStaffAccess,
  filters: PaymentListFilters,
): Promise<{ items: Payment[]; total: number }> {
  assertAnyPermission(access, ["payments.write", "reports.read"]);
  return repo.listPayments(filters);
}

export async function listInvoicePayments(
  repo: PaymentRepository,
  access: ResolvedStaffAccess,
  invoiceId: string,
): Promise<InvoicePayments> {
  assertAnyPermission(access, ["billing.write", "payments.write", "reports.read"]);
  const result = await repo.getInvoicePayments(invoiceId);
  if (!result) {
    throw notFoundError("Invoice was not found.");
  }
  return result;
}

/** Sales dues and collections only. A Girvi-only customer reads zero sales due. */
export async function getCustomerSalesStatement(
  repo: PaymentRepository,
  access: ResolvedStaffAccess,
  customerId: string,
): Promise<CustomerSalesStatement> {
  assertAnyPermission(access, ["billing.write", "payments.write", "reports.read"]);
  const statement = await repo.getCustomerSalesStatement(customerId);
  if (!statement) {
    throw notFoundError("Customer was not found.");
  }
  return statement;
}

/**
 * Collections received in a period (or all-time when bounds are omitted).
 * These are receipts against sales, not sales totals.
 */
export async function getDailyCollections(
  repo: PaymentRepository,
  access: ResolvedStaffAccess,
  period: CollectionsPeriodFilter = {},
): Promise<DailyCollections> {
  assertAnyPermission(access, ["payments.write", "reports.read"]);
  return repo.getDailyCollections(period);
}

/** Resolve list query date params into repository filters (exact day expands to from=to). */
export function paymentListDateFilters(query: {
  received_business_date?: string | undefined;
  received_business_date_from?: string | undefined;
  received_business_date_to?: string | undefined;
}): Pick<PaymentListFilters, "receivedBusinessDateFrom" | "receivedBusinessDateTo"> {
  if (query.received_business_date) {
    return {
      receivedBusinessDateFrom: query.received_business_date,
      receivedBusinessDateTo: query.received_business_date,
    };
  }
  return {
    ...(query.received_business_date_from
      ? { receivedBusinessDateFrom: query.received_business_date_from }
      : {}),
    ...(query.received_business_date_to ? { receivedBusinessDateTo: query.received_business_date_to } : {}),
  };
}

/** Resolve collections query into inclusive bounds. Omitted dates mean all-time. */
export function collectionsPeriodFromQuery(query: {
  business_date?: string | undefined;
  business_date_from?: string | undefined;
  business_date_to?: string | undefined;
}): CollectionsPeriodFilter {
  if (query.business_date) {
    return { from: query.business_date, to: query.business_date };
  }
  return {
    ...(query.business_date_from ? { from: query.business_date_from } : {}),
    ...(query.business_date_to ? { to: query.business_date_to } : {}),
  };
}
