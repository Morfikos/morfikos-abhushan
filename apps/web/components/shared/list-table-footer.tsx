"use client";

import { ArrowLeft, ArrowRight } from "@untitledui/icons";

import { Pagination } from "@/components/application/pagination/pagination-base";
import { ButtonGroup, ButtonGroupItem } from "@/components/base/button-group/button-group";
import { Button } from "@/components/base/buttons/button";
import { SelectField } from "@/components/shared/select-field";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { cx } from "@/utils/cx";

export const LIST_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export type ListPageSize = (typeof LIST_PAGE_SIZE_OPTIONS)[number];

export type ListTableFooterProps = {
  page: number;
  totalPages: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  /** When set, shows a result range such as `1–25 of 142`. */
  total?: number;
  className?: string;
  /** Control size. Default `lg` for counter-readable directories; pass `sm`/`md` for dense tables. */
  size?: "sm" | "md" | "lg";
};

export function ListTableFooter({
  page,
  totalPages,
  pageSize,
  onPageChange,
  onPageSizeChange,
  total,
  className,
  size = "lg",
}: ListTableFooterProps) {
  const isDesktop = useBreakpoint("md");
  const safeTotalPages = Math.max(1, totalPages);
  const showPageStrip = safeTotalPages > 1;
  const rangeLabel =
    typeof total === "number"
      ? total === 0
        ? "0 of 0"
        : (() => {
            const start = (page - 1) * pageSize + 1;
            const end = Math.min(page * pageSize, total);
            return `${start}–${end} of ${total}`;
          })()
      : `Page ${page} of ${safeTotalPages}`;

  const pageItemSize = size === "lg" ? "size-11" : size === "md" ? "size-10" : "size-9";
  const bandPad =
    size === "lg"
      ? "px-5 py-4 md:px-7 md:pt-4 md:pb-5"
      : size === "md"
        ? "px-4 py-3.5 md:px-6 md:pt-3.5 md:pb-4"
        : "px-4 py-3 md:px-6 md:pt-3 md:pb-4";

  return (
    <div className={cx("border-t border-secondary", bandPad, className)}>
      <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={cx(
              "font-medium text-fg-secondary",
              size === "lg" ? "text-md" : "text-sm",
            )}
          >
            {rangeLabel}
          </span>
          <SelectField
            aria-label="Rows per page"
            size={size}
            className={size === "lg" ? "w-40" : size === "md" ? "w-36" : "w-34"}
            value={String(pageSize)}
            onChange={(value) => {
              const next = Number(value);
              if (LIST_PAGE_SIZE_OPTIONS.includes(next as ListPageSize)) {
                onPageSizeChange(next);
              }
            }}
            options={LIST_PAGE_SIZE_OPTIONS.map((option) => ({
              label: `${option} per page`,
              value: String(option),
            }))}
          />
        </div>

        {showPageStrip ? (
          <Pagination.Root page={page} total={safeTotalPages} onPageChange={onPageChange}>
            <Pagination.Context>
              {({ pages }) => (
                <ButtonGroup size={size} selection="quiet">
                  <Pagination.PrevTrigger asChild>
                    <ButtonGroupItem iconLeading={ArrowLeft}>{isDesktop ? "Previous" : undefined}</ButtonGroupItem>
                  </Pagination.PrevTrigger>

                  {pages.map((item, index) =>
                    item.type === "page" ? (
                      <Pagination.Item key={index} {...item} asChild>
                        <ButtonGroupItem
                          isSelected={item.isCurrent}
                          className={cx(pageItemSize, "items-center justify-center")}
                        >
                          {item.value}
                        </ButtonGroupItem>
                      </Pagination.Item>
                    ) : (
                      <Pagination.Ellipsis key={index}>
                        <ButtonGroupItem
                          className={cx(
                            pageItemSize,
                            "pointer-events-none items-center justify-center rounded-none!",
                          )}
                        >
                          &#8230;
                        </ButtonGroupItem>
                      </Pagination.Ellipsis>
                    ),
                  )}

                  <Pagination.NextTrigger asChild>
                    <ButtonGroupItem iconTrailing={ArrowRight}>{isDesktop ? "Next" : undefined}</ButtonGroupItem>
                  </Pagination.NextTrigger>
                </ButtonGroup>
              )}
            </Pagination.Context>
          </Pagination.Root>
        ) : (
          <div className="flex items-center gap-3">
            <Button color="secondary" size={size} isDisabled>
              Previous
            </Button>
            <Button color="secondary" size={size} isDisabled>
              Next
            </Button>
          </div>
        )}
      </nav>
    </div>
  );
}
