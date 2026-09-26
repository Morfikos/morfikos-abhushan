"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ARTICLE_PHOTO_MAX_BYTES, type Article, type Metal } from "@aabhushan/contracts";
import { Check, Image01 } from "@untitledui/icons";

import { FileUpload, getReadableFileSize } from "@/components/application/file-upload/file-upload-base";
import { FormSkeleton } from "@/components/application/skeleton/skeleton";
import { useStaffToast } from "@/components/application/toast/staff-toast";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { CatalogueCombobox } from "@/components/shared/catalogue-combobox";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormDialog } from "@/components/shared/form-dialog";
import { SegmentedField } from "@/components/shared/segmented-field";
import { SelectField } from "@/components/shared/select-field";
import { StaffPageHeader } from "@/components/shared/staff-page-header";
import { staffHasPermission, useStaff } from "@/features/auth/staff-shell";
import {
  ArticleChecklistCard,
  ArticlePreviewCard,
  FORM_CARD_CLASS,
  NumberedSection,
  RAIL_PRIMARY_DISABLED_CLASS,
  useWeightMath,
  WeightEquationRow,
} from "@/features/inventory/inventory-form-chrome";
import {
  fieldError,
  inventoryAccessToken,
  inventoryErrorMessage,
  metalBadgeColor,
  tagPrintHref,
} from "@/features/inventory/inventory-shared";
import {
  fetchArticle,
  fetchCatalogueCategories,
  fetchPurityLabels,
  fetchStorageLocations,
  patchArticleRequest,
  StaffApiError,
} from "@/lib/staff-api";
import { fetchFileAccessByObjectKey, uploadStaffFile } from "@/lib/staff-file-upload";
import { cx } from "@/utils/cx";

export function EditArticleForm({ articleId }: { articleId: string }) {
  const staff = useStaff();
  const toast = useStaffToast();
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
  const [stagedPreviewUrl, setStagedPreviewUrl] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [replacingPhoto, setReplacingPhoto] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [prefillDone, setPrefillDone] = useState(false);
  const [savedArticle, setSavedArticle] = useState<Article | null>(null);
  const [showReprint, setShowReprint] = useState(false);
  const [reprintReason, setReprintReason] = useState("");
  const [reprintReasonError, setReprintReasonError] = useState<string | null>(null);
  const reprintReasonRef = useRef<HTMLInputElement>(null);
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

  const categoryRef = useRef<HTMLDivElement>(null);
  const purityRef = useRef<HTMLDivElement>(null);
  const weightsRef = useRef<HTMLDivElement>(null);

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
  const purities = useQuery({
    queryKey: ["inventory", "purity-labels", staff.membership.organization_id],
    queryFn: async () => fetchPurityLabels(await inventoryAccessToken()),
    enabled: allowed,
  });
  const currentLocationId = articleQuery.data?.location_id ?? null;
  const locations = useQuery({
    queryKey: [
      "inventory",
      "locations",
      staff.membership.organization_id,
      "edit",
      currentLocationId ?? "none",
    ],
    queryFn: async () => {
      const token = await inventoryAccessToken();
      const active = await fetchStorageLocations(token);
      if (currentLocationId && !active.items.some((item) => item.id === currentLocationId)) {
        return fetchStorageLocations(token, { includeInactive: true });
      }
      return active;
    },
    enabled: allowed && Boolean(articleQuery.data),
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
    setMetalTouched(true);
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

  useEffect(() => {
    if (!photoFile) {
      setStagedPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(photoFile);
    setStagedPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  const activeCategories = categories.data?.items.filter((item) => item.is_active) ?? [];
  const hasCategories = activeCategories.length > 0;
  const selectedCategory = activeCategories.find((item) => item.id === categoryId);
  const categoryName = selectedCategory?.name ?? articleQuery.data?.category_name ?? "";
  const purityItems = useMemo(() => {
    const items = (purities.data?.items ?? []).map((item) => ({ id: item.label, label: item.label }));
    const current = purity.trim();
    if (current && !items.some((item) => item.id === current)) {
      return [{ id: current, label: current }, ...items];
    }
    return items;
  }, [purities.data, purity]);
  const locationItems = (locations.data?.items ?? []).map((item) => ({ id: item.id, label: item.name }));

  const weightMath = useWeightMath(gross, nonMetal);
  const computedNet = weightMath.net;

  const mutation = useMutation({
    mutationFn: async () => {
      if (!categoryId) {
        throw new StaffApiError(422, "VALIDATION_ERROR", "Choose a category.", [
          { field: "category_id", message: "Choose a category." },
        ]);
      }
      if (!purity.trim()) {
        throw new StaffApiError(422, "VALIDATION_ERROR", "Choose a purity.", [
          { field: "purity", message: "Choose a purity." },
        ]);
      }
      if (!computedNet) {
        throw new StaffApiError(422, "VALIDATION_ERROR", "Enter valid weights.", [
          {
            field: "net_metal_weight_grams",
            message: "Non-metal can't be more than gross. Net must be above zero.",
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
      setArticleNumber(updated.article_number);
      await queryClient.invalidateQueries({ queryKey: ["inventory"] });
      toast.success(`Article ${updated.article_number} saved`);
      const stampChanged =
        stampBaseline !== null &&
        (updated.metal !== stampBaseline.metal ||
          updated.purity !== stampBaseline.purity ||
          updated.gross_weight_grams !== stampBaseline.gross_weight_grams ||
          updated.non_metal_weight_grams !== stampBaseline.non_metal_weight_grams ||
          updated.net_metal_weight_grams !== stampBaseline.net_metal_weight_grams);
      if (stampChanged) {
        setSavedArticle(updated);
        setFieldBaseline({
          categoryId: updated.category_id,
          metal: updated.metal,
          purity: updated.purity,
          gross: updated.gross_weight_grams,
          nonMetal: updated.non_metal_weight_grams,
          huid: updated.huid ?? "",
          supplierRef: updated.supplier_ref ?? "",
          karigarRef: updated.karigar_ref ?? "",
          locationId: updated.location_id ?? "",
        });
        setStampBaseline({
          metal: updated.metal,
          purity: updated.purity,
          gross_weight_grams: updated.gross_weight_grams,
          non_metal_weight_grams: updated.non_metal_weight_grams,
          net_metal_weight_grams: updated.net_metal_weight_grams,
        });
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
    router.push(`/inventory/${savedArticle?.id ?? articleId}`);
  }

  function requestLeave() {
    if (mutation.isPending) {
      router.push(`/inventory/${articleId}`);
      return;
    }
    if (savedArticle) {
      goToDetail();
      return;
    }
    if (formDirty) {
      setDiscardOpen(true);
      return;
    }
    router.push(`/inventory/${articleId}`);
  }

  function jumpTo(ref: RefObject<HTMLElement | null>) {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    const focusable = ref.current?.querySelector<HTMLElement>("input, button, [tabindex]");
    focusable?.focus();
  }

  function trySave() {
    setSubmitted(true);
    setClientError(null);
    mutation.reset();
    if (!hasCategories) {
      setClientError("No catalogue categories are available for this shop.");
      return;
    }
    if (!categoryId || !purity.trim() || !computedNet) {
      return;
    }
    mutation.mutate();
  }

  if (!allowed) {
    return null;
  }

  if (
    articleQuery.isLoading ||
    categories.isLoading ||
    locations.isLoading ||
    purities.isLoading ||
    !prefillDone
  ) {
    return (
      <section className="flex w-full flex-col gap-5">
        <StaffPageHeader
          title="Edit article"
          description="Update identity, weights, source, location, and photograph. Article number and barcode stay permanent."
          back={{ href: `/inventory/${articleId}`, label: "Article" }}
          density="comfort"
        />
        <FormSkeleton layout="form-rail" label="Loading article" />
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
  const staleVersion = mutationError instanceof StaffApiError && mutationError.code === "STALE_VERSION";
  const categoryFieldError =
    fieldError(mutationError, "category_id") ??
    (submitted && !categoryId ? "Choose a category." : undefined);
  const purityFieldError =
    fieldError(mutationError, "purity") ?? (submitted && !purity.trim() ? "Choose a purity." : undefined);
  const grossFieldError = fieldError(mutationError, "gross_weight_grams");
  const nonMetalFieldError = fieldError(mutationError, "non_metal_weight_grams");
  const netFieldError = fieldError(mutationError, "net_metal_weight_grams");
  const locationFieldError = fieldError(mutationError, "location_id");

  const categoryOk = Boolean(categoryId);
  const purityOk = Boolean(purity.trim());
  const grossOk = Boolean(computedNet);
  const weightsBroken = weightMath.invalid || Boolean(netFieldError);

  const checklistItems = [
    {
      id: "category",
      label: "Category",
      ok: categoryOk,
      jumpLabel: "Go to category",
      jump: () => jumpTo(categoryRef),
    },
    {
      id: "purity",
      label: "Purity",
      ok: purityOk,
      jumpLabel: "Go to purity",
      jump: () => jumpTo(purityRef),
    },
    {
      id: "gross",
      label: weightsBroken ? "Weights don't add up" : "Weights",
      ok: grossOk && !weightsBroken,
      liveError: weightsBroken,
      jumpLabel: "Go to weights",
      jump: () => jumpTo(weightsRef),
    },
  ];
  const incompleteCount = checklistItems.filter((item) => !item.ok).length;
  const canSave = categoryOk && purityOk && grossOk && hasCategories && !mutation.isPending;

  const selectedLocationName = locationItems.find((item) => item.id === locationId)?.label;
  const previewDetailParts = [
    huid.trim() || null,
    supplierRef.trim() || null,
    karigarRef.trim() || null,
    selectedLocationName || null,
  ].filter((part): part is string => Boolean(part));
  const previewDetailLine = previewDetailParts.length > 0 ? previewDetailParts.join(" · ") : null;

  const networkFailure =
    mutation.isError && !(mutationError instanceof StaffApiError) ? "Not saved. Try again." : null;
  const formLevelError =
    networkFailure ??
    (mutation.isError &&
    mutationError instanceof StaffApiError &&
    !staleVersion &&
    !(
      categoryFieldError ||
      purityFieldError ||
      grossFieldError ||
      nonMetalFieldError ||
      netFieldError ||
      locationFieldError
    )
      ? inventoryErrorMessage(mutationError)
      : clientError);

  const hasExistingPhoto = Boolean(existingObjectKey || existingFilename);
  const showPhotoDropzone = replacingPhoto || !hasExistingPhoto;
  const railPhotoUrl = stagedPreviewUrl ?? (!replacingPhoto ? previewUrl : null);
  const locked = mutation.isPending || Boolean(savedArticle);
  const successMode = Boolean(savedArticle);

  return (
    <section className="flex w-full flex-col gap-8">
      <StaffPageHeader
        title="Edit article"
        description="Update identity, weights, source, location, and photograph. Article number and barcode stay permanent."
        back={{ label: articleNumber || "Article", onPress: requestLeave }}
        density="comfort"
      />

      <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_360px]">
        <form
          className={cx(
            FORM_CARD_CLASS,
            "flex flex-col gap-7",
            successMode && "pointer-events-none opacity-30",
          )}
          onSubmit={(event) => {
            event.preventDefault();
            trySave();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.ctrlKey && !event.metaKey) {
              const target = event.target as HTMLElement;
              if (target.tagName === "TEXTAREA") {
                return;
              }
              event.preventDefault();
            }
            if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
              event.preventDefault();
              trySave();
            }
          }}
        >
          {!hasCategories ? (
            <p className="rounded-lg bg-secondary px-3 py-2 text-sm text-error-primary ring-1 ring-secondary">
              No catalogue categories are available for this shop. Saving is disabled until categories exist.
            </p>
          ) : null}

          <NumberedSection number="01" title="Identification">
            <div className="flex flex-col gap-6">
              <div className="grid gap-6 md:grid-cols-2">
                <Input
                  label="Article number"
                  value={articleNumber}
                  isReadOnly
                  className="[&_input]:font-mono"
                  onChange={() => undefined}
                />
                <Input
                  label="Barcode"
                  value={barcode ?? "Assigned when tagged"}
                  isReadOnly
                  className={barcode ? "[&_input]:font-mono" : undefined}
                  onChange={() => undefined}
                />
              </div>
              <div ref={categoryRef}>
                <SelectField
                  label="Category"
                  value={categoryId}
                  onChange={onCategoryChange}
                  placeholder="Select category"
                  isRequired
                  isDisabled={!hasCategories || locked}
                  isInvalid={Boolean(categoryFieldError)}
                  error={categoryFieldError}
                  options={activeCategories.map((item) => ({
                    label: item.name,
                    value: item.id,
                  }))}
                />
              </div>
              <div className="grid gap-6 md:grid-cols-[auto_minmax(0,1fr)] md:items-end">
                <SegmentedField
                  label="Metal"
                  size="md"
                  value={metal}
                  isDisabled={locked}
                  onChange={(value) => {
                    setMetalTouched(true);
                    setMetal(value);
                  }}
                  options={[
                    { label: "Gold", value: "gold" },
                    { label: "Silver", value: "silver" },
                  ]}
                />
                <div ref={purityRef}>
                  <CatalogueCombobox
                    label="Purity"
                    value={purity}
                    onChange={setPurity}
                    placeholder="Search purity"
                    isRequired
                    isDisabled={locked}
                    isLoading={purities.isLoading}
                    isInvalid={Boolean(purityFieldError)}
                    error={purityFieldError}
                    items={purityItems}
                    emptyMessage="No purities yet. Add them in Settings → Catalogues."
                  />
                </div>
              </div>
              <div className="md:grid md:grid-cols-2">
                <Input label="HUID" value={huid} hint="Optional." isDisabled={locked} onChange={setHuid} />
              </div>
            </div>
          </NumberedSection>

          <NumberedSection number="02" title="Weights">
            <div ref={weightsRef}>
              <WeightEquationRow
                gross={gross}
                nonMetal={nonMetal}
                weightMath={weightMath}
                weightsBroken={weightsBroken}
                grossFieldError={grossFieldError}
                nonMetalFieldError={nonMetalFieldError}
                isDisabled={locked}
                onGrossChange={setGross}
                onNonMetalChange={setNonMetal}
              />
            </div>
          </NumberedSection>

          <NumberedSection number="03" title="Source and photograph">
            <div className="grid gap-6 md:grid-cols-2">
              <Input
                label="Supplier reference"
                value={supplierRef}
                tooltip="For your records. Not a payment."
                isDisabled={locked}
                onChange={setSupplierRef}
              />
              <Input
                label="Karigar reference"
                value={karigarRef}
                tooltip="For your records. Not job work."
                isDisabled={locked}
                onChange={setKarigarRef}
              />
              <CatalogueCombobox
                label="Storage location"
                value={locationId}
                onChange={setLocationId}
                placeholder="Search location"
                allowEmpty
                emptyLabel="Unspecified"
                isClearable
                isDisabled={locked}
                isLoading={locations.isLoading}
                isInvalid={Boolean(locationFieldError)}
                error={locationFieldError}
                items={locationItems}
              />
            </div>

            <div className="mt-5 flex flex-col gap-6 rounded-xl bg-secondary/40 p-6 ring-1 ring-secondary">
              <p className="text-sm font-semibold text-primary">Photograph</p>
              <p className="text-xs text-tertiary">
                One current photograph. Replace only when you intend to change it. Photo uploads when you save.
              </p>
              <div className="flex aspect-video max-h-56 flex-col items-center justify-center overflow-hidden rounded-lg bg-secondary ring-1 ring-secondary">
                {photoFile && stagedPreviewUrl ? (
                  <img src={stagedPreviewUrl} alt="" className="size-full object-contain" />
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
                  isDisabled={locked}
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
                    isDisabled={locked}
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

              {photoFile ? (
                <p className="text-sm text-tertiary">
                  Ready to upload {photoFile.name} ({getReadableFileSize(photoFile.size)}).
                </p>
              ) : null}

              {replacingPhoto && hasExistingPhoto ? (
                <Button
                  color="secondary"
                  size="md"
                  isDisabled={locked}
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
          </NumberedSection>
        </form>

        <aside className="flex flex-col gap-6 lg:sticky lg:top-4">
          {savedArticle ? (
            <EditSuccessCard
              article={savedArticle}
              onPrint={() => {
                if (savedArticle.barcode) {
                  setShowReprint(true);
                  return;
                }
                router.push(tagPrintHref({ ids: [savedArticle.id], kind: "initial" }));
              }}
              onOpenArticle={goToDetail}
            />
          ) : (
            <>
              <ArticlePreviewCard
                articleNumber={articleNumber || "—"}
                categoryName={categoryName || null}
                metal={metal}
                purity={purity}
                netMetalSigned={weightsBroken ? weightMath.signed : computedNet}
                weightsBroken={weightsBroken}
                photoUrl={railPhotoUrl}
                emptyPhotoLabel="No photograph"
                gross={gross}
                nonMetal={nonMetal}
                detailLine={previewDetailLine}
              />

              <div className="max-lg:sticky max-lg:bottom-0 max-lg:z-10 max-lg:border-t max-lg:border-secondary max-lg:bg-primary max-lg:pb-[max(0.75rem,env(safe-area-inset-bottom))] max-lg:pt-3">
                <ArticleChecklistCard
                  title="Before you save"
                  items={checklistItems}
                  readyLabel="Ready to save"
                  submitted={submitted}
                  formLevelError={
                    staleVersion
                      ? "This article was changed elsewhere. Reload the form and try again."
                      : formLevelError && !staleVersion
                        ? formLevelError
                        : null
                  }
                >
                  <Button
                    color="primary"
                    size="md"
                    className={cx("w-full", RAIL_PRIMARY_DISABLED_CLASS)}
                    isDisabled={!canSave && !mutation.isPending}
                    isLoading={mutation.isPending}
                    onPress={trySave}
                  >
                    {mutation.isPending ? "Saving…" : "Save changes"}
                  </Button>
                  {!submitted && incompleteCount > 0 ? (
                    <p className="text-xs text-tertiary">
                      {incompleteCount} field{incompleteCount === 1 ? "" : "s"} left
                    </p>
                  ) : null}
                  {staleVersion ? (
                    <Button
                      color="secondary"
                      size="md"
                      className="w-full"
                      onPress={() => {
                        setPrefillDone(false);
                        setSubmitted(false);
                        mutation.reset();
                        void articleQuery.refetch();
                      }}
                    >
                      Reload
                    </Button>
                  ) : null}
                  <Button color="link-gray" size="md" onPress={requestLeave}>
                    Cancel
                  </Button>
                </ArticleChecklistCard>
              </div>
            </>
          )}
        </aside>
      </div>

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

      <FormDialog
        isOpen={showReprint}
        title="Reprint tag"
        confirmLabel="Reprint tag"
        confirmColor="primary"
        initialFocusRef={reprintReasonRef}
        onConfirm={() => {
          const reason = reprintReason.trim();
          if (!reason || !savedArticle) {
            if (!reason) {
              setReprintReasonError("Enter a reason for the audit record.");
              reprintReasonRef.current?.focus();
            }
            return;
          }
          setShowReprint(false);
          setReprintReasonError(null);
          router.push(tagPrintHref({ ids: [savedArticle.id], kind: "reprint", reason }));
        }}
        onCancel={() => {
          setShowReprint(false);
          setReprintReason("");
          setReprintReasonError(null);
          goToDetail();
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

function EditSuccessCard({
  article,
  onPrint,
  onOpenArticle,
}: {
  article: Article;
  onPrint: () => void;
  onOpenArticle: () => void;
}) {
  const metalLabel = article.metal === "gold" ? "Gold" : "Silver";
  return (
    <div className="overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
      <div className="flex items-center gap-2 bg-primary-solid px-4 py-3 text-sm font-semibold text-white">
        <span>Saved</span>
        <span className="inline-flex items-center gap-1">
          <Check className="size-3.5" aria-hidden="true" />
          {article.barcode ? "Reprint available" : "Print tag next"}
        </span>
      </div>
      <div className="flex flex-col gap-3 p-4">
        <p className="font-mono text-xl font-bold text-primary">{article.article_number}</p>
        <p className="text-base font-semibold text-primary">{article.category_name}</p>
        <div className="flex flex-wrap gap-1.5">
          <Badge color={metalBadgeColor(article.metal)} size="sm">
            {metalLabel}
          </Badge>
          <Badge color="gray" size="sm">
            {article.purity}
          </Badge>
        </div>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-secondary pt-3 text-sm">
          <dt className="text-tertiary">Gross</dt>
          <dd className="text-right font-medium tabular-nums">{article.gross_weight_grams} g</dd>
          <dt className="text-tertiary">Non-metal</dt>
          <dd className="text-right font-medium tabular-nums">{article.non_metal_weight_grams} g</dd>
          <dt className="font-semibold text-primary">Net metal</dt>
          <dd className="text-right font-bold tabular-nums">{article.net_metal_weight_grams} g</dd>
        </dl>
        <div className="flex flex-col items-center gap-2 border-t border-secondary pt-3">
          <Button color="primary" size="md" className="w-full" onPress={onPrint}>
            {article.barcode ? "Reprint tag…" : "Print tag →"}
          </Button>
          <Button color="link-color" size="sm" onPress={onOpenArticle}>
            Open article
          </Button>
        </div>
      </div>
    </div>
  );
}
