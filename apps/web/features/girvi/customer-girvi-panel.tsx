"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Scale01 } from "@untitledui/icons";

import { EmptyState } from "@/components/application/empty-state/empty-state";
import { TableSkeleton } from "@/components/application/skeleton/skeleton";
import { Table, TableCard } from "@/components/application/table/table";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { staffHasPermission, useStaff } from "@/features/auth/staff-shell";
import {
  girviAccessToken,
  girviErrorMessage,
  girviStatusLabel,
} from "@/features/girvi/girvi-shared";
import { MoneyText } from "@/components/shared/money-text";
import { formatInr } from "@/lib/money";
import { fetchGirviAccounts } from "@/lib/staff-api";

/**
 * Girvi accounts for one customer. Requires girvi.write — there is no girvi.read,
 * so billing staff see a restricted note instead of a 403 from the list API.
 */
export function CustomerGirviPanel({ customerId }: { customerId: string }) {
  const staff = useStaff();
  const canGirvi = staffHasPermission(staff, "girvi.write");

  const query = useQuery({
    queryKey: ["girvi-accounts", staff.membership.organization_id, "customer", customerId],
    queryFn: async () =>
      fetchGirviAccounts(await girviAccessToken(), {
        page: 1,
        pageSize: 50,
        customerId,
        sort: "created_at",
        direction: "desc",
      }),
    enabled: canGirvi && Boolean(customerId),
  });

  if (!canGirvi) {
    return (
      <p className="text-sm text-tertiary">
        Girvi accounts are restricted to authorized staff. Loan amounts are not shown here.
      </p>
    );
  }

  if (query.isLoading) {
    return <TableSkeleton columns={5} rows={4} titleWidth="w-32" label="Loading Girvi accounts" />;
  }

  if (query.isError) {
    return (
      <p className="text-sm text-error-primary" role="alert">
        {girviErrorMessage(query.error)}
      </p>
    );
  }

  const items = query.data?.items ?? [];
  if (items.length === 0) {
    return (
      <EmptyState size="md" className="mx-auto py-10">
        <EmptyState.Header pattern="none">
          <div className="mb-3 flex size-12 items-center justify-center rounded-lg bg-secondary ring-1 ring-secondary ring-inset">
            <Scale01 className="size-6 text-fg-quaternary" aria-hidden="true" />
          </div>
          <EmptyState.Content>
            <p className="text-lg font-semibold text-primary">No Girvi accounts yet</p>
            <EmptyState.Description>
              Girvi loans and collateral stay on this tab, separate from sales dues.
            </EmptyState.Description>
          </EmptyState.Content>
        </EmptyState.Header>
        <EmptyState.Footer>
          <Button color="primary" size="md" href="/girvi/new">
            New Girvi
          </Button>
        </EmptyState.Footer>
      </EmptyState>
    );
  }

  return (
    <TableCard.Root>
      <TableCard.Header title="Girvi accounts" badge={String(items.length)} />
      <Table aria-label="Customer Girvi accounts">
        <Table.Header>
          <Table.Head id="account" label="Account" isRowHeader />
          <Table.Head id="principal" label="Principal" className="text-right" />
          <Table.Head id="outstanding" label="Principal / Interest due" className="text-right" />
          <Table.Head id="maturity" label="Maturity" />
          <Table.Head id="status" label="Status" />
          <Table.Head id="open" label="" />
        </Table.Header>
        <Table.Body items={items}>
          {(item) => (
            <Table.Row id={item.id} href={`/girvi/${item.id}`} className="cursor-pointer">
              <Table.Cell>
                <span className="font-mono text-sm text-primary">{item.account_number}</span>
                <p className="text-xs text-tertiary">{item.collateral_count} packet(s)</p>
              </Table.Cell>
              <Table.Cell className="text-right">
                <MoneyText amount={item.principal_inr} className="text-right" />
              </Table.Cell>
              <Table.Cell className="text-right tabular-nums">
                {item.status === "draft" ? (
                  "—"
                ) : (
                  <>
                    <MoneyText amount={item.principal_outstanding_inr} className="text-primary" />
                    <p className="text-xs text-tertiary">
                      Interest {formatInr(item.interest_outstanding_inr)}
                    </p>
                  </>
                )}
              </Table.Cell>
              <Table.Cell className="tabular-nums">{item.maturity_business_date}</Table.Cell>
              <Table.Cell>
                <Badge
                  color={item.is_overdue ? "warning" : item.status === "draft" ? "gray" : "success"}
                  size="sm"
                >
                  {girviStatusLabel(item.status, item.is_overdue)}
                </Badge>
              </Table.Cell>
              <Table.Cell>
                <ChevronRight className="size-4 text-fg-quaternary" aria-hidden />
              </Table.Cell>
            </Table.Row>
          )}
        </Table.Body>
      </Table>
    </TableCard.Root>
  );
}
