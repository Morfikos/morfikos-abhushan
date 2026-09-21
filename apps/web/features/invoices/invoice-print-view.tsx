"use client";

import { useQuery } from "@tanstack/react-query";
import { bilingualLabel } from "@aabhushan/contracts";

import { PrintDocumentSkeleton } from "@/components/application/skeleton/skeleton";
import { isThermalPrint, printMaxWidthClass, printPageCss } from "@/features/documents/print-paper";
import { invoiceAccessToken, invoiceErrorMessage } from "@/features/invoices/invoice-shared";
import { formatInr } from "@/lib/money";
import { fetchInvoicePrint } from "@/lib/staff-api";

export function InvoicePrintView({ invoiceId }: { invoiceId: string }) {
  const query = useQuery({
    queryKey: ["invoice-print", invoiceId],
    queryFn: async () => fetchInvoicePrint(await invoiceAccessToken(), invoiceId),
  });

  if (query.isLoading) {
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
  const thermal = isThermalPrint(invoice.invoice_paper_size);
  const totals = [
    [bilingualLabel("metal"), invoice.metal_value_inr],
    [bilingualLabel("making"), invoice.making_charges_inr],
    [bilingualLabel("wastage"), invoice.wastage_inr],
    [bilingualLabel("stones"), invoice.stone_charges_inr],
    [bilingualLabel("discount"), invoice.discount_inr],
    [bilingualLabel("tax"), invoice.tax_inr],
    [bilingualLabel("round_off"), invoice.round_off_inr],
    [bilingualLabel("grand_total"), invoice.grand_total_inr],
    [bilingualLabel("paid"), invoice.amount_paid_inr],
    [bilingualLabel("due"), invoice.amount_due_inr],
  ] as const;

  return (
    <div
      className={`mx-auto bg-white p-8 text-black print:p-0 ${printMaxWidthClass(invoice.invoice_paper_size)} font-[family-name:var(--font-print-doc)]`}
    >
      <style>{printPageCss(invoice.invoice_paper_size)}</style>
      <header className="mb-6 border-b border-black pb-4">
        <h1 className={`${thermal ? "text-lg" : "text-2xl"} font-bold`}>{invoice.shop_legal_name}</h1>
        {invoice.shop_address_line ? <p className="text-sm">{invoice.shop_address_line}</p> : null}
        {invoice.shop_phone ? <p className="text-sm">{invoice.shop_phone}</p> : null}
      </header>
      <h2 className={`mb-2 font-semibold ${thermal ? "text-base" : "text-xl"}`}>
        {bilingualLabel("tax_invoice")}
      </h2>
      <p className="text-sm tabular-nums">
        {bilingualLabel("invoice")}: {invoice.invoice_number}
      </p>
      <p className="text-sm tabular-nums">
        {bilingualLabel("business_date")}: {invoice.business_date}
      </p>
      <p className="mb-4 text-sm">
        {bilingualLabel("customer")}: {invoice.customer_display_name}
      </p>
      {thermal ? (
        <ul className="mb-6 space-y-2 text-sm">
          {invoice.lines.map((line) => (
            <li key={`${line.article_number}-${line.description}`} className="border-b border-neutral-300 pb-2">
              <span className="font-mono text-xs">{line.article_number}</span>
              <br />
              {line.description}
              <div className="text-right tabular-nums">{formatInr(line.line_total_inr)}</div>
            </li>
          ))}
        </ul>
      ) : (
        <table className="mb-6 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-black text-left">
              <th className="py-1">{bilingualLabel("article")}</th>
              <th className="py-1 text-right">{bilingualLabel("amount")}</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((line) => (
              <tr key={`${line.article_number}-${line.description}`} className="border-b border-neutral-300">
                <td className="py-1">
                  <span className="font-mono text-xs">{line.article_number}</span>
                  <br />
                  {line.description}
                </td>
                <td className="py-1 text-right tabular-nums">{formatInr(line.line_total_inr)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <dl className={`text-sm ${thermal ? "w-full" : "ml-auto w-72"}`}>
        {totals.map(([label, value]) => (
          <div key={label} className={`flex justify-between gap-4 py-0.5 ${thermal ? "flex-col gap-0" : ""}`}>
            <dt className={label.includes("Grand total") ? "font-semibold" : undefined}>{label}</dt>
            <dd
              className={`tabular-nums ${label.includes("Grand total") ? "font-semibold" : ""} ${thermal ? "text-right" : ""}`}
            >
              {formatInr(value)}
            </dd>
          </div>
        ))}
      </dl>
      {invoice.invoice_footer ? <p className="mt-8 text-xs">{invoice.invoice_footer}</p> : null}
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
