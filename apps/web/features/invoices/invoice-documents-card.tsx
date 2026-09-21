"use client";

import { DocumentStatusCard } from "@/features/documents/document-status-card";
import { invoiceAccessToken, invoiceErrorMessage } from "@/features/invoices/invoice-shared";

export function InvoiceDocumentsCard({ invoiceId }: { invoiceId: string }) {
  return (
    <DocumentStatusCard
      title="Invoice document"
      description="PDF is prepared after the sale is completed. A PDF problem does not cancel the sale."
      ownerType="invoice"
      ownerId={invoiceId}
      documentType="invoice_pdf"
      printHref={`/print/invoices/${invoiceId}`}
      accessToken={invoiceAccessToken}
      errorMessage={invoiceErrorMessage}
      queryKeyPrefix="invoice"
    />
  );
}
