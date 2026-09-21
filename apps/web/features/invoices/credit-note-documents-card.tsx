"use client";

import { DocumentStatusCard } from "@/features/documents/document-status-card";
import { invoiceAccessToken, invoiceErrorMessage } from "@/features/invoices/invoice-shared";

export function CreditNoteDocumentsCard({ invoiceId }: { invoiceId: string }) {
  return (
    <DocumentStatusCard
      title="Credit note document"
      description="PDF is prepared after a return is accepted. A PDF problem does not cancel the credit."
      ownerType="invoice"
      ownerId={invoiceId}
      documentType="credit_note_pdf"
      accessToken={invoiceAccessToken}
      errorMessage={invoiceErrorMessage}
      queryKeyPrefix="credit-note"
    />
  );
}
