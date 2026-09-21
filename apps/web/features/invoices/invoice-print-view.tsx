"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { InvoicePaperSize, InvoicePrint, PrintLabelLanguage } from "@aabhushan/contracts";
import { printLabel } from "@aabhushan/contracts";

import { PrintDocumentSkeleton } from "@/components/application/skeleton/skeleton";
import { amountInrInWords } from "@/features/documents/amount-in-words";
import { PrintDocumentChrome } from "@/features/documents/print-document-chrome";
import { isThermalPrint, printPageCss } from "@/features/documents/print-paper";
import {
  readPrintFormat,
  readPrintLanguage,
  writePrintFormat,
  writePrintLanguage,
} from "@/features/documents/print-prefs";
import { usePrintAutoprint } from "@/features/documents/use-print-autoprint";
import { invoiceAccessToken, invoiceErrorMessage, isZeroMoney } from "@/features/invoices/invoice-shared";
import { formatInr } from "@/lib/money";
import { fetchInvoicePrint } from "@/lib/staff-api";

export function InvoicePrintView({ invoiceId }: { invoiceId: string }) {
  const [format, setFormat] = useState<InvoicePaperSize>("80mm");
  const [language, setLanguage] = useState<PrintLabelLanguage>("en");
  const [prefsReady, setPrefsReady] = useState(false);

  useEffect(() => {
    setFormat(readPrintFormat());
    setLanguage(readPrintLanguage());
    setPrefsReady(true);
  }, []);

  const query = useQuery({
    queryKey: ["invoice-print", invoiceId],
    queryFn: async () => fetchInvoicePrint(await invoiceAccessToken(), invoiceId),
  });

  usePrintAutoprint(prefsReady && query.isSuccess && Boolean(query.data));

  if (query.isLoading || !prefsReady) {
    return <PrintDocumentSkeleton label="Loading invoice print" />;
  }

  if (query.isError || !query.data) {
    return (
      <p className="p-8 text-sm text-black" role="alert">
        {invoiceErrorMessage(query.error)}
      </p>
    );
  }

  const invoice = query.data;
  const thermal = isThermalPrint(format);
  const label = (key: Parameters<typeof printLabel>[0]) => printLabel(key, language);

  return (
    <PrintDocumentChrome
      title="Print invoice"
      documentId={invoice.invoice_number}
      backHref={`/invoices/${invoice.invoice_id}`}
      backLabel="Back to invoice"
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
          <ThermalInvoiceBody invoice={invoice} label={label} />
        ) : (
          <SheetInvoiceBody invoice={invoice} label={label} compact={format === "A5"} />
        )}
      </div>
    </PrintDocumentChrome>
  );
}

type LabelFn = (key: Parameters<typeof printLabel>[0]) => string;

function ThermalInvoiceBody({ invoice, label }: { invoice: InvoicePrint; label: LabelFn }) {
  const componentTotals = invoiceComponentTotals(invoice, label);

  return (
    <>
      <header className="mb-3 border-b border-black pb-2 text-center">
        {invoice.shop_logo_data_uri ? (
          <img src={invoice.shop_logo_data_uri} alt="" className="mx-auto mb-1.5 h-[8mm] w-auto object-contain" />
        ) : null}
        <h1 className="text-sm font-bold leading-tight">{invoice.shop_legal_name}</h1>
        {invoice.shop_address_line ? <p className="text-[10px] leading-snug">{invoice.shop_address_line}</p> : null}
        {invoice.shop_phone ? <p className="text-[10px]">{invoice.shop_phone}</p> : null}
        <p className="mt-2 font-semibold">{label("tax_invoice")}</p>
        <p className="text-[10px] tabular-nums">
          {label("invoice")} {invoice.invoice_number} · {invoice.business_date}
        </p>
      </header>

      <section className="mb-3 border-b border-neutral-400 pb-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide">{label("bill_to")}</p>
        <p className="font-medium">{invoice.customer_display_name}</p>
        {invoice.customer_phone ? <p className="tabular-nums">{invoice.customer_phone}</p> : null}
      </section>

      <ul className="mb-3 space-y-2.5">
        {invoice.lines.map((line) => {
          const components = lineComponentsForDisplay(line, label);
          const articleRef = articleRefLine(line.article_number, line.barcode);
          return (
            <li key={`${line.line_no}-${line.article_number}`} className="border-b border-neutral-300 pb-2">
              <div className="flex justify-between gap-2">
                <p className="font-medium">{line.description}</p>
                <p className="shrink-0 font-semibold tabular-nums">{formatInr(line.line_total_inr)}</p>
              </div>
              {articleRef ? <p className="text-[10px] text-neutral-700">{articleRef}</p> : null}
              <p className="text-[10px]">
                {formatMetalLabel(line.metal)} · {line.purity}
              </p>
              <p className="text-[10px] tabular-nums">
                {label("gross_weight")} {formatGrams(line.gross_weight_grams)} · {label("net_weight")}{" "}
                {formatGrams(line.net_metal_weight_grams)}
                {line.rate_per_gram ? ` · ${label("rate_per_gram")} ${formatInr(line.rate_per_gram)}` : ""}
              </p>
              {components.length > 0 ? (
                <ul className="mt-0.5 space-y-0.5 text-[10px] text-neutral-700">
                  {components.map(([compLabel, value]) => (
                    <li key={compLabel} className="flex justify-between gap-2">
                      <span>{compLabel}</span>
                      <span className="tabular-nums">{formatInr(value)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>

      <TotalsBlock invoice={invoice} label={label} componentTotals={componentTotals} thermal />
      {invoice.invoice_footer ? <p className="mt-4 text-[10px] text-neutral-700">{invoice.invoice_footer}</p> : null}
    </>
  );
}

function SheetInvoiceBody({
  invoice,
  label,
  compact,
}: {
  invoice: InvoicePrint;
  label: LabelFn;
  compact: boolean;
}) {
  const componentTotals = invoiceComponentTotals(invoice, label);
  const grossSum = sumGrams(invoice.lines.map((line) => line.gross_weight_grams));
  const netSum = sumGrams(invoice.lines.map((line) => line.net_metal_weight_grams));

  return (
    <>
      <header className="mb-6 flex items-start justify-between gap-6 border-b border-black pb-4">
        <div className="min-w-0">
          {invoice.shop_logo_data_uri ? (
            <img src={invoice.shop_logo_data_uri} alt="" className="mb-2 h-[14mm] w-auto object-contain" />
          ) : null}
          <h1 className="text-2xl font-bold leading-tight">{invoice.shop_legal_name}</h1>
          {invoice.shop_address_line ? <p className="text-sm">{invoice.shop_address_line}</p> : null}
          {invoice.shop_phone ? <p className="text-sm">{invoice.shop_phone}</p> : null}
        </div>
        <div className="shrink-0 text-right">
          <h2 className="mb-2 text-xl font-semibold">{label("tax_invoice")}</h2>
          <p className="text-sm tabular-nums">
            {label("invoice")}: {invoice.invoice_number}
          </p>
          <p className="text-sm tabular-nums">
            {label("business_date")}: {invoice.business_date}
          </p>
        </div>
      </header>

      <section className="mb-6 grid grid-cols-2 gap-6 border-b border-neutral-300 pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-600">{label("bill_to")}</p>
          <p className="text-sm font-medium">{invoice.customer_display_name}</p>
          {invoice.customer_phone ? <p className="text-sm tabular-nums">{invoice.customer_phone}</p> : null}
        </div>
        <div className="text-right text-sm">
          <p className="tabular-nums">
            {label("invoice")}: {invoice.invoice_number}
          </p>
          <p className="tabular-nums">
            {label("business_date")}: {invoice.business_date}
          </p>
        </div>
      </section>

      <table className="mb-6 w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-black text-left">
            <th className="py-1.5 pr-1 font-semibold">{label("sl_no")}</th>
            <th className="py-1.5 pr-1 font-semibold">{label("description")}</th>
            <th className="py-1.5 pr-1 font-semibold">{label("metal")}</th>
            <th className="py-1.5 pr-1 font-semibold">{label("purity")}</th>
            <th className="py-1.5 pr-1 text-right font-semibold">{label("gross_weight")}</th>
            <th className="py-1.5 pr-1 text-right font-semibold">{label("net_weight")}</th>
            <th className="py-1.5 pr-1 text-right font-semibold">{label("rate_per_gram")}</th>
            {!compact ? (
              <>
                <th className="py-1.5 pr-1 text-right font-semibold">{label("metal_value")}</th>
                <th className="py-1.5 pr-1 text-right font-semibold">{label("making_charge")}</th>
                <th className="py-1.5 pr-1 text-right font-semibold">{label("stones")}</th>
              </>
            ) : null}
            <th className="py-1.5 text-right font-semibold">{label("amount")}</th>
          </tr>
        </thead>
        <tbody>
          {invoice.lines.map((line) => {
            const articleRef = articleRefLine(line.article_number, compact ? null : line.barcode);
            return (
              <tr key={`${line.line_no}-${line.article_number}`} className="border-b border-neutral-300 align-top">
                <td className="py-1.5 pr-1 tabular-nums">{line.line_no}</td>
                <td className="py-1.5 pr-1">
                  <p>{line.description}</p>
                  {articleRef ? <p className="font-mono text-[10px] text-neutral-600">{articleRef}</p> : null}
                </td>
                <td className="py-1.5 pr-1">{formatMetalLabel(line.metal)}</td>
                <td className="py-1.5 pr-1">{line.purity}</td>
                <td className="py-1.5 pr-1 text-right tabular-nums">{formatGrams(line.gross_weight_grams)}</td>
                <td className="py-1.5 pr-1 text-right tabular-nums">{formatGrams(line.net_metal_weight_grams)}</td>
                <td className="py-1.5 pr-1 text-right tabular-nums">
                  {line.rate_per_gram ? formatInr(line.rate_per_gram) : "—"}
                </td>
                {!compact ? (
                  <>
                    <td className="py-1.5 pr-1 text-right tabular-nums">{formatInr(line.metal_value_inr)}</td>
                    <td className="py-1.5 pr-1 text-right tabular-nums">{formatInr(line.making_charge_inr)}</td>
                    <td className="py-1.5 pr-1 text-right tabular-nums">
                      {isZeroMoney(line.stone_charges_inr) ? "—" : formatInr(line.stone_charges_inr)}
                    </td>
                  </>
                ) : null}
                <td className="py-1.5 text-right font-medium tabular-nums">{formatInr(line.line_total_inr)}</td>
              </tr>
            );
          })}
          <tr className="border-t border-black font-semibold">
            <td className="py-1.5 pr-1" colSpan={4}>
              {label("lines")}
            </td>
            <td className="py-1.5 pr-1 text-right tabular-nums">{formatGrams(grossSum)}</td>
            <td className="py-1.5 pr-1 text-right tabular-nums">{formatGrams(netSum)}</td>
            <td className="py-1.5 pr-1" colSpan={compact ? 1 : 4} />
            <td className="py-1.5 text-right tabular-nums">{formatInr(invoice.grand_total_inr)}</td>
          </tr>
        </tbody>
      </table>

      <TotalsBlock invoice={invoice} label={label} componentTotals={componentTotals} thermal={false} />

      <p className="mt-4 text-xs">
        <span className="font-semibold">{label("amount_in_words")}: </span>
        {amountInrInWords(invoice.grand_total_inr)}
      </p>

      {invoice.invoice_footer ? <p className="mt-6 text-xs text-neutral-700">{invoice.invoice_footer}</p> : null}

      <div className="mt-12 grid grid-cols-2 gap-8 text-xs">
        <div className="border-t border-neutral-400 pt-2">{label("customer_signature")}</div>
        <div className="border-t border-neutral-400 pt-2 text-right">{label("authorized_signatory")}</div>
      </div>
    </>
  );
}

function TotalsBlock({
  invoice,
  label,
  componentTotals,
  thermal,
}: {
  invoice: InvoicePrint;
  label: LabelFn;
  componentTotals: Array<[string, string]>;
  thermal: boolean;
}) {
  return (
    <>
      <dl className={`text-sm ${thermal ? "w-full text-[11px]" : "ml-auto w-80"}`}>
        {componentTotals.map(([compLabel, value]) => (
          <div key={compLabel} className="flex justify-between gap-4 py-0.5">
            <dt>{compLabel}</dt>
            <dd className="tabular-nums">{formatInr(value)}</dd>
          </div>
        ))}
        <div
          className={`mt-1 flex justify-between gap-4 border-t-2 border-black pt-2 ${thermal ? "text-sm" : ""}`}
        >
          <dt className="font-bold">{label("grand_total")}</dt>
          <dd className="font-bold tabular-nums">{formatInr(invoice.grand_total_inr)}</dd>
        </div>
        <div className="flex justify-between gap-4 py-0.5">
          <dt>{label("paid")}</dt>
          <dd className="tabular-nums">{formatInr(invoice.amount_paid_inr)}</dd>
        </div>
        <div className="flex justify-between gap-4 py-0.5">
          <dt>{label("due")}</dt>
          <dd className="tabular-nums">{formatInr(invoice.amount_due_inr)}</dd>
        </div>
      </dl>

      {thermal ? (
        <p className="mt-2 text-[10px] leading-snug">
          <span className="font-semibold">{label("amount_in_words")}: </span>
          {amountInrInWords(invoice.grand_total_inr)}
        </p>
      ) : null}

      {invoice.collections.length > 0 ? (
        <section className={`mt-4 ${thermal ? "text-[10px]" : "text-xs"}`}>
          <p className="mb-1 font-semibold">{label("collections")}</p>
          <ul className="space-y-0.5">
            {invoice.collections.map((row) => (
              <li key={`${row.receipt_number}-${row.business_date}-${row.amount_inr}`} className="flex justify-between gap-3">
                <span>
                  {row.receipt_number} · {row.method} · {row.business_date}
                </span>
                <span className="tabular-nums">{formatInr(row.amount_inr)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

function invoiceComponentTotals(invoice: InvoicePrint, label: LabelFn): Array<[string, string]> {
  return (
    [
      [label("metal"), invoice.metal_value_inr],
      [label("making"), invoice.making_charges_inr],
      [label("wastage"), invoice.wastage_inr],
      [label("stones"), invoice.stone_charges_inr],
      [label("discount"), invoice.discount_inr],
      [label("tax"), invoice.tax_inr],
      [label("round_off"), invoice.round_off_inr],
    ] as const
  ).filter(([, value]) => !isZeroMoney(value)) as Array<[string, string]>;
}

function lineComponents(
  line: InvoicePrint["lines"][number],
  label: LabelFn,
): Array<[string, string]> {
  return (
    [
      [label("metal_value"), line.metal_value_inr],
      [label("making_charge"), line.making_charge_inr],
      [label("stones"), line.stone_charges_inr],
      [label("wastage"), line.wastage_inr],
      [label("line_discount"), line.line_discount_inr],
    ] as const
  ).filter(([, value]) => !isZeroMoney(value)) as Array<[string, string]>;
}

/** Omit component list when a single non-zero component equals the line total. */
function lineComponentsForDisplay(
  line: InvoicePrint["lines"][number],
  label: LabelFn,
): Array<[string, string]> {
  const components = lineComponents(line, label);
  if (components.length === 1 && components[0]?.[1] === line.line_total_inr) {
    return [];
  }
  return components;
}

function articleRefLine(articleNumber: string, barcode: string | null): string {
  if (!barcode || barcode === articleNumber) {
    return articleNumber;
  }
  return `${articleNumber} · ${barcode}`;
}

function formatMetalLabel(metal: string): string {
  if (!metal) {
    return metal;
  }
  return metal.charAt(0).toUpperCase() + metal.slice(1).toLowerCase();
}

function formatGrams(value: string): string {
  const n = Number.parseFloat(value);
  if (!Number.isFinite(n)) {
    return value;
  }
  return n.toFixed(3);
}

function sumGrams(values: string[]): string {
  const total = values.reduce((sum, value) => {
    const n = Number.parseFloat(value);
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);
  return total.toFixed(3);
}
