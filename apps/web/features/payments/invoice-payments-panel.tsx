"use client";

import { useQuery } from "@tanstack/react-query";

import { PanelSkeleton } from "@/components/application/skeleton/skeleton";
import { Badge } from "@/components/base/badges/badges";
import { useStaff } from "@/features/auth/staff-shell";
import { paymentAccessToken, paymentErrorMessage, paymentKindLabel } from "@/features/payments/payment-shared";
import { formatInr } from "@/lib/money";
import { paymentMethodLabel } from "@/lib/payment-methods";
import { fetchInvoicePayments } from "@/lib/staff-api";

/** Allocations and receipts posted against one invoice. Reads only; posting lives on Payments. */
export function InvoicePaymentsPanel({ invoiceId }: { invoiceId: string }) {
  const staff = useStaff();
  const query = useQuery({
    queryKey: ["payments", "invoice", staff.membership.organization_id, invoiceId],
    queryFn: async () => fetchInvoicePayments(await paymentAccessToken(), invoiceId),
    enabled: Boolean(invoiceId),
  });

  const data = query.data;

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-primary p-4 shadow-xs ring-1 ring-secondary md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-primary">Collections</h2>
        {data ? (
          <Badge color={data.amount_due_inr === "0.00" ? "success" : "warning"} size="sm">
            {data.amount_due_inr === "0.00" ? "Settled" : `Due ${formatInr(data.amount_due_inr)}`}
          </Badge>
        ) : null}
      </div>

      {query.isLoading ? <PanelSkeleton rows={3} showTitle={false} label="Loading collections" /> : null}
      {query.isError ? (
        <p className="text-sm text-error-primary" role="alert">
          {paymentErrorMessage(query.error)}
        </p>
      ) : null}

      {data && data.items.length === 0 ? (
        <p className="text-sm text-tertiary">
          No collection is recorded against this invoice yet. Received amounts appear only after the server confirms
          them.
        </p>
      ) : null}

      {data && data.items.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {data.items.map((payment) => {
            const allocation = payment.allocations.find((item) => item.invoice_id === invoiceId);
            return (
              <li
                key={payment.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-secondary px-3 py-2 ring-1 ring-secondary"
              >
                <span className="font-mono text-sm text-primary">{payment.receipt_number ?? "Receipt pending"}</span>
                <span className="text-xs text-tertiary">{paymentKindLabel(payment.kind)}</span>
                <span className="text-xs tabular-nums text-tertiary">{payment.received_business_date}</span>
                <span className="text-sm text-tertiary">{paymentMethodLabel(payment.method)}</span>
                <span className="text-sm font-medium tabular-nums text-primary">
                  {formatInr(allocation?.amount_inr ?? payment.amount_inr)}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}

      {data ? (
        <p className="text-xs text-tertiary">
          Allocated {formatInr(data.allocated_inr)} of {formatInr(data.grand_total_inr)}. Receipt documents are queued
          after commit.
        </p>
      ) : null}
    </div>
  );
}
