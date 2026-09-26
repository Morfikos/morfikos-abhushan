"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Heading } from "react-aria-components";
import type { InvoiceLine } from "@aabhushan/contracts";

import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { MoneyText } from "@/components/shared/money-text";
import { Button } from "@/components/base/buttons/button";
import { TextArea } from "@/components/base/textarea/textarea";
import { useStaff } from "@/features/auth/staff-shell";
import {
  formatMetalPurityLabel,
  invoiceAccessToken,
  invoiceErrorMessage,
  lineArticleTitle,
  previewReturnCreditAmount,
} from "@/features/invoices/invoice-shared";
import { newPaymentIdempotencyKey } from "@/features/payments/payment-shared";
import { acceptInvoiceReturnRequest } from "@/lib/staff-api";

export function ReturnArticleDialog({
  invoiceId,
  invoiceNumber,
  customerName,
  grandTotalInr,
  alreadyCreditedInr,
  remainingUnreturnedCount,
  line,
  onClose,
  onReturned,
}: {
  invoiceId: string;
  invoiceNumber: string | null;
  customerName: string;
  grandTotalInr: string;
  alreadyCreditedInr: string;
  remainingUnreturnedCount: number;
  line: InvoiceLine | null;
  onClose: () => void;
  onReturned?: (creditAmountInr: string) => void;
}) {
  const staff = useStaff();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(newPaymentIdempotencyKey);

  useEffect(() => {
    if (!line) {
      return;
    }
    setReason("");
    setIdempotencyKey(newPaymentIdempotencyKey());
  }, [line]);

  const creditPreview = useMemo(() => {
    if (!line) {
      return "0.00";
    }
    return previewReturnCreditAmount({
      lineTotalInr: line.line_total_inr,
      grandTotalInr,
      alreadyCreditedInr,
      remainingUnreturnedCount,
    });
  }, [alreadyCreditedInr, grandTotalInr, line, remainingUnreturnedCount]);

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
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["invoices", staff.membership.organization_id, invoiceId] }),
        queryClient.invalidateQueries({
          queryKey: ["invoices", "corrections", staff.membership.organization_id, invoiceId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["payments", "invoice", staff.membership.organization_id, invoiceId],
        }),
        queryClient.invalidateQueries({ queryKey: ["articles"] }),
      ]);
      onReturned?.(result.credit_note.amount_inr);
      onClose();
    },
  });

  const canSubmit = Boolean(line) && reason.trim().length > 0 && !mutation.isPending;

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
        <Dialog className="flex flex-col outline-hidden">
          <div className="border-b-2 border-primary px-4.5 py-3.5">
            <Heading slot="title" className="text-lg font-bold text-primary">
              Return article
            </Heading>
            <p className="mt-1 text-sm text-tertiary">
              {invoiceNumber ?? invoiceId.slice(0, 8)} · {customerName}
            </p>
          </div>

          <div className="flex flex-col gap-3 px-4.5 py-3.5">
            {line ? (
              <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg ring-1 ring-primary px-3 py-2.5">
                <span
                  className="size-9 shrink-0 bg-[repeating-linear-gradient(45deg,var(--color-bg-secondary)_0_5px,var(--color-bg-primary)_5px_10px)] ring-1 ring-secondary"
                  aria-hidden="true"
                />
                <span className="flex min-w-0 flex-col">
                  <span className="text-sm font-bold text-primary">
                    {lineArticleTitle(line.description, line.article_number)} ·{" "}
                    {formatMetalPurityLabel(line.metal, line.purity)}
                  </span>
                  <span className="font-mono text-xs text-tertiary">
                    {line.article_number} · {line.net_metal_weight_grams} g
                  </span>
                </span>
                <MoneyText amount={line.line_total_inr} className="text-sm font-bold text-primary" />
              </div>
            ) : null}

            <TextArea
              label="Reason"
              value={reason}
              onChange={setReason}
              rows={2}
              isRequired
              isDisabled={mutation.isPending}
              hint="Required"
            />

            <div className="overflow-hidden rounded-lg ring-1 ring-primary">
              <div className="border-b border-primary px-2.5 py-1.5 text-[10px] font-semibold tracking-wide text-primary uppercase">
                What happens
              </div>
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 px-2.5 py-2 text-sm">
                <dt className="text-tertiary">Article</dt>
                <dd>
                  Goes to <strong>Under review</strong>, not for sale
                </dd>
                <dt className="text-tertiary">Credit note</dt>
                <dd>
                  <MoneyText amount={creditPreview} className="inline font-medium" /> against this invoice
                </dd>
                <dt className="text-tertiary">Invoice lines</dt>
                <dd>Stay unchanged</dd>
              </dl>
            </div>

            {mutation.isError ? (
              <p className="text-sm text-error-primary" role="alert">
                {invoiceErrorMessage(mutation.error)}
              </p>
            ) : null}
          </div>

          <div className="flex gap-2 border-t-2 border-primary px-4.5 py-3">
            <Button
              color="primary"
              size="md"
              isDisabled={!canSubmit}
              isLoading={mutation.isPending}
              onPress={() => mutation.mutate()}
            >
              Return article
            </Button>
            <Button color="secondary" size="md" isDisabled={mutation.isPending} onPress={onClose}>
              Cancel
            </Button>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
