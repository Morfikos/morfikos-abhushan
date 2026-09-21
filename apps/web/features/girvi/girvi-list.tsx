"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { CalendarDate, DateValue } from "@internationalized/date";
import { parseDate } from "@internationalized/date";
import type { GirviAccountStatus } from "@aabhushan/contracts";
import { ChevronRight, Scale01 } from "@untitledui/icons";
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
import { StaffPageHeader } from "@/components/shared/staff-page-header";
import { type ListFilterCodec, useSyncedListFilters } from "@/lib/list-search-params";
import { staffHasPermission, useStaff } from "@/features/auth/staff-shell";
import {
  girviAccessToken,
  girviErrorMessage,
  girviStatusBadgeColor,
  girviStatusLabel,
} from "@/features/girvi/girvi-shared";
import { MoneyText } from "@/components/shared/money-text";
import { formatInr } from "@/lib/money";
import {
  boundsForPeriod,
  customPeriodFromParams,
  kolkataTodayCalendar,
  type PeriodPreset,
} from "@/lib/period-bounds";
import { fetchGirviAccounts } from "@/lib/staff-api";

/** Live order: Maturity period ButtonGroup + date, then search + status + overdue. */
export function GirviFilterSkeleton() {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-4 w-16" />
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
        <LabeledControlSkeleton controlWidth="w-36" />
      </div>
    </>
  );
}

/** Body-only loader: Suspense fallback and showInitialLoading (header stays live). */
export function GirviListBodyLoading() {
  return (
    <DirectoryTableSkeleton
      title="Accounts"
      columns={7}
      label="Loading Girvi accounts"
      filterSkeleton={<GirviFilterSkeleton />}
    />
  );
}

/** @deprecated Prefer GirviListBodyLoading — alias kept for call-site clarity. */
export function GirviDirectoryLoading() {
  return <GirviListBodyLoading />;
}

const DEFAULT_STATUS: GirviAccountStatus = "active";
const GIRVI_STATUSES: GirviAccountStatus[] = ["draft", "active", "settled", "released"];

function girviStatusFromParam(value: string | null): GirviAccountStatus | null {
  return GIRVI_STATUSES.find((status) => status === value) ?? null;
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

type GirviListFilters = {
  status: "" | GirviAccountStatus;
  overdueOnly: boolean;
  periodPreset: PeriodPreset;
  dayDate: CalendarDate;
  customStart: CalendarDate | null;
  customEnd: CalendarDate | null;
};

const girviListDefaults: GirviListFilters = {
  status: DEFAULT_STATUS,
  overdueOnly: false,
  periodPreset: "all",
  dayDate: kolkataTodayCalendar(),
  customStart: null,
  customEnd: null,
};

const girviListCodec: ListFilterCodec<GirviListFilters> = {
  ownedKeys: ["status", "overdue", "from", "to"],
  defaults: girviListDefaults,
  parse(params) {
    const drilledPeriod = customPeriodFromParams(params.get("from"), params.get("to"));
    const drilledStatus = girviStatusFromParam(params.get("status"));
    return {
      status: drilledStatus ?? DEFAULT_STATUS,
      overdueOnly: params.get("overdue") === "1",
      periodPreset: drilledPeriod?.preset ?? "all",
      dayDate: kolkataTodayCalendar(),
      customStart: drilledPeriod?.customStart ?? null,
      customEnd: drilledPeriod?.customEnd ?? null,
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
            clampEndToToday: false,
          });
    return {
      status: value.status || undefined,
      overdue: value.overdueOnly ? "1" : undefined,
      from: period.from,
      to: period.to,
    };
  },
  chips(value) {
    const chips = [];
    if (value.status !== DEFAULT_STATUS) {
      chips.push({
        id: "status",
        label: value.status ? `Status: ${girviStatusLabel(value.status, false)}` : "Status: All",
      });
    }
    if (value.overdueOnly) {
      chips.push({ id: "overdue", label: "Overdue" });
    }
    if (value.periodPreset !== "all") {
      const bounds = boundsForPeriod({
        preset: value.periodPreset,
        dayDate: value.dayDate,
        customStart: value.customStart,
        customEnd: value.customEnd,
        clampEndToToday: false,
      });
      if (bounds.from && bounds.to) {
        chips.push({
          id: "period",
          label:
            bounds.from === bounds.to
              ? `Maturity: ${bounds.from}`
              : `Maturity: ${bounds.from}–${bounds.to}`,
        });
      }
    }
    return chips;
  },
};

export function GirviList() {
  const staff = useStaff();
  const router = useRouter();
  const allowed = staffHasPermission(staff, "girvi.write");

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
        title="Girvi"
        description="Customer collateral in custody. Packets are never saleable inventory."
        icon={Scale01}
        actions={
          <Button color="primary" size="md" href="/girvi/new">
            New Girvi
          </Button>
        }
      />
      <Suspense fallback={<GirviListBodyLoading />}>
        <GirviListBody />
      </Suspense>
    </section>
  );
}

function GirviListBody() {
  const staff = useStaff();
  const { filters, setFilters, chips } = useSyncedListFilters("/girvi", girviListCodec);
  const { status: statusFilter, overdueOnly, periodPreset, dayDate, customStart, customEnd } = filters;
  const overdueFilter = overdueOnly ? "overdue" : "";
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");
  const [appliedQ, setAppliedQ] = useState("");

  const periodBounds = useMemo(
    () =>
      boundsForPeriod({
        preset: periodPreset,
        dayDate,
        customStart,
        customEnd,
        clampEndToToday: false,
      }),
    [customEnd, customStart, dayDate, periodPreset],
  );

  const periodActive = periodPreset !== "all";
  const listSort = periodActive ? "maturity_business_date" : "created_at";
  const listDirection = periodActive ? "asc" : "desc";

  const query = useQuery({
    queryKey: [
      "girvi-accounts",
      staff.membership.organization_id,
      page,
      pageSize,
      appliedQ,
      statusFilter,
      overdueFilter,
      periodBounds.from ?? "",
      periodBounds.to ?? "",
      listSort,
      listDirection,
    ],
    queryFn: async () =>
      fetchGirviAccounts(await girviAccessToken(), {
        page,
        pageSize,
        sort: listSort,
        direction: listDirection,
        ...(appliedQ ? { q: appliedQ } : {}),
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(overdueFilter === "overdue" ? { isOverdue: true } : {}),
        ...(periodBounds.from ? { maturityFrom: periodBounds.from } : {}),
        ...(periodBounds.to ? { maturityTo: periodBounds.to } : {}),
      }),
    placeholderData: keepPreviousData,
  });

  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const filtersActive =
    Boolean(appliedQ) ||
    statusFilter !== DEFAULT_STATUS ||
    overdueFilter === "overdue" ||
    periodActive;
  const directoryEmpty = !query.isLoading && total === 0 && !filtersActive;
  const filteredEmpty = !query.isLoading && items.length === 0 && filtersActive;
  const showInitialLoading = query.isLoading && !query.data;
  const showDirectoryCard = !directoryEmpty && !showInitialLoading;
  const customRangeValue: DateRange | null =
    customStart && customEnd ? { start: customStart, end: customEnd } : null;

  function applySearch() {
    setPage(1);
    setAppliedQ(search.trim());
  }

  function clearFilters() {
    setSearch("");
    setAppliedQ("");
    setFilters({ ...girviListDefaults, dayDate: kolkataTodayCalendar() });
    setPage(1);
  }

  function selectPeriod(next: PeriodPreset) {
    setPage(1);
    setFilters((current) => {
      const updated: GirviListFilters = { ...current, periodPreset: next };
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
      {showInitialLoading ? <GirviListBodyLoading /> : null}

      {query.isError ? (
        <p className="text-sm text-error-primary" role="alert">
          {girviErrorMessage(query.error)}
        </p>
      ) : null}

      {directoryEmpty ? (
        <DirectoryEmptyState
          icon={Scale01}
          title="No Girvi accounts yet"
          description="Open an account to record customer jewellery held as collateral and the amount disbursed. Interest uses the rate set when the account is activated."
          action={
            <Button color="primary" size="md" href="/girvi/new">
              New Girvi
            </Button>
          }
        />
      ) : null}

      {showDirectoryCard ? (
        <TableCard.Root>
          <TableCard.Header title="Accounts" badge={String(total)} />
          <div className="flex flex-col gap-3 border-b border-secondary px-4 py-4 md:px-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-secondary">Maturity</span>
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
                  aria-label="Maturity date"
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
                  aria-label="Maturity date range"
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
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-0 flex-1">
                <ListSearchToolbar
                  value={search}
                  onChange={setSearch}
                  onSearch={applySearch}
                  onClear={clearFilters}
                  filtersActive={filtersActive}
                  placeholder="Account or customer"
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
                      status:
                        value === "draft" ||
                        value === "active" ||
                        value === "settled" ||
                        value === "released"
                          ? value
                          : "",
                    }));
                  }}
                  options={[
                    { label: "All statuses", value: "" },
                    { label: "Draft", value: "draft" },
                    { label: "Active", value: "active" },
                    { label: "Settled · awaiting release", value: "settled" },
                    { label: "Released", value: "released" },
                  ]}
                />
              </div>
              <div className="w-36">
                <SelectField
                  label="Overdue"
                  value={overdueFilter}
                  onChange={(value) => {
                    setPage(1);
                    setFilters((current) => ({ ...current, overdueOnly: value === "overdue" }));
                  }}
                  options={[
                    { label: "All", value: "" },
                    { label: "Overdue", value: "overdue" },
                  ]}
                />
              </div>
            </div>
            <ActiveFiltersBar
              chips={chips}
              onClear={() => setFilters({ ...girviListDefaults, dayDate: kolkataTodayCalendar() })}
            />
          </div>

          {filteredEmpty ? (
            <FilteredEmptyState
              title="No matching accounts"
              description="Try another account, customer, status, overdue, or maturity period."
              onClear={clearFilters}
            />
          ) : null}

          {items.length > 0 ? (
            <>
              <Table aria-label="Girvi accounts">
                <Table.Header>
                  <Table.Head id="account" label="Account" isRowHeader />
                  <Table.Head id="customer" label="Customer" />
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
                      <Table.Cell>{item.customer_display_name}</Table.Cell>
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
                        <Badge color={girviStatusBadgeColor(item.status, item.is_overdue)} size="sm">
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
