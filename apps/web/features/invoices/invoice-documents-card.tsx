"use client";

import { DocumentStatusCard } from "@/features/documents/document-status-card";
import { invoiceAccessToken, invoiceErrorMessage } from "@/features/invoices/invoice-shared";

export function InvoiceDocumentsCard({ invoiceId }: { invoiceId: string }) {
  return (
    <DocumentStatusCard
      title="Documents"
      documentLabel="Invoice PDF"
      description="A PDF problem does not cancel the sale."
      ownerType="invoice"
      ownerId={invoiceId}
      documentType="invoice_pdf"
      printHref={`/print/invoices/${invoiceId}`}
      accessToken={invoiceAccessToken}
      errorMessage={invoiceErrorMessage}
      queryKeyPrefix="invoice"
      density="comfort"
    />
  );
}
