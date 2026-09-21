"use client";

import { DocumentStatusCard } from "@/features/documents/document-status-card";
import { paymentAccessToken, paymentErrorMessage } from "@/features/payments/payment-shared";

export function ReceiptDocumentsCard({ paymentId }: { paymentId: string }) {
  return (
    <DocumentStatusCard
      title="Receipt document"
      description="PDF is prepared after the payment is saved. A PDF problem does not cancel the payment."
      ownerType="receipt"
      ownerId={paymentId}
      documentType="receipt_pdf"
      printHref={`/print/receipts/${paymentId}`}
      accessToken={paymentAccessToken}
      errorMessage={paymentErrorMessage}
      queryKeyPrefix="receipt"
    />
  );
}
