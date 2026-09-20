"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Customer, CustomerCreate } from "@aabhushan/contracts";
import { normalizeShopPhone } from "@aabhushan/domain";
import { Heading } from "react-aria-components";

import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Toggle } from "@/components/base/toggle/toggle";
import { useStaff } from "@/features/auth/staff-shell";
import { customerAccessToken, customerErrorMessage, fieldError } from "@/features/customers/customer-shared";
import { createCustomerRequest, fetchReminders } from "@/lib/staff-api";

export type PosCustomerCreateDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (customer: Customer) => void;
};

export function PosCustomerCreateDialog({ isOpen, onClose, onCreated }: PosCustomerCreateDialogProps) {
  const staff = useStaff();
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsappInvoice, setWhatsappInvoice] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const reminders = useQuery({
    queryKey: ["shop", "reminders", staff.membership.organization_id],
    queryFn: async () => fetchReminders(await customerAccessToken()),
    enabled: isOpen,
  });

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setDisplayName("");
    setPhone("");
    setWhatsappInvoice(false);
    setLocalError(null);
    setApiError(null);
  }, [isOpen]);

  const phoneField = useMemo(() => {
    const apiPhone = fieldError(apiError, "phone");
    if (apiPhone) {
      return { hint: apiPhone, isInvalid: true };
    }
    const parsed = normalizeShopPhone(phone);
    if (parsed.kind === "ok") {
      return { hint: `Stored as ${parsed.normalized}.`, isInvalid: false };
    }
    if (parsed.kind === "invalid") {
      return { hint: parsed.message, isInvalid: true };
    }
    return {
      hint: "Optional. Required for WhatsApp invoice. 10-digit Indian numbers are stored as +91.",
      isInvalid: false,
    };
  }, [apiError, phone]);

  function submit() {
    setLocalError(null);
    setApiError(null);
    if (!displayName.trim()) {
      setLocalError("Enter a customer name.");
      return;
    }
    if (whatsappInvoice && !phone.trim()) {
      setLocalError("Add a phone number before enabling WhatsApp invoice.");
      return;
    }
    const parsed = normalizeShopPhone(phone);
    if (parsed.kind === "invalid") {
      setLocalError(parsed.message);
      return;
    }

    const language = reminders.data?.language ?? "en";
    const payload: CustomerCreate = {
      display_name: displayName.trim(),
      phone: phone.trim().length > 0 ? phone.trim() : null,
      ...(whatsappInvoice
        ? {
            consents: [
              {
                channel: "whatsapp" as const,
                purpose: "transactional_invoice" as const,
                status: "granted" as const,
                language,
              },
            ],
          }
        : {}),
    };

    setBusy(true);
    void (async () => {
      try {
        const customer = await createCustomerRequest(await customerAccessToken(), payload);
        onCreated(customer);
        onClose();
      } catch (error) {
        setApiError(error);
      } finally {
        setBusy(false);
      }
    })();
  }

  return (
    <ModalOverlay
      isOpen={isOpen}
      isDismissable={!busy}
      onOpenChange={(open) => {
        if (!open && !busy) {
          onClose();
        }
      }}
    >
      <Modal className="max-w-md">
        <Dialog className="relative w-full rounded-2xl bg-primary p-6 shadow-xl outline-hidden">
          <Heading slot="title" className="text-lg font-semibold text-primary">
            New customer
          </Heading>
          <p className="mt-1 mb-4 text-sm text-tertiary">
            Quick add for this sale. Full profile fields stay on Customers.
          </p>

          <div className="flex flex-col gap-4">
            <Input
              label="Name"
              value={displayName}
              onChange={setDisplayName}
              isRequired
              isDisabled={busy}
            />
            <Input
              label="Phone"
              value={phone}
              onChange={setPhone}
              hint={phoneField.hint}
              isInvalid={phoneField.isInvalid}
              isDisabled={busy}
            />
            <Toggle
              label="WhatsApp invoice"
              hint="Sends invoice messages when a phone is set. Does not create a sale."
              isSelected={whatsappInvoice}
              onChange={setWhatsappInvoice}
              isDisabled={busy}
            />

            {localError ? (
              <p className="text-sm text-error-primary" role="alert">
                {localError}
              </p>
            ) : null}
            {apiError ? (
              <p className="text-sm text-error-primary" role="alert">
                {customerErrorMessage(apiError)}
              </p>
            ) : null}

            <div className="flex justify-end gap-2 pt-1">
              <Button color="secondary" size="md" isDisabled={busy} onPress={onClose}>
                Cancel
              </Button>
              <Button color="primary" size="md" isLoading={busy} onPress={submit}>
                Save and select
              </Button>
            </div>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
