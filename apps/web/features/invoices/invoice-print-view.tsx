"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { InvoicePaperSize, InvoicePrint, PrintLabelLanguage } from "@aabhushan/contracts";
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
      documentSubject={invoice.customer_display_name}
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
          <ThermalPaperEdges paperClassName="bg-white">
            <div className="px-1 py-2">
              <ThermalInvoiceBody invoice={invoice} label={label} />
            </div>
          </ThermalPaperEdges>
        ) : (
          <SheetInvoiceBody invoice={invoice} label={label} compact={format === "A5"} />
        )}
      </div>
    </PrintDocumentChrome>
  );
}

type LabelFn = (key: Parameters<typeof printLabel>[0]) => string;

function formatMethodLabel(method: string): string {
  if (!method) {
    return method;
  }
  return method.charAt(0).toUpperCase() + method.slice(1).toLowerCase();
}

function ThermalInvoiceBody({ invoice, label }: { invoice: InvoicePrint; label: LabelFn }) {
  const componentTotals = invoiceComponentTotals(invoice, label);
  const paidInFull = isZeroMoney(invoice.amount_due_inr);
  const paidRows =
    invoice.collections.length > 0
      ? invoice.collections.map((row) => ({
          label: `${label("paid")} · ${formatMethodLabel(row.method)}`,
          amount: row.amount_inr,
        }))
      : !isZeroMoney(invoice.amount_paid_inr)
        ? [{ label: label("paid"), amount: invoice.amount_paid_inr }]
        : [];

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

      <ul className="mb-3 space-y-2">
        {invoice.lines.map((line) => {
          const components = lineComponentsForDisplay(line, label);
          return (
            <li key={`${line.line_no}-${line.article_number}`} className="border-b border-dashed border-neutral-400 pb-2">
              <div className="flex justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">{line.description}</p>
                  <p className="font-mono text-[10px] text-neutral-700">
                    {line.article_number} · {formatMetalLabel(line.metal)} {line.purity}
                  </p>
                  <p className="text-[10px] tabular-nums text-neutral-700">
                    Gross {formatGrams(line.gross_weight_grams)} g · Net {formatGrams(line.net_metal_weight_grams)} g
                    {line.rate_per_gram ? ` · ${formatInr(line.rate_per_gram)}/g` : ""}
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
                </div>
                <p className="shrink-0 font-semibold tabular-nums">{formatInr(line.line_total_inr)}</p>
              </div>
            </li>
          );
        })}
      </ul>

      <dl className="w-full text-[11px]">
        {componentTotals.map(([compLabel, value]) => (
          <div key={compLabel} className="flex justify-between gap-4 py-0.5">
            <dt>{compLabel}</dt>
            <dd className="tabular-nums">{formatInr(value)}</dd>
          </div>
        ))}
        <div className="mt-1 flex justify-between gap-4 border-t-2 border-black pt-2 text-base">
          <dt className="font-bold">{label("grand_total")}</dt>
          <dd className="font-bold tabular-nums">{formatInr(invoice.grand_total_inr)}</dd>
        </div>
        {paidRows.map((row) => (
          <div key={`${row.label}-${row.amount}`} className="flex justify-between gap-4 py-0.5">
            <dt>{row.label}</dt>
            <dd className="tabular-nums">{formatInr(row.amount)}</dd>
          </div>
        ))}
        {paidInFull ? (
          <div className="py-0.5 font-bold">{label("paid_in_full")}</div>
        ) : (
          <div className="flex justify-between gap-4 py-0.5 font-bold">
            <dt>{label("due")}</dt>
            <dd className="tabular-nums">{formatInr(invoice.amount_due_inr)}</dd>
          </div>
        )}
      </dl>

      <p className="mt-2 text-[10px] leading-snug">
        <span className="font-semibold">{label("amount_in_words")}: </span>
        {amountInrInWords(invoice.grand_total_inr)}
      </p>

      {invoice.collections.length > 0 ? (
        <ul className="mt-3 space-y-0.5 border-t border-dashed border-neutral-400 pt-2 text-[10px]">
          {invoice.collections.map((row) => (
            <li key={`${row.receipt_number}-${row.business_date}-${row.amount_inr}`} className="flex justify-between gap-3">
              <span>
                {row.receipt_number} · {formatMethodLabel(row.method)} · {row.business_date}
              </span>
              <span className="tabular-nums">{formatInr(row.amount_inr)}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {invoice.invoice_footer ? <p className="mt-4 text-[10px] text-neutral-700">{invoice.invoice_footer}</p> : null}

      <p className="mt-4 text-center text-[11px] font-medium">{label("thank_you")}</p>
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
  const paidInFull = isZeroMoney(invoice.amount_due_inr);
  const firstCollection = invoice.collections[0];

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
        <div className="text-right">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-600">{label("paid")}</p>
          {paidInFull ? (
            <p className="text-sm font-semibold">{label("paid_in_full")}</p>
          ) : (
            <p className="text-sm font-semibold tabular-nums">
              {label("due")} {formatInr(invoice.amount_due_inr)}
            </p>
          )}
          {firstCollection ? (
            <p className="text-sm tabular-nums">
              {firstCollection.receipt_number} · {formatMethodLabel(firstCollection.method)}
            </p>
          ) : null}
        </div>
      </section>

      <table className="mb-6 w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-black text-left">
            <th className="py-1.5 pr-1 font-semibold">{label("article")}</th>
            <th className="py-1.5 pr-1 font-semibold">
              {label("metal")} · {label("purity")}
            </th>
            <th className="py-1.5 pr-1 text-right font-semibold">{label("gross_weight")}</th>
            <th className="py-1.5 pr-1 text-right font-semibold">{label("net_weight")}</th>
            <th className="py-1.5 pr-1 text-right font-semibold">{label("rate_per_gram")}</th>
            <th className="py-1.5 text-right font-semibold">{label("amount")}</th>
          </tr>
        </thead>
        <tbody>
          {invoice.lines.map((line) => (
            <tr key={`${line.line_no}-${line.article_number}`} className="border-b border-neutral-300 align-top">
              <td className="py-1.5 pr-1">
                <p className="font-semibold">{line.description}</p>
                <p className="font-mono text-[10px] text-neutral-600">
                  {compact || !line.barcode || line.barcode === line.article_number
                    ? line.article_number
                    : `${line.article_number} · ${line.barcode}`}
                </p>
              </td>
              <td className="py-1.5 pr-1">
                {formatMetalLabel(line.metal)} {line.purity}
              </td>
              <td className="py-1.5 pr-1 text-right tabular-nums">{formatGrams(line.gross_weight_grams)}</td>
              <td className="py-1.5 pr-1 text-right tabular-nums">{formatGrams(line.net_metal_weight_grams)}</td>
              <td className="py-1.5 pr-1 text-right tabular-nums">
                {line.rate_per_gram ? formatInr(line.rate_per_gram) : "—"}
              </td>
              <td className="py-1.5 text-right font-medium tabular-nums">{formatInr(line.line_total_inr)}</td>
            </tr>
          ))}
          <tr className="border-t border-black font-semibold">
            <td className="py-1.5 pr-1" colSpan={2}>
              {label("weight_total")}
            </td>
            <td className="py-1.5 pr-1 text-right tabular-nums">{formatGrams(grossSum)}</td>
            <td className="py-1.5 pr-1 text-right tabular-nums">{formatGrams(netSum)}</td>
            <td className="py-1.5 pr-1" />
            <td className="py-1.5" />
          </tr>
        </tbody>
      </table>

      <TotalsBlock invoice={invoice} label={label} componentTotals={componentTotals} thermal={false} />

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
  const paidInFull = isZeroMoney(invoice.amount_due_inr);

  return (
    <>
      <dl className={`text-sm ${thermal ? "w-full text-[11px]" : "ml-auto w-80"}`}>
        {componentTotals.map(([compLabel, value]) => (
          <div key={compLabel} className="flex justify-between gap-4 py-0.5">
            <dt>{compLabel}</dt>
            <dd className="tabular-nums">{formatInr(value)}</dd>
          </div>
        ))}
        <div className={`mt-1 flex justify-between gap-4 border-t-2 border-black pt-2 ${thermal ? "text-base" : ""}`}>
          <dt className="font-bold">{label("grand_total")}</dt>
          <dd className="font-bold tabular-nums">{formatInr(invoice.grand_total_inr)}</dd>
        </div>
        {!isZeroMoney(invoice.amount_paid_inr) ? (
          <div className="flex justify-between gap-4 py-0.5">
            <dt>{label("paid")}</dt>
            <dd className="tabular-nums">{formatInr(invoice.amount_paid_inr)}</dd>
          </div>
        ) : null}
        {paidInFull ? (
          <div className="flex justify-between gap-4 py-0.5 font-semibold">
            <dt>{label("paid_in_full")}</dt>
            <dd />
          </div>
        ) : (
          <div className="flex justify-between gap-4 py-0.5 font-bold">
            <dt>{label("due")}</dt>
            <dd className="tabular-nums">{formatInr(invoice.amount_due_inr)}</dd>
          </div>
        )}
      </dl>

      <p className={`mt-2 leading-snug ${thermal ? "text-[10px]" : "text-xs"}`}>
        <span className="font-semibold">{label("amount_in_words")}: </span>
        {amountInrInWords(invoice.grand_total_inr)}
      </p>

      {invoice.collections.length > 0 && !thermal ? (
        <section className="mt-4 text-xs">
          <p className="mb-1 font-semibold">{label("collections")}</p>
          <ul className="space-y-0.5">
            {invoice.collections.map((row) => (
              <li key={`${row.receipt_number}-${row.business_date}-${row.amount_inr}`} className="flex justify-between gap-3">
                <span>
                  {row.receipt_number} · {formatMethodLabel(row.method)} · {row.business_date}
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
