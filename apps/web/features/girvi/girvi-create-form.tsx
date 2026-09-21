"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { parseDate } from "@internationalized/date";
import type { Customer, CustomerListItem } from "@aabhushan/contracts";
import { GIRVI_COLLATERAL_MAX_BYTES, kolkataBusinessDate } from "@aabhushan/domain";
import { Plus, Scale01, Trash01 } from "@untitledui/icons";

import { FileUpload, getReadableFileSize } from "@/components/application/file-upload/file-upload-base";
import { FormSkeleton } from "@/components/application/skeleton/skeleton";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { InputDate } from "@/components/base/input/input-date";
import { MoneyInput } from "@/components/shared/money-input";
import { SectionCard } from "@/components/shared/section-card";
import { SelectField } from "@/components/shared/select-field";
import { StaffPageHeader } from "@/components/shared/staff-page-header";
import { StickyFormActions } from "@/components/shared/sticky-form-actions";
import { CustomerCombobox } from "@/features/customers/customer-combobox";
import { staffHasPermission, useStaff } from "@/features/auth/staff-shell";
import {
  emptyCollateralRow,
  girviAccessToken,
  girviErrorMessage,
  type CollateralDraftRow,
} from "@/features/girvi/girvi-shared";
import { isPositiveMoney } from "@/lib/money";
import {
  createGirviAccount,
  fetchGirviAccount,
  patchGirviAccount,
} from "@/lib/staff-api";
import { uploadStaffFile } from "@/lib/staff-file-upload";

/** Rate as a percentage per 30 days; "monthly" is deliberately not used. */
const RATE_PATTERN = /^\d+(\.\d{1,6})?$/;

function rateFromAccount(account: {
  terms_snapshot: { interest: { rate_percent_per_30_days: string | null } };
}): string {
  return account.terms_snapshot.interest.rate_percent_per_30_days ?? "";
}

function collateralRowsFromAccount(
  items: {
    id: string;
    description: string;
    metal: "gold" | "silver" | null;
    purity: string | null;
    gross_weight_grams: string | null;
    net_metal_weight_grams: string | null;
    assessed_value_inr: string | null;
    packet_number: string;
    custody_location: string;
    files: { object_key: string; checksum_sha256: string; purpose: string }[];
  }[],
): CollateralDraftRow[] {
  if (items.length === 0) {
    return [emptyCollateralRow()];
  }
  return items.map((item) => ({
    key: item.id,
    existingItemId: item.id,
    description: item.description,
    metal: item.metal ?? "",
    purity: item.purity ?? "",
    grossWeightGrams: item.gross_weight_grams ?? "",
    netMetalWeightGrams: item.net_metal_weight_grams ?? "",
    assessedValueInr: item.assessed_value_inr ?? "",
    packetNumber: item.packet_number,
    custodyLocation: item.custody_location,
    // replaceCollateral deletes then reinserts — files must be re-sent or photos vanish.
    files: item.files.map((file) => ({
      object_key: file.object_key,
      checksum_sha256: file.checksum_sha256,
      purpose: file.purpose,
    })),
  }));
}

function mapCollateralPayload(collateral: CollateralDraftRow[]) {
  return collateral.map((row) => {
    if (!row.description.trim() || !row.packetNumber.trim() || !row.custodyLocation.trim()) {
      throw new Error("Each collateral item needs description, packet number, and custody location.");
    }
    return {
      description: row.description.trim(),
      packet_number: row.packetNumber.trim(),
      custody_location: row.custodyLocation.trim(),
      ...(row.metal ? { metal: row.metal } : {}),
      ...(row.purity.trim() ? { purity: row.purity.trim() } : {}),
      ...(row.grossWeightGrams.trim() ? { gross_weight_grams: row.grossWeightGrams.trim() } : {}),
      ...(row.netMetalWeightGrams.trim() ? { net_metal_weight_grams: row.netMetalWeightGrams.trim() } : {}),
      ...(row.assessedValueInr.trim() ? { assessed_value_inr: row.assessedValueInr.trim() } : {}),
      ...(row.files.length > 0 ? { files: row.files } : {}),
    };
  });
}

type GirviCreateFormProps = {
  /** When set, the form patches an existing draft instead of creating. */
  accountId?: string;
};

export function GirviCreateForm({ accountId }: GirviCreateFormProps = {}) {
  const staff = useStaff();
  const router = useRouter();
  const queryClient = useQueryClient();
  const allowed = staffHasPermission(staff, "girvi.write");
  const isEdit = Boolean(accountId);
  const today = kolkataBusinessDate();

  const [customer, setCustomer] = useState<CustomerListItem | Customer | null>(null);
  const [principal, setPrincipal] = useState("");
  const [ratePercent, setRatePercent] = useState("");
  const [startDate, setStartDate] = useState(parseDate(today));
  const [maturityDate, setMaturityDate] = useState(parseDate(today));
  const [collateral, setCollateral] = useState<CollateralDraftRow[]>([emptyCollateralRow()]);
  const [rowVersion, setRowVersion] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [prefilled, setPrefilled] = useState(false);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);

  useEffect(() => {
    if (!allowed) {
      router.replace("/access-denied");
    }
  }, [allowed, router]);

  const draftQuery = useQuery({
    queryKey: ["girvi-account", staff.membership.organization_id, accountId],
    queryFn: async () => fetchGirviAccount(await girviAccessToken(), accountId!),
    enabled: allowed && isEdit && Boolean(accountId),
  });

  useEffect(() => {
    if (!draftQuery.data || prefilled) {
      return;
    }
    const account = draftQuery.data;
    if (account.status !== "draft") {
      router.replace(`/girvi/${account.id}`);
      return;
    }
    setCustomer({
      id: account.customer_id,
      display_name: account.customer_display_name,
    } as CustomerListItem);
    setPrincipal(account.principal_inr);
    setRatePercent(rateFromAccount(account));
    setStartDate(parseDate(account.start_business_date));
    setMaturityDate(parseDate(account.maturity_business_date));
    setCollateral(collateralRowsFromAccount(account.collateral));
    setRowVersion(account.row_version);
    setPrefilled(true);
  }, [draftQuery.data, prefilled, router]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!customer) {
        throw new Error("Select a customer.");
      }
      if (!isPositiveMoney(principal)) {
        throw new Error("Enter a principal greater than zero.");
      }
      const rate = ratePercent.trim();
      if (!RATE_PATTERN.test(rate) || Number.parseFloat(rate) <= 0 || Number.parseFloat(rate) > 100) {
        throw new Error("Enter the interest rate as a percentage per 30 days, above 0 and up to 100.");
      }
      const items = mapCollateralPayload(collateral);
      const token = await girviAccessToken();

      if (isEdit) {
        if (rowVersion === null || !accountId) {
          throw new Error("Draft is still loading. Try again.");
        }
        return patchGirviAccount(token, accountId, {
          row_version: rowVersion,
          principal_inr: principal.trim(),
          interest_rate_percent_per_30_days: rate,
          start_business_date: startDate.toString(),
          maturity_business_date: maturityDate.toString(),
          collateral: items,
        });
      }

      return createGirviAccount(token, {
        customer_id: customer.id,
        principal_inr: principal.trim(),
        interest_rate_percent_per_30_days: rate,
        start_business_date: startDate.toString(),
        maturity_business_date: maturityDate.toString(),
        collateral: items,
      });
    },
    onSuccess: (account) => {
      router.push(`/girvi/${account.id}`);
    },
    onError: (error) => {
      setFormError(girviErrorMessage(error));
    },
  });

  if (!allowed) {
    return null;
  }

  if (isEdit && (draftQuery.isLoading || !prefilled)) {
    return (
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <StaffPageHeader
          back={{ label: "Girvi", href: accountId ? `/girvi/${accountId}` : "/girvi" }}
          icon={Scale01}
          title="Edit Girvi draft"
          description="Update draft terms and collateral before activation. The customer cannot be changed on a draft."
        />
        <FormSkeleton sections={2} fieldsPerSection={4} showStickyActions label="Loading draft" />
      </section>
    );
  }

  if (isEdit && (draftQuery.isError || !draftQuery.data)) {
    return (
      <p className="text-sm text-error-primary" role="alert">
        {girviErrorMessage(draftQuery.error ?? new Error("Draft not found"))}
      </p>
    );
  }

  function updateRow(key: string, patch: Partial<CollateralDraftRow>) {
    setCollateral((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  async function uploadPhoto(row: CollateralDraftRow, file: File, purpose: "collateral_photo" | "packet_photo") {
    if (!accountId || !row.existingItemId) {
      setFormError("Save draft terms first, then add photos to existing collateral items.");
      return;
    }
    setFormError(null);
    setUploadingKey(row.key);
    try {
      const stored = await uploadStaffFile({
        accessToken: await girviAccessToken(),
        ownerType: "girvi_collateral",
        ownerId: row.existingItemId,
        file,
        purpose,
      });
      updateRow(row.key, {
        files: [
          ...row.files,
          {
            object_key: stored.object_key,
            checksum_sha256: stored.checksum_sha256,
            purpose,
          },
        ],
      });
      await queryClient.invalidateQueries({
        queryKey: ["girvi-account", staff.membership.organization_id, accountId],
      });
    } catch (error) {
      setFormError(girviErrorMessage(error));
    } finally {
      setUploadingKey(null);
    }
  }

  return (
    <form
      className="mx-auto flex w-full max-w-3xl flex-col gap-6 pb-6"
      onSubmit={(event) => {
        event.preventDefault();
        setFormError(null);
        mutation.mutate();
      }}
    >
      <StaffPageHeader
        back={{
          label: isEdit ? (draftQuery.data?.account_number ?? "Girvi") : "Girvi",
          href: isEdit && accountId ? `/girvi/${accountId}` : "/girvi",
        }}
        icon={Scale01}
        title={isEdit ? "Edit Girvi draft" : "New Girvi"}
        description={
          isEdit
            ? "Update draft terms and collateral before activation. The customer cannot be changed on a draft."
            : "Save a draft with collateral, then activate with disbursement confirmation. The rate and calculation policy are frozen on the account at activation."
        }
      />

      <SectionCard title="Customer and terms">
        {isEdit ? (
          <Input label="Customer" value={customer?.display_name ?? ""} isDisabled isRequired />
        ) : (
          <CustomerCombobox
            label="Customer"
            selected={customer}
            excludeWalkIn
            onSelect={setCustomer}
            onClear={() => setCustomer(null)}
          />
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <MoneyInput label="Principal" value={principal} onChange={setPrincipal} />
          <Input
            label="Interest rate (% per 30 days)"
            value={ratePercent}
            onChange={setRatePercent}
            type="tel"
            isRequired
            placeholder="2"
            hint="Percentage per 30 days, counted on actual days. A 31-day period costs more than a 30-day one."
            inputClassName="text-right tabular-nums"
          />
          <InputDate
            label="Start business date"
            value={startDate}
            onChange={(value) => setStartDate(value ? parseDate(value.toString()) : parseDate(today))}
          />
          <InputDate
            label="Maturity business date"
            value={maturityDate}
            onChange={(value) => setMaturityDate(value ? parseDate(value.toString()) : parseDate(today))}
          />
        </div>
      </SectionCard>

      <SectionCard>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-primary">Collateral</h2>
          <Button
            type="button"
            color="secondary"
            size="sm"
            iconLeading={Plus}
            onPress={() => setCollateral((rows) => [...rows, emptyCollateralRow()])}
          >
            Add item
          </Button>
        </div>
        <p className="text-sm text-tertiary">
          Packet numbers are unique while in custody. These records are not articles and never appear in Inventory or
          POS.
          {isEdit
            ? " Existing photos stay attached when you save. Activation requires at least one photo per item."
            : " Save the draft first, then edit it to attach photos before activation."}
        </p>
        {collateral.map((row, index) => (
          <div key={row.key} className="flex flex-col gap-3 rounded-lg bg-secondary p-4 ring-1 ring-secondary">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-secondary">Item {index + 1}</p>
              {collateral.length > 1 ? (
                <Button
                  type="button"
                  color="tertiary-destructive"
                  size="sm"
                  iconLeading={Trash01}
                  onPress={() => setCollateral((rows) => rows.filter((item) => item.key !== row.key))}
                >
                  Remove
                </Button>
              ) : null}
            </div>
            <Input
              label="Description"
              value={row.description}
              onChange={(value) => updateRow(row.key, { description: value })}
              isRequired
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <SelectField
                label="Metal"
                value={row.metal}
                onChange={(value) => updateRow(row.key, { metal: value as "" | "gold" | "silver" })}
                options={[
                  { label: "Not set", value: "" },
                  { label: "Gold", value: "gold" },
                  { label: "Silver", value: "silver" },
                ]}
              />
              <Input label="Purity" value={row.purity} onChange={(value) => updateRow(row.key, { purity: value })} />
              <Input
                label="Gross weight (g)"
                value={row.grossWeightGrams}
                onChange={(value) => updateRow(row.key, { grossWeightGrams: value })}
              />
              <Input
                label="Net metal weight (g)"
                value={row.netMetalWeightGrams}
                onChange={(value) => updateRow(row.key, { netMetalWeightGrams: value })}
              />
              <MoneyInput
                label="Assessed value"
                value={row.assessedValueInr}
                onChange={(value) => updateRow(row.key, { assessedValueInr: value })}
              />
              <Input
                label="Packet number"
                value={row.packetNumber}
                onChange={(value) => updateRow(row.key, { packetNumber: value })}
                isRequired
              />
              <Input
                label="Custody location"
                value={row.custodyLocation}
                onChange={(value) => updateRow(row.key, { custodyLocation: value })}
                isRequired
                className="sm:col-span-2"
              />
            </div>
            {row.files.length > 0 ? (
              <p className="text-xs text-tertiary">
                {row.files.length} photo{row.files.length === 1 ? "" : "s"} attached
              </p>
            ) : null}
            {isEdit && row.existingItemId ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium text-secondary">Photos</p>
                <FileUpload.Root>
                  <FileUpload.DropZone
                    className="py-3"
                    accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                    allowsMultiple={false}
                    maxSize={GIRVI_COLLATERAL_MAX_BYTES}
                    isDisabled={uploadingKey === row.key}
                    hint={`JPEG, PNG, or WebP (max. ${getReadableFileSize(GIRVI_COLLATERAL_MAX_BYTES)}). Article or packet photo.`}
                    onDropFiles={(files) => {
                      const file = files[0];
                      if (!file) {
                        return;
                      }
                      void uploadPhoto(row, file, "collateral_photo");
                    }}
                    onDropUnacceptedFiles={() => {
                      setFormError("Use a JPEG, PNG, or WebP image.");
                    }}
                    onSizeLimitExceed={() => {
                      setFormError(`Photo must be at most ${getReadableFileSize(GIRVI_COLLATERAL_MAX_BYTES)}.`);
                    }}
                  />
                </FileUpload.Root>
                {uploadingKey === row.key ? <p className="text-sm text-tertiary">Uploading photo…</p> : null}
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    color="secondary"
                    size="sm"
                    isDisabled={uploadingKey === row.key}
                    onPress={() => {
                      const input = document.createElement("input");
                      input.type = "file";
                      input.accept = "image/jpeg,image/png,image/webp";
                      input.onchange = () => {
                        const file = input.files?.[0];
                        if (file) {
                          void uploadPhoto(row, file, "packet_photo");
                        }
                      };
                      input.click();
                    }}
                  >
                    Add packet photo
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        ))}
      </SectionCard>

      {formError ? (
        <p className="text-sm text-error-primary" role="alert">
          {formError}
        </p>
      ) : null}

      <StickyFormActions variant="bar" className="justify-end">
        <Button
          color="secondary"
          size="md"
          href={isEdit && accountId ? `/girvi/${accountId}` : "/girvi"}
          isDisabled={mutation.isPending}
        >
          Cancel
        </Button>
        <Button color="primary" size="md" type="submit" isLoading={mutation.isPending}>
          {isEdit ? "Save changes" : "Save draft"}
        </Button>
      </StickyFormActions>
    </form>
  );
}
