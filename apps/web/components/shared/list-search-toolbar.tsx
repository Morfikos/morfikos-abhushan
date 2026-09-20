"use client";

import type { KeyboardEvent } from "react";
import { SearchLg } from "@untitledui/icons";

import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";

export function ListSearchToolbar({
  value,
  onChange,
  onSearch,
  onClear,
  filtersActive,
  placeholder,
  label = "Search",
}: {
  value: string;
  onChange: (value: string) => void;
  onSearch: () => void;
  onClear: () => void;
  filtersActive: boolean;
  placeholder: string;
  label?: string;
}) {
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    onSearch();
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="w-full max-w-md">
        <Input
          label={label}
          value={value}
          placeholder={placeholder}
          icon={SearchLg}
          onChange={onChange}
          onKeyDown={onKeyDown}
        />
      </div>
      <div className="flex items-end gap-2">
        <Button color="secondary" size="md" onPress={onSearch}>
          Search
        </Button>
        {filtersActive ? (
          <Button color="tertiary" size="md" onPress={onClear}>
            Clear
          </Button>
        ) : null}
      </div>
    </div>
  );
}
