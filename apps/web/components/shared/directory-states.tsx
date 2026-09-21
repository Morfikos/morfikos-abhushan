"use client";

import type { ComponentType, ReactNode, SVGProps } from "react";

import { EmptyState } from "@/components/application/empty-state/empty-state";
import { Skeleton, TableSkeleton } from "@/components/application/skeleton/skeleton";
import { TableCard } from "@/components/application/table/table";
import { Button } from "@/components/base/buttons/button";

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

export function FilteredEmptyState({
  title,
  description,
  onClear,
}: {
  title: string;
  description: string;
  onClear: () => void;
}) {
  return (
    <EmptyState size="md" className="mx-auto py-10">
      <EmptyState.Header pattern="none">
        <EmptyState.Content>
          <p className="text-lg font-semibold text-primary">{title}</p>
          <EmptyState.Description>{description}</EmptyState.Description>
        </EmptyState.Content>
      </EmptyState.Header>
      <EmptyState.Footer>
        <Button color="secondary" size="md" onPress={onClear}>
          Clear filters
        </Button>
      </EmptyState.Footer>
    </EmptyState>
  );
}

export function DirectoryTableSkeleton({
  title,
  columns,
  label,
  filterSkeleton,
  showPeriod = false,
  filterBars = 3,
  showSelectionColumn = false,
}: {
  title: string;
  columns: number;
  label: string;
  filterSkeleton?: ReactNode;
  showPeriod?: boolean;
  filterBars?: number;
  showSelectionColumn?: boolean;
}) {
  return (
    <TableCard.Root>
      <TableCard.Header title={title} badge={<Skeleton className="h-5 w-8 rounded-full" />} />
      <div className="flex flex-col gap-3 border-b border-secondary px-4 py-4 md:px-6">
        {filterSkeleton ?? (
          <>
            <Skeleton className="h-10 max-w-md rounded-lg" />
            <div className="flex flex-wrap items-center gap-2">
              {showPeriod ? (
                <>
                  <Skeleton className="h-9 w-16 rounded-lg" />
                  <Skeleton className="h-9 w-16 rounded-lg" />
                  <Skeleton className="h-9 w-16 rounded-lg" />
                  <Skeleton className="h-9 w-20 rounded-lg" />
                  <Skeleton className="h-9 w-20 rounded-lg" />
                  <Skeleton className="h-10 w-40 rounded-lg" />
                </>
              ) : null}
              {Array.from({ length: filterBars }, (_, index) => (
                <Skeleton key={index} className="h-9 w-28 rounded-lg" />
              ))}
            </div>
          </>
        )}
      </div>
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
