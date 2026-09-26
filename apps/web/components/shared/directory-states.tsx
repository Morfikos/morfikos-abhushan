"use client";

import type { ComponentType, ReactNode, SVGProps } from "react";

import { EmptyState } from "@/components/application/empty-state/empty-state";
import { Skeleton, TableSkeleton } from "@/components/application/skeleton/skeleton";
import { TableCard } from "@/components/application/table/table";
import { Button } from "@/components/base/buttons/button";
import { cx } from "@/utils/cx";

type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;

export function DirectoryEmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: IconComponent;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <EmptyState size="md" className="mx-auto py-10">
      <EmptyState.Header pattern="none">
        <div className="mb-3 flex size-12 items-center justify-center rounded-lg bg-secondary ring-1 ring-secondary ring-inset">
          <Icon className="size-6 text-fg-quaternary" aria-hidden="true" />
        </div>
        <EmptyState.Content>
          <p className="text-lg font-semibold text-primary">{title}</p>
          <EmptyState.Description>{description}</EmptyState.Description>
        </EmptyState.Content>
      </EmptyState.Header>
      {action ? <EmptyState.Footer>{action}</EmptyState.Footer> : null}
    </EmptyState>
  );
}

/**
 * Recovery CTAs (one primary):
 * - Period narrowed → Search all time; Clear filters if search or other filters
 * - Search only → Clear search
 * - Other filters only → Clear filters
 * - Search + other → Clear filters primary, Clear search secondary
 */
export function FilteredEmptyState({
  title,
  description,
  hasSearch = false,
  hasPeriod = false,
  hasOtherFilters = false,
  onClear,
  onClearSearch,
  onSearchAllTime,
  align = "start",
}: {
  title: string;
  description: string;
  hasSearch?: boolean;
  hasPeriod?: boolean;
  hasOtherFilters?: boolean;
  onClear?: () => void;
  onClearSearch?: () => void;
  onSearchAllTime?: () => void;
  align?: "center" | "start";
}) {
  const start = align === "start";

  type Action = { key: string; label: string; primary: boolean; onPress: () => void };
  const actions: Action[] = [];

  if (hasPeriod && onSearchAllTime) {
    actions.push({ key: "all-time", label: "Search all time", primary: true, onPress: onSearchAllTime });
    if ((hasSearch || hasOtherFilters) && onClear) {
      actions.push({ key: "clear-filters", label: "Clear filters", primary: false, onPress: onClear });
    } else if (hasSearch && onClearSearch && !hasOtherFilters) {
      actions.push({ key: "clear-search", label: "Clear search", primary: false, onPress: onClearSearch });
    }
  } else if (hasSearch && hasOtherFilters) {
    if (onClear) {
      actions.push({ key: "clear-filters", label: "Clear filters", primary: true, onPress: onClear });
    }
    if (onClearSearch) {
      actions.push({ key: "clear-search", label: "Clear search", primary: false, onPress: onClearSearch });
    }
  } else if (hasSearch && onClearSearch) {
    actions.push({ key: "clear-search", label: "Clear search", primary: true, onPress: onClearSearch });
  } else if (hasOtherFilters && onClear) {
    actions.push({ key: "clear-filters", label: "Clear filters", primary: true, onPress: onClear });
  }

  return (
    <EmptyState
      size="md"
      className={start ? "mx-0 max-w-none items-start py-12 pl-6 text-left" : "mx-auto py-10"}
    >
      <EmptyState.Header pattern="none" className={start ? "items-start" : undefined}>
        <EmptyState.Content className={start ? "items-start" : undefined}>
          <p className={cx("font-semibold text-primary", start ? "text-xl font-bold" : "text-lg")}>
            {title}
          </p>
          <EmptyState.Description className={start ? "text-left" : undefined}>{description}</EmptyState.Description>
        </EmptyState.Content>
      </EmptyState.Header>
      {actions.length > 0 ? (
        <EmptyState.Footer className={cx("flex flex-wrap gap-2", start ? "justify-start" : undefined)}>
          {actions.map((action) => (
            <Button
              key={action.key}
              color={action.primary ? "secondary" : "link-gray"}
              size="md"
              onPress={action.onPress}
            >
              {action.label}
            </Button>
          ))}
        </EmptyState.Footer>
      ) : null}
    </EmptyState>
  );
}

export function DirectoryError({ message, className }: { message: string; className?: string }) {
  return (
    <p
      className={cx(
        "rounded-lg bg-error-primary/10 px-3 py-2 text-sm text-error-primary ring-1 ring-error_subtle",
        className,
      )}
      role="alert"
    >
      {message}
    </p>
  );
}

/** Soft-dim previous rows while a list refetch is in flight. */
export function DirectoryTableBusy({
  isBusy,
  children,
  className,
}: {
  isBusy: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(isBusy && "pointer-events-none opacity-60", className)}
      aria-busy={isBusy || undefined}
    >
      {children}
    </div>
  );
}

/** Shared directory boolean recipe for list bodies. */
export function directoryListFlags({
  isLoading,
  hasData,
  total,
  itemCount,
  filtersActive,
}: {
  isLoading: boolean;
  hasData: boolean;
  total: number;
  itemCount: number;
  filtersActive: boolean;
}) {
  const showInitialLoading = isLoading && !hasData;
  const directoryEmpty = !isLoading && total === 0 && !filtersActive;
  const filteredEmpty = !isLoading && itemCount === 0 && filtersActive;
  const showDirectoryCard = !directoryEmpty && !showInitialLoading;
  return { showInitialLoading, directoryEmpty, filteredEmpty, showDirectoryCard };
}

export function DirectoryTableSkeleton({
  title,
  columns,
  label,
  filterSkeleton,
  showSelectionColumn = false,
}: {
  /** Omit to mirror list chrome that has no card title (e.g. Payments). */
  title?: string;
  columns: number;
  label: string;
  /** Required: each list supplies a skeleton that mirrors its live filter strip. */
  filterSkeleton: ReactNode;
  showSelectionColumn?: boolean;
}) {
  return (
    <TableCard.Root>
      {title ? (
        <TableCard.Header title={title} badge={<Skeleton className="h-5 w-8 rounded-full" />} />
      ) : null}
      <div className="flex flex-col gap-3 border-b border-secondary px-4 py-4 md:px-6">{filterSkeleton}</div>
      <TableSkeleton
        columns={columns}
        rows={8}
        showCard={false}
        showSelectionColumn={showSelectionColumn}
        label={label}
      />
    </TableCard.Root>
  );
}
