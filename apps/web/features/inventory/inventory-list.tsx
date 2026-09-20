"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ArticleListItem, ArticleStatus } from "@aabhushan/contracts";
import { FilterLines, Package, Scan, SearchLg, Trash01 } from "@untitledui/icons";

import { EmptyState } from "@/components/application/empty-state/empty-state";
import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import { Table, TableCard } from "@/components/application/table/table";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ListTableFooter } from "@/components/shared/list-table-footer";
import { SelectField } from "@/components/shared/select-field";
import { staffHasPermission, useStaff } from "@/features/auth/staff-shell";
import {
  articleStatusColor,
  articleStatusLabel,
  formatGrams,
  inventoryAccessToken,
  inventoryErrorMessage,
} from "@/features/inventory/inventory-shared";
import {
  bulkDeleteArticlesRequest,
  deleteArticleRequest,
  fetchArticles,
  fetchCatalogueCategories,
  lookupArticle,
  StaffApiError,
} from "@/lib/staff-api";

type TableSelection = "all" | Set<string | number>;

type AppliedFilters = {
  q: string;
  status: "" | ArticleStatus;
  categoryId: string;
  purity: string;
  minWeight: string;
  maxWeight: string;
};

const emptyApplied: AppliedFilters = {
  q: "",
  status: "",
  categoryId: "",
  purity: "",
  minWeight: "",
  maxWeight: "",
};

function hasAppliedFilters(applied: AppliedFilters): boolean {
  return Boolean(applied.q || applied.status || applied.categoryId || applied.purity || applied.minWeight || applied.maxWeight);
}

function hasAdvancedApplied(applied: AppliedFilters): boolean {
  return Boolean(applied.purity || applied.minWeight || applied.maxWeight);
}

function deleteBlockedReason(item: ArticleListItem): string | null {
  if (item.deletable) {
    return null;
  }
  if (item.status === "sold") {
    return "Sold articles cannot be deleted.";
  }
  if (item.status === "return_inspection") {
    return "Articles under review cannot be deleted.";
  }
  if (item.status === "unavailable") {
    return "Unavailable articles cannot be deleted.";
  }
  return "This article has stock history and cannot be deleted.";
}

type PendingDelete =
  | { kind: "single"; item: ArticleListItem }
  | { kind: "bulk"; items: ArticleListItem[]; skipped: ArticleListItem[] };

export function InventoryList() {
  const staff = useStaff();
  const router = useRouter();
  const queryClient = useQueryClient();
  const allowed = staffHasPermission(staff, "inventory.read");
  const canWrite = staffHasPermission(staff, "inventory.write");
  const scanRef = useRef<HTMLInputElement>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");
  const [scan, setScan] = useState("");
  const [scanError, setScanError] = useState<string | null>(null);
  const [status, setStatus] = useState<"" | ArticleStatus>("");
  const [categoryId, setCategoryId] = useState("");
  const [purity, setPurity] = useState("");
  const [minWeight, setMinWeight] = useState("");
  const [maxWeight, setMaxWeight] = useState("");
  const [applied, setApplied] = useState<AppliedFilters>(emptyApplied);
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<TableSelection>(new Set());
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!allowed) {
      router.replace("/access-denied");
    }
  }, [allowed, router]);

  useEffect(() => {
    if (allowed) {
      scanRef.current?.focus();
    }
  }, [allowed]);

  useEffect(() => {
    if (hasAdvancedApplied(applied)) {
      setShowMoreFilters(true);
    }
  }, [applied]);

  const categories = useQuery({
    queryKey: ["inventory", "categories", staff.membership.organization_id],
    queryFn: async () => fetchCatalogueCategories(await inventoryAccessToken()),
    enabled: allowed,
  });

  const query = useQuery({
    queryKey: ["inventory", "articles", staff.membership.organization_id, page, pageSize, applied],
    queryFn: async () =>
      fetchArticles(await inventoryAccessToken(), {
        page,
        pageSize,
        ...(applied.q ? { q: applied.q } : {}),
        ...(applied.status ? { status: applied.status } : {}),
        ...(applied.categoryId ? { categoryId: applied.categoryId } : {}),
        ...(applied.purity ? { purity: applied.purity } : {}),
        ...(applied.minWeight ? { minGrossWeightGrams: applied.minWeight } : {}),
        ...(applied.maxWeight ? { maxGrossWeightGrams: applied.maxWeight } : {}),
      }),
    enabled: allowed,
    placeholderData: keepPreviousData,
  });

  const items = query.data?.items ?? [];
  const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  const deleteMutation = useMutation({
    mutationFn: async (pending: PendingDelete) => {
      const token = await inventoryAccessToken();
      if (pending.kind === "single") {
        await deleteArticleRequest(token, pending.item.id);
        return { deletedCount: 1, skippedMessages: [] as string[] };
      }
      const result = await bulkDeleteArticlesRequest(
        token,
        pending.items.map((item) => item.id),
      );
      const skippedMessages = [
        ...pending.skipped.map((item) => `${item.article_number}: ${deleteBlockedReason(item) ?? "Cannot be deleted."}`),
        ...result.skipped.map((item) => `${item.article_number}: ${item.message}`),
      ];
      return { deletedCount: result.deleted_ids.length, skippedMessages };
    },
    onSuccess: (result) => {
      setPendingDelete(null);
      setSelectedKeys(new Set());
      setActionError(result.skippedMessages.length > 0 ? result.skippedMessages.join(" ") : null);
      void queryClient.invalidateQueries({ queryKey: ["inventory", "articles"] });
    },
    onError: (error) => {
      setActionError(inventoryErrorMessage(error));
    },
  });

  if (!allowed) {
    return null;
  }

  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const filtersActive = hasAppliedFilters(applied);
  const catalogueEmpty = !query.isLoading && total === 0 && !filtersActive;
  const filteredEmpty = !query.isLoading && items.length === 0 && filtersActive;
  const showInitialLoading = query.isLoading && !query.data;
  const selectedIds =
    selectedKeys === "all" ? items.map((item) => item.id) : [...selectedKeys].map((key) => String(key));
  const selectedCount = selectedIds.length;

  function applyStatus(value: "" | ArticleStatus) {
    setStatus(value);
    setPage(1);
    setSelectedKeys(new Set());
    setApplied((current) => ({ ...current, status: value }));
  }

  function applyCategory(value: string) {
    setCategoryId(value);
    setPage(1);
    setSelectedKeys(new Set());
    setApplied((current) => ({ ...current, categoryId: value }));
  }

  function applySearch() {
    setPage(1);
    setSelectedKeys(new Set());
    setApplied((current) => ({ ...current, q: search.trim() }));
  }

  function applyAdvancedFilters() {
    setPage(1);
    setSelectedKeys(new Set());
    setApplied((current) => ({
      ...current,
      purity: purity.trim(),
      minWeight: minWeight.trim(),
      maxWeight: maxWeight.trim(),
    }));
  }

  function clearFilters() {
    setSearch("");
    setStatus("");
    setCategoryId("");
    setPurity("");
    setMinWeight("");
    setMaxWeight("");
    setPage(1);
    setSelectedKeys(new Set());
    setApplied(emptyApplied);
    setShowMoreFilters(false);
  }

  function onScanEnter(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    const barcode = scan.trim();
    if (!barcode) {
      return;
    }
    void lookupScannedArticle(barcode);
  }

  async function lookupScannedArticle(barcode: string) {
    setScanError(null);
    try {
      const article = await lookupArticle(await inventoryAccessToken(), barcode);
      router.push(`/inventory/${article.id}`);
    } catch (error) {
      if (error instanceof StaffApiError && error.status === 404) {
        setScanError("No article matches that barcode. Try a manual search.");
        return;
      }
      setScanError(inventoryErrorMessage(error));
    }
  }

  function onSearchEnter(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    applySearch();
  }

  function openBulkDelete() {
    const selected = selectedIds
      .map((id) => itemsById.get(id))
      .filter((item): item is ArticleListItem => Boolean(item));
    const deletable = selected.filter((item) => item.deletable);
    const skipped = selected.filter((item) => !item.deletable);
    if (deletable.length === 0) {
      setActionError(
        skipped.length > 0
          ? skipped.map((item) => `${item.article_number}: ${deleteBlockedReason(item)}`).join(" ")
          : "Select at least one deletable article.",
      );
      return;
    }
    setActionError(null);
    setPendingDelete({ kind: "bulk", items: deletable, skipped });
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-display-xs font-semibold text-primary">Inventory</h1>
          <p className="text-md text-tertiary">Saleable articles only. Girvi collateral never appears here.</p>
        </div>
        {canWrite ? (
          <div className="flex flex-wrap gap-2">
            {!catalogueEmpty ? (
              <Button color="secondary" size="md" href="/inventory/stock-counts/new">
                Record stock count
              </Button>
            ) : null}
            <Button color="primary" size="md" href="/inventory/receive">
              Receive article
            </Button>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 rounded-xl bg-primary p-4 shadow-xs ring-1 ring-secondary md:p-5">
        <div className={`grid gap-3 ${catalogueEmpty ? "md:grid-cols-2" : "md:grid-cols-2 xl:grid-cols-4"}`}>
          <Input
            label="Scan barcode"
            value={scan}
            placeholder="Barcode from the scanner"
            hint="Press Enter after a scan."
            tooltip="This field looks up an article. It does not finalize sales."
            icon={Scan}
            ref={scanRef}
            onChange={setScan}
            onKeyDown={onScanEnter}
          />
          <Input
            label="Search"
            value={search}
            placeholder="Article number, HUID, or source"
            icon={SearchLg}
            onChange={setSearch}
            onKeyDown={onSearchEnter}
          />
          {!catalogueEmpty ? (
            <>
              <SelectField
                label="Status"
                value={status}
                onChange={(value) => applyStatus(value as "" | ArticleStatus)}
                options={[
                  { label: "All statuses", value: "" },
                  { label: "Available", value: "available" },
                  { label: "Sold", value: "sold" },
                  { label: "Under review", value: "return_inspection" },
                  { label: "Unavailable", value: "unavailable" },
                ]}
              />
              <SelectField
                label="Category"
                value={categoryId}
                onChange={applyCategory}
                isDisabled={categories.isLoading}
                options={[
                  { label: "All categories", value: "" },
                  ...(categories.data?.items ?? []).map((item) => ({ label: item.name, value: item.id })),
                ]}
              />
            </>
          ) : null}
        </div>

        {!catalogueEmpty ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              color="secondary"
              size="sm"
              iconLeading={FilterLines}
              onPress={() => setShowMoreFilters((current) => !current)}
            >
              {showMoreFilters ? "Hide filters" : "More filters"}
            </Button>
            {filtersActive ? (
              <Button color="tertiary" size="sm" onPress={clearFilters}>
                Clear filters
              </Button>
            ) : null}
          </div>
        ) : null}

        {showMoreFilters && !catalogueEmpty ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Input label="Purity" value={purity} onChange={setPurity} />
            <Input label="Min gross weight (g)" value={minWeight} onChange={setMinWeight} />
            <Input label="Max gross weight (g)" value={maxWeight} onChange={setMaxWeight} />
            <div className="flex items-end">
              <Button color="secondary" size="md" onPress={applyAdvancedFilters}>
                Apply filters
              </Button>
            </div>
          </div>
        ) : null}

        {scanError ? <p className="text-sm text-error-primary">{scanError}</p> : null}
      </div>

      {showInitialLoading ? <LoadingIndicator size="md" label="Loading articles" /> : null}
      {query.isError ? <p className="text-sm text-error-primary">{inventoryErrorMessage(query.error)}</p> : null}
      {actionError ? <p className="text-sm text-error-primary">{actionError}</p> : null}

      {catalogueEmpty ? (
        <EmptyState size="md" className="mx-auto py-10">
          <EmptyState.Header pattern="none">
            <div className="mb-3 flex size-12 items-center justify-center rounded-lg bg-secondary ring-1 ring-secondary ring-inset">
              <Package className="size-6 text-fg-quaternary" aria-hidden="true" />
            </div>
            <EmptyState.Content>
              <p className="text-lg font-semibold text-primary">No articles yet</p>
              <EmptyState.Description>
                Receive jewellery to create a unique shop record. Manual lookup works without a scanner.
              </EmptyState.Description>
            </EmptyState.Content>
          </EmptyState.Header>
          {canWrite ? (
            <EmptyState.Footer>
              <Button color="primary" size="md" href="/inventory/receive">
                Receive article
              </Button>
            </EmptyState.Footer>
          ) : null}
        </EmptyState>
      ) : null}

      {filteredEmpty ? (
        <EmptyState size="md" className="mx-auto py-10">
          <EmptyState.Header pattern="none">
            <EmptyState.Content>
              <p className="text-lg font-semibold text-primary">No articles match these filters</p>
              <EmptyState.Description>Try clearing filters or adjusting purity and weight ranges.</EmptyState.Description>
            </EmptyState.Content>
          </EmptyState.Header>
          <EmptyState.Footer>
            <Button color="secondary" size="md" onPress={clearFilters}>
              Clear filters
            </Button>
          </EmptyState.Footer>
        </EmptyState>
      ) : null}

      {items.length > 0 ? (
        <TableCard.Root>
          <TableCard.Header
            title="Articles"
            badge={String(total)}
            contentTrailing={
              canWrite && selectedCount > 0 ? (
                <Button color="secondary-destructive" size="sm" iconLeading={Trash01} onPress={openBulkDelete}>
                  Delete selected ({selectedCount})
                </Button>
              ) : null
            }
          />
          <Table
            aria-label="Articles"
            selectionMode={canWrite ? "multiple" : "none"}
            selectedKeys={selectedKeys}
            onSelectionChange={setSelectedKeys}
          >
            <Table.Header>
              <Table.Head id="number" isRowHeader label="Article" />
              <Table.Head id="category" label="Category" />
              <Table.Head id="metal" label="Metal" />
              <Table.Head id="purity" label="Purity" />
              <Table.Head id="gross" label="Gross" className="text-right" />
              <Table.Head id="net" label="Net metal" className="text-right" />
              <Table.Head id="status" label="Status" />
              <Table.Head id="location" label="Location" />
              {canWrite ? <Table.Head id="actions" label="Actions" className="w-16" /> : null}
            </Table.Header>
            <Table.Body items={items}>
              {(item: ArticleListItem) => {
                const blocked = deleteBlockedReason(item);
                return (
                  <Table.Row id={item.id} href={`/inventory/${item.id}`} className="cursor-pointer">
                    <Table.Cell>
                      <span className="font-mono text-sm font-medium text-primary">{item.article_number}</span>
                    </Table.Cell>
                    <Table.Cell>{item.category_name}</Table.Cell>
                    <Table.Cell className="capitalize">{item.metal}</Table.Cell>
                    <Table.Cell>{item.purity}</Table.Cell>
                    <Table.Cell className="text-right font-medium tabular-nums">{formatGrams(item.gross_weight_grams)}</Table.Cell>
                    <Table.Cell className="text-right font-medium tabular-nums">{formatGrams(item.net_metal_weight_grams)}</Table.Cell>
                    <Table.Cell>
                      <Badge color={articleStatusColor(item.status)} size="sm">
                        {articleStatusLabel(item.status)}
                      </Badge>
                    </Table.Cell>
                    <Table.Cell>{item.location_name ?? "—"}</Table.Cell>
                    {canWrite ? (
                      <Table.Cell>
                        <Button
                          aria-label={
                            blocked
                              ? `Cannot delete ${item.article_number}. ${blocked}`
                              : `Delete ${item.article_number}`
                          }
                          color="tertiary-destructive"
                          size="sm"
                          iconLeading={Trash01}
                          isDisabled={!item.deletable || deleteMutation.isPending}
                          onPress={() => {
                            setActionError(null);
                            setPendingDelete({ kind: "single", item });
                          }}
                        />
                      </Table.Cell>
                    ) : null}
                  </Table.Row>
                );
              }}
            </Table.Body>
          </Table>
          <ListTableFooter
            page={page}
            totalPages={totalPages}
            pageSize={pageSize}
            onPageChange={(next) => {
              setPage(next);
              setSelectedKeys(new Set());
            }}
            onPageSizeChange={(next) => {
              setPageSize(next);
              setPage(1);
              setSelectedKeys(new Set());
            }}
          />
        </TableCard.Root>
      ) : null}

      <ConfirmDialog
        isOpen={pendingDelete !== null}
        title={pendingDelete?.kind === "bulk" ? "Delete articles" : "Delete article"}
        message={
          pendingDelete?.kind === "single" ? (
            <p>
              Delete article <span className="font-mono font-medium text-primary">{pendingDelete.item.article_number}</span>
              ? This cannot be undone. Only a mistaken receipt with no later stock history can be removed.
            </p>
          ) : pendingDelete?.kind === "bulk" ? (
            <div className="flex flex-col gap-2">
              <p>
                Delete {pendingDelete.items.length} article{pendingDelete.items.length === 1 ? "" : "s"} (
                {pendingDelete.items.map((item) => item.article_number).join(", ")})? This cannot be undone.
              </p>
              {pendingDelete.skipped.length > 0 ? (
                <p>
                  Skipped:{" "}
                  {pendingDelete.skipped
                    .map((item) => `${item.article_number} (${deleteBlockedReason(item) ?? "not deletable"})`)
                    .join("; ")}
                  .
                </p>
              ) : null}
            </div>
          ) : null
        }
        isConfirming={deleteMutation.isPending}
        onCancel={() => {
          if (!deleteMutation.isPending) {
            setPendingDelete(null);
          }
        }}
        onConfirm={() => {
          if (pendingDelete) {
            deleteMutation.mutate(pendingDelete);
          }
        }}
      />
    </section>
  );
}
