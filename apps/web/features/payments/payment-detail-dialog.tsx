"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Payment, PaymentMethod } from "@aabhushan/contracts";
import { ChevronLeft, XClose } from "@untitledui/icons";
import { Heading } from "react-aria-components";

import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { Skeleton } from "@/components/application/skeleton/skeleton";
import { useStaffToast } from "@/components/application/toast/staff-toast";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Dropdown } from "@/components/base/dropdown/dropdown";
import { TextArea } from "@/components/base/textarea/textarea";
import { MethodSelect } from "@/components/shared/method-select";
import { MoneyInput } from "@/components/shared/money-input";
import { MoneyText } from "@/components/shared/money-text";
import { staffHasPermission, useStaff } from "@/features/auth/staff-shell";
import {
  newPaymentIdempotencyKey,
  paymentAccessToken,
  paymentErrorMessage,
  paymentKindLabel,
} from "@/features/payments/payment-shared";
import { ReceiptDocumentsCard } from "@/features/payments/receipt-documents-card";
import { RefundDocumentsCard } from "@/features/payments/refund-documents-card";
import { formatInr, subtractMoney, sumMoney } from "@/lib/money";
import { paymentMethodLabel } from "@/lib/payment-methods";
import {
  fetchCustomerSalesStatement,
  fetchPayment,
  refundPaymentRequest,
  reversePaymentRequest,
} from "@/lib/staff-api";
import { cx } from "@/utils/cx";

type DetailView = "detail" | "refund" | "reverse";

function methodPhrase(method: PaymentMethod): string {
  if (method === "upi") {
    return "UPI";
  }
  return paymentMethodLabel(method).toLowerCase();
}

function formatDayLabel(businessDate: string): string {
  const [year, month, day] = businessDate.split("-").map(Number);
  if (!year || !month || !day) {
    return businessDate;
  }
  const asDate = new Date(year, month - 1, day);
  return asDate.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function PaymentDetailDialog({
  paymentId,
  onClose,
}: {
  paymentId: string | null;
  onClose: () => void;
}) {
  const staff = useStaff();
  const toast = useStaffToast();
  const queryClient = useQueryClient();
  const [view, setView] = useState<DetailView>("detail");
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [idempotencyKey, setIdempotencyKey] = useState(newPaymentIdempotencyKey);
  const [reasonTouched, setReasonTouched] = useState(false);

  const query = useQuery({
    queryKey: ["payments", "detail", staff.membership.organization_id, paymentId ?? ""],
    queryFn: async () => fetchPayment(await paymentAccessToken(), paymentId ?? ""),
    enabled: Boolean(paymentId),
  });

  const payment = query.data;

  const statement = useQuery({
    queryKey: [
      "customers",
      "sales-statement",
      staff.membership.organization_id,
      payment?.customer_id ?? "",
    ],
    queryFn: async () =>
      fetchCustomerSalesStatement(await paymentAccessToken(), payment?.customer_id ?? ""),
    enabled: Boolean(payment?.customer_id) && payment?.kind === "collection",
  });

  const linkedRefunds = useMemo(() => {
    if (!payment) {
      return [] as Payment[];
    }
    return (statement.data?.payments ?? []).filter(
      (item) => item.kind === "refund" && item.reverses_payment_id === payment.id,
    );
  }, [payment, statement.data]);

  const linkedReversal = useMemo(() => {
    if (!payment?.reversed_by_payment_id) {
      return null;
    }
    return (
      (statement.data?.payments ?? []).find((item) => item.id === payment.reversed_by_payment_id) ?? null
    );
  }, [payment, statement.data]);

  const refundedTotal = useMemo(
    () => sumMoney(linkedRefunds.map((item) => item.amount_inr)),
    [linkedRefunds],
  );
  const netAfterCorrection = useMemo(() => {
    if (!payment) {
      return "0.00";
    }
    if (payment.status === "reversed" || payment.reversed_by_payment_id) {
      return "0.00";
    }
    return subtractMoney(payment.amount_inr, refundedTotal);
  }, [payment, refundedTotal]);

  const isReversed = Boolean(payment && (payment.status === "reversed" || payment.reversed_by_payment_id));
  const isRefunded = Boolean(payment && payment.kind === "collection" && linkedRefunds.length > 0);
  const hasCorrection = isReversed || isRefunded;
  /** Statement still loading: do not offer More until we know whether refunds exist. */
  const correctionsPending =
    Boolean(payment?.kind === "collection" && payment.status === "posted" && !isReversed) &&
    statement.isLoading &&
    !statement.data;
  const canCorrect =
    staffHasPermission(staff, "refunds.approve") &&
    payment?.kind === "collection" &&
    payment.status === "posted" &&
    !hasCorrection &&
    !correctionsPending;

  useEffect(() => {
    if (!paymentId) {
      setView("detail");
      setReason("");
      setReasonTouched(false);
    }
  }, [paymentId]);

  useEffect(() => {
    if (!payment || view === "detail") {
      return;
    }
    setReason("");
    setReasonTouched(false);
    setAmount(payment.amount_inr);
    setMethod(payment.method);
    setIdempotencyKey(newPaymentIdempotencyKey());
  }, [payment, view]);

  const correction = useMutation({
    mutationFn: async () => {
      if (!payment) {
        throw new Error("Choose a payment.");
      }
      const token = await paymentAccessToken();
      if (view === "refund") {
        return refundPaymentRequest(
          token,
          payment.id,
          {
            amount_inr: amount.trim() || undefined,
            reason: reason.trim(),
            method,
          },
          idempotencyKey,
        );
      }
      return reversePaymentRequest(token, payment.id, { reason: reason.trim() }, idempotencyKey);
    },
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["payments"] }),
        queryClient.invalidateQueries({ queryKey: ["invoices"] }),
        queryClient.invalidateQueries({ queryKey: ["customers"] }),
        queryClient.invalidateQueries({
          queryKey: ["payments", "detail", staff.membership.organization_id, paymentId ?? ""],
        }),
      ]);
      setView("detail");
      if (view === "refund") {
        toast.success(`Refund recorded · ${result.receipt_number ?? "saved"}`);
      } else {
        toast.success(`Reversal recorded · ${result.receipt_number ?? "saved"}`);
      }
    },
  });

  const canSubmitCorrection =
    Boolean(payment) && reason.trim().length > 0 && !correction.isPending && (view === "reverse" || view === "refund");

  function close() {
    if (correction.isPending) {
      return;
    }
    setView("detail");
    onClose();
  }

  const receiptLabel = payment?.receipt_number ?? payment?.id.slice(0, 8) ?? "Receipt";

  return (
    <ModalOverlay
      isOpen={Boolean(paymentId)}
      onOpenChange={(open) => {
        if (!open) {
          close();
        }
      }}
      isDismissable={!correction.isPending}
    >
      <Modal className="max-w-lg">
        <Dialog className="flex max-h-[min(90vh,720px)] flex-col outline-hidden">
          {view === "detail" ? (
            <>
              <header className="flex shrink-0 flex-col gap-2 border-b-2 border-primary px-5 pt-5 pb-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <Heading slot="title" className="font-mono text-lg font-bold text-primary">
                      {payment?.receipt_number ?? (query.isLoading ? "…" : "Receipt")}
                    </Heading>
                    {payment ? (
                      <>
                        <Badge
                          color={isReversed ? "orange" : isRefunded ? "error" : "success"}
                          size="sm"
                        >
                          {isReversed ? "Reversed" : isRefunded ? "Refunded" : "Posted"}
                        </Badge>
                        <span className="text-sm text-tertiary">{paymentKindLabel(payment.kind)}</span>
                      </>
                    ) : null}
                  </div>
                  <Button
                    color="tertiary"
                    size="sm"
                    className="shrink-0"
                    aria-label="Close"
                    isDisabled={correction.isPending}
                    onPress={close}
                  >
                    <XClose className="size-5" aria-hidden />
                  </Button>
                </div>

                {query.isLoading ? (
                  <div className="flex flex-col gap-2">
                    <Skeleton className="h-8 w-40" />
                    <Skeleton className="h-4 w-56" />
                  </div>
                ) : null}

                {payment ? (
                  <div>
                    {hasCorrection ? (
                      <>
                        <MoneyText
                          amount={payment.amount_inr}
                          as="p"
                          className="text-display-sm font-bold text-quaternary line-through"
                        />
                        <p className="mt-1 text-sm text-tertiary">
                          Net <MoneyText amount={netAfterCorrection} className="font-semibold text-primary" />{" "}
                          after {isReversed ? "reversal" : "refund"}
                        </p>
                      </>
                    ) : (
                      <>
                        <MoneyText
                          amount={payment.amount_inr}
                          as="p"
                          sign={
                            payment.kind === "refund" || payment.kind === "reversal"
                              ? "debit"
                              : "auto"
                          }
                          className={cx(
                            "text-display-sm font-bold tabular-nums",
                            payment.kind !== "refund" &&
                              payment.kind !== "reversal" &&
                              "text-primary",
                          )}
                        />
                        <p className="mt-1 text-sm text-secondary">
                          {payment.kind === "refund"
                            ? "refunded via"
                            : payment.kind === "reversal"
                              ? "reversal of entry in"
                              : "received in"}{" "}
                          {methodPhrase(payment.method)} from{" "}
                          <strong className="text-primary">{payment.customer_display_name}</strong>
                        </p>
                      </>
                    )}
                  </div>
                ) : null}
              </header>

              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
                {query.isLoading ? (
                  <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading receipt">
                    <div className="grid grid-cols-3 overflow-hidden rounded-lg ring-1 ring-secondary">
                      {Array.from({ length: 3 }, (_, index) => (
                        <div
                          key={index}
                          className={cx(
                            "px-3 py-2.5",
                            index < 2 ? "border-r border-secondary" : "",
                          )}
                        >
                          <Skeleton className="h-3 w-14" />
                          <Skeleton className="mt-2 h-4 w-20" />
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-col gap-2">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-12 w-full rounded-lg" />
                      <Skeleton className="h-12 w-full rounded-lg" />
                    </div>
                    <Skeleton className="h-10 w-full rounded-lg" />
                  </div>
                ) : null}
                {query.isError ? (
                  <p className="text-sm text-error-primary" role="alert">
                    {paymentErrorMessage(query.error)}
                  </p>
                ) : null}

                {payment ? (
                  <>
                    {hasCorrection ? (
                      <div className="flex flex-col gap-2">
                        <p className="text-[10px] font-semibold tracking-wide text-primary uppercase">
                          History
                        </p>
                        <ul className="flex flex-col gap-1.5">
                          {linkedRefunds.map((item) => (
                            <li
                              key={item.id}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-secondary px-3 py-2 text-sm ring-1 ring-secondary"
                            >
                              <div className="min-w-0">
                                <p className="font-mono font-semibold text-primary">
                                  {item.receipt_number ?? item.id.slice(0, 8)}
                                </p>
                                <p className="text-xs text-tertiary">
                                  {paymentMethodLabel(item.method)}
                                  {item.reference ? ` · ${item.reference}` : ""}
                                </p>
                              </div>
                              <MoneyText
                                amount={item.amount_inr}
                                sign="debit"
                                className="font-bold"
                              />
                            </li>
                          ))}
                          {linkedReversal ? (
                            <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-secondary px-3 py-2 text-sm ring-1 ring-secondary">
                              <div className="min-w-0">
                                <p className="font-mono font-semibold text-primary">
                                  {linkedReversal.receipt_number ?? linkedReversal.id.slice(0, 8)}
                                </p>
                                <p className="text-xs text-tertiary">
                                  Reversal
                                  {linkedReversal.reference ? ` · ${linkedReversal.reference}` : ""}
                                </p>
                              </div>
                              <MoneyText
                                amount={linkedReversal.amount_inr}
                                sign="debit"
                                className="font-bold"
                              />
                            </li>
                          ) : null}
                          <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm text-tertiary ring-1 ring-secondary">
                            <span className="font-mono">
                              {payment.receipt_number ?? payment.id.slice(0, 8)} · original
                            </span>
                            <MoneyText amount={payment.amount_inr} className="text-quaternary line-through" />
                          </li>
                        </ul>
                        <p className="text-sm text-secondary" role="status">
                          {isReversed
                            ? "This payment was reversed. Refund and reverse cannot both apply."
                            : "This payment was refunded and cannot also be reversed."}
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-3 overflow-hidden rounded-lg ring-1 ring-primary">
                          <div className="border-r border-secondary px-3 py-2.5">
                            <p className="text-[10px] font-semibold tracking-wide text-tertiary uppercase">
                              Method
                            </p>
                            <p className="mt-1 text-sm font-semibold text-primary">
                              {paymentMethodLabel(payment.method)}
                            </p>
                          </div>
                          <div className="border-r border-secondary px-3 py-2.5">
                            <p className="text-[10px] font-semibold tracking-wide text-tertiary uppercase">
                              Business date
                            </p>
                            <p className="mt-1 text-sm font-semibold text-primary tabular-nums">
                              {formatDayLabel(payment.received_business_date)}
                            </p>
                          </div>
                          <div className="px-3 py-2.5">
                            <p className="text-[10px] font-semibold tracking-wide text-tertiary uppercase">
                              Reference
                            </p>
                            <p className="mt-1 text-sm font-semibold text-primary">
                              {payment.reference ?? "—"}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-col gap-2">
                          <p className="text-sm font-medium text-primary">Allocated to</p>
                          <ul className="flex flex-col gap-2">
                            {payment.allocations.map((allocation) => (
                              <li
                                key={allocation.id}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-secondary px-3 py-2 ring-1 ring-secondary"
                              >
                                <div className="min-w-0">
                                  <Button
                                    color="link-color"
                                    size="sm"
                                    href={`/invoices/${allocation.invoice_id}`}
                                    className="px-0 font-mono text-sm font-semibold"
                                  >
                                    {allocation.invoice_number ?? allocation.invoice_id.slice(0, 8)}
                                  </Button>
                                  <p className="text-xs text-tertiary tabular-nums">
                                    {formatDayLabel(allocation.business_date)}
                                  </p>
                                </div>
                                <MoneyText
                                  amount={allocation.amount_inr}
                                  className="text-sm font-bold text-primary"
                                />
                              </li>
                            ))}
                          </ul>
                        </div>

                        {payment.kind === "collection" ? (
                          <ReceiptDocumentsCard paymentId={payment.id} />
                        ) : null}
                        {payment.kind === "refund" ? (
                          <RefundDocumentsCard paymentId={payment.id} />
                        ) : null}
                      </>
                    )}
                  </>
                ) : null}
              </div>

              <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t-2 border-primary px-5 py-4">
                {query.isLoading ? (
                  <>
                    <Skeleton className="h-10 w-28 rounded-lg" />
                    <Skeleton className="h-10 w-24 rounded-lg" />
                    <Skeleton className="ml-auto h-10 w-20 rounded-lg" />
                  </>
                ) : null}
                {payment?.kind === "collection" && !isReversed ? (
                  <>
                    {isRefunded && linkedRefunds[0] ? (
                      <Button
                        color="primary"
                        size="md"
                        href={`/print/receipts/${linkedRefunds[0].id}`}
                        target="_blank"
                      >
                        Print refund slip
                      </Button>
                    ) : null}
                    {!hasCorrection && !correctionsPending ? (
                      <>
                        <Button
                          color="primary"
                          size="md"
                          href={`/print/receipts/${payment.id}?autoprint=1`}
                          target="_blank"
                        >
                          Print receipt
                        </Button>
                        <Button
                          color="secondary"
                          size="md"
                          href={`/print/receipts/${payment.id}`}
                          target="_blank"
                        >
                          Preview
                        </Button>
                      </>
                    ) : null}
                  </>
                ) : null}
                {correctionsPending ? (
                  <p className="ml-auto text-sm text-tertiary" role="status">
                    Checking corrections…
                  </p>
                ) : canCorrect ? (
                  <div className="ml-auto">
                    <Dropdown.Root>
                      <Button color="secondary" size="md">
                        More
                      </Button>
                      <Dropdown.Popover className="w-64">
                        <Dropdown.Menu
                          onAction={(key) => {
                            if (key === "refund") {
                              setView("refund");
                              return;
                            }
                            if (key === "reverse") {
                              setView("reverse");
                            }
                          }}
                        >
                          <Dropdown.Item
                            id="refund"
                            label="Refund…"
                            addon="Returns money already collected."
                          />
                          <Dropdown.Item
                            id="reverse"
                            label="Reverse…"
                            addon="Cancels an entry made by mistake."
                          />
                        </Dropdown.Menu>
                      </Dropdown.Popover>
                    </Dropdown.Root>
                  </div>
                ) : payment && !query.isLoading ? (
                  <Button color="secondary" size="md" className="ml-auto" onPress={close}>
                    Close
                  </Button>
                ) : null}
              </footer>
            </>
          ) : null}

          {view === "refund" && payment ? (
            <>
              <header className="flex shrink-0 flex-col gap-1 border-b-2 border-primary px-5 pt-5 pb-4">
                <button
                  type="button"
                  className="flex items-center gap-1 self-start text-sm font-semibold text-brand-secondary"
                  disabled={correction.isPending}
                  onClick={() => setView("detail")}
                >
                  <ChevronLeft className="size-4" aria-hidden />
                  <span className="font-mono">{receiptLabel}</span>
                </button>
                <Heading slot="title" className="text-lg font-bold text-primary">
                  Refund payment
                </Heading>
                <p className="text-sm text-tertiary">
                  Returns money already collected. Writes a linked refund entry.
                </p>
              </header>
              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
                <MoneyInput
                  label="Amount"
                  value={amount}
                  onChange={setAmount}
                  isDisabled={correction.isPending}
                  hint={`Up to ${formatInr(payment.amount_inr)}`}
                />
                <MethodSelect
                  label="Paid out by"
                  value={method}
                  onChange={setMethod}
                  isDisabled={correction.isPending}
                />
                <TextArea
                  label="Reason"
                  value={reason}
                  onChange={(value) => {
                    setReason(value);
                    setReasonTouched(true);
                  }}
                  rows={3}
                  isRequired
                  isDisabled={correction.isPending}
                  isInvalid={reasonTouched && reason.trim().length === 0}
                  error={
                    reasonTouched && reason.trim().length === 0
                      ? "Enter a reason for the audit record."
                      : undefined
                  }
                />
                <div className="overflow-hidden rounded-lg ring-1 ring-primary">
                  <div className="border-b border-primary px-2.5 py-1.5 text-[10px] font-semibold tracking-wide text-primary uppercase">
                    What happens
                  </div>
                  <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 px-2.5 py-2 text-sm">
                    <dt className="text-tertiary">Cash out</dt>
                    <dd>
                      <MoneyText amount={amount || payment.amount_inr} className="inline font-bold" /> to the
                      customer
                    </dd>
                    {payment.allocations.map((allocation) => (
                      <div key={allocation.id} className="contents">
                        <dt className="font-mono text-tertiary">
                          {allocation.invoice_number ?? allocation.invoice_id.slice(0, 8)}
                        </dt>
                        <dd>
                          due goes back by up to{" "}
                          <MoneyText amount={allocation.amount_inr} className="inline font-medium" />
                        </dd>
                      </div>
                    ))}
                    <dt className="font-mono text-tertiary">{receiptLabel}</dt>
                    <dd>stays in history; can&apos;t also be reversed</dd>
                  </dl>
                </div>
                {correction.isError ? (
                  <p className="text-sm text-error-primary" role="alert">
                    {paymentErrorMessage(correction.error)}
                  </p>
                ) : null}
              </div>
              <footer className="flex shrink-0 gap-2 border-t-2 border-primary px-5 py-4">
                <Button
                  color="primary-destructive"
                  size="md"
                  isDisabled={!canSubmitCorrection}
                  isLoading={correction.isPending}
                  onPress={() => correction.mutate()}
                >
                  Refund {formatInr(amount || payment.amount_inr)}
                </Button>
                <Button
                  color="secondary"
                  size="md"
                  isDisabled={correction.isPending}
                  onPress={() => setView("detail")}
                >
                  Back
                </Button>
              </footer>
            </>
          ) : null}

          {view === "reverse" && payment ? (
            <>
              <header className="flex shrink-0 flex-col gap-1 border-b-2 border-primary px-5 pt-5 pb-4">
                <button
                  type="button"
                  className="flex items-center gap-1 self-start text-sm font-semibold text-brand-secondary"
                  disabled={correction.isPending}
                  onClick={() => setView("detail")}
                >
                  <ChevronLeft className="size-4" aria-hidden />
                  <span className="font-mono">{receiptLabel}</span>
                </button>
                <Heading slot="title" className="text-lg font-bold text-primary">
                  Reverse payment
                </Heading>
                <p className="text-sm text-tertiary">
                  Use when this entry was recorded by mistake. No money moves; a linked reversal cancels it.
                </p>
              </header>
              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
                <TextArea
                  label="Reason"
                  value={reason}
                  onChange={(value) => {
                    setReason(value);
                    setReasonTouched(true);
                  }}
                  rows={3}
                  isRequired
                  isDisabled={correction.isPending}
                  isInvalid={reasonTouched && reason.trim().length === 0}
                  error={
                    reasonTouched && reason.trim().length === 0
                      ? "Enter a reason for the audit record."
                      : undefined
                  }
                />
                <div className="overflow-hidden rounded-lg ring-1 ring-primary">
                  <div className="border-b border-primary px-2.5 py-1.5 text-[10px] font-semibold tracking-wide text-primary uppercase">
                    What happens
                  </div>
                  <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 px-2.5 py-2 text-sm">
                    <dt className="text-tertiary">Money</dt>
                    <dd>none moves (use Refund if cash goes back)</dd>
                    {payment.allocations.map((allocation) => (
                      <div key={allocation.id} className="contents">
                        <dt className="font-mono text-tertiary">
                          {allocation.invoice_number ?? allocation.invoice_id.slice(0, 8)}
                        </dt>
                        <dd>
                          due goes back by{" "}
                          <MoneyText amount={allocation.amount_inr} className="inline font-medium" />
                        </dd>
                      </div>
                    ))}
                    <dt className="text-tertiary">Collections</dt>
                    <dd>
                      the {formatDayLabel(payment.received_business_date)} cash total drops by{" "}
                      <MoneyText amount={payment.amount_inr} className="inline font-medium" />
                    </dd>
                    <dt className="font-mono text-tertiary">{receiptLabel}</dt>
                    <dd>stays in history; can&apos;t also be refunded</dd>
                  </dl>
                </div>
                {correction.isError ? (
                  <p className="text-sm text-error-primary" role="alert">
                    {paymentErrorMessage(correction.error)}
                  </p>
                ) : null}
              </div>
              <footer className="flex shrink-0 gap-2 border-t-2 border-primary px-5 py-4">
                <Button
                  color="primary-destructive"
                  size="md"
                  isDisabled={!canSubmitCorrection}
                  isLoading={correction.isPending}
                  onPress={() => correction.mutate()}
                >
                  Reverse {receiptLabel}
                </Button>
                <Button
                  color="secondary"
                  size="md"
                  isDisabled={correction.isPending}
                  onPress={() => setView("detail")}
                >
                  Back
                </Button>
              </footer>
            </>
          ) : null}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
