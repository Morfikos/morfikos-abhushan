"use client";

import { useEffect, useState } from "react";
import type { Key } from "react-aria-components";
import { Select } from "@/components/base/select/select";
import { cx } from "@/utils/cx";

const EMPTY_KEY = "__all__";

export type SelectFieldOption = {
  label: string;
  value: string;
  disabled?: boolean;
};

export type SelectFieldProps = {
  label?: string;
  hint?: string;
  tooltip?: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectFieldOption[];
  size?: "sm" | "md" | "lg";
  isDisabled?: boolean;
  isRequired?: boolean;
  isInvalid?: boolean;
  className?: string;
  "aria-label"?: string;
};

function toItemId(value: string): string {
  return value === "" ? EMPTY_KEY : value;
}

function fromItemId(id: Key): string {
  const key = String(id);
  return key === EMPTY_KEY ? "" : key;
}

const triggerHeight = {
  sm: "h-9",
  md: "h-10",
  lg: "h-11",
} as const;

export function SelectField({
  label,
  hint,
  tooltip,
  placeholder = "Select",
  value,
  onChange,
  options,
  size = "md",
  isDisabled,
  isRequired,
  isInvalid,
  className,
  "aria-label": ariaLabel,
}: SelectFieldProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const hasEmptyOption = options.some((option) => option.value === "");
  const items = options.map((option) => ({
    id: toItemId(option.value),
    label: option.label,
    isDisabled: option.disabled,
  }));

  const selectedKey = value === "" ? (hasEmptyOption ? EMPTY_KEY : null) : value;
  const selectedLabel = options.find((option) => option.value === value)?.label;

  if (!mounted) {
    return (
      <div className={cx("flex w-full flex-col gap-1.5", className)}>
        {label ? <span className="text-sm font-medium text-secondary">{label}</span> : null}
        <div
          aria-hidden="true"
          className={cx(
            "flex w-full items-center rounded-lg bg-primary px-3 shadow-xs ring-1 ring-primary ring-inset",
            triggerHeight[size],
            isDisabled && "opacity-50",
          )}
        >
          <span className="truncate text-md font-medium text-primary">{selectedLabel ?? placeholder}</span>
        </div>
        {hint ? <span className="text-sm text-tertiary">{hint}</span> : null}
      </div>
    );
  }

  return (
    <Select
      label={label}
      hint={hint}
      tooltip={tooltip}
      placeholder={placeholder}
      size={size}
      isDisabled={isDisabled}
      isRequired={isRequired}
      isInvalid={isInvalid}
      aria-label={ariaLabel}
      className={cx("w-full", className)}
      value={selectedKey}
      onChange={(key) => {
        if (key == null) {
          return;
        }
        onChange(fromItemId(key));
      }}
      items={items}
    >
      {(item) => (
        <Select.Item id={item.id} label={item.label} isDisabled={item.isDisabled}>
          {item.label}
        </Select.Item>
      )}
    </Select>
  );
}
