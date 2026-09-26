"use client";

import type { ReactNode } from "react";
import { X as CloseX } from "@untitledui/icons";

import { cx } from "@/utils/cx";

const chipRoot =
  "inline-flex items-center gap-0.5 whitespace-nowrap rounded-full bg-utility-neutral-100 text-xs font-medium text-utility-neutral-700 ring-1 ring-inset ring-utility-neutral-300";

export function Chip({
  children,
  onDismiss,
  onPress,
  isDisabled,
  className,
  "aria-label": ariaLabel,
}: {
  children: ReactNode;
  /** When set, the whole chip dismisses (× is visual only). */
  onDismiss?: () => void;
  /** When set (and onDismiss is absent), the whole chip is a pressable suggestion. */
  onPress?: () => void;
  isDisabled?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const labelText = typeof children === "string" ? children : undefined;
  const removeLabel = labelText ? `Remove ${labelText}` : ariaLabel ? `Remove ${ariaLabel}` : "Remove filter";

  const label = (
    <span className="min-w-0 max-w-48 truncate" title={labelText}>
      {children}
    </span>
  );

  if (onPress && !onDismiss) {
    return (
      <button
        type="button"
        aria-label={ariaLabel}
        disabled={isDisabled}
        onClick={onPress}
        title={labelText}
        className={cx(
          chipRoot,
          "cursor-pointer border border-dashed border-secondary bg-primary px-2.5 py-0.5 ring-0",
          "outline-focus-ring transition duration-100 ease-linear",
          "hover:border-transparent hover:bg-brand-primary hover:text-brand-secondary",
          "focus-visible:outline-2 focus-visible:outline-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
      >
        {label}
      </button>
    );
  }

  if (onDismiss) {
    return (
      <button
        type="button"
        aria-label={removeLabel}
        disabled={isDisabled}
        onClick={onDismiss}
        title={labelText}
        className={cx(
          chipRoot,
          "cursor-pointer py-0.5 pl-2 pr-0.5 outline-focus-ring transition duration-100 ease-linear",
          "hover:bg-utility-neutral-200 focus-visible:outline-2 focus-visible:outline-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
      >
        {label}
        <span
          aria-hidden="true"
          className="-my-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-utility-neutral-400"
        >
          <CloseX className="size-3 stroke-[3px]" />
        </span>
      </button>
    );
  }

  return (
    <span className={cx(chipRoot, "px-2.5 py-0.5", className)} title={labelText}>
      {label}
    </span>
  );
}
