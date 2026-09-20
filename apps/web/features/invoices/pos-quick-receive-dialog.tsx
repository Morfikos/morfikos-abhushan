"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { InvoiceDraftQuickArticle, Metal } from "@aabhushan/contracts";
import { netMetalWeightGrams, netMetalWeightIsPositive } from "@aabhushan/domain";
import { Heading } from "react-aria-components";

import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { SelectField } from "@/components/shared/select-field";
import { useStaff } from "@/features/auth/staff-shell";
import { invoiceAccessToken, invoiceErrorMessage } from "@/features/invoices/invoice-shared";
import { fetchCatalogueCategories, fetchStorageLocations, StaffApiError } from "@/lib/staff-api";

const WEIGHT_PATTERN = /^\d+(\.\d{1,4})?$/;

export type PosQuickReceiveDialogProps = {
  isOpen: boolean;
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (input: InvoiceDraftQuickArticle) => void;
};

export function PosQuickReceiveDialog({ isOpen, isSaving, onClose, onSubmit }: PosQuickReceiveDialogProps) {
  const staff = useStaff();
  const [categoryId, setCategoryId] = useState("");
  const [metal, setMetal] = useState<Metal>("gold");
  const [metalTouched, setMetalTouched] = useState(false);
  const [purity, setPurity] = useState("");
  const [gross, setGross] = useState("");
  const [nonMetal, setNonMetal] = useState("0");
  const [locationId, setLocationId] = useState("");
  const [huid, setHuid] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const categories = useQuery({
    queryKey: ["catalogue-categories", staff.membership.organization_id, "pos-quick"],
    queryFn: async () => fetchCatalogueCategories(await invoiceAccessToken()),
    enabled: isOpen,
  });

  const locations = useQuery({
    queryKey: ["storage-locations", staff.membership.organization_id, "pos-quick"],
    queryFn: async () => fetchStorageLocations(await invoiceAccessToken()),
    enabled: isOpen,
  });

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setCategoryId("");
    setMetal("gold");
    setMetalTouched(false);
    setPurity("");
    setGross("");
    setNonMetal("0");
    setLocationId("");
    setHuid("");
    setLocalError(null);
  }, [isOpen]);

  useEffect(() => {
    if (metalTouched || !categoryId) {
      return;
    }
    const category = categories.data?.items.find((item) => item.id === categoryId);
    if (category?.default_metal) {
      setMetal(category.default_metal);
    }
  }, [categoryId, categories.data, metalTouched]);

  const net = useMemo(() => {
    if (!WEIGHT_PATTERN.test(gross.trim()) || !WEIGHT_PATTERN.test(nonMetal.trim() || "0")) {
      return "";
    }
    try {
      return netMetalWeightGrams(gross.trim(), nonMetal.trim() || "0");
    } catch {
      return "";
    }
  }, [gross, nonMetal]);

  const categoryOptions = (categories.data?.items ?? [])
    .filter((item) => item.is_active)
    .map((item) => ({
      label: item.name,
      value: item.id,
    }));

  const locationOptions = [
    { label: "Unspecified", value: "" },
    ...(locations.data?.items ?? []).map((item) => ({ label: item.name, value: item.id })),
  ];

  function submit() {
    setLocalError(null);
    if (!categoryId) {
      setLocalError("Select a category.");
      return;
    }
    if (!purity.trim()) {
      setLocalError("Enter purity.");
      return;
    }
    if (!WEIGHT_PATTERN.test(gross.trim()) || !WEIGHT_PATTERN.test(nonMetal.trim() || "0") || !net) {
      setLocalError("Enter valid weights.");
      return;
    }
    if (
      !netMetalWeightIsPositive({
        grossWeightGrams: gross.trim(),
        nonMetalWeightGrams: nonMetal.trim() || "0",
      })
    ) {
      setLocalError("Net metal weight must be greater than zero.");
      return;
    }

    const input: InvoiceDraftQuickArticle = {
      category_id: categoryId,
      metal,
      purity: purity.trim(),
      gross_weight_grams: gross.trim(),
      non_metal_weight_grams: nonMetal.trim() || "0",
      net_metal_weight_grams: net,
      ...(locationId ? { location_id: locationId } : {}),
      ...(huid.trim() ? { huid: huid.trim() } : {}),
    };
    onSubmit(input);
  }

  return (
    <ModalOverlay
      isOpen={isOpen}
      isDismissable={!isSaving}
      onOpenChange={(open) => {
        if (!open && !isSaving) {
          onClose();
        }
      }}
    >
      <Modal className="max-w-lg">
        <Dialog className="flex flex-col gap-4 p-5 outline-hidden">
          <Heading slot="title" className="text-lg font-semibold text-primary">
            Receive &amp; add
          </Heading>
          <p className="text-sm text-tertiary">
            Creates an available stock article and adds it to this invoice. No barcode required.
          </p>

          <SelectField
            label="Category"
            value={categoryId}
            onChange={setCategoryId}
            options={categoryOptions}
            isDisabled={categories.isLoading}
          />
          <div className="grid gap-3 sm:grid-cols-2">
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
            <Input label="Purity" value={purity} onChange={setPurity} isRequired />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Gross weight (g)" value={gross} onChange={setGross} isRequired />
            <Input label="Non-metal weight (g)" value={nonMetal} onChange={setNonMetal} />
          </div>
          <Input
            label="Net metal weight (g)"
            value={net}
            isRequired
            isReadOnly
            hint={net ? `${gross.trim()} − ${nonMetal.trim() || "0"} = ${net} g` : "Calculated as gross minus non-metal."}
            onChange={() => undefined}
          />
          <SelectField
            label="Location"
            value={locationId}
            onChange={setLocationId}
            options={locationOptions}
            isDisabled={locations.isLoading}
          />
          <Input label="HUID (optional)" value={huid} onChange={setHuid} />

          {localError ? (
            <p className="text-sm text-error-primary" role="alert">
              {localError}
            </p>
          ) : null}
          {categories.isError ? (
            <p className="text-sm text-error-primary" role="alert">
              {invoiceErrorMessage(categories.error)}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 pt-1">
            <Button color="secondary" size="md" isDisabled={isSaving} onPress={onClose}>
              Cancel
            </Button>
            <Button color="primary" size="md" isLoading={isSaving} onPress={submit}>
              Receive &amp; add
            </Button>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

export function quickReceiveErrorMessage(error: unknown): string {
  if (error instanceof StaffApiError) {
    const field = error.fieldErrors[0];
    return field ? `${error.message} ${field.message}` : error.message;
  }
  return invoiceErrorMessage(error);
}
