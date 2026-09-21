"use client";

import { useEffect, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  notificationStatusSchema,
  NOTIFICATION_STATUS_LABELS,
  type NotificationPurpose,
  type NotificationStatus,
} from "@aabhushan/contracts";
import { Bell01 } from "@untitledui/icons";

import { EmptyState } from "@/components/application/empty-state/empty-state";
import { Skeleton, StaffDirectoryLoading } from "@/components/application/skeleton/skeleton";
import { Table, TableCard } from "@/components/application/table/table";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { ActiveFiltersBar } from "@/components/shared/active-filters-bar";
import {
  DirectoryEmptyState,
  DirectoryTableSkeleton,
  FilteredEmptyState,
} from "@/components/shared/directory-states";
import { ListTableFooter } from "@/components/shared/list-table-footer";
import { SelectField } from "@/components/shared/select-field";
import { StaffPageHeader } from "@/components/shared/staff-page-header";
import { type ListFilterCodec, useSyncedListFilters } from "@/lib/list-search-params";
import { staffHasPermission, useStaff } from "@/features/auth/staff-shell";
import { useStaffToast } from "@/components/application/toast/staff-toast";
import { inventoryAccessToken, inventoryErrorMessage } from "@/features/inventory/inventory-shared";
import { fetchNotifications, retryNotificationRequest } from "@/lib/staff-api";

function statusColor(status: NotificationStatus): "gray" | "brand" | "success" | "warning" | "error" {
  switch (status) {
    case "delivered":
      return "success";
    case "accepted":
    case "sent":
      return "brand";
    case "pending":
      return "gray";
    case "failed":
      return "error";
    case "unknown":
      return "warning";
    case "skipped":
      return "gray";
    default:
      return "gray";
  }
}

type NotificationUrlFilters = {
  status: "" | NotificationStatus;
};

const notificationUrlDefaults: NotificationUrlFilters = {
  status: "",
};

const notificationUrlCodec: ListFilterCodec<NotificationUrlFilters> = {
  ownedKeys: ["status"],
  defaults: notificationUrlDefaults,
  parse(params) {
    const parsed = notificationStatusSchema.safeParse(params.get("status"));
    return { status: parsed.success ? parsed.data : "" };
  },
  serialize(value) {
    return { status: value.status || undefined };
  },
  chips(value) {
    if (!value.status) {
      return [];
    }
    return [{ id: "status", label: `Status: ${NOTIFICATION_STATUS_LABELS[value.status]}` }];
  },
};

function purposeLabel(purpose: NotificationPurpose): string {
  switch (purpose) {
    case "transactional_invoice":
      return "Invoice";
    case "transactional_receipt":
      return "Receipt";
    case "due_reminder":
      return "Due reminder";
    case "girvi_reminder":
      return "Girvi reminder";
    default:
      return purpose;
  }
}

/** Live filter strip: Status + Purpose selects. */
export function NotificationsFilterSkeleton() {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <Skeleton className="h-10 w-48 rounded-lg" />
      <Skeleton className="h-10 w-48 rounded-lg" />
    </div>
  );
}

/** Route Suspense cold load (includes header shimmer). Feature keeps live StaffPageHeader. */
export function NotificationsDirectoryLoading() {
  return (
    <StaffDirectoryLoading
      columns={6}
      label="Loading notifications"
      filterSkeleton={<NotificationsFilterSkeleton />}
    />
  );
}

export function NotificationsList() {
  const staff = useStaff();
  const toast = useStaffToast();
  const queryClient = useQueryClient();
  const allowed = staffHasPermission(staff, "notifications.read");
  const canRetry = staffHasPermission(staff, "notifications.retry");
  const { filters, setFilters, clearFilters, chips } = useSyncedListFilters("/notifications", notificationUrlCodec);
  const status = filters.status;
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [purpose, setPurpose] = useState<"" | NotificationPurpose>("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!allowed) {
      return;
    }
    const onVisibility = () => setVisible(document.visibilityState === "visible");
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [allowed]);

  const query = useQuery({
    queryKey: [
      "notifications",
      staff.membership.organization_id,
      page,
      pageSize,
      status,
      purpose,
    ],
    queryFn: async () =>
      fetchNotifications(await inventoryAccessToken(), {
        page,
        pageSize,
        ...(status ? { status } : {}),
        ...(purpose ? { purpose } : {}),
      }),
    enabled: allowed,
    placeholderData: keepPreviousData,
    refetchInterval: visible ? 8_000 : false,
  });

  const retryMutation = useMutation({
    mutationFn: async (id: string) => retryNotificationRequest(await inventoryAccessToken(), id),
    onSuccess: async () => {
      setActionError(null);
      toast.success("Retry queued");
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error) => setActionError(inventoryErrorMessage(error)),
  });

  if (!allowed) {
    return (
      <EmptyState size="md" className="mx-auto py-10">
        <EmptyState.Header pattern="none">
          <EmptyState.Content>
            <p className="text-lg font-semibold text-primary">Notifications unavailable</p>
            <EmptyState.Description>You need notifications.read to view delivery status.</EmptyState.Description>
          </EmptyState.Content>
        </EmptyState.Header>
      </EmptyState>
    );
  }

  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const filtersActive = Boolean(status) || Boolean(purpose);
  const directoryEmpty = !query.isLoading && total === 0 && !filtersActive;
  const filteredEmpty = !query.isLoading && items.length === 0 && filtersActive;
  const showInitialLoading = query.isLoading && !query.data;
  const showDirectoryCard = !directoryEmpty && !showInitialLoading;
  const displayChips = [
    ...chips,
    ...(purpose
      ? [{ id: "purpose", label: `Purpose: ${purposeLabel(purpose)}` }]
      : []),
  ];

  function clearAllFilters() {
    clearFilters();
    setPurpose("");
    setPage(1);
  }

  return (
    <section className="flex flex-col gap-6">
      <StaffPageHeader
        title="Notifications"
        description="WhatsApp delivery status. Accepted by provider is not the same as Delivered. Unknown requires reconcile, not a blind resend."
      />

      {actionError ? <p className="text-sm text-error-primary">{actionError}</p> : null}
      {query.isError ? <p className="text-sm text-error-primary">{inventoryErrorMessage(query.error)}</p> : null}

      {showInitialLoading ? (
        <DirectoryTableSkeleton
          title="Messages"
          columns={6}
          label="Loading notifications"
          filterSkeleton={<NotificationsFilterSkeleton />}
        />
      ) : null}

      {directoryEmpty ? (
        <DirectoryEmptyState
          icon={Bell01}
          title="No notifications yet"
          description="Finalize an invoice, record a receipt, or enable reminders after WhatsApp is configured."
        />
      ) : null}

      {showDirectoryCard ? (
        <TableCard.Root>
          <TableCard.Header title="Messages" badge={String(total)} />
          <div className="flex flex-col gap-3 border-b border-secondary px-4 py-4 md:px-6">
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-48">
                <SelectField
                  label="Status"
                  value={status}
                  onChange={(value) => {
                    setFilters({ status: value as "" | NotificationStatus });
                    setPage(1);
                  }}
                  options={[
                    { label: "All statuses", value: "" },
                    ...Object.entries(NOTIFICATION_STATUS_LABELS).map(([value, label]) => ({
                      label,
                      value,
                    })),
                  ]}
                />
              </div>
              <div className="w-48">
                <SelectField
                  label="Purpose"
                  value={purpose}
                  onChange={(value) => {
                    setPurpose(value as "" | NotificationPurpose);
                    setPage(1);
                  }}
                  options={[
                    { label: "All purposes", value: "" },
                    { label: "Invoice", value: "transactional_invoice" },
                    { label: "Receipt", value: "transactional_receipt" },
                    { label: "Due reminder", value: "due_reminder" },
                    { label: "Girvi reminder", value: "girvi_reminder" },
                  ]}
                />
              </div>
            </div>
            <ActiveFiltersBar chips={displayChips} onClear={clearAllFilters} />
          </div>

          {filteredEmpty ? (
            <FilteredEmptyState
              title="No matching notifications"
              description="Try another status or purpose filter."
              onClear={clearAllFilters}
            />
          ) : null}

          {items.length > 0 ? (
            <>
              <Table aria-label="Notifications">
                <Table.Header>
                  <Table.Head id="customer" isRowHeader label="Customer" />
                  <Table.Head id="purpose" label="Purpose" />
                  <Table.Head id="status" label="Status" />
                  <Table.Head id="error" label="Error" />
                  <Table.Head id="created" label="Created" />
                  <Table.Head id="actions" label="" />
                </Table.Header>
                <Table.Body items={items}>
                  {(item) => (
                    <Table.Row id={item.id}>
                      <Table.Cell>
                        <p className="font-medium text-primary">{item.customer_display_name}</p>
                        <p className="text-xs text-tertiary">{item.channel}</p>
                      </Table.Cell>
                      <Table.Cell>{purposeLabel(item.purpose)}</Table.Cell>
                      <Table.Cell>
                        <Badge type="pill-color" color={statusColor(item.status)} size="sm">
                          {NOTIFICATION_STATUS_LABELS[item.status]}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell>
                        <span className="text-sm text-tertiary">{item.last_error_code ?? "—"}</span>
                      </Table.Cell>
                      <Table.Cell>
                        <span className="text-sm tabular-nums text-tertiary">
                          {new Date(item.created_at).toLocaleString()}
                        </span>
                      </Table.Cell>
                      <Table.Cell>
                        {canRetry && item.status === "failed" && item.retry_safe ? (
                          <Button
                            color="secondary"
                            size="sm"
                            isLoading={retryMutation.isPending && retryMutation.variables === item.id}
                            onPress={() => retryMutation.mutate(item.id)}
                          >
                            Retry
                          </Button>
                        ) : item.status === "unknown" ? (
                          <span className="text-xs text-warning-primary">Reconcile</span>
                        ) : null}
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
            </>
          ) : null}
        </TableCard.Root>
      ) : null}
    </section>
  );
}
