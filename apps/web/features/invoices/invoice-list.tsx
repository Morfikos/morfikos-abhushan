"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import type { CalendarDate, DateValue } from "@internationalized/date";
import { parseDate } from "@internationalized/date";
import { ChevronRight, Receipt } from "@untitledui/icons";
import type { DateRange } from "react-aria-components";

import { DatePicker } from "@/components/application/date-picker/date-picker";
import { DateRangePicker } from "@/components/application/date-picker/date-range-picker";
import { LabeledControlSkeleton, Skeleton } from "@/components/application/skeleton/skeleton";
import { Table, TableCard } from "@/components/application/table/table";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { ButtonGroup, ButtonGroupItem } from "@/components/base/button-group/button-group";
import { ActiveFiltersBar } from "@/components/shared/active-filters-bar";
import {
  DirectoryEmptyState,
  DirectoryTableSkeleton,
  FilteredEmptyState,
} from "@/components/shared/directory-states";
import { ListSearchToolbar } from "@/components/shared/list-search-toolbar";
import { ListTableFooter } from "@/components/shared/list-table-footer";
import { SelectField } from "@/components/shared/select-field";
import { MoneyText } from "@/components/shared/money-text";
import { StaffPageHeader } from "@/components/shared/staff-page-header";
import { type ListFilterCodec, useSyncedListFilters } from "@/lib/list-search-params";
import { staffHasPermission, useStaff } from "@/features/auth/staff-shell";
import { invoiceAccessToken, invoiceErrorMessage } from "@/features/invoices/invoice-shared";
import {
  boundsForPeriod,
  customPeriodFromParams,
  kolkataTodayCalendar,
  type PeriodPreset,
} from "@/lib/period-bounds";
import { fetchInvoices } from "@/lib/staff-api";

/** Live order: period ButtonGroup + date, then search + status. */
export function InvoicesFilterSkeleton() {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-9 w-16 rounded-lg" />
        <Skeleton className="h-9 w-16 rounded-lg" />
        <Skeleton className="h-9 w-16 rounded-lg" />
        <Skeleton className="h-9 w-20 rounded-lg" />
        <Skeleton className="h-9 w-20 rounded-lg" />
        <Skeleton className="h-10 w-40 rounded-lg" />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <LabeledControlSkeleton className="min-w-0 max-w-md flex-1" controlWidth="w-full" />
        <LabeledControlSkeleton controlWidth="w-40" />
      </div>
    </>
  );
}

/** Body-only loader: Suspense fallback and showInitialLoading (header stays live). */
export function InvoicesListBodyLoading() {
  return (
    <DirectoryTableSkeleton
      title="Invoices"
      columns={7}
      label="Loading invoices"
      filterSkeleton={<InvoicesFilterSkeleton />}
    />
  );
}

/** @deprecated Prefer InvoicesListBodyLoading — alias kept for call-site clarity. */
export function InvoicesDirectoryLoading() {
  return <InvoicesListBodyLoading />;
}

const PERIOD_PRESETS: { id: PeriodPreset; label: string }[] = [
  { id: "all", label: "All" },
  { id: "today", label: "Today" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "custom", label: "Custom" },
];

function asCalendarDate(value: DateValue | null | undefined): CalendarDate | null {
  if (!value) {
    return null;
  }
  return parseDate(value.toString());
}

type InvoiceListFilters = {
  status: "" | "draft" | "finalized";
  dueOnly: boolean;
  periodPreset: PeriodPreset;
  dayDate: CalendarDate;
  customStart: CalendarDate | null;
  customEnd: CalendarDate | null;
  appliedQ: string;
};

const invoiceListDefaults: InvoiceListFilters = {
  status: "",
  dueOnly: false,
  periodPreset: "all",
  dayDate: kolkataTodayCalendar(),
  customStart: null,
  customEnd: null,
  appliedQ: "",
};

const invoiceListCodec: ListFilterCodec<InvoiceListFilters> = {
  ownedKeys: ["status", "due", "from", "to", "q"],
  defaults: invoiceListDefaults,
  parse(params) {
    const drilledPeriod = customPeriodFromParams(params.get("from"), params.get("to"));
    const drilledStatus = params.get("status");
    return {
      status: drilledStatus === "draft" || drilledStatus === "finalized" ? drilledStatus : "",
      dueOnly: params.get("due") === "1",
      periodPreset: drilledPeriod?.preset ?? "all",
      dayDate: kolkataTodayCalendar(),
      customStart: drilledPeriod?.customStart ?? null,
      customEnd: drilledPeriod?.customEnd ?? null,
      appliedQ: params.get("q")?.trim() ?? "",
    };
  },
  serialize(value) {
    const period =
      value.periodPreset === "all"
        ? {}
        : boundsForPeriod({
            preset: value.periodPreset,
            dayDate: value.dayDate,
            customStart: value.customStart,
            customEnd: value.customEnd,
          });
    return {
      status: value.status || undefined,
      due: value.dueOnly ? "1" : undefined,
      from: period.from,
      to: period.to,
      q: value.appliedQ || undefined,
    };
  },
  chips(value) {
    const chips = [];
    if (value.status === "draft") {
      chips.push({ id: "status", label: "Status: Draft" });
    } else if (value.status === "finalized") {
      chips.push({ id: "status", label: "Status: Finalized" });
    }
    if (value.dueOnly) {
      chips.push({ id: "due", label: "Due only" });
    }
    if (value.periodPreset !== "all") {
      const bounds = boundsForPeriod({
        preset: value.periodPreset,
        dayDate: value.dayDate,
        customStart: value.customStart,
        customEnd: value.customEnd,
      });
      if (bounds.from && bounds.to) {
        chips.push({
          id: "period",
          label: bounds.from === bounds.to ? `Period: ${bounds.from}` : `Period: ${bounds.from}–${bounds.to}`,
        });
      }
    }
    if (value.appliedQ) {
      chips.push({ id: "q", label: `Search: ${value.appliedQ}` });
    }
    return chips;
  },
};

export function InvoiceList() {
  const staff = useStaff();
  const router = useRouter();
  const allowed = staffHasPermission(staff, "billing.write");

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
        title="Invoices"
        description="Staff POS drafts and completed sales."
        icon={Receipt}
        actions={
          <Button color="primary" size="md" href="/invoices/new">
            New invoice
          </Button>
        }
      />
      <Suspense fallback={<InvoicesListBodyLoading />}>
        <InvoiceListBody />
      </Suspense>
    </section>
  );
}

function InvoiceListBody() {
  const staff = useStaff();
  const { filters, setFilters, chips } = useSyncedListFilters("/invoices", invoiceListCodec);
  const { status: statusFilter, dueOnly, periodPreset, dayDate, customStart, customEnd, appliedQ } = filters;
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState(appliedQ);

  useEffect(() => {
    setSearch(appliedQ);
  }, [appliedQ]);

  const periodBounds = useMemo(
    () =>
      boundsForPeriod({
        preset: periodPreset,
        dayDate,
        customStart,
        customEnd,
      }),
    [customEnd, customStart, dayDate, periodPreset],
  );

  const listSort = periodPreset === "all" ? "updated_at" : "business_date";

  const query = useQuery({
    queryKey: [
      "invoices",
      staff.membership.organization_id,
      page,
      pageSize,
      appliedQ,
      statusFilter,
      dueOnly,
      periodBounds.from ?? "",
      periodBounds.to ?? "",
      listSort,
    ],
    queryFn: async () =>
      fetchInvoices(await invoiceAccessToken(), {
        page,
        pageSize,
        sort: listSort,
        direction: "desc",
        ...(appliedQ ? { q: appliedQ } : {}),
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(dueOnly ? { hasDue: true } : {}),
        ...(periodBounds.from ? { businessDateFrom: periodBounds.from } : {}),
        ...(periodBounds.to ? { businessDateTo: periodBounds.to } : {}),
      }),
    placeholderData: keepPreviousData,
  });

  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const periodActive = periodPreset !== "all";
  const filtersActive = Boolean(appliedQ) || Boolean(statusFilter) || dueOnly || periodActive;
  const directoryEmpty = !query.isLoading && total === 0 && !filtersActive;
  const filteredEmpty = !query.isLoading && items.length === 0 && filtersActive;
  const showInitialLoading = query.isLoading && !query.data;
  const showDirectoryCard = !directoryEmpty && !showInitialLoading;
  const customRangeValue: DateRange | null =
    customStart && customEnd ? { start: customStart, end: customEnd } : null;

  function applySearch() {
    setPage(1);
    setFilters((current) => ({ ...current, appliedQ: search.trim() }));
  }

  function clearFilters() {
    setSearch("");
    setFilters({ ...invoiceListDefaults, dayDate: kolkataTodayCalendar() });
    setPage(1);
  }

  function selectPeriod(next: PeriodPreset) {
    setPage(1);
    setFilters((current) => {
      const updated: InvoiceListFilters = { ...current, periodPreset: next };
      if (next === "today" || next === "week" || next === "month") {
        updated.dayDate = kolkataTodayCalendar();
      }
      if (next === "custom" && (!current.customStart || !current.customEnd)) {
        const today = kolkataTodayCalendar();
        updated.customStart = today;
        updated.customEnd = today;
      }
      return updated;
    });
  }

  return (
    <>
      {showInitialLoading ? <InvoicesListBodyLoading /> : null}

      {query.isError ? (
        <p className="text-sm text-error-primary" role="alert">
          {invoiceErrorMessage(query.error)}
        </p>
      ) : null}

      {directoryEmpty ? (
        <DirectoryEmptyState
          icon={Receipt}
          title="No invoices yet"
          description="Start a POS draft, scan available articles, then complete the sale when totals look right."
          action={
            <Button color="primary" size="md" href="/invoices/new">
              New invoice
            </Button>
          }
        />
      ) : null}

      {showDirectoryCard ? (
        <TableCard.Root>
          <TableCard.Header title="Invoices" badge={String(total)} />
          <div className="flex flex-col gap-3 border-b border-secondary px-4 py-4 md:px-6">
            <div className="flex flex-wrap items-center gap-2">
              <ButtonGroup
                size="sm"
                selectedKeys={new Set([periodPreset])}
                disallowEmptySelection
                onSelectionChange={(keys) => {
                  const [first] = keys;
                  if (typeof first === "string") {
                    selectPeriod(first as PeriodPreset);
                  }
                }}
              >
                {PERIOD_PRESETS.map((preset) => (
                  <ButtonGroupItem key={preset.id} id={preset.id}>
                    {preset.label}
                  </ButtonGroupItem>
                ))}
              </ButtonGroup>
              {periodPreset === "today" || periodPreset === "week" || periodPreset === "month" ? (
                <DatePicker
                  aria-label="Business date"
                  value={dayDate}
                  onChange={(value) => {
                    const next = asCalendarDate(value);
                    if (next) {
                      setPage(1);
                      setFilters((current) => ({ ...current, dayDate: next }));
                    }
                  }}
                />
              ) : null}
              {periodPreset === "custom" ? (
                <DateRangePicker
                  aria-label="Business date range"
                  value={customRangeValue}
                  onChange={(value) => {
                    const start = asCalendarDate(value?.start ?? null);
                    const end = asCalendarDate(value?.end ?? null);
                    setPage(1);
                    setFilters((current) => ({ ...current, customStart: start, customEnd: end }));
                  }}
                />
              ) : null}
            </div>
            {dueOnly ? (
              <p className="text-sm text-tertiary">Showing finalized invoices that still have a balance.</p>
            ) : null}
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-0 flex-1">
                <ListSearchToolbar
                  value={search}
                  onChange={setSearch}
                  onSearch={applySearch}
                  onClear={clearFilters}
                  filtersActive={filtersActive}
                  placeholder="Customer or invoice number"
                />
              </div>
              <div className="w-40">
                <SelectField
                  label="Status"
                  value={statusFilter}
                  onChange={(value) => {
                    setPage(1);
                    setFilters((current) => ({
                      ...current,
                      status: value === "draft" || value === "finalized" ? value : "",
                    }));
                  }}
                  options={[
                    { label: "All statuses", value: "" },
                    { label: "Draft", value: "draft" },
                    { label: "Finalized", value: "finalized" },
                  ]}
                />
              </div>
            </div>
            <ActiveFiltersBar chips={chips} onClear={clearFilters} />
          </div>

          {filteredEmpty ? (
            <FilteredEmptyState
              title="No matching invoices"
              description="Try another customer, invoice number, status, or period."
              onClear={clearFilters}
            />
          ) : null}

          {items.length > 0 ? (
            <>
              <Table aria-label="Invoices">
                <Table.Header>
                  <Table.Head id="number" label="Number" isRowHeader className="w-36" />
                  <Table.Head id="customer" label="Customer" />
                  <Table.Head id="status" label="Status" className="w-28" />
                  <Table.Head id="date" label="Business date" className="w-36" />
                  <Table.Head id="total" label="Total" className="w-32 text-right" />
                  <Table.Head id="due" label="Due" className="w-32 text-right" />
                  <Table.Head id="open" label="" />
                </Table.Header>
                <Table.Body items={items}>
                  {(item) => (
                    <Table.Row id={item.id} href={`/invoices/${item.id}`} className="cursor-pointer">
                      <Table.Cell className="font-mono text-sm">{item.invoice_number ?? "Draft"}</Table.Cell>
                      <Table.Cell>{item.customer_display_name}</Table.Cell>
                      <Table.Cell>
                        <Badge color={item.status === "finalized" ? "success" : "gray"} size="sm">
                          {item.status === "finalized" ? "Finalized" : "Draft"}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell className="tabular-nums">{item.business_date}</Table.Cell>
                      <Table.Cell className="text-right tabular-nums">
                        <MoneyText amount={item.grand_total_inr} />
                      </Table.Cell>
                      <Table.Cell className="text-right tabular-nums">
                        <MoneyText amount={item.amount_due_inr} />
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
                pageSize={pageSize}
                totalPages={totalPages}
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
