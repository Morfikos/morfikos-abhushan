"use client";

import { useQuery } from "@tanstack/react-query";

import { PanelSkeleton } from "@/components/application/skeleton/skeleton";
import { Badge } from "@/components/base/badges/badges";
import { useStaff } from "@/features/auth/staff-shell";
import { MoneyText } from "@/components/shared/money-text";
import { formatInr } from "@/lib/money";
import {
  paymentAccessToken,
  paymentErrorMessage,
  paymentKindBadgeColor,
  paymentKindLabel,
} from "@/features/payments/payment-shared";
import { paymentMethodBadgeColor, paymentMethodLabel } from "@/lib/payment-methods";
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
  const collections = data?.items.filter((item) => item.kind === "collection") ?? [];

  return (
    <div className="overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-primary">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-primary px-5 py-4">
        <h2 className="text-md font-bold text-primary">Collections</h2>
        {data ? (
          <span className="text-sm font-semibold text-tertiary">
            Allocated {formatInr(data.allocated_inr)} of {formatInr(data.grand_total_inr)}
          </span>
        ) : null}
      </div>

      {query.isLoading ? (
        <div className="p-5">
          <PanelSkeleton rows={2} showTitle={false} chrome="bare" label="Loading collections" />
        </div>
      ) : null}
      {query.isError ? (
        <p className="px-5 py-4 text-sm text-error-primary" role="alert">
          {paymentErrorMessage(query.error)}
        </p>
      ) : null}

      {data && collections.length === 0 ? (
        <p className="px-5 py-4 text-sm text-tertiary">
          No collection is recorded against this invoice yet.
        </p>
      ) : null}

      {collections.length > 0 ? (
        <ul className="flex flex-col">
          {collections.map((payment) => {
            const allocation = payment.allocations.find((item) => item.invoice_id === invoiceId);
            return (
              <li
                key={payment.id}
                className="grid grid-cols-[7.5rem_minmax(0,1fr)_auto_7.5rem] items-center gap-3 border-b border-secondary px-5 py-3.5 text-sm last:border-b-0"
              >
                <span className="font-mono text-sm font-semibold text-primary">
                  {payment.receipt_number ?? "Receipt pending"}
                </span>
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <Badge color={paymentKindBadgeColor(payment.kind)} size="lg">
                    {paymentKindLabel(payment.kind)}
                  </Badge>
                  <Badge color={paymentMethodBadgeColor(payment.method)} size="lg">
                    {paymentMethodLabel(payment.method)}
                  </Badge>
                </div>
                <span className="text-sm text-tertiary">{payment.received_business_date}</span>
                <MoneyText
                  amount={allocation?.amount_inr ?? payment.amount_inr}
                  className="text-right text-md font-bold text-primary"
                />
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
