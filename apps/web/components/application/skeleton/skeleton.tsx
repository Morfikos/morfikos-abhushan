"use client";

import type { ReactNode } from "react";

import { TableCard } from "@/components/application/table/table";
import { cx } from "@/utils/cx";

/**
 * Local skeleton foundation. Untitled UI free has no skeleton component; these
 * bars mirror staff chrome (cards, tables, tiles) for fetch loading only.
 * Mutations keep Button isLoading.
 */

type SkeletonProps = {
  className?: string;
};

export function Skeleton({ className }: SkeletonProps): ReactNode {
  return (
    <div
      aria-hidden="true"
      className={cx("rounded-md bg-tertiary motion-safe:animate-pulse motion-reduce:animate-none", className)}
    />
  );
}

export function SkeletonText({
  lines = 1,
  className,
}: {
  lines?: number;
  className?: string;
}): ReactNode {
  const widths = ["w-full", "w-5/6", "w-4/5", "w-3/4", "w-2/3"];
  return (
    <div className={cx("flex flex-col gap-2", className)}>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} className={cx("h-3", widths[index % widths.length])} />
      ))}
    </div>
  );
}

function LoadingLabel({ label }: { label: string }): ReactNode {
  return <span className="sr-only">{label}</span>;
}

const sectionCardClass =
  "flex flex-col gap-4 rounded-xl bg-primary p-4 shadow-xs ring-1 ring-secondary md:p-5";

export function TableSkeleton({
  columns = 6,
  rows = 8,
  showCard = true,
  titleWidth: _titleWidth,
  className,
  label = "Loading…",
}: {
  columns?: number;
  rows?: number;
  showCard?: boolean;
  /** @deprecated Card header uses a fixed badge skeleton; kept for call-site compatibility. */
  titleWidth?: string;
  className?: string;
  label?: string;
}): ReactNode {
  void _titleWidth;
  const body = (
    <div className={cx("w-full overflow-x-auto", className)} aria-busy="true" aria-live="polite">
      <LoadingLabel label={label} />
      <div className="min-w-full">
        <div className="flex gap-3 border-b border-secondary px-4 py-3 md:px-6">
          {Array.from({ length: columns }, (_, index) => (
            <Skeleton key={`h-${String(index)}`} className={cx("h-3 flex-1", index === 0 ? "min-w-24" : "min-w-16")} />
          ))}
        </div>
        {Array.from({ length: rows }, (_, row) => (
          <div key={`r-${String(row)}`} className="flex items-center gap-3 border-b border-secondary px-4 py-3.5 last:border-b-0 md:px-6">
            {Array.from({ length: columns }, (_, col) => (
              <Skeleton
                key={`c-${String(row)}-${String(col)}`}
                className={cx(
                  "h-3.5 flex-1",
                  col === 0 ? "max-w-[10rem]" : col === columns - 1 ? "max-w-8" : "",
                )}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );

  if (!showCard) {
    return body;
  }

  return (
    <TableCard.Root>
      <TableCard.Header title=" " badge={<Skeleton className="h-5 w-8 rounded-full" />} />
      {body}
    </TableCard.Root>
  );
}

export function MetricTilesSkeleton({
  count = 5,
  tone = "primary",
  className,
  label = "Loading…",
}: {
  count?: number;
  /** `secondary` matches Payments collections metric tiles. */
  tone?: "primary" | "secondary";
  className?: string;
  label?: string;
}): ReactNode {
  return (
    <div className={cx("flex flex-wrap gap-3", className)} aria-busy="true" aria-live="polite">
      <LoadingLabel label={label} />
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className={cx(
            "flex min-w-48 flex-1 flex-col gap-2 rounded-xl p-4 ring-1 ring-secondary",
            tone === "secondary" ? "bg-secondary" : "bg-primary",
          )}
        >
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-3 w-40" />
        </div>
      ))}
    </div>
  );
}

export function DetailHeaderSkeleton({
  withBack = true,
  withAvatar = false,
  className,
  label = "Loading…",
}: {
  withBack?: boolean;
  withAvatar?: boolean;
  className?: string;
  label?: string;
}): ReactNode {
  return (
    <div className={cx("flex flex-col gap-3", className)} aria-busy="true" aria-live="polite">
      <LoadingLabel label={label} />
      {withBack ? <Skeleton className="h-4 w-28" /> : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {withAvatar ? <Skeleton className="size-12 shrink-0 rounded-full" /> : null}
          <div className="flex flex-col gap-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-36" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-9 w-24 rounded-lg" />
          <Skeleton className="h-9 w-28 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

export function FormSkeleton({
  sections = 3,
  fieldsPerSection = 4,
  showStickyActions = false,
  className,
  label = "Loading…",
}: {
  sections?: number;
  fieldsPerSection?: number;
  /** Matches StickyFormActions bar under SectionCard forms. */
  showStickyActions?: boolean;
  className?: string;
  label?: string;
}): ReactNode {
  return (
    <div className={cx("flex max-w-3xl flex-col gap-4", className)} aria-busy="true" aria-live="polite">
      <LoadingLabel label={label} />
      {Array.from({ length: sections }, (_, section) => (
        <div key={section} className={sectionCardClass}>
          <div>
            <Skeleton className="h-5 w-40" />
            <Skeleton className="mt-2 h-3 w-64" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: fieldsPerSection }, (_, field) => (
              <div key={field} className="flex flex-col gap-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-10 w-full rounded-lg" />
              </div>
            ))}
          </div>
        </div>
      ))}
      {showStickyActions ? (
        <div className="-mx-4 border-t border-secondary bg-primary px-4 py-4 md:-mx-0 md:rounded-xl md:px-5 md:ring-1 md:ring-secondary">
          <div className="flex flex-wrap justify-end gap-2">
            <Skeleton className="h-10 w-24 rounded-lg" />
            <Skeleton className="h-10 w-32 rounded-lg" />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function PanelSkeleton({
  rows = 4,
  showTitle = true,
  className,
  label = "Loading…",
}: {
  rows?: number;
  showTitle?: boolean;
  className?: string;
  label?: string;
}): ReactNode {
  return (
    <div className={cx(sectionCardClass, className)} aria-busy="true" aria-live="polite">
      <LoadingLabel label={label} />
      {showTitle ? <Skeleton className="h-5 w-36" /> : null}
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center justify-between gap-3 py-1">
          <SkeletonText lines={2} className="min-w-0 flex-1" />
          <Skeleton className="h-4 w-16 shrink-0" />
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton({
  className,
  label = "Loading…",
}: {
  className?: string;
  label?: string;
}): ReactNode {
  return (
    <div className={cx(sectionCardClass, className)} aria-busy="true" aria-live="polite">
      <LoadingLabel label={label} />
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-3 w-56" />
      <Skeleton className="h-64 w-full rounded-lg" />
      <div className="flex flex-wrap gap-4">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-28" />
      </div>
    </div>
  );
}

/** Default filter strip: search then chips (Customers / Invoices order). */
export function DirectoryFilterStripSkeleton({
  filterBars = 3,
  showPeriod = false,
}: {
  filterBars?: number;
  showPeriod?: boolean;
}): ReactNode {
  return (
    <>
      <Skeleton className="h-10 w-full max-w-md rounded-lg" />
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
  );
}

/**
 * Full directory list loading: title/CTA + TableCard with search-then-filters + rows.
 * Use for route Suspense and for features that do not keep a live header.
 */
export function StaffListPageSkeleton({
  title = true,
  filterBars = 3,
  columns = 6,
  rows = 8,
  showPeriod = false,
  filterSkeleton,
  className,
  label = "Loading…",
}: {
  title?: boolean;
  filterBars?: number;
  columns?: number;
  rows?: number;
  showPeriod?: boolean;
  filterSkeleton?: ReactNode;
  className?: string;
  label?: string;
}): ReactNode {
  return (
    <div className={cx("flex flex-col gap-6", className)} aria-busy="true" aria-live="polite">
      <LoadingLabel label={label} />
      {title ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-4 w-72 max-w-full" />
          </div>
          <Skeleton className="h-10 w-32 rounded-lg" />
        </div>
      ) : null}
      <TableCard.Root>
        <TableCard.Header title=" " badge={<Skeleton className="h-5 w-8 rounded-full" />} />
        <div className="flex flex-col gap-3 border-b border-secondary px-4 py-4 md:px-6">
          {filterSkeleton ?? <DirectoryFilterStripSkeleton filterBars={filterBars} showPeriod={showPeriod} />}
        </div>
        <TableSkeleton columns={columns} rows={rows} showCard={false} label={label} />
      </TableCard.Root>
    </div>
  );
}

/**
 * Alias: same tree as StaffListPageSkeleton — Suspense and in-feature initial load should share it.
 */
export function StaffDirectoryLoading(props: Parameters<typeof StaffListPageSkeleton>[0]): ReactNode {
  return <StaffListPageSkeleton {...props} />;
}

export function StaffDetailPageSkeleton({
  withAvatar = false,
  sections = 3,
  withTabs = true,
  layout = "stack",
  className,
  label = "Loading…",
}: {
  withAvatar?: boolean;
  sections?: number;
  withTabs?: boolean;
  /** `split3` approximates article Piece / Spec / Movement columns. */
  layout?: "stack" | "split3";
  className?: string;
  label?: string;
}): ReactNode {
  return (
    <div className={cx("flex flex-col gap-6", className)} aria-busy="true" aria-live="polite">
      <LoadingLabel label={label} />
      <DetailHeaderSkeleton withAvatar={withAvatar} label={label} />
      {withTabs ? (
        <div className="flex gap-2 border-b border-secondary pb-px">
          <Skeleton className="h-9 w-24 rounded-lg" />
          <Skeleton className="h-9 w-20 rounded-lg" />
          <Skeleton className="h-9 w-28 rounded-lg" />
        </div>
      ) : null}
      {layout === "split3" ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <PanelSkeleton rows={5} label="" />
          <PanelSkeleton rows={6} label="" />
          <PanelSkeleton rows={4} label="" />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {Array.from({ length: sections }, (_, index) => (
            <PanelSkeleton key={index} rows={4} label="" />
          ))}
        </div>
      )}
    </div>
  );
}

/** Compact definition-list rows for dialog quote/statement loading. */
export function DefinitionListSkeleton({
  rows = 4,
  className,
  label = "Loading…",
}: {
  rows?: number;
  className?: string;
  label?: string;
}): ReactNode {
  return (
    <div className={cx("flex flex-col gap-3", className)} aria-busy="true" aria-live="polite">
      <LoadingLabel label={label} />
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center justify-between gap-4">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </div>
  );
}

/** Print-route blocks: header + line rows + totals. */
export function PrintDocumentSkeleton({
  className,
  label = "Loading print view…",
}: {
  className?: string;
  label?: string;
}): ReactNode {
  return (
    <div className={cx("mx-auto flex w-full max-w-2xl flex-col gap-6 p-6", className)} aria-busy="true" aria-live="polite">
      <LoadingLabel label={label} />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-3 w-64" />
        <Skeleton className="h-3 w-40" />
      </div>
      <div className="flex flex-col gap-2 border-y border-secondary py-4">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="flex justify-between gap-4">
            <Skeleton className="h-3 min-w-0 flex-1" />
            <Skeleton className="h-3 w-16 shrink-0" />
          </div>
        ))}
      </div>
      <div className="ml-auto flex w-48 flex-col gap-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-5 w-full" />
      </div>
    </div>
  );
}

/** Cold staff-layout gate: sidebar rail + main, not a blank centered line. */
export function StaffShellSkeleton({
  className,
  label = "Loading staff workspace…",
}: {
  className?: string;
  label?: string;
}): ReactNode {
  return (
    <div className={cx("bg-primary flex min-h-screen", className)} aria-busy="true" aria-live="polite">
      <LoadingLabel label={label} />
      <aside className="bg-secondary hidden w-[280px] shrink-0 flex-col gap-4 border-r border-secondary p-4 lg:flex lg:pt-5">
        <Skeleton className="h-8 w-36" />
        <div className="flex flex-col gap-2 pt-4">
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} className="h-9 w-full rounded-lg" />
          ))}
        </div>
        <div className="mt-auto flex flex-col gap-2 border-t border-secondary pt-4">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-9 w-full rounded-lg" />
        </div>
      </aside>
      <div className="min-w-0 flex-1 px-4 py-6 lg:px-8">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-7 w-44" />
            <Skeleton className="h-4 w-72 max-w-full" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-9 w-20 rounded-lg" />
            <Skeleton className="h-9 w-20 rounded-lg" />
            <Skeleton className="h-9 w-24 rounded-lg" />
          </div>
          <TableSkeleton columns={5} rows={6} label="" />
        </div>
      </div>
    </div>
  );
}

/** Settings route Suspense: header + tab strip + form body. */
export function SettingsPageSkeleton({
  className,
  label = "Loading settings…",
}: {
  className?: string;
  label?: string;
}): ReactNode {
  return (
    <div className={cx("flex flex-col gap-6", className)} aria-busy="true" aria-live="polite">
      <LoadingLabel label={label} />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-9 w-24 rounded-lg" />
        ))}
      </div>
      <FormSkeleton sections={2} showStickyActions label="" />
    </div>
  );
}
