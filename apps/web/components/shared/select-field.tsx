"use client";

import { useMemo, type FC, type ReactNode, type Ref } from "react";
import type { Key } from "react-aria-components";
import { Select } from "@/components/base/select/select";
import { cx } from "@/utils/cx";

/** Internal list id for empty-string option values; must not appear as a real option value. */
const EMPTY_VALUE_SENTINEL = "__select_field_empty__";

export type SelectFieldOption<T extends string = string> = {
  label: string;
  value: T;
  disabled?: boolean;
  supportingText?: string;
  icon?: FC | ReactNode;
};

export type SelectFieldProps<T extends string = string> = {
  label?: string;
  hint?: string;
  error?: string;
  tooltip?: string;
  placeholder?: string;
  value: T;
  onChange: (value: T) => void;
  options: SelectFieldOption<T>[];
  size?: "sm" | "md" | "lg";
  isDisabled?: boolean;
  isLoading?: boolean;
  isRequired?: boolean;
  isInvalid?: boolean;
  className?: string;
  name?: string;
  popoverClassName?: string;
  ref?: Ref<HTMLDivElement>;
  "aria-label"?: string;
};

function toItemId(value: string): string {
  return value === "" ? EMPTY_VALUE_SENTINEL : value;
}

function fromItemId(id: Key): string {
  const key = String(id);
  return key === EMPTY_VALUE_SENTINEL ? "" : key;
}

export function SelectField<T extends string = string>({
  label,
  hint,
  error,
  tooltip,
  placeholder = "Select",
  value,
  onChange,
  options,
  size = "md",
  isDisabled,
  isLoading,
  isRequired,
  isInvalid,
  className,
  name,
  popoverClassName,
  ref,
  "aria-label": ariaLabel,
}: SelectFieldProps<T>) {
  if (process.env.NODE_ENV !== "production") {
    for (const option of options) {
      if (option.value === EMPTY_VALUE_SENTINEL) {
        console.warn(
          `SelectField: option value "${EMPTY_VALUE_SENTINEL}" collides with the empty-value sentinel. Choose a different value.`,
        );
      }
    }
  }

  const isEmpty = !isLoading && options.length === 0;
  const hasEmptyOption = options.some((option) => option.value === "");
  const valueInOptions = options.some((option) => option.value === value);

  const items = useMemo(
    () =>
      options.map((option) => ({
        id: toItemId(option.value),
        label: option.label,
        isDisabled: option.disabled,
        supportingText: option.supportingText,
        icon: option.icon,
      })),
    [options],
  );

  const selectedKey =
    value === ""
      ? hasEmptyOption
        ? EMPTY_VALUE_SENTINEL
        : null
      : valueInOptions
        ? value
        : null;

  const resolvedPlaceholder = isLoading && !valueInOptions ? "Loading…" : isEmpty ? "No options yet" : placeholder;
  const resolvedHint = hint ?? (isEmpty ? "No options yet" : undefined);
  const disabled = Boolean(isDisabled || isLoading || isEmpty);

  return (
    <Select
      ref={ref}
      name={name}
      label={label}
      hint={resolvedHint}
      error={error}
      tooltip={tooltip}
      placeholder={resolvedPlaceholder}
      size={size}
      isDisabled={disabled}
      isLoading={isLoading}
      isRequired={isRequired}
      isInvalid={isInvalid}
      aria-label={ariaLabel}
      className={cx("w-full", className)}
      popoverClassName={popoverClassName}
      value={selectedKey}
      onChange={(key) => {
        if (key == null) {
          return;
        }
        onChange(fromItemId(key) as T);
      }}
      items={items}
    >
      {(item) => (
        <Select.Item
          id={item.id}
          label={item.label}
          isDisabled={item.isDisabled}
          supportingText={item.supportingText}
          icon={item.icon}
        >
          {item.label}
        </Select.Item>
      )}
    </Select>
  );
}
