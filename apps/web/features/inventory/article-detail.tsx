"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Article, ArticleFile, InventoryMovement } from "@aabhushan/contracts";
import { Image01 } from "@untitledui/icons";

import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
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
  tagPrintHref,
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
  const [reprintReason, setReprintReason] = useState("");
  const [showReprint, setShowReprint] = useState(false);

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
  const locationLabel = article.location_name ?? "Unspecified";
  const metalLabel = article.metal.charAt(0).toUpperCase() + article.metal.slice(1);
  const secondaryLine = [article.category_name, metalLabel, article.purity, locationLabel].join(" · ");

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
          <p className="mt-2 text-sm text-tertiary">{secondaryLine}</p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(16rem,20rem)_1fr_minmax(16rem,20rem)]">
        <PieceRail
          files={article.files}
          barcode={article.barcode}
          canWrite={canWrite}
          onPrintTag={() => router.push(tagPrintHref({ ids: [article.id], kind: "initial" }))}
          onReprint={() => setShowReprint(true)}
        />

        <SpecificationGrid article={article} />

        <MovementTimeline
          items={movementsQuery.data?.items ?? []}
          isLoading={movementsQuery.isLoading}
          isError={movementsQuery.isError}
          error={movementsQuery.error}
        />
      </div>

      {canWrite && !sold ? (
        <section className="rounded-xl bg-primary p-4 shadow-xs ring-1 ring-secondary md:p-5">
          <h2 className="text-md font-semibold text-primary">{underReview ? "Inspection release" : "Adjustment"}</h2>
          <p className="mt-1 text-sm text-tertiary">
            {underReview
              ? "Release back to available stock or keep the piece unavailable. This is a stock movement, not a sale."
              : "Adjustments require a reason and write an append-only movement plus audit row."}
          </p>
          <div className="mt-4 flex flex-col gap-4">
            <Input label="Reason" value={reason} isRequired={!underReview} onChange={setReason} />
            {underReview ? (
              <div className="grid gap-4 md:grid-cols-2">
                <SelectField
                  label="Release to"
                  value={releaseStatus}
                  onChange={(value) => setReleaseStatus(value as "available" | "unavailable")}
                  options={[
                    { label: "Available", value: "available" },
                    { label: "Unavailable", value: "unavailable" },
                  ]}
                />
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
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
              </div>
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
          Reprint of the historical tag is allowed and keeps the same barcode.
        </p>
      ) : null}

      <ConfirmDialog
        isOpen={showReprint}
        title="Reprint tag"
        confirmLabel="Reprint tag"
        confirmColor="primary"
        message={
          <div className="flex flex-col gap-3">
            <p>The same barcode will be printed. A reason is required for the audit record.</p>
            <Input label="Reason" value={reprintReason} isRequired onChange={setReprintReason} />
          </div>
        }
        onConfirm={() => {
          const reason = reprintReason.trim();
          if (!reason) {
            return;
          }
          setShowReprint(false);
          router.push(tagPrintHref({ ids: [article.id], kind: "reprint", reason }));
        }}
        onCancel={() => {
          setShowReprint(false);
          setReprintReason("");
        }}
      />
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

function PieceRail({
  files,
  barcode,
  canWrite,
  onPrintTag,
  onReprint,
}: {
  files: ArticleFile[];
  barcode: string | null;
  canWrite: boolean;
  onPrintTag: () => void;
  onReprint: () => void;
}) {
  return (
    <CardShell title="Photograph">
      <div className="flex flex-col gap-3">
        <div className="flex aspect-square flex-col items-center justify-center overflow-hidden rounded-lg bg-secondary ring-1 ring-secondary">
          {files.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 text-center">
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary ring-1 ring-secondary ring-inset">
                <Image01 className="size-5 text-fg-quaternary" aria-hidden="true" />
              </div>
              <p className="text-sm font-semibold text-primary">No photograph yet</p>
            </div>
          ) : (
            <ul className="flex w-full flex-col gap-2 overflow-y-auto p-3">
              {files.map((file) => (
                <li key={file.id} className="rounded-lg bg-primary px-3 py-2 ring-1 ring-secondary">
                  <p className="text-sm font-medium text-primary">{file.original_filename}</p>
                  <p className="text-xs text-tertiary">
                    {file.content_type} · {file.byte_size} bytes
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="text-xs text-tertiary">Private object keys only. No public URL is issued in this unit.</p>

        <div className="border-t border-secondary pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-quaternary">Printed tag</p>
          <div className="mt-2 flex flex-col gap-2">
            {barcode ? (
              <p className="font-mono text-sm font-medium text-primary break-all">{barcode}</p>
            ) : (
              <p className="text-sm text-tertiary">Barcode is assigned when the piece is tagged.</p>
            )}
            <p className="text-xs text-tertiary">Printer not confirmed. A preview is not a physical tag.</p>
            {canWrite ? (
              <div className="flex flex-wrap gap-2">
                <Button color="primary" size="sm" onPress={onPrintTag}>
                  Print tag
                </Button>
                {barcode ? (
                  <Button color="secondary" size="sm" onPress={onReprint}>
                    Reprint tag
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </CardShell>
  );
}

function SpecificationGrid({ article }: { article: Article }) {
  const stonesSummary =
    article.stones.length === 0
      ? "None"
      : article.stones
          .map((stone) => (stone.weight_grams ? `${stone.description} · ${formatGrams(stone.weight_grams)}` : stone.description))
          .join("; ");
  const ageDays = ageingDaysFromReceipt(article.receipt_business_date);

  return (
    <CardShell title="Specification">
      <div className="flex flex-col">
        <SpecSection title="Identity" first>
          <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
            <Detail label="Article number" value={article.article_number} mono />
            <Detail label="Barcode" value={article.barcode ?? "Assigned when tagged"} mono={Boolean(article.barcode)} empty={!article.barcode} />
            <Detail label="HUID" value={article.huid ?? "—"} mono={Boolean(article.huid)} empty={!article.huid} />
          </div>
        </SpecSection>

        <SpecSection title="Metal and weights">
          <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
            <Detail label="Metal" value={article.metal} capitalize />
            <Detail label="Purity" value={article.purity} />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-secondary px-3 py-2.5 ring-1 ring-secondary">
            <WeightCell label="Gross" value={formatGrams(article.gross_weight_grams)} />
            <WeightCell label="Non-metal" value={formatGrams(article.non_metal_weight_grams)} />
            <WeightCell label="Net metal" value={formatGrams(article.net_metal_weight_grams)} />
          </div>
        </SpecSection>

        <SpecSection title="Stones">
          <Detail label="Stones" value={stonesSummary} empty={article.stones.length === 0} />
        </SpecSection>

        <SpecSection title="Source and place">
          <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
            <Detail label="Supplier" value={article.supplier_ref ?? "—"} empty={!article.supplier_ref} />
            <Detail label="Karigar" value={article.karigar_ref ?? "—"} empty={!article.karigar_ref} />
            <Detail label="Receipt date" value={article.receipt_business_date} />
            <Detail label="Ageing" value={ageDays === 1 ? "1 day" : `${ageDays} days`} />
            <Detail label="Location" value={article.location_name ?? "Unspecified"} empty={!article.location_name} />
          </div>
        </SpecSection>

        <SpecSection title="Cost">
          <Detail
            label="Acquisition cost"
            value={article.acquisition_cost_inr ? `₹ ${article.acquisition_cost_inr}` : "Not recorded"}
            empty={!article.acquisition_cost_inr}
            hint="Internal only — never a customer-facing price."
          />
        </SpecSection>
      </div>
    </CardShell>
  );
}

function SpecSection({ title, children, first }: { title: string; children: ReactNode; first?: boolean }) {
  return (
    <div className={cx(!first && "mt-4 border-t border-secondary pt-4")}>
      <p className="text-xs font-semibold uppercase tracking-wide text-quaternary">{title}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function WeightCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold text-quaternary">{label}</p>
      <p className="mt-0.5 text-sm font-medium tabular-nums text-primary">{value}</p>
    </div>
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
        <ol className="relative flex max-h-112 flex-col gap-3 overflow-y-auto border-l border-secondary pl-4">
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
                <p className="mt-0.5 text-xs text-quaternary">
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
  empty,
  hint,
  className,
}: {
  label: string;
  value: string;
  numeric?: boolean;
  mono?: boolean;
  capitalize?: boolean;
  empty?: boolean;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-xs font-semibold text-quaternary">{label}</p>
      <p
        className={cx(
          "mt-0.5 text-sm font-medium",
          empty ? "text-quaternary" : "text-primary",
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
