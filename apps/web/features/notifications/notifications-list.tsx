"use client";

import { Suspense, useEffect, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  notificationStatusSchema,
  NOTIFICATION_STATUS_LABELS,
  type NotificationPurpose,
  type NotificationStatus,
} from "@aabhushan/contracts";
import { Bell01 } from "@untitledui/icons";

import { EmptyState } from "@/components/application/empty-state/empty-state";
import { Skeleton } from "@/components/application/skeleton/skeleton";
import { Table, TableCard } from "@/components/application/table/table";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import {
  DirectoryEmptyState,
  DirectoryError,
  DirectoryTableBusy,
  DirectoryTableSkeleton,
  FilteredEmptyState,
  directoryListFlags,
} from "@/components/shared/directory-states";
import { ListTableFooter } from "@/components/shared/list-table-footer";
import { SelectField } from "@/components/shared/select-field";
import { StaffPageHeader } from "@/components/shared/staff-page-header";
import {
  type ListFilterCodec,
  useListPagination,
  useSyncedListFilters,
} from "@/lib/list-search-params";
import { staffHasPermission, useStaff } from "@/features/auth/staff-shell";
import { useStaffToast } from "@/components/application/toast/staff-toast";
import { inventoryAccessToken, inventoryErrorMessage } from "@/features/inventory/inventory-shared";
import { fetchNotifications, retryNotificationRequest } from "@/lib/staff-api";

function statusColor(status: NotificationStatus): "gray" | "success" | "blue" | "error" | "orange" {
  switch (status) {
    case "delivered":
      return "success";
    case "accepted":
    case "sent":
      return "blue";
    case "pending":
      return "blue";
    case "failed":
      return "error";
    case "unknown":
      return "orange";
    case "skipped":
      return "gray";
    default:
      return "gray";
  }
}

const PURPOSES: NotificationPurpose[] = [
  "transactional_invoice",
  "transactional_receipt",
  "due_reminder",
  "girvi_reminder",
];

type NotificationUrlFilters = {
  status: "" | NotificationStatus;
  purpose: "" | NotificationPurpose;
};

const notificationUrlDefaults: NotificationUrlFilters = {
  status: "",
  purpose: "",
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

const notificationUrlCodec: ListFilterCodec<NotificationUrlFilters> = {
  ownedKeys: ["status", "purpose"],
  defaults: notificationUrlDefaults,
  parse(params) {
    const parsed = notificationStatusSchema.safeParse(params.get("status"));
    const purposeRaw = params.get("purpose");
    const purpose =
      purposeRaw && PURPOSES.includes(purposeRaw as NotificationPurpose)
        ? (purposeRaw as NotificationPurpose)
        : "";
    return {
      status: parsed.success ? parsed.data : "",
      purpose,
    };
  },
  serialize(value) {
    return {
      status: value.status || undefined,
      purpose: value.purpose || undefined,
    };
  },
  chips() {
    return [];
  },
};

/** Live filter strip: Status + Purpose selects. */
export function NotificationsFilterSkeleton() {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <Skeleton className="h-10 w-48 rounded-lg" />
      <Skeleton className="h-10 w-48 rounded-lg" />
    </div>
  );
}

/** Body-only loader: Suspense fallback and showInitialLoading (header stays live). */
export function NotificationsListBodyLoading() {
  return (
    <DirectoryTableSkeleton
      title="Messages"
      columns={6}
      label="Loading notifications"
      filterSkeleton={<NotificationsFilterSkeleton />}
    />
  );
}

export function NotificationsList() {
  const staff = useStaff();
  const allowed = staffHasPermission(staff, "notifications.read");
  const canRetry = staffHasPermission(staff, "notifications.retry");

  if (!allowed) {
    return (
      <EmptyState size="md" className="mx-auto py-10">
        <EmptyState.Header pattern="none">
          <EmptyState.Content>
            <p className="text-lg font-semibold text-primary">Notifications unavailable</p>
            <EmptyState.Description>Ask an owner if you need access to message delivery status.</EmptyState.Description>
          </EmptyState.Content>
        </EmptyState.Header>
      </EmptyState>
    );
  }

  return (
    <section className="flex flex-col gap-6">
      <StaffPageHeader
        title="Notifications"
        description="WhatsApp send and delivery status for shop messages."
        icon={Bell01}
      />
      <Suspense fallback={<NotificationsListBodyLoading />}>
        <NotificationsListBody canRetry={canRetry} />
      </Suspense>
    </section>
  );
}

function NotificationsListBody({ canRetry }: { canRetry: boolean }) {
  const staff = useStaff();
  const toast = useStaffToast();
  const queryClient = useQueryClient();
  const { filters, setFilters, clearFilters } = useSyncedListFilters(
    "/notifications",
    notificationUrlCodec,
  );
  const { status, purpose } = filters;
  const { page, setPage, pageSize, setPageSize } = useListPagination(25);
  const [actionError, setActionError] = useState<string | null>(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const onVisibility = () => setVisible(document.visibilityState === "visible");
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

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
    placeholderData: keepPreviousData,
    refetchInterval: visible ? 8_000 : false,
  });

  const retryMutation = useMutation({
    mutationFn: async (id: string) => retryNotificationRequest(await inventoryAccessToken(), id),
    onSuccess: async () => {
      setActionError(null);
      toast.success("Retry started");
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error) => setActionError(inventoryErrorMessage(error)),
  });

  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const filtersActive = Boolean(status) || Boolean(purpose);
  const { showInitialLoading, directoryEmpty, filteredEmpty, showDirectoryCard } = directoryListFlags({
    isLoading: query.isLoading,
    hasData: Boolean(query.data),
    total,
    itemCount: items.length,
    filtersActive,
  });

  function clearAllFilters() {
    clearFilters();
    setPage(1);
  }

  const tableBusy = query.isFetching && Boolean(query.data);

  return (
    <>
      {(actionError || query.isError) && !showDirectoryCard ? (
        <>
          {actionError ? <DirectoryError message={actionError} /> : null}
          {query.isError ? <DirectoryError message={inventoryErrorMessage(query.error)} /> : null}
        </>
      ) : null}

      {showInitialLoading ? <NotificationsListBodyLoading /> : null}

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
          {actionError || query.isError ? (
            <div className="flex flex-col gap-2 border-b border-secondary px-4 py-3 md:px-6">
              {actionError ? <DirectoryError message={actionError} /> : null}
              {query.isError ? <DirectoryError message={inventoryErrorMessage(query.error)} /> : null}
            </div>
          ) : null}
          <div className="flex flex-col gap-3 border-b border-secondary px-4 py-4 md:px-6">
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-48">
                <SelectField
                  label="Status"
                  value={status}
                  onChange={(value) => {
                    setFilters({ status: value, purpose });
                    setPage(1);
                  }}
                  options={[
                    { label: "All statuses", value: "" },
                    ...(
                      Object.entries(NOTIFICATION_STATUS_LABELS) as [NotificationStatus, string][]
                    ).map(([value, label]) => ({
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
                    setFilters({ status, purpose: value });
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
              {filtersActive ? (
                <Button color="link-gray" size="sm" onPress={clearAllFilters}>
                  Clear filters
                </Button>
              ) : null}
            </div>
          </div>

          {filteredEmpty ? (
            <FilteredEmptyState
              title="No matching notifications"
              description="Try another status or purpose filter."
              hasOtherFilters={filtersActive}
              onClear={clearAllFilters}
            />
          ) : null}

          {items.length > 0 ? (
            <DirectoryTableBusy isBusy={tableBusy}>
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
                      <Table.Cell className="font-medium text-primary">
                        <span title={item.channel}>{item.customer_display_name}</span>
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
                      <Table.Cell truncate={false}>
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
                          <span className="text-xs text-warning-primary">Check status</span>
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
