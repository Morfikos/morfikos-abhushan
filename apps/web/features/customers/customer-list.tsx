"use client";

import { Suspense, useCallback, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { CustomerWhatsAppConsentFilter } from "@aabhushan/contracts";
import { customerInitials } from "@aabhushan/domain";
import { ChevronRight, Users01 } from "@untitledui/icons";

import { Skeleton } from "@/components/application/skeleton/skeleton";
import { Table, TableCard } from "@/components/application/table/table";
import { Tabs } from "@/components/application/tabs/tabs";
import { Avatar } from "@/components/base/avatar/avatar";
import { Badge } from "@/components/base/badges/badges";
import { ButtonGroup, ButtonGroupItem } from "@/components/base/button-group/button-group";
import { Button } from "@/components/base/buttons/button";
import {
  DirectoryEmptyState,
  DirectoryError,
  DirectoryTableBusy,
  DirectoryTableSkeleton,
  FilteredEmptyState,
  directoryListFlags,
} from "@/components/shared/directory-states";
import { ListSearchField } from "@/components/shared/list-search-field";
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
import {
  type ListFilterCodec,
  useDebouncedListQuery,
  useListPagination,
  useSyncedListFilters,
} from "@/lib/list-search-params";
import { fetchCustomers } from "@/lib/staff-api";

type ActiveFilter = "active" | "inactive" | "all";
type TypeFilter = "all" | "named" | "walk_in";

const DEFAULT_ACTIVE: ActiveFilter = "active";
const DEFAULT_TYPE: TypeFilter = "all";
const DEFAULT_WHATSAPP = "" as const;

const STATUS_TABS: { id: ActiveFilter; label: string }[] = [
  { id: "active", label: "Active" },
  { id: "inactive", label: "Inactive" },
  { id: "all", label: "All" },
];

type CustomerListFilters = {
  appliedQ: string;
  active: ActiveFilter;
  type: TypeFilter;
  whatsapp: "" | CustomerWhatsAppConsentFilter;
};

const customerListDefaults: CustomerListFilters = {
  appliedQ: "",
  active: DEFAULT_ACTIVE,
  type: DEFAULT_TYPE,
  whatsapp: DEFAULT_WHATSAPP,
};

const WHATSAPP_VALUES: CustomerWhatsAppConsentFilter[] = ["granted", "revoked", "none"];

const customerListCodec: ListFilterCodec<CustomerListFilters> = {
  ownedKeys: ["q", "active", "type", "whatsapp"],
  defaults: customerListDefaults,
  parse(params) {
    const activeRaw = params.get("active");
    const active: ActiveFilter =
      activeRaw === "inactive" || activeRaw === "all" || activeRaw === "active" ? activeRaw : DEFAULT_ACTIVE;
    const typeRaw = params.get("type");
    const type: TypeFilter =
      typeRaw === "named" || typeRaw === "walk_in" || typeRaw === "all" ? typeRaw : DEFAULT_TYPE;
    const whatsappRaw = params.get("whatsapp");
    const whatsapp =
      whatsappRaw && WHATSAPP_VALUES.includes(whatsappRaw as CustomerWhatsAppConsentFilter)
        ? (whatsappRaw as CustomerWhatsAppConsentFilter)
        : DEFAULT_WHATSAPP;
    return {
      appliedQ: params.get("q")?.trim() ?? "",
      active,
      type,
      whatsapp,
    };
  },
  serialize(value) {
    return {
      q: value.appliedQ || undefined,
      active: value.active === DEFAULT_ACTIVE ? undefined : value.active,
      type: value.type === DEFAULT_TYPE ? undefined : value.type,
      whatsapp: value.whatsapp || undefined,
    };
  },
  chips() {
    return [];
  },
};

/** Search band + status tabs / Type / WhatsApp — shared by Suspense and initial load. */
export function CustomersFilterSkeleton() {
  return (
    <>
      <Skeleton className="h-12 w-full rounded-lg" />
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex gap-6">
          <Skeleton className="h-10 w-16" />
          <Skeleton className="h-10 w-20" />
          <Skeleton className="h-10 w-12" />
        </div>
        <div className="flex flex-wrap gap-3">
          <Skeleton className="h-11 w-52 rounded-lg" />
          <Skeleton className="h-11 w-48 rounded-lg" />
        </div>
      </div>
    </>
  );
}

/** Body-only loader: Suspense fallback and showInitialLoading (header stays live). */
export function CustomersListBodyLoading() {
  return (
    <DirectoryTableSkeleton
      title="Directory"
      columns={3}
      label="Loading customers"
      filterSkeleton={<CustomersFilterSkeleton />}
    />
  );
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
            <Button color="primary" size="lg" href="/customers/new">
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
  const { filters, setFilters, clearFilters } = useSyncedListFilters("/customers", customerListCodec);
  const { appliedQ, active: activeFilter, type: typeFilter, whatsapp: whatsappFilter } = filters;
  const { page, setPage, pageSize, setPageSize } = useListPagination(10);

  const commitQuery = useCallback(
    (next: string) => {
      setPage(1);
      setFilters((current) => ({ ...current, appliedQ: next }));
    },
    [setFilters, setPage],
  );
  const { search, setSearch } = useDebouncedListQuery({ appliedQ, onCommit: commitQuery });

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
  const segmentFiltersActive =
    typeFilter !== DEFAULT_TYPE || whatsappFilter !== DEFAULT_WHATSAPP;
  const statusNonDefault = activeFilter !== DEFAULT_ACTIVE;
  const filtersActive = Boolean(appliedQ) || statusNonDefault || segmentFiltersActive;
  const { showInitialLoading, directoryEmpty, filteredEmpty, showDirectoryCard } = directoryListFlags({
    isLoading: query.isLoading,
    hasData: Boolean(query.data),
    total,
    itemCount: items.length,
    filtersActive,
  });

  const searchPending =
    search.trim() !== appliedQ || (query.isFetching && !query.isLoading && Boolean(query.data));
  const tableBusy = query.isFetching && Boolean(query.data);

  const clearSearch = useCallback(() => {
    setSearch("");
    setPage(1);
    setFilters((current) => ({ ...current, appliedQ: "" }));
  }, [setFilters, setPage, setSearch]);

  const clearSegmentFilters = useCallback(() => {
    setPage(1);
    setFilters((current) => ({
      ...current,
      type: DEFAULT_TYPE,
      whatsapp: DEFAULT_WHATSAPP,
    }));
  }, [setFilters, setPage]);

  const clearAll = useCallback(() => {
    setSearch("");
    setPage(1);
    clearFilters();
  }, [clearFilters, setPage, setSearch]);

  const emptyTitle = useMemo(
    () => (appliedQ ? `No customers match "${appliedQ}"` : "No matching customers"),
    [appliedQ],
  );

  return (
    <>
      {showInitialLoading ? <CustomersListBodyLoading /> : null}
      {query.isError && !showDirectoryCard ? (
        <DirectoryError message={customerErrorMessage(query.error)} />
      ) : null}

      {directoryEmpty ? (
        <DirectoryEmptyState
          icon={Users01}
          title="No customers yet"
          description="Create a customer record for billing and Girvi. This is not a public sign-up."
          action={
            canWrite ? (
              <Button color="primary" size="lg" href="/customers/new">
                New customer
              </Button>
            ) : null
          }
        />
      ) : null}

      {showDirectoryCard ? (
        <TableCard.Root>
          <TableCard.Header title="Directory" badge={String(total)} />
          {query.isError ? (
            <div className="border-b border-secondary px-5 py-4 md:px-7">
              <DirectoryError message={customerErrorMessage(query.error)} />
            </div>
          ) : null}
          <div className="flex flex-col gap-0 border-b border-secondary">
            <div className="border-b border-primary px-5 py-5 md:px-7">
              <ListSearchField
                value={search}
                onChange={setSearch}
                placeholder="Name or phone"
                size="lg"
                isPending={searchPending}
              />
            </div>

            <div className="px-5 py-4 md:px-7">
              <div className="flex flex-col gap-4 py-1 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0 overflow-x-auto">
                  <Tabs
                    selectedKey={activeFilter}
                    onSelectionChange={(key) => {
                      if (typeof key === "string" && STATUS_TABS.some((tab) => tab.id === key)) {
                        setFilters((current) => ({ ...current, active: key as ActiveFilter }));
                        setPage(1);
                      }
                    }}
                    className="w-max"
                  >
                    <Tabs.List type="underline" size="md" aria-label="Customer status" className="gap-6">
                      {STATUS_TABS.map((tab) => (
                        <Tabs.Item key={tab.id} id={tab.id} label={tab.label} />
                      ))}
                    </Tabs.List>
                  </Tabs>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {segmentFiltersActive ? (
                    <Button color="link-gray" size="lg" onPress={clearSegmentFilters}>
                      Clear filters
                    </Button>
                  ) : null}
                  <ButtonGroup
                    size="lg"
                    selection="filter"
                    selectedKeys={new Set([typeFilter])}
                    disallowEmptySelection
                    aria-label="Customer type"
                    onSelectionChange={(keys) => {
                      const [first] = keys;
                      if (first === "all" || first === "named" || first === "walk_in") {
                        setFilters((current) => ({ ...current, type: first }));
                        setPage(1);
                      }
                    }}
                  >
                    <ButtonGroupItem id="all">All</ButtonGroupItem>
                    <ButtonGroupItem id="named">Named</ButtonGroupItem>
                    <ButtonGroupItem id="walk_in">Walk-in</ButtonGroupItem>
                  </ButtonGroup>

                  <div className="w-48">
                    <SelectField
                      aria-label="WhatsApp"
                      size="lg"
                      value={whatsappFilter}
                      onChange={(value) => {
                        const next =
                          value === "granted" || value === "revoked" || value === "none" ? value : "";
                        setFilters((current) => ({ ...current, whatsapp: next }));
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
            </div>
          </div>

          {filteredEmpty ? (
            <FilteredEmptyState
              title={emptyTitle}
              description="Try another name, phone, or filter."
              hasSearch={Boolean(appliedQ)}
              hasOtherFilters={statusNonDefault || segmentFiltersActive}
              onClear={clearAll}
              onClearSearch={appliedQ ? clearSearch : undefined}
            />
          ) : null}

          {items.length > 0 ? (
            <DirectoryTableBusy isBusy={tableBusy}>
              <Table aria-label="Customers">
                <Table.Header>
                  <Table.Head id="name" isRowHeader label="Customer" />
                  <Table.Head id="consent" label="WhatsApp" />
                  <Table.Head id="open" label="" />
                </Table.Header>
                <Table.Body items={items}>
                  {(item) => (
                    <Table.Row id={item.id} href={`/customers/${item.id}`} className="cursor-pointer">
                      <Table.Cell truncate={false}>
                        <div className="flex items-center gap-3">
                          <Avatar size="md" initials={customerInitials(item.display_name)} alt="" />
                          <div className="flex h-full min-w-0 flex-col justify-center gap-0.5 overflow-hidden">
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                              <span className="truncate text-md font-medium text-primary">
                                {item.display_name}
                              </span>
                              {item.is_walk_in ? (
                                <Badge color="blue" size="sm">
                                  Walk-in
                                </Badge>
                              ) : null}
                              {!item.is_active ? (
                                <Badge color="gray" size="sm">
                                  Inactive
                                </Badge>
                              ) : null}
                            </div>
                            <span className="truncate text-sm tabular-nums text-tertiary">
                              {item.phone_display ?? "—"}
                            </span>
                          </div>
                        </div>
                      </Table.Cell>
                      <Table.Cell>
                        <Badge color={whatsappConsentBadgeColor(item.whatsapp_consent)} size="lg">
                          {whatsappConsentShortLabel(item.whatsapp_consent)}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell>
                        <ChevronRight className="size-6 text-fg-quaternary" aria-hidden="true" />
                      </Table.Cell>
                    </Table.Row>
                  )}
                </Table.Body>
              </Table>
              <ListTableFooter
                page={page}
                totalPages={totalPages}
                pageSize={pageSize}
                total={total}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
              />
            </DirectoryTableBusy>
          ) : null}
        </TableCard.Root>
      ) : null}
    </>
  );
}
