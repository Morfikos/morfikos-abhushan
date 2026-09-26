"use client";

import { useQuery } from "@tanstack/react-query";
import { ShoppingBag03 } from "@untitledui/icons";

import { EmptyState } from "@/components/application/empty-state/empty-state";
import { CustomerSalesPanelSkeleton } from "@/components/application/skeleton/skeleton";
import { Table, TableCard } from "@/components/application/table/table";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { staffHasPermission, useStaff } from "@/features/auth/staff-shell";
import { paymentAccessToken, paymentErrorMessage, paymentKindLabel } from "@/features/payments/payment-shared";
import { MoneyText } from "@/components/shared/money-text";
import { paymentMethodLabel } from "@/lib/payment-methods";
import { fetchCustomerSalesStatement } from "@/lib/staff-api";

/**
 * Sales dues and collection history for one customer. Girvi principal and
 * interest never appear here, so a Girvi-only customer reads zero sales due.
 */
export function CustomerSalesPanel({ customerId }: { customerId: string }) {
  const staff = useStaff();
  const canRecord = staffHasPermission(staff, "payments.write");
  const query = useQuery({
    queryKey: ["payments", "statement", staff.membership.organization_id, customerId],
    queryFn: async () => fetchCustomerSalesStatement(await paymentAccessToken(), customerId),
    enabled: Boolean(customerId),
  });

  if (query.isLoading) {
    return <CustomerSalesPanelSkeleton label="Loading sales statement" />;
  }

  if (query.isError) {
    return (
      <p className="text-sm text-error-primary" role="alert">
        {paymentErrorMessage(query.error)}
      </p>
    );
  }

  const statement = query.data;
  if (!statement) {
    return null;
  }

  if (statement.finalized_invoice_count === 0 && statement.payments.length === 0) {
    return (
      <EmptyState size="md" className="mx-auto py-10">
        <EmptyState.Header pattern="none">
          <div className="mb-3 flex size-12 items-center justify-center rounded-lg bg-secondary ring-1 ring-secondary ring-inset">
            <ShoppingBag03 className="size-6 text-fg-quaternary" aria-hidden="true" />
          </div>
          <EmptyState.Content>
            <p className="text-lg font-semibold text-primary">No sales yet</p>
            <EmptyState.Description>
              Finalized invoices, dues, and collections appear here. This section stays separate from Girvi.
            </EmptyState.Description>
          </EmptyState.Content>
        </EmptyState.Header>
      </EmptyState>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-primary p-4 shadow-xs ring-1 ring-secondary md:p-5">
        <div>
          <p className="text-sm text-tertiary">Sales due</p>
          <MoneyText amount={statement.sales_due_inr} as="p" className="text-display-xs font-semibold text-primary" />
          <p className="text-xs text-tertiary">
            Sales only. Girvi principal and interest are shown on the Girvi tab.
          </p>
        </div>
        {canRecord && statement.outstanding_invoices.length > 0 ? (
          <Button color="primary" size="md" href={`/payments?customer=${customerId}`}>
            Record payment
          </Button>
        ) : null}
      </div>

      {statement.outstanding_invoices.length > 0 ? (
        <TableCard.Root>
          <TableCard.Header
            title="Outstanding invoices"
            badge={String(statement.outstanding_invoices.length)}
          />
          <Table aria-label="Outstanding invoices">
            <Table.Header>
              <Table.Head id="number" label="Invoice" isRowHeader className="w-36" />
              <Table.Head id="date" label="Business date" className="w-36" />
              <Table.Head id="total" label="Total" className="w-32 text-right" />
              <Table.Head id="paid" label="Paid" className="w-32 text-right" />
              <Table.Head id="due" label="Due" className="w-32 text-right" />
            </Table.Header>
            <Table.Body items={statement.outstanding_invoices}>
              {(invoice) => (
                <Table.Row
                  id={invoice.invoice_id}
                  href={`/invoices/${invoice.invoice_id}`}
                  className="cursor-pointer"
                >
                  <Table.Cell className="font-mono text-sm">{invoice.invoice_number ?? "—"}</Table.Cell>
                  <Table.Cell className="tabular-nums">{invoice.business_date}</Table.Cell>
                  <Table.Cell className="text-right">
                    <MoneyText amount={invoice.grand_total_inr} className="text-right" />
                  </Table.Cell>
                  <Table.Cell className="text-right">
                    <MoneyText amount={invoice.amount_paid_inr} className="text-right" />
                  </Table.Cell>
                  <Table.Cell className="text-right">
                    <MoneyText amount={invoice.amount_due_inr} className="text-right font-medium" />
                  </Table.Cell>
                </Table.Row>
              )}
            </Table.Body>
          </Table>
        </TableCard.Root>
      ) : (
        <p className="text-sm text-tertiary">No unpaid sales invoice for this customer.</p>
      )}

      <div className="flex flex-col gap-3 rounded-xl bg-primary p-4 shadow-xs ring-1 ring-secondary md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-semibold text-primary">Credits</h3>
          <Badge color="gray" size="sm">
            {statement.credit_notes.length} recorded
          </Badge>
        </div>
        {statement.credit_notes.length === 0 ? (
          <p className="text-sm text-tertiary">
            No credit note is linked to this customer yet. Credits reduce invoice due; they are not a cash refund.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {statement.credit_notes.map((note) => (
              <li
                key={note.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-secondary px-3 py-2 ring-1 ring-secondary"
              >
                <span className="font-mono text-sm text-primary">{note.credit_note_number}</span>
                <span className="text-sm text-tertiary">Credit</span>
                <span className="font-mono text-xs text-tertiary">{note.invoice_number ?? note.invoice_id.slice(0, 8)}</span>
                <MoneyText amount={note.amount_inr} className="text-sm font-medium text-primary" />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-xl bg-primary p-4 shadow-xs ring-1 ring-secondary md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-semibold text-primary">Payment history</h3>
          <Badge color="gray" size="sm">
            {statement.payments.length} recorded
          </Badge>
        </div>
        {statement.payments.length === 0 ? (
          <p className="text-sm text-tertiary">No collection recorded for this customer yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {statement.payments.map((payment) => (
              <li
                key={payment.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-secondary px-3 py-2 ring-1 ring-secondary"
              >
                <span className="font-mono text-sm text-primary">{payment.receipt_number ?? "Receipt pending"}</span>
                <span className="text-xs text-tertiary">{paymentKindLabel(payment.kind)}</span>
                <span className="text-xs tabular-nums text-tertiary">{payment.received_business_date}</span>
                <span className="text-sm text-tertiary">{paymentMethodLabel(payment.method)}</span>
                <MoneyText amount={payment.amount_inr} className="text-sm font-medium text-primary" />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
