"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ARTICLE_PHOTO_MAX_BYTES, type Article, type ArticleFile, type InventoryMovement } from "@aabhushan/contracts";
import { Image01 } from "@untitledui/icons";

import { FileUpload, getReadableFileSize } from "@/components/application/file-upload/file-upload-base";
import { ArticleDetailSkeleton, PanelSkeleton } from "@/components/application/skeleton/skeleton";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { MoneyText } from "@/components/shared/money-text";
import { SectionCard } from "@/components/shared/section-card";
import { SelectField } from "@/components/shared/select-field";
import { StaffPageHeader } from "@/components/shared/staff-page-header";
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
import { fetchFileAccessByObjectKey, uploadStaffFile } from "@/lib/staff-file-upload";
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
    return <ArticleDetailSkeleton showAdjustment={canWrite} label="Loading article" />;
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
      <StaffPageHeader
        title={<span className="font-mono">{article.article_number}</span>}
        description={secondaryLine}
        back={{ href: "/inventory", label: "Inventory" }}
        badge={
          <>
            <Badge color={articleStatusColor(article.status)} size="sm">
              {articleStatusLabel(article.status)}
            </Badge>
            <Badge color="gray" size="sm" type="modern">
              {article.sellable ? "Sellable" : "Not sellable"}
            </Badge>
          </>
        }
        actions={
          canWrite && !sold ? (
            <Button color="secondary" size="md" href={`/inventory/${article.id}/edit`}>
              Edit article
            </Button>
          ) : null
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(16rem,20rem)_1fr_minmax(16rem,20rem)]">
        <PieceRail
          articleId={article.id}
          files={article.files}
          barcode={article.barcode}
          canWrite={canWrite}
          onPrintTag={() => router.push(tagPrintHref({ ids: [article.id], kind: "initial" }))}
          onReprint={() => setShowReprint(true)}
          onUploaded={() => {
            void queryClient.invalidateQueries({
              queryKey: ["inventory", "article", staff.membership.organization_id, articleId],
            });
          }}
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
        <SectionCard
          as="section"
          title={underReview ? "Inspection release" : "Adjustment"}
          description={
            underReview
              ? "Release back to available stock or keep the piece unavailable. This is a stock movement, not a sale."
              : "Needs a reason. Changes stay in article history."
          }
        >
          <div className="flex flex-col gap-4">
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
        </SectionCard>
      ) : null}

      {sold ? (
        <p className="text-sm text-tertiary">
          Sold identity and weights cannot be edited here. Use a return or stock adjustment to correct them.
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

function PieceRail({
  articleId,
  files,
  barcode,
  canWrite,
  onPrintTag,
  onReprint,
  onUploaded,
}: {
  articleId: string;
  files: ArticleFile[];
  barcode: string | null;
  canWrite: boolean;
  onPrintTag: () => void;
  onReprint: () => void;
  onUploaded: () => void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const primary = files[0] ?? null;

  useEffect(() => {
    let cancelled = false;
    setPreviewUrl(null);
    if (!primary) {
      return;
    }
    void (async () => {
      try {
        const access = await fetchFileAccessByObjectKey(await inventoryAccessToken(), primary.object_key);
        if (!cancelled) {
          setPreviewUrl(access.url);
        }
      } catch {
        if (!cancelled) {
          setPreviewUrl(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [primary?.object_key]);

  return (
    <SectionCard as="section" title="Photograph">
      <div className="flex flex-col gap-3">
        <div className="flex aspect-square flex-col items-center justify-center overflow-hidden rounded-lg bg-secondary ring-1 ring-secondary">
          {previewUrl ? (
            <img src={previewUrl} alt={primary?.original_filename ?? "Article photograph"} className="size-full object-cover" />
          ) : files.length === 0 ? (
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
        <p className="text-xs text-tertiary">Photos open with a short-lived private link.</p>

        {canWrite && files.length === 0 ? (
          <>
            <FileUpload.Root>
              <FileUpload.DropZone
                className="py-3"
                accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                allowsMultiple={false}
                maxSize={ARTICLE_PHOTO_MAX_BYTES}
                hint={`JPEG, PNG, or WebP (max. ${getReadableFileSize(ARTICLE_PHOTO_MAX_BYTES)}).`}
                onDropFiles={(dropped) => {
                  const file = dropped[0];
                  if (!file) {
                    return;
                  }
                  setUploadError(null);
                  setUploading(true);
                  void (async () => {
                    try {
                      await uploadStaffFile({
                        accessToken: await inventoryAccessToken(),
                        ownerType: "article",
                        ownerId: articleId,
                        file,
                        purpose: "photograph",
                      });
                      onUploaded();
                    } catch (error) {
                      setUploadError(inventoryErrorMessage(error));
                    } finally {
                      setUploading(false);
                    }
                  })();
                }}
                onDropUnacceptedFiles={() => setUploadError("Use JPEG, PNG, or WebP.")}
                onSizeLimitExceed={() => setUploadError("Photograph is too large. Maximum size is 5 MB.")}
              />
            </FileUpload.Root>
            {uploading ? <p className="text-sm text-tertiary">Uploading…</p> : null}
            {uploadError ? <p className="text-sm text-error-primary">{uploadError}</p> : null}
          </>
        ) : null}

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
                {barcode ? (
                  <Button color="primary" size="sm" onPress={onReprint}>
                    Reprint tag
                  </Button>
                ) : (
                  <Button color="primary" size="sm" onPress={onPrintTag}>
                    Print tag
                  </Button>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </SectionCard>
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
    <SectionCard as="section" title="Specification">
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
          <div>
            <p className="text-xs font-semibold text-quaternary">Acquisition cost</p>
            {article.acquisition_cost_inr ? (
              <MoneyText
                amount={article.acquisition_cost_inr}
                as="p"
                className="mt-0.5 text-sm font-medium text-primary"
              />
            ) : (
              <p className="mt-0.5 text-sm font-medium text-quaternary">Not recorded</p>
            )}
            <p className="mt-0.5 text-xs text-tertiary">Internal only — never a customer-facing price.</p>
          </div>
        </SpecSection>
      </div>
    </SectionCard>
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
    <SectionCard as="section" title="Movement history" className="h-fit">
      {isLoading ? <PanelSkeleton rows={4} showTitle={false} chrome="bare" label="Loading history" /> : null}
      {isError ? <p className="text-sm text-error-primary">{inventoryErrorMessage(error)}</p> : null}
      {!isLoading && !isError && items.length === 0 ? (
        <p className="text-sm text-tertiary">No movements recorded yet.</p>
      ) : null}
      {!isLoading && items.length > 0 ? (
        <div className="max-h-112 overflow-y-auto">
          <ol className="relative ml-2 flex flex-col gap-3 border-l border-secondary pl-4">
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
        </div>
      ) : null}
    </SectionCard>
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
