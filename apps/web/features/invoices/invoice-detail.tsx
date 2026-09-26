"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import type { InvoiceLine, Payment } from "@aabhushan/contracts";

import {
  InvoiceFinalizedDetailSkeleton,
  PosWorkspaceSkeleton,
} from "@/components/application/skeleton/skeleton";
import { Table, TableCard } from "@/components/application/table/table";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Dropdown } from "@/components/base/dropdown/dropdown";
import { MoneyText } from "@/components/shared/money-text";
import { StaffPageHeader } from "@/components/shared/staff-page-header";
import { staffHasPermission, useStaff } from "@/features/auth/staff-shell";
import { CreditNoteDocumentsCard } from "@/features/invoices/credit-note-documents-card";
import { InvoiceCorrectionsCard } from "@/features/invoices/invoice-corrections-card";
import { InvoiceDocumentsCard } from "@/features/invoices/invoice-documents-card";
import {
  compareMoney,
  formatMetalPurityLabel,
  invoiceAccessToken,
  invoiceErrorMessage,
  invoicePaymentBadge,
  isZeroMoney,
  lineArticleTitle,
} from "@/features/invoices/invoice-shared";
import { PosWorkspace } from "@/features/invoices/pos-workspace";
import { ReturnArticleDialog } from "@/features/invoices/return-article-dialog";
import { InvoicePaymentsPanel } from "@/features/payments/invoice-payments-panel";
import { PaymentCorrectionDialog } from "@/features/payments/payment-correction-dialog";
import { formatInr } from "@/lib/money";
import {
  fetchCustomer,
  fetchInvoice,
  fetchInvoiceCorrections,
  fetchInvoicePayments,
} from "@/lib/staff-api";
import { paymentAccessToken } from "@/features/payments/payment-shared";
import { cx } from "@/utils/cx";

export function InvoiceDetail({ invoiceId }: { invoiceId: string }) {
  return (
    <Suspense fallback={<PosWorkspaceSkeleton label="Loading invoice" />}>
      <InvoiceDetailBody invoiceId={invoiceId} />
    </Suspense>
  );
}

function MoneyBandCell({
  label,
  amount,
  inverted,
  emphasizeError,
}: {
  label: string;
  amount: string;
  inverted?: boolean;
  emphasizeError?: boolean;
}) {
  const zero = isZeroMoney(amount);
  return (
    <div
      className={cx(
        "px-5 py-4",
        inverted ? "bg-primary-solid text-white" : "border-r border-secondary last:border-r-0",
      )}
    >
      <p
        className={cx(
          "text-sm font-semibold tracking-wide uppercase",
          inverted ? "text-white/70" : "text-tertiary",
        )}
      >
        {label}
      </p>
      {zero ? (
        <p className={cx("mt-1 text-xl font-bold", inverted ? "text-white/50" : "text-quaternary")}>—</p>
      ) : (
        <MoneyText
          amount={amount}
          as="p"
          className={cx(
            "mt-1 text-xl font-bold",
            inverted ? "text-white" : emphasizeError ? "text-error-primary" : "text-primary",
          )}
        />
      )}
    </div>
  );
}

function InvoiceDetailBody({ invoiceId }: { invoiceId: string }) {
  const staff = useStaff();
  const router = useRouter();
  const searchParams = useSearchParams();
  const allowed = staffHasPermission(staff, "billing.write");
  const canRefund = staffHasPermission(staff, "refunds.approve");
  const [returnLine, setReturnLine] = useState<InvoiceLine | null>(null);
  const [creditStripAmount, setCreditStripAmount] = useState<string | null>(null);
  const [creditStripDismissed, setCreditStripDismissed] = useState(false);
  const [refundPayment, setRefundPayment] = useState<Payment | null>(null);
  const [pickCollectionOpen, setPickCollectionOpen] = useState(false);
  const saleDone = searchParams.get("sale") === "done";

  useEffect(() => {
    if (!allowed) {
      router.replace("/access-denied");
    }
  }, [allowed, router]);

  const query = useQuery({
    queryKey: ["invoices", staff.membership.organization_id, invoiceId],
    queryFn: async () => fetchInvoice(await invoiceAccessToken(), invoiceId),
    enabled: allowed,
  });

  const correctionsQuery = useQuery({
    queryKey: ["invoices", "corrections", staff.membership.organization_id, invoiceId],
    queryFn: async () => fetchInvoiceCorrections(await invoiceAccessToken(), invoiceId),
    enabled: allowed && query.data?.status === "finalized" && !saleDone,
  });

  const customerQuery = useQuery({
    queryKey: ["customers", staff.membership.organization_id, query.data?.customer_id ?? ""],
    queryFn: async () => fetchCustomer(await invoiceAccessToken(), query.data!.customer_id),
    enabled: allowed && Boolean(query.data?.customer_id) && query.data?.status === "finalized" && !saleDone,
  });

  const paymentsQuery = useQuery({
    queryKey: ["payments", "invoice", staff.membership.organization_id, invoiceId],
    queryFn: async () => fetchInvoicePayments(await paymentAccessToken(), invoiceId),
    enabled: allowed && query.data?.status === "finalized" && !saleDone,
  });

  const invoice = query.data;
  const credited = correctionsQuery.data?.credited_inr ?? "0.00";
  const returnedLineIds = useMemo(
    () =>
      new Set(
        (correctionsQuery.data?.returns ?? [])
          .filter((item) => item.status === "accepted")
          .map((item) => item.invoice_line_id),
      ),
    [correctionsQuery.data?.returns],
  );
  const collections = useMemo(
    () =>
      paymentsQuery.data?.items.filter(
        (item) => item.kind === "collection" && item.status === "posted" && !item.reversed_by_payment_id,
      ) ?? [],
    [paymentsQuery.data?.items],
  );
  const stripAmount =
    creditStripAmount ??
    (!isZeroMoney(credited) && returnedLineIds.size > 0 ? credited : null);
  const refundSeedAmount =
    stripAmount && refundPayment
      ? compareMoney(stripAmount, refundPayment.amount_inr) <= 0
        ? stripAmount
        : refundPayment.amount_inr
      : undefined;

  if (!allowed) {
    return null;
  }

  if (query.isLoading) {
    return <PosWorkspaceSkeleton label="Loading invoice" />;
  }

  if (query.isError || !invoice) {
    return (
      <p className="text-sm text-error-primary" role="alert">
        {invoiceErrorMessage(query.error)}
      </p>
    );
  }

  if (invoice.status === "draft" || (invoice.status === "finalized" && saleDone)) {
    return <PosWorkspace draftId={invoice.id} initialInvoice={invoice} />;
  }

  if (correctionsQuery.isLoading && !correctionsQuery.data) {
    return <InvoiceFinalizedDetailSkeleton label="Loading invoice" />;
  }

  const returnedCount = returnedLineIds.size;
  const paymentBadge = invoicePaymentBadge({
    amountDueInr: invoice.amount_due_inr,
    returnedLineCount: returnedCount,
    lineCount: invoice.lines.length,
  });
  const phone = customerQuery.data?.phone_display;
  const showCreditStrip = Boolean(stripAmount) && !creditStripDismissed && !isZeroMoney(stripAmount ?? "0");

  function openRefund() {
    if (collections.length === 0) {
      return;
    }
    if (collections.length === 1) {
      setRefundPayment(collections[0]!);
      return;
    }
    setPickCollectionOpen(true);
  }

  return (
    <section className="flex flex-col gap-6">
      <StaffPageHeader
        density="comfort"
        back={{ label: "Invoices", href: "/invoices" }}
        title={<span className="font-mono">{invoice.invoice_number}</span>}
        badge={
          <Badge color={paymentBadge.color} size="lg" appearance={paymentBadge.appearance}>
            {paymentBadge.label}
          </Badge>
        }
        description={
          <>
            {invoice.customer_display_name}
            {phone ? ` · ${phone}` : ""}
            {" · "}
            {invoice.business_date}
          </>
        }
        actions={
          <>
            <Button
              color="secondary"
              size="lg"
              href={`/print/invoices/${invoice.id}?autoprint=1`}
              target="_blank"
            >
              Print
            </Button>
            <Button color="secondary" size="lg" href="/invoices/new">
              New sale
            </Button>
            {staffHasPermission(staff, "payments.write") && !isZeroMoney(invoice.amount_due_inr) ? (
              <Button color="secondary" size="lg" href={`/payments?invoice=${invoice.id}`}>
                Record payment
              </Button>
            ) : null}
          </>
        }
      />

      {showCreditStrip && stripAmount ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-primary px-5 py-4 text-sm ring-2 ring-brand-solid">
          <span>
            <strong>{formatInr(stripAmount)} credit</strong> is available to {invoice.customer_display_name}.
            Refund it, or keep it as credit for a later sale.
          </span>
          {canRefund && collections.length > 0 ? (
            <Button color="primary" size="lg" className="ml-auto shrink-0" onPress={openRefund}>
              Refund…
            </Button>
          ) : (
            <span className="ml-auto" />
          )}
          <Button color="tertiary" size="lg" onPress={() => setCreditStripDismissed(true)}>
            Keep as credit
          </Button>
        </div>
      ) : null}

      <div className="grid grid-cols-2 overflow-hidden rounded-xl bg-primary ring-1 ring-primary lg:grid-cols-4">
        <MoneyBandCell label="Grand total" amount={invoice.grand_total_inr} inverted />
        <MoneyBandCell label="Paid" amount={invoice.amount_paid_inr} />
        <MoneyBandCell label="Credited" amount={credited} />
        <MoneyBandCell label="Due" amount={invoice.amount_due_inr} emphasizeError />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="flex flex-col gap-6">
          <TableCard.Root>
            <TableCard.Header title={`Lines · ${invoice.lines.length}`} />
            <Table aria-label="Invoice lines" size="md">
              <Table.Header>
                <Table.Head id="article" label="Article" isRowHeader />
                <Table.Head id="metal" label="Metal purity" className="w-28" />
                <Table.Head id="net" label="Net g" className="w-24 text-right" />
                <Table.Head id="line" label="Line total" className="w-28 text-right" />
                <Table.Head id="action" label="" className="w-14" />
              </Table.Header>
              <Table.Body items={invoice.lines}>
                {(line) => {
                  const returned = returnedLineIds.has(line.id);
                  const category = lineArticleTitle(line.description, line.article_number);
                  return (
                    <Table.Row id={line.id}>
                      <Table.Cell className="font-medium text-primary">
                        <span className="flex flex-col gap-0.5">
                          <span className="text-md font-bold">{category}</span>
                          <span className="font-mono text-sm font-normal text-tertiary">
                            {line.article_number}
                            {returned ? " · returned, under review" : ""}
                          </span>
                        </span>
                      </Table.Cell>
                      <Table.Cell className="text-md">
                        {formatMetalPurityLabel(line.metal, line.purity)}
                      </Table.Cell>
                      <Table.Cell className="text-right text-md tabular-nums">
                        {line.net_metal_weight_grams}
                      </Table.Cell>
                      <Table.Cell className="text-right text-md font-bold tabular-nums">
                        <MoneyText amount={line.line_total_inr} />
                      </Table.Cell>
                      <Table.Cell truncate={false}>
                        {returned ? null : (
                          <div
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                            }}
                          >
                            <Dropdown.Root>
                              <Dropdown.DotsButton
                                aria-label={`Actions for ${line.article_number}`}
                                className="flex size-10 items-center justify-center"
                              />
                              <Dropdown.Popover className="w-48">
                                <Dropdown.Menu
                                  onAction={(key) => {
                                    if (key === "return") {
                                      setReturnLine(line);
                                      return;
                                    }
                                    if (key === "open") {
                                      router.push(`/inventory/${line.article_id}`);
                                    }
                                  }}
                                >
                                  <Dropdown.Item id="return" label="Return article" />
                                  <Dropdown.Item id="open" label="Open article" />
                                </Dropdown.Menu>
                              </Dropdown.Popover>
                            </Dropdown.Root>
                          </div>
                        )}
                      </Table.Cell>
                    </Table.Row>
                  );
                }}
              </Table.Body>
            </Table>
            <div className="flex justify-end gap-4 border-t border-secondary px-5 py-4 text-sm text-tertiary">
              <span>Tax {formatInr(invoice.tax_inr)}</span>
              <span className="font-bold text-primary">Total {formatInr(invoice.grand_total_inr)}</span>
            </div>
          </TableCard.Root>

          <InvoicePaymentsPanel invoiceId={invoice.id} />
          <InvoiceCorrectionsCard invoiceId={invoice.id} />
        </div>

        <aside className="flex flex-col gap-4">
          <InvoiceDocumentsCard invoiceId={invoice.id} />
          {(correctionsQuery.data?.credit_notes.length ?? 0) > 0 ? (
            <CreditNoteDocumentsCard invoiceId={invoice.id} />
          ) : null}
        </aside>
      </div>

      <ReturnArticleDialog
        invoiceId={invoice.id}
        invoiceNumber={invoice.invoice_number}
        customerName={invoice.customer_display_name}
        grandTotalInr={invoice.grand_total_inr}
        alreadyCreditedInr={credited}
        remainingUnreturnedCount={invoice.lines.length - returnedCount}
        line={returnLine}
        onClose={() => setReturnLine(null)}
        onReturned={(amount) => {
          setCreditStripAmount(amount);
          setCreditStripDismissed(false);
        }}
      />

      {pickCollectionOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-primary p-5 shadow-lg ring-1 ring-secondary">
            <h2 className="text-lg font-semibold text-primary">Choose collection to refund</h2>
            <p className="mt-1 text-sm text-tertiary">
              This invoice has more than one collection. Pick which receipt to refund against.
            </p>
            <ul className="mt-3 flex flex-col gap-2">
              {collections.map((payment) => (
                <li key={payment.id}>
                  <Button
                    color="secondary"
                    size="lg"
                    className="w-full justify-between"
                    onPress={() => {
                      setRefundPayment(payment);
                      setPickCollectionOpen(false);
                    }}
                  >
                    <span className="font-mono">{payment.receipt_number ?? payment.id.slice(0, 8)}</span>
                    <MoneyText amount={payment.amount_inr} />
                  </Button>
                </li>
              ))}
            </ul>
            <Button
              color="tertiary"
              size="lg"
              className="mt-3"
              onPress={() => setPickCollectionOpen(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      <PaymentCorrectionDialog
        payment={refundPayment}
        action={refundPayment ? "refund" : null}
        initialRefundAmount={refundSeedAmount}
        onClose={() => setRefundPayment(null)}
      />
    </section>
  );
}
