"use client";

import type { Invoice, PaymentMethod } from "@aabhushan/contracts";

import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { MethodSelect } from "@/components/shared/method-select";
import { MoneyInput } from "@/components/shared/money-input";
import { MoneyText } from "@/components/shared/money-text";
import { SelectField } from "@/components/shared/select-field";
import { isZeroMoney } from "@/features/invoices/invoice-shared";

export type TenderRow = {
  id: string;
  method: PaymentMethod;
  amount_inr: string;
  reference: string;
};

export type InvoiceDiscountMode = "none" | "amount" | "percent";

function TotalsRow({ label, amount }: { label: string; amount: string }) {
  const zero = isZeroMoney(amount);
  return (
    <div className="flex justify-between gap-3">
      <dt className={zero ? "text-quaternary" : "text-tertiary"}>{label}</dt>
      <MoneyText
        amount={amount}
        as="dd"
        className={zero ? "text-quaternary" : "text-primary"}
      />
    </div>
  );
}

export function PosTotalsPanel({
  invoice,
  quoteBlocked,
  missingRate,
  canFinalize,
  canPayFull,
  finalizeReason,
  finalizePending,
  patchPending,
  invoiceDiscountMode,
  invoiceDiscountValue,
  tenders,
  onInvoiceDiscountModeChange,
  onInvoiceDiscountValueChange,
  onApplyInvoiceDiscount,
  onPayGrandTotal,
  onTenderMethodChange,
  onTenderAmountChange,
  onFinalize,
}: {
  invoice: Invoice | null;
  quoteBlocked: boolean;
  missingRate: boolean;
  canFinalize: boolean;
  canPayFull: boolean;
  finalizeReason: string | null;
  finalizePending: boolean;
  patchPending: boolean;
  invoiceDiscountMode: InvoiceDiscountMode;
  invoiceDiscountValue: string;
  tenders: TenderRow[];
  onInvoiceDiscountModeChange: (mode: InvoiceDiscountMode) => void;
  onInvoiceDiscountValueChange: (value: string) => void;
  onApplyInvoiceDiscount: () => void;
  onPayGrandTotal: () => void;
  onTenderMethodChange: (tenderId: string, method: PaymentMethod) => void;
  onTenderAmountChange: (tenderId: string, amount: string) => void;
  onFinalize: () => void;
}) {
  const lines = invoice?.lines ?? [];
  const hasAppliedDiscount = Boolean(invoice?.invoice_discount);
  const showDiscountApply =
    invoiceDiscountMode !== "none" || hasAppliedDiscount;
  const showDiscountValue = invoiceDiscountMode !== "none";

  return (
    <aside className="sticky top-4 flex min-w-[min(100%,18rem)] flex-col gap-4 rounded-xl bg-primary p-4 shadow-xs ring-1 ring-secondary md:max-lg:static">
      <div>
        <h2 className="text-lg font-semibold text-primary">Totals</h2>
      </div>

      {quoteBlocked ? (
        <div className="flex flex-col gap-2 rounded-lg bg-warning-primary px-3 py-2 text-sm text-primary" role="status">
          {missingRate ? (
            <>
              <span>
                Today&apos;s metal rate is missing for a line on this draft. Totals stay blocked until rates are
                set.
              </span>
              {invoice?.quote_error ? (
                <span className="text-tertiary">{invoice.quote_error.message}</span>
              ) : null}
              <Button color="secondary" size="sm" href="/settings?tab=rates">
                Open daily rates
              </Button>
            </>
          ) : (
            <>
              Quote blocked. Fix line pricing or check calculation inputs.
              {invoice?.quote_error ? (
                <span className="mt-1 block text-tertiary">{invoice.quote_error.message}</span>
              ) : null}
            </>
          )}
        </div>
      ) : (
        <>
          <div className="rounded-lg bg-brand-primary px-3 py-3">
            <p className="text-sm font-medium text-brand-secondary">Grand total</p>
            <MoneyText
              amount={invoice?.grand_total_inr ?? "0"}
              as="p"
              className="text-2xl font-semibold text-brand-primary md:text-display-sm"
            />
          </div>
          <dl className="flex flex-col gap-2 text-sm">
            <TotalsRow label="Metal" amount={invoice?.metal_value_inr ?? "0"} />
            <TotalsRow label="Making" amount={invoice?.making_charges_inr ?? "0"} />
            <TotalsRow label="Wastage" amount={invoice?.wastage_inr ?? "0"} />
            <TotalsRow label="Stones" amount={invoice?.stone_charges_inr ?? "0"} />
            <TotalsRow label="Discount" amount={invoice?.discount_inr ?? "0"} />
            <TotalsRow label="Tax" amount={invoice?.tax_inr ?? "0"} />
            <TotalsRow label="Round-off" amount={invoice?.round_off_inr ?? "0"} />
          </dl>
        </>
      )}

      {!canFinalize && finalizeReason ? (
        <p className="text-xs text-tertiary" role="status">
          {finalizeReason}
        </p>
      ) : null}

      {invoice?.status === "draft" && lines.length > 0 ? (
        <div className="flex flex-col gap-2 border-t border-secondary pt-3">
          <p className="text-sm font-medium text-primary">Invoice discount</p>
          <SelectField
            label="Method"
            value={invoiceDiscountMode}
            onChange={(value) => onInvoiceDiscountModeChange(value as InvoiceDiscountMode)}
            options={[
              { label: "None", value: "none" },
              { label: "Fixed ₹", value: "amount" },
              { label: "Percent", value: "percent" },
            ]}
          />
          {showDiscountValue ? (
            invoiceDiscountMode === "amount" ? (
              <MoneyInput
                label="Amount"
                value={invoiceDiscountValue}
                onChange={onInvoiceDiscountValueChange}
              />
            ) : (
              <Input
                label="Percent"
                value={invoiceDiscountValue}
                onChange={onInvoiceDiscountValueChange}
              />
            )
          ) : null}
          {showDiscountApply ? (
            <Button
              color="secondary"
              size="md"
              isDisabled={patchPending}
              isLoading={patchPending}
              onPress={onApplyInvoiceDiscount}
            >
              {invoiceDiscountMode === "none" && hasAppliedDiscount
                ? "Clear invoice discount"
                : "Apply invoice discount"}
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 border-t border-secondary pt-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-primary">Optional initial tender</p>
          <Button color="tertiary" size="sm" isDisabled={!canPayFull} onPress={onPayGrandTotal}>
            Pay grand total
          </Button>
        </div>
        {tenders.map((row) => (
          <div key={row.id} className="flex flex-col gap-2">
            <MethodSelect
              label="Method"
              value={row.method}
              onChange={(method) => onTenderMethodChange(row.id, method)}
            />
            <MoneyInput
              label="Amount"
              value={row.amount_inr}
              onChange={(value) => onTenderAmountChange(row.id, value)}
            />
          </div>
        ))}
      </div>

      <Button
        color="primary"
        size="lg"
        isDisabled={!canFinalize}
        isLoading={finalizePending}
        onPress={onFinalize}
      >
        Finalize invoice
      </Button>
      {invoice ? (
        <p className="text-xs text-tertiary">Totals refresh from the shop rates when you change lines.</p>
      ) : null}
    </aside>
  );
}
