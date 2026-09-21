"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { CustomerWhatsAppConsentFilter } from "@aabhushan/contracts";
import { customerInitials } from "@aabhushan/domain";
import { ChevronRight, Users01 } from "@untitledui/icons";

import { LabeledControlSkeleton } from "@/components/application/skeleton/skeleton";
import { Table, TableCard } from "@/components/application/table/table";
import { Avatar } from "@/components/base/avatar/avatar";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import {
  DirectoryEmptyState,
  DirectoryTableSkeleton,
  FilteredEmptyState,
} from "@/components/shared/directory-states";
import { ListSearchToolbar } from "@/components/shared/list-search-toolbar";
import { ListTableFooter } from "@/components/shared/list-table-footer";
import { SelectField } from "@/components/shared/select-field";
import { StaffPageHeader } from "@/components/shared/staff-page-header";
import { staffHasPermission, useStaff } from "@/features/auth/staff-shell";
import {
  customerAccessToken,
  customerErrorMessage,
  whatsappConsentBadgeColor,
  whatsappConsentShortLabel,
} from "@/features/customers/customer-shared";
import { fetchCustomers } from "@/lib/staff-api";

type ActiveFilter = "active" | "inactive" | "all";
type TypeFilter = "all" | "named" | "walk_in";

const DEFAULT_ACTIVE: ActiveFilter = "active";
const DEFAULT_TYPE: TypeFilter = "all";
const DEFAULT_WHATSAPP = "" as const;

/** One-row search + Active / Type / WhatsApp selects — shared by Suspense and initial load. */
export function CustomersFilterSkeleton() {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <LabeledControlSkeleton className="min-w-0 max-w-md flex-1" controlWidth="w-full" />
      <LabeledControlSkeleton controlWidth="w-36" />
      <LabeledControlSkeleton controlWidth="w-44" />
      <LabeledControlSkeleton controlWidth="w-40" />
    </div>
  );
}

/** Body-only loader: Suspense fallback and showInitialLoading (header stays live). */
export function CustomersListBodyLoading() {
  return (
    <DirectoryTableSkeleton
      title="Directory"
      columns={5}
      label="Loading customers"
      filterSkeleton={<CustomersFilterSkeleton />}
    />
  );
}

/** @deprecated Prefer CustomersListBodyLoading — alias kept for call-site clarity. */
export function CustomersDirectoryLoading() {
  return <CustomersListBodyLoading />;
}

export function CustomerList() {
  const staff = useStaff();
  const router = useRouter();
  const allowed = staffHasPermission(staff, "customers.read") || staffHasPermission(staff, "customers.write");
  const canWrite = staffHasPermission(staff, "customers.write");

  useEffect(() => {
    if (!allowed) {
      router.replace("/access-denied");
    }
  }, [allowed, router]);

  if (!allowed) {
    return null;
  }

  return (
    <section className="flex flex-col gap-6">
      <StaffPageHeader
        title="Customers"
        description="Staff directory for sales and Girvi. Customers do not have login accounts."
        icon={Users01}
        actions={
          canWrite ? (
            <Button color="primary" size="md" href="/customers/new">
              New customer
            </Button>
          ) : null
        }
      />
      <Suspense fallback={<CustomersListBodyLoading />}>
        <CustomerListBody canWrite={canWrite} />
      </Suspense>
    </section>
  );
}

function CustomerListBody({ canWrite }: { canWrite: boolean }) {
  const staff = useStaff();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");
  const [appliedQ, setAppliedQ] = useState("");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>(DEFAULT_ACTIVE);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>(DEFAULT_TYPE);
  const [whatsappFilter, setWhatsappFilter] = useState<"" | CustomerWhatsAppConsentFilter>(DEFAULT_WHATSAPP);

  const query = useQuery({
    queryKey: [
      "customers",
      staff.membership.organization_id,
      page,
      pageSize,
      appliedQ,
      activeFilter,
      typeFilter,
      whatsappFilter,
    ],
    queryFn: async () =>
      fetchCustomers(await customerAccessToken(), {
        page,
        pageSize,
        sort: "name",
        direction: "asc",
        ...(appliedQ ? { q: appliedQ } : {}),
        ...(activeFilter === "active"
          ? { isActive: true }
          : activeFilter === "inactive"
            ? { isActive: false }
            : {}),
        ...(typeFilter === "named"
          ? { isWalkIn: false }
          : typeFilter === "walk_in"
            ? { isWalkIn: true }
            : {}),
        ...(whatsappFilter ? { whatsappConsent: whatsappFilter } : {}),
      }),
    placeholderData: keepPreviousData,
  });

  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const filtersActive =
    Boolean(appliedQ) ||
    activeFilter !== DEFAULT_ACTIVE ||
    typeFilter !== DEFAULT_TYPE ||
    whatsappFilter !== DEFAULT_WHATSAPP;
  const directoryEmpty = !query.isLoading && total === 0 && !filtersActive;
  const filteredEmpty = !query.isLoading && items.length === 0 && filtersActive;
  const showInitialLoading = query.isLoading && !query.data;
  const showDirectoryCard = !directoryEmpty && !showInitialLoading;

  function applySearch() {
    setPage(1);
    setAppliedQ(search.trim());
  }

  function clearFilters() {
    setSearch("");
    setAppliedQ("");
    setActiveFilter(DEFAULT_ACTIVE);
    setTypeFilter(DEFAULT_TYPE);
    setWhatsappFilter(DEFAULT_WHATSAPP);
    setPage(1);
  }

  return (
    <>
      {showInitialLoading ? <CustomersListBodyLoading /> : null}
      {query.isError ? <p className="text-sm text-error-primary">{customerErrorMessage(query.error)}</p> : null}

      {directoryEmpty ? (
        <DirectoryEmptyState
          icon={Users01}
          title="No customers yet"
          description="Create a customer record for billing and Girvi. This is not a public sign-up."
          action={
            canWrite ? (
              <Button color="primary" size="md" href="/customers/new">
                New customer
              </Button>
            ) : null
          }
        />
      ) : null}

      {showDirectoryCard ? (
        <TableCard.Root>
          <TableCard.Header title="Directory" badge={String(total)} />
          <div className="flex flex-col gap-3 border-b border-secondary px-4 py-4 md:px-6">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-0 flex-1">
                <ListSearchToolbar
                  value={search}
                  onChange={setSearch}
                  onSearch={applySearch}
                  onClear={clearFilters}
                  filtersActive={filtersActive}
                  placeholder="Name or phone"
                />
              </div>
              <div className="w-36">
                <SelectField
                  label="Active"
                  value={activeFilter}
                  onChange={(value) => {
                    setActiveFilter(
                      value === "inactive" || value === "all" || value === "active" ? value : DEFAULT_ACTIVE,
                    );
                    setPage(1);
                  }}
                  options={[
                    { label: "Active", value: "active" },
                    { label: "Inactive", value: "inactive" },
                    { label: "All", value: "all" },
                  ]}
                />
              </div>
              <div className="w-44">
                <SelectField
                  label="Type"
                  value={typeFilter}
                  onChange={(value) => {
                    setTypeFilter(
                      value === "named" || value === "walk_in" || value === "all" ? value : DEFAULT_TYPE,
                    );
                    setPage(1);
                  }}
                  options={[
                    { label: "All types", value: "all" },
                    { label: "Named customers", value: "named" },
                    { label: "Walk-in only", value: "walk_in" },
                  ]}
                />
              </div>
              <div className="w-40">
                <SelectField
                  label="WhatsApp"
                  value={whatsappFilter}
                  onChange={(value) => {
                    setWhatsappFilter(
                      value === "granted" || value === "revoked" || value === "none" ? value : "",
                    );
                    setPage(1);
                  }}
                  options={[
                    { label: "All WhatsApp", value: "" },
                    { label: "Granted", value: "granted" },
                    { label: "Revoked", value: "revoked" },
                    { label: "None", value: "none" },
                  ]}
                />
              </div>
            </div>
          </div>

          {filteredEmpty ? (
            <FilteredEmptyState
              title="No matching customers"
              description="Try another name, phone, or filter."
              onClear={clearFilters}
            />
          ) : null}

          {items.length > 0 ? (
            <>
              <Table aria-label="Customers">
                <Table.Header>
                  <Table.Head id="name" isRowHeader label="Customer" />
                  <Table.Head id="phone" label="Phone" />
                  <Table.Head id="email" label="Email" />
                  <Table.Head id="consent" label="WhatsApp" />
                  <Table.Head id="open" label="" />
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
                      <Table.Cell>
                        <span className="font-mono text-sm tabular-nums text-primary">
                          {item.phone_display ?? "—"}
                        </span>
                      </Table.Cell>
                      <Table.Cell>
                        {item.email ? (
                          <span className="block max-w-xs truncate text-sm text-primary" title={item.email}>
                            {item.email}
                          </span>
                        ) : (
                          <span className="text-quaternary">—</span>
                        )}
                      </Table.Cell>
                      <Table.Cell>
                        <Badge color={whatsappConsentBadgeColor(item.whatsapp_consent)} size="sm">
                          {whatsappConsentShortLabel(item.whatsapp_consent)}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell>
                        <ChevronRight className="size-4 text-fg-quaternary" aria-hidden="true" />
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
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setPage(1);
                }}
              />
            </>
          ) : null}
        </TableCard.Root>
      ) : null}
    </>
  );
}
