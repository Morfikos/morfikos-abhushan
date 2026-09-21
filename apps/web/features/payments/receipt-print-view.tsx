"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { InvoicePaperSize, PrintLabelLanguage } from "@aabhushan/contracts";
import { printLabel } from "@aabhushan/contracts";

import { PrintDocumentSkeleton } from "@/components/application/skeleton/skeleton";
import { PrintDocumentChrome } from "@/features/documents/print-document-chrome";
import { isThermalPrint, printPageCss } from "@/features/documents/print-paper";
import {
  readPrintFormat,
  readPrintLanguage,
  writePrintFormat,
  writePrintLanguage,
} from "@/features/documents/print-prefs";
import { usePrintAutoprint } from "@/features/documents/use-print-autoprint";
import { paymentAccessToken, paymentErrorMessage } from "@/features/payments/payment-shared";
import { formatInr } from "@/lib/money";
import { fetchReceiptPrint } from "@/lib/staff-api";

export function ReceiptPrintView({ paymentId }: { paymentId: string }) {
  const [format, setFormat] = useState<InvoicePaperSize>("80mm");
  const [language, setLanguage] = useState<PrintLabelLanguage>("en");
  const [prefsReady, setPrefsReady] = useState(false);

  useEffect(() => {
    setFormat(readPrintFormat());
    setLanguage(readPrintLanguage());
    setPrefsReady(true);
  }, []);

  const query = useQuery({
    queryKey: ["receipt-print", paymentId],
    queryFn: async () => fetchReceiptPrint(await paymentAccessToken(), paymentId),
  });

  usePrintAutoprint(prefsReady && query.isSuccess && Boolean(query.data));

  if (query.isLoading || !prefsReady) {
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
  const thermal = isThermalPrint(format);
  const label = (key: Parameters<typeof printLabel>[0]) => printLabel(key, language);
  const logoClass = thermal ? "mb-2 h-[8mm] w-auto object-contain" : "mb-2 h-[14mm] w-auto object-contain";

  return (
    <PrintDocumentChrome
      title="Print receipt"
      documentId={receipt.receipt_number}
      backHref="/payments"
      backLabel="Back to payments"
      format={format}
      language={language}
      onFormatChange={(next) => {
        setFormat(next);
        writePrintFormat(next);
      }}
      onLanguageChange={(next) => {
        setLanguage(next);
        writePrintLanguage(next);
      }}
    >
      <div
        className={`w-full bg-white text-black print:p-0 ${
          thermal ? "p-3 text-[11px] leading-snug" : "p-8 text-sm"
        } font-[family-name:var(--font-print-doc)]`}
      >
        <style>{printPageCss(format)}</style>

        <header
          className={`mb-6 border-b border-black pb-4 ${thermal ? "flex flex-col gap-3" : "flex items-start justify-between gap-6"}`}
        >
          <div className="min-w-0">
            {receipt.shop_logo_data_uri ? (
              <img src={receipt.shop_logo_data_uri} alt="" className={logoClass} />
            ) : null}
            <h1 className={`${thermal ? "text-sm" : "text-2xl"} font-bold`}>{receipt.shop_legal_name}</h1>
            {receipt.shop_address_line ? <p className={thermal ? "text-[10px]" : "text-sm"}>{receipt.shop_address_line}</p> : null}
            {receipt.shop_phone ? <p className={thermal ? "text-[10px]" : "text-sm"}>{receipt.shop_phone}</p> : null}
          </div>
          <div className={thermal ? "" : "shrink-0 text-right"}>
            <h2 className={`mb-2 font-semibold ${thermal ? "text-sm" : "text-xl"}`}>{label("receipt")}</h2>
            <p className={`${thermal ? "text-[11px]" : "text-sm"} tabular-nums`}>
              {label("receipt")}: {receipt.receipt_number}
            </p>
            <p className={`${thermal ? "text-[11px]" : "text-sm"} tabular-nums`}>
              {label("issued")}: {receipt.issued_at}
            </p>
          </div>
        </header>

        <section className={`mb-4 space-y-1 ${thermal ? "text-[11px]" : "text-sm"}`}>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-600">{label("customer")}</p>
            <p className="font-medium">{receipt.customer_display_name}</p>
          </div>
          <p>
            {label("method")}: {receipt.payment_method}
          </p>
          <p className="font-semibold tabular-nums">
            {label("amount")}: {formatInr(receipt.amount_inr)}
          </p>
          {receipt.invoice_numbers.length > 0 ? (
            <p>
              {label("invoices")}: {receipt.invoice_numbers.join(", ")}
            </p>
          ) : null}
        </section>
      </div>
    </PrintDocumentChrome>
  );
}
