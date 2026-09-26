"use client";

import { SearchLg } from "@untitledui/icons";

import { Input } from "@/components/base/input/input";
import { cx } from "@/utils/cx";

function SearchPendingIcon({ className }: { className?: string }) {
  return (
    <svg
      fill="none"
      aria-hidden="true"
      viewBox="0 0 20 20"
      className={cx("size-4 shrink-0 text-fg-quaternary", className)}
    >
      <circle className="stroke-current opacity-30" cx="10" cy="10" r="8" fill="none" strokeWidth="2" />
      <circle
        className="origin-center animate-spin stroke-current"
        cx="10"
        cy="10"
        r="8"
        fill="none"
        strokeWidth="2"
        strokeDasharray="12.5 50"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Debounced directory search: typing commits via the parent; clearing the field clears only `q`. */
export function ListSearchField({
  value,
  onChange,
  placeholder,
  label = "Search",
  size = "md",
  isPending = false,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label?: string;
  size?: "sm" | "md" | "lg";
  /** True while debounce is outstanding or a list refetch is in flight. */
  isPending?: boolean;
  "aria-label"?: string;
}) {
  return (
    <div aria-busy={isPending || undefined}>
      <Input
        label={ariaLabel ? undefined : label}
        aria-label={ariaLabel}
        size={size}
        value={value}
        placeholder={placeholder}
        icon={SearchLg}
        isClearable
        suffix={isPending ? <SearchPendingIcon /> : undefined}
        onChange={onChange}
      />
    </div>
  );
}
