"use client";

import { DocumentStatusCard } from "@/features/documents/document-status-card";
import { paymentAccessToken, paymentErrorMessage } from "@/features/payments/payment-shared";

export function RefundDocumentsCard({ paymentId }: { paymentId: string }) {
  return (
    <DocumentStatusCard
      title="Refund document"
      description="PDF is prepared after the refund is saved. A PDF problem does not cancel the refund."
      ownerType="receipt"
      ownerId={paymentId}
      documentType="refund_pdf"
      accessToken={paymentAccessToken}
      errorMessage={paymentErrorMessage}
      queryKeyPrefix="refund"
    />
  );
}
