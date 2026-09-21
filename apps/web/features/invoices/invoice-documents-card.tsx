"use client";

import { DocumentStatusCard } from "@/features/documents/document-status-card";
import { invoiceAccessToken, invoiceErrorMessage } from "@/features/invoices/invoice-shared";

export function InvoiceDocumentsCard({ invoiceId }: { invoiceId: string }) {
  return (
    <DocumentStatusCard
      title="Invoice document"
      description="PDF generation runs after finalize. A failed document never undoes the sale."
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
