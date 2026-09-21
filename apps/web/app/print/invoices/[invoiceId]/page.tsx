import { InvoicePrintView } from "@/features/invoices/invoice-print-view";

export const dynamic = "force-dynamic";

export default async function InvoicePrintPage({ params }: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await params;
  return <InvoicePrintView invoiceId={invoiceId} />;
}
