"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Article, ArticleFile, InventoryMovement } from "@aabhushan/contracts";
import { Image01, Scan } from "@untitledui/icons";

import { EmptyState } from "@/components/application/empty-state/empty-state";
import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { SelectField } from "@/components/shared/select-field";
import { staffHasPermission, useStaff } from "@/features/auth/staff-shell";
import {
  ageingDaysFromReceipt,
  articleStatusColor,
  articleStatusLabel,
  formatGrams,
  inventoryAccessToken,
  inventoryErrorMessage,
  movementTypeDotClass,
  movementTypeLabel,
} from "@/features/inventory/inventory-shared";
import {
  adjustArticleRequest,
  fetchArticle,
  fetchArticleMovements,
  fetchStorageLocations,
  releaseArticleInspectionRequest,
} from "@/lib/staff-api";
import { cx } from "@/utils/cx";

export function ArticleDetail({ articleId }: { articleId: string }) {
  const staff = useStaff();
  const router = useRouter();
  const queryClient = useQueryClient();
  const allowed = staffHasPermission(staff, "inventory.read");
  const canWrite = staffHasPermission(staff, "inventory.write");
  const [reason, setReason] = useState("");
  const [toStatus, setToStatus] = useState<"available" | "unavailable">("unavailable");
  const [locationId, setLocationId] = useState("");
  const [releaseStatus, setReleaseStatus] = useState<"available" | "unavailable">("available");

  useEffect(() => {
    if (!allowed) {
      router.replace("/access-denied");
    }
  }, [allowed, router]);

  const articleQuery = useQuery({
    queryKey: ["inventory", "article", staff.membership.organization_id, articleId],
    queryFn: async () => fetchArticle(await inventoryAccessToken(), articleId),
    enabled: allowed,
  });
  const movementsQuery = useQuery({
    queryKey: ["inventory", "movements", staff.membership.organization_id, articleId],
    queryFn: async () => fetchArticleMovements(await inventoryAccessToken(), articleId),
    enabled: allowed,
  });
  const locationsQuery = useQuery({
    queryKey: ["inventory", "locations", staff.membership.organization_id],
    queryFn: async () => fetchStorageLocations(await inventoryAccessToken()),
    enabled: allowed && canWrite,
  });

  const article = articleQuery.data;

  useEffect(() => {
    if (article) {
      setLocationId(article.location_id ?? "");
      setToStatus(article.status === "available" ? "unavailable" : "available");
    }
  }, [article]);

  const adjustMutation = useMutation({
    mutationFn: async () => {
      if (!article) {
        throw new Error("Article is not loaded.");
      }
      return adjustArticleRequest(await inventoryAccessToken(), article.id, {
        row_version: article.row_version,
        reason,
        to_status: toStatus,
        ...(locationId ? { location_id: locationId } : { location_id: null }),
      });
    },
    onSuccess: async () => {
      setReason("");
      await queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
  });

  const releaseMutation = useMutation({
    mutationFn: async () => {
      if (!article) {
        throw new Error("Article is not loaded.");
      }
      return releaseArticleInspectionRequest(await inventoryAccessToken(), article.id, {
        row_version: article.row_version,
        to_status: releaseStatus,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
    },
    onSuccess: async () => {
      setReason("");
      await queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
  });

  if (!allowed) {
    return null;
  }

  if (articleQuery.isLoading) {
    return <LoadingIndicator size="md" label="Loading article" />;
  }

  if (articleQuery.isError || !article) {
    return (
      <section className="flex flex-col gap-3">
        <p className="text-sm text-error-primary">{inventoryErrorMessage(articleQuery.error)}</p>
        <Button color="secondary" size="md" href="/inventory">
          Back to inventory
        </Button>
      </section>
    );
  }

  const sold = article.status === "sold";
  const underReview = article.status === "return_inspection";

  return (
    <section className="flex w-full flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-tertiary">
            <Button color="link-color" size="sm" href="/inventory">
              Inventory
            </Button>
          </p>
          <h1 className="font-mono text-display-xs font-semibold text-primary">{article.article_number}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge color={articleStatusColor(article.status)} size="sm">
              {articleStatusLabel(article.status)}
            </Badge>
            <Badge color="gray" size="sm" type="modern">
              {article.sellable ? "Sellable" : "Not sellable"}
            </Badge>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(16rem,20rem)_1fr_minmax(16rem,20rem)]">
        <div className="flex flex-col gap-4">
          <PhotographCard files={article.files} />
          <TagSlot barcode={article.barcode} />
        </div>

        <SpecificationGrid article={article} />

        <MovementTimeline
          items={movementsQuery.data?.items ?? []}
          isLoading={movementsQuery.isLoading}
          isError={movementsQuery.isError}
          error={movementsQuery.error}
        />
      </div>

      {canWrite && !sold ? (
        <section className="max-w-xl rounded-xl bg-primary p-4 shadow-xs ring-1 ring-secondary md:p-5">
          <h2 className="text-md font-semibold text-primary">{underReview ? "Inspection release" : "Adjustment"}</h2>
          <p className="mt-1 text-sm text-tertiary">
            {underReview
              ? "Release back to available stock or keep the piece unavailable. This is a stock movement, not a sale."
              : "Adjustments require a reason and write an append-only movement plus audit row."}
          </p>
          <div className="mt-4 flex flex-col gap-4">
            <Input label="Reason" value={reason} isRequired={!underReview} onChange={setReason} />
            {underReview ? (
              <SelectField
                label="Release to"
                value={releaseStatus}
                onChange={(value) => setReleaseStatus(value as "available" | "unavailable")}
                options={[
                  { label: "Available", value: "available" },
                  { label: "Unavailable", value: "unavailable" },
                ]}
              />
            ) : (
              <>
                <SelectField
                  label="Status after adjustment"
                  value={toStatus}
                  onChange={(value) => setToStatus(value as "available" | "unavailable")}
                  options={[
                    { label: "Available", value: "available" },
                    { label: "Unavailable", value: "unavailable" },
                  ]}
                />
                <SelectField
                  label="Location"
                  value={locationId}
                  onChange={setLocationId}
                  isDisabled={locationsQuery.isLoading}
                  options={[
                    { label: "Unspecified", value: "" },
                    ...(locationsQuery.data?.items ?? []).map((item) => ({ label: item.name, value: item.id })),
                  ]}
                />
              </>
            )}
            {adjustMutation.isError ? <p className="text-sm text-error-primary">{inventoryErrorMessage(adjustMutation.error)}</p> : null}
            {releaseMutation.isError ? <p className="text-sm text-error-primary">{inventoryErrorMessage(releaseMutation.error)}</p> : null}
            {underReview ? (
              <Button color="primary" size="md" isLoading={releaseMutation.isPending} onPress={() => releaseMutation.mutate()}>
                Release from inspection
              </Button>
            ) : (
              <Button color="primary" size="md" isLoading={adjustMutation.isPending} onPress={() => adjustMutation.mutate()}>
                Record adjustment
              </Button>
            )}
          </div>
        </section>
      ) : null}

      {sold ? (
        <p className="text-sm text-tertiary">
          Sold identity and weights cannot be edited here. Corrections use return or adjustment workflows in later units.
        </p>
      ) : null}
    </section>
  );
}

function CardShell({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-xl bg-primary p-4 shadow-xs ring-1 ring-secondary md:p-5", className)}>
      <h2 className="text-md font-semibold text-primary">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function PhotographCard({ files }: { files: ArticleFile[] }) {
  return (
    <CardShell title="Photograph">
      {files.length === 0 ? (
        <EmptyState size="sm" className="mx-auto py-4">
          <EmptyState.Header pattern="none">
            <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-secondary ring-1 ring-secondary ring-inset">
              <Image01 className="size-5 text-fg-quaternary" aria-hidden="true" />
            </div>
            <EmptyState.Content>
              <p className="text-sm font-semibold text-primary">No photograph yet</p>
              <EmptyState.Description>Metadata only until document storage.</EmptyState.Description>
            </EmptyState.Content>
          </EmptyState.Header>
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {files.map((file) => (
            <li key={file.id} className="rounded-lg bg-secondary px-3 py-2 ring-1 ring-secondary">
              <p className="text-sm font-medium text-primary">{file.original_filename}</p>
              <p className="text-xs text-tertiary">
                {file.content_type} · {file.byte_size} bytes · checksum {file.checksum_sha256.slice(0, 12)}…
              </p>
              <p className="mt-1 font-mono text-xs text-quaternary">key {file.object_key}</p>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-tertiary">Private object keys only. No public URL is issued in this unit.</p>
    </CardShell>
  );
}

function TagSlot({ barcode }: { barcode: string | null }) {
  return (
    <CardShell title="Printed tag">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary ring-1 ring-secondary ring-inset">
          <Scan className="size-5 text-fg-quaternary" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          {barcode ? (
            <>
              <p className="font-mono text-sm font-medium text-primary break-all">{barcode}</p>
              <p className="mt-1 text-xs text-tertiary">Print preview arrives with tagging (spec 05).</p>
            </>
          ) : (
            <p className="text-sm text-tertiary">Barcode is assigned when the piece is tagged.</p>
          )}
        </div>
      </div>
    </CardShell>
  );
}

function SpecificationGrid({ article }: { article: Article }) {
  const stonesSummary =
    article.stones.length === 0
      ? "—"
      : article.stones
          .map((stone) => (stone.weight_grams ? `${stone.description} · ${formatGrams(stone.weight_grams)}` : stone.description))
          .join("; ");
  const ageDays = ageingDaysFromReceipt(article.receipt_business_date);

  return (
    <CardShell title="Specification">
      <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        <Detail label="Article number" value={article.article_number} mono />
        <Detail label="Barcode" value={article.barcode ?? "Assigned when tagged"} mono={Boolean(article.barcode)} />
        <Detail label="HUID" value={article.huid ?? "—"} mono={Boolean(article.huid)} />
        <Detail label="Category" value={article.category_name} />
        <Detail label="Metal" value={article.metal} capitalize />
        <Detail label="Purity" value={article.purity} />
        <Detail label="Gross" value={formatGrams(article.gross_weight_grams)} numeric />
        <Detail label="Non-metal" value={formatGrams(article.non_metal_weight_grams)} numeric />
        <Detail label="Net metal" value={formatGrams(article.net_metal_weight_grams)} numeric />
        <Detail label="Stones" value={stonesSummary} className="sm:col-span-2 lg:col-span-3" />
        <Detail label="Supplier" value={article.supplier_ref ?? "—"} />
        <Detail label="Karigar" value={article.karigar_ref ?? "—"} />
        <Detail label="Receipt date" value={article.receipt_business_date} />
        <Detail label="Ageing" value={ageDays === 1 ? "1 day" : `${ageDays} days`} />
        <Detail label="Location" value={article.location_name ?? "Unspecified"} />
        <div>
          <p className="text-xs font-semibold text-quaternary">Status</p>
          <div className="mt-1">
            <Badge color={articleStatusColor(article.status)} size="sm">
              {articleStatusLabel(article.status)}
            </Badge>
          </div>
        </div>
        <Detail
          label="Acquisition cost"
          value={article.acquisition_cost_inr ? `₹ ${article.acquisition_cost_inr}` : "Not recorded"}
          hint="Internal only — never a customer-facing price."
          className="sm:col-span-2"
        />
      </div>
    </CardShell>
  );
}

function MovementTimeline({
  items,
  isLoading,
  isError,
  error,
}: {
  items: InventoryMovement[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
}) {
  return (
    <CardShell title="Movement history" className="h-fit">
      {isLoading ? <LoadingIndicator size="sm" label="Loading history" /> : null}
      {isError ? <p className="text-sm text-error-primary">{inventoryErrorMessage(error)}</p> : null}
      {!isLoading && !isError && items.length === 0 ? (
        <p className="text-sm text-tertiary">No movements recorded yet.</p>
      ) : null}
      {!isLoading && items.length > 0 ? (
        <ol className="relative flex flex-col gap-4 border-l border-secondary pl-4">
          {items.map((item) => {
            const statusChange =
              item.from_status && item.to_status
                ? `${articleStatusLabel(item.from_status)} → ${articleStatusLabel(item.to_status)}`
                : item.to_status
                  ? articleStatusLabel(item.to_status)
                  : null;
            return (
              <li key={item.id} className="relative">
                <span
                  className={cx(
                    "absolute top-1.5 -left-5.25 size-2.5 rounded-full ring-2 ring-primary",
                    movementTypeDotClass(item.movement_type),
                  )}
                  aria-hidden="true"
                />
                <p className="text-sm font-semibold text-primary">{movementTypeLabel(item.movement_type)}</p>
                {statusChange ? <p className="text-xs text-tertiary">{statusChange}</p> : null}
                {item.reason ? <p className="mt-0.5 text-sm text-secondary">{item.reason}</p> : null}
                <p className="mt-1 text-xs text-quaternary">
                  {new Date(item.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                </p>
              </li>
            );
          })}
        </ol>
      ) : null}
    </CardShell>
  );
}

function Detail({
  label,
  value,
  numeric,
  mono,
  capitalize,
  hint,
  className,
}: {
  label: string;
  value: string;
  numeric?: boolean;
  mono?: boolean;
  capitalize?: boolean;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-xs font-semibold text-quaternary">{label}</p>
      <p
        className={cx(
          "mt-0.5 text-sm font-medium text-primary",
          numeric && "tabular-nums",
          mono && "font-mono",
          capitalize && "capitalize",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-xs text-tertiary">{hint}</p> : null}
    </div>
  );
}
