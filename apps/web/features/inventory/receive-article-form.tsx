"use client";

import { CalendarDate, parseDate } from "@internationalized/date";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ARTICLE_PHOTO_MAX_BYTES, type Metal } from "@aabhushan/contracts";
import { kolkataBusinessDate, netMetalWeightGrams, netMetalWeightIsPositive } from "@aabhushan/domain";
import { ChevronDown } from "@untitledui/icons";

import { FileUpload, getReadableFileSize } from "@/components/application/file-upload/file-upload-base";
import { FormSkeleton } from "@/components/application/skeleton/skeleton";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { InputDate } from "@/components/base/input/input-date";
import { SectionCard } from "@/components/shared/section-card";
import { SelectField } from "@/components/shared/select-field";
import { StaffPageHeader } from "@/components/shared/staff-page-header";
import { StickyFormActions } from "@/components/shared/sticky-form-actions";
import { staffHasPermission, useStaff } from "@/features/auth/staff-shell";
import { useStaffToast } from "@/components/application/toast/staff-toast";
import {
  fieldError,
  inventoryAccessToken,
  inventoryErrorMessage,
} from "@/features/inventory/inventory-shared";
import { fetchCatalogueCategories, fetchStorageLocations, receiveArticleRequest, StaffApiError } from "@/lib/staff-api";
import { uploadStaffFile } from "@/lib/staff-file-upload";
import { cx } from "@/utils/cx";

const WEIGHT_PATTERN = /^\d+(\.\d{1,4})?$/;

function OptionalSection({ title, children, defaultOpen = false }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details
      className="group rounded-xl bg-primary shadow-xs ring-1 ring-secondary open:bg-secondary/40"
      open={defaultOpen || undefined}
    >
      <summary className="cursor-pointer list-none px-4 py-3 marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-primary">{title}</span>
          <span className="flex items-center gap-2">
            <span className="text-xs font-medium text-tertiary">Optional</span>
            <ChevronDown
              aria-hidden="true"
              className="size-4 shrink-0 stroke-[2.5px] text-fg-quaternary transition-transform in-open:-scale-y-100"
            />
          </span>
        </span>
      </summary>
      <div className="grid gap-4 border-t border-secondary px-4 py-4 md:grid-cols-2">{children}</div>
    </details>
  );
}

export function ReceiveArticleForm() {
  const staff = useStaff();
  const toast = useStaffToast();
  const router = useRouter();
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
  const [cost, setCost] = useState("");
  const [stoneDescription, setStoneDescription] = useState("");
  const [stoneWeight, setStoneWeight] = useState("");
  const [receiptDate, setReceiptDate] = useState<CalendarDate>(() => parseDate(kolkataBusinessDate()));
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);

  useEffect(() => {
    if (!allowed) {
      router.replace("/access-denied");
    }
  }, [allowed, router]);

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
      router.push(`/inventory/${article.id}`);
    },
  });

  function onCategoryChange(value: string) {
    setCategoryId(value);
    const selected = activeCategories.find((item) => item.id === value);
    if (!metalTouched && selected?.default_metal) {
      setMetal(selected.default_metal);
    }
  }

  if (!allowed) {
    return null;
  }

  if (categories.isLoading || locations.isLoading) {
    return (
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-5">
        <StaffPageHeader
          title="Receive article"
          description="Creates a unique article number and a receipt movement."
          back={{ href: "/inventory", label: "Inventory" }}
        />
        <FormSkeleton sections={3} fieldsPerSection={4} showStickyActions label="Loading receive form" />
      </section>
    );
  }

  const mutationError = mutation.error;
  const categoryFieldError = fieldError(mutationError, "category_id");
  const purityFieldError = fieldError(mutationError, "purity");
  const grossFieldError = fieldError(mutationError, "gross_weight_grams");
  const nonMetalFieldError = fieldError(mutationError, "non_metal_weight_grams");
  const netFieldError = fieldError(mutationError, "net_metal_weight_grams");
  const costFieldError = fieldError(mutationError, "acquisition_cost_inr");
  const locationFieldError = fieldError(mutationError, "location_id");
  const netInvalid = Boolean(netFieldError) || (Boolean(gross.trim()) && computedNet === null);
  const formLevelError =
    mutation.isError &&
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
      : clientError;

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <StaffPageHeader
        title="Receive article"
        description="Creates a unique article number and a receipt movement."
        back={{ href: "/inventory", label: "Inventory" }}
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
        {!hasCategories ? (
          <p className="rounded-lg bg-secondary px-3 py-2 text-sm text-error-primary ring-1 ring-secondary">
            No catalogue categories are available for this shop. Receiving is disabled until categories exist.
          </p>
        ) : null}

        <SectionCard title="Identification" description="Category, metal, purity, and optional HUID.">
          <div className="grid gap-4 md:grid-cols-2">
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
            <Input
              label="HUID"
              value={huid}
              tooltip="Optional until category rules are confirmed."
              onChange={setHuid}
            />
          </div>
        </SectionCard>

        <SectionCard
          title="Weights"
          description="Net metal is gross minus non-metal. The server rejects a mismatch."
        >
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
          <div
            className={cx(
              "rounded-lg bg-secondary px-3 py-3 ring-1 ring-secondary",
              netInvalid && "ring-error-primary",
            )}
          >
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

        <div className="flex flex-col gap-3">
          <OptionalSection title="Source and location">
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
            <Input
              label="Acquisition cost (₹)"
              value={cost}
              tooltip="Internal only. This is never a customer-facing price."
              isInvalid={Boolean(costFieldError)}
              hint={costFieldError}
              onChange={setCost}
            />
            <InputDate
              label="Receipt business date"
              value={receiptDate}
              onChange={(value) => setReceiptDate(value ? parseDate(value.toString()) : parseDate(kolkataBusinessDate()))}
              hint="Defaults to today in Asia/Kolkata."
            />
          </OptionalSection>

          <OptionalSection title="Stones (descriptive)">
            <Input label="Stone description" value={stoneDescription} onChange={setStoneDescription} />
            <Input
              label="Stone weight (g)"
              value={stoneWeight}
              tooltip="No stone pricing until invoice examples are approved."
              onChange={setStoneWeight}
            />
          </OptionalSection>

          <OptionalSection title="Photograph">
            <div className="md:col-span-2">
              <FileUpload.Root>
                <FileUpload.DropZone
                  className="py-4"
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
          </OptionalSection>
        </div>

        {formLevelError ? <p className="text-sm text-error-primary">{formLevelError}</p> : null}

        <StickyFormActions variant="bar">
          <Button type="submit" color="primary" size="md" isLoading={mutation.isPending} isDisabled={!hasCategories}>
            Receive article
          </Button>
          <Button color="secondary" size="md" href="/inventory">
            Cancel
          </Button>
        </StickyFormActions>
      </form>
    </section>
  );
}
