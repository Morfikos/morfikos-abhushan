"use client";

import { Button } from "@/components/base/buttons/button";
import { Chip } from "@/components/shared/chip";
import type { ListFilterChip } from "@/lib/list-search-params";

export function ActiveFiltersBar({
  chips,
  onClear,
  onRemove,
  clearLabel = "Clear filters",
  showLabel = true,
}: {
  chips: ListFilterChip[];
  onClear: () => void;
  /** When provided, chip dismiss removes that filter; otherwise chips are display-only. */
  onRemove?: (id: string) => void;
  clearLabel?: string;
  /** When false, omits the leading "Active filters" caption. */
  showLabel?: boolean;
}) {
  if (chips.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Active filters">
      {showLabel ? <span className="text-xs font-medium text-tertiary">Active filters</span> : null}
      {chips.map((chip) => (
        <Chip
          key={chip.id}
          onDismiss={onRemove ? () => onRemove(chip.id) : undefined}
        >
          {chip.label}
        </Chip>
      ))}
      <Button color="link-gray" size="sm" onPress={onClear}>
        {clearLabel}
      </Button>
    </div>
  );
}
