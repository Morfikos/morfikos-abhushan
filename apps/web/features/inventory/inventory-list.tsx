"use client";

import { Suspense, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ArticleListItem, ArticleStatus, Metal } from "@aabhushan/contracts";
import { ChevronRight, FilterLines, Package, SearchLg, Trash01 } from "@untitledui/icons";

import { InventoryFilterStripSkeleton } from "@/components/application/skeleton/skeleton";
import { Table, TableCard } from "@/components/application/table/table";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { ActiveFiltersBar } from "@/components/shared/active-filters-bar";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  DirectoryEmptyState,
  DirectoryTableSkeleton,
  FilteredEmptyState,
} from "@/components/shared/directory-states";
import { ListTableFooter } from "@/components/shared/list-table-footer";
import { type ListFilterCodec, useSyncedListFilters } from "@/lib/list-search-params";
import { ScanField } from "@/components/shared/scan-field";
import { SelectField } from "@/components/shared/select-field";
import { StaffPageHeader } from "@/components/shared/staff-page-header";
import { staffHasPermission, useStaff } from "@/features/auth/staff-shell";
import {
  articleStatusColor,
  articleStatusLabel,
  formatGrams,
  inventoryAccessToken,
  inventoryErrorMessage,
  scanLookupErrorMessage,
  tagPrintHref,
} from "@/features/inventory/inventory-shared";
import {
  bulkDeleteArticlesRequest,
  deleteArticleRequest,
  fetchArticles,
  fetchCatalogueCategories,
  fetchDevices,
  lookupArticle,
} from "@/lib/staff-api";
import { cx } from "@/utils/cx";

/** Live order: scan + search, then status / metal / category / more. */
export function InventoryFilterSkeleton() {
  return <InventoryFilterStripSkeleton />;
}

/** Body-only loader: Suspense fallback and showInitialLoading (header stays live). */
export function InventoryListBodyLoading() {
  return (
    <DirectoryTableSkeleton
      title="Articles"
      columns={9}
      showSelectionColumn
      label="Loading articles"
      filterSkeleton={<InventoryFilterSkeleton />}
    />
  );
}

/** @deprecated Prefer InventoryListBodyLoading — alias kept for call-site clarity. */
export function InventoryDirectoryLoading() {
  return <InventoryListBodyLoading />;
}

type TableSelection = "all" | Set<string | number>;

type AppliedFilters = {
  q: string;
  status: "" | ArticleStatus;
  categoryId: string;
  metal: "" | Metal;
  purity: string;
  minWeight: string;
  maxWeight: string;
};

const emptyApplied: AppliedFilters = {
  q: "",
  status: "",
  categoryId: "",
  metal: "",
  purity: "",
  minWeight: "",
  maxWeight: "",
};

function hasAppliedFilters(applied: AppliedFilters): boolean {
  return Boolean(
    applied.q ||
      applied.status ||
      applied.categoryId ||
      applied.metal ||
      applied.purity ||
      applied.minWeight ||
      applied.maxWeight,
  );
}

function hasAdvancedApplied(applied: AppliedFilters): boolean {
  return Boolean(applied.purity || applied.minWeight || applied.maxWeight);
}

function articleStatusFromParam(value: string | null): "" | ArticleStatus {
  if (value === "available" || value === "sold" || value === "return_inspection" || value === "unavailable") {
    return value;
  }
  return "";
}

type InventoryUrlFilters = {
  status: "" | ArticleStatus;
};

const inventoryUrlDefaults: InventoryUrlFilters = {
  status: "",
};

const inventoryUrlCodec: ListFilterCodec<InventoryUrlFilters> = {
  ownedKeys: ["status"],
  defaults: inventoryUrlDefaults,
  parse(params) {
    return { status: articleStatusFromParam(params.get("status")) };
  },
  serialize(value) {
    return { status: value.status || undefined };
  },
  chips(value) {
    if (!value.status) {
      return [];
    }
    return [{ id: "status", label: `Status: ${articleStatusLabel(value.status)}` }];
  },
};

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
  const allowed = staffHasPermission(staff, "inventory.read");
  const canWrite = staffHasPermission(staff, "inventory.write");
  // Optimistic true matches prior showInitialLoading header (catalogueEmpty is false while loading).
  const [showStockCountAction, setShowStockCountAction] = useState(true);

  useEffect(() => {
    if (!allowed) {
      router.replace("/access-denied");
    }
  }, [allowed, router]);

  if (!allowed) {
    return null;
  }

  return (
    <section className="flex flex-col gap-6">
      <StaffPageHeader
        title="Inventory"
        description="Saleable articles only. Girvi collateral never appears here."
        icon={Package}
        actions={
          canWrite ? (
            <>
              {showStockCountAction ? (
                <Button color="secondary" size="md" href="/inventory/stock-counts/new">
                  Record stock count
                </Button>
              ) : null}
              <Button color="primary" size="md" href="/inventory/receive">
                Receive article
              </Button>
            </>
          ) : null
        }
      />
      <Suspense fallback={<InventoryListBodyLoading />}>
        <InventoryListBody canWrite={canWrite} onShowStockCountAction={setShowStockCountAction} />
      </Suspense>
    </section>
  );
}

function InventoryListBody({
  canWrite,
  onShowStockCountAction,
}: {
  canWrite: boolean;
  onShowStockCountAction: (show: boolean) => void;
}) {
  const staff = useStaff();
  const router = useRouter();
  const queryClient = useQueryClient();
  const scanRef = useRef<HTMLInputElement>(null);
  const { filters: urlFilters, setFilters: setUrlFilters, clearFilters: clearUrlFilters, chips } =
    useSyncedListFilters("/inventory", inventoryUrlCodec);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");
  const [scan, setScan] = useState("");
  const [scanError, setScanError] = useState<string | null>(null);
  const [scannedThisSession, setScannedThisSession] = useState<Set<string>>(() => new Set());
  const [status, setStatus] = useState<"" | ArticleStatus>(urlFilters.status);
  const [categoryId, setCategoryId] = useState("");
  const [metal, setMetal] = useState<"" | Metal>("");
  const [purity, setPurity] = useState("");
  const [minWeight, setMinWeight] = useState("");
  const [maxWeight, setMaxWeight] = useState("");
  const [applied, setApplied] = useState<AppliedFilters>({ ...emptyApplied, status: urlFilters.status });
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<TableSelection>(new Set());
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showBatchReprint, setShowBatchReprint] = useState(false);
  const [batchReprintReason, setBatchReprintReason] = useState("");
  const [pendingReprintIds, setPendingReprintIds] = useState<string[]>([]);

  useEffect(() => {
    scanRef.current?.focus();
  }, []);

  useEffect(() => {
    if (hasAdvancedApplied(applied)) {
      setShowMoreFilters(true);
    }
  }, [applied]);

  useEffect(() => {
    setStatus(urlFilters.status);
    setApplied((current) => ({ ...current, status: urlFilters.status }));
  }, [urlFilters.status]);

  const categories = useQuery({
    queryKey: ["inventory", "categories", staff.membership.organization_id],
    queryFn: async () => fetchCatalogueCategories(await inventoryAccessToken()),
  });

  const devices = useQuery({
    queryKey: ["shop", "devices", staff.membership.organization_id],
    queryFn: async () => fetchDevices(await inventoryAccessToken()),
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
        ...(applied.metal ? { metal: applied.metal } : {}),
        ...(applied.purity ? { purity: applied.purity } : {}),
        ...(applied.minWeight ? { minGrossWeightGrams: applied.minWeight } : {}),
        ...(applied.maxWeight ? { maxGrossWeightGrams: applied.maxWeight } : {}),
      }),
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

  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const filtersActive = hasAppliedFilters(applied);
  const catalogueEmpty = !query.isLoading && total === 0 && !filtersActive;
  const filteredEmpty = !query.isLoading && items.length === 0 && filtersActive;
  const showInitialLoading = query.isLoading && !query.data;
  const showArticlesCard = !catalogueEmpty && !showInitialLoading;

  useEffect(() => {
    onShowStockCountAction(!catalogueEmpty);
  }, [catalogueEmpty, onShowStockCountAction]);

  const selectedIds =
    selectedKeys === "all" ? items.map((item) => item.id) : [...selectedKeys].map((key) => String(key));
  const selectedCount = selectedIds.length;
  const selectedArticles = selectedIds
    .map((id) => itemsById.get(id))
    .filter((item): item is ArticleListItem => Boolean(item));
  const selectedUntaggedCount = selectedArticles.filter((item) => !item.barcode).length;
  const selectedTaggedCount = selectedArticles.filter((item) => Boolean(item.barcode)).length;
  const selectionPrintMode =
    selectedCount === 0
      ? "none"
      : selectedUntaggedCount === selectedCount
        ? "print"
        : selectedTaggedCount === selectedCount
          ? "reprint"
          : "mixed";

  function applyStatus(value: "" | ArticleStatus) {
    setStatus(value);
    setPage(1);
    setSelectedKeys(new Set());
    setApplied((current) => ({ ...current, status: value }));
    setUrlFilters({ status: value });
  }

  function applyCategory(value: string) {
    setCategoryId(value);
    setPage(1);
    setSelectedKeys(new Set());
    setApplied((current) => ({ ...current, categoryId: value }));
  }

  function applyMetal(value: "" | Metal) {
    setMetal(value);
    setPage(1);
    setSelectedKeys(new Set());
    setApplied((current) => ({ ...current, metal: value }));
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
    setMetal("");
    setPurity("");
    setMinWeight("");
    setMaxWeight("");
    setPage(1);
    setSelectedKeys(new Set());
    setApplied(emptyApplied);
    setShowMoreFilters(false);
    clearUrlFilters();
  }

  function lookupScannedArticle(barcode: string) {
    setScanError(null);
    void (async () => {
      try {
        const article = await lookupArticle(await inventoryAccessToken(), barcode);
        setScannedThisSession((current) => new Set(current).add(barcode));
        setScan("");
        router.push(`/inventory/${article.id}`);
      } catch (error) {
        setScanError(scanLookupErrorMessage(error));
      }
    })();
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

  function openBatchPrint() {
    if (selectedIds.length === 0) {
      setActionError("Select at least one article to print tags.");
      return;
    }
    if (selectionPrintMode === "mixed") {
      setActionError("Select only untagged articles to print, or only tagged articles to reprint.");
      return;
    }
    if (selectionPrintMode === "reprint") {
      setActionError(null);
      setPendingReprintIds(selectedIds);
      setBatchReprintReason("");
      setShowBatchReprint(true);
      return;
    }
    setActionError(null);
    router.push(
      tagPrintHref({
        ids: selectedIds,
        kind: selectedIds.length === 1 ? "initial" : "batch",
      }),
    );
  }

  const filterToolbar = (
    <InventoryFilterToolbar
      catalogueEmpty={catalogueEmpty}
      scan={scan}
      search={search}
      status={status}
      categoryId={categoryId}
      metal={metal}
      purity={purity}
      minWeight={minWeight}
      maxWeight={maxWeight}
      showMoreFilters={showMoreFilters}
      filtersActive={filtersActive}
      scanError={scanError}
      scanRef={scanRef}
      terminator={devices.data?.scan_terminator ?? "Enter"}
      expectedSuffix={devices.data?.expected_suffix ?? ""}
      alreadyScanned={scannedThisSession}
      categoriesLoading={categories.isLoading}
      categoryOptions={[
        { label: "All categories", value: "" },
        ...(categories.data?.items ?? []).map((item) => ({ label: item.name, value: item.id })),
      ]}
      onScanChange={setScan}
      onScan={lookupScannedArticle}
      onDuplicate={(payload) => {
        setScanError(`Already scanned in this session: ${payload}`);
        setScan("");
      }}
      onUnexpectedSuffix={(raw) => {
        setScanError(`Scanner suffix was unexpected. Raw scan: ${raw}`);
      }}
      onSearchChange={setSearch}
      onSearchEnter={onSearchEnter}
      onStatusChange={applyStatus}
      onCategoryChange={applyCategory}
      onMetalChange={applyMetal}
      onPurityChange={setPurity}
      onMinWeightChange={setMinWeight}
      onMaxWeightChange={setMaxWeight}
      onToggleMoreFilters={() => setShowMoreFilters((current) => !current)}
      onClearFilters={clearFilters}
      onApplyAdvanced={applyAdvancedFilters}
    />
  );

  return (
    <>
      {catalogueEmpty ? (
        <div className="flex flex-col gap-3 rounded-xl bg-primary p-4 shadow-xs ring-1 ring-secondary md:p-5">
          {filterToolbar}
          <ActiveFiltersBar chips={chips} onClear={clearFilters} />
        </div>
      ) : null}

      {showInitialLoading ? <InventoryListBodyLoading /> : null}
      {query.isError ? <p className="text-sm text-error-primary">{inventoryErrorMessage(query.error)}</p> : null}
      {actionError ? <p className="text-sm text-error-primary">{actionError}</p> : null}

      {catalogueEmpty ? (
        <DirectoryEmptyState
          icon={Package}
          title="No articles yet"
          description="Receive jewellery to create a unique shop record. Manual lookup works without a scanner."
          action={
            canWrite ? (
              <Button color="primary" size="md" href="/inventory/receive">
                Receive article
              </Button>
            ) : null
          }
        />
      ) : null}

      {showArticlesCard ? (
        <TableCard.Root>
          <TableCard.Header
            title="Articles"
            badge={String(total)}
            contentTrailing={
              canWrite && selectedCount > 0 ? (
                <div className="flex flex-wrap gap-2">
                  <Button color="secondary" size="sm" onPress={openBatchPrint}>
                    {selectionPrintMode === "reprint"
                      ? `Reprint tags (${selectedCount})`
                      : `Print tags (${selectedCount})`}
                  </Button>
                  <Button color="secondary-destructive" size="sm" iconLeading={Trash01} onPress={openBulkDelete}>
                    Delete selected ({selectedCount})
                  </Button>
                </div>
              ) : null
            }
          />
          <div className="flex flex-col gap-3 border-b border-secondary px-4 py-4 md:px-6">
            {filterToolbar}
            <ActiveFiltersBar chips={chips} onClear={clearFilters} />
          </div>

          {filteredEmpty ? (
            <FilteredEmptyState
              title="No articles match these filters"
              description="Try clearing filters or adjusting purity and weight ranges."
              onClear={clearFilters}
            />
          ) : null}

          {items.length > 0 ? (
            <>
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
                  <Table.Head id="open" label="" />
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
                        <Table.Cell className="text-right font-medium tabular-nums">
                          {formatGrams(item.gross_weight_grams)}
                        </Table.Cell>
                        <Table.Cell className="text-right font-medium tabular-nums">
                          {formatGrams(item.net_metal_weight_grams)}
                        </Table.Cell>
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
                        <Table.Cell>
                          <ChevronRight className="size-4 text-fg-quaternary" aria-hidden="true" />
                        </Table.Cell>
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
            </>
          ) : null}
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

      <ConfirmDialog
        isOpen={showBatchReprint}
        title={pendingReprintIds.length === 1 ? "Reprint tag" : "Reprint tags"}
        confirmLabel={pendingReprintIds.length === 1 ? "Reprint tag" : "Reprint tags"}
        confirmColor="primary"
        message={
          <div className="flex flex-col gap-3">
            <p>
              The same barcode will be printed for each selected article. A reason is required for the audit
              record.
            </p>
            <Input label="Reason" value={batchReprintReason} isRequired onChange={setBatchReprintReason} />
          </div>
        }
        onConfirm={() => {
          const reason = batchReprintReason.trim();
          if (!reason || pendingReprintIds.length === 0) {
            return;
          }
          setShowBatchReprint(false);
          setBatchReprintReason("");
          router.push(tagPrintHref({ ids: pendingReprintIds, kind: "reprint", reason }));
          setPendingReprintIds([]);
        }}
        onCancel={() => {
          setShowBatchReprint(false);
          setBatchReprintReason("");
          setPendingReprintIds([]);
        }}
      />
    </>
  );
}

function InventoryFilterToolbar({
  catalogueEmpty,
  scan,
  search,
  status,
  categoryId,
  metal,
  purity,
  minWeight,
  maxWeight,
  showMoreFilters,
  filtersActive,
  scanError,
  scanRef,
  terminator,
  expectedSuffix,
  alreadyScanned,
  categoriesLoading,
  categoryOptions,
  onScanChange,
  onScan,
  onDuplicate,
  onUnexpectedSuffix,
  onSearchChange,
  onSearchEnter,
  onStatusChange,
  onCategoryChange,
  onMetalChange,
  onPurityChange,
  onMinWeightChange,
  onMaxWeightChange,
  onToggleMoreFilters,
  onClearFilters,
  onApplyAdvanced,
}: {
  catalogueEmpty: boolean;
  scan: string;
  search: string;
  status: "" | ArticleStatus;
  categoryId: string;
  metal: "" | Metal;
  purity: string;
  minWeight: string;
  maxWeight: string;
  showMoreFilters: boolean;
  filtersActive: boolean;
  scanError: string | null;
  scanRef: React.RefObject<HTMLInputElement | null>;
  terminator: "Enter" | "Tab" | "None";
  expectedSuffix: string;
  alreadyScanned: Set<string>;
  categoriesLoading: boolean;
  categoryOptions: { label: string; value: string }[];
  onScanChange: (value: string) => void;
  onScan: (payload: string) => void;
  onDuplicate: (payload: string) => void;
  onUnexpectedSuffix: (raw: string) => void;
  onSearchChange: (value: string) => void;
  onSearchEnter: (event: KeyboardEvent<HTMLInputElement>) => void;
  onStatusChange: (value: "" | ArticleStatus) => void;
  onCategoryChange: (value: string) => void;
  onMetalChange: (value: "" | Metal) => void;
  onPurityChange: (value: string) => void;
  onMinWeightChange: (value: string) => void;
  onMaxWeightChange: (value: string) => void;
  onToggleMoreFilters: () => void;
  onClearFilters: () => void;
  onApplyAdvanced: () => void;
}): ReactNode {
  return (
    <div className="flex flex-col gap-3">
      <div
        className={cx(
          "grid gap-3",
          catalogueEmpty ? "md:grid-cols-2" : "md:grid-cols-2 xl:grid-cols-6",
        )}
      >
        <ScanField
          value={scan}
          terminator={terminator}
          expectedSuffix={expectedSuffix}
          alreadyScanned={alreadyScanned}
          inputRef={scanRef}
          hint=""
          onChange={onScanChange}
          onScan={onScan}
          onDuplicate={onDuplicate}
          onUnexpectedSuffix={onUnexpectedSuffix}
        />
        <Input
          label="Search"
          value={search}
          placeholder="Article number, HUID, or source"
          icon={SearchLg}
          onChange={onSearchChange}
          onKeyDown={onSearchEnter}
        />
        {!catalogueEmpty ? (
          <>
            <SelectField
              label="Status"
              value={status}
              onChange={(value) => onStatusChange(value as "" | ArticleStatus)}
              options={[
                { label: "All statuses", value: "" },
                { label: "Available", value: "available" },
                { label: "Sold", value: "sold" },
                { label: "Under review", value: "return_inspection" },
                { label: "Unavailable", value: "unavailable" },
              ]}
            />
            <SelectField
              label="Metal"
              value={metal}
              onChange={(value) => onMetalChange(value === "gold" || value === "silver" ? value : "")}
              options={[
                { label: "All metals", value: "" },
                { label: "Gold", value: "gold" },
                { label: "Silver", value: "silver" },
              ]}
            />
            <SelectField
              label="Category"
              value={categoryId}
              onChange={onCategoryChange}
              isDisabled={categoriesLoading}
              options={categoryOptions}
            />
            <div className="flex flex-wrap items-end gap-2">
              <Button color="secondary" size="md" iconLeading={FilterLines} onPress={onToggleMoreFilters}>
                {showMoreFilters ? "Hide filters" : "More filters"}
              </Button>
              {filtersActive ? (
                <Button color="tertiary" size="md" onPress={onClearFilters}>
                  Clear filters
                </Button>
              ) : null}
            </div>
          </>
        ) : null}
      </div>

      {showMoreFilters && !catalogueEmpty ? (
        <div className="grid gap-3 border-t border-secondary pt-3 md:grid-cols-2 xl:grid-cols-4">
          <Input label="Purity" value={purity} onChange={onPurityChange} />
          <Input label="Min gross weight (g)" value={minWeight} onChange={onMinWeightChange} />
          <Input label="Max gross weight (g)" value={maxWeight} onChange={onMaxWeightChange} />
          <div className="flex items-end">
            <Button color="secondary" size="md" onPress={onApplyAdvanced}>
              Apply filters
            </Button>
          </div>
        </div>
      ) : null}

      {scanError ? <p className="text-sm text-error-primary">{scanError}</p> : null}
    </div>
  );
}
