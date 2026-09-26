"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export type ListFilterChip = {
  id: string;
  label: string;
};

export type ListFilterCodec<T> = {
  /** Query keys this codec owns (used to drop stale params on replace). */
  ownedKeys: readonly string[];
  /** Parse URL params into filter state (invalid values become defaults). */
  parse: (params: URLSearchParams) => T;
  /**
   * Serialize filter state to query entries. Omit empty/default keys
   * (return undefined/null/"" to drop the key).
   */
  serialize: (value: T) => Record<string, string | undefined | null>;
  /** Labelled chips for non-default active filters. */
  chips: (value: T) => ListFilterChip[];
  /** Reset target for Clear. */
  defaults: T;
};

function paramsEqual(a: URLSearchParams, b: URLSearchParams): boolean {
  if (a.toString() === b.toString()) {
    return true;
  }
  const keys = new Set([...a.keys(), ...b.keys()]);
  for (const key of keys) {
    if (a.get(key) !== b.get(key)) {
      return false;
    }
  }
  return true;
}

function buildSearchParams(entries: Record<string, string | undefined | null>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(entries)) {
    if (value) {
      params.set(key, value);
    }
  }
  return params;
}

/**
 * Two-way list filters ↔ URLSearchParams, same pattern as Settings `?tab=`:
 * `router.replace`, omit defaults, preserve unrelated query keys when possible.
 */
export function useSyncedListFilters<T>(pathname: string, codec: ListFilterCodec<T>) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const codecRef = useRef(codec);
  codecRef.current = codec;

  const [filters, setFiltersState] = useState<T>(() => codec.parse(new URLSearchParams(searchParams.toString())));
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const writeUrl = useCallback(
    (value: T) => {
      const next = buildSearchParams(codecRef.current.serialize(value));
      const current = new URLSearchParams(searchParams.toString());
      // Drop keys this codec owns, keep others (e.g. payments customer/invoice dialog prefills).
      for (const key of codecRef.current.ownedKeys) {
        current.delete(key);
      }
      for (const [key, entry] of next.entries()) {
        current.set(key, entry);
      }
      const query = current.toString();
      const href = query ? `${pathname}?${query}` : pathname;
      const existing = searchParams.toString();
      if (query !== existing) {
        router.replace(href, { scroll: false });
      }
    },
    [pathname, router, searchParams],
  );

  // URL → state (dashboard drill, browser back).
  useEffect(() => {
    const parsed = codecRef.current.parse(new URLSearchParams(searchParams.toString()));
    const expected = buildSearchParams(codecRef.current.serialize(parsed));
    const owned = buildSearchParams(codecRef.current.serialize(filters));
    if (!paramsEqual(expected, owned)) {
      filtersRef.current = parsed;
      setFiltersState(parsed);
    }
    // Only react to URL changes; local setFilters already updated state.
  }, [searchParams]);

  const setFilters = useCallback(
    (update: T | ((prev: T) => T)) => {
      // Compute next outside the updater so router.replace is not a render-phase side effect.
      const prev = filtersRef.current;
      const next = typeof update === "function" ? (update as (prev: T) => T)(prev) : update;
      filtersRef.current = next;
      setFiltersState(next);
      writeUrl(next);
    },
    [writeUrl],
  );

  const clearFilters = useCallback(() => {
    setFilters(codecRef.current.defaults);
  }, [setFilters]);

  const chips = useMemo(() => codec.chips(filters), [codec, filters]);
  const hasActiveFilters = chips.length > 0;

  return {
    filters,
    setFilters,
    clearFilters,
    chips,
    hasActiveFilters,
  };
}

/**
 * Local search text with a 300ms debounce into the applied `q` filter.
 * Resets the field when URL/`appliedQ` changes (browser back, chip remove, Clear).
 */
export function useDebouncedListQuery({
  appliedQ,
  onCommit,
  delayMs = 300,
}: {
  appliedQ: string;
  /** Called with the trimmed query when debounce fires and the value differs from `appliedQ`. */
  onCommit: (next: string) => void;
  delayMs?: number;
}) {
  const [search, setSearch] = useState(appliedQ);
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  useEffect(() => {
    setSearch(appliedQ);
  }, [appliedQ]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const next = search.trim();
      if (next === appliedQ) {
        return;
      }
      onCommitRef.current(next);
    }, delayMs);
    return () => window.clearTimeout(handle);
  }, [search, appliedQ, delayMs]);

  return { search, setSearch };
}

/** Page + page-size state; changing page size always resets to page 1. */
export function useListPagination(initialPageSize = 10) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(initialPageSize);

  const setPageSize = useCallback((next: number) => {
    setPageSizeState(next);
    setPage(1);
  }, []);

  return { page, setPage, pageSize, setPageSize };
}
