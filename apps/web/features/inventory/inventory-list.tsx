"use client";

import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ArticleListItem, ArticleStatus, Metal, ScanTerminator } from "@aabhushan/contracts";
import { ChevronRight, Package, SearchLg } from "@untitledui/icons";
import {
  Dialog as AriaDialog,
  DialogTrigger as AriaDialogTrigger,
  Popover as AriaPopover,
} from "react-aria-components";

import { InventoryFilterStripSkeleton } from "@/components/application/skeleton/skeleton";
import { Tabs } from "@/components/application/tabs/tabs";
import { useStaffToast } from "@/components/application/toast/staff-toast";
import { Table, TableCard } from "@/components/application/table/table";
import { Badge } from "@/components/base/badges/badges";
import { ButtonGroup, ButtonGroupItem } from "@/components/base/button-group/button-group";
import { Button } from "@/components/base/buttons/button";
import { Dropdown } from "@/components/base/dropdown/dropdown";
import { Input } from "@/components/base/input/input";
import { ActiveFiltersBar } from "@/components/shared/active-filters-bar";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormDialog } from "@/components/shared/form-dialog";
import {
  DirectoryEmptyState,
  DirectoryError,
  DirectoryTableBusy,
  DirectoryTableSkeleton,
  FilteredEmptyState,
  directoryListFlags,
} from "@/components/shared/directory-states";
import { ListTableFooter } from "@/components/shared/list-table-footer";
import { type ListFilterChip, type ListFilterCodec, useListPagination, useSyncedListFilters } from "@/lib/list-search-params";
import { ScanField } from "@/components/shared/scan-field";
import { SelectField } from "@/components/shared/select-field";
import { StaffPageHeader } from "@/components/shared/staff-page-header";
import { staffHasPermission, useStaff } from "@/features/auth/staff-shell";
import {
  articleStatusColor,
  articleStatusLabel,
  gramsDisplay,
  inventoryAccessToken,
  inventoryErrorMessage,
  isScanNotFoundError,
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

/** Live order: lookup, then status tabs + compact filters. */
export function InventoryFilterSkeleton() {
  return <InventoryFilterStripSkeleton />;
}

/** Body-only loader: Suspense fallback and showInitialLoading (header stays live). */
export function InventoryListBodyLoading() {
  return (
    <DirectoryTableSkeleton
      title="Articles"
      columns={7}
      showSelectionColumn
      label="Loading articles"
      filterSkeleton={<InventoryFilterSkeleton />}
    />
  );
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

const STATUS_TABS: { id: string; label: string; value: "" | ArticleStatus }[] = [
  { id: "all", label: "All", value: "" },
  { id: "available", label: "Available", value: "available" },
  { id: "sold", label: "Sold", value: "sold" },
  { id: "return_inspection", label: "Under review", value: "return_inspection" },
  { id: "unavailable", label: "Unavailable", value: "unavailable" },
];

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
  chips() {
    return [];
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

type ScanNotFound = { raw: string };

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
                <Button color="secondary" size="lg" href="/inventory/stock-counts/new">
                  Record stock count
                </Button>
              ) : null}
              <Button color="primary" size="lg" href="/inventory/receive">
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
  const toast = useStaffToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const lookupRef = useRef<HTMLInputElement>(null);
  const { filters: urlFilters, setFilters: setUrlFilters, clearFilters: clearUrlFilters } =
    useSyncedListFilters("/inventory", inventoryUrlCodec);
  const [selectedKeys, setSelectedKeys] = useState<TableSelection>(new Set());
  const pagination = useListPagination(10);
  const { page, pageSize } = pagination;
  const setPage = (next: number) => {
    pagination.setPage(next);
    setSelectedKeys(new Set());
  };
  const setPageSize = (next: number) => {
    pagination.setPageSize(next);
    setSelectedKeys(new Set());
  };
  const [lookup, setLookup] = useState("");
  const [search, setSearch] = useState("");
  const [scan, setScan] = useState("");
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanNotFound, setScanNotFound] = useState<ScanNotFound | null>(null);
  const [scannedThisSession, setScannedThisSession] = useState<Set<string>>(() => new Set());
  const [status, setStatus] = useState<"" | ArticleStatus>(urlFilters.status);
  const [categoryId, setCategoryId] = useState("");
  const [metal, setMetal] = useState<"" | Metal>("");
  const [purity, setPurity] = useState("");
  const [minWeight, setMinWeight] = useState("");
  const [maxWeight, setMaxWeight] = useState("");
  const [applied, setApplied] = useState<AppliedFilters>({ ...emptyApplied, status: urlFilters.status });
  const [purityOpen, setPurityOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showBatchReprint, setShowBatchReprint] = useState(false);
  const [batchReprintReason, setBatchReprintReason] = useState("");
  const [batchReprintReasonError, setBatchReprintReasonError] = useState<string | null>(null);
  const [pendingReprintIds, setPendingReprintIds] = useState<string[]>([]);
  const [rowReprintItem, setRowReprintItem] = useState<ArticleListItem | null>(null);
  const [rowReprintReason, setRowReprintReason] = useState("");
  const [rowReprintReasonError, setRowReprintReasonError] = useState<string | null>(null);
  const batchReprintReasonRef = useRef<HTMLInputElement>(null);
  const rowReprintReasonRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    lookupRef.current?.focus();
  }, []);

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

  const terminator: ScanTerminator = devices.data?.scan_terminator ?? "Enter";
  const expectedSuffix = devices.data?.expected_suffix ?? "";
  const mergedLookup = terminator !== "None";
  const devicesReady = devices.isSuccess;

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
  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of categories.data?.items ?? []) {
      map.set(item.id, item.name);
    }
    return map;
  }, [categories.data?.items]);

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
      if (result.deletedCount > 0) {
        toast.success(
          result.deletedCount === 1 ? "Article deleted" : `${result.deletedCount} articles deleted`,
        );
      }
      void queryClient.invalidateQueries({ queryKey: ["inventory", "articles"] });
    },
    onError: (error) => {
      setActionError(inventoryErrorMessage(error));
    },
  });

  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const filtersActive = hasAppliedFilters(applied);
  const hasSearch = Boolean(applied.q);
  const hasOtherFilters = Boolean(
    applied.status ||
      applied.categoryId ||
      applied.metal ||
      applied.purity ||
      applied.minWeight ||
      applied.maxWeight,
  );
  const tableBusy = query.isFetching && Boolean(query.data);
  const {
    showInitialLoading,
    directoryEmpty: catalogueEmpty,
    filteredEmpty,
    showDirectoryCard: showArticlesCard,
  } = directoryListFlags({
    isLoading: query.isLoading,
    hasData: Boolean(query.data),
    total,
    itemCount: items.length,
    filtersActive,
  });

  useEffect(() => {
    onShowStockCountAction(!catalogueEmpty);
  }, [catalogueEmpty, onShowStockCountAction]);

  const selectedIds =
    selectedKeys === "all" ? items.map((item) => item.id) : [...selectedKeys].map((key) => String(key));
  const selectedCount = selectedIds.length;
  const selectedArticles = selectedIds
    .map((id) => itemsById.get(id))
    .filter((item): item is ArticleListItem => Boolean(item));
  const deletableSelectedCount = selectedArticles.filter((item) => item.deletable).length;
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

  const filterChips: ListFilterChip[] = useMemo(() => {
    const chips: ListFilterChip[] = [];
    if (applied.q) {
      chips.push({ id: "q", label: `“${applied.q}”` });
    }
    if (applied.categoryId) {
      chips.push({
        id: "category",
        label: `Category ${categoryNameById.get(applied.categoryId) ?? "Category"}`,
      });
    }
    if (applied.purity) {
      chips.push({ id: "purity", label: `Purity ${applied.purity}` });
    }
    if (applied.minWeight || applied.maxWeight) {
      const min = applied.minWeight || "…";
      const max = applied.maxWeight || "…";
      chips.push({ id: "weight", label: `Weight ${min}–${max} g` });
    }
    return chips;
  }, [applied, categoryNameById]);

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

  function applySearchValue(query: string) {
    const next = query.trim();
    setSearch(next);
    setLookup(next);
    setPage(1);
    setSelectedKeys(new Set());
    setApplied((current) => ({ ...current, q: next }));
    setScanError(null);
    setScanNotFound(null);
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
    setPurityOpen(false);
  }

  function clearFilters() {
    setLookup("");
    setSearch("");
    setScan("");
    setStatus("");
    setCategoryId("");
    setMetal("");
    setPurity("");
    setMinWeight("");
    setMaxWeight("");
    setPage(1);
    setSelectedKeys(new Set());
    setApplied(emptyApplied);
    setPurityOpen(false);
    setScanError(null);
    setScanNotFound(null);
    clearUrlFilters();
  }

  function clearSearchOnly() {
    setLookup("");
    setSearch("");
    setApplied((current) => ({ ...current, q: "" }));
    setPage(1);
    setSelectedKeys(new Set());
  }

  function removeChip(id: string) {
    if (id === "q") {
      setLookup("");
      setSearch("");
      setApplied((current) => ({ ...current, q: "" }));
      setPage(1);
      setSelectedKeys(new Set());
      return;
    }
    if (id === "category") {
      applyCategory("");
      return;
    }
    if (id === "purity") {
      setPurity("");
      setApplied((current) => ({ ...current, purity: "" }));
      setPage(1);
      setSelectedKeys(new Set());
      return;
    }
    if (id === "weight") {
      setMinWeight("");
      setMaxWeight("");
      setApplied((current) => ({ ...current, minWeight: "", maxWeight: "" }));
      setPage(1);
      setSelectedKeys(new Set());
    }
  }

  function lookupScannedArticle(barcode: string) {
    setScanError(null);
    setScanNotFound(null);
    void (async () => {
      try {
        const article = await lookupArticle(await inventoryAccessToken(), barcode);
        setScannedThisSession((current) => new Set(current).add(barcode));
        setLookup("");
        setScan("");
        router.push(`/inventory/${article.id}`);
      } catch (error) {
        if (isScanNotFoundError(error)) {
          setScanNotFound({ raw: barcode });
          setScanError(scanLookupErrorMessage(error));
          if (mergedLookup) {
            setLookup(barcode);
          } else {
            setScan(barcode);
          }
          return;
        }
        setScanError(scanLookupErrorMessage(error));
      }
    })();
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

  function openRowPrint(item: ArticleListItem) {
    if (item.barcode) {
      setRowReprintItem(item);
      setRowReprintReason("");
      return;
    }
    router.push(tagPrintHref({ ids: [item.id], kind: "initial" }));
  }

  const lookupBlock = (
    <InventoryLookup
      merged={mergedLookup}
      canWrite={canWrite}
      lookup={lookup}
      search={search}
      scan={scan}
      scanError={scanError}
      scanNotFound={scanNotFound}
      scanRef={lookupRef}
      terminator={terminator}
      expectedSuffix={expectedSuffix}
      alreadyScanned={scannedThisSession}
      devicesReady={devicesReady}
      onLookupChange={(value) => {
        setLookup(value);
        setScanNotFound(null);
        setScanError(null);
      }}
      onSearchChange={setSearch}
      onScanChange={(value) => {
        setScan(value);
        setScanNotFound(null);
        setScanError(null);
      }}
      onScan={lookupScannedArticle}
      onSearch={applySearchValue}
      onDuplicate={(payload) => {
        setScanError(`Already scanned in this session: ${payload}`);
        setScanNotFound(null);
        setLookup("");
        setScan("");
      }}
      onUnexpectedSuffix={(raw) => {
        setScanError(`Scanner suffix was unexpected. Raw scan: ${raw}`);
        setScanNotFound(null);
      }}
      onSearchInstead={() => {
        if (scanNotFound) {
          applySearchValue(scanNotFound.raw);
        }
      }}
    />
  );

  const filterRow = (
    <InventoryFilterRow
      status={status}
      metal={metal}
      categoryId={categoryId}
      purity={purity}
      minWeight={minWeight}
      maxWeight={maxWeight}
      purityOpen={purityOpen}
      categoriesLoading={categories.isLoading}
      categoryOptions={[
        { label: "Category", value: "" },
        ...(categories.data?.items ?? []).map((item) => ({ label: item.name, value: item.id })),
      ]}
      onStatusChange={applyStatus}
      onMetalChange={applyMetal}
      onCategoryChange={applyCategory}
      onPurityChange={setPurity}
      onMinWeightChange={setMinWeight}
      onMaxWeightChange={setMaxWeight}
      onPurityOpenChange={setPurityOpen}
      onApplyAdvanced={applyAdvancedFilters}
    />
  );

  const bulkBar =
    canWrite && selectedCount > 0 ? (
      <div className="flex flex-wrap items-center gap-3 rounded-lg bg-primary-solid px-5 py-3.5 text-md font-semibold text-white">
        <span className="font-bold">{selectedCount} selected</span>
        <Button
          color="primary"
          size="lg"
          className="!bg-brand-solid hover:!bg-brand-solid_hover"
          onPress={openBatchPrint}
        >
          {selectionPrintMode === "reprint"
            ? `Reprint tags (${selectedCount})`
            : `Print tags (${selectedCount})`}
        </Button>
        <Button
          color="secondary"
          size="lg"
          className="!border-white/80 !bg-transparent !text-white hover:!bg-white/10"
          onPress={openBulkDelete}
        >
          Delete
        </Button>
        {deletableSelectedCount < selectedCount ? (
          <span className="font-normal text-white/70">
            {deletableSelectedCount} of {selectedCount} can be deleted — sold pieces are skipped
          </span>
        ) : null}
        <Button
          color="link-gray"
          size="lg"
          className="ml-auto !text-white"
          onPress={() => setSelectedKeys(new Set())}
        >
          Clear
        </Button>
      </div>
    ) : null;

  const chipsBar = (
    <ActiveFiltersBar
      chips={filterChips}
      onClear={clearFilters}
      onRemove={removeChip}
      clearLabel="Clear filters"
      showLabel={false}
    />
  );

  return (
    <>
      {catalogueEmpty ? (
        <div className="flex flex-col gap-4 rounded-xl bg-primary p-5 shadow-xs ring-1 ring-secondary md:p-6">
          {lookupBlock}
          {chipsBar}
        </div>
      ) : null}

      {showInitialLoading ? <InventoryListBodyLoading /> : null}
      {(query.isError || actionError) && !showArticlesCard ? (
        <>
          {query.isError ? <DirectoryError message={inventoryErrorMessage(query.error)} /> : null}
          {actionError ? <DirectoryError message={actionError} /> : null}
        </>
      ) : null}

      {catalogueEmpty ? (
        <DirectoryEmptyState
          icon={Package}
          title="No articles yet"
          description="Receive jewellery to create a unique shop record. Manual lookup works without a scanner."
          action={
            canWrite ? (
              <Button color="primary" size="lg" href="/inventory/receive">
                Receive article
              </Button>
            ) : null
          }
        />
      ) : null}

      {showArticlesCard ? (
        <TableCard.Root>
          <TableCard.Header title="Articles" badge={String(total)} />
          {query.isError || actionError ? (
            <div className="flex flex-col gap-2 border-b border-secondary px-4 py-3 md:px-6">
              {query.isError ? <DirectoryError message={inventoryErrorMessage(query.error)} /> : null}
              {actionError ? <DirectoryError message={actionError} /> : null}
            </div>
          ) : null}
          <div className="flex flex-col gap-0 border-b border-secondary">
            <div className="border-b border-primary px-5 py-5 md:px-7">{lookupBlock}</div>
            {bulkBar ? (
              <div className="px-5 py-4 md:px-7">{bulkBar}</div>
            ) : (
              <div className="px-5 py-4 md:px-7">{filterRow}</div>
            )}
            {filterChips.length > 0 ? (
              <div className="border-t border-secondary px-5 py-4 md:px-7">{chipsBar}</div>
            ) : null}
          </div>

          {filteredEmpty ? (
            <FilteredEmptyState
              title="No articles match these filters"
              description="Try clearing filters or adjusting purity and weight ranges."
              hasSearch={hasSearch}
              hasOtherFilters={hasOtherFilters}
              onClear={clearFilters}
              onClearSearch={hasSearch ? clearSearchOnly : undefined}
            />
          ) : null}

          {items.length > 0 ? (
            <DirectoryTableBusy isBusy={tableBusy}>
              <Table
                aria-label="Articles"
                selectionMode={canWrite ? "multiple" : "none"}
                selectedKeys={selectedKeys}
                onSelectionChange={setSelectedKeys}
              >
                <Table.Header>
                  <Table.Head id="number" isRowHeader label="Article" />
                  <Table.Head id="metal_purity" label="Metal · purity" />
                  <Table.Head id="gross" label="Gross (g)" className="text-right" />
                  <Table.Head id="net" label="Net (g)" className="text-right" />
                  <Table.Head id="status" label="Status" />
                  <Table.Head id="location" label="Location" />
                  {canWrite ? (
                    <Table.Head id="menu" label="" className="w-14" />
                  ) : (
                    <Table.Head id="open" label="" />
                  )}
                </Table.Header>
                <Table.Body items={items}>
                  {(item: ArticleListItem) => {
                    const blocked = deleteBlockedReason(item);
                    return (
                      <Table.Row
                        id={item.id}
                        href={`/inventory/${item.id}`}
                        className="cursor-pointer"
                      >
                        <Table.Cell truncate={false}>
                          <div className="flex h-full flex-col justify-center gap-0.5 overflow-hidden">
                            <span className="truncate font-mono text-md font-medium text-primary">
                              {item.article_number}
                            </span>
                            <span className="truncate text-md text-tertiary">{item.category_name}</span>
                          </div>
                        </Table.Cell>
                        <Table.Cell>
                          <span className="capitalize">{item.metal}</span>
                          <span className="text-tertiary"> · </span>
                          {item.purity}
                        </Table.Cell>
                        <Table.Cell className="text-right tabular-nums text-primary">
                          {gramsDisplay(item.gross_weight_grams)}
                        </Table.Cell>
                        <Table.Cell className="text-right font-semibold tabular-nums text-primary">
                          {gramsDisplay(item.net_metal_weight_grams)}
                        </Table.Cell>
                        <Table.Cell>
                          <Badge color={articleStatusColor(item.status)} size="lg">
                            {articleStatusLabel(item.status)}
                          </Badge>
                        </Table.Cell>
                        <Table.Cell>{item.location_name ?? "—"}</Table.Cell>
                        {canWrite ? (
                          <Table.Cell className="w-14" truncate={false}>
                            <div
                              onPointerDown={(event) => event.stopPropagation()}
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                              }}
                            >
                              <Dropdown.Root>
                                <Dropdown.DotsButton
                                  aria-label={`Actions for ${item.article_number}`}
                                  className="p-2 [&_svg]:size-6"
                                />
                                <Dropdown.Popover className="w-56">
                                  <Dropdown.Menu
                                    onAction={(key) => {
                                      if (key === "open") {
                                        router.push(`/inventory/${item.id}`);
                                        return;
                                      }
                                      if (key === "print") {
                                        openRowPrint(item);
                                        return;
                                      }
                                      if (key === "delete" && item.deletable) {
                                        setActionError(null);
                                        setPendingDelete({ kind: "single", item });
                                      }
                                    }}
                                  >
                                    <Dropdown.Item id="open" label="Open" />
                                    <Dropdown.Item
                                      id="print"
                                      label={item.barcode ? "Reprint tag…" : "Print tag"}
                                    />
                                    <Dropdown.Item
                                      id="delete"
                                      isDisabled={!item.deletable || deleteMutation.isPending}
                                      textValue="Delete"
                                    >
                                      <span className="flex flex-col gap-0.5">
                                        <span className="text-sm font-semibold text-secondary">Delete</span>
                                        {blocked ? (
                                          <span className="text-xs font-normal text-tertiary whitespace-normal">
                                            {blocked}
                                          </span>
                                        ) : null}
                                      </span>
                                    </Dropdown.Item>
                                  </Dropdown.Menu>
                                </Dropdown.Popover>
                              </Dropdown.Root>
                            </div>
                          </Table.Cell>
                        ) : (
                          <Table.Cell>
                            <ChevronRight className="size-6 text-fg-quaternary" aria-hidden="true" />
                          </Table.Cell>
                        )}
                      </Table.Row>
                    );
                  }}
                </Table.Body>
              </Table>
              <ListTableFooter
                page={page}
                totalPages={totalPages}
                pageSize={pageSize}
                total={total}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
              />
            </DirectoryTableBusy>
          ) : null}
        </TableCard.Root>
      ) : null}

      <ConfirmDialog
        isOpen={pendingDelete !== null}
        title={pendingDelete?.kind === "bulk" ? "Delete articles" : "Delete article"}
        confirmLabel="Delete"
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

      <FormDialog
        isOpen={showBatchReprint}
        title={pendingReprintIds.length === 1 ? "Reprint tag" : "Reprint tags"}
        confirmLabel={pendingReprintIds.length === 1 ? "Reprint tag" : "Reprint tags"}
        confirmColor="primary"
        initialFocusRef={batchReprintReasonRef}
        onConfirm={() => {
          const reason = batchReprintReason.trim();
          if (!reason || pendingReprintIds.length === 0) {
            if (!reason) {
              setBatchReprintReasonError("Enter a reason for the audit record.");
              batchReprintReasonRef.current?.focus();
            }
            return;
          }
          setShowBatchReprint(false);
          setBatchReprintReason("");
          setBatchReprintReasonError(null);
          router.push(tagPrintHref({ ids: pendingReprintIds, kind: "reprint", reason }));
          setPendingReprintIds([]);
        }}
        onCancel={() => {
          setShowBatchReprint(false);
          setBatchReprintReason("");
          setBatchReprintReasonError(null);
          setPendingReprintIds([]);
        }}
      >
        <p className="text-sm text-tertiary">
          The same barcode will be printed for each selected article. A reason is required for the audit record.
        </p>
        <Input
          ref={batchReprintReasonRef}
          label="Reason"
          value={batchReprintReason}
          isRequired
          isInvalid={Boolean(batchReprintReasonError)}
          error={batchReprintReasonError ?? undefined}
          onChange={(value) => {
            setBatchReprintReason(value);
            setBatchReprintReasonError(null);
          }}
        />
      </FormDialog>

      <FormDialog
        isOpen={rowReprintItem !== null}
        title="Reprint tag"
        confirmLabel="Reprint tag"
        confirmColor="primary"
        initialFocusRef={rowReprintReasonRef}
        onConfirm={() => {
          const reason = rowReprintReason.trim();
          if (!reason || !rowReprintItem) {
            if (!reason) {
              setRowReprintReasonError("Enter a reason for the audit record.");
              rowReprintReasonRef.current?.focus();
            }
            return;
          }
          const id = rowReprintItem.id;
          setRowReprintItem(null);
          setRowReprintReason("");
          setRowReprintReasonError(null);
          router.push(tagPrintHref({ ids: [id], kind: "reprint", reason }));
        }}
        onCancel={() => {
          setRowReprintItem(null);
          setRowReprintReason("");
          setRowReprintReasonError(null);
        }}
      >
        <p className="text-sm text-tertiary">
          The same barcode will be printed. A reason is required for the audit record.
        </p>
        <Input
          ref={rowReprintReasonRef}
          label="Reason"
          value={rowReprintReason}
          isRequired
          isInvalid={Boolean(rowReprintReasonError)}
          error={rowReprintReasonError ?? undefined}
          onChange={(value) => {
            setRowReprintReason(value);
            setRowReprintReasonError(null);
          }}
        />
      </FormDialog>
    </>
  );
}

function InventoryLookup({
  merged,
  canWrite,
  lookup,
  search,
  scan,
  scanError,
  scanNotFound,
  scanRef,
  terminator,
  expectedSuffix,
  alreadyScanned,
  devicesReady,
  onLookupChange,
  onSearchChange,
  onScanChange,
  onScan,
  onSearch,
  onDuplicate,
  onUnexpectedSuffix,
  onSearchInstead,
}: {
  merged: boolean;
  canWrite: boolean;
  lookup: string;
  search: string;
  scan: string;
  scanError: string | null;
  scanNotFound: ScanNotFound | null;
  scanRef: React.RefObject<HTMLInputElement | null>;
  terminator: ScanTerminator;
  expectedSuffix: string;
  alreadyScanned: Set<string>;
  devicesReady: boolean;
  onLookupChange: (value: string) => void;
  onSearchChange: (value: string) => void;
  onScanChange: (value: string) => void;
  onScan: (payload: string) => void;
  onSearch: (query: string) => void;
  onDuplicate: (payload: string) => void;
  onUnexpectedSuffix: (raw: string) => void;
  onSearchInstead: () => void;
}): ReactNode {
  const notFoundFooter =
    scanNotFound && scanError ? (
      <div className="flex flex-wrap items-center gap-3 text-sm font-semibold">
        <Button color="link-gray" size="lg" className="!text-primary" onPress={onSearchInstead}>
          Search instead
        </Button>
        {canWrite ? (
          <Button color="link-gray" size="lg" className="!text-primary" href="/inventory/receive">
            Receive it
          </Button>
        ) : null}
      </div>
    ) : null;

  if (!merged) {
    return (
      <div className="flex flex-col gap-2">
        <div className="grid gap-3 md:grid-cols-[minmax(12rem,16rem)_minmax(0,1fr)]">
          <ScanField
            label="Scan"
            value={scan}
            terminator={terminator}
            expectedSuffix={expectedSuffix}
            alreadyScanned={alreadyScanned}
            inputRef={scanRef}
            hint={null}
            size="lg"
            isInvalid={Boolean(scanError)}
            error={scanError ?? undefined}
            isClearable
            onChange={onScanChange}
            onScan={onScan}
            onDuplicate={onDuplicate}
            onUnexpectedSuffix={onUnexpectedSuffix}
          />
          <Input
            label="Search"
            value={search}
            size="lg"
            placeholder="Article number, HUID, or source"
            icon={SearchLg}
            isClearable
            onChange={onSearchChange}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onSearch(search);
              }
            }}
          />
        </div>
        {notFoundFooter}
      </div>
    );
  }

  return (
    <ScanField
      label="Lookup"
      value={lookup}
      terminator={terminator}
      expectedSuffix={expectedSuffix}
      alreadyScanned={alreadyScanned}
      inputRef={scanRef}
      size="lg"
      placeholder="Scan a tag, or search article number, HUID, source"
      isInvalid={Boolean(scanError)}
      error={scanError ?? undefined}
      status={devicesReady ? "ready" : "idle"}
      isClearable
      onChange={onLookupChange}
      onScan={onScan}
      onSearch={onSearch}
      onDuplicate={onDuplicate}
      onUnexpectedSuffix={onUnexpectedSuffix}
      footer={notFoundFooter}
    />
  );
}

function InventoryFilterRow({
  status,
  metal,
  categoryId,
  purity,
  minWeight,
  maxWeight,
  purityOpen,
  categoriesLoading,
  categoryOptions,
  onStatusChange,
  onMetalChange,
  onCategoryChange,
  onPurityChange,
  onMinWeightChange,
  onMaxWeightChange,
  onPurityOpenChange,
  onApplyAdvanced,
}: {
  status: "" | ArticleStatus;
  metal: "" | Metal;
  categoryId: string;
  purity: string;
  minWeight: string;
  maxWeight: string;
  purityOpen: boolean;
  categoriesLoading: boolean;
  categoryOptions: { label: string; value: string }[];
  onStatusChange: (value: "" | ArticleStatus) => void;
  onMetalChange: (value: "" | Metal) => void;
  onCategoryChange: (value: string) => void;
  onPurityChange: (value: string) => void;
  onMinWeightChange: (value: string) => void;
  onMaxWeightChange: (value: string) => void;
  onPurityOpenChange: (open: boolean) => void;
  onApplyAdvanced: () => void;
}): ReactNode {
  const selectedTab = status || "all";
  const advancedActive = Boolean(purity || minWeight || maxWeight);

  return (
    <div className="flex flex-col gap-4 py-1 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0 overflow-x-auto">
        <Tabs
          selectedKey={selectedTab}
          onSelectionChange={(key) => {
            const tab = STATUS_TABS.find((item) => item.id === String(key));
            onStatusChange(tab?.value ?? "");
          }}
          className="w-max"
        >
          <Tabs.List type="underline" size="md" aria-label="Article status" className="gap-6">
            {STATUS_TABS.map((tab) => (
              <Tabs.Item key={tab.id} id={tab.id} label={tab.label} />
            ))}
          </Tabs.List>
        </Tabs>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <ButtonGroup
          size="lg"
          selection="filter"
          selectedKeys={new Set([metal || "all"])}
          onSelectionChange={(keys) => {
            const key = [...keys][0];
            if (key === "gold" || key === "silver") {
              onMetalChange(key);
              return;
            }
            onMetalChange("");
          }}
        >
          <ButtonGroupItem id="all">All</ButtonGroupItem>
          <ButtonGroupItem id="gold">Gold</ButtonGroupItem>
          <ButtonGroupItem id="silver">Silver</ButtonGroupItem>
        </ButtonGroup>

        <div className="w-52">
          <SelectField
            aria-label="Category"
            size="lg"
            value={categoryId}
            onChange={onCategoryChange}
            isLoading={categoriesLoading}
            placeholder="Category"
            options={categoryOptions.map((option) =>
              option.value === "" ? { ...option, label: "All categories" } : option,
            )}
          />
        </div>

        <AriaDialogTrigger isOpen={purityOpen} onOpenChange={onPurityOpenChange}>
          <Button color="secondary" size="lg" className={cx(advancedActive && "ring-1 ring-brand-solid")}>
            Purity · weight ▾
          </Button>
          <AriaPopover
            placement="bottom end"
            className={({ isEntering, isExiting }) =>
              cx(
                "w-80 origin-(--trigger-anchor-point) rounded-lg bg-primary p-5 shadow-lg ring-1 ring-secondary_alt outline-hidden",
                isEntering && "duration-150 ease-out animate-in fade-in",
                isExiting && "duration-100 ease-in animate-out fade-out",
              )
            }
          >
            <AriaDialog className="outline-hidden">
              <div className="flex flex-col gap-4">
                <Input label="Purity" size="lg" value={purity} onChange={onPurityChange} />
                <Input label="Min gross weight (g)" size="lg" value={minWeight} onChange={onMinWeightChange} />
                <Input label="Max gross weight (g)" size="lg" value={maxWeight} onChange={onMaxWeightChange} />
                <Button color="primary" size="lg" onPress={onApplyAdvanced}>
                  Apply
                </Button>
              </div>
            </AriaDialog>
          </AriaPopover>
        </AriaDialogTrigger>
      </div>
    </div>
  );
}
