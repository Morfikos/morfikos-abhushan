"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Heading } from "react-aria-components";

import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { staffHasPermission, useStaff } from "@/features/auth/staff-shell";
import { PaymentCorrectionDialog } from "@/features/payments/payment-correction-dialog";
import { paymentAccessToken, paymentErrorMessage, paymentKindLabel } from "@/features/payments/payment-shared";
import { formatInr } from "@/lib/money";
import { paymentMethodLabel } from "@/lib/payment-methods";
import { fetchPayment } from "@/lib/staff-api";

export function PaymentDetailDialog({
  paymentId,
  onClose,
}: {
  paymentId: string | null;
  onClose: () => void;
}) {
  const staff = useStaff();
  const query = useQuery({
    queryKey: ["payments", "detail", staff.membership.organization_id, paymentId ?? ""],
    queryFn: async () => fetchPayment(await paymentAccessToken(), paymentId ?? ""),
    enabled: Boolean(paymentId),
  });

  const payment = query.data;
  const canCorrect =
    staffHasPermission(staff, "refunds.approve") &&
    payment?.kind === "collection" &&
    payment.status === "posted" &&
    !payment.reversed_by_payment_id;
  const [correction, setCorrection] = useState<"refund" | "reverse" | null>(null);

  return (
    <>
    <ModalOverlay
      isOpen={Boolean(paymentId)}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <Modal className="max-w-lg">
        <Dialog className="flex flex-col gap-4 p-5 outline-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Heading slot="title" className="text-lg font-semibold text-primary">
              {payment?.receipt_number ?? "Receipt"}
            </Heading>
            {payment ? (
              <div className="flex flex-wrap gap-2">
                <Badge color={payment.kind === "collection" ? "brand" : "gray"} size="sm">
                  {paymentKindLabel(payment.kind)}
                </Badge>
                <Badge color={payment.status === "posted" ? "success" : "gray"} size="sm">
                  {payment.status === "posted" ? "Posted" : "Reversed"}
                </Badge>
              </div>
            ) : null}
          </div>

          {query.isLoading ? <LoadingIndicator size="sm" label="Loading receipt" /> : null}
          {query.isError ? (
            <p className="text-sm text-error-primary" role="alert">
              {paymentErrorMessage(query.error)}
            </p>
          ) : null}

          {payment ? (
            <>
              <dl className="flex flex-col gap-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-tertiary">Customer</dt>
                  <dd className="text-right text-primary">{payment.customer_display_name}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-tertiary">Method</dt>
                  <dd className="text-right text-primary">{paymentMethodLabel(payment.method)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-tertiary">{payment.kind === "refund" ? "Amount refunded" : payment.kind === "reversal" ? "Amount reversed" : "Amount received"}</dt>
                  <dd className="text-right font-semibold tabular-nums text-primary">
                    {formatInr(payment.amount_inr)}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-tertiary">Business date</dt>
                  <dd className="text-right tabular-nums text-primary">{payment.received_business_date}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-tertiary">Reference</dt>
                  <dd className="text-right text-primary">{payment.reference ?? "—"}</dd>
                </div>
              </dl>

              <div className="flex flex-col gap-2 border-t border-secondary pt-3">
                <p className="text-sm font-medium text-primary">Allocated to invoices</p>
                <ul className="flex flex-col gap-2">
                  {payment.allocations.map((allocation) => (
                    <li
                      key={allocation.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-secondary px-3 py-2 ring-1 ring-secondary"
                    >
                      <span className="font-mono text-sm text-primary">
                        {allocation.invoice_number ?? allocation.invoice_id.slice(0, 8)}
                      </span>
                      <span className="text-xs text-tertiary tabular-nums">{allocation.business_date}</span>
                      <span className="text-sm font-medium tabular-nums text-primary">
                        {formatInr(allocation.amount_inr)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <p className="text-xs text-tertiary">
                Receipt print and PDF run from the outbox after commit. Nothing is sent from this screen.
              </p>
            </>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2">
            {canCorrect ? (
              <>
                <Button color="secondary" size="md" onPress={() => setCorrection("refund")}>
                  Refund
                </Button>
                <Button color="secondary" size="md" onPress={() => setCorrection("reverse")}>
                  Reverse
                </Button>
              </>
            ) : null}
            <Button color="secondary" size="md" onPress={onClose}>
              Close
            </Button>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
    <PaymentCorrectionDialog
      payment={correction ? payment ?? null : null}
      action={correction}
      onClose={() => setCorrection(null)}
    />
    </>
  );
}
