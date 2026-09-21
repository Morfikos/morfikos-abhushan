"use client";

import { BadgeWithButton } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import type { ListFilterChip } from "@/lib/list-search-params";

export function ActiveFiltersBar({
  chips,
  onClear,
  onRemove,
}: {
  chips: ListFilterChip[];
  onClear: () => void;
  /** When provided, chip dismiss removes that filter; otherwise chips are display-only. */
  onRemove?: (id: string) => void;
}) {
  if (chips.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Active filters">
      <span className="text-xs font-medium text-tertiary">Active filters</span>
      {chips.map((chip) =>
        onRemove ? (
          <BadgeWithButton
            key={chip.id}
            type="pill-color"
            color="gray"
            size="sm"
            buttonLabel={`Remove ${chip.label}`}
            onButtonClick={() => onRemove(chip.id)}
          >
            {chip.label}
          </BadgeWithButton>
        ) : (
          <span
            key={chip.id}
            className="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary ring-1 ring-inset ring-secondary"
          >
            {chip.label}
          </span>
        ),
      )}
      <Button color="link-gray" size="sm" onPress={onClear}>
        Clear
      </Button>
    </div>
  );
}
