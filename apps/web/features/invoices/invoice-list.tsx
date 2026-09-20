"use client";

import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import type { CalendarDate, DateValue } from "@internationalized/date";
import { parseDate } from "@internationalized/date";
import { ChevronRight, Receipt } from "@untitledui/icons";
import type { DateRange } from "react-aria-components";

import { DatePicker } from "@/components/application/date-picker/date-picker";
import { DateRangePicker } from "@/components/application/date-picker/date-range-picker";
import { EmptyState } from "@/components/application/empty-state/empty-state";
import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import { Table, TableCard } from "@/components/application/table/table";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { ButtonGroup, ButtonGroupItem } from "@/components/base/button-group/button-group";
import { ListSearchToolbar } from "@/components/shared/list-search-toolbar";
import { ListTableFooter } from "@/components/shared/list-table-footer";
import { SelectField } from "@/components/shared/select-field";
import { staffHasPermission, useStaff } from "@/features/auth/staff-shell";
import { formatInr, invoiceAccessToken, invoiceErrorMessage } from "@/features/invoices/invoice-shared";
import {
  boundsForPeriod,
  kolkataTodayCalendar,
  type PeriodPreset,
} from "@/lib/period-bounds";
import { fetchInvoices } from "@/lib/staff-api";

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

export function InvoiceList() {
  const staff = useStaff();
  const router = useRouter();
  const allowed = staffHasPermission(staff, "billing.write");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");
  const [appliedQ, setAppliedQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "draft" | "finalized">("");
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>("all");
  const [dayDate, setDayDate] = useState(() => kolkataTodayCalendar());
  const [customStart, setCustomStart] = useState<CalendarDate | null>(null);
  const [customEnd, setCustomEnd] = useState<CalendarDate | null>(null);

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

  useEffect(() => {
    if (!allowed) {
      router.replace("/access-denied");
    }
  }, [allowed, router]);

  const query = useQuery({
    queryKey: [
      "invoices",
      staff.membership.organization_id,
      page,
      pageSize,
      appliedQ,
      statusFilter,
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
        ...(periodBounds.from ? { businessDateFrom: periodBounds.from } : {}),
        ...(periodBounds.to ? { businessDateTo: periodBounds.to } : {}),
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
  const periodActive = periodPreset !== "all";
  const filtersActive = Boolean(appliedQ) || Boolean(statusFilter) || periodActive;
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
    setStatusFilter("");
    setPeriodPreset("all");
    setDayDate(kolkataTodayCalendar());
    setCustomStart(null);
    setCustomEnd(null);
    setPage(1);
  }

  function selectPeriod(next: PeriodPreset) {
    setPeriodPreset(next);
    setPage(1);
    if (next === "today") {
      setDayDate(kolkataTodayCalendar());
    }
    if (next === "custom" && (!customStart || !customEnd)) {
      const today = kolkataTodayCalendar();
      setCustomStart(today);
      setCustomEnd(today);
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-display-xs font-semibold text-primary">Invoices</h1>
          <p className="text-md text-tertiary">Staff POS drafts and finalized sales. Totals come from the server quote only.</p>
        </div>
        <Button color="primary" size="md" href="/invoices/new">
          New invoice
        </Button>
      </div>

      {showInitialLoading ? <LoadingIndicator size="md" label="Loading invoices" /> : null}

      {query.isError ? (
        <p className="text-sm text-error-primary" role="alert">
          {invoiceErrorMessage(query.error)}
        </p>
      ) : null}

      {directoryEmpty ? (
        <EmptyState size="md" className="mx-auto py-10">
          <EmptyState.Header pattern="none">
            <div className="mb-3 flex size-12 items-center justify-center rounded-lg bg-secondary ring-1 ring-secondary ring-inset">
              <Receipt className="size-6 text-fg-quaternary" aria-hidden="true" />
            </div>
            <EmptyState.Content>
              <p className="text-lg font-semibold text-primary">No invoices yet</p>
              <EmptyState.Description>
                Start a POS draft, scan available articles, then finalize when calculations are approved.
              </EmptyState.Description>
            </EmptyState.Content>
          </EmptyState.Header>
          <EmptyState.Footer>
            <Button color="primary" size="md" href="/invoices/new">
              New invoice
            </Button>
          </EmptyState.Footer>
        </EmptyState>
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
              {periodPreset === "today" ? (
                <DatePicker
                  aria-label="Business date"
                  value={dayDate}
                  onChange={(value) => {
                    const next = asCalendarDate(value);
                    if (next) {
                      setDayDate(next);
                      setPage(1);
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
                    setCustomStart(start);
                    setCustomEnd(end);
                    setPage(1);
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
                  placeholder="Customer or invoice number"
                />
              </div>
              <div className="w-40">
                <SelectField
                  label="Status"
                  value={statusFilter}
                  onChange={(value) => {
                    setStatusFilter(value === "draft" || value === "finalized" ? value : "");
                    setPage(1);
                  }}
                  options={[
                    { label: "All statuses", value: "" },
                    { label: "Draft", value: "draft" },
                    { label: "Finalized", value: "finalized" },
                  ]}
                />
              </div>
            </div>
          </div>

          {filteredEmpty ? (
            <EmptyState size="md" className="mx-auto py-10">
              <EmptyState.Header pattern="none">
                <EmptyState.Content>
                  <p className="text-lg font-semibold text-primary">No matching invoices</p>
                  <EmptyState.Description>
                    Try another customer, invoice number, status, or period.
                  </EmptyState.Description>
                </EmptyState.Content>
              </EmptyState.Header>
              <EmptyState.Footer>
                <Button color="secondary" size="md" onPress={clearFilters}>
                  Clear filters
                </Button>
              </EmptyState.Footer>
            </EmptyState>
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
                      <Table.Cell className="text-right tabular-nums">{formatInr(item.grand_total_inr)}</Table.Cell>
                      <Table.Cell className="text-right tabular-nums">{formatInr(item.amount_due_inr)}</Table.Cell>
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
    </section>
  );
}
