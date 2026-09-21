"use client";

import { DocumentStatusCard } from "@/features/documents/document-status-card";
import { invoiceAccessToken, invoiceErrorMessage } from "@/features/invoices/invoice-shared";

export function CreditNoteDocumentsCard({ invoiceId }: { invoiceId: string }) {
  return (
    <DocumentStatusCard
      title="Credit note document"
      description="PDF generation runs after a return is accepted. A failed document never undoes the credit."
      ownerType="invoice"
      ownerId={invoiceId}
      documentType="credit_note_pdf"
      accessToken={invoiceAccessToken}
      errorMessage={invoiceErrorMessage}
      queryKeyPrefix="credit-note"
    />
  );
}
