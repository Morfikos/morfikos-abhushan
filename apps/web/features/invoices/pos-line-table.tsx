"use client";

import type { ReactNode } from "react";
import type { Invoice, InvoiceLine, InvoiceLinePricing } from "@aabhushan/contracts";
import { DEFAULT_INVOICE_LINE_PRICING } from "@aabhushan/contracts";
import { Receipt, Sliders04, Trash01 } from "@untitledui/icons";

import { EmptyState } from "@/components/application/empty-state/empty-state";
import { Table, TableCard } from "@/components/application/table/table";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Tooltip } from "@/components/base/tooltip/tooltip";
import { SelectField } from "@/components/shared/select-field";
import {
  defaultMakingValue,
  formatGrams,
  formatInr,
  lineArticleTitle,
  lineHasExtraPricing,
  makingValueFieldMeta,
  validateMakingValue,
} from "@/features/invoices/invoice-shared";

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

export function PosLineTable({
  invoice,
  lines,
  inlineMaking,
  patchPending,
  onInlineMakingChange,
  onApplyMaking,
  onOpenPricing,
  onRemoveLine,
}: {
  invoice: Invoice | null;
  lines: InvoiceLine[];
  inlineMaking: Record<string, InlineMakingState>;
  patchPending: boolean;
  onInlineMakingChange: (articleId: string, next: InlineMakingState) => void;
  onApplyMaking: (line: InvoiceLine) => void;
  onOpenPricing: (line: InvoiceLine) => void;
  onRemoveLine: (articleId: string) => void;
}) {
  const isDraft = invoice?.status === "draft";
  // Include making drafts on each item so Aria Table Collection re-renders rows when edits change.
  const lineRows = lines.map((line) => {
    const draft = inlineMaking[line.article_id];
    return {
      ...line,
      making_draft_method: draft?.method ?? makingMethodOf(line),
      making_draft_value: draft?.value ?? makingValueOf(line),
    };
  });

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
                Select a customer, then scan a tag or search an available article.
              </EmptyState.Description>
            </EmptyState.Content>
          </EmptyState.Header>
        </EmptyState>
      ) : (
        <Table aria-label="Invoice lines" size="sm">
          <Table.Header>
            <Table.Head id="article" label="Article" isRowHeader />
            <Table.Head id="net" label="Net" className="w-24 text-right" />
            <Table.Head id="rate" label="Rate/g" className="w-28 text-right" />
            <Table.Head id="making" label="Making" className="min-w-64" />
            <Table.Head id="line" label="Line total" className="w-28 text-right" />
            <Table.Head id="actions" label="" className="w-24" />
          </Table.Header>
          <Table.Body items={lineRows}>
            {(line) => {
              const makingState: InlineMakingState = {
                method: line.making_draft_method,
                value: line.making_draft_value,
              };
              const dirty = makingIsDirty(line, makingState);
              const makingCheck = validateMakingValue(makingState.method, makingState.value);
              const makingValid = makingCheck.valid;
              const makingHint = makingCheck.hint;
              const makingMeta = makingValueFieldMeta(makingState.method);
              const badges = pricingBadges(line);
              const extraPricing = lineHasExtraPricing(line.pricing);
              const title = lineArticleTitle(line.description, line.article_number);

              return (
                <Table.Row id={line.id}>
                  <Table.Cell>
                    <div className="flex flex-col gap-1 py-0.5">
                      <span className="font-medium text-primary">{title}</span>
                      <span className="text-xs text-tertiary">
                        <span className="font-mono">{line.article_number}</span>
                        <span className="capitalize">
                          {" "}
                          · {line.metal} · {line.purity}
                        </span>
                      </span>
                      {badges.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {badges.map((badge) => (
                            <Badge key={badge.key} color="gray" size="sm" type="modern">
                              {badge.label}
                            </Badge>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </Table.Cell>
                  <Table.Cell className="text-right font-medium tabular-nums">
                    {formatGrams(line.net_metal_weight_grams)}
                  </Table.Cell>
                  <Table.Cell className="text-right">
                    {line.rate_per_gram ? (
                      <span className="tabular-nums">₹{line.rate_per_gram}</span>
                    ) : (
                      <Badge color="warning" size="sm">
                        No rate
                      </Badge>
                    )}
                  </Table.Cell>
                  <Table.Cell>
                    {isDraft ? (
                      <div className="flex flex-col gap-1 py-0.5">
                        <div className="flex items-end gap-1.5">
                          <SelectField
                            aria-label="Making method"
                            size="sm"
                            className="w-28 shrink-0"
                            value={makingState.method}
                            onChange={(value) => {
                              const method = value as MakingMethod;
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
                          <Input
                            aria-label={makingMeta.ariaLabel}
                            placeholder={makingMeta.placeholder}
                            size="sm"
                            className="min-w-0 flex-1"
                            value={makingState.value}
                            isInvalid={!makingValid}
                            onChange={(value) =>
                              onInlineMakingChange(line.article_id, {
                                method: makingState.method,
                                value,
                              })
                            }
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                if (!patchPending && dirty && makingValid) {
                                  onApplyMaking(line);
                                }
                              }
                            }}
                          />
                          <Button
                            color={dirty && makingValid ? "primary" : "secondary"}
                            size="sm"
                            className="shrink-0"
                            isDisabled={patchPending || !dirty || !makingValid}
                            onPress={() => onApplyMaking(line)}
                          >
                            Apply
                          </Button>
                        </div>
                        {makingHint ? (
                          <span className="text-xs text-error-primary">{makingHint}</span>
                        ) : null}
                        <span className="text-xs tabular-nums text-tertiary">
                          Quoted {formatInr(line.making_charge_inr)}
                        </span>
                      </div>
                    ) : (
                      <span className="tabular-nums text-sm">{formatInr(line.making_charge_inr)}</span>
                    )}
                  </Table.Cell>
                  <Table.Cell className="text-right font-medium tabular-nums">
                    {formatInr(line.line_total_inr)}
                  </Table.Cell>
                  <Table.Cell>
                    {isDraft ? (
                      <div className="flex items-center justify-end gap-1">
                        <div className="relative">
                          <Tooltip title="Line pricing">
                            <Button
                              color="secondary"
                              size="sm"
                              iconLeading={Sliders04}
                              aria-label={`Line pricing for ${line.article_number}`}
                              onPress={() => onOpenPricing(line)}
                            />
                          </Tooltip>
                          {extraPricing ? (
                            <span
                              className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-brand-solid ring-2 ring-primary"
                              aria-hidden="true"
                            />
                          ) : null}
                        </div>
                        <Tooltip title="Remove line">
                          <Button
                            color="tertiary-destructive"
                            size="sm"
                            iconLeading={Trash01}
                            aria-label={`Remove ${line.article_number}`}
                            isDisabled={patchPending}
                            onPress={() => onRemoveLine(line.article_id)}
                          />
                        </Tooltip>
                      </div>
                    ) : null}
                  </Table.Cell>
                </Table.Row>
              );
            }}
          </Table.Body>
        </Table>
      )}
    </>
  );
}

export function PosSaleCard({
  lineCount,
  toolbar,
  alerts,
  children,
}: {
  lineCount: number;
  toolbar: ReactNode;
  alerts?: ReactNode;
  children: ReactNode;
}) {
  return (
    <TableCard.Root>
      <TableCard.Header
        title="Sale"
        badge={String(lineCount)}
        description="Scan a tag or search available stock."
      />
      <div className="border-b border-secondary px-4 py-4 md:px-6">
        {toolbar}
        {alerts}
      </div>
      {children}
    </TableCard.Root>
  );
}

export { makingMethodOf, makingValueOf };
