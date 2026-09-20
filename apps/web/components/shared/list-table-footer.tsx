"use client";

import { Button } from "@/components/base/buttons/button";
import { SelectField } from "@/components/shared/select-field";
import { cx } from "@/utils/cx";

export const LIST_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export type ListPageSize = (typeof LIST_PAGE_SIZE_OPTIONS)[number];

export type ListTableFooterProps = {
  page: number;
  totalPages: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  className?: string;
};

export function ListTableFooter({
  page,
  totalPages,
  pageSize,
  onPageChange,
  onPageSizeChange,
  className,
}: ListTableFooterProps) {
  const safeTotal = Math.max(1, totalPages);
  const atFirst = page <= 1;
  const atLast = page >= safeTotal;

  return (
    <div className={cx("border-t border-secondary px-4 py-3 md:px-6 md:pt-3 md:pb-4", className)}>
      <nav aria-label="Pagination" className="flex items-center justify-between gap-3 md:hidden">
        <Button
          color="secondary"
          size="sm"
          isDisabled={atFirst}
          onPress={() => onPageChange(Math.max(1, page - 1))}
        >
          Previous
        </Button>
        <span className="text-sm font-medium text-fg-secondary">
          Page {page} of {safeTotal}
        </span>
        <Button
          color="secondary"
          size="sm"
          isDisabled={atLast}
          onPress={() => onPageChange(Math.min(safeTotal, page + 1))}
        >
          Next
        </Button>
      </nav>

      <nav aria-label="Pagination" className="hidden items-center justify-between gap-3 md:flex">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-fg-secondary">
            Page {page} of {safeTotal}
          </span>
          <SelectField
            aria-label="Rows per page"
            size="sm"
            className="w-34"
            value={String(pageSize)}
            onChange={(value) => {
              const next = Number(value);
              if (LIST_PAGE_SIZE_OPTIONS.includes(next as ListPageSize)) {
                onPageSizeChange(next);
              }
            }}
            options={LIST_PAGE_SIZE_OPTIONS.map((size) => ({
              label: `${size} per page`,
              value: String(size),
            }))}
          />
        </div>
        <div className="flex items-center gap-3">
          <Button
            color="secondary"
            size="sm"
            isDisabled={atFirst}
            onPress={() => onPageChange(Math.max(1, page - 1))}
          >
            Previous
          </Button>
          <Button
            color="secondary"
            size="sm"
            isDisabled={atLast}
            onPress={() => onPageChange(Math.min(safeTotal, page + 1))}
          >
            Next
          </Button>
        </div>
      </nav>
    </div>
  );
}
