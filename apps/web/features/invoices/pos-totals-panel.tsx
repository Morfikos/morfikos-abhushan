"use client";

import type { ReactNode } from "react";
import type { Invoice, InvoiceLine, PaymentMethod } from "@aabhushan/contracts";
import { useQuery } from "@tanstack/react-query";
import { Trash01 } from "@untitledui/icons";

import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { MoneyInput } from "@/components/shared/money-input";
import { MoneyText } from "@/components/shared/money-text";
import { MethodSelect } from "@/components/shared/method-select";
import { SegmentedField } from "@/components/shared/segmented-field";
import { useStaff } from "@/features/auth/staff-shell";
import { ThermalPaperEdges } from "@/features/documents/thermal-paper-edges";
import {
  formatGramsDisplay,
  isZeroMoney,
  lineArticleTitle,
} from "@/features/invoices/invoice-shared";
import { formatInr, subtractMoney, sumMoney } from "@/lib/money";
import { paymentMethodLabel } from "@/lib/payment-methods";
import { fetchShopProfile, StaffApiError } from "@/lib/staff-api";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { cx } from "@/utils/cx";

export type TenderRow = {
  id: string;
  method: PaymentMethod;
  amount_inr: string;
  reference: string;
};

export type InvoiceDiscountMode = "none" | "amount" | "percent";

const railClassName =
  "sticky top-4 flex max-h-[calc(100dvh-2rem)] min-w-[min(100%,20rem)] flex-col overflow-hidden rounded-xl shadow-xs ring-1 ring-secondary md:max-lg:static lg:w-[320px]";

async function shopProfileAccessToken(): Promise<string> {
  const supabase = createBrowserSupabaseClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new StaffApiError(401, "AUTH_INVALID", "Sign in is required.");
  }
  return token;
}

function useShopLegalName(): string {
  const staff = useStaff();
  const profileQuery = useQuery({
    queryKey: ["shop", "profile", staff.membership.organization_id],
    queryFn: async () => fetchShopProfile(await shopProfileAccessToken()),
  });
  return profileQuery.data?.legal_name ?? "Aabhushan";
}

function formatMetalLabel(metal: string): string {
  if (!metal) {
    return metal;
  }
  return metal.charAt(0).toUpperCase() + metal.slice(1).toLowerCase();
}

function SlipHeader({
  shopLegalName,
  status,
  invoiceNumber,
  billToName,
}: {
  shopLegalName: string;
  status: string;
  invoiceNumber?: string | null;
  billToName?: string | null;
}) {
  return (
    <header className="px-5 py-4 text-center">
      <p className="text-md font-bold text-primary">{shopLegalName}</p>
      <p className="mt-1 text-sm font-semibold tracking-wide text-tertiary uppercase">{status}</p>
      {invoiceNumber ? (
        <p className="mt-0.5 font-mono text-sm text-tertiary">{invoiceNumber}</p>
      ) : null}
      {billToName ? <p className="mt-2 truncate text-sm text-tertiary">{billToName}</p> : null}
    </header>
  );
}

function SlipSection({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("border-t border-dashed border-secondary px-5 py-4", className)}>
      {children}
    </div>
  );
}

function SlipLineItems({
  lines,
  quoteBlocked,
}: {
  lines: InvoiceLine[];
  quoteBlocked?: boolean;
}) {
  if (lines.length === 0) {
    return null;
  }
  return (
    <SlipSection className="flex flex-col gap-0">
      <ul className="flex flex-col">
        {lines.map((line, index) => {
          const title = lineArticleTitle(line.description, line.article_number);
          const mutedTotal = quoteBlocked || isZeroMoney(line.line_total_inr);
          return (
            <li
              key={line.id}
              className={cx(
                "flex justify-between gap-3 py-2.5 text-sm",
                index > 0 && "border-t border-dashed border-secondary",
              )}
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-primary">{title}</p>
                <p className="font-mono text-sm text-tertiary">
                  {line.article_number} · {formatMetalLabel(line.metal)} {line.purity}
                </p>
                <p className="text-sm tabular-nums text-tertiary">
                  {formatGramsDisplay(line.net_metal_weight_grams)} g
                </p>
              </div>
              {mutedTotal ? (
                <span className="shrink-0 font-semibold text-quaternary">—</span>
              ) : (
                <MoneyText
                  amount={line.line_total_inr}
                  as="span"
                  className="shrink-0 font-semibold text-primary"
                />
              )}
            </li>
          );
        })}
      </ul>
    </SlipSection>
  );
}

function SlipTotalFooter({
  amount,
  muted,
  children,
}: {
  amount: string | null;
  muted?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="mt-auto flex shrink-0 flex-col gap-3 border-t-2 border-primary px-5 py-4">
      <div>
        <p className="text-sm font-semibold tracking-wide text-tertiary uppercase">Total</p>
        {muted || amount == null ? (
          <p className="mt-0.5 text-display-sm font-bold text-quaternary tabular-nums">—</p>
        ) : (
          <MoneyText
            amount={amount}
            as="p"
            className="mt-0.5 min-w-0 text-display-sm font-bold break-words text-primary tabular-nums"
          />
        )}
      </div>
      {children}
    </div>
  );
}

function TotalsRow({ label, amount }: { label: string; amount: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-tertiary">{label}</dt>
      <MoneyText amount={amount} as="dd" className="text-primary" />
    </div>
  );
}

function BlockedTotalsRow({ label }: { label: string }) {
  return (
    <div className="flex justify-between gap-3 text-quaternary">
      <dt>{label}</dt>
      <dd>—</dd>
    </div>
  );
}

function breakdownRows(invoice: Invoice | null): Array<{ label: string; amount: string }> {
  if (!invoice) {
    return [];
  }
  return (
    [
      { label: "Metal", amount: invoice.metal_value_inr },
      { label: "Making", amount: invoice.making_charges_inr },
      { label: "Wastage", amount: invoice.wastage_inr },
      { label: "Stones", amount: invoice.stone_charges_inr },
      { label: "Discount", amount: invoice.discount_inr },
      { label: "Tax", amount: invoice.tax_inr },
      { label: "Round-off", amount: invoice.round_off_inr },
    ] as const
  ).filter((row) => !isZeroMoney(row.amount));
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
  discountOpen,
  tenders,
  documentStatusLabel,
  whatsappStatusLabel,
  onDiscountOpenChange,
  onInvoiceDiscountModeChange,
  onInvoiceDiscountValueChange,
  onApplyInvoiceDiscount,
  onPayRemaining,
  onAddPayment,
  onRemoveTender,
  onTenderMethodChange,
  onTenderAmountChange,
  onFinalize,
  onNewSale,
  onOpenInvoice,
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
  discountOpen: boolean;
  tenders: TenderRow[];
  documentStatusLabel?: string | null;
  whatsappStatusLabel?: string | null;
  onDiscountOpenChange: (open: boolean) => void;
  onInvoiceDiscountModeChange: (mode: InvoiceDiscountMode) => void;
  onInvoiceDiscountValueChange: (value: string) => void;
  onApplyInvoiceDiscount: () => void;
  onPayRemaining: () => void;
  onAddPayment: () => void;
  onRemoveTender: (tenderId: string) => void;
  onTenderMethodChange: (tenderId: string, method: PaymentMethod) => void;
  onTenderAmountChange: (tenderId: string, amount: string) => void;
  onFinalize: () => void;
  onNewSale?: () => void;
  onOpenInvoice?: () => void;
}) {
  const shopLegalName = useShopLegalName();
  const lines = invoice?.lines ?? [];
  const isFinalized = invoice?.status === "finalized";
  const hasAppliedDiscount = Boolean(invoice?.invoice_discount);
  const showDiscountForm = discountOpen;
  const showDiscountValue = invoiceDiscountMode !== "none";
  const collectingNow = sumMoney(tenders.map((row) => row.amount_inr.trim() || "0.00"));
  const grandTotal = invoice?.grand_total_inr ?? "0.00";
  const dueAfterSale = subtractMoney(grandTotal, collectingNow);
  const duePositive = !isZeroMoney(dueAfterSale) && !dueAfterSale.startsWith("-");
  const collectingPositive = !isZeroMoney(collectingNow);
  const paidInFull = !duePositive && !isZeroMoney(grandTotal);
  const visibleBreakdown = breakdownRows(invoice);
  const showPayments = invoice?.status === "draft" && lines.length > 0;
  const showEmptyQuoteHint =
    !quoteBlocked && lines.length === 0 && (invoice == null || invoice.status === "draft");

  if (isFinalized && invoice) {
    const due = invoice.amount_due_inr;
    const dueOpen = !isZeroMoney(due);
    return (
      <aside className={railClassName}>
        <ThermalPaperEdges className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <SlipHeader
              shopLegalName={shopLegalName}
              status="✓ Sale completed"
              invoiceNumber={invoice.invoice_number}
              billToName={invoice.customer_display_name}
            />
            <SlipLineItems lines={invoice.lines} />
            <SlipSection className="flex flex-col gap-3 text-sm">
              <dl className="flex flex-col gap-3">
                {tenders
                  .filter((row) => row.amount_inr.trim() !== "")
                  .map((row) => (
                    <div key={row.id} className="flex justify-between gap-3">
                      <dt className="text-tertiary">Paid · {paymentMethodLabel(row.method)}</dt>
                      <MoneyText amount={row.amount_inr} as="dd" className="text-primary" />
                    </div>
                  ))}
                {invoice.amount_paid_inr && tenders.every((row) => row.amount_inr.trim() === "") ? (
                  <div className="flex justify-between gap-3">
                    <dt className="text-tertiary">Paid</dt>
                    <MoneyText amount={invoice.amount_paid_inr} as="dd" className="text-primary" />
                  </div>
                ) : null}
                <div className="flex justify-between gap-3 font-bold">
                  <dt>Due</dt>
                  <dd className={dueOpen ? "text-error-primary" : "text-quaternary"}>
                    {dueOpen ? formatInr(due) : "—"}
                  </dd>
                </div>
              </dl>
            </SlipSection>
            <SlipSection className="flex flex-col gap-3 text-sm text-tertiary">
              <div className="flex justify-between gap-3">
                <span>Invoice PDF</span>
                <span className="font-semibold text-primary">{documentStatusLabel ?? "Pending"}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>WhatsApp</span>
                <span className="font-semibold text-primary">{whatsappStatusLabel ?? "—"}</span>
              </div>
            </SlipSection>
            <p className="px-5 py-3 text-center text-sm text-tertiary">Thank you</p>
          </div>
          <SlipTotalFooter amount={invoice.grand_total_inr}>
            <Button color="primary" size="lg" onPress={onNewSale}>
              New sale
            </Button>
            <Button
              color="secondary"
              size="lg"
              href={`/print/invoices/${invoice.id}?autoprint=1`}
              target="_blank"
            >
              Print
            </Button>
            {dueOpen ? (
              <Button color="secondary" size="lg" href={`/payments?invoice=${invoice.id}`}>
                Record payment for due
              </Button>
            ) : null}
            {onOpenInvoice ? (
              <Button color="link-color" size="md" className="justify-start px-0" onPress={onOpenInvoice}>
                Open invoice
              </Button>
            ) : null}
          </SlipTotalFooter>
        </ThermalPaperEdges>
      </aside>
    );
  }

  return (
    <aside className={railClassName}>
      {quoteBlocked ? (
        <div className="flex shrink-0 flex-col gap-3 bg-error-solid px-5 py-4 text-white" role="status">
          <p className="text-sm font-semibold tracking-wide uppercase">Totals blocked</p>
          {missingRate ? (
            <>
              <p className="text-sm font-bold leading-snug">
                {invoice?.quote_error?.message ?? "Today's metal rate is missing for a line on this draft."}
              </p>
              <p className="text-sm leading-snug text-white/90">
                Totals stay blocked until today&apos;s rates are set.
              </p>
              <Button
                color="secondary"
                size="lg"
                className="mt-1 w-full border border-white bg-transparent text-white ring-0 hover:bg-white/10"
                href="/settings?tab=rates"
              >
                Open daily rates
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm font-bold leading-snug">
                Quote blocked. Fix line pricing or check calculation inputs.
              </p>
              {invoice?.quote_error ? (
                <p className="text-sm leading-snug text-white/90">{invoice.quote_error.message}</p>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      <ThermalPaperEdges className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <SlipHeader
            shopLegalName={shopLegalName}
            status="Draft sale"
            billToName={invoice?.customer_display_name}
          />

          <SlipLineItems lines={lines} quoteBlocked={quoteBlocked} />

          <SlipSection>
            <dl className="flex flex-col gap-3 text-sm">
              {quoteBlocked ? (
                <>
                  <BlockedTotalsRow label="Metal" />
                  <BlockedTotalsRow label="Making" />
                  <BlockedTotalsRow label="Tax" />
                </>
              ) : (
                visibleBreakdown.map((row) => <TotalsRow key={row.label} label={row.label} amount={row.amount} />)
              )}
              {showEmptyQuoteHint ? (
                <p className="text-sm text-tertiary">Add articles to quote.</p>
              ) : null}
              {!quoteBlocked && invoice?.status === "draft" && lines.length > 0 ? (
                showDiscountForm ? (
                  <div className="mt-2 flex flex-col gap-2 border-t border-dashed border-secondary pt-3">
                    <p className="text-sm font-medium text-primary">Invoice discount</p>
                    <SegmentedField
                      label="Method"
                      selection="quiet"
                      value={invoiceDiscountMode}
                      onChange={onInvoiceDiscountModeChange}
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
                    <Button
                      color="secondary"
                      size="lg"
                      isDisabled={patchPending}
                      isLoading={patchPending}
                      onPress={onApplyInvoiceDiscount}
                    >
                      {invoiceDiscountMode === "none" && hasAppliedDiscount
                        ? "Clear invoice discount"
                        : "Apply"}
                    </Button>
                    <Button
                      color="link-gray"
                      size="md"
                      className="justify-start px-0"
                      onPress={() => onDiscountOpenChange(false)}
                    >
                      Hide discount
                    </Button>
                  </div>
                ) : hasAppliedDiscount ? (
                  <div className="mt-2 flex items-center justify-between gap-2 border-t border-dashed border-secondary pt-3">
                    <div className="flex min-w-0 items-baseline gap-2">
                      <span className="text-sm text-tertiary">Discount</span>
                      <MoneyText
                        amount={invoice.discount_inr}
                        as="span"
                        className="text-sm font-semibold text-primary"
                      />
                    </div>
                    <Button
                      color="link-color"
                      size="md"
                      className="shrink-0 px-0"
                      onPress={() => onDiscountOpenChange(true)}
                    >
                      Edit
                    </Button>
                  </div>
                ) : (
                  <Button
                    color="secondary"
                    size="lg"
                    className="mt-1 justify-start"
                    onPress={() => onDiscountOpenChange(true)}
                  >
                    + Invoice discount
                  </Button>
                )
              ) : null}
            </dl>
          </SlipSection>

          {showPayments ? (
            <SlipSection className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-md font-bold text-primary">Payments</p>
                <Button
                  color="secondary"
                  size="lg"
                  isDisabled={!canPayFull}
                  onPress={onPayRemaining}
                >
                  Pay remaining
                </Button>
              </div>
              {tenders.map((row) => (
                <div
                  key={row.id}
                  className="flex flex-col gap-2 rounded-lg p-3 ring-1 ring-secondary"
                >
                  <div className="flex items-center gap-2">
                    <MethodSelect
                      layout="menu"
                      value={row.method}
                      size="md"
                      className="min-w-0 flex-1"
                      onChange={(value) => onTenderMethodChange(row.id, value)}
                    />
                    <Button
                      color="tertiary"
                      size="md"
                      className="shrink-0"
                      iconLeading={Trash01}
                      aria-label="Remove payment"
                      isDisabled={tenders.length <= 1}
                      onPress={() => onRemoveTender(row.id)}
                    />
                  </div>
                  <MoneyInput
                    value={row.amount_inr}
                    size="md"
                    onChange={(value) => onTenderAmountChange(row.id, value)}
                    className="w-full"
                  />
                </div>
              ))}
              <Button
                color="secondary"
                size="lg"
                className="justify-start"
                onPress={onAddPayment}
              >
                + Add payment
              </Button>
              <div className="mt-1 overflow-hidden rounded-lg ring-1 ring-primary">
                <div className="px-4 py-4">
                  <p className="text-sm font-semibold tracking-wide text-tertiary uppercase">
                    Collecting now
                  </p>
                  <p
                    className={cx(
                      "mt-0.5 min-w-0 text-md font-bold break-words tabular-nums",
                      collectingPositive ? "text-primary" : "text-quaternary",
                    )}
                  >
                    {formatInr(collectingNow)}
                  </p>
                </div>
                <div
                  className={cx(
                    "border-t border-dashed border-secondary px-4 py-4",
                    duePositive && "bg-error-primary/10",
                  )}
                >
                  <p
                    className={cx(
                      "text-sm font-semibold tracking-wide uppercase",
                      duePositive ? "text-error-primary" : "text-tertiary",
                    )}
                  >
                    Due after sale
                  </p>
                  <p
                    className={cx(
                      "mt-0.5 min-w-0 text-md font-bold break-words tabular-nums",
                      duePositive ? "text-error-primary" : "text-primary",
                    )}
                  >
                    {duePositive
                      ? formatInr(dueAfterSale)
                      : paidInFull
                        ? "Paid in full"
                        : "—"}
                  </p>
                </div>
              </div>
            </SlipSection>
          ) : null}
        </div>

        <SlipTotalFooter amount={quoteBlocked ? null : grandTotal} muted={quoteBlocked}>
          {quoteBlocked ? (
            <Button color="primary" size="lg" className="opacity-45" isDisabled>
              Finalize invoice
            </Button>
          ) : (
            <Button
              color="primary"
              size="lg"
              className="justify-between"
              iconTrailing={<span aria-hidden="true">→</span>}
              isDisabled={!canFinalize}
              isLoading={finalizePending}
              onPress={onFinalize}
            >
              Finalize invoice
            </Button>
          )}
          {!canFinalize && finalizeReason ? (
            <p className="text-sm text-tertiary" role="status">
              {finalizeReason}
            </p>
          ) : null}
        </SlipTotalFooter>
      </ThermalPaperEdges>
    </aside>
  );
}
