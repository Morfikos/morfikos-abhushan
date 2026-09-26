"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { Customer, CustomerListItem } from "@aabhushan/contracts";
import { XClose } from "@untitledui/icons";

import { Badge } from "@/components/base/badges/badges";
import { ComboBox } from "@/components/base/select/combobox";
import { SelectItem } from "@/components/base/select/select-item";
import { useStaff } from "@/features/auth/staff-shell";
import { customerAccessToken } from "@/features/customers/customer-shared";
import { fetchCustomers } from "@/lib/staff-api";
import { cx } from "@/utils/cx";

const LOAD_MORE_KEY = "__load-more__";
const EMPTY_KEY = "__empty__";
const PAGE_SIZE = 20;

type ComboItem = {
  id: string;
  label: string;
  supportingText?: string;
  isDisabled?: boolean;
  avatarUrl?: undefined;
};

/** Avoid supportingText === label; ComboBoxValue splits input on supportingText and shows "a" when both are "Walk-in". */
function supportingTextFor(label: string, candidate: string | null | undefined): string | undefined {
  const trimmed = candidate?.trim();
  if (!trimmed || trimmed === label) {
    return undefined;
  }
  return trimmed;
}

export function CustomerCombobox({
  label = "Customer",
  selected,
  onSelect,
  onClear,
  isDisabled = false,
  autoFocus = false,
  excludeWalkIn = false,
  warnIfWalkInMissing = false,
  size = "md",
}: {
  label?: string;
  selected: CustomerListItem | Customer | null;
  onSelect: (customer: CustomerListItem | Customer) => void;
  onClear?: () => void;
  isDisabled?: boolean;
  autoFocus?: boolean;
  /** When true, omit the Walk-in pin and filter walk-in rows out of search results. */
  excludeWalkIn?: boolean;
  /** POS: explain when the pinned walk-in customer is not seeded. */
  warnIfWalkInMissing?: boolean;
  size?: "sm" | "md" | "lg";
}) {
  const staff = useStaff();
  const [inputValue, setInputValue] = useState(selected?.display_name ?? "");
  const didAutoOpen = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const deferredQuery = useDeferredValue(inputValue.trim());

  useEffect(() => {
    setInputValue(selected?.display_name ?? "");
  }, [selected?.id, selected?.display_name]);

  const walkInQuery = useQuery({
    queryKey: ["customers", "walk-in", staff.membership.organization_id],
    queryFn: async () =>
      fetchCustomers(await customerAccessToken(), {
        page: 1,
        pageSize: 1,
        isWalkIn: true,
        isActive: true,
      }),
    enabled: !isDisabled && !excludeWalkIn,
  });

  const search = useInfiniteQuery({
    queryKey: ["customers", "pos-search", staff.membership.organization_id, deferredQuery, excludeWalkIn],
    queryFn: async ({ pageParam }) =>
      fetchCustomers(await customerAccessToken(), {
        page: pageParam,
        pageSize: PAGE_SIZE,
        sort: "name",
        direction: "asc",
        isActive: true,
        ...(deferredQuery ? { q: deferredQuery } : {}),
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce((sum, page) => sum + page.items.length, 0);
      if (loaded < lastPage.total) {
        return pages.length + 1;
      }
      return undefined;
    },
    enabled: !isDisabled,
  });

  const customersById = useMemo(() => {
    const map = new Map<string, CustomerListItem>();
    for (const page of search.data?.pages ?? []) {
      for (const item of page.items) {
        if (excludeWalkIn && item.is_walk_in) {
          continue;
        }
        map.set(item.id, item);
      }
    }
    const walkIn = excludeWalkIn ? undefined : walkInQuery.data?.items[0];
    if (walkIn) {
      map.set(walkIn.id, walkIn);
    }
    if (selected && !(excludeWalkIn && selected.is_walk_in)) {
      map.set(selected.id, selected);
    }
    return map;
  }, [excludeWalkIn, search.data, selected, walkInQuery.data]);

  const items = useMemo<ComboItem[]>(() => {
    const seen = new Set<string>();
    const rows: ComboItem[] = [];
    const walkIn = excludeWalkIn ? undefined : walkInQuery.data?.items[0];
    const q = deferredQuery.toLowerCase();
    const walkInMatches =
      walkIn &&
      (!q ||
        walkIn.display_name.toLowerCase().includes(q) ||
        (walkIn.phone_display ?? "").toLowerCase().includes(q) ||
        "walk-in".includes(q) ||
        "walk in".includes(q));

    if (walkIn && walkInMatches) {
      seen.add(walkIn.id);
      rows.push({
        id: walkIn.id,
        label: walkIn.display_name,
        supportingText: supportingTextFor(walkIn.display_name, walkIn.phone_display),
      });
    }

    for (const page of search.data?.pages ?? []) {
      for (const item of page.items) {
        if (seen.has(item.id) || (excludeWalkIn && item.is_walk_in)) {
          continue;
        }
        seen.add(item.id);
        const candidate = item.phone_display ?? (item.is_walk_in ? undefined : "No phone");
        rows.push({
          id: item.id,
          label: item.display_name,
          supportingText: supportingTextFor(item.display_name, candidate),
        });
      }
    }

    if (deferredQuery && rows.length === 0 && !search.isFetching) {
      rows.push({
        id: EMPTY_KEY,
        label: "No customers match",
        supportingText: supportingTextFor("No customers match", "Try another name or phone, or New customer"),
        isDisabled: true,
      });
    }

    if (search.hasNextPage) {
      rows.push({
        id: LOAD_MORE_KEY,
        label: search.isFetchingNextPage ? "Loading more…" : "Load more",
        supportingText: supportingTextFor(
          search.isFetchingNextPage ? "Loading more…" : "Load more",
          "Show more customers",
        ),
        isDisabled: search.isFetchingNextPage,
      });
    }

    return rows;
  }, [
    deferredQuery,
    excludeWalkIn,
    search.data,
    search.hasNextPage,
    search.isFetching,
    search.isFetchingNextPage,
    walkInQuery.data,
  ]);

  // Record payment autofocuses before the first customer page returns. React Aria
  // opens then immediately closes an empty menu (items prop set but collection empty).
  // Re-focus once rows exist so menuTrigger="focus" opens a populated list.
  // ComboBox does not support controlled isOpen (react-stately clears it).
  useEffect(() => {
    if (!autoFocus) {
      didAutoOpen.current = false;
      return;
    }
    if (didAutoOpen.current || isDisabled) {
      return;
    }
    const hasCustomerRow = items.some((item) => item.id !== EMPTY_KEY && item.id !== LOAD_MORE_KEY);
    if (!hasCustomerRow) {
      return;
    }
    didAutoOpen.current = true;
    const input = rootRef.current?.querySelector("input");
    if (!input) {
      return;
    }
    input.blur();
    requestAnimationFrame(() => {
      input.focus();
    });
  }, [autoFocus, isDisabled, items]);

  return (
    <div ref={rootRef} className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-secondary">{label}</span>
        {selected?.is_walk_in ? (
          <Badge color="blue" size="sm">
            Walk-in
          </Badge>
        ) : null}
      </div>
      <div className={cx("relative", selected && onClear && !isDisabled && "[&_input]:pr-9")}>
        <ComboBox
          aria-label={label}
          size={size}
          placeholder="Search by name or phone"
          shortcut={false}
          selectedKey={selected?.id ?? null}
          inputValue={inputValue}
          onInputChange={setInputValue}
          isDisabled={isDisabled}
          autoFocus={autoFocus}
          items={items}
          menuTrigger="focus"
          onSelectionChange={(key) => {
            const id = key == null ? "" : String(key);
            if (!id || id === EMPTY_KEY) {
              return;
            }
            if (id === LOAD_MORE_KEY) {
              if (search.hasNextPage && !search.isFetchingNextPage) {
                void search.fetchNextPage();
              }
              return;
            }
            const customer = customersById.get(id);
            if (customer) {
              onSelect(customer);
              setInputValue(customer.display_name);
            }
          }}
        >
          {(item) => (
            <SelectItem
              id={item.id}
              label={item.label}
              supportingText={item.supportingText}
              isDisabled={item.isDisabled}
            />
          )}
        </ComboBox>
        {selected && onClear && !isDisabled ? (
          <button
            type="button"
            aria-label="Clear customer"
            className={cx(
              "absolute top-0 right-1.5 z-20 flex items-center justify-center rounded-md p-1.5 text-fg-quaternary outline-focus-ring hover:text-fg-quaternary_hover focus-visible:outline-2 focus-visible:outline-offset-2",
              size === "lg" ? "h-11" : "h-10",
            )}
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setInputValue("");
              onClear();
            }}
          >
            <XClose className="size-4" aria-hidden />
          </button>
        ) : null}
      </div>
      {selected && !selected.is_walk_in && selected.phone_display ? (
        <p className="text-sm text-tertiary">{selected.phone_display}</p>
      ) : null}
      {warnIfWalkInMissing && walkInQuery.isSuccess && (walkInQuery.data?.items.length ?? 0) === 0 ? (
        <p className="text-sm text-error-primary" role="status">
          Walk-in customer is not set up. Run seed:sample-customers or ask an admin.
        </p>
      ) : null}
    </div>
  );
}
