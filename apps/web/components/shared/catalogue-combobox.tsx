"use client";

import { useMemo, type ReactNode } from "react";
import type { Key } from "react-aria-components";

import { ComboBox } from "@/components/base/select/combobox";
import { SelectItem } from "@/components/base/select/select-item";
import { cx } from "@/utils/cx";

const EMPTY_KEY = "__none__";

export type CatalogueComboboxItem = {
  id: string;
  label: string;
};

export function CatalogueCombobox({
  label,
  items,
  value,
  onChange,
  placeholder = "Search…",
  hint,
  error,
  emptyMessage,
  isRequired = false,
  isDisabled = false,
  isInvalid = false,
  isLoading = false,
  isClearable = false,
  allowEmpty = false,
  emptyLabel = "None",
  className,
}: {
  label?: string;
  items: CatalogueComboboxItem[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  error?: string;
  emptyMessage?: ReactNode;
  isRequired?: boolean;
  isDisabled?: boolean;
  isInvalid?: boolean;
  isLoading?: boolean;
  /** When true, clearing the selection sets value to "". */
  isClearable?: boolean;
  allowEmpty?: boolean;
  emptyLabel?: string;
  className?: string;
}) {
  const comboItems = useMemo(() => {
    const mapped = items.map((item) => ({
      id: item.id,
      label: item.label,
    }));
    if (allowEmpty) {
      return [{ id: EMPTY_KEY, label: emptyLabel }, ...mapped];
    }
    return mapped;
  }, [allowEmpty, emptyLabel, items]);

  const selectedKey = value === "" && allowEmpty ? EMPTY_KEY : value || null;
  const resolvedHint = error
    ? undefined
    : (hint ?? (isLoading ? "Loading…" : undefined));
  const showEmpty = Boolean(emptyMessage) && !isLoading && items.length === 0 && !error;

  return (
    <div className={cx("relative w-full", className)}>
      <ComboBox
        label={label}
        items={comboItems}
        selectedKey={selectedKey}
        menuTrigger="input"
        onSelectionChange={(key: Key | null) => {
          if (key === null) {
            if (isClearable) {
              onChange("");
              return;
            }
            if (!allowEmpty) {
              return;
            }
            if (value === "" || value === EMPTY_KEY) {
              onChange("");
              return;
            }
            const stillPresent = items.some((item) => item.id === value);
            if (stillPresent || isLoading) {
              return;
            }
            onChange("");
            return;
          }
          const id = String(key);
          onChange(id === EMPTY_KEY ? "" : id);
        }}
        placeholder={placeholder}
        shortcut={false}
        size="md"
        isRequired={isRequired}
        isDisabled={isDisabled}
        isInvalid={isInvalid}
        hint={resolvedHint}
        error={error}
      >
        {(item) => <SelectItem id={item.id} label={item.label} />}
      </ComboBox>
      {isLoading ? (
        <span
          aria-hidden
          className="pointer-events-none absolute top-[2.375rem] right-3 flex size-4 items-center justify-center text-fg-quaternary"
        >
          <svg className="size-4 animate-spin" viewBox="0 0 20 20" fill="none">
            <circle className="stroke-current opacity-30" cx="10" cy="10" r="8" fill="none" strokeWidth="2" />
            <circle
              className="origin-center stroke-current"
              cx="10"
              cy="10"
              r="8"
              fill="none"
              strokeWidth="2"
              strokeDasharray="12.5 50"
              strokeLinecap="round"
            />
          </svg>
        </span>
      ) : null}
      {showEmpty ? <div className="mt-1.5 text-sm text-tertiary">{emptyMessage}</div> : null}
    </div>
  );
}
