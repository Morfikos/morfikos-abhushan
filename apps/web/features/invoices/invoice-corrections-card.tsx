"use client";

import { useQuery } from "@tanstack/react-query";

import { PanelSkeleton } from "@/components/application/skeleton/skeleton";
import { MoneyText } from "@/components/shared/money-text";
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
  const refundsAndReversals = data?.payments.filter((item) => item.kind !== "collection") ?? [];
  const correctionCount =
    (data?.returns.length ?? 0) + (data?.credit_notes.length ?? 0) + refundsAndReversals.length;
  const isEmpty = data && correctionCount === 0;

  if (query.isLoading) {
    return (
      <div className="rounded-xl bg-primary p-5 shadow-xs ring-1 ring-secondary">
        <PanelSkeleton rows={2} showTitle={false} chrome="bare" label="Loading corrections" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <p className="text-sm text-error-primary" role="alert">
        {invoiceErrorMessage(query.error)}
      </p>
    );
  }

  if (isEmpty) {
    return (
      <div className="flex justify-between gap-3 rounded-xl border border-dashed border-tertiary px-5 py-4 text-sm text-tertiary">
        <span>
          <strong className="text-primary">Corrections</strong> · None yet. Returns, credits, refunds and
          reversals appear here.
        </span>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-primary">
      <div className="border-b-2 border-primary px-5 py-4">
        <h2 className="text-md font-bold text-primary">Corrections · {correctionCount}</h2>
      </div>

      <ul className="flex flex-col">
        {data?.returns.map((item) => {
          const credit = data.credit_notes.find((note) => note.return_id === item.id);
          return (
            <li
              key={item.id}
              className="grid grid-cols-[7.5rem_minmax(0,1fr)_auto_7.5rem] items-center gap-3 border-b border-secondary px-5 py-3.5 text-sm last:border-b-0"
            >
              <span className="font-mono text-sm font-semibold text-primary">
                {item.id.slice(0, 8).toUpperCase()}
              </span>
              <span className="min-w-0 text-sm text-primary">
                Return · {item.article_description || item.article_number} → Under review
                {credit ? (
                  <span className="mt-0.5 block text-sm text-tertiary">
                    Credit {credit.credit_note_number}
                  </span>
                ) : null}
              </span>
              <span className="text-sm text-tertiary">
                {new Date(item.created_at).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </span>
              <span className="text-right text-quaternary">—</span>
            </li>
          );
        })}
        {data?.credit_notes.map((note) => (
          <li
            key={note.id}
            className="grid grid-cols-[7.5rem_minmax(0,1fr)_auto_7.5rem] items-center gap-3 border-b border-secondary px-5 py-3.5 text-sm last:border-b-0"
          >
            <span className="font-mono text-sm font-semibold text-primary">{note.credit_note_number}</span>
            <span className="text-sm text-primary">Credit note · reduces due, not cash</span>
            <span className="text-sm text-tertiary">
              {new Date(note.issued_at).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </span>
            <MoneyText amount={note.amount_inr} className="text-right text-md font-bold text-primary" />
          </li>
        ))}
        {refundsAndReversals.map((payment) => (
          <li
            key={payment.id}
            className="grid grid-cols-[7.5rem_minmax(0,1fr)_auto_7.5rem] items-center gap-3 border-b border-secondary px-5 py-3.5 text-sm last:border-b-0"
          >
            <span className="font-mono text-sm font-semibold text-primary">
              {payment.receipt_number ?? payment.id.slice(0, 8)}
            </span>
            <span className="text-sm text-primary">{paymentKindLabel(payment.kind)}</span>
            <span className="text-sm text-tertiary">{payment.received_business_date}</span>
            <MoneyText amount={payment.amount_inr} className="text-right text-md font-bold text-primary" />
          </li>
        ))}
      </ul>

      {data ? (
        <p className="border-t border-secondary px-5 py-3.5 text-sm text-tertiary">
          Credited {formatInr(data.credited_inr)}. Net collected {formatInr(data.net_collected_inr)}.
        </p>
      ) : null}
    </div>
  );
}
