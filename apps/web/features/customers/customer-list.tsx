"use client";

import { useEffect, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { customerInitials } from "@aabhushan/domain";
import { SearchLg, Users01 } from "@untitledui/icons";

import { EmptyState } from "@/components/application/empty-state/empty-state";
import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import { Table, TableCard } from "@/components/application/table/table";
import { Avatar } from "@/components/base/avatar/avatar";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { ListTableFooter } from "@/components/shared/list-table-footer";
import { staffHasPermission, useStaff } from "@/features/auth/staff-shell";
import { customerAccessToken, customerErrorMessage, whatsappConsentLabel } from "@/features/customers/customer-shared";
import { fetchCustomers } from "@/lib/staff-api";

export function CustomerList() {
  const staff = useStaff();
  const router = useRouter();
  const allowed = staffHasPermission(staff, "customers.read") || staffHasPermission(staff, "customers.write");
  const canWrite = staffHasPermission(staff, "customers.write");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");
  const [appliedQ, setAppliedQ] = useState("");

  useEffect(() => {
    if (!allowed) {
      router.replace("/access-denied");
    }
  }, [allowed, router]);

  const query = useQuery({
    queryKey: ["customers", staff.membership.organization_id, page, pageSize, appliedQ],
    queryFn: async () =>
      fetchCustomers(await customerAccessToken(), {
        page,
        pageSize,
        sort: "name",
        direction: "asc",
        ...(appliedQ ? { q: appliedQ } : {}),
      }),
    enabled: allowed,
    placeholderData: keepPreviousData,
  });

  if (!allowed) {
    return null;
  }

  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const filtersActive = Boolean(appliedQ);
  const directoryEmpty = !query.isLoading && total === 0 && !filtersActive;
  const filteredEmpty = !query.isLoading && items.length === 0 && filtersActive;
  const showInitialLoading = query.isLoading && !query.data;

  function applySearch() {
    setPage(1);
    setAppliedQ(search.trim());
  }

  function clearFilters() {
    setSearch("");
    setAppliedQ("");
    setPage(1);
  }

  function onSearchEnter(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    applySearch();
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-display-xs font-semibold text-primary">Customers</h1>
          <p className="text-md text-tertiary">
            Staff directory for sales and Girvi. Customers do not have login accounts.
          </p>
        </div>
        {canWrite ? (
          <Button color="primary" size="md" href="/customers/new">
            New customer
          </Button>
        ) : null}
      </div>

      {!directoryEmpty ? (
        <div className="flex flex-col gap-3 rounded-xl bg-primary p-4 shadow-xs ring-1 ring-secondary md:p-5">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-56 flex-1">
              <Input
                label="Search"
                value={search}
                placeholder="Name or phone"
                icon={SearchLg}
                onChange={setSearch}
                onKeyDown={onSearchEnter}
              />
            </div>
            <div className="flex items-end gap-2">
              <Button color="secondary" size="md" onPress={applySearch}>
                Search
              </Button>
              {filtersActive ? (
                <Button color="tertiary" size="md" onPress={clearFilters}>
                  Clear
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {showInitialLoading ? <LoadingIndicator size="md" label="Loading customers" /> : null}
      {query.isError ? <p className="text-sm text-error-primary">{customerErrorMessage(query.error)}</p> : null}

      {directoryEmpty ? (
        <EmptyState size="md" className="mx-auto py-10">
          <EmptyState.Header pattern="none">
            <div className="mb-3 flex size-12 items-center justify-center rounded-lg bg-secondary ring-1 ring-secondary ring-inset">
              <Users01 className="size-6 text-fg-quaternary" aria-hidden="true" />
            </div>
            <EmptyState.Content>
              <p className="text-lg font-semibold text-primary">No customers yet</p>
              <EmptyState.Description>
                Create a customer record for billing and Girvi. This is not a public sign-up.
              </EmptyState.Description>
            </EmptyState.Content>
          </EmptyState.Header>
          {canWrite ? (
            <EmptyState.Footer>
              <Button color="primary" size="md" href="/customers/new">
                New customer
              </Button>
            </EmptyState.Footer>
          ) : null}
        </EmptyState>
      ) : null}

      {filteredEmpty ? (
        <EmptyState size="md" className="mx-auto py-10">
          <EmptyState.Header pattern="none">
            <EmptyState.Content>
              <p className="text-lg font-semibold text-primary">No customers match this search</p>
              <EmptyState.Description>Try a different name or phone, or clear the search.</EmptyState.Description>
            </EmptyState.Content>
          </EmptyState.Header>
          <EmptyState.Footer>
            <Button color="secondary" size="md" onPress={clearFilters}>
              Clear search
            </Button>
          </EmptyState.Footer>
        </EmptyState>
      ) : null}

      {items.length > 0 ? (
        <TableCard.Root>
          <TableCard.Header title="Directory" badge={String(total)} />
          <Table aria-label="Customers">
            <Table.Header>
              <Table.Head id="name" isRowHeader label="Customer" />
              <Table.Head id="phone" label="Phone" />
              <Table.Head id="email" label="Email" />
              <Table.Head id="consent" label="WhatsApp" />
            </Table.Header>
            <Table.Body items={items}>
              {(item) => (
                <Table.Row id={item.id} href={`/customers/${item.id}`} className="cursor-pointer">
                  <Table.Cell>
                    <div className="flex items-center gap-3">
                      <Avatar size="sm" initials={customerInitials(item.display_name)} alt="" />
                      <span className="font-medium text-primary">{item.display_name}</span>
                    </div>
                  </Table.Cell>
                  <Table.Cell>{item.phone_display ?? "—"}</Table.Cell>
                  <Table.Cell>{item.email ?? "—"}</Table.Cell>
                  <Table.Cell>
                    <Badge
                      color={item.whatsapp_consent === "granted" ? "success" : "gray"}
                      size="sm"
                    >
                      {whatsappConsentLabel(item.whatsapp_consent)}
                    </Badge>
                  </Table.Cell>
                </Table.Row>
              )}
            </Table.Body>
          </Table>
          <ListTableFooter
            page={page}
            totalPages={totalPages}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(next) => {
              setPageSize(next);
              setPage(1);
            }}
          />
        </TableCard.Root>
      ) : null}
    </section>
  );
}
