"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ARTICLE_PHOTO_MAX_BYTES, type Metal } from "@aabhushan/contracts";
import { netMetalWeightGrams, netMetalWeightIsPositive } from "@aabhushan/domain";
import { Image01 } from "@untitledui/icons";

import { FileUpload, getReadableFileSize } from "@/components/application/file-upload/file-upload-base";
import { FormSkeleton } from "@/components/application/skeleton/skeleton";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { SectionCard } from "@/components/shared/section-card";
import { SelectField } from "@/components/shared/select-field";
import { StaffPageHeader } from "@/components/shared/staff-page-header";
import { StickyFormActions } from "@/components/shared/sticky-form-actions";
import { staffHasPermission, useStaff } from "@/features/auth/staff-shell";
import {
  fieldError,
  inventoryAccessToken,
  inventoryErrorMessage,
  tagPrintHref,
} from "@/features/inventory/inventory-shared";
import {
  fetchArticle,
  fetchCatalogueCategories,
  fetchStorageLocations,
  patchArticleRequest,
  StaffApiError,
} from "@/lib/staff-api";
import { fetchFileAccessByObjectKey, uploadStaffFile } from "@/lib/staff-file-upload";
import { cx } from "@/utils/cx";

const WEIGHT_PATTERN = /^\d+(\.\d{1,4})?$/;

export function EditArticleForm({ articleId }: { articleId: string }) {
  const staff = useStaff();
  const router = useRouter();
  const queryClient = useQueryClient();
  const allowed = staffHasPermission(staff, "inventory.write");

  const [categoryId, setCategoryId] = useState("");
  const [metal, setMetal] = useState<Metal>("gold");
  const [metalTouched, setMetalTouched] = useState(false);
  const [purity, setPurity] = useState("");
  const [gross, setGross] = useState("");
  const [nonMetal, setNonMetal] = useState("0");
  const [huid, setHuid] = useState("");
  const [supplierRef, setSupplierRef] = useState("");
  const [karigarRef, setKarigarRef] = useState("");
  const [locationId, setLocationId] = useState("");
  const [rowVersion, setRowVersion] = useState(1);
  const [barcode, setBarcode] = useState<string | null>(null);
  const [articleNumber, setArticleNumber] = useState("");
  const [existingObjectKey, setExistingObjectKey] = useState<string | null>(null);
  const [existingFilename, setExistingFilename] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [replacingPhoto, setReplacingPhoto] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const [prefillDone, setPrefillDone] = useState(false);
  const [showPostSave, setShowPostSave] = useState(false);
  const [showReprint, setShowReprint] = useState(false);
  const [reprintReason, setReprintReason] = useState("");
  const [savedArticleId, setSavedArticleId] = useState<string | null>(null);
  const [stampBaseline, setStampBaseline] = useState<{
    metal: Metal;
    purity: string;
    gross_weight_grams: string;
    non_metal_weight_grams: string;
    net_metal_weight_grams: string;
  } | null>(null);
  const [fieldBaseline, setFieldBaseline] = useState<{
    categoryId: string;
    metal: Metal;
    purity: string;
    gross: string;
    nonMetal: string;
    huid: string;
    supplierRef: string;
    karigarRef: string;
    locationId: string;
  } | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);

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

  const categories = useQuery({
    queryKey: ["inventory", "categories", staff.membership.organization_id],
    queryFn: async () => fetchCatalogueCategories(await inventoryAccessToken()),
    enabled: allowed,
  });
  const locations = useQuery({
    queryKey: ["inventory", "locations", staff.membership.organization_id],
    queryFn: async () => fetchStorageLocations(await inventoryAccessToken()),
    enabled: allowed,
  });

  useEffect(() => {
    const article = articleQuery.data;
    if (!article || prefillDone) {
      return;
    }
    if (article.status === "sold") {
      router.replace(`/inventory/${article.id}`);
      return;
    }
    setArticleNumber(article.article_number);
    setBarcode(article.barcode);
    setRowVersion(article.row_version);
    setCategoryId(article.category_id);
    setMetal(article.metal);
    setPurity(article.purity);
    setGross(article.gross_weight_grams);
    setNonMetal(article.non_metal_weight_grams);
    setHuid(article.huid ?? "");
    setSupplierRef(article.supplier_ref ?? "");
    setKarigarRef(article.karigar_ref ?? "");
    setLocationId(article.location_id ?? "");
    setStampBaseline({
      metal: article.metal,
      purity: article.purity,
      gross_weight_grams: article.gross_weight_grams,
      non_metal_weight_grams: article.non_metal_weight_grams,
      net_metal_weight_grams: article.net_metal_weight_grams,
    });
    setFieldBaseline({
      categoryId: article.category_id,
      metal: article.metal,
      purity: article.purity,
      gross: article.gross_weight_grams,
      nonMetal: article.non_metal_weight_grams,
      huid: article.huid ?? "",
      supplierRef: article.supplier_ref ?? "",
      karigarRef: article.karigar_ref ?? "",
      locationId: article.location_id ?? "",
    });
    const primary = article.files[0] ?? null;
    setExistingObjectKey(primary?.object_key ?? null);
    setExistingFilename(primary?.original_filename ?? null);
    setReplacingPhoto(!primary);
    setPhotoFile(null);
    setPhotoError(null);
    setPrefillDone(true);
  }, [articleQuery.data, prefillDone, router]);

  useEffect(() => {
    let cancelled = false;
    setPreviewUrl(null);
    if (!existingObjectKey || photoFile) {
      return;
    }
    void (async () => {
      try {
        const access = await fetchFileAccessByObjectKey(await inventoryAccessToken(), existingObjectKey);
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
  }, [existingObjectKey, photoFile]);

  const activeCategories = categories.data?.items.filter((item) => item.is_active) ?? [];
  const hasCategories = activeCategories.length > 0;

  const computedNet = useMemo(() => {
    const grossValue = gross.trim();
    const nonMetalValue = (nonMetal.trim() || "0").trim();
    if (!WEIGHT_PATTERN.test(grossValue) || !WEIGHT_PATTERN.test(nonMetalValue)) {
      return null;
    }
    try {
      if (!netMetalWeightIsPositive({ grossWeightGrams: grossValue, nonMetalWeightGrams: nonMetalValue })) {
        return null;
      }
      return netMetalWeightGrams(grossValue, nonMetalValue);
    } catch {
      return null;
    }
  }, [gross, nonMetal]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!categoryId) {
        throw new StaffApiError(422, "VALIDATION_ERROR", "Choose a category.", [
          { field: "category_id", message: "Category is required." },
        ]);
      }
      if (!computedNet) {
        throw new StaffApiError(422, "VALIDATION_ERROR", "Enter valid weights.", [
          {
            field: "net_metal_weight_grams",
            message: "Net metal must equal gross minus non-metal and be greater than zero.",
          },
        ]);
      }
      const token = await inventoryAccessToken();
      const updated = await patchArticleRequest(token, articleId, {
        row_version: rowVersion,
        category_id: categoryId,
        metal,
        purity: purity.trim(),
        gross_weight_grams: gross.trim(),
        non_metal_weight_grams: nonMetal.trim() || "0",
        net_metal_weight_grams: computedNet,
        huid: huid.trim() ? huid.trim() : null,
        supplier_ref: supplierRef.trim() ? supplierRef.trim() : null,
        karigar_ref: karigarRef.trim() ? karigarRef.trim() : null,
        location_id: locationId ? locationId : null,
      });
      if (photoFile) {
        await uploadStaffFile({
          accessToken: token,
          ownerType: "article",
          ownerId: updated.id,
          file: photoFile,
          purpose: "photograph",
        });
      }
      return updated;
    },
    onSuccess: async (updated) => {
      setRowVersion(updated.row_version);
      setBarcode(updated.barcode);
      setPhotoFile(null);
      await queryClient.invalidateQueries({ queryKey: ["inventory"] });
      setSavedArticleId(updated.id);
      const stampChanged =
        stampBaseline !== null &&
        (updated.metal !== stampBaseline.metal ||
          updated.purity !== stampBaseline.purity ||
          updated.gross_weight_grams !== stampBaseline.gross_weight_grams ||
          updated.non_metal_weight_grams !== stampBaseline.non_metal_weight_grams ||
          updated.net_metal_weight_grams !== stampBaseline.net_metal_weight_grams);
      if (stampChanged) {
        setShowPostSave(true);
        return;
      }
      router.push(`/inventory/${updated.id}`);
    },
  });

  function onCategoryChange(value: string) {
    setCategoryId(value);
    const selected = activeCategories.find((item) => item.id === value);
    if (!metalTouched && selected?.default_metal) {
      setMetal(selected.default_metal);
    }
  }

  const formDirty = useMemo(() => {
    if (!fieldBaseline) {
      return false;
    }
    if (photoFile) {
      return true;
    }
    return (
      categoryId !== fieldBaseline.categoryId ||
      metal !== fieldBaseline.metal ||
      purity !== fieldBaseline.purity ||
      gross !== fieldBaseline.gross ||
      nonMetal !== fieldBaseline.nonMetal ||
      huid !== fieldBaseline.huid ||
      supplierRef !== fieldBaseline.supplierRef ||
      karigarRef !== fieldBaseline.karigarRef ||
      locationId !== fieldBaseline.locationId
    );
  }, [
    categoryId,
    fieldBaseline,
    gross,
    huid,
    karigarRef,
    locationId,
    metal,
    nonMetal,
    photoFile,
    purity,
    supplierRef,
  ]);

  function goToDetail() {
    router.push(`/inventory/${savedArticleId ?? articleId}`);
  }

  function requestLeave() {
    if (mutation.isPending) {
      router.push(`/inventory/${articleId}`);
      return;
    }
    if (formDirty) {
      setDiscardOpen(true);
      return;
    }
    router.push(`/inventory/${articleId}`);
  }

  if (!allowed) {
    return null;
  }

  if (articleQuery.isLoading || categories.isLoading || locations.isLoading || !prefillDone) {
    return (
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-5">
        <StaffPageHeader
          title="Edit article"
          description="Update identity, weights, source, location, and photograph. Article number and barcode stay permanent."
          back={{ href: `/inventory/${articleId}`, label: "Article" }}
        />
        <FormSkeleton sections={3} fieldsPerSection={4} showStickyActions label="Loading article" />
      </section>
    );
  }

  if (articleQuery.isError) {
    return (
      <section className="flex flex-col gap-3">
        <p className="text-sm text-error-primary">{inventoryErrorMessage(articleQuery.error)}</p>
        <Button color="secondary" size="md" href="/inventory">
          Back to inventory
        </Button>
      </section>
    );
  }

  const mutationError = mutation.error;
  const staleVersion =
    mutationError instanceof StaffApiError && mutationError.code === "STALE_VERSION";
  const categoryFieldError = fieldError(mutationError, "category_id");
  const purityFieldError = fieldError(mutationError, "purity");
  const grossFieldError = fieldError(mutationError, "gross_weight_grams");
  const nonMetalFieldError = fieldError(mutationError, "non_metal_weight_grams");
  const netFieldError = fieldError(mutationError, "net_metal_weight_grams");
  const locationFieldError = fieldError(mutationError, "location_id");
  const netInvalid = Boolean(netFieldError) || (Boolean(gross.trim()) && computedNet === null);
  const formLevelError =
    mutation.isError &&
    !(categoryFieldError || purityFieldError || grossFieldError || nonMetalFieldError || netFieldError || locationFieldError)
      ? inventoryErrorMessage(mutationError)
      : clientError;
  const hasExistingPhoto = Boolean(existingObjectKey || existingFilename);
  const showPhotoDropzone = replacingPhoto || !hasExistingPhoto;

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <StaffPageHeader
        title="Edit article"
        description="Update identity, weights, source, location, and photograph. Article number and barcode stay permanent."
        back={{ label: articleNumber || "Article", onPress: requestLeave }}
      />

      <form
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          setClientError(null);
          mutation.reset();
          if (!hasCategories) {
            setClientError("No catalogue categories are available for this shop.");
            return;
          }
          if (!computedNet) {
            setClientError("Enter gross and non-metal weights so net metal can be calculated.");
            return;
          }
          mutation.mutate();
        }}
      >
        <SectionCard title="Identification" description="Category, metal, purity, and optional HUID.">
          <div className="grid gap-4 md:grid-cols-2">
            <Input label="Article number" value={articleNumber} isReadOnly onChange={() => undefined} />
            <Input
              label="Barcode"
              value={barcode ?? "Assigned when tagged"}
              isReadOnly
              onChange={() => undefined}
            />
            <SelectField
              label="Category"
              value={categoryId}
              onChange={onCategoryChange}
              placeholder="Select category"
              isRequired
              isDisabled={!hasCategories}
              isInvalid={Boolean(categoryFieldError)}
              hint={categoryFieldError}
              options={activeCategories.map((item) => ({
                label: item.name,
                value: item.id,
              }))}
            />
            <SelectField
              label="Metal"
              value={metal}
              onChange={(value) => {
                setMetalTouched(true);
                setMetal(value as Metal);
              }}
              options={[
                { label: "Gold", value: "gold" },
                { label: "Silver", value: "silver" },
              ]}
            />
            <Input
              label="Purity"
              value={purity}
              placeholder="e.g. 22K"
              isRequired
              isInvalid={Boolean(purityFieldError)}
              hint={purityFieldError}
              onChange={setPurity}
            />
            <Input label="HUID" value={huid} tooltip="Optional until category rules are confirmed." onChange={setHuid} />
          </div>
        </SectionCard>

        <SectionCard title="Weights" description="Net metal is gross minus non-metal. The server rejects a mismatch.">
          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label="Gross weight (g)"
              value={gross}
              isRequired
              isInvalid={Boolean(grossFieldError)}
              hint={grossFieldError}
              onChange={setGross}
            />
            <Input
              label="Non-metal weight (g)"
              value={nonMetal}
              isInvalid={Boolean(nonMetalFieldError)}
              hint={nonMetalFieldError}
              onChange={setNonMetal}
            />
          </div>
          <div className={cx("rounded-lg bg-secondary px-3 py-3 ring-1 ring-secondary", netInvalid && "ring-error-primary")}>
            <Input
              label="Net metal weight (g)"
              value={computedNet ?? ""}
              isRequired
              isReadOnly
              isInvalid={netInvalid}
              hint={
                netFieldError ??
                (computedNet
                  ? `${gross.trim()} − ${nonMetal.trim() || "0"} = ${computedNet} g`
                  : "Calculated as gross minus non-metal.")
              }
              onChange={() => undefined}
            />
          </div>
        </SectionCard>

        <SectionCard title="Source and location" description="Reference fields only — not payables or job-work ledgers.">
          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label="Supplier reference"
              value={supplierRef}
              tooltip="Reference only, not a payable ledger."
              onChange={setSupplierRef}
            />
            <Input
              label="Karigar reference"
              value={karigarRef}
              tooltip="Reference only, not job-work accounting."
              onChange={setKarigarRef}
            />
            <SelectField
              label="Storage location"
              value={locationId}
              onChange={setLocationId}
              isDisabled={locations.isLoading}
              isInvalid={Boolean(locationFieldError)}
              hint={locationFieldError}
              options={[
                { label: "Unspecified", value: "" },
                ...(locations.data?.items ?? []).map((item) => ({ label: item.name, value: item.id })),
              ]}
            />
          </div>
        </SectionCard>

        <SectionCard title="Photograph" description="One current photograph. Replace only when you intend to change it; upload commits on save.">
          <div className="flex flex-col gap-3">
            <div className="flex aspect-video max-h-56 flex-col items-center justify-center overflow-hidden rounded-lg bg-secondary ring-1 ring-secondary">
              {photoFile ? (
                <p className="px-4 text-center text-sm text-tertiary">
                  Ready to upload {photoFile.name} ({getReadableFileSize(photoFile.size)}).
                </p>
              ) : !replacingPhoto && previewUrl ? (
                <img
                  src={previewUrl}
                  alt={existingFilename ?? "Article photograph"}
                  className="size-full object-contain"
                />
              ) : !replacingPhoto && existingFilename ? (
                <p className="px-4 text-center text-sm text-tertiary">{existingFilename} (preview unavailable)</p>
              ) : replacingPhoto && hasExistingPhoto ? (
                <p className="px-4 text-center text-sm text-tertiary">Choose a replacement photograph below.</p>
              ) : (
                <div className="flex flex-col items-center gap-2 px-4 text-center">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-primary ring-1 ring-secondary ring-inset">
                    <Image01 className="size-5 text-fg-quaternary" aria-hidden="true" />
                  </div>
                  <p className="text-sm font-semibold text-primary">No photograph yet</p>
                </div>
              )}
            </div>

            {hasExistingPhoto && !replacingPhoto ? (
              <Button
                color="secondary"
                size="md"
                aria-label="Replace photograph"
                onPress={() => {
                  setPhotoFile(null);
                  setPhotoError(null);
                  setReplacingPhoto(true);
                }}
              >
                Replace photograph
              </Button>
            ) : null}

            {showPhotoDropzone ? (
              <FileUpload.Root>
                <FileUpload.DropZone
                  className="py-4"
                  accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                  allowsMultiple={false}
                  maxSize={ARTICLE_PHOTO_MAX_BYTES}
                  hint="JPEG, PNG, or WebP (max. 5 MB). Uploaded privately after save."
                  onDropFiles={(files) => {
                    const file = files[0];
                    if (!file) {
                      return;
                    }
                    setPhotoError(null);
                    const contentType =
                      file.type === "image/png" || file.type === "image/webp" || file.type === "image/jpeg"
                        ? file.type
                        : null;
                    if (!contentType) {
                      setPhotoFile(null);
                      setPhotoError("Use JPEG, PNG, or WebP.");
                      return;
                    }
                    setPhotoFile(file);
                  }}
                  onDropUnacceptedFiles={() => {
                    setPhotoFile(null);
                    setPhotoError("Use JPEG, PNG, or WebP.");
                  }}
                  onSizeLimitExceed={() => {
                    setPhotoFile(null);
                    setPhotoError("Photograph is too large. Maximum size is 5 MB.");
                  }}
                />
              </FileUpload.Root>
            ) : null}

            {replacingPhoto && hasExistingPhoto ? (
              <Button
                color="secondary"
                size="md"
                onPress={() => {
                  setPhotoFile(null);
                  setPhotoError(null);
                  setReplacingPhoto(false);
                }}
              >
                Cancel replace
              </Button>
            ) : null}

            {photoError ? <p className="text-sm text-error-primary">{photoError}</p> : null}
          </div>
        </SectionCard>

        {staleVersion ? (
          <p className="rounded-lg bg-secondary px-3 py-2 text-sm text-error-primary ring-1 ring-secondary">
            This article was changed elsewhere. Reload the form and try again.
          </p>
        ) : null}
        {formLevelError && !staleVersion ? <p className="text-sm text-error-primary">{formLevelError}</p> : null}

        <StickyFormActions variant="bar">
          <Button type="submit" color="primary" size="md" isLoading={mutation.isPending} isDisabled={!hasCategories}>
            Save changes
          </Button>
          {staleVersion ? (
            <Button
              color="secondary"
              size="md"
              onPress={() => {
                setPrefillDone(false);
                mutation.reset();
                void articleQuery.refetch();
              }}
            >
              Reload
            </Button>
          ) : null}
          <Button color="secondary" size="md" onPress={requestLeave}>
            Cancel
          </Button>
        </StickyFormActions>
      </form>

      <ConfirmDialog
        isOpen={discardOpen}
        title="Discard changes?"
        message="Unsaved edits to this article will be lost."
        confirmLabel="Discard"
        confirmColor="primary-destructive"
        cancelLabel="Keep editing"
        onConfirm={() => {
          setDiscardOpen(false);
          router.push(`/inventory/${articleId}`);
        }}
        onCancel={() => setDiscardOpen(false)}
      />

      <ConfirmDialog
        isOpen={showPostSave && !showReprint}
        title="Article saved"
        confirmLabel={barcode ? "Reprint tag" : "Print tag"}
        confirmColor="primary"
        cancelLabel="Skip"
        message={
          barcode
            ? "Weights or metal/purity changed — reprint the tag with the same barcode, or skip and return to the article."
            : "Weights or metal/purity changed — assign a barcode and print a tag, or skip and return to the article."
        }
        onConfirm={() => {
          if (!savedArticleId) {
            return;
          }
          if (barcode) {
            setShowReprint(true);
            return;
          }
          setShowPostSave(false);
          router.push(tagPrintHref({ ids: [savedArticleId], kind: "initial" }));
        }}
        onCancel={() => {
          setShowPostSave(false);
          goToDetail();
        }}
      />

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
          if (!reason || !savedArticleId) {
            return;
          }
          setShowReprint(false);
          setShowPostSave(false);
          router.push(tagPrintHref({ ids: [savedArticleId], kind: "reprint", reason }));
        }}
        onCancel={() => {
          setShowReprint(false);
          setShowPostSave(false);
          setReprintReason("");
          goToDetail();
        }}
      />
    </section>
  );
}
