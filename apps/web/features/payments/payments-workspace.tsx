"use client";

import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import type { Payment, PaymentMethod } from "@aabhushan/contracts";
import type { CalendarDate, DateValue } from "@internationalized/date";
import { parseDate } from "@internationalized/date";
import { ChevronRight, CoinsHand } from "@untitledui/icons";
import type { DateRange } from "react-aria-components";

import { DatePicker } from "@/components/application/date-picker/date-picker";
import { DateRangePicker } from "@/components/application/date-picker/date-range-picker";
import { MetricTilesSkeleton, Skeleton } from "@/components/application/skeleton/skeleton";
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
import { SectionCard } from "@/components/shared/section-card";
import { SelectField } from "@/components/shared/select-field";
import { StaffPageHeader } from "@/components/shared/staff-page-header";
import { type ListFilterCodec, useSyncedListFilters } from "@/lib/list-search-params";
import { staffHasPermission, useStaff } from "@/features/auth/staff-shell";
import { PaymentDetailDialog } from "@/features/payments/payment-detail-dialog";
import {
  boundsForPeriod,
  customPeriodFromParams,
  kolkataTodayCalendar,
  periodCaption,
  type PeriodPreset,
} from "@/features/payments/payment-period";
import { paymentAccessToken, paymentErrorMessage, paymentKindLabel } from "@/features/payments/payment-shared";
import { RecordPaymentDialog } from "@/features/payments/record-payment-dialog";
import { formatInr } from "@/lib/money";
import { paymentMethodLabel, paymentMethodOptions } from "@/lib/payment-methods";
import { fetchCustomer, fetchDailyCollections, fetchInvoice, fetchPayments } from "@/lib/staff-api";

/** Live Collections filters: search + method select. */
export function PaymentsFilterSkeleton() {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <Skeleton className="h-10 min-w-0 max-w-md flex-1 rounded-lg" />
      <Skeleton className="h-10 w-40 rounded-lg" />
    </div>
  );
}

/**
 * Route Suspense cold load: header + collections metrics card + table.
 * Feature keeps live header / period controls and only skeletons metrics + table.
 */
export function PaymentsWorkspaceLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading payments</span>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="h-10 w-36 rounded-lg" />
      </div>
      <SectionCard>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-9 w-16 rounded-lg" />
            <Skeleton className="h-9 w-16 rounded-lg" />
            <Skeleton className="h-9 w-16 rounded-lg" />
            <Skeleton className="h-9 w-20 rounded-lg" />
            <Skeleton className="h-9 w-20 rounded-lg" />
            <Skeleton className="h-10 w-40 rounded-lg" />
          </div>
        </div>
        <MetricTilesSkeleton count={5} tone="secondary" label="Loading collections" />
      </SectionCard>
      <DirectoryTableSkeleton
        title="Collections"
        columns={8}
        label="Loading payments"
        filterSkeleton={<PaymentsFilterSkeleton />}
      />
    </div>
  );
}

const PERIOD_PRESETS: { id: PeriodPreset; label: string }[] = [
  { id: "all", label: "All" },
  { id: "today", label: "Today" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "custom", label: "Custom" },
];

function allocationSummary(payment: Payment): string {
  if (payment.allocations.length === 0) {
    return "—";
  }
  const numbers = payment.allocations.map(
    (allocation) => allocation.invoice_number ?? allocation.invoice_id.slice(0, 8),
  );
  if (numbers.length <= 2) {
    return numbers.join(", ");
  }
  return `${numbers.slice(0, 2).join(", ")} +${String(numbers.length - 2)}`;
}

function asCalendarDate(value: DateValue | null | undefined): CalendarDate | null {
  if (!value) {
    return null;
  }
  return parseDate(value.toString());
}

type PaymentPeriodFilters = {
  periodPreset: PeriodPreset;
  dayDate: CalendarDate;
  customStart: CalendarDate | null;
  customEnd: CalendarDate | null;
};

const paymentPeriodDefaults: PaymentPeriodFilters = {
  periodPreset: "all",
  dayDate: kolkataTodayCalendar(),
  customStart: null,
  customEnd: null,
};

const paymentPeriodCodec: ListFilterCodec<PaymentPeriodFilters> = {
  ownedKeys: ["from", "to"],
  defaults: paymentPeriodDefaults,
  parse(params) {
    const drilledPeriod = customPeriodFromParams(params.get("from"), params.get("to"));
    return {
      periodPreset: drilledPeriod?.preset ?? "all",
      dayDate: kolkataTodayCalendar(),
      customStart: drilledPeriod?.customStart ?? null,
      customEnd: drilledPeriod?.customEnd ?? null,
    };
  },
  serialize(value) {
    if (value.periodPreset === "all") {
      return { from: undefined, to: undefined };
    }
    const bounds = boundsForPeriod({
      preset: value.periodPreset,
      dayDate: value.dayDate,
      customStart: value.customStart,
      customEnd: value.customEnd,
    });
    return { from: bounds.from, to: bounds.to };
  },
  chips(value) {
    if (value.periodPreset === "all") {
      return [];
    }
    const bounds = boundsForPeriod({
      preset: value.periodPreset,
      dayDate: value.dayDate,
      customStart: value.customStart,
      customEnd: value.customEnd,
    });
    if (!bounds.from || !bounds.to) {
      return [];
    }
    return [
      {
        id: "period",
        label:
          bounds.from === bounds.to ? `Period: ${bounds.from}` : `Period: ${bounds.from}–${bounds.to}`,
      },
    ];
  },
};

export function PaymentsWorkspace() {
  const staff = useStaff();
  const router = useRouter();
  const searchParams = useSearchParams();
  const allowed = staffHasPermission(staff, "payments.write");
  const prefillCustomerId = searchParams.get("customer");
  const prefillInvoiceId = searchParams.get("invoice");
  const { filters: periodFilters, setFilters: setPeriodFilters, chips } = useSyncedListFilters(
    "/payments",
    paymentPeriodCodec,
  );
  const { periodPreset, dayDate, customStart, customEnd } = periodFilters;

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");
  const [appliedQ, setAppliedQ] = useState("");
  const [methodFilter, setMethodFilter] = useState("");
  const [recordOpen, setRecordOpen] = useState(false);
  const [detailPaymentId, setDetailPaymentId] = useState<string | null>(null);

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

  useEffect(() => {
    if (!allowed) {
      router.replace("/access-denied");
    }
  }, [allowed, router]);

  const prefillInvoice = useQuery({
    queryKey: ["invoices", staff.membership.organization_id, prefillInvoiceId ?? ""],
    queryFn: async () => fetchInvoice(await paymentAccessToken(), prefillInvoiceId ?? ""),
    enabled: allowed && Boolean(prefillInvoiceId),
  });

  const prefillCustomerKey = prefillCustomerId ?? prefillInvoice.data?.customer_id ?? "";
  const prefillCustomer = useQuery({
    queryKey: ["customers", "detail", staff.membership.organization_id, prefillCustomerKey],
    queryFn: async () => fetchCustomer(await paymentAccessToken(), prefillCustomerKey),
    enabled: allowed && Boolean(prefillCustomerKey),
  });

  useEffect(() => {
    if (!prefillCustomerId && !prefillInvoiceId) {
      return;
    }
    if (prefillCustomer.data) {
      setRecordOpen(true);
    }
  }, [prefillCustomer.data, prefillCustomerId, prefillInvoiceId]);

  const collections = useQuery({
    queryKey: [
      "payments",
      "collections",
      staff.membership.organization_id,
      periodBounds.from ?? "",
      periodBounds.to ?? "",
    ],
    queryFn: async () =>
      fetchDailyCollections(await paymentAccessToken(), {
        ...(periodBounds.from ? { from: periodBounds.from } : {}),
        ...(periodBounds.to ? { to: periodBounds.to } : {}),
      }),
    enabled: allowed,
    placeholderData: keepPreviousData,
  });

  const payments = useQuery({
    queryKey: [
      "payments",
      "list",
      staff.membership.organization_id,
      page,
      pageSize,
      appliedQ,
      methodFilter,
      periodBounds.from ?? "",
      periodBounds.to ?? "",
    ],
    queryFn: async () =>
      fetchPayments(await paymentAccessToken(), {
        page,
        pageSize,
        sort: "received_at",
        direction: "desc",
        ...(appliedQ ? { q: appliedQ } : {}),
        ...(methodFilter ? { method: methodFilter as PaymentMethod } : {}),
        ...(periodBounds.from ? { receivedBusinessDateFrom: periodBounds.from } : {}),
        ...(periodBounds.to ? { receivedBusinessDateTo: periodBounds.to } : {}),
      }),
    enabled: allowed,
    placeholderData: keepPreviousData,
  });

  const items = payments.data?.items ?? [];
  const total = payments.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const periodActive = periodPreset !== "all";
  const filtersActive = Boolean(appliedQ) || Boolean(methodFilter) || periodActive;
  const ledgerEmpty = !payments.isLoading && total === 0 && !filtersActive;
  const filteredEmpty = !payments.isLoading && items.length === 0 && filtersActive;
  const showInitialLoading = payments.isLoading && !payments.data;
  const methodRows = useMemo(() => collections.data?.methods ?? [], [collections.data]);
  const caption = periodCaption(periodPreset, periodBounds);
  const customRangeValue: DateRange | null =
    customStart && customEnd ? { start: customStart, end: customEnd } : null;

  if (!allowed) {
    return null;
  }

  function applySearch() {
    setPage(1);
    setAppliedQ(search.trim());
  }

  function clearFilters() {
    setSearch("");
    setAppliedQ("");
    setMethodFilter("");
    setPeriodFilters({ ...paymentPeriodDefaults, dayDate: kolkataTodayCalendar() });
    setPage(1);
  }

  function selectPeriod(next: PeriodPreset) {
    setPage(1);
    setPeriodFilters((current) => {
      const updated: PaymentPeriodFilters = { ...current, periodPreset: next };
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

  function closeRecordDialog() {
    setRecordOpen(false);
    if (prefillCustomerId || prefillInvoiceId) {
      router.replace("/payments");
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <StaffPageHeader
        title="Payments"
        description="Manually verified collections against sales invoices. Girvi principal and interest are settled separately."
        actions={
          <Button color="primary" size="md" onPress={() => setRecordOpen(true)}>
            Record payment
          </Button>
        }
      />

      <SectionCard>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-primary">Collections received</h2>
            <p className="text-sm text-tertiary">{caption}</p>
          </div>
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
                    setPeriodFilters((current) => ({ ...current, dayDate: next }));
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
                  setPeriodFilters((current) => ({ ...current, customStart: start, customEnd: end }));
                }}
              />
            ) : null}
          </div>
        </div>

        {collections.isError ? (
          <p className="text-sm text-error-primary" role="alert">
            {paymentErrorMessage(collections.error)}
          </p>
        ) : null}

        {collections.isLoading && !collections.data ? (
          <MetricTilesSkeleton count={5} tone="secondary" label="Loading collections" />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {methodRows.map((row) => (
              <div key={row.method} className="rounded-lg bg-secondary px-3 py-3 ring-1 ring-secondary">
                <p className="text-sm text-tertiary">{paymentMethodLabel(row.method)}</p>
                <p className="text-lg font-semibold tabular-nums text-primary">{formatInr(row.amount_inr)}</p>
                <p className="text-xs text-tertiary">
                  {row.payment_count} {row.payment_count === 1 ? "receipt" : "receipts"}
                </p>
              </div>
            ))}
            <div className="rounded-lg bg-brand-primary px-3 py-3">
              <p className="text-sm font-medium text-brand-secondary">Total collected</p>
              <p className="text-lg font-semibold tabular-nums text-brand-primary">
                {formatInr(collections.data?.total_inr ?? "0.00")}
              </p>
              <p className="text-xs text-brand-secondary">
                {collections.data?.payment_count ?? 0} posted
              </p>
            </div>
          </div>
        )}
      </SectionCard>

      {showInitialLoading ? (
        <DirectoryTableSkeleton
          title="Collections"
          columns={8}
          label="Loading payments"
          filterSkeleton={<PaymentsFilterSkeleton />}
        />
      ) : null}

      {payments.isError ? (
        <p className="text-sm text-error-primary" role="alert">
          {paymentErrorMessage(payments.error)}
        </p>
      ) : null}

      {ledgerEmpty && !showInitialLoading ? (
        <DirectoryEmptyState
          icon={CoinsHand}
          title="No collections yet"
          description="Record a collection against a finalized invoice. Counter tenders taken at finalization appear here too."
          action={
            <Button color="primary" size="md" onPress={() => setRecordOpen(true)}>
              Record payment
            </Button>
          }
        />
      ) : null}

      {!ledgerEmpty && !showInitialLoading ? (
        <TableCard.Root>
          <TableCard.Header title="Collections" badge={String(total)} />
          <div className="flex flex-col gap-3 border-b border-secondary px-4 py-4 md:px-6">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1">
                <ListSearchToolbar
                  value={search}
                  onChange={setSearch}
                  onSearch={applySearch}
                  onClear={clearFilters}
                  filtersActive={filtersActive}
                  placeholder="Receipt, customer, invoice, or reference"
                />
              </div>
              <div className="w-40">
                <SelectField
                  label="Method"
                  value={methodFilter}
                  onChange={(value) => {
                    setMethodFilter(value);
                    setPage(1);
                  }}
                  options={[{ label: "All methods", value: "" }, ...paymentMethodOptions()]}
                />
              </div>
            </div>
            <ActiveFiltersBar
              chips={chips}
              onClear={() => setPeriodFilters({ ...paymentPeriodDefaults, dayDate: kolkataTodayCalendar() })}
            />
          </div>

          {filteredEmpty ? (
            <FilteredEmptyState
              title="No matching collections"
              description="Try another receipt number, customer, method, or period."
              onClear={clearFilters}
            />
          ) : null}

          {items.length > 0 ? (
            <>
              <Table aria-label="Collections">
                <Table.Header>
                  <Table.Head id="receipt" label="Receipt" isRowHeader className="w-32" />
                  <Table.Head id="date" label="Business date" className="w-36" />
                  <Table.Head id="customer" label="Customer" />
                  <Table.Head id="kind" label="Type" className="w-28" />
                  <Table.Head id="method" label="Method" className="w-28" />
                  <Table.Head id="invoices" label="Invoices" className="w-40" />
                  <Table.Head id="amount" label="Amount" className="w-32 text-right" />
                  <Table.Head id="open" label="" />
                </Table.Header>
                <Table.Body items={items}>
                  {(payment) => (
                    <Table.Row
                      id={payment.id}
                      className="cursor-pointer"
                      onAction={() => setDetailPaymentId(payment.id)}
                    >
                      <Table.Cell className="font-mono text-sm">{payment.receipt_number ?? "Pending"}</Table.Cell>
                      <Table.Cell className="tabular-nums">{payment.received_business_date}</Table.Cell>
                      <Table.Cell>{payment.customer_display_name}</Table.Cell>
                      <Table.Cell>
                        <Badge color={payment.kind === "collection" ? "brand" : "gray"} size="sm">
                          {paymentKindLabel(payment.kind)}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell>
                        <Badge color="gray" size="sm" type="modern">
                          {paymentMethodLabel(payment.method)}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell className="font-mono text-xs">{allocationSummary(payment)}</Table.Cell>
                      <Table.Cell className="text-right tabular-nums">{formatInr(payment.amount_inr)}</Table.Cell>
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

      <RecordPaymentDialog
        isOpen={recordOpen}
        initialCustomer={prefillCustomer.data ?? null}
        initialInvoiceId={prefillInvoiceId ?? null}
        onClose={closeRecordDialog}
      />

      <PaymentDetailDialog paymentId={detailPaymentId} onClose={() => setDetailPaymentId(null)} />
    </section>
  );
}
