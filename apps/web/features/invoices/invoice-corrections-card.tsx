"use client";

import { useQuery } from "@tanstack/react-query";

import { PanelSkeleton } from "@/components/application/skeleton/skeleton";
import { Badge } from "@/components/base/badges/badges";
import { useStaff } from "@/features/auth/staff-shell";
import { formatInr, invoiceAccessToken, invoiceErrorMessage } from "@/features/invoices/invoice-shared";
import { paymentKindLabel } from "@/features/payments/payment-shared";
import { fetchInvoiceCorrections } from "@/lib/staff-api";

export function InvoiceCorrectionsCard({ invoiceId }: { invoiceId: string }) {
  const staff = useStaff();
  const query = useQuery({
    queryKey: ["invoices", "corrections", staff.membership.organization_id, invoiceId],
    queryFn: async () => fetchInvoiceCorrections(await invoiceAccessToken(), invoiceId),
    enabled: Boolean(invoiceId),
  });

  const data = query.data;

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-primary p-4 shadow-xs ring-1 ring-secondary md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-primary">Corrections</h2>
        {data ? (
          <Badge color="gray" size="sm" type="modern">
            {String(data.returns.length + data.credit_notes.length)} recorded
          </Badge>
        ) : null}
      </div>

      {query.isLoading ? <PanelSkeleton rows={3} showTitle={false} label="Loading corrections" /> : null}
      {query.isError ? (
        <p className="text-sm text-error-primary" role="alert">
          {invoiceErrorMessage(query.error)}
        </p>
      ) : null}

      {data && data.returns.length === 0 && data.credit_notes.length === 0 && data.payments.every((item) => item.kind === "collection") ? (
        <p className="text-sm text-tertiary">No return, credit, refund, or reversal is linked to this invoice yet.</p>
      ) : null}

      {data && data.returns.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {data.returns.map((item) => {
            const credit = data.credit_notes.find((note) => note.return_id === item.id);
            return (
              <li key={item.id} className="flex flex-col gap-1 rounded-lg bg-secondary px-3 py-2 ring-1 ring-secondary">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-primary">Return · {item.article_number}</span>
                  <Badge color="warning" size="sm">
                    Under review
                  </Badge>
                </div>
                <p className="text-xs text-tertiary">{item.article_description}</p>
                {credit ? (
                  <p className="text-sm tabular-nums text-primary">
                    Credit {credit.credit_note_number} · {formatInr(credit.amount_inr)}
                  </p>
                ) : null}
                <p className="text-xs text-tertiary">{item.reason}</p>
              </li>
            );
          })}
        </ul>
      ) : null}

      {data
        ? data.payments
            .filter((payment) => payment.kind !== "collection")
            .map((payment) => (
              <div
                key={payment.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-secondary px-3 py-2 ring-1 ring-secondary"
              >
                <span className="text-sm font-medium text-primary">{paymentKindLabel(payment.kind)}</span>
                <span className="font-mono text-xs text-tertiary">{payment.receipt_number ?? "Document pending"}</span>
                <span className="text-sm tabular-nums text-primary">{formatInr(payment.amount_inr)}</span>
              </div>
            ))
        : null}

      {data ? (
        <p className="text-xs text-tertiary">
          Credited {formatInr(data.credited_inr)}. Net collected {formatInr(data.net_collected_inr)}. Credits reduce due;
          refunds are money returned.
        </p>
      ) : null}
    </div>
  );
}
