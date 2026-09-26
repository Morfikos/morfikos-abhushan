"use client";

import { Suspense, useCallback, useEffect, useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import type { CalendarDate, DateValue } from "@internationalized/date";
import { parseDate } from "@internationalized/date";
import { ChevronRight, Receipt } from "@untitledui/icons";
import type { DateRange } from "react-aria-components";
import type { InvoiceListItem } from "@aabhushan/contracts";

import { DateRangePicker } from "@/components/application/date-picker/date-range-picker";
import { Skeleton } from "@/components/application/skeleton/skeleton";
import { Table, TableCard } from "@/components/application/table/table";
import { Tabs } from "@/components/application/tabs/tabs";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { ButtonGroup, ButtonGroupItem } from "@/components/base/button-group/button-group";
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
import { MoneyText } from "@/components/shared/money-text";
import { StaffPageHeader } from "@/components/shared/staff-page-header";
import {
  type ListFilterCodec,
  useDebouncedListQuery,
  useListPagination,
  useSyncedListFilters,
} from "@/lib/list-search-params";
import { staffHasPermission, useStaff } from "@/features/auth/staff-shell";
import { invoiceAccessToken, invoiceErrorMessage, isZeroMoney } from "@/features/invoices/invoice-shared";
import {
  boundsForPeriod,
  customPeriodFromParams,
  kolkataTodayCalendar,
  type PeriodPreset,
} from "@/lib/period-bounds";
import { fetchInvoices } from "@/lib/staff-api";
import { cx } from "@/utils/cx";

/** Live order: search lookup, then status tabs + period. */
export function InvoicesFilterSkeleton() {
  return (
    <>
      <Skeleton className="h-11 w-full rounded-lg" />
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-6">
          <Skeleton className="h-10 w-16" />
          <Skeleton className="h-10 w-20" />
          <Skeleton className="h-10 w-16" />
          <Skeleton className="h-10 w-16" />
        </div>
        <Skeleton className="h-11 w-80 rounded-lg" />
      </div>
    </>
  );
}

/** Body-only loader: Suspense fallback and showInitialLoading (header stays live). */
export function InvoicesListBodyLoading() {
  return (
    <DirectoryTableSkeleton
      title="Invoices"
      columns={8}
      label="Loading invoices"
      filterSkeleton={<InvoicesFilterSkeleton />}
    />
  );
}

const PERIOD_PRESETS: { id: PeriodPreset; label: string }[] = [
  { id: "all", label: "All time" },
  { id: "today", label: "Today" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "custom", label: "Custom ▾" },
];

type StatusTab = "all" | "drafts" | "due" | "paid";

const STATUS_TABS: { id: StatusTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "drafts", label: "Drafts" },
  { id: "due", label: "Due" },
  { id: "paid", label: "Paid" },
];

function asCalendarDate(value: DateValue | null | undefined): CalendarDate | null {
  if (!value) {
    return null;
  }
  return parseDate(value.toString());
}

type InvoiceListFilters = {
  statusTab: StatusTab;
  periodPreset: PeriodPreset;
  dayDate: CalendarDate;
  customStart: CalendarDate | null;
  customEnd: CalendarDate | null;
  appliedQ: string;
};

function statusTabFromParams(status: string | null, due: string | null): StatusTab {
  if (status === "draft") {
    return "drafts";
  }
  if (due === "1") {
    return "due";
  }
  if (status === "finalized" && (due === "0" || due === "false")) {
    return "paid";
  }
  // Dashboard due drill: status=finalized&due=1 already handled as due.
  // Legacy status=finalized alone maps to All (not Paid) unless due=0.
  return "all";
}

const invoiceListDefaults: InvoiceListFilters = {
  statusTab: "all",
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
    return {
      statusTab: statusTabFromParams(params.get("status"), params.get("due")),
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
    const status =
      value.statusTab === "drafts"
        ? "draft"
        : value.statusTab === "paid"
          ? "finalized"
          : value.statusTab === "due"
            ? "finalized"
            : undefined;
    const due = value.statusTab === "due" ? "1" : value.statusTab === "paid" ? "0" : undefined;
    return {
      status,
      due,
      from: period.from,
      to: period.to,
      q: value.appliedQ || undefined,
    };
  },
  chips() {
    return [];
  },
};

function periodPhrase(preset: PeriodPreset): string {
  if (preset === "today") {
    return "today";
  }
  if (preset === "week") {
    return "this week";
  }
  if (preset === "month") {
    return "this month";
  }
  if (preset === "custom") {
    return "in this range";
  }
  return "for all time";
}

function formatDayLabel(businessDate: string): string {
  const parsed = parseDate(businessDate);
  const asDate = new Date(parsed.year, parsed.month - 1, parsed.day);
  return asDate.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatListDate(businessDate: string): string {
  const parsed = parseDate(businessDate);
  const asDate = new Date(parsed.year, parsed.month - 1, parsed.day);
  return asDate.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function paymentDisplayStatus(item: InvoiceListItem): {
  label: string;
  color: "gray" | "error";
  appearance?: "soft" | "solid" | "dashed";
} {
  if (item.status === "draft") {
    return { label: "Draft", color: "gray", appearance: "dashed" };
  }
  if (!isZeroMoney(item.amount_due_inr)) {
    return { label: "Partially paid", color: "error" };
  }
  return { label: "Paid", color: "gray", appearance: "solid" };
}

function groupByBusinessDate(items: InvoiceListItem[]): Array<{ date: string; rows: InvoiceListItem[] }> {
  const groups: Array<{ date: string; rows: InvoiceListItem[] }> = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.date === item.business_date) {
      last.rows.push(item);
    } else {
      groups.push({ date: item.business_date, rows: [item] });
    }
  }
  return groups;
}

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
          <Button color="primary" size="lg" href="/invoices/new">
            New sale
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
  const { filters, setFilters } = useSyncedListFilters("/invoices", invoiceListCodec);
  const { statusTab, periodPreset, dayDate, customStart, customEnd, appliedQ } = filters;
  const { page, setPage, pageSize, setPageSize } = useListPagination(10);

  const commitQuery = useCallback(
    (next: string) => {
      setPage(1);
      setFilters((current) => ({ ...current, appliedQ: next }));
    },
    [setFilters, setPage],
  );
  const { search, setSearch } = useDebouncedListQuery({ appliedQ, onCommit: commitQuery });

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
  const showDayGroups = listSort === "business_date";
  const hideDateColumn = statusTab === "due" && periodPreset === "today";
  const isDueTab = statusTab === "due";

  const query = useQuery({
    queryKey: [
      "invoices",
      staff.membership.organization_id,
      page,
      pageSize,
      appliedQ,
      statusTab,
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
        ...(statusTab === "drafts" ? { status: "draft" as const } : {}),
        ...(statusTab === "due" || statusTab === "paid" ? { status: "finalized" as const } : {}),
        ...(statusTab === "due" ? { hasDue: true } : {}),
        ...(statusTab === "paid" ? { hasDue: false } : {}),
        ...(periodBounds.from ? { businessDateFrom: periodBounds.from } : {}),
        ...(periodBounds.to ? { businessDateTo: periodBounds.to } : {}),
      }),
    placeholderData: keepPreviousData,
  });

  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const periodActive = periodPreset !== "all";
  const filtersActive = Boolean(appliedQ) || statusTab !== "all" || periodActive;
  const { showInitialLoading, directoryEmpty, filteredEmpty, showDirectoryCard } = directoryListFlags({
    isLoading: query.isLoading,
    hasData: Boolean(query.data),
    total,
    itemCount: items.length,
    filtersActive,
  });
  const customRangeValue: DateRange | null =
    customStart && customEnd ? { start: customStart, end: customEnd } : null;
  const dayGroups = showDayGroups ? groupByBusinessDate(items) : null;
  const searchPending =
    search.trim() !== appliedQ || (query.isFetching && !query.isLoading && Boolean(query.data));
  const tableBusy = query.isFetching && Boolean(query.data);
  const hasOtherFilters = statusTab !== "all";

  function clearSearch() {
    setSearch("");
    setPage(1);
    setFilters((current) => ({ ...current, appliedQ: "" }));
  }

  function clearAllFilters() {
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

  function selectStatusTab(next: StatusTab) {
    setPage(1);
    setFilters((current) => ({ ...current, statusTab: next }));
  }

  function renderRow(item: InvoiceListItem) {
    const display = paymentDisplayStatus(item);
    const isDraft = item.status === "draft";
    const dueOpen = !isZeroMoney(item.amount_due_inr);
    const customerLine = item.customer_phone_display
      ? `${item.customer_display_name} · ${item.customer_phone_display}`
      : item.customer_display_name;

    return (
      <Table.Row
        key={item.id}
        id={item.id}
        href={isDueTab ? undefined : `/invoices/${item.id}`}
        className={cx(!isDueTab && "cursor-pointer")}
      >
        <Table.Cell truncate={false}>
          <div className="flex h-full flex-col justify-center gap-0.5 overflow-hidden">
            <span className="truncate font-mono text-md font-medium text-primary">
              {item.invoice_number ?? "Draft"}
            </span>
            <span className="truncate text-sm text-tertiary">{customerLine}</span>
          </div>
        </Table.Cell>
        {hideDateColumn ? null : (
          <Table.Cell className="text-md text-secondary">{formatListDate(item.business_date)}</Table.Cell>
        )}
        <Table.Cell className="text-right text-md tabular-nums text-secondary">{item.line_count}</Table.Cell>
        <Table.Cell>
          <Badge color={display.color} size="md" appearance={display.appearance}>
            {display.label}
          </Badge>
        </Table.Cell>
        <Table.Cell className="text-right text-md font-semibold tabular-nums">
          {isDraft ? (
            <span className="text-tertiary">Not priced</span>
          ) : (
            <MoneyText amount={item.grand_total_inr} />
          )}
        </Table.Cell>
        <Table.Cell className="text-right text-md tabular-nums">
          <MoneyText amount={item.amount_paid_inr} zero="dash" />
        </Table.Cell>
        <Table.Cell className="text-right text-md tabular-nums">
          {dueOpen ? (
            <span className="font-bold text-error-primary">
              <MoneyText amount={item.amount_due_inr} />
            </span>
          ) : (
            <MoneyText amount={item.amount_due_inr} zero="dash" />
          )}
        </Table.Cell>
        <Table.Cell truncate={false}>
          {isDraft ? (
            <Button color="link-color" size="md" href={`/invoices/${item.id}`} className="font-bold">
              Resume
            </Button>
          ) : isDueTab ? (
            <Button color="secondary" size="md" href={`/payments?invoice=${item.id}`}>
              Record payment
            </Button>
          ) : (
            <ChevronRight className="size-6 text-fg-quaternary" aria-hidden="true" />
          )}
        </Table.Cell>
      </Table.Row>
    );
  }

  return (
    <>
      {showInitialLoading ? <InvoicesListBodyLoading /> : null}

      {query.isError && !showDirectoryCard ? (
        <DirectoryError message={invoiceErrorMessage(query.error)} />
      ) : null}

      {directoryEmpty ? (
        <DirectoryEmptyState
          icon={Receipt}
          title="No invoices yet"
          description="Start a POS draft, scan available articles, then complete the sale when totals look right."
          action={
            <Button color="primary" size="lg" href="/invoices/new">
              New sale
            </Button>
          }
        />
      ) : null}

      {showDirectoryCard ? (
        <TableCard.Root>
          <TableCard.Header title="Invoices" badge={String(total)} />
          {query.isError ? (
            <div className="border-b border-secondary px-5 py-4 md:px-7">
              <DirectoryError message={invoiceErrorMessage(query.error)} />
            </div>
          ) : null}
          <div className="flex flex-col gap-0 border-b border-secondary">
            <div className="border-b border-primary px-5 py-5 md:px-7">
              <ListSearchField
                aria-label="Search invoices"
                size="lg"
                value={search}
                placeholder="Customer, phone or invoice number"
                onChange={setSearch}
                isPending={searchPending}
              />
            </div>

            <div className="px-5 py-4 md:px-7">
              <div className="flex flex-col gap-4 py-1 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0 overflow-x-auto">
                  <Tabs
                    selectedKey={statusTab}
                    onSelectionChange={(key) => {
                      if (typeof key === "string" && STATUS_TABS.some((tab) => tab.id === key)) {
                        selectStatusTab(key as StatusTab);
                      }
                    }}
                    className="w-max"
                  >
                    <Tabs.List type="underline" size="md" aria-label="Invoice status" className="gap-6">
                      {STATUS_TABS.map((tab) => (
                        <Tabs.Item key={tab.id} id={tab.id} label={tab.label} />
                      ))}
                    </Tabs.List>
                  </Tabs>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <ButtonGroup
                    size="lg"
                    selection="filter"
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
                  {periodPreset === "custom" ? (
                    <DateRangePicker
                      aria-label="Business date range"
                      size="lg"
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
              </div>
            </div>
          </div>

          {filteredEmpty ? (
            <FilteredEmptyState
              title={
                appliedQ
                  ? `No invoices match "${appliedQ}" ${periodPhrase(periodPreset)}`
                  : `No invoices ${periodPhrase(periodPreset)}`
              }
              description="Try All time, or search by phone or invoice number."
              hasSearch={Boolean(appliedQ)}
              hasPeriod={periodActive}
              hasOtherFilters={hasOtherFilters}
              onClear={clearAllFilters}
              onClearSearch={appliedQ ? clearSearch : undefined}
              onSearchAllTime={periodActive ? () => selectPeriod("all") : undefined}
            />
          ) : null}

          {items.length > 0 ? (
            <DirectoryTableBusy isBusy={tableBusy}>
              <Table aria-label="Invoices">
                <Table.Header>
                  <Table.Head id="number" label="Number" isRowHeader className="min-w-48" />
                  {hideDateColumn ? null : (
                    <Table.Head id="date" label="Date" className="min-w-28" />
                  )}
                  <Table.Head id="items" label="Items" className="w-20 text-right" />
                  <Table.Head id="status" label="Status" className="min-w-36" />
                  <Table.Head id="total" label="Total" className="min-w-28 text-right" />
                  <Table.Head id="paid" label="Paid" className="min-w-28 text-right" />
                  <Table.Head id="due" label="Due" className="min-w-28 text-right" />
                  <Table.Head id="action" label="" className="w-40" />
                </Table.Header>
                {!dayGroups ? (
                  <Table.Body items={items}>{(item) => renderRow(item)}</Table.Body>
                ) : null}
              </Table>
              {dayGroups
                ? dayGroups.map((group) => (
                    <div key={group.date}>
                      <div className="border-b border-secondary bg-secondary px-5 py-2.5 text-sm font-semibold text-primary md:px-7">
                        {formatDayLabel(group.date)}
                      </div>
                      <Table aria-label={`Invoices for ${group.date}`}>
                        <Table.Header className="hidden">
                          <Table.Head id="number" label="Number" isRowHeader className="min-w-48" />
                          {hideDateColumn ? null : (
                            <Table.Head id="date" label="Date" className="min-w-28" />
                          )}
                          <Table.Head id="items" label="Items" className="w-20 text-right" />
                          <Table.Head id="status" label="Status" className="min-w-36" />
                          <Table.Head id="total" label="Total" className="min-w-28 text-right" />
                          <Table.Head id="paid" label="Paid" className="min-w-28 text-right" />
                          <Table.Head id="due" label="Due" className="min-w-28 text-right" />
                          <Table.Head id="action" label="" className="w-40" />
                        </Table.Header>
                        <Table.Body items={group.rows}>{(item) => renderRow(item)}</Table.Body>
                      </Table>
                    </div>
                  ))
                : null}
              {isDueTab ? (
                <p className="border-t border-secondary px-5 py-3 text-sm text-tertiary md:px-7">
                  Payment opens on Payments with this invoice already allocated.
                </p>
              ) : null}
              <ListTableFooter
                page={page}
                pageSize={pageSize}
                totalPages={totalPages}
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
