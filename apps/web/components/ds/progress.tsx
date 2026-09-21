import type { HTMLAttributes } from "react";

import { cx } from "@/utils/cx";

export type ProgressProps = {
  /**
   * Determinate value 0–100. Omit (or pass `null`) for indeterminate.
   */
  value?: number | null;
  /** Accessible name for the progressbar. */
  "aria-label"?: string;
  className?: string;
} & Omit<
  HTMLAttributes<HTMLDivElement>,
  "children" | "className" | "role" | "aria-valuenow" | "aria-valuemin" | "aria-valuemax"
>;

function clampPercent(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

/**
 * Accent fill on a sunken track. Determinate sets `aria-valuenow`; indeterminate is busy.
 */
export function Progress({
  value = null,
  "aria-label": ariaLabel = "Progress",
  className,
  ...rest
}: ProgressProps) {
  const determinate = typeof value === "number";
  const percent = determinate ? clampPercent(value) : undefined;

  return (
    <div
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuemin={determinate ? 0 : undefined}
      aria-valuemax={determinate ? 100 : undefined}
      aria-valuenow={percent}
      aria-busy={determinate ? undefined : true}
      className={cx(
        "relative h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken",
        className,
      )}
      {...rest}
    >
      {determinate ? (
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-(--dur-base) ease-(--ease) motion-reduce:transition-none"
          style={{ width: `${percent}%` }}
        />
      ) : (
        <div
          className={cx(
            "h-full w-full rounded-full",
            "bg-[linear-gradient(90deg,transparent_0%,var(--accent)_50%,transparent_100%)] bg-size-[840px_100%]",
            "motion-safe:animate-shimmer motion-reduce:animate-none motion-reduce:bg-accent",
          )}
        />
      )}
    </div>
  );
}
