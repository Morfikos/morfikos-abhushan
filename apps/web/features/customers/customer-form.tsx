"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { CustomerConsentPurpose, CustomerCreate, ReminderLanguage } from "@aabhushan/contracts";
import { normalizeShopPhone } from "@aabhushan/domain";

import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { TextArea } from "@/components/base/textarea/textarea";
import { Toggle } from "@/components/base/toggle/toggle";
import { SectionCard } from "@/components/shared/section-card";
import { SelectField } from "@/components/shared/select-field";
import { StickyFormActions } from "@/components/shared/sticky-form-actions";
import {
  consentPurposeLabel,
  customerErrorMessage,
  fieldError,
  WHATSAPP_PURPOSES,
} from "@/features/customers/customer-shared";
import { StaffApiError } from "@/lib/staff-api";
import { cx } from "@/utils/cx";

export type CustomerFormValues = {
  displayName: string;
  phone: string;
  email: string;
  addressLine: string;
  notes: string;
  purposes: Record<CustomerConsentPurpose, boolean>;
  language: ReminderLanguage;
};

function emptyPurposes(): Record<CustomerConsentPurpose, boolean> {
  return {
    transactional_invoice: false,
    transactional_receipt: false,
    due_reminder: false,
    girvi_reminder: false,
  };
}

export function emptyCustomerForm(language: ReminderLanguage = "en"): CustomerFormValues {
  return {
    displayName: "",
    phone: "",
    email: "",
    addressLine: "",
    notes: "",
    purposes: emptyPurposes(),
    language,
  };
}

function anyPurposeGranted(purposes: Record<CustomerConsentPurpose, boolean>): boolean {
  return WHATSAPP_PURPOSES.some((purpose) => purposes[purpose]);
}

export function customerFormIsDirty(values: CustomerFormValues, initial: CustomerFormValues): boolean {
  if (values.displayName !== initial.displayName) {
    return true;
  }
  if (values.phone !== initial.phone) {
    return true;
  }
  if (values.email !== initial.email) {
    return true;
  }
  if (values.addressLine !== initial.addressLine) {
    return true;
  }
  if (values.notes !== initial.notes) {
    return true;
  }
  if (values.language !== initial.language) {
    return true;
  }
  return WHATSAPP_PURPOSES.some((purpose) => values.purposes[purpose] !== initial.purposes[purpose]);
}

export function customerCreatePayload(values: CustomerFormValues): CustomerCreate {
  const phone = values.phone.trim();
  const email = values.email.trim();
  const address = values.addressLine.trim();
  const notes = values.notes.trim();
  const granted = WHATSAPP_PURPOSES.filter((purpose) => values.purposes[purpose]);
  return {
    display_name: values.displayName.trim(),
    phone: phone.length > 0 ? phone : null,
    email: email.length > 0 ? email : null,
    address_line: address.length > 0 ? address : null,
    notes: notes.length > 0 ? notes : null,
    ...(granted.length > 0
      ? {
          consents: granted.map((purpose) => ({
            channel: "whatsapp" as const,
            purpose,
            status: "granted" as const,
            language: values.language,
          })),
        }
      : {}),
  };
}

function OptionalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="rounded-lg ring-1 ring-secondary open:bg-secondary/40">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-primary marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="flex items-center justify-between gap-2">
          {title}
          <span className="text-xs font-medium text-tertiary">Optional</span>
        </span>
      </summary>
      <div className="grid gap-4 border-t border-secondary px-4 py-4">{children}</div>
    </details>
  );
}

function phoneHint(phone: string, apiPhoneError: string | undefined): {
  hint: string;
  isInvalid: boolean;
} {
  if (apiPhoneError) {
    return { hint: apiPhoneError, isInvalid: true };
  }
  const parsed = normalizeShopPhone(phone);
  if (parsed.kind === "ok") {
    return { hint: `Stored as ${parsed.normalized}.`, isInvalid: false };
  }
  if (parsed.kind === "invalid") {
    return { hint: parsed.message, isInvalid: true };
  }
  return {
    hint: "Required when WhatsApp is on. 10-digit Indian numbers are stored as +91.",
    isInvalid: false,
  };
}

export function CustomerForm({
  initial,
  submitLabel,
  isSubmitting,
  error,
  onSubmit,
  onCancel,
  actionsClassName,
  onDirtyChange,
}: {
  initial: CustomerFormValues;
  submitLabel: string;
  isSubmitting: boolean;
  error: unknown;
  onSubmit: (values: CustomerFormValues) => void;
  onCancel: () => void;
  actionsClassName?: string;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [values, setValues] = useState(initial);
  const [localError, setLocalError] = useState<string | null>(null);
  const apiError = error ? customerErrorMessage(error) : null;
  const whatsappOn = anyPurposeGranted(values.purposes);
  const phoneField = useMemo(
    () => phoneHint(values.phone, fieldError(error, "phone")),
    [error, values.phone],
  );

  function commitValues(next: CustomerFormValues) {
    setValues(next);
    setLocalError(null);
    onDirtyChange?.(customerFormIsDirty(next, initial));
  }

  function update<K extends keyof CustomerFormValues>(key: K, value: CustomerFormValues[K]) {
    commitValues({ ...values, [key]: value });
  }

  function setPurpose(purpose: CustomerConsentPurpose, selected: boolean) {
    commitValues({
      ...values,
      purposes: { ...values.purposes, [purpose]: selected },
    });
  }

  function submit() {
    if (!values.displayName.trim()) {
      setLocalError("Enter a customer name.");
      return;
    }
    if (anyPurposeGranted(values.purposes) && !values.phone.trim()) {
      setLocalError("Add a phone number before granting WhatsApp consent.");
      return;
    }
    const parsed = normalizeShopPhone(values.phone);
    if (parsed.kind === "invalid") {
      setLocalError(parsed.message);
      return;
    }
    onSubmit(values);
  }

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <SectionCard
        title="Contact"
        description="Staff-only record. Customers do not have an account or portal."
      >
        <Input
          label="Name"
          isRequired
          value={values.displayName}
          onChange={(value) => update("displayName", value)}
          isInvalid={Boolean(fieldError(error, "display_name") || localError === "Enter a customer name.")}
          hint={fieldError(error, "display_name")}
        />
        <Input
          label="Phone"
          type="tel"
          value={values.phone}
          onChange={(value) => update("phone", value)}
          placeholder="98765 43210"
          isRequired={whatsappOn}
          hint={phoneField.hint}
          isInvalid={
            phoneField.isInvalid ||
            Boolean(localError === "Add a phone number before granting WhatsApp consent.")
          }
        />
      </SectionCard>

      <SectionCard
        title="WhatsApp"
        description="Nothing is sent from this screen. You can change each purpose later on the profile."
      >
        {WHATSAPP_PURPOSES.map((purpose) => {
          const granted = values.purposes[purpose];
          return (
            <Toggle
              key={purpose}
              className="w-full"
              isSelected={granted}
              onChange={(selected) => setPurpose(purpose, selected)}
              label={consentPurposeLabel(purpose)}
              hint={granted ? "Granted for future sends." : "Not granted."}
            />
          );
        })}
        {whatsappOn ? (
          <SelectField
            label="Message language"
            value={values.language}
            onChange={(value) => update("language", value === "hi" ? "hi" : "en")}
            hint="Defaults from shop reminder settings. Hindi at launch is still an open decision."
            options={[
              { label: "English", value: "en" },
              { label: "Hindi", value: "hi" },
            ]}
          />
        ) : null}
      </SectionCard>

      <OptionalSection title="Email, address, and notes">
        <Input
          label="Email"
          value={values.email}
          onChange={(value) => update("email", value)}
          hint={fieldError(error, "email")}
          isInvalid={Boolean(fieldError(error, "email"))}
        />
        <TextArea
          label="Address"
          value={values.addressLine}
          onChange={(value) => update("addressLine", value)}
          rows={3}
        />
        <TextArea
          label="Staff notes"
          value={values.notes}
          onChange={(value) => update("notes", value)}
          rows={4}
          hint="Visible to staff only."
        />
      </OptionalSection>

      {localError ? <p className="text-sm text-error-primary">{localError}</p> : null}
      {apiError && !localError ? <p className="text-sm text-error-primary">{apiError}</p> : null}
      {error instanceof StaffApiError && error.existingCustomerId ? (
        <Button color="secondary" size="md" href={`/customers/${error.existingCustomerId}`}>
          Open existing customer
        </Button>
      ) : null}

      <StickyFormActions variant="inset" className={cx("flex flex-wrap gap-3", actionsClassName)}>
        <Button color="primary" size="md" isLoading={isSubmitting} isDisabled={isSubmitting} onPress={submit}>
          {submitLabel}
        </Button>
        <Button color="secondary" size="md" isDisabled={isSubmitting} onPress={onCancel}>
          Cancel
        </Button>
      </StickyFormActions>
    </form>
  );
}
