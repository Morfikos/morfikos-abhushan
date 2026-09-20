"use client";

import type { ReactNode } from "react";

import { Input } from "@/components/base/input/input";
import { formatInr } from "@/lib/money";
import { cx } from "@/utils/cx";

function RupeeMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cx("flex items-center justify-center text-sm font-medium text-fg-quaternary", className)}
    >
      ₹
    </span>
  );
}

export function MoneyInput({
  label,
  value,
  onChange,
  isDisabled = false,
  isInvalid = false,
  hint,
  placeholder,
  maxHintAmount,
  className,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  isDisabled?: boolean;
  isInvalid?: boolean;
  hint?: ReactNode;
  placeholder?: string;
  /** When set, appends "of ₹X due" under the field unless a custom hint is provided. */
  maxHintAmount?: string;
  className?: string;
}) {
  const resolvedHint =
    hint ?? (maxHintAmount ? `of ${formatInr(maxHintAmount)} due` : undefined);

  return (
    <Input
      label={label}
      type="tel"
      value={value}
      onChange={onChange}
      isDisabled={isDisabled}
      isInvalid={isInvalid}
      placeholder={placeholder}
      hint={resolvedHint}
      icon={RupeeMark}
      inputClassName="text-right tabular-nums"
      className={className}
    />
  );
}
