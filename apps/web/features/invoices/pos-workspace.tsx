"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import type {
  Customer,
  CustomerListItem,
  Invoice,
  InvoiceDraftQuickArticle,
  InvoiceFinalizePayment,
  InvoiceLine,
  InvoiceLinePricing,
} from "@aabhushan/contracts";

import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import { Button } from "@/components/base/buttons/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ScanField } from "@/components/shared/scan-field";
import { staffHasPermission, useStaff } from "@/features/auth/staff-shell";
import { CustomerCombobox } from "@/features/customers/customer-combobox";
import { PosBrowseArticlesDialog } from "@/features/invoices/pos-browse-articles-dialog";
import { PosCustomerCreateDialog } from "@/features/invoices/pos-customer-create-dialog";
import { PosQuickReceiveDialog } from "@/features/invoices/pos-quick-receive-dialog";
import {
  formatInr,
  invoiceAccessToken,
  invoiceErrorMessage,
  newIdempotencyKey,
} from "@/features/invoices/invoice-shared";
import { PosLinePricingDialog } from "@/features/invoices/pos-line-pricing-dialog";
import {
  makingMethodOf,
  makingValueOf,
  PosLineTable,
  PosSaleCard,
  type InlineMakingState,
} from "@/features/invoices/pos-line-table";
import {
  PosTotalsPanel,
  type InvoiceDiscountMode,
  type TenderRow,
} from "@/features/invoices/pos-totals-panel";
import {
  createInvoiceDraftRequest,
  fetchCustomers,
  fetchDevices,
  fetchInvoiceDraft,
  finalizeInvoiceRequest,
  lookupArticle,
  patchInvoiceDraftRequest,
  quickReceiveArticleOntoDraftRequest,
  StaffApiError,
} from "@/lib/staff-api";

type MakingMethod = InvoiceLinePricing["making_charge"]["method"];

function emptyTender(): TenderRow {
  return { id: newIdempotencyKey(), method: "cash", amount_inr: "", reference: "" };
}

function discountModeFromInvoice(invoice: Invoice | null): InvoiceDiscountMode {
  if (!invoice?.invoice_discount) {
    return "none";
  }
  return invoice.invoice_discount.method;
}

function discountValueFromInvoice(invoice: Invoice | null): string {
  if (!invoice?.invoice_discount) {
    return "";
  }
  return invoice.invoice_discount.method === "amount"
    ? invoice.invoice_discount.amount_inr
    : invoice.invoice_discount.percent;
}

function buildMakingCharge(method: MakingMethod, value: string): InvoiceLinePricing["making_charge"] {
  const trimmed = value.trim() || "0";
  if (method === "fixed") {
    return { method: "fixed", amount_inr: trimmed.includes(".") ? trimmed : `${trimmed}.00` };
  }
  if (method === "per_gram") {
    return { method: "per_gram", rate_per_gram: trimmed };
  }
  return { method: "percent_of_metal", percent: trimmed };
}

function isMissingRateError(error: Invoice["quote_error"]): boolean {
  if (!error) {
    return false;
  }
  const message = error.message.toLowerCase();
  return message.includes("metal rate") || message.includes("rate_per_gram") || message.includes("no metal rate");
}

function finalizeDisabledReason(input: {
  customer: CustomerListItem | Customer | null;
  invoice: Invoice | null;
  lineCount: number;
  quoteBlocked: boolean;
  missingRate: boolean;
  patchPending: boolean;
  finalizePending: boolean;
  creatingDraft: boolean;
}): string | null {
  if (input.finalizePending) {
    return "Finalizing…";
  }
  if (input.patchPending || input.creatingDraft) {
    return "Wait for the draft update to finish.";
  }
  if (!input.customer) {
    return "Select a customer (or Walk-in) before finalizing.";
  }
  if (!input.invoice) {
    return "Add an article to create the draft, then finalize.";
  }
  if (input.invoice.status !== "draft") {
    return null;
  }
  if (input.lineCount === 0) {
    return "Add at least one article before finalizing.";
  }
  if (input.missingRate) {
    return "Finalize is disabled until today's metal rates are set.";
  }
  if (input.quoteBlocked) {
    return "Finalize is disabled until the quote succeeds.";
  }
  return null;
}

export function PosWorkspace({ draftId }: { draftId?: string }) {
  const staff = useStaff();
  const router = useRouter();
  const queryClient = useQueryClient();
  const allowed = staffHasPermission(staff, "billing.write");
  const canCreateCustomer = staffHasPermission(staff, "customers.write");
  const scanRef = useRef<HTMLInputElement>(null);

  const [customer, setCustomer] = useState<CustomerListItem | Customer | null>(null);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [scan, setScan] = useState("");
  const [scanError, setScanError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [tenders, setTenders] = useState<TenderRow[]>([emptyTender()]);
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey());
  const [creatingDraft, setCreatingDraft] = useState(false);
  const [pricingLine, setPricingLine] = useState<InvoiceLine | null>(null);
  const [invoiceDiscountMode, setInvoiceDiscountMode] = useState<InvoiceDiscountMode>("none");
  const [invoiceDiscountValue, setInvoiceDiscountValue] = useState("");
  const [inlineMaking, setInlineMaking] = useState<Record<string, InlineMakingState>>({});
  const [walkInBusy, setWalkInBusy] = useState(false);
  const [quickReceiveOpen, setQuickReceiveOpen] = useState(false);
  const [quickReceiveBusy, setQuickReceiveBusy] = useState(false);
  const [browseOpen, setBrowseOpen] = useState(false);
  const [browseBusy, setBrowseBusy] = useState(false);
  const [createCustomerOpen, setCreateCustomerOpen] = useState(false);

  function focusScan(options?: { force?: boolean }) {
    if (!options?.force && (pricingLine || quickReceiveOpen || browseOpen || createCustomerOpen)) {
      return;
    }
    window.setTimeout(() => {
      scanRef.current?.focus();
    }, 0);
  }

  useEffect(() => {
    if (!allowed) {
      router.replace("/access-denied");
    }
  }, [allowed, router]);

  const devices = useQuery({
    queryKey: ["shop", "devices", staff.membership.organization_id],
    queryFn: async () => fetchDevices(await invoiceAccessToken()),
    enabled: allowed,
  });

  useEffect(() => {
    if (!draftId || !allowed) {
      return;
    }
    void (async () => {
      try {
        const token = await invoiceAccessToken();
        const loaded = await fetchInvoiceDraft(token, draftId);
        const walkInList = await fetchCustomers(token, {
          page: 1,
          pageSize: 1,
          isWalkIn: true,
          isActive: true,
        });
        const walkInId = walkInList.items[0]?.id;
        setInvoice(loaded);
        setInvoiceDiscountMode(discountModeFromInvoice(loaded));
        setInvoiceDiscountValue(discountValueFromInvoice(loaded));
        setCustomer({
          id: loaded.customer_id,
          display_name: loaded.customer_display_name,
          phone_normalized: null,
          phone_display: null,
          email: null,
          is_active: true,
          is_walk_in: walkInId === loaded.customer_id,
          whatsapp_consent: null,
          created_at: loaded.created_at,
        });
        focusScan();
      } catch (error) {
        setActionError(invoiceErrorMessage(error));
      }
    })();
  }, [allowed, draftId]);

  useEffect(() => {
    if (customer && invoice?.status !== "finalized" && !pricingLine && !createCustomerOpen) {
      focusScan();
    }
  }, [customer?.id, invoice?.status, pricingLine, createCustomerOpen]);

  const patchMutation = useMutation({
    mutationFn: async (input: {
      invoiceId: string;
      customerId?: string;
      add?: string[];
      remove?: string[];
      linePricing?: Array<{ article_id: string } & InvoiceLinePricing>;
      invoiceDiscount?: Invoice["invoice_discount"] | null;
    }) => {
      const body: {
        customer_id?: string;
        add_article_ids?: string[];
        remove_article_ids?: string[];
        line_pricing?: Array<{
          article_id: string;
          making_charge: InvoiceLinePricing["making_charge"];
          wastage?: InvoiceLinePricing["wastage"];
          stone_charges?: InvoiceLinePricing["stone_charges"];
          line_discount?: InvoiceLinePricing["line_discount"];
        }>;
        invoice_discount?: Invoice["invoice_discount"];
      } = {};
      if (input.customerId) {
        body.customer_id = input.customerId;
      }
      if (input.add && input.add.length > 0) {
        body.add_article_ids = input.add;
      }
      if (input.remove && input.remove.length > 0) {
        body.remove_article_ids = input.remove;
      }
      if (input.linePricing && input.linePricing.length > 0) {
        body.line_pricing = input.linePricing.map((row) => ({
          article_id: row.article_id,
          making_charge: row.making_charge,
          ...(row.wastage ? { wastage: row.wastage } : {}),
          ...(row.stone_charges ? { stone_charges: row.stone_charges } : {}),
          line_discount: row.line_discount ?? null,
        }));
      }
      if (input.invoiceDiscount !== undefined) {
        body.invoice_discount = input.invoiceDiscount;
      }
      return patchInvoiceDraftRequest(await invoiceAccessToken(), input.invoiceId, body);
    },
    onSuccess: (next, vars) => {
      setInvoice(next);
      setInvoiceDiscountMode(discountModeFromInvoice(next));
      setInvoiceDiscountValue(discountValueFromInvoice(next));
      setActionError(null);
      setScanError(null);
      setIdempotencyKey(newIdempotencyKey());
      const customerOnly =
        Boolean(vars.customerId) &&
        !vars.add?.length &&
        !vars.remove?.length &&
        !vars.linePricing?.length &&
        vars.invoiceDiscount === undefined;
      if (!customerOnly) {
        setPricingLine(null);
        setInlineMaking({});
      }
      focusScan();
    },
    onError: (error) => {
      setActionError(invoiceErrorMessage(error));
    },
  });

  const finalizeMutation = useMutation({
    mutationFn: async () => {
      if (!invoice) {
        throw new StaffApiError(400, "INVALID_INPUT", "Create a draft first.");
      }
      const payments: InvoiceFinalizePayment[] = tenders
        .filter((row) => row.amount_inr.trim() !== "")
        .map((row) => ({
          method: row.method,
          amount_inr: row.amount_inr.trim(),
          ...(row.reference.trim() ? { reference: row.reference.trim() } : {}),
        }));
      return finalizeInvoiceRequest(
        await invoiceAccessToken(),
        invoice.id,
        {
          quote_version: invoice.quote_version,
          ...(payments.length > 0 ? { payments } : {}),
        },
        idempotencyKey,
      );
    },
    onSuccess: async (finalized) => {
      setConfirmOpen(false);
      setInvoice(finalized);
      await queryClient.invalidateQueries({ queryKey: ["invoices"] });
      router.replace(`/invoices/${finalized.id}`);
    },
    onError: (error) => {
      void (async () => {
        if (error instanceof StaffApiError && error.code === "STALE_QUOTE" && invoice) {
          try {
            const refreshed = await fetchInvoiceDraft(await invoiceAccessToken(), invoice.id);
            setInvoice(refreshed);
            setInvoiceDiscountMode(discountModeFromInvoice(refreshed));
            setInvoiceDiscountValue(discountValueFromInvoice(refreshed));
            setIdempotencyKey(newIdempotencyKey());
            setActionError("Totals refreshed. Review the quote and finalize again.");
            setConfirmOpen(true);
            return;
          } catch (refreshError) {
            setActionError(invoiceErrorMessage(refreshError));
            setConfirmOpen(false);
            return;
          }
        }
        setActionError(invoiceErrorMessage(error));
        setConfirmOpen(false);
      })();
    },
  });

  if (!allowed) {
    return null;
  }

  async function ensureDraft(): Promise<Invoice> {
    if (invoice) {
      return invoice;
    }
    if (!customer) {
      throw new StaffApiError(400, "INVALID_INPUT", "Select a customer before adding articles.");
    }
    setCreatingDraft(true);
    try {
      const created = await createInvoiceDraftRequest(await invoiceAccessToken(), {
        customer_id: customer.id,
      });
      setInvoice(created);
      return created;
    } finally {
      setCreatingDraft(false);
    }
  }

  async function addArticlesByIds(articleIds: string[]) {
    const draft = await ensureDraft();
    const already = new Set(draft.lines.map((line) => line.article_id));
    const toAdd = articleIds.filter((id) => !already.has(id));
    if (toAdd.length === 0) {
      setScanError("That article is already on this invoice.");
      focusScan();
      return;
    }
    const next = await patchMutation.mutateAsync({ invoiceId: draft.id, add: toAdd });
    setInvoice(next);
    focusScan();
  }

  async function addArticleById(articleId: string) {
    await addArticlesByIds([articleId]);
  }

  function onScanBarcode(barcode: string) {
    setScanError(null);
    void (async () => {
      try {
        const article = await lookupArticle(await invoiceAccessToken(), barcode, true);
        await addArticleById(article.id);
        setScan("");
      } catch (error) {
        setScanError(invoiceErrorMessage(error));
        setScan("");
        focusScan();
      }
    })();
  }

  async function submitBrowseAdd(articleIds: string[]) {
    setBrowseBusy(true);
    setActionError(null);
    setScanError(null);
    try {
      await addArticlesByIds(articleIds);
      setBrowseOpen(false);
      focusScan({ force: true });
    } catch (error) {
      setActionError(invoiceErrorMessage(error));
    } finally {
      setBrowseBusy(false);
    }
  }

  function removeLine(articleId: string) {
    if (!invoice || invoice.status !== "draft") {
      return;
    }
    void patchMutation.mutateAsync({ invoiceId: invoice.id, remove: [articleId] });
  }

  function saveLinePricing(pricing: InvoiceLinePricing) {
    if (!invoice || !pricingLine) {
      return;
    }
    void patchMutation.mutateAsync({
      invoiceId: invoice.id,
      linePricing: [{ article_id: pricingLine.article_id, ...pricing }],
    });
  }

  function applyInlineMaking(line: InvoiceLine) {
    if (!invoice || invoice.status !== "draft") {
      return;
    }
    const draft = inlineMaking[line.article_id] ?? {
      method: makingMethodOf(line),
      value: makingValueOf(line),
    };
    const pricing: InvoiceLinePricing = {
      making_charge: buildMakingCharge(draft.method, draft.value),
      wastage: line.pricing?.wastage ?? { method: "none" },
      stone_charges: line.pricing?.stone_charges ?? [],
      line_discount: line.pricing?.line_discount ?? null,
    };
    void patchMutation.mutateAsync({
      invoiceId: invoice.id,
      linePricing: [{ article_id: line.article_id, ...pricing }],
    });
  }

  function applyInvoiceDiscount() {
    if (!invoice || invoice.status !== "draft") {
      return;
    }
    let invoiceDiscount: Invoice["invoice_discount"] = null;
    if (invoiceDiscountMode === "amount" && invoiceDiscountValue.trim() !== "") {
      invoiceDiscount = { method: "amount", amount_inr: invoiceDiscountValue.trim() };
    } else if (invoiceDiscountMode === "percent" && invoiceDiscountValue.trim() !== "") {
      invoiceDiscount = { method: "percent", percent: invoiceDiscountValue.trim() };
    }
    void patchMutation.mutateAsync({
      invoiceId: invoice.id,
      invoiceDiscount,
    });
  }

  function payGrandTotal() {
    if (!invoice || quoteBlocked) {
      return;
    }
    const total = invoice.grand_total_inr;
    if (total === "0" || total === "0.00") {
      return;
    }
    setTenders((current) => {
      const first = current[0] ?? emptyTender();
      return [{ ...first, amount_inr: total }, ...current.slice(1)];
    });
  }

  const lines = invoice?.lines ?? [];
  const quoteBlocked = Boolean(invoice?.quote_error);
  const missingRate = isMissingRateError(invoice?.quote_error ?? null);
  const canPayFull =
    Boolean(invoice) &&
    invoice?.status === "draft" &&
    !quoteBlocked &&
    lines.length > 0 &&
    invoice.grand_total_inr !== "0" &&
    invoice.grand_total_inr !== "0.00";
  const canFinalize =
    Boolean(invoice) &&
    invoice?.status === "draft" &&
    lines.length > 0 &&
    !quoteBlocked &&
    !finalizeMutation.isPending &&
    !patchMutation.isPending &&
    !creatingDraft;
  const finalizeReason = finalizeDisabledReason({
    customer,
    invoice,
    lineCount: lines.length,
    quoteBlocked,
    missingRate,
    patchPending: patchMutation.isPending,
    finalizePending: finalizeMutation.isPending,
    creatingDraft,
  });
  const excludeArticleIds = new Set(lines.map((line) => line.article_id));
  const draftBusy = !customer || invoice?.status === "finalized" || creatingDraft || patchMutation.isPending;

  async function selectCustomer(next: CustomerListItem | Customer) {
    const previous = customer;
    setCustomer(next);
    setActionError(null);
    if (invoice?.status === "draft" && invoice.customer_id !== next.id) {
      try {
        await patchMutation.mutateAsync({ invoiceId: invoice.id, customerId: next.id });
      } catch {
        setCustomer(previous);
        return;
      }
    }
    focusScan({ force: true });
  }

  async function selectWalkIn() {
    setWalkInBusy(true);
    setActionError(null);
    try {
      const list = await fetchCustomers(await invoiceAccessToken(), {
        page: 1,
        pageSize: 1,
        isWalkIn: true,
        isActive: true,
      });
      const walkIn = list.items[0];
      if (!walkIn) {
        setActionError("Walk-in customer is not set up. Run seed:sample-customers or ask an admin.");
        return;
      }
      await selectCustomer(walkIn);
    } catch (error) {
      setActionError(invoiceErrorMessage(error));
    } finally {
      setWalkInBusy(false);
    }
  }

  async function submitQuickReceive(input: InvoiceDraftQuickArticle) {
    setQuickReceiveBusy(true);
    setActionError(null);
    try {
      const draft = await ensureDraft();
      const next = await quickReceiveArticleOntoDraftRequest(await invoiceAccessToken(), draft.id, input);
      setInvoice(next);
      setQuickReceiveOpen(false);
      focusScan({ force: true });
    } catch (error) {
      setActionError(invoiceErrorMessage(error));
    } finally {
      setQuickReceiveBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(300px,340px)] lg:items-start">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-display-xs font-semibold text-primary">POS billing</h1>
            <p className="text-md text-tertiary">Scan or search available articles to build a sale.</p>
          </div>
          <Button color="secondary" size="md" href="/invoices">
            Back to list
          </Button>
        </div>

        {(creatingDraft || patchMutation.isPending) && !invoice ? (
          <div className="flex justify-center py-10">
            <LoadingIndicator label="Preparing draft" />
          </div>
        ) : null}

        <PosSaleCard
          lineCount={lines.length}
          toolbar={
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="min-w-0 flex-1">
                  <CustomerCombobox
                    selected={customer}
                    onSelect={(next) => {
                      void selectCustomer(next);
                    }}
                    onClear={() => {
                      setCustomer(null);
                      setActionError(null);
                    }}
                    isDisabled={invoice?.status === "finalized"}
                  />
                </div>
                <Button
                  color="secondary"
                  size="md"
                  className="shrink-0"
                  isDisabled={invoice?.status === "finalized" || walkInBusy}
                  isLoading={walkInBusy}
                  onPress={() => void selectWalkIn()}
                >
                  Walk-in
                </Button>
                {canCreateCustomer ? (
                  <Button
                    color="secondary"
                    size="md"
                    className="shrink-0"
                    isDisabled={invoice?.status === "finalized"}
                    onPress={() => setCreateCustomerOpen(true)}
                  >
                    New customer
                  </Button>
                ) : null}
              </div>
              <div className="flex flex-col gap-2 lg:flex-row lg:items-end">
                <div className="min-w-0 flex-1">
                  <ScanField
                    value={scan}
                    hint={null}
                    terminator={devices.data?.scan_terminator ?? "Enter"}
                    expectedSuffix={devices.data?.expected_suffix ?? ""}
                    alreadyScanned={new Set(lines.map((line) => line.barcode).filter((value): value is string => Boolean(value)))}
                    inputRef={scanRef}
                    isDisabled={draftBusy}
                    onChange={setScan}
                    onScan={onScanBarcode}
                    onDuplicate={() => {
                      setScanError("That article is already on this invoice.");
                      setScan("");
                      focusScan();
                    }}
                    onUnexpectedSuffix={(raw) => {
                      setScanError(`Scanner suffix was unexpected. Raw scan: ${raw}`);
                      focusScan();
                    }}
                  />
                </div>
                <Button
                  color="secondary"
                  size="md"
                  className="shrink-0"
                  isDisabled={draftBusy || !customer}
                  onPress={() => setBrowseOpen(true)}
                >
                  Browse articles
                </Button>
                <Button
                  color="secondary"
                  size="md"
                  className="shrink-0"
                  isDisabled={draftBusy || !customer}
                  onPress={() => setQuickReceiveOpen(true)}
                >
                  Receive &amp; add
                </Button>
              </div>
            </div>
          }
          alerts={
            scanError || actionError ? (
              <div className="mt-3 flex flex-col gap-1">
                {scanError ? (
                  <p className="text-sm text-error-primary" role="alert">
                    {scanError}
                  </p>
                ) : null}
                {actionError ? (
                  <p className="text-sm text-error-primary" role="alert">
                    {actionError}
                  </p>
                ) : null}
              </div>
            ) : null
          }
        >
          <PosLineTable
            invoice={invoice}
            lines={lines}
            inlineMaking={inlineMaking}
            patchPending={patchMutation.isPending}
            onInlineMakingChange={(articleId, next) =>
              setInlineMaking((current) => ({ ...current, [articleId]: next }))
            }
            onApplyMaking={applyInlineMaking}
            onOpenPricing={setPricingLine}
            onRemoveLine={removeLine}
          />
        </PosSaleCard>
      </div>

      <PosTotalsPanel
        invoice={invoice}
        quoteBlocked={quoteBlocked}
        missingRate={missingRate}
        canFinalize={Boolean(canFinalize)}
        canPayFull={canPayFull}
        finalizeReason={finalizeReason}
        finalizePending={finalizeMutation.isPending}
        patchPending={patchMutation.isPending}
        invoiceDiscountMode={invoiceDiscountMode}
        invoiceDiscountValue={invoiceDiscountValue}
        tenders={tenders}
        onInvoiceDiscountModeChange={setInvoiceDiscountMode}
        onInvoiceDiscountValueChange={setInvoiceDiscountValue}
        onApplyInvoiceDiscount={applyInvoiceDiscount}
        onPayGrandTotal={payGrandTotal}
        onTenderMethodChange={(tenderId, method) =>
          setTenders((current) =>
            current.map((item) => (item.id === tenderId ? { ...item, method } : item)),
          )
        }
        onTenderAmountChange={(tenderId, amount) =>
          setTenders((current) =>
            current.map((item) => (item.id === tenderId ? { ...item, amount_inr: amount } : item)),
          )
        }
        onFinalize={() => setConfirmOpen(true)}
      />

      <PosLinePricingDialog
        line={pricingLine}
        isOpen={Boolean(pricingLine)}
        isSaving={patchMutation.isPending}
        onClose={() => {
          setPricingLine(null);
          focusScan({ force: true });
        }}
        onSave={saveLinePricing}
      />

      <PosBrowseArticlesDialog
        isOpen={browseOpen}
        isSaving={browseBusy || patchMutation.isPending}
        excludeArticleIds={excludeArticleIds}
        onClose={() => {
          setBrowseOpen(false);
          focusScan({ force: true });
        }}
        onAdd={(articleIds) => {
          void submitBrowseAdd(articleIds);
        }}
        onReceiveAndAdd={() => setQuickReceiveOpen(true)}
      />

      <PosQuickReceiveDialog
        isOpen={quickReceiveOpen}
        isSaving={quickReceiveBusy}
        onClose={() => {
          setQuickReceiveOpen(false);
          focusScan({ force: true });
        }}
        onSubmit={(input) => {
          void submitQuickReceive(input);
        }}
      />

      <PosCustomerCreateDialog
        isOpen={createCustomerOpen}
        onClose={() => {
          setCreateCustomerOpen(false);
          focusScan({ force: true });
        }}
        onCreated={(created) => {
          void queryClient.invalidateQueries({ queryKey: ["customers"] });
          void selectCustomer(created);
        }}
      />

      <ConfirmDialog
        isOpen={confirmOpen}
        title="Finalize invoice"
        message={
          <div className="flex flex-col gap-2 text-sm text-tertiary">
            <p>
              Customer: <span className="text-primary">{customer?.display_name ?? "—"}</span>
            </p>
            <p>
              Amount: <span className="tabular-nums text-primary">{formatInr(invoice?.grand_total_inr ?? "0")}</span>
            </p>
            <p>This posts stock to sold and cannot be undone from this screen.</p>
          </div>
        }
        confirmLabel="Finalize invoice"
        confirmColor="primary"
        isConfirming={finalizeMutation.isPending}
        onConfirm={() => finalizeMutation.mutate()}
        onCancel={() => {
          if (!finalizeMutation.isPending) {
            setConfirmOpen(false);
          }
        }}
      />
    </section>
  );
}
