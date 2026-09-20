"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import type { InvoiceLine } from "@aabhushan/contracts";

import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import { Table, TableCard } from "@/components/application/table/table";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { staffHasPermission, useStaff } from "@/features/auth/staff-shell";
import { InvoiceCorrectionsCard } from "@/features/invoices/invoice-corrections-card";
import { formatInr, invoiceAccessToken, invoiceErrorMessage, isZeroMoney } from "@/features/invoices/invoice-shared";
import { PosWorkspace } from "@/features/invoices/pos-workspace";
import { ReturnArticleDialog } from "@/features/invoices/return-article-dialog";
import { InvoicePaymentsPanel } from "@/features/payments/invoice-payments-panel";
import { fetchInvoice, fetchInvoiceCorrections } from "@/lib/staff-api";

export function InvoiceDetail({ invoiceId }: { invoiceId: string }) {
  const staff = useStaff();
  const router = useRouter();
  const allowed = staffHasPermission(staff, "billing.write");
  const [returnLine, setReturnLine] = useState<InvoiceLine | null>(null);

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
    enabled: allowed && query.data?.status === "finalized",
  });

  if (!allowed) {
    return null;
  }

  if (query.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <LoadingIndicator label="Loading invoice" />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <p className="text-sm text-error-primary" role="alert">
        {invoiceErrorMessage(query.error)}
      </p>
    );
  }

  const invoice = query.data;
  if (invoice.status === "draft") {
    return <PosWorkspace draftId={invoice.id} />;
  }

  const returnedLineIds = new Set(
    (correctionsQuery.data?.returns ?? []).filter((item) => item.status === "accepted").map((item) => item.invoice_line_id),
  );

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h1 className="text-display-xs font-semibold text-primary">{invoice.invoice_number}</h1>
            <Badge color="success" size="sm">
              Finalized
            </Badge>
          </div>
          <p className="text-md text-tertiary">
            {invoice.customer_display_name} · {invoice.business_date}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {staffHasPermission(staff, "payments.write") && !isZeroMoney(invoice.amount_due_inr) ? (
            <Button color="primary" size="md" href={`/payments?invoice=${invoice.id}`}>
              Record payment
            </Button>
          ) : null}
          <Button
            color={staffHasPermission(staff, "payments.write") && !isZeroMoney(invoice.amount_due_inr) ? "secondary" : "primary"}
            size="md"
            href="/invoices/new"
          >
            New sale
          </Button>
          <Button color="secondary" size="md" href="/invoices">
            Back to list
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="flex flex-col gap-4">
          <TableCard.Root>
            <Table aria-label="Invoice lines">
              <Table.Header>
                <Table.Head id="article" label="Article" isRowHeader />
                <Table.Head id="metal" label="Metal" className="w-28" />
                <Table.Head id="net" label="Net g" className="w-24 text-right" />
                <Table.Head id="line" label="Line total" className="w-32 text-right" />
                <Table.Head id="action" label="Return" className="w-32" />
              </Table.Header>
              <Table.Body items={invoice.lines}>
                {(line) => {
                  const returned = returnedLineIds.has(line.id);
                  return (
                    <Table.Row id={line.id}>
                      <Table.Cell>
                        <div className="flex flex-col">
                          <span className="font-medium text-primary">{line.description}</span>
                          <span className="font-mono text-xs text-tertiary">{line.article_number}</span>
                        </div>
                      </Table.Cell>
                      <Table.Cell className="capitalize">
                        {line.metal} · {line.purity}
                      </Table.Cell>
                      <Table.Cell className="text-right tabular-nums">{line.net_metal_weight_grams}</Table.Cell>
                      <Table.Cell className="text-right tabular-nums">{formatInr(line.line_total_inr)}</Table.Cell>
                      <Table.Cell>
                        {returned ? (
                          <Badge color="warning" size="sm">
                            Under review
                          </Badge>
                        ) : (
                          <Button color="secondary" size="sm" onPress={() => setReturnLine(line)}>
                            Return article
                          </Button>
                        )}
                      </Table.Cell>
                    </Table.Row>
                  );
                }}
              </Table.Body>
            </Table>
          </TableCard.Root>

          <InvoicePaymentsPanel invoiceId={invoice.id} />
          <InvoiceCorrectionsCard invoiceId={invoice.id} />
        </div>

        <aside className="flex flex-col gap-2 rounded-xl bg-primary p-4 shadow-xs ring-1 ring-secondary">
          <h2 className="text-lg font-semibold text-primary">Snapshot</h2>
          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-tertiary">Grand total</dt>
              <dd className="font-semibold tabular-nums">{formatInr(invoice.grand_total_inr)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-tertiary">Credited</dt>
              <dd className="tabular-nums">{formatInr(correctionsQuery.data?.credited_inr ?? "0.00")}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-tertiary">Paid</dt>
              <dd className="tabular-nums">{formatInr(invoice.amount_paid_inr)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-tertiary">Due</dt>
              <dd className="tabular-nums">{formatInr(invoice.amount_due_inr)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-tertiary">Policy</dt>
              <dd className="text-right">{invoice.calculation_policy_version ?? "—"}</dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-tertiary">
            Credits reduce due. Refunds return money already collected. Issued invoice lines stay unchanged.
          </p>
        </aside>
      </div>

      <ReturnArticleDialog
        invoiceId={invoice.id}
        invoiceNumber={invoice.invoice_number}
        line={returnLine}
        onClose={() => setReturnLine(null)}
      />
    </section>
  );
}
