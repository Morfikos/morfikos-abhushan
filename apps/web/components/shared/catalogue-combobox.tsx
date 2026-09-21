"use client";

import { useMemo } from "react";
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
  isRequired = false,
  isDisabled = false,
  isInvalid = false,
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
  isRequired?: boolean;
  isDisabled?: boolean;
  isInvalid?: boolean;
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

  return (
    <div className={cx("w-full", className)}>
      <ComboBox
        label={label}
        items={comboItems}
        selectedKey={selectedKey}
        onSelectionChange={(key: Key | null) => {
          if (key === null) {
            if (allowEmpty) {
              onChange("");
            }
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
        hint={hint}
        menuTrigger="focus"
      >
        {(item) => <SelectItem id={item.id} label={item.label} />}
      </ComboBox>
    </div>
  );
}
