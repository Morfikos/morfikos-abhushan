"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  Customer,
  CustomerListItem,
  OutstandingInvoice,
  PaymentCreate,
  PaymentMethod,
} from "@aabhushan/contracts";
import { Edit01, Plus, Trash01, XClose } from "@untitledui/icons";
import { Heading } from "react-aria-components";

import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { TableSkeleton } from "@/components/application/skeleton/skeleton";
import { useStaffToast } from "@/components/application/toast/staff-toast";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { Input } from "@/components/base/input/input";
import { MethodSelect } from "@/components/shared/method-select";
import { MoneyInput } from "@/components/shared/money-input";
import { MoneyText } from "@/components/shared/money-text";
import { useStaff } from "@/features/auth/staff-shell";
import { CustomerCombobox } from "@/features/customers/customer-combobox";
import {
  newPaymentIdempotencyKey,
  paymentAccessToken,
  paymentErrorMessage,
} from "@/features/payments/payment-shared";
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
import { paymentMethodLabel, referenceHintFor, referencePlaceholderFor } from "@/lib/payment-methods";
import { fetchCustomerSalesStatement, recordPaymentRequest } from "@/lib/staff-api";
import { cx } from "@/utils/cx";

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

function NumberedStep({
  number,
  title,
  active,
  trailing,
  children,
}: {
  number: string;
  title: string;
  active: boolean;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={cx("border-t border-secondary pt-5", !active && "opacity-45")}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2.5">
          <span className="text-sm font-bold text-brand-secondary">{number}</span>
          <h2 className="text-lg font-bold text-primary">{title}</h2>
        </div>
        {trailing && active ? trailing : null}
      </div>
      <div className={cx(!active && "pointer-events-none")}>{children}</div>
    </section>
  );
}

export function RecordPaymentDialog({
  isOpen,
  initialCustomer,
  initialInvoiceId,
  onClose,
  onRecorded,
}: {
  isOpen: boolean;
  initialCustomer: CustomerListItem | Customer | null;
  initialInvoiceId: string | null;
  onClose: () => void;
  /** Called with the first server-confirmed receipt number after a successful post. */
  onRecorded?: (receiptNumber: string | null) => void;
}) {
  const staff = useStaff();
  const toast = useStaffToast();
  const queryClient = useQueryClient();
  const [customer, setCustomer] = useState<CustomerListItem | Customer | null>(initialCustomer);
  const [allocations, setAllocations] = useState<AllocationRow[]>([]);
  const [tenders, setTenders] = useState<TenderRow[]>([newTenderRow()]);
  const [tenderAmountsTouched, setTenderAmountsTouched] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
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

  const salesDue = statement.data?.sales_due_inr ?? "0.00";
  const outstandingCount = outstandingInvoices?.length ?? 0;
  const statementMatchesCustomer =
    Boolean(customer?.id) &&
    Boolean(statement.data) &&
    statement.data?.customer_id === customer?.id;

  const tendersReady = tenders.length > 0 && tenders.every((row) => isPositiveMoney(row.amount));
  const paymentMismatch =
    hasAllocationSelection && tendersReady && !moneyEquals(allocationTotal, tenderTotal);
  const overSalesDue =
    hasAllocationSelection &&
    tendersReady &&
    !isZeroMoney(salesDue) &&
    compareMoney(tenderTotal, salesDue) > 0;

  const mutation = useMutation({
    mutationFn: async (input: { body: PaymentCreate; key: string }) =>
      recordPaymentRequest(await paymentAccessToken(), input.body, input.key),
    onSuccess: async (result) => {
      const receipt =
        result.payments
          .map((payment) => payment.receipt_number)
          .filter((value): value is string => Boolean(value))
          .join(", ") || "recorded";
      const firstReceipt =
        result.payments.map((payment) => payment.receipt_number).find(Boolean) ?? null;
      toast.success(`Payment recorded · ${receipt}`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: statementQueryKey }),
        queryClient.invalidateQueries({ queryKey: ["payments"] }),
        queryClient.invalidateQueries({ queryKey: ["invoices"] }),
        queryClient.invalidateQueries({ queryKey: ["customers"] }),
      ]);
      resetForm();
      onClose();
      onRecorded?.(firstReceipt);
    },
  });

  function resetForm() {
    setTenders([newTenderRow()]);
    setTenderAmountsTouched(false);
    setLocalError(null);
    mutation.reset();
    idempotencyKeyRef.current = newPaymentIdempotencyKey();
    payloadSignatureRef.current = "";
    const outstanding = statement.data?.outstanding_invoices;
    setAllocations(
      outstanding && customer?.id && statement.data?.customer_id === customer.id
        ? allocationsFromOutstanding(outstanding, initialInvoiceId, [])
        : [],
    );
    setAllocationSyncEpoch((value) => value + 1);
  }

  function close() {
    resetForm();
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

  /** Fills tender amount only; does not change allocation. */
  function fillPaymentToAllocated() {
    setTenderAmountsTouched(true);
    setTenders((current) => {
      if (current.length === 0) {
        return [{ ...newTenderRow(), amount: allocationTotal }];
      }
      return current.map((row, index) =>
        index === 0 ? { ...row, amount: allocationTotal } : { ...row, amount: "" },
      );
    });
  }

  function setPaymentToSalesDue() {
    setTenderAmountsTouched(true);
    setTenders((current) => {
      if (current.length === 0) {
        return [{ ...newTenderRow(), amount: salesDue }];
      }
      return current.map((row, index) =>
        index === 0 ? { ...row, amount: salesDue } : { ...row, amount: "" },
      );
    });
  }

  /** Reduces allocation to match the payment total, latest invoices first. */
  function allocateToMatchPayment() {
    const target = tenderTotal;
    setAllocations((current) => {
      const ordered = [...current].sort((left, right) => {
        const byDate = right.businessDate.localeCompare(left.businessDate);
        if (byDate !== 0) {
          return byDate;
        }
        return (right.invoiceNumber ?? right.invoiceId).localeCompare(
          left.invoiceNumber ?? left.invoiceId,
        );
      });
      let remaining = target;
      const nextAmounts = new Map<string, string>();
      for (const row of ordered) {
        if (!isPositiveMoney(remaining) && !isZeroMoney(remaining)) {
          break;
        }
        if (isZeroMoney(remaining)) {
          break;
        }
        const take = compareMoney(remaining, row.dueInr) > 0 ? row.dueInr : remaining;
        if (isPositiveMoney(take)) {
          nextAmounts.set(row.invoiceId, take);
          remaining = subtractMoney(remaining, take);
        }
      }
      return current.map((row) => {
        const amount = nextAmounts.get(row.invoiceId);
        if (amount) {
          return { ...row, isSelected: true, amount };
        }
        return { ...row, isSelected: false, amount: "" };
      });
    });
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

  const canSubmit =
    Boolean(customer) &&
    selectedAllocations.length > 0 &&
    tendersReady &&
    overAllocated.length === 0 &&
    moneyEquals(allocationTotal, tenderTotal) &&
    !overSalesDue;

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
    if (overSalesDue) {
      return `${formatInr(subtractMoney(tenderTotal, salesDue))} more than the ${formatInr(salesDue)} owed. Payments can only settle open dues.`;
    }
    if (!moneyEquals(allocationTotal, tenderTotal)) {
      const short = compareMoney(tenderTotal, allocationTotal) < 0;
      return short
        ? `Payment is ${formatInr(subtractMoney(allocationTotal, tenderTotal))} less than allocated.`
        : `Payment is ${formatInr(subtractMoney(tenderTotal, allocationTotal))} more than allocated.`;
    }
    return null;
  })();

  const methodSummary = tenders
    .filter((row) => isPositiveMoney(row.amount))
    .map((row) => paymentMethodLabel(row.method))
    .join(" · ");

  /** Highlight only the first positive tender when totals disagree (the field with the problem). */
  const mismatchTenderId =
    paymentMismatch || overSalesDue
      ? (tenders.find((row) => isPositiveMoney(row.amount))?.id ?? tenders[0]?.id ?? null)
      : null;

  const outcomeText = (() => {
    if (selectedAllocations.length === 0) {
      return null;
    }
    if (selectedAllocations.length === 1) {
      const row = selectedAllocations[0]!;
      const label = row.invoiceNumber ?? row.invoiceId.slice(0, 8);
      const leaves = subtractMoney(row.dueInr, row.amount);
      if (isZeroMoney(leaves)) {
        return `${label} fully paid`;
      }
      return `leaves ${formatInr(leaves)} due on ${label}`;
    }
    return `${String(selectedAllocations.length)} invoices`;
  })();

  const customerStepComplete = Boolean(customer);
  const invoicesStepActive = customerStepComplete;
  const paymentStepActive = customerStepComplete && hasAllocationSelection;

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
      <Modal className="max-w-3xl">
        <Dialog className="flex max-h-[inherit] flex-col overflow-hidden p-0 outline-hidden">
          <header className="flex shrink-0 items-start justify-between gap-3 border-b-2 border-primary px-6 py-5">
            <div className="flex flex-col gap-1">
              <Heading slot="title" className="text-lg font-bold text-primary">
                Record payment
              </Heading>
              <p className="text-sm text-tertiary">Records money you already collected in the shop.</p>
            </div>
            <Button
              color="tertiary"
              size="md"
              className="shrink-0"
              aria-label="Close"
              isDisabled={mutation.isPending}
              onPress={close}
            >
              <XClose className="size-5" aria-hidden />
            </Button>
          </header>

          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-5">
            <NumberedStep number="01" title="Customer" active>
              {customer ? (
                <div className="flex items-center justify-between gap-4 rounded-xl px-5 py-4 ring-1 ring-primary">
                  <div className="min-w-0">
                    <p className="text-lg font-bold text-primary">{customer.display_name}</p>
                    <p className="text-sm text-tertiary">{customer.phone_display ?? "No phone"}</p>
                  </div>
                  <Button
                    color="tertiary"
                    size="lg"
                    iconLeading={Edit01}
                    className="shrink-0 text-primary"
                    aria-label="Change customer"
                    isDisabled={mutation.isPending}
                    onPress={() => {
                      setCustomer(null);
                      setAllocations([]);
                      setTenders([newTenderRow()]);
                      setTenderAmountsTouched(false);
                      setLocalError(null);
                      mutation.reset();
                    }}
                  />
                </div>
              ) : (
                <CustomerCombobox
                  selected={customer}
                  size="lg"
                  autoFocus={isOpen && !initialCustomer}
                  excludeWalkIn
                  onSelect={(next) => {
                    setCustomer(next);
                    setAllocations([]);
                    setTenders([newTenderRow()]);
                    setTenderAmountsTouched(false);
                    setLocalError(null);
                    mutation.reset();
                    setAllocationSyncEpoch((value) => value + 1);
                  }}
                  onClear={() => {
                    setCustomer(null);
                    setAllocations([]);
                    setTenders([newTenderRow()]);
                    setTenderAmountsTouched(false);
                    setLocalError(null);
                    mutation.reset();
                  }}
                  isDisabled={mutation.isPending}
                />
              )}
            </NumberedStep>

            <NumberedStep
              number="02"
              title="Invoices"
              active={invoicesStepActive}
              trailing={
                invoicesStepActive ? (
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    {statementMatchesCustomer ? (
                      <span className="text-tertiary">Sales due {formatInr(salesDue)}</span>
                    ) : customer ? (
                      <span className="text-tertiary">Loading…</span>
                    ) : null}
                    {allocations.length > 0 ? (
                      <Button
                        color="secondary"
                        size="md"
                        isDisabled={mutation.isPending}
                        onPress={allocateAllDues}
                      >
                        Allocate all dues
                      </Button>
                    ) : null}
                  </div>
                ) : null
              }
            >
              {!customer ? (
                <p className="text-sm text-tertiary">Choose the paying customer to see unpaid invoices.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {statement.isLoading ? (
                    <TableSkeleton columns={3} rows={4} showCard={false} label="Loading sales statement" />
                  ) : null}
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
                    <div
                      className="flex flex-col items-center justify-center gap-6 py-10"
                      role="status"
                    >
                      <div
                        aria-hidden="true"
                        className="-rotate-8 select-none border-[5px] border-utility-green-600 px-2.5 py-2.5 opacity-90"
                      >
                        <div className="border-[2.5px] border-utility-green-600 px-10 py-5 sm:px-12 sm:py-6">
                          <p className="text-center text-display-sm font-bold tracking-[0.22em] text-utility-green-700 uppercase">
                            No dues
                          </p>
                        </div>
                      </div>
                      <p className="max-w-sm text-center text-sm text-tertiary">
                        This customer has no unpaid sales invoice. Girvi dues are settled separately.
                      </p>
                    </div>
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
                      <div
                        key={row.invoiceId}
                        className="grid grid-cols-12 items-start gap-4 border-b border-secondary py-4 last:border-b-0 last:pb-0 first:pt-0"
                      >
                        <div className="col-span-12 sm:col-span-6">
                          <Checkbox
                            size="md"
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
                            label={
                              <span className="font-mono text-md font-semibold">
                                {row.invoiceNumber ?? row.invoiceId.slice(0, 8)}
                              </span>
                            }
                            hint={`${row.businessDate} · due ${formatInr(row.dueInr)}${
                              leaves !== null ? ` · leaves ${formatInr(leaves)}` : ""
                            }`}
                          />
                        </div>
                        <div className="col-span-12 sm:col-span-6">
                          <MoneyInput
                            label="Amount"
                            size="md"
                            value={row.amount}
                            isDisabled={!row.isSelected || mutation.isPending}
                            isInvalid={Boolean(amountOver)}
                            hint={row.isSelected ? `of ${formatInr(row.dueInr)} due` : undefined}
                            onFill={
                              row.isSelected
                                ? () => setAllocationFull(row.invoiceId)
                                : undefined
                            }
                            error={
                              amountOver
                                ? "Above remaining due. Overpayment is not accepted."
                                : undefined
                            }
                            onChange={(value) =>
                              setAllocations((current) =>
                                current.map((item) =>
                                  item.invoiceId === row.invoiceId ? { ...item, amount: value } : item,
                                ),
                              )
                            }
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </NumberedStep>

            <NumberedStep
              number="03"
              title="Payment"
              active={paymentStepActive}
              trailing={
                paymentStepActive ? (
                  <Button
                    color="secondary"
                    size="md"
                    iconLeading={Plus}
                    isDisabled={tenders.length >= 10 || mutation.isPending}
                    onPress={() => {
                      setTenderAmountsTouched(true);
                      setTenders((current) => [...current, newTenderRow("upi")]);
                    }}
                  >
                    Split payment
                  </Button>
                ) : null
              }
            >
              {!paymentStepActive ? (
                <p className="text-sm text-tertiary">Allocate at least one invoice to enter tenders.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {tenders.map((row) => {
                    const tenderHasMismatch = mismatchTenderId === row.id;
                    return (
                    <div
                      key={row.id}
                      className={cx(
                        "grid grid-cols-12 items-start gap-3 rounded-xl bg-secondary p-4 ring-1",
                        tenderHasMismatch ? "ring-error-secondary" : "ring-secondary",
                      )}
                    >
                      <div className="col-span-12 sm:col-span-5">
                        <MethodSelect
                          label="Method"
                          size="md"
                          value={row.method}
                          isDisabled={mutation.isPending}
                          onChange={(nextMethod) =>
                            setTenders((current) =>
                              current.map((item) =>
                                item.id === row.id ? { ...item, method: nextMethod } : item,
                              ),
                            )
                          }
                        />
                      </div>
                      <div className="col-span-12 sm:col-span-3">
                        <MoneyInput
                          label="Amount"
                          size="md"
                          value={row.amount}
                          isDisabled={mutation.isPending}
                          isInvalid={
                            (row.amount.trim().length > 0 && !isPositiveMoney(row.amount)) ||
                            tenderHasMismatch
                          }
                          onChange={(value) => {
                            setTenderAmountsTouched(true);
                            setTenders((current) =>
                              current.map((item) =>
                                item.id === row.id ? { ...item, amount: value } : item,
                              ),
                            );
                          }}
                        />
                      </div>
                      <div
                        className={`col-span-10 sm:col-span-3 ${tenders.length > 1 ? "" : "sm:col-span-4"}`}
                      >
                        <Input
                          label="Reference (optional)"
                          size="md"
                          value={row.reference}
                          isDisabled={mutation.isPending}
                          placeholder={referencePlaceholderFor(row.method)}
                          hint={referenceHintFor(row.method)}
                          onChange={(value) =>
                            setTenders((current) =>
                              current.map((item) =>
                                item.id === row.id ? { ...item, reference: value } : item,
                              ),
                            )
                          }
                        />
                      </div>
                      {tenders.length > 1 ? (
                        <div className="col-span-2 flex items-end justify-end pb-0.5 sm:col-span-1">
                          <Button
                            color="tertiary"
                            size="lg"
                            iconLeading={Trash01}
                            aria-label="Remove tender"
                            isDisabled={mutation.isPending}
                            onPress={() => {
                              setTenderAmountsTouched(true);
                              setTenders((current) => current.filter((item) => item.id !== row.id));
                            }}
                          />
                        </div>
                      ) : null}
                    </div>
                    );
                  })}

                  {!isZeroMoney(allocationTotal) ? (
                    <div className="flex flex-col gap-1.5">
                      <Button
                        color="secondary"
                        size="lg"
                        className="w-full sm:w-auto"
                        isDisabled={mutation.isPending}
                        onPress={fillPaymentToAllocated}
                      >
                        Full due {formatInr(allocationTotal)}
                      </Button>
                      <p className="text-sm text-tertiary">
                        Fills the tender amount; allocation stays as set above.
                      </p>
                    </div>
                  ) : null}

                  {overSalesDue ? (
                    <div className="flex flex-col gap-2 rounded-lg bg-error-primary px-4 py-3 ring-1 ring-error-secondary">
                      <p className="text-sm text-error-primary" role="alert">
                        {formatInr(subtractMoney(tenderTotal, salesDue))} more than the{" "}
                        {formatInr(salesDue)} owed. Payments can only settle open dues.
                      </p>
                      <Button
                        color="secondary"
                        size="md"
                        className="self-start"
                        isDisabled={mutation.isPending}
                        onPress={setPaymentToSalesDue}
                      >
                        Set to {formatInr(salesDue)}
                      </Button>
                    </div>
                  ) : null}

                  {paymentMismatch && !overSalesDue ? (
                    <div className="flex flex-col gap-2 rounded-lg bg-error-primary px-4 py-3 ring-1 ring-error-secondary">
                      <p className="text-sm text-error-primary" role="alert">
                        {compareMoney(tenderTotal, allocationTotal) < 0
                          ? `Payment is ${formatInr(subtractMoney(allocationTotal, tenderTotal))} less than allocated.`
                          : `Payment is ${formatInr(subtractMoney(tenderTotal, allocationTotal))} more than allocated.`}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          color="secondary"
                          size="md"
                          isDisabled={mutation.isPending}
                          onPress={allocateToMatchPayment}
                        >
                          Allocate {formatInr(tenderTotal)} instead
                        </Button>
                        <Button
                          color="secondary"
                          size="md"
                          isDisabled={mutation.isPending}
                          onPress={fillPaymentToAllocated}
                        >
                          Set payment to {formatInr(allocationTotal)}
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </NumberedStep>

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

          <footer className="flex shrink-0 flex-col gap-3 border-t-2 border-primary px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
            {paymentMismatch || overSalesDue ? (
              <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <div className="flex gap-2">
                  <dt className="text-tertiary">Allocated</dt>
                  <MoneyText amount={allocationTotal} as="dd" className="font-medium text-primary" />
                </div>
                <div className="flex gap-2">
                  <dt className="text-tertiary">Payment</dt>
                  <MoneyText amount={tenderTotal} as="dd" className="font-medium text-primary" />
                </div>
                <div className="flex gap-2">
                  <dt className="font-semibold text-error-primary">Difference</dt>
                  <MoneyText
                    amount={difference}
                    as="dd"
                    className="font-bold text-error-primary"
                  />
                </div>
              </dl>
            ) : submitReason ? (
              <p className="text-sm text-tertiary" role="status">
                {submitReason}
              </p>
            ) : (
              <div className="min-w-0">
                <p className="text-sm font-semibold tracking-wide text-tertiary uppercase">
                  Collecting{methodSummary ? ` · ${methodSummary}` : ""}
                </p>
                <MoneyText
                  amount={allocationTotal}
                  as="p"
                  className="text-xl font-bold text-primary"
                />
                {outcomeText ? <p className="text-sm text-tertiary">{outcomeText}</p> : null}
              </div>
            )}
            <div className="flex flex-wrap justify-end gap-3">
              <Button color="secondary" size="lg" isDisabled={mutation.isPending} onPress={close}>
                Cancel
              </Button>
              <Button
                color="primary"
                size="lg"
                isDisabled={!canSubmit || mutation.isPending}
                isLoading={mutation.isPending}
                onPress={submit}
              >
                Record {formatInr(allocationTotal)}
              </Button>
            </div>
          </footer>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
