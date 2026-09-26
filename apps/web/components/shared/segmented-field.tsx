"use client";

import { useId } from "react";
import type { Key } from "react-aria-components";

import { ButtonGroup, ButtonGroupItem, type ButtonGroupSelection } from "@/components/base/button-group/button-group";
import { Label } from "@/components/base/input/label";
import { cx } from "@/utils/cx";

export type SegmentedFieldOption<T extends string = string> = {
  label: string;
  value: T;
  disabled?: boolean;
};

export type SegmentedFieldProps<T extends string = string> = {
  label?: string;
  hint?: string;
  error?: string;
  value: T;
  onChange: (value: T) => void;
  options: SegmentedFieldOption<T>[];
  size?: "sm" | "md";
  /** Form enums use accent; list filters use filter (content-sized, may scroll). */
  selection?: ButtonGroupSelection;
  isDisabled?: boolean;
  isRequired?: boolean;
  isInvalid?: boolean;
  className?: string;
  "aria-label"?: string;
};

export function SegmentedField<T extends string = string>({
  label,
  hint,
  error,
  value,
  onChange,
  options,
  size = "sm",
  selection = "accent",
  isDisabled,
  isRequired,
  isInvalid,
  className,
  "aria-label": ariaLabel,
}: SegmentedFieldProps<T>) {
  const optionValues = options.map((option) => option.value);
  const baseId = useId();
  const labelId = label ? `${baseId}-label` : undefined;
  const hintId = hint ? `${baseId}-hint` : undefined;
  const errorId = error ? `${baseId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  const stretchItems = selection !== "filter";

  return (
    <div className={cx("flex w-full flex-col gap-1.5", className)}>
      {label ? (
        <Label id={labelId} isRequired={isRequired} isInvalid={isInvalid}>
          {label}
        </Label>
      ) : null}
      <ButtonGroup
        aria-labelledby={labelId}
        aria-label={labelId ? undefined : ariaLabel}
        aria-describedby={describedBy}
        aria-invalid={isInvalid || Boolean(error) || undefined}
        size={size}
        selection={selection}
        selectedKeys={new Set([value])}
        disallowEmptySelection
        isDisabled={isDisabled}
        className="w-full"
        onSelectionChange={(keys) => {
          const next = [...keys][0] as Key | undefined;
          if (typeof next === "string" && optionValues.includes(next as T)) {
            onChange(next as T);
          }
        }}
      >
        {options.map((option) => (
          <ButtonGroupItem
            key={option.value}
            id={option.value}
            isDisabled={option.disabled}
            className={cx("justify-center", stretchItems && "flex-1")}
          >
            {option.label}
          </ButtonGroupItem>
        ))}
      </ButtonGroup>
      {hint ? (
        <p id={hintId} className={cx("text-sm text-tertiary", size === "sm" && "text-xs")}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className={cx("text-sm text-error-primary", size === "sm" && "text-xs")} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
