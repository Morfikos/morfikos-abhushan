"use client";

import { useQuery } from "@tanstack/react-query";
import { bilingualLabel } from "@aabhushan/contracts";

import { PrintDocumentSkeleton } from "@/components/application/skeleton/skeleton";
import { isThermalPrint, printMaxWidthClass, printPageCss } from "@/features/documents/print-paper";
import { paymentAccessToken, paymentErrorMessage } from "@/features/payments/payment-shared";
import { formatInr } from "@/lib/money";
import { fetchReceiptPrint } from "@/lib/staff-api";

export function ReceiptPrintView({ paymentId }: { paymentId: string }) {
  const query = useQuery({
    queryKey: ["receipt-print", paymentId],
    queryFn: async () => fetchReceiptPrint(await paymentAccessToken(), paymentId),
  });

  if (query.isLoading) {
    return <PrintDocumentSkeleton label="Loading receipt print" />;
  }

  if (query.isError || !query.data) {
    return (
      <p className="p-8 text-sm text-black" role="alert">
        {paymentErrorMessage(query.error)}
      </p>
    );
  }

  const receipt = query.data;
  const thermal = isThermalPrint(receipt.invoice_paper_size);

  return (
    <div
      className={`mx-auto bg-white p-8 text-black print:p-0 ${printMaxWidthClass(receipt.invoice_paper_size)} font-[family-name:var(--font-print-doc)]`}
    >
      <style>{printPageCss(receipt.invoice_paper_size)}</style>
      <header className="mb-6 border-b border-black pb-4">
        <h1 className={`${thermal ? "text-lg" : "text-2xl"} font-bold`}>{receipt.shop_legal_name}</h1>
        {receipt.shop_address_line ? <p className="text-sm">{receipt.shop_address_line}</p> : null}
        {receipt.shop_phone ? <p className="text-sm">{receipt.shop_phone}</p> : null}
      </header>
      <h2 className={`mb-2 font-semibold ${thermal ? "text-base" : "text-xl"}`}>
        {bilingualLabel("receipt")}
      </h2>
      <p className="text-sm tabular-nums">
        {bilingualLabel("receipt")}: {receipt.receipt_number}
      </p>
      <p className="text-sm tabular-nums">
        {bilingualLabel("issued")}: {receipt.issued_at}
      </p>
      <p className="text-sm">
        {bilingualLabel("customer")}: {receipt.customer_display_name}
      </p>
      <p className="text-sm">
        {bilingualLabel("method")}: {receipt.payment_method}
      </p>
      <p className="mb-4 text-sm font-semibold tabular-nums">
        {bilingualLabel("amount")}: {formatInr(receipt.amount_inr)}
      </p>
      {receipt.invoice_numbers.length > 0 ? (
        <p className="text-sm">
          {bilingualLabel("invoices")}: {receipt.invoice_numbers.join(", ")}
        </p>
      ) : null}
      <div className="mt-8 print:hidden">
        <button
          type="button"
          className="rounded border border-black px-3 py-1.5 text-sm"
          onClick={() => {
            window.print();
          }}
        >
          Print
        </button>
      </div>
    </div>
  );
}
