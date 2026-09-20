"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Heading } from "react-aria-components";
import type { Payment } from "@aabhushan/contracts";

import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { Button } from "@/components/base/buttons/button";
import { TextArea } from "@/components/base/textarea/textarea";
import { MoneyInput } from "@/components/shared/money-input";
import { MethodSelect } from "@/components/shared/method-select";
import { paymentAccessToken, paymentErrorMessage, newPaymentIdempotencyKey } from "@/features/payments/payment-shared";
import { formatInr } from "@/lib/money";
import { refundPaymentRequest, reversePaymentRequest } from "@/lib/staff-api";

export function PaymentCorrectionDialog({
  payment,
  action,
  onClose,
}: {
  payment: Payment | null;
  action: "refund" | "reverse" | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState(payment?.method ?? "cash");
  const [idempotencyKey, setIdempotencyKey] = useState(newPaymentIdempotencyKey);

  useEffect(() => {
    if (!payment || !action) {
      return;
    }
    setReason("");
    setAmount(payment.amount_inr);
    setMethod(payment.method);
    setIdempotencyKey(newPaymentIdempotencyKey());
  }, [payment, action]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!payment || !action) {
        throw new Error("Choose a payment.");
      }
      const token = await paymentAccessToken();
      if (action === "refund") {
        return refundPaymentRequest(
          token,
          payment.id,
          {
            amount_inr: amount.trim() || undefined,
            reason: reason.trim(),
            method,
          },
          idempotencyKey,
        );
      }
      return reversePaymentRequest(token, payment.id, { reason: reason.trim() }, idempotencyKey);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["payments"] }),
        queryClient.invalidateQueries({ queryKey: ["invoices"] }),
      ]);
      onClose();
    },
  });

  const title = action === "refund" ? "Refund" : "Reverse";
  const confirmLabel = action === "refund" ? "Refund" : "Reverse";
  const canSubmit = Boolean(payment) && Boolean(action) && reason.trim().length > 0 && !mutation.isPending;

  return (
    <ModalOverlay
      isOpen={Boolean(payment) && Boolean(action)}
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
            {title}
          </Heading>
          {payment ? (
            <dl className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-tertiary">Receipt</dt>
                <dd className="font-mono text-primary">{payment.receipt_number ?? payment.id.slice(0, 8)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-tertiary">Customer</dt>
                <dd className="text-right text-primary">{payment.customer_display_name}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-tertiary">Collected</dt>
                <dd className="tabular-nums text-primary">{formatInr(payment.amount_inr)}</dd>
              </div>
            </dl>
          ) : null}
          <p className="rounded-lg bg-secondary px-3 py-2 text-sm text-secondary ring-1 ring-secondary">
            {action === "refund"
              ? "Refund sends money back. The original collection stays on the statement."
              : "Reverse corrects a mistaken posting. The original collection stays on the statement as reversed."}
          </p>
          {action === "refund" ? (
            <>
              <MoneyInput
                label="Refund amount"
                value={amount}
                onChange={setAmount}
                isDisabled={mutation.isPending}
              />
              <MethodSelect label="Method" value={method} onChange={setMethod} isDisabled={mutation.isPending} />
            </>
          ) : null}
          <TextArea
            label="Reason"
            value={reason}
            onChange={setReason}
            rows={3}
            isRequired
            isDisabled={mutation.isPending}
          />
          {mutation.isError ? (
            <p className="text-sm text-error-primary" role="alert">
              {paymentErrorMessage(mutation.error)}
            </p>
          ) : null}
          <div className="flex justify-end gap-3">
            <Button color="secondary" size="md" isDisabled={mutation.isPending} onPress={onClose}>
              Cancel
            </Button>
            <Button
              color="primary-destructive"
              size="md"
              isDisabled={!canSubmit}
              isLoading={mutation.isPending}
              onPress={() => mutation.mutate()}
            >
              {confirmLabel}
            </Button>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
