"use client";

import { CalendarDate, parseDate } from "@internationalized/date";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { ARTICLE_PHOTO_MAX_BYTES, type Article, type Metal } from "@aabhushan/contracts";
import { kolkataBusinessDate } from "@aabhushan/domain";
import { Check, XClose } from "@untitledui/icons";

import { FileUpload, getReadableFileSize } from "@/components/application/file-upload/file-upload-base";
import { FormSkeleton } from "@/components/application/skeleton/skeleton";
import { useStaffToast } from "@/components/application/toast/staff-toast";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { Input } from "@/components/base/input/input";
import { InputDate } from "@/components/base/input/input-date";
import { CatalogueCombobox } from "@/components/shared/catalogue-combobox";
import { SegmentedField } from "@/components/shared/segmented-field";
import { SelectField } from "@/components/shared/select-field";
import { StaffPageHeader } from "@/components/shared/staff-page-header";
import { ratesCoverageDismissKey, staffHasPermission, useStaff } from "@/features/auth/staff-shell";
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
import { formatInr } from "@/lib/money";
import {
  fetchCatalogueCategories,
  fetchMetalRatesCoverage,
  fetchPurityLabels,
  fetchStorageLocations,
  receiveArticleRequest,
  StaffApiError,
} from "@/lib/staff-api";
import { uploadStaffFile } from "@/lib/staff-file-upload";
import { cx } from "@/utils/cx";

type OptionalGroup = "source" | "stones" | "photo";

export function ReceiveArticleForm() {
  const staff = useStaff();
  const toast = useStaffToast();
  const router = useRouter();
  const allowed = staffHasPermission(staff, "inventory.write");
  const canSeeRates =
    staffHasPermission(staff, "billing.write") ||
    staffHasPermission(staff, "rates.read") ||
    staffHasPermission(staff, "rates.write");
  const businessDate = kolkataBusinessDate();

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
  const [cost, setCost] = useState("");
  const [stoneDescription, setStoneDescription] = useState("");
  const [stoneWeight, setStoneWeight] = useState("");
  const [receiptDate, setReceiptDate] = useState<CalendarDate>(() => parseDate(kolkataBusinessDate()));
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [openGroups, setOpenGroups] = useState<Set<OptionalGroup>>(() => new Set());
  const [pendingPhotoJump, setPendingPhotoJump] = useState(false);
  const [received, setReceived] = useState<Article | null>(null);
  const [keepAttributes, setKeepAttributes] = useState(true);
  const [ratesDismissed, setRatesDismissed] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.sessionStorage.getItem(ratesCoverageDismissKey(businessDate)) === "1";
  });

  const categoryRef = useRef<HTMLDivElement>(null);
  const purityRef = useRef<HTMLDivElement>(null);
  const weightsRef = useRef<HTMLDivElement>(null);
  const photoRef = useRef<HTMLDivElement>(null);
  const grossInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!allowed) {
      router.replace("/access-denied");
    }
  }, [allowed, router]);

  useEffect(() => {
    if (!photoFile) {
      setPhotoPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(photoFile);
    setPhotoPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  useEffect(() => {
    if (!pendingPhotoJump || !openGroups.has("photo")) {
      return;
    }
    photoRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    const focusable = photoRef.current?.querySelector<HTMLElement>("input, button, [tabindex]");
    focusable?.focus();
    setPendingPhotoJump(false);
  }, [pendingPhotoJump, openGroups]);

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
  const purities = useQuery({
    queryKey: ["inventory", "purity-labels", staff.membership.organization_id],
    queryFn: async () => fetchPurityLabels(await inventoryAccessToken()),
    enabled: allowed,
  });
  const coverageQuery = useQuery({
    queryKey: ["shop", "rates-coverage", staff.membership.organization_id, businessDate],
    queryFn: async () => fetchMetalRatesCoverage(await inventoryAccessToken(), businessDate),
    enabled: allowed && canSeeRates && !ratesDismissed && !received,
    staleTime: 60_000,
  });

  const activeCategories = categories.data?.items.filter((item) => item.is_active) ?? [];
  const hasCategories = activeCategories.length > 0;
  const purityItems = (purities.data?.items ?? []).map((item) => ({ id: item.label, label: item.label }));
  const locationItems = (locations.data?.items ?? []).map((item) => ({ id: item.id, label: item.name }));
  const selectedCategory = activeCategories.find((item) => item.id === categoryId);
  const categoryName = selectedCategory?.name ?? "";

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
      const article = await receiveArticleRequest(token, {
        category_id: categoryId,
        metal,
        purity,
        gross_weight_grams: gross.trim(),
        non_metal_weight_grams: nonMetal.trim() || "0",
        net_metal_weight_grams: computedNet,
        ...(huid.trim() ? { huid: huid.trim() } : {}),
        ...(supplierRef.trim() ? { supplier_ref: supplierRef.trim() } : {}),
        ...(karigarRef.trim() ? { karigar_ref: karigarRef.trim() } : {}),
        ...(locationId ? { location_id: locationId } : {}),
        ...(cost.trim() ? { acquisition_cost_inr: cost.trim() } : {}),
        ...(receiptDate ? { receipt_business_date: receiptDate.toString() } : {}),
        ...(stoneDescription.trim()
          ? {
              stones: [
                {
                  description: stoneDescription.trim(),
                  ...(stoneWeight.trim() ? { weight_grams: stoneWeight.trim() } : {}),
                },
              ],
            }
          : {}),
      });
      if (photoFile) {
        await uploadStaffFile({
          accessToken: token,
          ownerType: "article",
          ownerId: article.id,
          file: photoFile,
          purpose: "photograph",
        });
      }
      return article;
    },
    onSuccess: (article) => {
      toast.success(`Article ${article.article_number} received`);
      setReceived(article);
    },
  });

  function onCategoryChange(value: string) {
    setCategoryId(value);
    const selected = activeCategories.find((item) => item.id === value);
    if (!metalTouched && selected?.default_metal) {
      setMetal(selected.default_metal);
    }
  }

  function toggleGroup(group: OptionalGroup) {
    setOpenGroups((current) => {
      const next = new Set(current);
      if (next.has(group)) {
        next.delete(group);
      } else {
        next.add(group);
      }
      return next;
    });
  }

  function resetForNext() {
    const keep = keepAttributes;
    const keptCategory = categoryId;
    const keptMetal = metal;
    const keptPurity = purity;
    setReceived(null);
    setSubmitted(false);
    setClientError(null);
    setPhotoError(null);
    setPhotoFile(null);
    setGross("");
    setNonMetal("0");
    setHuid("");
    setSupplierRef("");
    setKarigarRef("");
    setLocationId("");
    setCost("");
    setStoneDescription("");
    setStoneWeight("");
    setReceiptDate(parseDate(kolkataBusinessDate()));
    setOpenGroups(new Set());
    mutation.reset();
    if (keep) {
      setCategoryId(keptCategory);
      setMetal(keptMetal);
      setPurity(keptPurity);
      setMetalTouched(true);
    } else {
      setCategoryId("");
      setMetal("gold");
      setMetalTouched(false);
      setPurity("");
    }
    requestAnimationFrame(() => {
      grossInputRef.current?.focus();
    });
  }

  function jumpTo(ref: RefObject<HTMLElement | null>) {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    const focusable = ref.current?.querySelector<HTMLElement>("input, button, [tabindex]");
    focusable?.focus();
  }

  if (!allowed) {
    return null;
  }

  if (categories.isLoading || locations.isLoading || purities.isLoading) {
    return (
      <section className="flex w-full flex-col gap-5">
        <StaffPageHeader
          title="Receive article"
          description="Adds the piece to inventory and assigns an article number."
          back={{ href: "/inventory", label: "Inventory" }}
          density="comfort"
        />
        <FormSkeleton layout="form-rail" label="Loading receive form" />
      </section>
    );
  }

  const mutationError = mutation.error;
  const categoryFieldError =
    fieldError(mutationError, "category_id") ??
    (submitted && !categoryId ? "Choose a category." : undefined);
  const purityFieldError =
    fieldError(mutationError, "purity") ?? (submitted && !purity.trim() ? "Choose a purity." : undefined);
  const grossFieldError = fieldError(mutationError, "gross_weight_grams");
  const nonMetalFieldError = fieldError(mutationError, "non_metal_weight_grams");
  const netFieldError = fieldError(mutationError, "net_metal_weight_grams");
  const costFieldError = fieldError(mutationError, "acquisition_cost_inr");
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

  const canReceive = categoryOk && purityOk && grossOk && hasCategories && !mutation.isPending;
  const incompleteCount = checklistItems.filter((item) => !item.ok).length;

  const selectedLocationName = locationItems.find((item) => item.id === locationId)?.label;
  const costTrimmed = cost.trim();
  const previewDetailParts = [
    huid.trim() || null,
    supplierRef.trim() || null,
    karigarRef.trim() || null,
    selectedLocationName || null,
    stoneDescription.trim() ? "Stones" : null,
    /^\d+(\.\d{1,2})?$/.test(costTrimmed) ? formatInr(costTrimmed) : null,
  ].filter((part): part is string => Boolean(part));
  const previewDetailLine = previewDetailParts.length > 0 ? previewDetailParts.join(" · ") : null;

  const networkFailure =
    mutation.isError && !(mutationError instanceof StaffApiError)
      ? "Not received. Try again."
      : null;
  const formLevelError =
    networkFailure ??
    (mutation.isError &&
    mutationError instanceof StaffApiError &&
    !(
      categoryFieldError ||
      purityFieldError ||
      grossFieldError ||
      nonMetalFieldError ||
      netFieldError ||
      costFieldError ||
      locationFieldError
    )
      ? inventoryErrorMessage(mutationError)
      : clientError);

  const sourceFilled = Boolean(
    supplierRef.trim() || karigarRef.trim() || locationId || cost.trim(),
  );
  const stonesFilled = Boolean(stoneDescription.trim() || stoneWeight.trim());
  const photoFilled = Boolean(photoFile);
  const sourceCount = [supplierRef.trim(), karigarRef.trim(), locationId, cost.trim()].filter(Boolean).length;
  const stonesCount = stoneDescription.trim() ? 1 : 0;

  const coverage = coverageQuery.data;
  const showRatesStrip =
    canSeeRates && !ratesDismissed && !received && coverage && (!coverage.gold || !coverage.silver);

  const locked = mutation.isPending || Boolean(received);

  function tryReceive() {
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

  return (
    <section className="flex w-full flex-col gap-8">
      {showRatesStrip ? (
        <div
          className="flex flex-wrap items-center gap-3 border-b-2 border-primary bg-primary px-1 py-2 text-sm"
          role="status"
        >
          <span className="text-xs font-semibold tracking-wide text-secondary uppercase">Today&apos;s rates</span>
          <span
            className={cx(
              "inline-flex items-center gap-1.5 whitespace-nowrap",
              coverage.gold ? "font-medium text-primary" : "font-semibold text-error-primary",
            )}
          >
            <span
              className={cx("size-2 shrink-0", coverage.gold ? "bg-primary-solid" : "bg-error-solid")}
              aria-hidden="true"
            />
            {coverage.gold ? "Gold set" : "Gold missing"}
          </span>
          <span
            className={cx(
              "inline-flex items-center gap-1.5 whitespace-nowrap",
              coverage.silver ? "font-medium text-primary" : "font-semibold text-error-primary",
            )}
          >
            <span
              className={cx("size-2 shrink-0", coverage.silver ? "bg-primary-solid" : "bg-error-solid")}
              aria-hidden="true"
            />
            {coverage.silver ? "Silver set" : "Silver missing"}
          </span>
          <Button color="link-color" size="sm" className="ml-auto" href="/settings?tab=rates">
            Open rates →
          </Button>
          <Button
            color="tertiary"
            size="sm"
            iconLeading={XClose}
            aria-label="Dismiss rates reminder"
            onPress={() => {
              window.sessionStorage.setItem(ratesCoverageDismissKey(businessDate), "1");
              setRatesDismissed(true);
            }}
          />
        </div>
      ) : null}

      <StaffPageHeader
        title="Receive article"
        description="Adds the piece to inventory and assigns an article number."
        back={{ href: "/inventory", label: "Inventory" }}
        density="comfort"
      />

      <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_360px]">
        <form
          className={cx(
            FORM_CARD_CLASS,
            "flex flex-col gap-7",
            received && "pointer-events-none opacity-30",
          )}
          onSubmit={(event) => {
            event.preventDefault();
            tryReceive();
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
              tryReceive();
            }
          }}
        >
          {!hasCategories ? (
            <p className="rounded-lg bg-secondary px-3 py-2 text-sm text-error-primary ring-1 ring-secondary">
              No catalogue categories are available for this shop. Receiving is disabled until categories exist.
            </p>
          ) : null}

          <NumberedSection number="01" title="Identification">
            <div className="flex flex-col gap-6">
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
                grossRef={grossInputRef}
                onGrossChange={setGross}
                onNonMetalChange={setNonMetal}
              />
            </div>
          </NumberedSection>

          <NumberedSection number="03" title="More details" optional>
            <div className="flex flex-wrap gap-2">
              <Button
                color={openGroups.has("source") || sourceFilled ? "secondary" : "tertiary"}
                size="md"
                className={openGroups.has("source") || sourceFilled ? "ring-secondary" : undefined}
                isDisabled={locked}
                onPress={() => toggleGroup("source")}
              >
                {sourceFilled ? `Source & location · ${sourceCount}` : "Source & location"}
              </Button>
              <Button
                color={openGroups.has("stones") || stonesFilled ? "secondary" : "tertiary"}
                size="md"
                className={openGroups.has("stones") || stonesFilled ? "ring-secondary" : undefined}
                isDisabled={locked}
                onPress={() => toggleGroup("stones")}
              >
                {stonesFilled ? `Stones · ${stonesCount}` : "Stones"}
              </Button>
              <Button
                color={openGroups.has("photo") || photoFilled ? "secondary" : "tertiary"}
                size="md"
                className={openGroups.has("photo") || photoFilled ? "ring-secondary" : undefined}
                isDisabled={locked}
                onPress={() => toggleGroup("photo")}
              >
                {photoFilled ? "Photograph · 1" : "Photograph"}
              </Button>
            </div>

            {openGroups.has("source") ? (
              <div className="mt-5 grid gap-6 rounded-xl bg-secondary/40 p-6 ring-1 ring-secondary md:grid-cols-2">
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
                <Input
                  label="Acquisition cost (₹)"
                  value={cost}
                  tooltip="Internal only. This is never a customer-facing price."
                  isDisabled={locked}
                  isInvalid={Boolean(costFieldError)}
                  error={costFieldError}
                  onChange={setCost}
                />
                <InputDate
                  label="Receipt business date"
                  value={receiptDate}
                  isDisabled={locked}
                  onChange={(value) =>
                    setReceiptDate(value ? parseDate(value.toString()) : parseDate(kolkataBusinessDate()))
                  }
                  hint="Defaults to today (India time)."
                />
              </div>
            ) : null}

            {openGroups.has("stones") ? (
              <div className="mt-5 grid gap-6 rounded-xl bg-secondary/40 p-6 ring-1 ring-secondary md:grid-cols-2">
                <Input
                  label="Stone description"
                  value={stoneDescription}
                  isDisabled={locked}
                  onChange={setStoneDescription}
                />
                <Input
                  label="Stone weight (g)"
                  value={stoneWeight}
                  tooltip="No stone pricing until invoice examples are approved."
                  isDisabled={locked}
                  onChange={setStoneWeight}
                />
              </div>
            ) : null}

            {openGroups.has("photo") ? (
              <div ref={photoRef} className="mt-5 rounded-xl bg-secondary/40 p-6 ring-1 ring-secondary">
                <FileUpload.Root>
                  <FileUpload.DropZone
                    className="py-4"
                    isDisabled={locked}
                    accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                    allowsMultiple={false}
                    maxSize={ARTICLE_PHOTO_MAX_BYTES}
                    hint="JPEG, PNG, or WebP (max. 5 MB). Uploaded privately after the article is created."
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
                {photoFile ? (
                  <p className="mt-2 text-sm text-tertiary">
                    Attached {photoFile.name} ({getReadableFileSize(photoFile.size)}).
                  </p>
                ) : null}
                {photoError ? <p className="mt-2 text-sm text-error-primary">{photoError}</p> : null}
              </div>
            ) : null}
          </NumberedSection>
        </form>

        <aside className="flex flex-col gap-6 lg:sticky lg:top-4">
          {received ? (
            <ReceiveSuccessCard
              article={received}
              keepAttributes={keepAttributes}
              onKeepAttributesChange={setKeepAttributes}
              onReceiveAnother={resetForNext}
            />
          ) : (
            <>
              <ArticlePreviewCard
                articleNumber=""
                numberPending
                categoryName={categoryName || null}
                metal={metal}
                purity={purity}
                netMetalSigned={weightsBroken ? weightMath.signed : computedNet}
                weightsBroken={weightsBroken}
                photoUrl={photoPreviewUrl}
                gross={gross}
                nonMetal={nonMetal}
                detailLine={previewDetailLine}
                emptyPhotoAction={{
                  label: "Add photograph",
                  onPress: () => {
                    setOpenGroups((prev) => new Set(prev).add("photo"));
                    setPendingPhotoJump(true);
                  },
                }}
              />

              <div className="max-lg:sticky max-lg:bottom-0 max-lg:z-10 max-lg:border-t max-lg:border-secondary max-lg:bg-primary max-lg:pb-[max(0.75rem,env(safe-area-inset-bottom))] max-lg:pt-3">
                <ArticleChecklistCard
                  title="Before you receive"
                  items={checklistItems}
                  readyLabel="Ready to receive"
                  submitted={submitted}
                  formLevelError={formLevelError}
                >
                  <Button
                    color="primary"
                    size="md"
                    className={cx("w-full", RAIL_PRIMARY_DISABLED_CLASS)}
                    isDisabled={!canReceive && !mutation.isPending}
                    isLoading={mutation.isPending}
                    onPress={tryReceive}
                  >
                    {mutation.isPending ? "Receiving…" : "Receive article"}
                  </Button>
                  {!submitted && incompleteCount > 0 ? (
                    <p className="text-xs text-tertiary">
                      {incompleteCount} field{incompleteCount === 1 ? "" : "s"} left
                    </p>
                  ) : null}
                  <Button color="link-gray" size="md" href="/inventory">
                    Cancel
                  </Button>
                </ArticleChecklistCard>
              </div>
            </>
          )}
        </aside>
      </div>
    </section>
  );
}

function ReceiveSuccessCard({
  article,
  keepAttributes,
  onKeepAttributesChange,
  onReceiveAnother,
}: {
  article: Article;
  keepAttributes: boolean;
  onKeepAttributesChange: (value: boolean) => void;
  onReceiveAnother: () => void;
}) {
  const metalLabel = article.metal === "gold" ? "Gold" : "Silver";
  return (
    <div className="overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
      <div className="flex items-center gap-2 bg-primary-solid px-4 py-3 text-sm font-semibold text-white">
        <span>Received</span>
        <span className="inline-flex items-center gap-1">
          <Check className="size-3.5" aria-hidden="true" /> Available
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
          <Button
            color="primary"
            size="md"
            className="w-full"
            href={tagPrintHref({ ids: [article.id], kind: "initial" })}
          >
            Print tag →
          </Button>
          <Button color="secondary" size="md" className="w-full" onPress={onReceiveAnother}>
            Receive another
          </Button>
          <Checkbox
            isSelected={keepAttributes}
            onChange={onKeepAttributesChange}
            label="Keep category, metal, purity"
            size="sm"
          />
          <Button color="link-color" size="sm" href={`/inventory/${article.id}`}>
            Open article
          </Button>
        </div>
      </div>
    </div>
  );
}
