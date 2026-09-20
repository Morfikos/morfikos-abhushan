"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { ArticleListItem } from "@aabhushan/contracts";
import { SearchLg } from "@untitledui/icons";
import { Heading } from "react-aria-components";

import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { Input } from "@/components/base/input/input";
import { useStaff } from "@/features/auth/staff-shell";
import { formatGrams, invoiceAccessToken, invoiceErrorMessage } from "@/features/invoices/invoice-shared";
import { fetchArticles } from "@/lib/staff-api";

const PAGE_SIZE = 20;
const MAX_SELECTION = 50;

export type PosBrowseArticlesDialogProps = {
  isOpen: boolean;
  isSaving: boolean;
  excludeArticleIds: Set<string>;
  onClose: () => void;
  onAdd: (articleIds: string[]) => void;
  onReceiveAndAdd: () => void;
};

export function PosBrowseArticlesDialog({
  isOpen,
  isSaving,
  excludeArticleIds,
  onClose,
  onAdd,
  onReceiveAndAdd,
}: PosBrowseArticlesDialogProps) {
  const staff = useStaff();
  const [search, setSearch] = useState("");
  const deferredQuery = useDeferredValue(search.trim());
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [capMessage, setCapMessage] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setSearch("");
    setSelected(new Set());
    setCapMessage(null);
  }, [isOpen]);

  const listQuery = useInfiniteQuery({
    queryKey: ["articles", "pos-browse", staff.membership.organization_id, deferredQuery],
    queryFn: async ({ pageParam }) =>
      fetchArticles(await invoiceAccessToken(), {
        page: pageParam,
        pageSize: PAGE_SIZE,
        status: "available",
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
    enabled: isOpen,
  });

  const { fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isFetching, isError, error, data } =
    listQuery;

  const canFetchNextRef = useRef({ hasNextPage: false, isFetchingNextPage: false });
  canFetchNextRef.current = {
    hasNextPage: Boolean(hasNextPage),
    isFetchingNextPage,
  };
  const fetchNextPageRef = useRef(fetchNextPage);
  fetchNextPageRef.current = fetchNextPage;

  const items = useMemo(() => {
    const seen = new Set<string>();
    const rows: ArticleListItem[] = [];
    for (const page of data?.pages ?? []) {
      for (const item of page.items) {
        if (seen.has(item.id)) {
          continue;
        }
        seen.add(item.id);
        rows.push(item);
      }
    }
    return rows;
  }, [data]);

  const visibleItems = useMemo(
    () => items.filter((item) => !excludeArticleIds.has(item.id)),
    [excludeArticleIds, items],
  );

  const showInitialLoading = isLoading && !data;
  const showTrueEmpty =
    !showInitialLoading && !isFetching && !isError && visibleItems.length === 0 && !hasNextPage;
  const showMoreAvailable =
    !showInitialLoading && !isError && visibleItems.length === 0 && Boolean(hasNextPage);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const root = scrollRef.current;
    const sentinel = sentinelRef.current;
    if (!root || !sentinel) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) {
          return;
        }
        const state = canFetchNextRef.current;
        if (!state.hasNextPage || state.isFetchingNextPage) {
          return;
        }
        void fetchNextPageRef.current();
      },
      { root, rootMargin: "40px", threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [isOpen, visibleItems.length, showMoreAvailable, data?.pages.length]);

  function toggleArticle(articleId: string, nextSelected: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (nextSelected) {
        if (next.size >= MAX_SELECTION) {
          setCapMessage(`You can add at most ${MAX_SELECTION} articles at once.`);
          return current;
        }
        next.add(articleId);
        setCapMessage(null);
      } else {
        next.delete(articleId);
        setCapMessage(null);
      }
      return next;
    });
  }

  function submitAdd() {
    if (selected.size === 0 || isSaving) {
      return;
    }
    onAdd([...selected]);
  }

  const selectedCount = selected.size;

  return (
    <ModalOverlay
      isOpen={isOpen}
      isDismissable={!isSaving}
      onOpenChange={(open) => {
        if (!open && !isSaving) {
          onClose();
        }
      }}
    >
      <Modal className="max-w-lg">
        <Dialog className="relative flex max-h-[min(90dvh,40rem)] w-full flex-col overflow-hidden rounded-2xl bg-primary p-6 shadow-xl outline-hidden">
          <Heading slot="title" className="text-lg font-semibold text-primary">
            Browse articles
          </Heading>
          <p className="mt-1 text-sm text-tertiary">
            Available stock only. Add selected pieces to this sale.
          </p>

          <div className="mt-4 shrink-0">
            <Input
              label="Search"
              placeholder="Article number, barcode, or description"
              icon={SearchLg}
              value={search}
              onChange={setSearch}
              isDisabled={isSaving}
            />
          </div>

          <div
            ref={scrollRef}
            className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-lg ring-1 ring-secondary"
          >
            {showInitialLoading ? (
              <div className="flex justify-center py-10">
                <LoadingIndicator label="Loading available stock" />
              </div>
            ) : null}

            {isError ? (
              <p className="px-4 py-6 text-sm text-error-primary" role="alert">
                {invoiceErrorMessage(error)}
              </p>
            ) : null}

            {showTrueEmpty ? (
              <p className="px-4 py-8 text-center text-sm text-tertiary">
                {deferredQuery
                  ? "No available stock match. Try another search or Receive & add."
                  : "No available articles to add. Receive & add a piece, or clear filters."}
              </p>
            ) : null}

            {showMoreAvailable ? (
              <div className="flex flex-col items-center gap-3 px-4 py-8">
                <p className="text-center text-sm text-tertiary">More available — Load more</p>
                <Button
                  color="secondary"
                  size="sm"
                  isDisabled={isFetchingNextPage}
                  isLoading={isFetchingNextPage}
                  onPress={() => void fetchNextPage()}
                >
                  Load more
                </Button>
              </div>
            ) : null}

            {visibleItems.length > 0 ? (
              <ul className="divide-y divide-secondary">
                {visibleItems.map((item) => {
                  const isChecked = selected.has(item.id);
                  const supporting = [
                    formatGrams(item.net_metal_weight_grams),
                    item.barcode ? item.barcode : null,
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <li key={item.id} className="px-3 py-2.5">
                      <Checkbox
                        size="sm"
                        isSelected={isChecked}
                        isDisabled={isSaving}
                        onChange={(checked) => toggleArticle(item.id, checked)}
                        label={
                          <span className="font-mono text-sm font-medium text-primary">
                            {item.article_number}
                            <span className="ml-1.5 font-sans font-normal capitalize text-secondary">
                              · {item.metal} {item.purity}
                            </span>
                          </span>
                        }
                        hint={supporting || undefined}
                      />
                    </li>
                  );
                })}
              </ul>
            ) : null}

            {visibleItems.length > 0 && hasNextPage ? (
              <div className="border-t border-secondary px-3 py-2">
                <Button
                  color="tertiary"
                  size="sm"
                  className="w-full"
                  isDisabled={isFetchingNextPage}
                  isLoading={isFetchingNextPage}
                  onPress={() => void fetchNextPage()}
                >
                  Load more
                </Button>
              </div>
            ) : null}

            {isFetchingNextPage && visibleItems.length > 0 ? (
              <p className="px-3 py-2 text-center text-xs text-tertiary">Loading more…</p>
            ) : null}

            <div ref={sentinelRef} className="h-1 w-full" aria-hidden="true" />
          </div>

          {capMessage ? (
            <p className="mt-2 text-xs text-warning-primary" role="status">
              {capMessage}
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <Button
              color="tertiary"
              size="md"
              isDisabled={isSaving}
              onPress={() => {
                onClose();
                onReceiveAndAdd();
              }}
            >
              Receive &amp; add
            </Button>
            <div className="flex flex-wrap gap-2">
              <Button color="secondary" size="md" isDisabled={isSaving} onPress={onClose}>
                Cancel
              </Button>
              <Button
                color="primary"
                size="md"
                isDisabled={selectedCount === 0 || isSaving}
                isLoading={isSaving}
                onPress={submitAdd}
              >
                {selectedCount === 0 ? "Add to sale" : `Add ${selectedCount} to sale`}
              </Button>
            </div>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
