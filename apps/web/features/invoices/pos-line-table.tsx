"use client";

import { useState } from "react";
import {
  Dialog as AriaDialog,
  DialogTrigger as AriaDialogTrigger,
  Popover as AriaPopover,
} from "react-aria-components";
import type { Invoice, InvoiceLine, InvoiceLinePricing } from "@aabhushan/contracts";
import { DEFAULT_INVOICE_LINE_PRICING } from "@aabhushan/contracts";
import { Receipt, Trash01 } from "@untitledui/icons";

import { EmptyState } from "@/components/application/empty-state/empty-state";
import { Table } from "@/components/application/table/table";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { MoneyInput } from "@/components/shared/money-input";
import { MoneyText } from "@/components/shared/money-text";
import { SegmentedField } from "@/components/shared/segmented-field";
import {
  defaultMakingValue,
  formatGramsDisplay,
  formatInr,
  isZeroMoney,
  lineArticleTitle,
  makingValueFieldMeta,
  validateMakingValue,
} from "@/features/invoices/invoice-shared";
import { cx } from "@/utils/cx";

type MakingMethod = InvoiceLinePricing["making_charge"]["method"];

export type InlineMakingState = {
  method: MakingMethod;
  value: string;
};

function makingMethodOf(line: InvoiceLine): MakingMethod {
  return line.pricing?.making_charge.method ?? "fixed";
}

function makingValueOf(line: InvoiceLine): string {
  const making = line.pricing?.making_charge ?? DEFAULT_INVOICE_LINE_PRICING.making_charge;
  if (making.method === "fixed") {
    return making.amount_inr;
  }
  if (making.method === "per_gram") {
    return making.rate_per_gram;
  }
  return making.percent;
}

function makingIsDirty(line: InvoiceLine, state: InlineMakingState): boolean {
  return state.method !== makingMethodOf(line) || state.value !== makingValueOf(line);
}

function makingDisplayLabel(line: InvoiceLine, state?: InlineMakingState): string {
  const method = state?.method ?? makingMethodOf(line);
  const value = state?.value ?? makingValueOf(line);
  if (method === "fixed") {
    const shaped = /^\d+(\.\d{1,2})?$/.test(value.trim());
    return `${shaped ? formatInr(value) : value} making`;
  }
  if (method === "per_gram") {
    return `₹${value}/g`;
  }
  return `${value}% metal`;
}

function pricingBadges(line: InvoiceLine) {
  const pricing = line.pricing;
  const badges: Array<{ key: string; label: string }> = [];
  if (pricing?.wastage?.method === "percent_of_net_weight") {
    badges.push({ key: "wastage", label: "Wastage" });
  }
  if ((pricing?.stone_charges?.length ?? 0) > 0) {
    badges.push({ key: "stones", label: "Stones" });
  }
  if (pricing?.line_discount) {
    badges.push({ key: "discount", label: "Discount" });
  }
  return badges;
}

function formatMetalLabel(metal: string): string {
  if (!metal) {
    return metal;
  }
  return metal.charAt(0).toUpperCase() + metal.slice(1).toLowerCase();
}

function netMetalFooter(lines: InvoiceLine[]): string | null {
  const byMetal = new Map<string, number>();
  for (const line of lines) {
    const n = Number.parseFloat(line.net_metal_weight_grams);
    if (!Number.isFinite(n)) {
      continue;
    }
    const key = line.metal.toLowerCase();
    byMetal.set(key, (byMetal.get(key) ?? 0) + n);
  }
  if (byMetal.size === 0) {
    return null;
  }
  const parts = [...byMetal.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([metal, grams]) => `${grams.toFixed(2)} g ${metal}`);
  return parts.join(" · ");
}

function weightsDiffer(gross: string, net: string): boolean {
  const grossGrams = Number.parseFloat(gross);
  const netGrams = Number.parseFloat(net);
  if (!Number.isFinite(grossGrams) || !Number.isFinite(netGrams)) {
    return false;
  }
  return Math.abs(grossGrams - netGrams) > 0.00005;
}

function MakingPopoverCell({
  line,
  makingState,
  patchPending,
  onInlineMakingChange,
  onApplyMaking,
}: {
  line: InvoiceLine;
  makingState: InlineMakingState;
  patchPending: boolean;
  onInlineMakingChange: (articleId: string, next: InlineMakingState) => void;
  onApplyMaking: (line: InvoiceLine) => void;
}) {
  const [open, setOpen] = useState(false);
  const dirty = makingIsDirty(line, makingState);
  const makingCheck = validateMakingValue(makingState.method, makingState.value);
  const makingValid = makingCheck.valid;
  const makingMeta = makingValueFieldMeta(makingState.method);
  const label = makingDisplayLabel(line, makingState);

  function applyAndClose() {
    if (patchPending || !dirty || !makingValid) {
      return;
    }
    onApplyMaking(line);
    setOpen(false);
  }

  return (
    <AriaDialogTrigger isOpen={open} onOpenChange={setOpen}>
      <Button
        color="secondary"
        size="lg"
        className="justify-start"
        aria-label={`Edit making for ${line.article_number}`}
      >
        {dirty ? "Unsaved" : label}
      </Button>
      <AriaPopover
        placement="bottom start"
        className={({ isEntering, isExiting }) =>
          cx(
            "w-96 origin-(--trigger-anchor-point) rounded-lg bg-primary p-4 shadow-lg ring-1 ring-secondary_alt outline-hidden",
            isEntering && "duration-150 ease-out animate-in fade-in",
            isExiting && "duration-100 ease-in animate-out fade-out",
          )
        }
      >
        <AriaDialog className="outline-hidden">
          <div className="flex flex-col gap-3">
            <SegmentedField
              label="Making method"
              size="md"
              selection="quiet"
              value={makingState.method}
              onChange={(method) => {
                onInlineMakingChange(line.article_id, {
                  method,
                  value: defaultMakingValue(method),
                });
              }}
              options={[
                { label: "Fixed ₹", value: "fixed" },
                { label: "₹/g", value: "per_gram" },
                { label: "% metal", value: "percent_of_metal" },
              ]}
            />
            {makingMeta.unit === "money" ? (
              <MoneyInput
                label={makingMeta.label}
                size="md"
                placeholder={makingMeta.placeholder}
                value={makingState.value}
                isInvalid={!makingValid}
                error={makingCheck.hint ?? undefined}
                onChange={(value) =>
                  onInlineMakingChange(line.article_id, {
                    method: makingState.method,
                    value,
                  })
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    event.stopPropagation();
                    applyAndClose();
                  }
                }}
              />
            ) : (
              <Input
                label={makingMeta.label}
                aria-label={makingMeta.ariaLabel}
                placeholder={makingMeta.placeholder}
                size="md"
                value={makingState.value}
                isInvalid={!makingValid}
                error={makingCheck.hint ?? undefined}
                inputMode="decimal"
                suffix={makingMeta.unit === "per_gram" ? "₹/g" : "%"}
                onChange={(value) =>
                  onInlineMakingChange(line.article_id, {
                    method: makingState.method,
                    value,
                  })
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    event.stopPropagation();
                    applyAndClose();
                  }
                }}
              />
            )}
            <Button
              color="primary"
              size="lg"
              isDisabled={patchPending || !dirty || !makingValid}
              onPress={applyAndClose}
            >
              Apply
            </Button>
          </div>
        </AriaDialog>
      </AriaPopover>
    </AriaDialogTrigger>
  );
}

export function PosLineTable({
  invoice,
  lines,
  inlineMaking,
  patchPending,
  readOnly,
  onInlineMakingChange,
  onApplyMaking,
  onOpenPricing,
  onRemoveLine,
  onSetRate,
}: {
  invoice: Invoice | null;
  lines: InvoiceLine[];
  inlineMaking: Record<string, InlineMakingState>;
  patchPending: boolean;
  readOnly?: boolean;
  onInlineMakingChange: (articleId: string, next: InlineMakingState) => void;
  onApplyMaking: (line: InvoiceLine) => void;
  onOpenPricing: (line: InvoiceLine) => void;
  onRemoveLine: (articleId: string) => void;
  onSetRate?: () => void;
}) {
  const isDraft = !readOnly && invoice?.status === "draft";
  const lineRows = lines.map((line) => {
    const draft = inlineMaking[line.article_id];
    return {
      ...line,
      making_draft_method: draft?.method ?? makingMethodOf(line),
      making_draft_value: draft?.value ?? makingValueOf(line),
    };
  });
  const metalFooter = netMetalFooter(lines);

  return (
    <>
      {lines.length === 0 ? (
        <EmptyState size="md" className="mx-auto py-10">
          <EmptyState.Header pattern="none">
            <div className="mb-3 flex size-12 items-center justify-center rounded-lg bg-secondary ring-1 ring-secondary ring-inset">
              <Receipt className="size-6 text-fg-quaternary" aria-hidden="true" />
            </div>
            <EmptyState.Content>
              <p className="text-lg font-semibold text-primary">No lines yet</p>
              <EmptyState.Description>
                Select a customer, then scan a tag or browse available stock.
              </EmptyState.Description>
            </EmptyState.Content>
          </EmptyState.Header>
        </EmptyState>
      ) : (
        <>
          <Table aria-label="Invoice lines" size="md">
            <Table.Header>
              <Table.Head id="article" isRowHeader>
                <span className="text-sm font-semibold whitespace-nowrap text-quaternary">
                  Article · {lines.length}
                </span>
              </Table.Head>
              <Table.Head id="net" className="text-right">
                <span className="text-sm font-semibold whitespace-nowrap text-quaternary">Net</span>
              </Table.Head>
              <Table.Head id="rate" className="text-right">
                <span className="text-sm font-semibold whitespace-nowrap text-quaternary">Rate/g</span>
              </Table.Head>
              <Table.Head id="making">
                <span className="text-sm font-semibold whitespace-nowrap text-quaternary">Making</span>
              </Table.Head>
              <Table.Head id="line" className="text-right">
                <span className="text-sm font-semibold whitespace-nowrap text-quaternary">
                  Line total
                </span>
              </Table.Head>
              {isDraft ? <Table.Head id="actions" /> : null}
            </Table.Header>
            <Table.Body items={lineRows}>
              {(line) => {
                const makingState: InlineMakingState = {
                  method: line.making_draft_method,
                  value: line.making_draft_value,
                };
                const badges = pricingBadges(line);
                const category = lineArticleTitle(line.description, line.article_number);
                const missingRate = !line.rate_per_gram;
                const lineTotalMissing = missingRate || isZeroMoney(line.line_total_inr);

                return (
                  <Table.Row
                    id={line.id}
                    className={missingRate ? "bg-error-primary hover:bg-error-primary" : undefined}
                  >
                    <Table.Cell className="font-medium text-primary" truncate={false}>
                      <span className="flex h-full flex-col justify-center gap-0.5 overflow-hidden">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-md font-bold text-primary">{category}</span>
                          {badges.map((badge) => (
                            <Badge key={badge.key} color="gray" size="md">
                              {badge.label}
                            </Badge>
                          ))}
                        </span>
                        <span className="truncate font-mono text-sm font-normal text-tertiary">
                          {line.article_number} · {formatMetalLabel(line.metal)} {line.purity}
                        </span>
                      </span>
                    </Table.Cell>
                    <Table.Cell className="text-right text-md font-semibold tabular-nums" truncate={false}>
                      <span className="flex h-full flex-col items-end justify-center gap-0.5 overflow-hidden">
                        <span>{formatGramsDisplay(line.net_metal_weight_grams)}</span>
                        {weightsDiffer(line.gross_weight_grams, line.net_metal_weight_grams) ? (
                          <span className="text-sm font-normal text-tertiary">
                            Gross {formatGramsDisplay(line.gross_weight_grams)}
                          </span>
                        ) : null}
                      </span>
                    </Table.Cell>
                    <Table.Cell className="text-right text-md">
                      {line.rate_per_gram ? (
                        <span className="tabular-nums">{formatInr(line.rate_per_gram)}</span>
                      ) : isDraft && onSetRate ? (
                        <Button color="secondary" size="lg" onPress={onSetRate}>
                          Set rate
                        </Button>
                      ) : (
                        <span className="text-sm font-medium text-error-primary">No rate</span>
                      )}
                    </Table.Cell>
                    <Table.Cell truncate={false}>
                      {isDraft ? (
                        <MakingPopoverCell
                          line={line}
                          makingState={makingState}
                          patchPending={patchPending}
                          onInlineMakingChange={onInlineMakingChange}
                          onApplyMaking={onApplyMaking}
                        />
                      ) : (
                        <span className="text-md font-medium text-primary">
                          {makingDisplayLabel(line)}
                        </span>
                      )}
                    </Table.Cell>
                    <Table.Cell className="text-right text-md font-bold tabular-nums">
                      {lineTotalMissing && missingRate ? (
                        <span className="text-quaternary">—</span>
                      ) : (
                        <MoneyText amount={line.line_total_inr} />
                      )}
                    </Table.Cell>
                    {isDraft ? (
                      <Table.Cell truncate={false}>
                        <div className="flex flex-nowrap items-center justify-end gap-2">
                          <Button
                            color="secondary"
                            size="lg"
                            onPress={() => onOpenPricing(line)}
                          >
                            Pricing
                          </Button>
                          <Button
                            color="tertiary-destructive"
                            size="lg"
                            iconLeading={Trash01}
                            isDisabled={patchPending}
                            aria-label={`Remove ${line.article_number}`}
                            onPress={() => onRemoveLine(line.article_id)}
                          />
                        </div>
                      </Table.Cell>
                    ) : null}
                  </Table.Row>
                );
              }}
            </Table.Body>
          </Table>
          {metalFooter ? (
            <p className="border-t border-secondary px-5 py-4 text-sm text-tertiary">
              Net metal: <span className="font-semibold text-primary">{metalFooter}</span>
            </p>
          ) : null}
        </>
      )}
    </>
  );
}

export { makingMethodOf, makingValueOf };
