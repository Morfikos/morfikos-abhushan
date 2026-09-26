"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { InvoicePaperSize, PrintLabelLanguage, ReceiptPrint } from "@aabhushan/contracts";
import { printLabel } from "@aabhushan/contracts";

import { PrintDocumentSkeleton } from "@/components/application/skeleton/skeleton";
import { amountInrInWords } from "@/features/documents/amount-in-words";
import { PrintDocumentChrome } from "@/features/documents/print-document-chrome";
import { isThermalPrint, printPageCss } from "@/features/documents/print-paper";
import { ThermalPaperEdges } from "@/features/documents/thermal-paper-edges";
import {
  readPrintFormat,
  readPrintLanguage,
  writePrintFormat,
  writePrintLanguage,
} from "@/features/documents/print-prefs";
import { usePrintAutoprint } from "@/features/documents/use-print-autoprint";
import { paymentAccessToken, paymentErrorMessage } from "@/features/payments/payment-shared";
import { formatInr, isZeroMoney } from "@/lib/money";
import { paymentMethodLabel } from "@/lib/payment-methods";
import { fetchReceiptPrint } from "@/lib/staff-api";

type LabelFn = (key: Parameters<typeof printLabel>[0]) => string;

function formatMethodLabel(method: string): string {
  if (method === "cash" || method === "upi" || method === "card" || method === "bank") {
    return paymentMethodLabel(method);
  }
  if (!method) {
    return method;
  }
  return method.charAt(0).toUpperCase() + method.slice(1).toLowerCase();
}

function formatIssuedAt(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

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

  return (
    <PrintDocumentChrome
      title="Print receipt"
      documentId={receipt.receipt_number}
      documentSubject={receipt.customer_display_name}
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
        } font-(family-name:--font-print-doc)`}
      >
        <style>{printPageCss(format)}</style>
        {thermal ? (
          <ThermalPaperEdges paperClassName="bg-white">
            <div className="px-1 py-2">
              <ThermalReceiptBody receipt={receipt} label={label} />
            </div>
          </ThermalPaperEdges>
        ) : (
          <SheetReceiptBody receipt={receipt} label={label} compact={format === "A5"} />
        )}
      </div>
    </PrintDocumentChrome>
  );
}

function ThermalReceiptBody({ receipt, label }: { receipt: ReceiptPrint; label: LabelFn }) {
  return (
    <>
      <header className="mb-3 border-b border-black pb-2 text-center">
        {receipt.shop_logo_data_uri ? (
          <img src={receipt.shop_logo_data_uri} alt="" className="mx-auto mb-1.5 h-[8mm] w-auto object-contain" />
        ) : null}
        <h1 className="text-sm font-bold leading-tight">{receipt.shop_legal_name}</h1>
        {receipt.shop_address_line ? <p className="text-[10px] leading-snug">{receipt.shop_address_line}</p> : null}
        {receipt.shop_phone ? <p className="text-[10px]">{receipt.shop_phone}</p> : null}
        <p className="mt-2 font-semibold">{label("receipt")}</p>
        <p className="text-[10px] tabular-nums">
          {receipt.receipt_number} · {formatIssuedAt(receipt.issued_at)}
        </p>
      </header>

      <section className="mb-3 border-b border-neutral-400 pb-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide">{label("customer")}</p>
        <p className="font-medium">{receipt.customer_display_name}</p>
        {receipt.customer_phone ? <p className="tabular-nums">{receipt.customer_phone}</p> : null}
      </section>

      <section className="mb-3 border-b border-neutral-400 pb-2 text-center">
        <p className="text-base font-bold tabular-nums">{formatInr(receipt.amount_inr)}</p>
        <p className="mt-0.5 text-[11px]">
          {label("method")}: {formatMethodLabel(receipt.payment_method)}
        </p>
        {receipt.reference ? (
          <p className="text-[10px] tabular-nums">
            {label("reference")}: {receipt.reference}
          </p>
        ) : null}
        <p className="mt-1 text-[10px] tabular-nums text-neutral-700">
          {label("business_date")}: {receipt.received_business_date}
        </p>
        <p className="text-[10px] text-neutral-700">
          {label("received_by")}: {receipt.received_by_display_name}
        </p>
      </section>

      <p className="mb-3 text-[10px] leading-snug">
        <span className="font-semibold">{label("amount_in_words")}: </span>
        {amountInrInWords(receipt.amount_inr)}
      </p>

      {receipt.allocations.length > 0 ? (
        <section className="mb-3">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide">{label("applied")}</p>
          <ul className="space-y-2">
            {receipt.allocations.map((row) => {
              const paidInFull = isZeroMoney(row.amount_due_inr);
              return (
                <li
                  key={`${row.invoice_number}-${row.business_date}-${row.applied_inr}`}
                  className="border-b border-dashed border-neutral-400 pb-2"
                >
                  <p className="font-medium tabular-nums">
                    {row.invoice_number} · {row.business_date}
                  </p>
                  <dl className="mt-0.5 space-y-0.5 text-[10px]">
                    <div className="flex justify-between gap-2">
                      <dt>{label("grand_total")}</dt>
                      <dd className="tabular-nums">{formatInr(row.invoice_total_inr)}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt>{label("amount")}</dt>
                      <dd className="font-semibold tabular-nums">{formatInr(row.applied_inr)}</dd>
                    </div>
                    {paidInFull ? (
                      <div className="font-bold">{label("paid_in_full")}</div>
                    ) : (
                      <div className="flex justify-between gap-2 font-bold">
                        <dt>{label("due")}</dt>
                        <dd className="tabular-nums">{formatInr(row.amount_due_inr)}</dd>
                      </div>
                    )}
                  </dl>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {receipt.invoice_footer ? <p className="mt-3 text-[10px] text-neutral-700">{receipt.invoice_footer}</p> : null}

      <p className="mt-4 text-center text-[11px] font-medium">{label("thank_you")}</p>
    </>
  );
}

function SheetReceiptBody({
  receipt,
  label,
  compact,
}: {
  receipt: ReceiptPrint;
  label: LabelFn;
  compact: boolean;
}) {
  return (
    <>
      <header className="mb-6 flex items-start justify-between gap-6 border-b border-black pb-4">
        <div className="min-w-0">
          {receipt.shop_logo_data_uri ? (
            <img
              src={receipt.shop_logo_data_uri}
              alt=""
              className={`mb-2 w-auto object-contain ${compact ? "h-[10mm]" : "h-[14mm]"}`}
            />
          ) : null}
          <h1 className={`font-bold leading-tight ${compact ? "text-xl" : "text-2xl"}`}>
            {receipt.shop_legal_name}
          </h1>
          {receipt.shop_address_line ? <p className="text-sm">{receipt.shop_address_line}</p> : null}
          {receipt.shop_phone ? <p className="text-sm">{receipt.shop_phone}</p> : null}
        </div>
        <div className="shrink-0 text-right">
          <h2 className={`mb-2 font-semibold ${compact ? "text-lg" : "text-xl"}`}>{label("receipt")}</h2>
          <p className="text-sm tabular-nums">
            {label("receipt")}: {receipt.receipt_number}
          </p>
          <p className="text-sm tabular-nums">
            {label("issued")}: {formatIssuedAt(receipt.issued_at)}
          </p>
          <p className="text-sm tabular-nums">
            {label("business_date")}: {receipt.received_business_date}
          </p>
        </div>
      </header>

      <section className="mb-6 grid grid-cols-2 gap-6 border-b border-neutral-300 pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-600">{label("customer")}</p>
          <p className="text-sm font-medium">{receipt.customer_display_name}</p>
          {receipt.customer_phone ? <p className="text-sm tabular-nums">{receipt.customer_phone}</p> : null}
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-600">{label("amount")}</p>
          <p className={`font-bold tabular-nums ${compact ? "text-lg" : "text-xl"}`}>
            {formatInr(receipt.amount_inr)}
          </p>
          <p className="text-sm">
            {label("method")}: {formatMethodLabel(receipt.payment_method)}
          </p>
          {receipt.reference ? (
            <p className="text-sm tabular-nums">
              {label("reference")}: {receipt.reference}
            </p>
          ) : null}
          <p className="text-sm">
            {label("received_by")}: {receipt.received_by_display_name}
          </p>
        </div>
      </section>

      <p className="mb-6 text-xs leading-snug">
        <span className="font-semibold">{label("amount_in_words")}: </span>
        {amountInrInWords(receipt.amount_inr)}
      </p>

      {receipt.allocations.length > 0 ? (
        <section className="mb-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-600">
            {label("applied")}
          </p>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-black text-left">
                <th className="py-1.5 pr-1 font-semibold">{label("invoice")}</th>
                <th className="py-1.5 pr-1 font-semibold">{label("business_date")}</th>
                <th className="py-1.5 pr-1 text-right font-semibold">{label("grand_total")}</th>
                <th className="py-1.5 pr-1 text-right font-semibold">{label("amount")}</th>
                <th className="py-1.5 text-right font-semibold">{label("due")}</th>
              </tr>
            </thead>
            <tbody>
              {receipt.allocations.map((row) => {
                const paidInFull = isZeroMoney(row.amount_due_inr);
                return (
                  <tr
                    key={`${row.invoice_number}-${row.business_date}-${row.applied_inr}`}
                    className="border-b border-neutral-300 align-top"
                  >
                    <td className="py-1.5 pr-1 font-mono font-semibold">{row.invoice_number}</td>
                    <td className="py-1.5 pr-1 tabular-nums">{row.business_date}</td>
                    <td className="py-1.5 pr-1 text-right tabular-nums">{formatInr(row.invoice_total_inr)}</td>
                    <td className="py-1.5 pr-1 text-right font-medium tabular-nums">
                      {formatInr(row.applied_inr)}
                    </td>
                    <td className="py-1.5 text-right font-semibold tabular-nums">
                      {paidInFull ? label("paid_in_full") : formatInr(row.amount_due_inr)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ) : null}

      {receipt.invoice_footer ? <p className="mt-6 text-xs text-neutral-700">{receipt.invoice_footer}</p> : null}

      <div className="mt-12 grid grid-cols-2 gap-8 text-xs">
        <div className="border-t border-neutral-400 pt-2">{label("customer_signature")}</div>
        <div className="border-t border-neutral-400 pt-2 text-right">{label("authorized_signatory")}</div>
      </div>
    </>
  );
}
