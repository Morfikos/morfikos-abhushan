import { ReceiptPrintView } from "@/features/payments/receipt-print-view";

export const dynamic = "force-dynamic";

export default async function ReceiptPrintPage({ params }: { params: Promise<{ paymentId: string }> }) {
  const { paymentId } = await params;
  return <ReceiptPrintView paymentId={paymentId} />;
}
