"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Heading } from "react-aria-components";
import type { InvoiceLine } from "@aabhushan/contracts";

import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { MoneyText } from "@/components/shared/money-text";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { TextArea } from "@/components/base/textarea/textarea";
import { useStaff } from "@/features/auth/staff-shell";
import { invoiceAccessToken, invoiceErrorMessage } from "@/features/invoices/invoice-shared";
import { newPaymentIdempotencyKey } from "@/features/payments/payment-shared";
import { acceptInvoiceReturnRequest } from "@/lib/staff-api";

export function ReturnArticleDialog({
  invoiceId,
  invoiceNumber,
  line,
  onClose,
}: {
  invoiceId: string;
  invoiceNumber: string | null;
  line: InvoiceLine | null;
  onClose: () => void;
}) {
  const staff = useStaff();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(newPaymentIdempotencyKey);

  useEffect(() => {
    if (!line) {
      return;
    }
    setReason("");
    setAcknowledged(false);
    setIdempotencyKey(newPaymentIdempotencyKey());
  }, [line]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!line) {
        throw new Error("Choose an article to return.");
      }
      return acceptInvoiceReturnRequest(
        await invoiceAccessToken(),
        invoiceId,
        {
          invoice_line_id: line.id,
          article_id: line.article_id,
          reason: reason.trim(),
          customer_acknowledged: true,
        },
        idempotencyKey,
      );
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["invoices", staff.membership.organization_id, invoiceId] }),
        queryClient.invalidateQueries({ queryKey: ["invoices", "corrections", staff.membership.organization_id, invoiceId] }),
        queryClient.invalidateQueries({ queryKey: ["payments", "invoice", staff.membership.organization_id, invoiceId] }),
        queryClient.invalidateQueries({ queryKey: ["articles"] }),
      ]);
      onClose();
    },
  });

  const canSubmit = Boolean(line) && reason.trim().length > 0 && acknowledged && !mutation.isPending;

  return (
    <ModalOverlay
      isOpen={Boolean(line)}
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) {
          onClose();
        }
      }}
      isDismissable={!mutation.isPending}
    >
      <Modal className="max-w-lg">
        <Dialog className="flex flex-col gap-4 p-5 outline-hidden">
          <Heading slot="title" className="text-lg font-semibold text-primary">
            Return article
          </Heading>
          {line ? (
            <dl className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-tertiary">Invoice</dt>
                <dd className="font-mono text-primary">{invoiceNumber ?? invoiceId.slice(0, 8)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-tertiary">Article</dt>
                <dd className="text-right text-primary">
                  {line.description}
                  <span className="mt-0.5 block font-mono text-xs text-tertiary">{line.article_number}</span>
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-tertiary">Line total</dt>
                <MoneyText amount={line.line_total_inr} as="dd" className="text-primary" />
              </div>
            </dl>
          ) : null}
          <p className="rounded-lg bg-secondary px-3 py-2 text-sm text-secondary ring-1 ring-secondary">
            Stock will be under review, not for sale. Inspection is a separate inventory action. This does not edit the
            issued invoice.
          </p>
          <TextArea
            label="Reason"
            value={reason}
            onChange={setReason}
            rows={3}
            isRequired
            isDisabled={mutation.isPending}
          />
          <Checkbox
            isSelected={acknowledged}
            isDisabled={mutation.isPending}
            onChange={setAcknowledged}
            label="Customer acknowledged this return"
          />
          {mutation.isError ? (
            <p className="text-sm text-error-primary" role="alert">
              {invoiceErrorMessage(mutation.error)}
            </p>
          ) : null}
          <div className="flex justify-end gap-3">
            <Button color="secondary" size="md" isDisabled={mutation.isPending} onPress={onClose}>
              Cancel
            </Button>
            <Button color="primary" size="md" isDisabled={!canSubmit} isLoading={mutation.isPending} onPress={() => mutation.mutate()}>
              Return article
            </Button>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
