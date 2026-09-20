"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  Customer,
  CustomerListItem,
  OutstandingInvoice,
  PaymentCreate,
  PaymentCreateResult,
  PaymentMethod,
} from "@aabhushan/contracts";
import { Copy01, Plus, Trash01 } from "@untitledui/icons";
import { Heading } from "react-aria-components";

import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { Input } from "@/components/base/input/input";
import { MethodSelect } from "@/components/shared/method-select";
import { MoneyInput } from "@/components/shared/money-input";
import { useStaff } from "@/features/auth/staff-shell";
import { CustomerCombobox } from "@/features/customers/customer-combobox";
import { newPaymentIdempotencyKey, paymentAccessToken, paymentErrorMessage } from "@/features/payments/payment-shared";
import {
  compareMoney,
  formatInr,
  isMoneyShape,
  isPositiveMoney,
  isZeroMoney,
  moneyEquals,
  subtractMoney,
  sumMoney,
} from "@/lib/money";
import { paymentMethodLabel, referenceHintFor } from "@/lib/payment-methods";
import { fetchCustomerSalesStatement, recordPaymentRequest } from "@/lib/staff-api";

type AllocationRow = {
  invoiceId: string;
  invoiceNumber: string | null;
  businessDate: string;
  dueInr: string;
  isSelected: boolean;
  amount: string;
};

type TenderRow = {
  id: string;
  method: PaymentMethod;
  amount: string;
  reference: string;
};

function newTenderRow(method: PaymentMethod = "cash"): TenderRow {
  return { id: newPaymentIdempotencyKey(), method, amount: "", reference: "" };
}

/** Build allocation rows from the sales statement. Preserves prior edits when invoice ids match. */
function allocationsFromOutstanding(
  outstanding: OutstandingInvoice[],
  initialInvoiceId: string | null,
  previous: AllocationRow[] = [],
): AllocationRow[] {
  const prior = new Map(previous.map((row) => [row.invoiceId, row]));
  return outstanding.map((invoice) => {
    const existing = prior.get(invoice.invoice_id);
    if (existing) {
      return { ...existing, dueInr: invoice.amount_due_inr };
    }
    const preselect = invoice.invoice_id === initialInvoiceId || outstanding.length === 1;
    return {
      invoiceId: invoice.invoice_id,
      invoiceNumber: invoice.invoice_number,
      businessDate: invoice.business_date,
      dueInr: invoice.amount_due_inr,
      isSelected: preselect,
      amount: preselect ? invoice.amount_due_inr : "",
    };
  });
}

function TotalsRow({
  label,
  amount,
  emphasize = false,
}: {
  label: string;
  amount: string;
  emphasize?: boolean;
}) {
  const zero = isZeroMoney(amount);
  return (
    <div className="flex justify-between gap-3">
      <dt className={emphasize && !zero ? "text-error-primary" : zero ? "text-quaternary" : "text-tertiary"}>
        {label}
      </dt>
      <dd
        className={`tabular-nums ${
          emphasize && !zero ? "font-medium text-error-primary" : zero ? "text-quaternary" : "text-primary"
        }`}
      >
        {formatInr(amount)}
      </dd>
    </div>
  );
}

export function RecordPaymentDialog({
  isOpen,
  initialCustomer,
  initialInvoiceId,
  onClose,
}: {
  isOpen: boolean;
  initialCustomer: CustomerListItem | Customer | null;
  initialInvoiceId: string | null;
  onClose: () => void;
}) {
  const staff = useStaff();
  const queryClient = useQueryClient();
  const [customer, setCustomer] = useState<CustomerListItem | Customer | null>(initialCustomer);
  const [allocations, setAllocations] = useState<AllocationRow[]>([]);
  const [tenders, setTenders] = useState<TenderRow[]>([newTenderRow()]);
  const [tenderAmountsTouched, setTenderAmountsTouched] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [posted, setPosted] = useState<PaymentCreateResult | null>(null);
  const [copiedReceipt, setCopiedReceipt] = useState<string | null>(null);
  const [allocationSyncEpoch, setAllocationSyncEpoch] = useState(0);
  const idempotencyKeyRef = useRef<string>(newPaymentIdempotencyKey());
  const payloadSignatureRef = useRef<string>("");

  useEffect(() => {
    if (isOpen) {
      setCustomer(initialCustomer);
      setAllocationSyncEpoch((value) => value + 1);
    }
  }, [initialCustomer, isOpen]);

  const statementQueryKey = [
    "payments",
    "statement",
    staff.membership.organization_id,
    customer?.id ?? "",
  ] as const;

  const statement = useQuery({
    queryKey: statementQueryKey,
    queryFn: async () => fetchCustomerSalesStatement(await paymentAccessToken(), customer?.id ?? ""),
    enabled: isOpen && Boolean(customer?.id),
  });

  const outstandingInvoices = statement.data?.outstanding_invoices;

  // Rebuild whenever the customer, statement fetch, or an explicit sync bump changes —
  // not only when statement.data identity changes (cache hits keep the same reference).
  useEffect(() => {
    if (!customer?.id) {
      setAllocations([]);
      return;
    }
    if (!statement.data || statement.data.customer_id !== customer.id) {
      setAllocations([]);
      return;
    }
    const outstanding = statement.data.outstanding_invoices;
    setAllocations((current) => allocationsFromOutstanding(outstanding, initialInvoiceId, current));
  }, [
    allocationSyncEpoch,
    customer?.id,
    initialInvoiceId,
    statement.data,
    statement.dataUpdatedAt,
  ]);

  const selectedAllocations = useMemo(
    () => allocations.filter((row) => row.isSelected && isPositiveMoney(row.amount)),
    [allocations],
  );
  const allocationTotal = useMemo(
    () => sumMoney(selectedAllocations.map((row) => row.amount)),
    [selectedAllocations],
  );
  const tenderTotal = useMemo(() => sumMoney(tenders.map((row) => row.amount)), [tenders]);
  const difference = useMemo(
    () => subtractMoney(tenderTotal, allocationTotal),
    [allocationTotal, tenderTotal],
  );
  const hasAllocationSelection = selectedAllocations.length > 0;

  // A single untouched tender mirrors the allocated total. `tenders` is read through the
  // updater so writing it cannot re-arm this effect, and an unchanged list keeps its identity.
  useEffect(() => {
    if (tenderAmountsTouched) {
      return;
    }
    const nextAmount = allocationTotal === "0.00" ? "" : allocationTotal;
    setTenders((current) => {
      const only = current.length === 1 ? current[0] : undefined;
      if (!only || only.amount === nextAmount) {
        return current;
      }
      return [{ ...only, amount: nextAmount }];
    });
  }, [allocationTotal, tenderAmountsTouched]);

  const overAllocated = allocations.filter(
    (row) => row.isSelected && isMoneyShape(row.amount) && compareMoney(row.amount, row.dueInr) > 0,
  );

  const mutation = useMutation({
    mutationFn: async (input: { body: PaymentCreate; key: string }) =>
      recordPaymentRequest(await paymentAccessToken(), input.body, input.key),
    onSuccess: async (result) => {
      setPosted(result);
      // Await so "Record another" rebuilds from a refreshed statement, not a stale cache hit.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: statementQueryKey }),
        queryClient.invalidateQueries({ queryKey: ["payments"] }),
        queryClient.invalidateQueries({ queryKey: ["invoices"] }),
        queryClient.invalidateQueries({ queryKey: ["customers"] }),
      ]);
    },
  });

  function reset() {
    setTenders([newTenderRow()]);
    setTenderAmountsTouched(false);
    setLocalError(null);
    setPosted(null);
    setCopiedReceipt(null);
    mutation.reset();
    idempotencyKeyRef.current = newPaymentIdempotencyKey();
    payloadSignatureRef.current = "";
    // Rebuild immediately so a same-customer cache hit cannot leave an empty list.
    const outstanding = statement.data?.outstanding_invoices;
    setAllocations(
      outstanding && customer?.id && statement.data?.customer_id === customer.id
        ? allocationsFromOutstanding(outstanding, initialInvoiceId, [])
        : [],
    );
    setAllocationSyncEpoch((value) => value + 1);
  }

  function close() {
    reset();
    onClose();
  }

  function allocateAllDues() {
    setAllocations((current) =>
      current.map((item) => ({
        ...item,
        isSelected: true,
        amount: item.dueInr,
      })),
    );
  }

  function setAllocationFull(invoiceId: string) {
    setAllocations((current) =>
      current.map((item) =>
        item.invoiceId === invoiceId ? { ...item, isSelected: true, amount: item.dueInr } : item,
      ),
    );
  }

  async function copyReceipt(receiptNumber: string) {
    try {
      await navigator.clipboard.writeText(receiptNumber);
      setCopiedReceipt(receiptNumber);
    } catch {
      setCopiedReceipt(null);
    }
  }

  function buildBody(): PaymentCreate | null {
    if (!customer) {
      setLocalError("Select the paying customer.");
      return null;
    }
    if (selectedAllocations.length === 0) {
      setLocalError("Select at least one unpaid invoice and enter an amount.");
      return null;
    }
    if (overAllocated.length > 0) {
      setLocalError("An allocation is above the remaining invoice due. Overpayment is not accepted.");
      return null;
    }
    if (tenders.some((row) => !isPositiveMoney(row.amount))) {
      setLocalError("Enter a positive amount for every tender.");
      return null;
    }
    if (!moneyEquals(allocationTotal, tenderTotal)) {
      setLocalError(
        `Tenders total ${formatInr(tenderTotal)} but allocations total ${formatInr(allocationTotal)}.`,
      );
      return null;
    }
    setLocalError(null);
    return {
      customer_id: customer.id,
      tenders: tenders.map((row) => ({
        method: row.method,
        amount_inr: row.amount.trim(),
        ...(row.reference.trim() ? { reference: row.reference.trim() } : {}),
      })),
      allocations: selectedAllocations.map((row) => ({
        invoice_id: row.invoiceId,
        amount_inr: row.amount.trim(),
      })),
    };
  }

  function submit() {
    const body = buildBody();
    if (!body) {
      return;
    }
    const signature = JSON.stringify(body);
    if (signature !== payloadSignatureRef.current) {
      idempotencyKeyRef.current = newPaymentIdempotencyKey();
      payloadSignatureRef.current = signature;
    }
    mutation.mutate({ body, key: idempotencyKeyRef.current });
  }

  const salesDue = statement.data?.sales_due_inr ?? "0.00";
  const outstandingCount = outstandingInvoices?.length ?? 0;
  const statementMatchesCustomer =
    Boolean(customer?.id) &&
    Boolean(statement.data) &&
    statement.data?.customer_id === customer?.id;
  const canSubmit =
    Boolean(customer) &&
    selectedAllocations.length > 0 &&
    tenders.length > 0 &&
    tenders.every((row) => isPositiveMoney(row.amount)) &&
    overAllocated.length === 0 &&
    moneyEquals(allocationTotal, tenderTotal);

  const submitReason = (() => {
    if (canSubmit) {
      return null;
    }
    if (!customer) {
      return "Select the paying customer.";
    }
    if (statement.isLoading || !statementMatchesCustomer) {
      return "Loading unpaid invoices…";
    }
    if (statement.isError) {
      return paymentErrorMessage(statement.error);
    }
    if (outstandingCount === 0 && isZeroMoney(salesDue)) {
      return "This customer has no unpaid sales invoice.";
    }
    if (outstandingCount === 0 && !isZeroMoney(salesDue)) {
      return "Sales due is present but invoices failed to load. Close and reopen this dialog.";
    }
    if (allocations.length === 0) {
      return "Loading unpaid invoices…";
    }
    if (selectedAllocations.length === 0) {
      return "Select an invoice and enter an allocation amount.";
    }
    if (overAllocated.length > 0) {
      return "An allocation is above the remaining invoice due. Overpayment is not accepted.";
    }
    if (tenders.some((row) => !isPositiveMoney(row.amount))) {
      return "Enter a positive amount for every tender.";
    }
    if (!moneyEquals(allocationTotal, tenderTotal)) {
      return `Tenders total ${formatInr(tenderTotal)} but allocations total ${formatInr(allocationTotal)}.`;
    }
    return null;
  })();

  const selectedInvoiceCount = allocations.filter((row) => row.isSelected).length;

  return (
    <ModalOverlay
      isOpen={isOpen}
      isDismissable={!mutation.isPending}
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) {
          close();
        }
      }}
    >
      <Modal className="max-w-2xl">
        <Dialog className="flex max-h-[inherit] flex-col overflow-hidden p-0 outline-hidden">
          <header className="flex shrink-0 flex-col gap-1 border-b border-secondary px-5 py-4">
            <Heading slot="title" className="text-lg font-semibold text-primary">
              Record payment
            </Heading>
            {customer ? (
              <p className="text-sm text-tertiary">{customer.display_name}</p>
            ) : (
              <p className="text-sm text-tertiary">
                Staff record collections they have verified themselves. There is no payment gateway.
              </p>
            )}
          </header>

          {posted ? (
            <>
              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
                <div className="rounded-lg bg-success-primary px-3 py-3 ring-1 ring-success" role="status">
                  <p className="text-sm font-medium text-primary">
                    Collection received: {formatInr(posted.total_inr)}
                  </p>
                  <p className="mt-1 text-xs text-tertiary">
                    Server confirmed. Receipt documents are queued after commit and may arrive later.
                  </p>
                </div>
                <ul className="flex flex-col gap-2">
                  {posted.payments.map((payment) => (
                    <li
                      key={payment.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-secondary px-3 py-2 ring-1 ring-secondary"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="font-mono text-sm text-primary">
                          {payment.receipt_number ?? "Receipt pending"}
                        </span>
                        {payment.receipt_number ? (
                          <Button
                            color="tertiary"
                            size="sm"
                            iconLeading={Copy01}
                            aria-label={`Copy receipt ${payment.receipt_number}`}
                            onPress={() => void copyReceipt(payment.receipt_number!)}
                          />
                        ) : null}
                        {copiedReceipt === payment.receipt_number ? (
                          <span className="text-xs text-success-primary">Copied</span>
                        ) : null}
                      </div>
                      <span className="text-sm text-tertiary">{paymentMethodLabel(payment.method)}</span>
                      <span className="text-sm font-medium tabular-nums text-primary">
                        {formatInr(payment.amount_inr)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-secondary px-5 py-4">
                <Button color="secondary" size="md" onPress={reset}>
                  Record another
                </Button>
                <Button color="primary" size="md" onPress={close}>
                  Done
                </Button>
              </footer>
            </>
          ) : (
            <>
              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
                <CustomerCombobox
                  selected={customer}
                  autoFocus={isOpen && !initialCustomer}
                  excludeWalkIn
                  onSelect={(next) => {
                    setCustomer(next);
                    setAllocations([]);
                    setTenders([newTenderRow()]);
                    setTenderAmountsTouched(false);
                    setLocalError(null);
                    setAllocationSyncEpoch((value) => value + 1);
                  }}
                  onClear={() => {
                    setCustomer(null);
                    setAllocations([]);
                    setTenders([newTenderRow()]);
                    setTenderAmountsTouched(false);
                    setLocalError(null);
                  }}
                  isDisabled={mutation.isPending}
                />

                {!customer ? (
                  <div className="rounded-lg border border-dashed border-secondary px-4 py-6 text-center">
                    <p className="text-sm text-tertiary">Choose the paying customer to see unpaid invoices.</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3 rounded-lg bg-secondary p-3 ring-1 ring-secondary">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-primary">Unpaid invoices</p>
                        {selectedInvoiceCount > 0 ? (
                          <Badge color="gray" size="sm" type="modern">
                            {selectedInvoiceCount} selected
                          </Badge>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge color="gray" size="sm" type="modern">
                          Sales due {formatInr(salesDue)}
                        </Badge>
                        {allocations.length > 0 ? (
                          <Button
                            color="link-color"
                            size="sm"
                            isDisabled={mutation.isPending}
                            onPress={allocateAllDues}
                          >
                            Allocate all dues
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    {statement.isLoading ? <LoadingIndicator size="sm" label="Loading sales statement" /> : null}
                    {statement.isError ? (
                      <p className="text-sm text-error-primary" role="alert">
                        {paymentErrorMessage(statement.error)}
                      </p>
                    ) : null}
                    {!statement.isLoading &&
                    !statement.isError &&
                    statementMatchesCustomer &&
                    outstandingCount === 0 &&
                    isZeroMoney(salesDue) ? (
                      <p className="text-sm text-tertiary">
                        This customer has no unpaid sales invoice. Girvi dues are settled separately.
                      </p>
                    ) : null}
                    {!statement.isLoading &&
                    !statement.isError &&
                    statementMatchesCustomer &&
                    outstandingCount === 0 &&
                    !isZeroMoney(salesDue) ? (
                      <p className="text-sm text-warning-primary" role="status">
                        Sales due is {formatInr(salesDue)} but unpaid invoices failed to load. Close and
                        reopen this dialog, or try again.
                      </p>
                    ) : null}
                    {allocations.map((row) => {
                      const amountOver =
                        row.isSelected &&
                        row.amount.trim().length > 0 &&
                        (!isPositiveMoney(row.amount) || compareMoney(row.amount, row.dueInr) > 0);
                      const leaves =
                        row.isSelected && isPositiveMoney(row.amount) && !amountOver
                          ? subtractMoney(row.dueInr, row.amount)
                          : null;
                      return (
                        <div key={row.invoiceId} className="grid grid-cols-12 items-start gap-3">
                          <div className="col-span-12 sm:col-span-5">
                            <Checkbox
                              isSelected={row.isSelected}
                              isDisabled={mutation.isPending}
                              onChange={(selected) =>
                                setAllocations((current) =>
                                  current.map((item) =>
                                    item.invoiceId === row.invoiceId
                                      ? {
                                          ...item,
                                          isSelected: selected,
                                          amount: selected ? item.amount || item.dueInr : "",
                                        }
                                      : item,
                                  ),
                                )
                              }
                              label={row.invoiceNumber ?? row.invoiceId.slice(0, 8)}
                              hint={`${row.businessDate} · due ${formatInr(row.dueInr)}`}
                            />
                          </div>
                          <div className="col-span-8 sm:col-span-5">
                            <MoneyInput
                              label="Amount"
                              value={row.amount}
                              isDisabled={!row.isSelected || mutation.isPending}
                              isInvalid={Boolean(amountOver)}
                              maxHintAmount={row.isSelected ? row.dueInr : undefined}
                              onChange={(value) =>
                                setAllocations((current) =>
                                  current.map((item) =>
                                    item.invoiceId === row.invoiceId ? { ...item, amount: value } : item,
                                  ),
                                )
                              }
                            />
                            {amountOver ? (
                              <p className="mt-1 text-xs text-error-primary" role="alert">
                                Above remaining due. Overpayment is not accepted.
                              </p>
                            ) : null}
                            {leaves !== null ? (
                              <p className="mt-1 text-xs text-tertiary">
                                Leaves {formatInr(leaves)} after this collection
                              </p>
                            ) : null}
                          </div>
                          <div className="col-span-4 flex items-end pb-0.5 sm:col-span-2 sm:justify-end">
                            <Button
                              color="link-color"
                              size="sm"
                              isDisabled={mutation.isPending}
                              onPress={() => setAllocationFull(row.invoiceId)}
                            >
                              Full
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {customer && hasAllocationSelection ? (
                  <>
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-primary">Tender</p>
                          <Badge color="gray" size="sm" type="modern">
                            {tenders.length}
                          </Badge>
                        </div>
                        <Button
                          color="tertiary"
                          size="sm"
                          iconLeading={Plus}
                          isDisabled={tenders.length >= 10 || mutation.isPending}
                          onPress={() => {
                            setTenderAmountsTouched(true);
                            setTenders((current) => [...current, newTenderRow("upi")]);
                          }}
                        >
                          Add tender
                        </Button>
                      </div>
                      {tenders.map((row) => (
                        <div
                          key={row.id}
                          className="grid grid-cols-12 items-start gap-3 rounded-lg bg-secondary p-3 ring-1 ring-secondary"
                        >
                          <div className="col-span-12 sm:col-span-5">
                            <MethodSelect
                              label="Method"
                              value={row.method}
                              isDisabled={mutation.isPending}
                              onChange={(method) =>
                                setTenders((current) =>
                                  current.map((item) => (item.id === row.id ? { ...item, method } : item)),
                                )
                              }
                            />
                          </div>
                          <div className="col-span-12 sm:col-span-3">
                            <MoneyInput
                              label="Amount"
                              value={row.amount}
                              isDisabled={mutation.isPending}
                              isInvalid={row.amount.trim().length > 0 && !isPositiveMoney(row.amount)}
                              onChange={(value) => {
                                setTenderAmountsTouched(true);
                                setTenders((current) =>
                                  current.map((item) => (item.id === row.id ? { ...item, amount: value } : item)),
                                );
                              }}
                            />
                          </div>
                          <div className={`col-span-10 sm:col-span-3 ${tenders.length > 1 ? "" : "sm:col-span-4"}`}>
                            <Input
                              label="Reference (optional)"
                              value={row.reference}
                              isDisabled={mutation.isPending}
                              placeholder={referenceHintFor(row.method)}
                              onChange={(value) =>
                                setTenders((current) =>
                                  current.map((item) => (item.id === row.id ? { ...item, reference: value } : item)),
                                )
                              }
                            />
                          </div>
                          {tenders.length > 1 ? (
                            <div className="col-span-2 flex items-end justify-end pb-0.5 sm:col-span-1">
                              <Button
                                color="tertiary"
                                size="md"
                                iconLeading={Trash01}
                                aria-label="Remove tender"
                                isDisabled={mutation.isPending}
                                onPress={() =>
                                  setTenders((current) => current.filter((item) => item.id !== row.id))
                                }
                              />
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-col gap-3">
                      <div className="rounded-lg bg-brand-primary px-3 py-3">
                        <p className="text-sm font-medium text-brand-secondary">Collecting</p>
                        <p className="text-display-sm font-semibold tabular-nums text-brand-primary">
                          {formatInr(allocationTotal)}
                        </p>
                      </div>
                      <dl className="flex flex-col gap-2 text-sm">
                        <TotalsRow label="Allocated to invoices" amount={allocationTotal} />
                        <TotalsRow label="Tender total" amount={tenderTotal} />
                        <TotalsRow label="Difference" amount={difference} emphasize />
                      </dl>
                    </div>

                    <div className="rounded-lg bg-primary p-3 ring-1 ring-secondary">
                      <p className="text-sm font-medium text-primary">Confirm this collection</p>
                      <dl className="mt-2 flex flex-col gap-1.5 text-sm">
                        <div className="flex justify-between gap-3">
                          <dt className="text-tertiary">Customer</dt>
                          <dd className="text-right text-primary">{customer.display_name}</dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="text-tertiary">Invoices</dt>
                          <dd className="text-right text-primary">
                            {selectedAllocations
                              .map(
                                (row) =>
                                  `${row.invoiceNumber ?? row.invoiceId.slice(0, 8)} ${formatInr(row.amount)}`,
                              )
                              .join(", ")}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="text-tertiary">Tenders</dt>
                          <dd className="text-right text-primary">
                            {tenders
                              .filter((row) => isPositiveMoney(row.amount))
                              .map((row) => `${formatInr(row.amount)} ${paymentMethodLabel(row.method)}`)
                              .join(", ")}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="text-tertiary">Total</dt>
                          <dd className="font-medium tabular-nums text-primary">{formatInr(allocationTotal)}</dd>
                        </div>
                      </dl>
                      <p className="mt-2 text-xs text-tertiary">
                        Recording posts this collection against the selected invoices. There is no payment gateway
                        and no automatic bank confirmation.
                      </p>
                    </div>
                  </>
                ) : null}

                {localError ? (
                  <p className="text-sm text-error-primary" role="alert">
                    {localError}
                  </p>
                ) : null}
                {mutation.isError ? (
                  <p className="text-sm text-error-primary" role="alert">
                    {paymentErrorMessage(mutation.error)}
                  </p>
                ) : null}
              </div>

              <footer className="flex shrink-0 flex-col gap-2 border-t border-secondary px-5 py-4">
                {submitReason ? (
                  <p className="text-xs text-tertiary" role="status">
                    {submitReason}
                  </p>
                ) : null}
                <div className="flex flex-wrap justify-end gap-2">
                  <Button color="secondary" size="md" isDisabled={mutation.isPending} onPress={close}>
                    Cancel
                  </Button>
                  <Button
                    color="primary"
                    size="md"
                    isDisabled={!canSubmit || mutation.isPending}
                    isLoading={mutation.isPending}
                    onPress={submit}
                  >
                    Record payment
                  </Button>
                </div>
              </footer>
            </>
          )}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
