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

/** Labeled control stack matching live filter fields (label + input). */
export function LabeledControlSkeleton({
  controlWidth = "w-36",
  className,
}: {
  controlWidth?: string;
  className?: string;
}): ReactNode {
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <Skeleton className="h-3 w-16" />
      <Skeleton className={cx("h-10 rounded-lg", controlWidth)} />
    </div>
  );
}

export function TableSkeleton({
  columns = 6,
  rows = 8,
  showCard = true,
  showHeader = true,
  showSelectionColumn = false,
  titleWidth: _titleWidth,
  className,
  label = "Loading…",
}: {
  columns?: number;
  rows?: number;
  showCard?: boolean;
  /** When false with showCard, omit TableCard.Header (headerless live tables). */
  showHeader?: boolean;
  /** Leading narrow column for checkbox selection UIs (inventory). */
  showSelectionColumn?: boolean;
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
        <div className="flex gap-3 border-b border-secondary px-4 py-3 md:px-5">
          {showSelectionColumn ? <Skeleton className="size-4 shrink-0" /> : null}
          {Array.from({ length: columns }, (_, index) => (
            <Skeleton key={`h-${String(index)}`} className={cx("h-3 flex-1", index === 0 ? "min-w-24" : "min-w-16")} />
          ))}
        </div>
        {Array.from({ length: rows }, (_, row) => (
          <div key={`r-${String(row)}`} className="flex h-[68px] items-center gap-3 border-b border-secondary px-4 last:border-b-0 md:px-5">
            {showSelectionColumn ? <Skeleton className="size-4 shrink-0" /> : null}
            {Array.from({ length: columns }, (_, col) => (
              <Skeleton
                key={`c-${String(row)}-${String(col)}`}
                className={cx(
                  "h-3 flex-1",
                  col === 0 ? "max-w-40" : col === columns - 1 ? "max-w-8" : "",
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
      {showHeader ? <TableCard.Header title=" " badge={<Skeleton className="h-5 w-8 rounded-full" />} /> : null}
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
  layout = "stack",
  className,
  label = "Loading…",
}: {
  sections?: number;
  fieldsPerSection?: number;
  /** Matches StickyFormActions bar under SectionCard forms. */
  showStickyActions?: boolean;
  /** Receive / edit article: form column + sticky preview rail. */
  layout?: "stack" | "form-rail" | "receive-rail";
  className?: string;
  label?: string;
}): ReactNode {
  if (layout === "form-rail" || layout === "receive-rail") {
    return (
      <div
        className={cx("flex w-full flex-col gap-8", className)}
        aria-busy="true"
        aria-live="polite"
      >
        <LoadingLabel label={label} />
        <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className={cx(sectionCardClass, "gap-7 p-6 md:p-7")}>
            {Array.from({ length: 3 }, (_, section) => (
              <div
                key={section}
                className={cx(
                  "flex flex-col gap-6",
                  section > 0 && "border-t border-secondary pt-6",
                )}
              >
                <div className="flex items-baseline gap-2.5">
                  <Skeleton className="h-4 w-6" />
                  <Skeleton className="h-6 w-40" />
                </div>
                <div className="grid gap-6 sm:grid-cols-2">
                  {Array.from({ length: section === 1 ? 3 : 4 }, (_, field) => (
                    <div key={field} className="flex flex-col gap-2">
                      <Skeleton className="h-3 w-20" />
                      <Skeleton className="h-10 w-full rounded-lg" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <aside className="flex flex-col gap-6">
            <div className={cx(sectionCardClass, "p-6")}>
              <Skeleton className="h-5 w-20" />
              <Skeleton className="aspect-[4/3] w-full rounded-lg" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-6 w-36" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-24" />
            </div>
            <div className={cx(sectionCardClass, "p-6")}>
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="mt-2 h-11 w-full rounded-lg" />
              <Skeleton className="mx-auto h-4 w-16" />
            </div>
          </aside>
        </div>
      </div>
    );
  }

  return (
    <div className={cx("mx-auto flex w-full max-w-3xl flex-col gap-4", className)} aria-busy="true" aria-live="polite">
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
        <div className="-mx-4 border-t border-secondary bg-primary px-4 py-4 md:mx-0 md:rounded-xl md:px-5 md:ring-1 md:ring-secondary">
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
  chrome = "card",
  className,
  label = "Loading…",
}: {
  rows?: number;
  showTitle?: boolean;
  /** `bare` omits card ring — use inside an existing SectionCard. */
  chrome?: "card" | "bare";
  className?: string;
  label?: string;
}): ReactNode {
  return (
    <div
      className={cx(chrome === "card" ? sectionCardClass : "flex flex-col gap-4", className)}
      aria-busy="true"
      aria-live="polite"
    >
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
  labeled = false,
}: {
  filterBars?: number;
  showPeriod?: boolean;
  /** When true, each filter is a label + control stack (inventory-style). */
  labeled?: boolean;
}): ReactNode {
  if (labeled) {
    return (
      <div className="flex flex-wrap items-end gap-3">
        <LabeledControlSkeleton controlWidth="min-w-0 max-w-md flex-1" />
        {Array.from({ length: filterBars }, (_, index) => (
          <LabeledControlSkeleton key={index} controlWidth="w-36" />
        ))}
      </div>
    );
  }

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

/** Inventory filter toolbar: merged lookup, status tabs, compact metal/category/purity. */
export function InventoryFilterStripSkeleton(): ReactNode {
  return (
    <div className="flex flex-col gap-5">
      <Skeleton className="h-12 w-full rounded-lg" />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-1 gap-6 overflow-hidden">
          <Skeleton className="h-11 w-14 shrink-0" />
          <Skeleton className="h-11 w-24 shrink-0" />
          <Skeleton className="h-11 w-16 shrink-0" />
          <Skeleton className="h-11 w-28 shrink-0" />
          <Skeleton className="h-11 w-32 shrink-0" />
        </div>
        <div className="flex shrink-0 flex-wrap gap-3">
          <Skeleton className="h-11 w-44 rounded-lg" />
          <Skeleton className="h-11 w-52 rounded-lg" />
          <Skeleton className="h-11 w-40 rounded-lg" />
        </div>
      </div>
    </div>
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
  showSelectionColumn = false,
  filterSkeleton,
  className,
  label = "Loading…",
}: {
  title?: boolean;
  filterBars?: number;
  columns?: number;
  rows?: number;
  showPeriod?: boolean;
  showSelectionColumn?: boolean;
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
        <TableSkeleton
          columns={columns}
          rows={rows}
          showCard={false}
          showSelectionColumn={showSelectionColumn}
          label={label}
        />
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
  tabCount = 3,
  layout = "stack",
  className,
  label = "Loading…",
}: {
  withAvatar?: boolean;
  sections?: number;
  withTabs?: boolean;
  /** Number of tab pills (customer 4, Girvi 5). */
  tabCount?: number;
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
          {Array.from({ length: tabCount }, (_, index) => (
            <Skeleton key={index} className={cx("h-9 rounded-lg", index === 0 ? "w-24" : index === 1 ? "w-20" : "w-28")} />
          ))}
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

/**
 * Customer profile cold load: full-width header + tabs; Profile body matches
 * live `mx-auto max-w-3xl` SectionCard stack (not full-bleed panels).
 */
export function CustomerDetailSkeleton({
  className,
  label = "Loading customer…",
}: {
  className?: string;
  label?: string;
}): ReactNode {
  return (
    <div className={cx("flex flex-col gap-6", className)} aria-busy="true" aria-live="polite">
      <LoadingLabel label={label} />
      <DetailHeaderSkeleton withAvatar label="" />
      <div className="flex gap-2 border-b border-secondary pb-px">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className={cx("h-9 rounded-lg", index === 0 ? "w-24" : index === 1 ? "w-20" : "w-28")} />
        ))}
      </div>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 pt-2">
        {Array.from({ length: 4 }, (_, index) => (
          <PanelSkeleton key={index} rows={index === 1 ? 5 : 3} label="" />
        ))}
      </div>
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

/** Dashboard in-feature / Suspense body: checklist → totals → 2×2 or chart. */
export function DashboardBodySkeleton({
  className,
  label = "Loading dashboard…",
  layout = "today",
}: {
  className?: string;
  label?: string;
  layout?: "today" | "period";
}): ReactNode {
  return (
    <div className={cx("flex flex-col gap-3.5", className)} aria-busy="true" aria-live="polite">
      <LoadingLabel label={label} />
      <div className="overflow-hidden border-2 border-primary bg-primary">
        <Skeleton className="h-7 w-full rounded-none bg-primary-solid/80" />
        <div className="flex flex-col gap-0">
          {Array.from({ length: 3 }, (_, index) => (
            <div
              key={index}
              className="grid grid-cols-[14px_2.5rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-secondary px-3 py-2 last:border-b-0"
            >
              <Skeleton className="size-3 rounded-none" />
              <Skeleton className="h-4 w-6" />
              <Skeleton className="h-3 w-48 max-w-full" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 border-2 border-primary bg-primary lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <div
            key={index}
            className="flex flex-col gap-1.5 border-b border-secondary p-2.5 last:border-b-0 sm:border-r sm:border-b-0 sm:last:border-r-0"
          >
            <Skeleton className="h-2.5 w-14" />
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="h-2.5 w-12" />
          </div>
        ))}
      </div>
      {layout === "period" ? (
        <div className="border-2 border-primary bg-primary p-3">
          <div className="mb-3 flex justify-between gap-2">
            <Skeleton className="h-4 w-56" />
            <Skeleton className="h-3 w-32" />
          </div>
          <Skeleton className="h-56 w-full rounded-none" />
          <div className="mt-3 flex flex-col gap-2 border-t border-secondary pt-2">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
          </div>
        </div>
      ) : (
        <div className="grid gap-3.5 lg:grid-cols-2">
          <div className="border-2 border-primary bg-primary">
            <div className="border-b-2 border-primary px-3 py-2">
              <Skeleton className="h-4 w-40" />
            </div>
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="flex justify-between gap-2 border-b border-secondary px-3 py-2.5 last:border-b-0">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-3 w-16" />
              </div>
            ))}
          </div>
          <div className="border-2 border-primary bg-primary">
            <div className="border-b-2 border-primary px-3 py-2">
              <Skeleton className="h-4 w-48" />
            </div>
            <div className="flex flex-col gap-3 p-3">
              <Skeleton className="h-8 w-32" />
              <Skeleton className="h-24 w-full rounded-none" />
              <Skeleton className="h-2.5 w-full rounded-none" />
            </div>
          </div>
          <div className="border-2 border-primary bg-primary">
            <div className="border-b-2 border-primary px-3 py-2">
              <Skeleton className="h-4 w-44" />
            </div>
            {Array.from({ length: 2 }, (_, index) => (
              <div key={index} className="flex justify-between gap-2 border-b border-secondary px-3 py-2.5 last:border-b-0">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-3 w-14" />
              </div>
            ))}
          </div>
          <div className="border-2 border-primary bg-primary">
            <div className="border-b-2 border-primary px-3 py-2">
              <Skeleton className="h-4 w-24" />
            </div>
            <div className="grid grid-cols-3 gap-2 p-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          </div>
        </div>
      )}
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
    <div className={cx("min-h-screen bg-secondary", className)} aria-busy="true" aria-live="polite">
      <LoadingLabel label={label} />
      <div className="sticky top-0 z-10 border-b border-secondary bg-primary">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-5 py-5 md:px-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-2">
              <Skeleton className="h-8 w-48" />
              <div className="flex flex-wrap items-center gap-2">
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-7 w-36 rounded-md" />
              </div>
              <Skeleton className="h-4 w-72 max-w-full" />
              <Skeleton className="h-3.5 w-96 max-w-full" />
            </div>
            <div className="flex flex-wrap gap-3">
              <Skeleton className="h-11 w-24 rounded-lg" />
              <Skeleton className="h-11 w-36 rounded-lg" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Skeleton className="h-11 w-48 rounded-lg" />
            <Skeleton className="h-11 w-36 rounded-lg" />
          </div>
        </div>
      </div>
      <div className="mx-auto w-full max-w-2xl px-4 py-6">
        <div className="flex flex-col gap-4 rounded-lg border border-secondary bg-primary p-6">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-3 w-64" />
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
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Cold staff-layout gate: sidebar rail + pathname-resolved main recipe.
 * Destination is known from the URL even while staff is still null (SSR/hydrate).
 */
export function StaffShellSkeleton({
  pathname = "",
  className,
  label = "Loading staff workspace…",
}: {
  pathname?: string;
  className?: string;
  label?: string;
}): ReactNode {
  return (
    <div className={cx("bg-secondary flex min-h-screen", className)} aria-busy="true" aria-live="polite">
      <LoadingLabel label={label} />
      <aside className="bg-sidebar hidden w-70 shrink-0 flex-col gap-4 p-4 shadow-(--shadow-sidebar-rail) lg:flex lg:pt-5">
        <Skeleton className="h-8 w-36 bg-white/10" />
        <div className="flex flex-col gap-1.5 pt-4">
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} className="h-11 w-full rounded-lg bg-white/10" />
          ))}
        </div>
        <div className="mt-auto flex flex-col gap-2 border-t border-sidebar pt-4">
          <Skeleton className="h-4 w-28 bg-white/10" />
          <Skeleton className="h-3 w-40 bg-white/10" />
          <Skeleton className="h-9 w-full rounded-lg bg-white/10" />
        </div>
      </aside>
      <div className="min-w-0 flex-1 px-4 py-6 lg:px-8">{staffGateMainSkeleton(pathname)}</div>
    </div>
  );
}

/** Map staff-app pathname to the same body recipe the destination page uses after gate. */
function staffGateMainSkeleton(pathname: string): ReactNode {
  const path = pathname.replace(/\/$/, "") || "/";

  if (
    path.endsWith("/edit") ||
    path === "/inventory/receive" ||
    path === "/customers/new" ||
    path === "/girvi/new" ||
    path === "/inventory/stock-counts/new"
  ) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <FormSkeleton sections={4} fieldsPerSection={5} showStickyActions label="" />
      </div>
    );
  }

  if (/^\/inventory\/[^/]+$/.test(path)) {
    return <ArticleDetailSkeleton label="" />;
  }

  if (/^\/customers\/[^/]+$/.test(path)) {
    return <CustomerDetailSkeleton label="" />;
  }

  if (/^\/girvi\/[^/]+$/.test(path)) {
    return <GirviDetailSkeleton label="" />;
  }

  if (path === "/invoices/new" || /^\/invoices\/[^/]+$/.test(path)) {
    return <PosWorkspaceSkeleton label="" />;
  }

  if (
    path === "/inventory" ||
    path === "/invoices" ||
    path === "/customers" ||
    path === "/girvi" ||
    path === "/payments" ||
    path === "/notifications"
  ) {
    return (
      <StaffListPageSkeleton
        columns={path === "/invoices" ? 7 : path === "/inventory" ? 6 : 5}
        filterBars={path === "/inventory" ? 4 : 3}
        showPeriod={path === "/invoices" || path === "/payments" || path === "/girvi"}
        showSelectionColumn={path === "/inventory"}
        label=""
      />
    );
  }

  if (path === "/settings") {
    return <SettingsPageSkeleton label="" />;
  }

  if (path === "/dashboard" || path === "/") {
    return <DashboardBodySkeleton label="" />;
  }

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-4 w-72 max-w-full" />
      <Skeleton className="mt-2 h-40 w-full rounded-xl" />
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
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} className="h-9 w-24 rounded-lg" />
        ))}
      </div>
      <FormSkeleton sections={2} showStickyActions label="" />
    </div>
  );
}

/**
 * Inventory article detail: header → fact band → photo / spec / history.
 * Adjustment lives in a dialog (no body SectionCard).
 */
export function ArticleDetailSkeleton({
  className,
  label = "Loading article…",
}: {
  /** @deprecated Adjustment is dialog-only; ignored. */
  showAdjustment?: boolean;
  className?: string;
  label?: string;
}): ReactNode {
  return (
    <div className={cx("flex w-full flex-col gap-8", className)} aria-busy="true" aria-live="polite">
      <LoadingLabel label={label} />
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-28" />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Skeleton className="h-8 w-40" />
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-6 w-24 rounded-full" />
            </div>
            <Skeleton className="h-4 w-64 max-w-full" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-9 w-28 rounded-lg" />
            <Skeleton className="h-9 w-28 rounded-lg" />
            <Skeleton className="h-9 w-28 rounded-lg" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 overflow-hidden rounded-xl ring-1 ring-secondary lg:grid-cols-6">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="border-b border-secondary px-5 py-5 lg:border-r lg:border-b-0 last:border-0">
            <Skeleton className="h-3.5 w-16" />
            <Skeleton className="mt-2 h-6 w-24" />
          </div>
        ))}
      </div>

      <div className="grid gap-7 xl:grid-cols-[280px_minmax(0,1fr)_280px]">
        <div className={sectionCardClass}>
          <Skeleton className="aspect-[4/3] w-full rounded-lg" />
          <Skeleton className="h-3 w-40" />
          <div className="border-t border-secondary pt-4">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="mt-2.5 h-20 w-full rounded-lg" />
            <Skeleton className="mt-2.5 h-3 w-48" />
          </div>
        </div>
        <div className={sectionCardClass}>
          <Skeleton className="h-5 w-36" />
          <DefinitionListSkeleton rows={8} label="" />
        </div>
        <PanelSkeleton rows={4} chrome="card" label="" />
      </div>
    </div>
  );
}

/** Finalized invoice detail: comfort header + money band + lines / collections / corrections + documents rail. */
export function InvoiceFinalizedDetailSkeleton({
  className,
  label = "Loading invoice…",
}: {
  className?: string;
  label?: string;
}): ReactNode {
  return (
    <div className={cx("flex flex-col gap-6", className)} aria-busy="true" aria-live="polite">
      <LoadingLabel label={label} />
      <div className="flex flex-col gap-3">
        <Skeleton className="h-5 w-24" />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <Skeleton className="h-9 w-44" />
              <Skeleton className="h-7 w-28 rounded-full" />
            </div>
            <Skeleton className="h-6 w-72 max-w-full" />
          </div>
          <div className="flex flex-wrap gap-3">
            <Skeleton className="h-11 w-20 rounded-lg" />
            <Skeleton className="h-11 w-24 rounded-lg" />
            <Skeleton className="h-11 w-36 rounded-lg" />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 overflow-hidden rounded-xl ring-1 ring-secondary lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="border-b border-secondary px-5 py-4 lg:border-r lg:border-b-0">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="mt-2 h-7 w-28" />
          </div>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="flex flex-col gap-6">
          <TableCard.Root>
            <Skeleton className="mx-4 my-3 h-5 w-28 md:mx-6" />
            <TableSkeleton columns={5} rows={4} showCard={false} showHeader={false} label="" />
          </TableCard.Root>
          <div className={sectionCardClass}>
            <Skeleton className="h-5 w-36" />
            <PanelSkeleton rows={2} showTitle={false} chrome="bare" label="" />
          </div>
          <div className={sectionCardClass}>
            <Skeleton className="h-5 w-40" />
            <PanelSkeleton rows={2} showTitle={false} chrome="bare" label="" />
          </div>
        </div>
        <aside className="flex flex-col gap-4">
          <div className="overflow-hidden rounded-xl ring-1 ring-secondary">
            <div className="border-b border-secondary px-5 py-3.5">
              <Skeleton className="h-4 w-24" />
            </div>
            <div className="flex flex-col gap-2.5 px-5 py-4">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-11 w-full rounded-lg" />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

/** POS billing: customer/scan + lines + sticky totals rail matching PosWorkspace. */
export function PosWorkspaceSkeleton({
  className,
  label = "Preparing draft…",
}: {
  className?: string;
  label?: string;
}): ReactNode {
  return (
    <div
      className={cx(
        "flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-6",
        className,
      )}
      aria-busy="true"
      aria-live="polite"
    >
      <LoadingLabel label={label} />
      <div className="flex min-w-0 flex-col gap-6">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-8 w-40" />
          </div>
          <Skeleton className="ml-auto h-5 w-28" />
          <Skeleton className="h-11 w-28 shrink-0 rounded-lg" />
        </div>
        <Skeleton className="h-20 w-full rounded-xl" />
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
            <Skeleton className="h-16 min-w-0 flex-1 rounded-lg" />
            <div className="flex shrink-0 flex-col gap-1.5">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-11 w-28 rounded-lg" />
            </div>
          </div>
          <Skeleton className="h-11 w-40 rounded-lg" />
        </div>
        <TableCard.Root>
          <TableSkeleton columns={6} rows={5} showCard={false} label="" />
        </TableCard.Root>
      </div>
      <aside className="sticky top-4 flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden rounded-xl shadow-xs ring-1 ring-secondary lg:w-[320px]">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-primary">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="flex flex-col items-center gap-2 px-5 py-4">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-24" />
            </div>
            <div className="flex flex-col gap-3 border-t border-dashed border-secondary px-5 py-4">
              {Array.from({ length: 2 }, (_, index) => (
                <div key={index} className="flex justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-4 w-36" />
                  </div>
                  <Skeleton className="h-4 w-16 shrink-0" />
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-3 border-t border-dashed border-secondary px-5 py-4">
              {Array.from({ length: 3 }, (_, index) => (
                <div key={index} className="flex justify-between gap-3">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-3 border-t border-dashed border-secondary px-5 py-4">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-20 w-full rounded-lg" />
              <Skeleton className="h-11 w-full rounded-lg" />
              <Skeleton className="h-24 w-full rounded-lg" />
            </div>
          </div>
          <div className="mt-auto flex flex-col gap-3 border-t-2 border-primary px-5 py-4">
            <div className="flex flex-col gap-1">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-8 w-36" />
            </div>
            <Skeleton className="h-11 w-full rounded-lg" />
          </div>
        </div>
      </aside>
    </div>
  );
}

/** Girvi account detail: header + 5 tabs + default Collateral table. */
export function GirviDetailSkeleton({
  className,
  label = "Loading Girvi account…",
}: {
  className?: string;
  label?: string;
}): ReactNode {
  return (
    <div className={cx("flex flex-col gap-6", className)} aria-busy="true" aria-live="polite">
      <LoadingLabel label={label} />
      <DetailHeaderSkeleton label="" />
      <div className="flex gap-2 border-b border-secondary pb-px">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className={cx("h-9 rounded-lg", index === 0 ? "w-28" : "w-24")} />
        ))}
      </div>
      <TableCard.Root>
        <TableCard.Header title="Collateral packets" badge={<Skeleton className="h-5 w-8 rounded-full" />} />
        <TableSkeleton columns={5} rows={6} showCard={false} label="" />
      </TableCard.Root>
    </div>
  );
}

/** Customer Sales tab: due card + outstanding table + Credits + Payment history. */
export function CustomerSalesPanelSkeleton({
  className,
  label = "Loading sales statement…",
}: {
  className?: string;
  label?: string;
}): ReactNode {
  return (
    <div className={cx("flex flex-col gap-4", className)} aria-busy="true" aria-live="polite">
      <LoadingLabel label={label} />
      <div className={sectionCardClass}>
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-3 w-56 max-w-full" />
      </div>
      <TableSkeleton columns={5} rows={4} label="" />
      <div className={sectionCardClass}>
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
        <PanelSkeleton rows={2} showTitle={false} chrome="bare" label="" />
      </div>
      <div className={sectionCardClass}>
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
        <PanelSkeleton rows={3} showTitle={false} chrome="bare" label="" />
      </div>
    </div>
  );
}

/** Settings Sequences tab: SectionCard grid + sticky actions. */
export function SequencesFormSkeleton({
  className,
  label = "Loading document sequences…",
}: {
  className?: string;
  label?: string;
}): ReactNode {
  return (
    <div className={cx("mx-auto flex w-full max-w-3xl flex-col gap-4", className)} aria-busy="true" aria-live="polite">
      <LoadingLabel label={label} />
      <div className={sectionCardClass}>
        <div>
          <Skeleton className="h-5 w-44" />
          <Skeleton className="mt-2 h-3 w-72 max-w-full" />
        </div>
        <div className="mb-1 grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-3 w-16" />
          ))}
        </div>
        {Array.from({ length: 5 }, (_, row) => (
          <div key={row} className="grid grid-cols-4 gap-3">
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
        ))}
        <div className="flex justify-end border-t border-secondary pt-4">
          <Skeleton className="h-10 w-28 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

/** Tag print preview: action chrome + sheet of label rectangles. */
export function TagPrintSkeleton({
  showChrome = true,
  className,
  label = "Preparing tags…",
}: {
  /** When false, only the label sheet (live page already paints the action bar). */
  showChrome?: boolean;
  className?: string;
  label?: string;
}): ReactNode {
  return (
    <div className={cx("flex flex-col gap-4", className)} aria-busy="true" aria-live="polite">
      <LoadingLabel label={label} />
      {showChrome ? (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-secondary px-4 py-4">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3 w-56" />
            <Skeleton className="h-3 w-72 max-w-full" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-28 rounded-lg" />
            <Skeleton className="h-9 w-24 rounded-lg" />
          </div>
        </div>
      ) : null}
      <div className="mx-auto flex w-full max-w-5xl flex-wrap justify-center gap-4 px-4 py-6">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-28 w-44 rounded-md" />
        ))}
      </div>
    </div>
  );
}
