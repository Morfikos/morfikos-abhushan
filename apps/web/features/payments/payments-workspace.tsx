"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import type { CollectionsByMethodRow, Payment, PaymentMethod } from "@aabhushan/contracts";
import type { CalendarDate, DateValue } from "@internationalized/date";
import { parseDate } from "@internationalized/date";
import { Check, ChevronRight, CoinsHand, CreditCard02 } from "@untitledui/icons";
import type { DateRange } from "react-aria-components";

import { DateRangePicker } from "@/components/application/date-picker/date-range-picker";
import { Skeleton } from "@/components/application/skeleton/skeleton";
import { Table, TableCard } from "@/components/application/table/table";
import { Tabs } from "@/components/application/tabs/tabs";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { ButtonGroup, ButtonGroupItem } from "@/components/base/button-group/button-group";
import { ActiveFiltersBar } from "@/components/shared/active-filters-bar";
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
import { staffHasPermission, useStaff } from "@/features/auth/staff-shell";
import { PaymentDetailDialog } from "@/features/payments/payment-detail-dialog";
import {
  boundsForPeriod,
  customPeriodFromParams,
  kolkataTodayCalendar,
  type PeriodPreset,
} from "@/features/payments/payment-period";
import {
  paymentAccessToken,
  paymentErrorMessage,
  paymentKindLabel,
} from "@/features/payments/payment-shared";
import { RecordPaymentDialog } from "@/features/payments/record-payment-dialog";
import {
  type ListFilterChip,
  type ListFilterCodec,
  useDebouncedListQuery,
  useListPagination,
  useSyncedListFilters,
} from "@/lib/list-search-params";
import { isZeroMoney } from "@/lib/money";
import { PAYMENT_METHODS, paymentMethodBadgeColor, paymentMethodLabel } from "@/lib/payment-methods";
import {
  fetchCollectionsReport,
  fetchCustomer,
  fetchInvoice,
  fetchInvoices,
  fetchPayments,
} from "@/lib/staff-api";
import { cx } from "@/utils/cx";

type TypeTab = "all" | "collection" | "refund" | "reversal";

const TYPE_TABS: { id: TypeTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "collection", label: "Collections" },
  { id: "refund", label: "Refunds" },
  { id: "reversal", label: "Reversals" },
];

const PERIOD_PRESETS: { id: PeriodPreset; label: string }[] = [
  { id: "all", label: "All time" },
  { id: "today", label: "Today" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "custom", label: "Custom" },
];

/** Search + type tabs strip for the collections card. */
export function PaymentsFilterSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-12 w-full rounded-lg" />
      <div className="flex gap-6">
        <Skeleton className="h-9 w-14 rounded-md" />
        <Skeleton className="h-9 w-28 rounded-md" />
        <Skeleton className="h-9 w-24 rounded-md" />
        <Skeleton className="h-9 w-28 rounded-md" />
      </div>
    </div>
  );
}

/** Period controls for the live header (and Suspense fallback so the header does not jump). */
function PaymentsPeriodActionsSkeleton() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex gap-1">
        {PERIOD_PRESETS.map((preset) => (
          <Skeleton key={preset.id} className="h-11 w-20 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-11 w-40 rounded-lg" />
    </div>
  );
}

/** Body-only loader: Suspense fallback (header stays live when outside). */
export function PaymentsWorkspaceLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading payments</span>
      <div className="grid grid-cols-2 overflow-hidden rounded-xl ring-1 ring-primary sm:grid-cols-5">
        <Skeleton className="min-h-[5.5rem] rounded-none bg-primary-solid/80 sm:col-span-1" />
        {PAYMENT_METHODS.map((method) => (
          <Skeleton key={method} className="min-h-[5.5rem] rounded-none border-l border-secondary" />
        ))}
      </div>
      <DirectoryTableSkeleton
        columns={6}
        label="Loading payments"
        filterSkeleton={<PaymentsFilterSkeleton />}
      />
    </div>
  );
}

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

/** Shared widths for header + day-group tables (`table-fixed`) so columns stay aligned. */
const COLLECTIONS_TABLE_CLASS = "table-fixed";
const COLLECTIONS_COL = {
  receipt: "w-[12%] px-5",
  customer: "w-[28%] px-5",
  invoices: "w-[22%] min-w-0 px-5",
  method: "w-[14%] px-5",
  amount: "w-[16%] px-5 text-right",
  amountHead: "w-[16%] px-5 text-right [&>div]:w-full [&>div]:justify-end",
  open: "w-[8%] px-5",
} as const;

function CollectionsColumnHeads() {
  return (
    <>
      <Table.Head id="receipt" label="Receipt" isRowHeader className={COLLECTIONS_COL.receipt} />
      <Table.Head id="customer" label="Customer" className={COLLECTIONS_COL.customer} />
      <Table.Head id="invoices" label="Invoices" className={COLLECTIONS_COL.invoices} />
      <Table.Head id="method" label="Method" className={COLLECTIONS_COL.method} />
      <Table.Head id="amount" label="Amount" className={COLLECTIONS_COL.amountHead} />
      <Table.Head id="open" label="" className={COLLECTIONS_COL.open} />
    </>
  );
}

function asCalendarDate(value: DateValue | null | undefined): CalendarDate | null {
  if (!value) {
    return null;
  }
  return parseDate(value.toString());
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

function formatPeriodEmptyLabel(preset: PeriodPreset, bounds: { from?: string; to?: string }): string {
  if (preset === "today" && bounds.from) {
    return `Today · ${formatDayLabel(bounds.from)}`;
  }
  if (preset === "week") {
    return "This week";
  }
  if (preset === "month") {
    return "This month";
  }
  if (preset === "custom" && bounds.from && bounds.to) {
    return bounds.from === bounds.to
      ? formatDayLabel(bounds.from)
      : `${formatDayLabel(bounds.from)} – ${formatDayLabel(bounds.to)}`;
  }
  return "This period";
}

function methodCaption(row: CollectionsByMethodRow | undefined): string {
  if (!row) {
    return "";
  }
  if (row.outflow_count > 0) {
    return `${String(row.collection_count)} in · ${String(row.outflow_count)} out`;
  }
  if (row.collection_count === 0) {
    return "";
  }
  return `${String(row.collection_count)} ${row.collection_count === 1 ? "receipt" : "receipts"}`;
}

function groupByBusinessDate(items: Payment[]): Array<{ date: string; rows: Payment[] }> {
  const groups: Array<{ date: string; rows: Payment[] }> = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.date === item.received_business_date) {
      last.rows.push(item);
    } else {
      groups.push({ date: item.received_business_date, rows: [item] });
    }
  }
  return groups;
}

type PaymentListFilters = {
  periodPreset: PeriodPreset;
  dayDate: CalendarDate;
  customStart: CalendarDate | null;
  customEnd: CalendarDate | null;
  method: PaymentMethod | "";
  appliedQ: string;
};

const paymentListDefaults: PaymentListFilters = {
  periodPreset: "all",
  dayDate: kolkataTodayCalendar(),
  customStart: null,
  customEnd: null,
  method: "",
  appliedQ: "",
};

const paymentListCodec: ListFilterCodec<PaymentListFilters> = {
  ownedKeys: ["from", "to", "method", "q"],
  defaults: paymentListDefaults,
  parse(params) {
    const drilledPeriod = customPeriodFromParams(params.get("from"), params.get("to"));
    const methodRaw = params.get("method");
    const method =
      methodRaw === "cash" || methodRaw === "upi" || methodRaw === "card" || methodRaw === "bank"
        ? methodRaw
        : "";
    return {
      periodPreset: drilledPeriod?.preset ?? "all",
      dayDate: kolkataTodayCalendar(),
      customStart: drilledPeriod?.customStart ?? null,
      customEnd: drilledPeriod?.customEnd ?? null,
      method,
      appliedQ: params.get("q")?.trim() ?? "",
    };
  },
  serialize(value) {
    const period =
      value.periodPreset === "all"
        ? { from: undefined as string | undefined, to: undefined as string | undefined }
        : boundsForPeriod({
            preset: value.periodPreset,
            dayDate: value.dayDate,
            customStart: value.customStart,
            customEnd: value.customEnd,
          });
    return {
      from: period.from,
      to: period.to,
      method: value.method || undefined,
      q: value.appliedQ || undefined,
    };
  },
  chips(value) {
    const result: ListFilterChip[] = [];
    if (value.appliedQ) {
      result.push({ id: "q", label: `“${value.appliedQ}”` });
    }
    return result;
  },
};

export function PaymentsWorkspace() {
  const staff = useStaff();
  const router = useRouter();
  const allowed = staffHasPermission(staff, "payments.write");

  useEffect(() => {
    if (!allowed) {
      router.replace("/access-denied");
    }
  }, [allowed, router]);

  if (!allowed) {
    return null;
  }

  return (
    <Suspense
      fallback={
        <section className="flex flex-col gap-6">
          <StaffPageHeader
            title="Payments"
            description="Collections against sales invoices. Girvi is settled separately."
            icon={CreditCard02}
            actions={<PaymentsPeriodActionsSkeleton />}
          />
          <PaymentsWorkspaceLoading />
        </section>
      }
    >
      <PaymentsWorkspaceBody />
    </Suspense>
  );
}

function PaymentsWorkspaceBody() {
  const staff = useStaff();
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefillCustomerId = searchParams.get("customer");
  const prefillInvoiceId = searchParams.get("invoice");

  const { filters, setFilters, chips } = useSyncedListFilters("/payments", paymentListCodec);
  const { periodPreset, dayDate, customStart, customEnd, method: methodFilter, appliedQ } = filters;

  const { page, setPage, pageSize, setPageSize } = useListPagination(10);
  const commitQuery = useCallback(
    (next: string) => {
      setPage(1);
      setFilters((current) => ({ ...current, appliedQ: next }));
    },
    [setFilters, setPage],
  );
  const { search, setSearch } = useDebouncedListQuery({ appliedQ, onCommit: commitQuery });
  const [recordOpen, setRecordOpen] = useState(false);
  const [detailPaymentId, setDetailPaymentId] = useState<string | null>(null);
  const [highlightReceipt, setHighlightReceipt] = useState<string | null>(
    searchParams.get("highlight"),
  );

  useEffect(() => {
    if (!highlightReceipt) {
      return;
    }
    const handle = window.setTimeout(() => setHighlightReceipt(null), 4000);
    return () => window.clearTimeout(handle);
  }, [highlightReceipt]);

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

  const prefillInvoice = useQuery({
    queryKey: ["invoices", staff.membership.organization_id, prefillInvoiceId ?? ""],
    queryFn: async () => fetchInvoice(await paymentAccessToken(), prefillInvoiceId ?? ""),
    enabled: Boolean(prefillInvoiceId),
  });

  const prefillCustomerKey = prefillCustomerId ?? prefillInvoice.data?.customer_id ?? "";
  const prefillCustomer = useQuery({
    queryKey: ["customers", "detail", staff.membership.organization_id, prefillCustomerKey],
    queryFn: async () => fetchCustomer(await paymentAccessToken(), prefillCustomerKey),
    enabled: Boolean(prefillCustomerKey),
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
      "collections-report",
      staff.membership.organization_id,
      periodBounds.from ?? "",
      periodBounds.to ?? "",
    ],
    queryFn: async () =>
      fetchCollectionsReport(await paymentAccessToken(), {
        ...(periodBounds.from ? { from: periodBounds.from } : {}),
        ...(periodBounds.to ? { to: periodBounds.to } : {}),
      }),
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
        sort: "received_business_date",
        direction: "desc",
        ...(appliedQ ? { q: appliedQ } : {}),
        ...(methodFilter ? { method: methodFilter } : {}),
        ...(periodBounds.from ? { receivedBusinessDateFrom: periodBounds.from } : {}),
        ...(periodBounds.to ? { receivedBusinessDateTo: periodBounds.to } : {}),
      }),
    placeholderData: keepPreviousData,
  });

  const periodActive = periodPreset !== "all";
  const searchOrMethodActive = Boolean(appliedQ) || Boolean(methodFilter);
  const filtersActive = searchOrMethodActive || periodActive;

  const items = payments.data?.items ?? [];
  const total = payments.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const { showInitialLoading, directoryEmpty: ledgerEmpty } = directoryListFlags({
    isLoading: payments.isLoading,
    hasData: Boolean(payments.data),
    total,
    itemCount: items.length,
    filtersActive,
  });
  const periodEmpty =
    !payments.isLoading && total === 0 && periodActive && !searchOrMethodActive;
  const filteredEmpty =
    !payments.isLoading && items.length === 0 && searchOrMethodActive;

  const openDues = useQuery({
    queryKey: ["invoices", "open-dues", staff.membership.organization_id],
    queryFn: async () =>
      fetchInvoices(await paymentAccessToken(), {
        page: 1,
        pageSize: 5,
        sort: "business_date",
        direction: "desc",
        status: "finalized",
        hasDue: true,
      }),
    enabled: periodEmpty,
  });

  const byMethod = useMemo(() => {
    const map = new Map<PaymentMethod, CollectionsByMethodRow>();
    for (const row of collections.data?.by_method ?? []) {
      map.set(row.method, row);
    }
    return map;
  }, [collections.data]);

  const byDay = useMemo(() => {
    const map = new Map<string, { net: string; count: number }>();
    for (const row of collections.data?.by_business_date ?? []) {
      map.set(row.business_date, {
        net: row.net_collected_inr,
        count: row.collection_count + row.outflow_count,
      });
    }
    return map;
  }, [collections.data]);

  const dayGroups = useMemo(() => groupByBusinessDate(items), [items]);
  /** Report day nets disagree with a search-filtered table; method filter same. */
  const showDaySubtotals = !methodFilter && !appliedQ && Boolean(collections.data);
  const hasOutflows = (collections.data?.outflow_count ?? 0) > 0;
  const customRangeValue: DateRange | null =
    customStart && customEnd ? { start: customStart, end: customEnd } : null;
  const searchPending =
    search.trim() !== appliedQ ||
    (payments.isFetching && !payments.isLoading && Boolean(payments.data));
  const tableBusy = payments.isFetching && Boolean(payments.data);
  const showCollectionsCard = !ledgerEmpty && !periodEmpty && !showInitialLoading;

  function clearFilters() {
    setSearch("");
    setPage(1);
    setFilters({ ...paymentListDefaults, dayDate: kolkataTodayCalendar() });
  }

  function removeChip(id: string) {
    setPage(1);
    if (id === "q") {
      setSearch("");
      setFilters((current) => ({ ...current, appliedQ: "" }));
    }
  }

  function selectPeriod(next: PeriodPreset) {
    setPage(1);
    setFilters((current) => {
      const updated: PaymentListFilters = { ...current, periodPreset: next };
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

  function toggleMethod(method: PaymentMethod) {
    setPage(1);
    setFilters((current) => ({
      ...current,
      method: current.method === method ? "" : method,
    }));
  }

  function closeRecordDialog() {
    setRecordOpen(false);
    if (prefillCustomerId || prefillInvoiceId) {
      router.replace("/payments");
    }
  }

  function renderPaymentRow(payment: Payment) {
    const outflow = payment.kind === "refund" || payment.kind === "reversal";
    const highlighted =
      Boolean(highlightReceipt) &&
      (payment.receipt_number === highlightReceipt || payment.id === highlightReceipt);
    return (
      <Table.Row
        id={payment.id}
        className={cx("cursor-pointer", highlighted ? "bg-brand-primary" : undefined)}
        onAction={() => setDetailPaymentId(payment.id)}
      >
        <Table.Cell className={cx(COLLECTIONS_COL.receipt, "font-mono text-md font-semibold text-primary")}>
          {payment.receipt_number ?? "Pending"}
        </Table.Cell>
        <Table.Cell className={cx(COLLECTIONS_COL.customer, "text-md text-primary")}>
          {payment.customer_display_name}
        </Table.Cell>
        <Table.Cell className={cx(COLLECTIONS_COL.invoices, "font-mono text-sm text-secondary")}>
          {allocationSummary(payment)}
        </Table.Cell>
        <Table.Cell className={COLLECTIONS_COL.method} truncate={false}>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge color={paymentMethodBadgeColor(payment.method)} size="lg">
              {paymentMethodLabel(payment.method)}
            </Badge>
            {outflow ? (
              <Badge color="error" size="lg">
                {paymentKindLabel(payment.kind)}
              </Badge>
            ) : null}
          </div>
        </Table.Cell>
        <Table.Cell className={cx(COLLECTIONS_COL.amount, "text-right")}>
          <MoneyText
            amount={payment.amount_inr}
            sign={outflow ? "debit" : "auto"}
            className={cx("text-right text-md font-bold", !outflow && "text-primary")}
          />
        </Table.Cell>
        <Table.Cell className={COLLECTIONS_COL.open}>
          <ChevronRight className="size-6 text-fg-quaternary" aria-hidden="true" />
        </Table.Cell>
      </Table.Row>
    );
  }

  const periodActions = (
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
      <Button color="primary" size="lg" onPress={() => setRecordOpen(true)}>
        Record payment
      </Button>
    </div>
  );

  return (
    <section className="flex flex-col gap-6">
      <StaffPageHeader
        title="Payments"
        description="Collections against sales invoices. Girvi is settled separately."
        icon={CreditCard02}
        actions={periodActions}
      />

      {collections.isError ? (
        <p className="text-sm text-error-primary" role="alert">
          {paymentErrorMessage(collections.error)}
        </p>
      ) : null}

      {collections.isLoading && !collections.data ? (
        <div className="grid grid-cols-2 overflow-hidden rounded-xl ring-1 ring-primary sm:grid-cols-5">
          <Skeleton className="min-h-[5.5rem] rounded-none bg-primary-solid/80" />
          {PAYMENT_METHODS.map((method) => (
            <Skeleton key={method} className="min-h-[5.5rem] rounded-none border-l border-secondary" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 overflow-hidden rounded-xl bg-primary ring-1 ring-primary sm:grid-cols-5">
          <div className="bg-primary-solid px-5 py-4 text-white sm:col-span-1">
            <p className="text-sm font-semibold tracking-wide text-white/70 uppercase">
              {hasOutflows
                ? `Net collected${periodPreset === "today" ? " · today" : ""}`
                : `Collected · ${String(collections.data?.collection_count ?? 0)} ${
                    (collections.data?.collection_count ?? 0) === 1 ? "receipt" : "receipts"
                  }`}
            </p>
            <MoneyText
              amount={collections.data?.total_net_collected_inr ?? "0.00"}
              as="p"
              className="mt-1 text-display-xs font-bold text-white"
            />
            <p className="mt-0.5 text-sm text-white/70">Collections, not sales</p>
          </div>
          {PAYMENT_METHODS.map((method) => {
            const row = byMethod.get(method);
            const selected = methodFilter === method;
            const amount = row?.net_collected_inr ?? "0.00";
            const zero = isZeroMoney(amount);
            const caption = methodCaption(row);
            return (
              <button
                key={method}
                type="button"
                onClick={() => toggleMethod(method)}
                className={cx(
                  "border-l border-secondary px-5 py-4 text-left transition-colors",
                  selected ? "border-b-[3px] border-b-brand-solid bg-secondary" : "hover:bg-secondary",
                )}
              >
                <p className="flex items-center gap-1.5 text-sm font-semibold tracking-wide text-tertiary uppercase">
                  {paymentMethodLabel(method)}
                  {selected ? <Check className="size-4 text-brand-secondary" aria-hidden="true" /> : null}
                </p>
                {zero ? (
                  <p className="mt-1 text-xl font-bold text-quaternary">—</p>
                ) : (
                  <MoneyText amount={amount} as="p" className="mt-1 text-xl font-bold text-primary" />
                )}
                {caption ? <p className="mt-0.5 text-sm text-tertiary">{caption}</p> : null}
              </button>
            );
          })}
        </div>
      )}

      {showInitialLoading ? (
        <DirectoryTableSkeleton
          columns={6}
          label="Loading payments"
          filterSkeleton={<PaymentsFilterSkeleton />}
        />
      ) : null}

      {payments.isError && !showCollectionsCard ? (
        <DirectoryError message={paymentErrorMessage(payments.error)} />
      ) : null}

      {ledgerEmpty && !showInitialLoading ? (
        <DirectoryEmptyState
          icon={CoinsHand}
          title="No collections yet"
          description="Payments taken at POS appear here automatically. Use Record payment for dues paid later."
          action={
            <Button color="primary" size="lg" onPress={() => setRecordOpen(true)}>
              Record payment
            </Button>
          }
        />
      ) : null}

      {periodEmpty && !showInitialLoading ? (
        <div className="grid overflow-hidden rounded-xl bg-primary ring-1 ring-primary md:grid-cols-[1.2fr_1fr]">
          <div className="flex flex-col gap-2.5 border-b border-secondary px-7 py-8 md:border-r md:border-b-0">
            <p className="text-sm font-semibold tracking-wide text-brand-secondary uppercase">
              {formatPeriodEmptyLabel(periodPreset, periodBounds)}
            </p>
            <h2 className="text-3xl font-bold text-primary">
              {periodPreset === "today" ? "No collections yet today" : "No collections in this period"}
            </h2>
            <p className="max-w-md text-md text-secondary">
              Payments taken at POS appear here automatically. Use Record payment for dues paid later.
            </p>
            <Button
              color="primary"
              size="lg"
              className="mt-2 self-start"
              onPress={() => setRecordOpen(true)}
            >
              Record payment
            </Button>
          </div>
          <div className="flex flex-col bg-secondary px-6 py-6">
            <p className="border-b border-secondary pb-2 text-sm font-semibold tracking-wide text-primary uppercase">
              Open dues
            </p>
            {openDues.isLoading ? (
              <div className="flex flex-col gap-2 pt-3">
                <Skeleton className="h-10 w-full rounded-lg" />
                <Skeleton className="h-10 w-full rounded-lg" />
              </div>
            ) : null}
            {openDues.isError ? (
              <p className="pt-3 text-sm text-error-primary" role="alert">
                {paymentErrorMessage(openDues.error)}
              </p>
            ) : null}
            {!openDues.isLoading && !openDues.isError && (openDues.data?.items.length ?? 0) === 0 ? (
              <p className="pt-3 text-md text-tertiary">No open sales dues right now.</p>
            ) : null}
            <ul className="flex flex-col">
              {(openDues.data?.items ?? []).map((invoice) => (
                <li
                  key={invoice.id}
                  className="flex items-start justify-between gap-3 border-t border-secondary py-3 text-md first:border-t-0"
                >
                  <div>
                    <p className="font-semibold text-primary">{invoice.customer_display_name}</p>
                    <p className="font-mono text-sm text-tertiary">
                      {invoice.invoice_number ?? invoice.id.slice(0, 8)}
                    </p>
                  </div>
                  <MoneyText amount={invoice.amount_due_inr} className="font-bold text-error-primary" />
                </li>
              ))}
            </ul>
            <Button
              color="link-color"
              size="md"
              href="/invoices?status=finalized&due=1"
              className="mt-2 self-start px-0"
            >
              See all dues on Invoices
            </Button>
          </div>
        </div>
      ) : null}

      {showCollectionsCard ? (
        <TableCard.Root>
          {payments.isError ? (
            <div className="border-b border-secondary px-5 py-4 md:px-7">
              <DirectoryError message={paymentErrorMessage(payments.error)} />
            </div>
          ) : null}
          <div className="flex flex-col gap-0 border-b border-secondary">
            <div className="border-b border-primary px-5 py-5 md:px-7">
              <ListSearchField
                aria-label="Search collections"
                size="lg"
                value={search}
                placeholder="Receipt, customer, invoice or reference"
                onChange={setSearch}
                isPending={searchPending}
              />
            </div>
            <div className="px-5 py-4 md:px-7">
              <Tabs selectedKey="all" className="w-max">
                <Tabs.List type="underline" size="md" aria-label="Payment type" className="gap-6">
                  {TYPE_TABS.map((tab) => (
                    <Tabs.Item
                      key={tab.id}
                      id={tab.id}
                      label={tab.label}
                      isDisabled={tab.id !== "all"}
                    />
                  ))}
                </Tabs.List>
              </Tabs>
            </div>
            {chips.length > 0 ? (
              <div className="border-t border-secondary px-5 py-4 md:px-7">
                <ActiveFiltersBar
                  chips={chips}
                  showLabel={false}
                  onRemove={removeChip}
                  onClear={clearFilters}
                />
              </div>
            ) : null}
          </div>

          {filteredEmpty ? (
            <FilteredEmptyState
              title="No matching collections"
              description="Try another receipt number, customer, method, or period."
              hasSearch={Boolean(appliedQ)}
              hasOtherFilters={Boolean(methodFilter)}
              onClear={clearFilters}
              onClearSearch={
                appliedQ
                  ? () => {
                      setSearch("");
                      setPage(1);
                      setFilters((current) => ({ ...current, appliedQ: "" }));
                    }
                  : undefined
              }
            />
          ) : null}

          {items.length > 0 ? (
            <DirectoryTableBusy isBusy={tableBusy}>
              <Table aria-label="Collections" className={COLLECTIONS_TABLE_CLASS}>
                <Table.Header>
                  <CollectionsColumnHeads />
                </Table.Header>
              </Table>
              {dayGroups.map((group) => {
                const dayTotal = showDaySubtotals ? byDay.get(group.date) : undefined;
                return (
                  <div key={group.date}>
                    <div className="flex items-center justify-between gap-3 border-b border-secondary bg-secondary px-5 py-2.5 text-sm font-semibold text-primary md:px-7">
                      <span className="flex flex-wrap items-center gap-2.5">
                        <span>{formatDayLabel(group.date)}</span>
                        {dayTotal ? (
                          <span className="font-normal text-tertiary">
                            {dayTotal.count} {dayTotal.count === 1 ? "receipt" : "receipts"}
                          </span>
                        ) : null}
                      </span>
                      {dayTotal ? (
                        <span className="font-bold text-primary tabular-nums">
                          <MoneyText amount={dayTotal.net} />
                        </span>
                      ) : null}
                    </div>
                    <Table aria-label={`Collections for ${group.date}`} className={COLLECTIONS_TABLE_CLASS}>
                      <Table.Header className="hidden">
                        <CollectionsColumnHeads />
                      </Table.Header>
                      <Table.Body items={group.rows}>{(payment) => renderPaymentRow(payment)}</Table.Body>
                    </Table>
                  </div>
                );
              })}
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

      <RecordPaymentDialog
        isOpen={recordOpen}
        initialCustomer={prefillCustomer.data ?? null}
        initialInvoiceId={prefillInvoiceId ?? null}
        onClose={closeRecordDialog}
        onRecorded={(receipt) => {
          setPage(1);
          setSearch("");
          setFilters((current) => ({ ...current, appliedQ: "", method: "" }));
          if (receipt) {
            setHighlightReceipt(receipt);
          }
        }}
      />

      <PaymentDetailDialog paymentId={detailPaymentId} onClose={() => setDetailPaymentId(null)} />
    </section>
  );
}
