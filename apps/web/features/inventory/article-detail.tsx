"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ARTICLE_PHOTO_MAX_BYTES, type Article, type ArticleFile, type InventoryMovement } from "@aabhushan/contracts";
import { Image01 } from "@untitledui/icons";

import { FileUpload, getReadableFileSize } from "@/components/application/file-upload/file-upload-base";
import { ArticleDetailSkeleton, PanelSkeleton } from "@/components/application/skeleton/skeleton";
import { useStaffToast } from "@/components/application/toast/staff-toast";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { TextArea } from "@/components/base/textarea/textarea";
import { FormDialog } from "@/components/shared/form-dialog";
import { MoneyText } from "@/components/shared/money-text";
import { SectionCard } from "@/components/shared/section-card";
import { SegmentedField } from "@/components/shared/segmented-field";
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
  sellableBadgeColor,
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
  const toast = useStaffToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const allowed = staffHasPermission(staff, "inventory.read");
  const canWrite = staffHasPermission(staff, "inventory.write");
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [toStatus, setToStatus] = useState<"available" | "unavailable">("unavailable");
  const [locationId, setLocationId] = useState("");
  const [releaseStatus, setReleaseStatus] = useState<"available" | "unavailable">("available");
  const [reprintReason, setReprintReason] = useState("");
  const [reprintReasonError, setReprintReasonError] = useState<string | null>(null);
  const [showReprint, setShowReprint] = useState(false);
  const reprintReasonRef = useRef<HTMLInputElement>(null);

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

  function resetAdjustFields(next?: Article) {
    const current = next ?? article;
    if (!current) {
      return;
    }
    setReason("");
    setReasonError(null);
    setLocationId(current.location_id ?? "");
    setToStatus(current.status === "available" ? "unavailable" : "available");
    setReleaseStatus("available");
  }

  useEffect(() => {
    if (article && !adjustOpen) {
      setReason("");
      setReasonError(null);
      setLocationId(article.location_id ?? "");
      setToStatus(article.status === "available" ? "unavailable" : "available");
      setReleaseStatus("available");
    }
  }, [article, adjustOpen]);

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
      setAdjustOpen(false);
      resetAdjustFields();
      toast.success("Adjustment recorded");
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
      setAdjustOpen(false);
      resetAdjustFields();
      toast.success("Released from inspection");
      await queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
  });

  if (!allowed) {
    return null;
  }

  if (articleQuery.isLoading) {
    return <ArticleDetailSkeleton label="Loading article" />;
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
  const metalPurity = `${metalLabel} ${article.purity}`;
  const netLabel = formatGrams(article.net_metal_weight_grams);
  const secondaryLine = article.category_name;
  const ageDays = ageingDaysFromReceipt(article.receipt_business_date);
  const ageLabel = ageDays === 1 ? "1 day" : `${ageDays} days`;
  const pending = adjustMutation.isPending || releaseMutation.isPending;
  const nonMetalQuiet = Number(article.non_metal_weight_grams) === 0;

  function openAdjust() {
    resetAdjustFields(article);
    adjustMutation.reset();
    releaseMutation.reset();
    setAdjustOpen(true);
  }

  function closeAdjust() {
    if (pending) {
      return;
    }
    setAdjustOpen(false);
    resetAdjustFields();
    adjustMutation.reset();
    releaseMutation.reset();
  }

  function confirmAdjust() {
    if (underReview) {
      releaseMutation.mutate();
      return;
    }
    if (!reason.trim()) {
      setReasonError("Enter a reason for the audit record.");
      return;
    }
    setReasonError(null);
    adjustMutation.mutate();
  }

  const afterLocationName =
    locationId === ""
      ? "Unspecified"
      : (locationsQuery.data?.items.find((item) => item.id === locationId)?.name ?? locationLabel);
  const afterSellable = toStatus === "available";
  const currentSellable = article.sellable;

  return (
    <section className="flex w-full flex-col gap-8">
      <StaffPageHeader
        title={<span className="font-mono">{article.article_number}</span>}
        description={secondaryLine}
        back={{ href: "/inventory", label: "Inventory" }}
        density="comfort"
        badge={
          <>
            <Badge color={articleStatusColor(article.status)} size="lg">
              {articleStatusLabel(article.status)}
            </Badge>
            <Badge color={sellableBadgeColor(article.sellable)} size="lg">
              {article.sellable ? "Sellable" : "Not sellable"}
            </Badge>
          </>
        }
        actions={
          canWrite ? (
            <>
              {article.barcode ? (
                <Button color="secondary" size="lg" onPress={() => setShowReprint(true)}>
                  Reprint tag
                </Button>
              ) : !sold ? (
                <Button
                  color="secondary"
                  size="lg"
                  onPress={() => router.push(tagPrintHref({ ids: [article.id], kind: "initial" }))}
                >
                  Print tag
                </Button>
              ) : null}
              {!sold ? (
                <Button color="primary" size="lg" href={`/inventory/${article.id}/edit`}>
                  Edit article
                </Button>
              ) : null}
              {!sold ? (
                <Button color="secondary" size="lg" onPress={openAdjust}>
                  {underReview ? "Release from inspection" : "Adjust stock"}
                </Button>
              ) : null}
            </>
          ) : null
        }
      />

      {sold ? (
        <div className="border-y border-primary py-3 text-sm text-tertiary">
          Sold identity and weights cannot be edited here. Use a return or stock adjustment to correct them.
          Reprint of the historical tag is allowed and keeps the same barcode.
        </div>
      ) : null}

      <FactBand
        metalPurity={metalPurity}
        gross={formatGrams(article.gross_weight_grams)}
        nonMetal={formatGrams(article.non_metal_weight_grams)}
        nonMetalQuiet={nonMetalQuiet}
        net={netLabel}
        location={locationLabel}
        ageingLabel={sold ? "Held for" : "Ageing"}
        ageing={ageLabel}
      />

      <div className="grid gap-7 xl:grid-cols-[280px_minmax(0,1fr)_280px]">
        <PieceRail
          articleId={article.id}
          articleNumber={article.article_number}
          metalPurity={metalPurity}
          netLabel={netLabel}
          files={article.files}
          barcode={article.barcode}
          canWrite={canWrite && !sold}
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

      <FormDialog
        isOpen={adjustOpen}
        modalClassName="max-w-lg"
        title={
          underReview
            ? "Release from inspection"
            : `Adjust stock · ${article.article_number}`
        }
        confirmLabel={underReview ? "Release from inspection" : "Record adjustment"}
        confirmColor="primary"
        isConfirming={pending}
        onCancel={closeAdjust}
        onConfirm={confirmAdjust}
        error={
          underReview
            ? releaseMutation.isError
              ? inventoryErrorMessage(releaseMutation.error)
              : undefined
            : adjustMutation.isError
              ? inventoryErrorMessage(adjustMutation.error)
              : undefined
        }
      >
        {underReview ? (
          <>
            <p className="text-sm text-tertiary">
              Release back to available stock or keep the piece unavailable. This is a stock movement, not a sale.
            </p>
            <SegmentedField
              label="Release to"
              value={releaseStatus}
              onChange={setReleaseStatus}
              options={[
                { label: "Available", value: "available" },
                { label: "Unavailable", value: "unavailable" },
              ]}
            />
            <TextArea label="Reason" value={reason} onChange={setReason} rows={3} />
          </>
        ) : (
          <>
            <p className="text-sm text-tertiary">Needs a reason. Changes stay in article history.</p>
            <SegmentedField
              label="Status after adjustment"
              value={toStatus}
              onChange={setToStatus}
              options={[
                {
                  label: article.status === "available" ? "Available (now)" : "Available",
                  value: "available",
                },
                {
                  label: article.status === "unavailable" ? "Unavailable (now)" : "Unavailable",
                  value: "unavailable",
                },
              ]}
            />
            <SelectField
              label="Location"
              value={locationId}
              onChange={setLocationId}
              isLoading={locationsQuery.isLoading}
              options={[
                { label: "Unspecified", value: "" },
                ...(locationsQuery.data?.items ?? []).map((item) => ({ label: item.name, value: item.id })),
              ]}
            />
            <TextArea
              label="Reason"
              value={reason}
              isRequired
              isInvalid={Boolean(reasonError)}
              error={reasonError ?? undefined}
              onChange={(value) => {
                setReason(value);
                setReasonError(null);
              }}
              rows={3}
            />
            <div className="overflow-hidden rounded-lg ring-1 ring-secondary">
              <div className="border-b border-secondary px-3 py-2 text-xs font-semibold tracking-wide text-quaternary uppercase">
                What will change
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-secondary text-left text-xs font-semibold tracking-wide text-quaternary uppercase">
                    <th className="px-3 py-2 font-semibold" />
                    <th className="px-3 py-2 font-semibold">Now</th>
                    <th className="px-3 py-2 font-semibold">After</th>
                  </tr>
                </thead>
                <tbody>
                  <ChangeRow
                    label="Status"
                    now={articleStatusLabel(
                      article.status === "available" || article.status === "unavailable"
                        ? article.status
                        : "available",
                    )}
                    after={articleStatusLabel(toStatus)}
                    changed={
                      (article.status === "available" || article.status === "unavailable"
                        ? article.status
                        : "available") !== toStatus
                    }
                  />
                  <ChangeRow
                    label="Sellable"
                    now={currentSellable ? "Yes" : "No"}
                    after={afterSellable ? "Yes" : "No"}
                    changed={currentSellable !== afterSellable}
                  />
                  <ChangeRow
                    label="Location"
                    now={locationLabel}
                    after={afterLocationName}
                    changed={locationLabel !== afterLocationName}
                  />
                </tbody>
              </table>
              <p className="border-t border-secondary px-3 py-2 text-xs text-tertiary">
                Adds an Adjustment entry to movement history.
              </p>
            </div>
          </>
        )}
      </FormDialog>

      <FormDialog
        isOpen={showReprint}
        title="Reprint tag"
        confirmLabel="Reprint tag"
        confirmColor="primary"
        initialFocusRef={reprintReasonRef}
        onConfirm={() => {
          const nextReason = reprintReason.trim();
          if (!nextReason) {
            setReprintReasonError("Enter a reason for the audit record.");
            reprintReasonRef.current?.focus();
            return;
          }
          setShowReprint(false);
          setReprintReasonError(null);
          router.push(tagPrintHref({ ids: [article.id], kind: "reprint", reason: nextReason }));
        }}
        onCancel={() => {
          setShowReprint(false);
          setReprintReason("");
          setReprintReasonError(null);
        }}
      >
        <p className="text-sm text-tertiary">
          The same barcode will be printed. A reason is required for the audit record.
        </p>
        <Input
          ref={reprintReasonRef}
          label="Reason"
          value={reprintReason}
          isRequired
          isInvalid={Boolean(reprintReasonError)}
          error={reprintReasonError ?? undefined}
          onChange={(value) => {
            setReprintReason(value);
            setReprintReasonError(null);
          }}
        />
      </FormDialog>
    </section>
  );
}

function FactBand({
  metalPurity,
  gross,
  nonMetal,
  nonMetalQuiet,
  net,
  location,
  ageingLabel,
  ageing,
}: {
  metalPurity: string;
  gross: string;
  nonMetal: string;
  nonMetalQuiet: boolean;
  net: string;
  location: string;
  ageingLabel: string;
  ageing: string;
}) {
  return (
    <div className="grid grid-cols-2 overflow-hidden rounded-xl bg-primary ring-1 ring-secondary lg:grid-cols-6">
      <FactCell label="Metal · purity" value={metalPurity} />
      <FactCell label="Gross" value={gross} />
      <FactCell label="Non-metal" value={nonMetal} quiet={nonMetalQuiet} />
      <FactCell label="Net metal" value={net} inverted />
      <FactCell label="Location" value={location} />
      <FactCell label={ageingLabel} value={ageing} last />
    </div>
  );
}

function FactCell({
  label,
  value,
  inverted,
  quiet,
  last,
}: {
  label: string;
  value: string;
  inverted?: boolean;
  quiet?: boolean;
  last?: boolean;
}) {
  return (
    <div
      className={cx(
        "px-5 py-5",
        !last && "border-b border-secondary lg:border-r lg:border-b-0",
        inverted && "bg-primary-solid text-white",
      )}
    >
      <p
        className={cx(
          "text-sm font-semibold tracking-wide uppercase",
          inverted ? "text-white/70" : "text-quaternary",
        )}
      >
        {label}
      </p>
      <p
        className={cx(
          "mt-1.5 font-bold tabular-nums",
          inverted ? "text-xl text-white" : quiet ? "text-lg text-quaternary" : "text-lg text-primary",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function ChangeRow({
  label,
  now,
  after,
  changed,
}: {
  label: string;
  now: string;
  after: string;
  changed: boolean;
}) {
  return (
    <tr className="border-b border-secondary last:border-b-0">
      <td className="px-3 py-2 text-tertiary">{label}</td>
      <td className="px-3 py-2 text-primary">{now}</td>
      <td className={cx("px-3 py-2", changed ? "font-bold text-brand-secondary" : "text-primary")}>{after}</td>
    </tr>
  );
}

function PieceRail({
  articleId,
  articleNumber,
  metalPurity,
  netLabel,
  files,
  barcode,
  canWrite,
  onUploaded,
}: {
  articleId: string;
  articleNumber: string;
  metalPurity: string;
  netLabel: string;
  files: ArticleFile[];
  barcode: string | null;
  canWrite: boolean;
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

  const emptyDropzone = canWrite && files.length === 0;
  const stampId = barcode ?? articleNumber;

  return (
    <SectionCard as="section">
      <div className="flex flex-col gap-5">
        {emptyDropzone ? (
          <FileUpload.Root>
            <FileUpload.DropZone
              className="aspect-[4/3] py-6"
              accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
              allowsMultiple={false}
              maxSize={ARTICLE_PHOTO_MAX_BYTES}
              hint={`Drop a JPEG, PNG or WebP here, or choose file · max ${getReadableFileSize(ARTICLE_PHOTO_MAX_BYTES)}`}
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
        ) : (
          <div className="flex aspect-[4/3] flex-col items-center justify-center overflow-hidden rounded-lg bg-secondary ring-1 ring-secondary">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt={primary?.original_filename ?? "Article photograph"}
                className="size-full object-cover"
              />
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
        )}
        <p className="text-sm text-tertiary">Photos open with a short-lived private link.</p>
        {uploading ? <p className="text-sm text-tertiary">Uploading…</p> : null}
        {uploadError ? <p className="text-sm text-error-primary">{uploadError}</p> : null}

        <div className="border-t border-secondary pt-4">
          <p className="text-sm font-semibold tracking-wide text-primary uppercase">Printed tag</p>
          {barcode ? (
            <div className="mt-2.5 rounded-lg bg-secondary p-5">
              <p className="font-mono text-lg font-semibold text-primary break-all">{stampId}</p>
              <p className="mt-1.5 text-base text-tertiary">
                {metalPurity} · {netLabel}
              </p>
              <p className="mt-2.5 text-sm text-tertiary">Printer not confirmed. A preview is not a physical tag.</p>
            </div>
          ) : (
            <p className="mt-2.5 text-base text-tertiary">Barcode is assigned when the piece is tagged.</p>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

function SpecificationGrid({ article }: { article: Article }) {
  const hasStones = article.stones.length > 0;
  const stonesSummary = hasStones
    ? article.stones
        .map((stone) =>
          stone.weight_grams ? `${stone.description} · ${formatGrams(stone.weight_grams)}` : stone.description,
        )
        .join("; ")
    : null;
  const metalLabel = article.metal.charAt(0).toUpperCase() + article.metal.slice(1);

  return (
    <SectionCard as="section" title="Specification">
      <div className="flex flex-col">
        <div className="grid gap-8 md:grid-cols-2 md:gap-10">
          <SpecSection title="Identity" first>
            <SpecRow label="Category" value={article.category_name} />
            <SpecRow label="Metal" value={metalLabel} />
            <SpecRow label="Purity" value={article.purity} />
            <SpecRow
              label="Barcode"
              value={article.barcode ?? "Assigned when tagged"}
              mono={Boolean(article.barcode)}
              empty={!article.barcode}
            />
            <SpecRow label="HUID" value={article.huid ?? "—"} mono={Boolean(article.huid)} empty={!article.huid} />
            {!hasStones ? (
              <p className="py-2.5 text-lg text-quaternary">Stones · None</p>
            ) : null}
          </SpecSection>

          <SpecSection title="Weights" first>
            <SpecRow label="Gross" value={formatGrams(article.gross_weight_grams)} />
            <SpecRow label="Non-metal" value={formatGrams(article.non_metal_weight_grams)} />
            <SpecRow label="Net metal" value={formatGrams(article.net_metal_weight_grams)} />
          </SpecSection>
        </div>

        {hasStones && stonesSummary ? (
          <SpecSection title="Stones">
            <SpecRow label="Stones" value={stonesSummary} />
          </SpecSection>
        ) : null}

        <SpecSection title="Source and place">
          <SpecRow label="Supplier" value={article.supplier_ref ?? "—"} empty={!article.supplier_ref} />
          <SpecRow label="Karigar" value={article.karigar_ref ?? "—"} empty={!article.karigar_ref} />
          <SpecRow label="Receipt date" value={article.receipt_business_date} />
          <div className="flex gap-4 py-2.5">
            <p className="w-40 shrink-0 text-base text-tertiary">Acquisition cost</p>
            <div className="min-w-0 flex-1">
              {article.acquisition_cost_inr ? (
                <MoneyText amount={article.acquisition_cost_inr} as="p" className="text-lg font-medium text-primary" />
              ) : (
                <p className="text-lg font-medium text-quaternary">Not recorded</p>
              )}
              <p className="mt-0.5 text-sm text-tertiary">Internal only — never a customer-facing price.</p>
            </div>
          </div>
        </SpecSection>
      </div>
    </SectionCard>
  );
}

function SpecSection({ title, children, first }: { title: string; children: ReactNode; first?: boolean }) {
  return (
    <div className={cx(!first && "mt-5 border-t border-secondary pt-5")}>
      <p className="text-sm font-semibold tracking-wide text-brand-secondary uppercase">{title}</p>
      <div className="mt-2.5 flex flex-col">{children}</div>
    </div>
  );
}

function SpecRow({
  label,
  value,
  mono,
  empty,
}: {
  label: string;
  value: string;
  mono?: boolean;
  empty?: boolean;
}) {
  return (
    <div className="flex gap-4 py-2.5">
      <p className="w-40 shrink-0 text-base text-tertiary">{label}</p>
      <p
        className={cx(
          "min-w-0 flex-1 text-lg font-medium",
          empty ? "text-quaternary" : "text-primary",
          mono && "font-mono",
        )}
      >
        {value}
      </p>
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
          <ol className="relative ml-2 flex flex-col gap-4 border-l border-secondary pl-4">
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
                      "absolute top-1.5 -left-5.25 size-2.5 rounded-sm ring-2 ring-primary",
                      movementTypeDotClass(item.movement_type),
                    )}
                    aria-hidden="true"
                  />
                  <p className="text-lg font-semibold text-primary">{movementTypeLabel(item.movement_type)}</p>
                  {statusChange ? <p className="text-base text-tertiary">{statusChange}</p> : null}
                  {item.reason ? <p className="mt-0.5 text-base text-secondary">{item.reason}</p> : null}
                  <p className="mt-1.5 text-sm text-quaternary">
                    {new Date(item.created_at).toLocaleString("en-IN", {
                      timeZone: "Asia/Kolkata",
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                      hour12: true,
                    })}
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
