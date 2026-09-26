"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import type {
  Customer,
  CustomerListItem,
  Invoice,
  InvoiceDraftQuickArticle,
  InvoiceFinalizePayment,
  InvoiceLine,
  InvoiceLinePricing,
} from "@aabhushan/contracts";
import { Edit01 } from "@untitledui/icons";

import { PosWorkspaceSkeleton } from "@/components/application/skeleton/skeleton";
import { StaffBackLink } from "@/components/application/staff-back-link";
import { TableCard } from "@/components/application/table/table";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { MoneyText } from "@/components/shared/money-text";
import { ScanField } from "@/components/shared/scan-field";
import { staffHasPermission, useStaff } from "@/features/auth/staff-shell";
import { useStaffToast } from "@/components/application/toast/staff-toast";
import { CustomerCombobox } from "@/features/customers/customer-combobox";
import { PosBrowseArticlesDialog } from "@/features/invoices/pos-browse-articles-dialog";
import { PosCustomerCreateDialog } from "@/features/invoices/pos-customer-create-dialog";
import { PosQuickReceiveDialog } from "@/features/invoices/pos-quick-receive-dialog";
import {
  invoiceAccessToken,
  invoiceErrorMessage,
  isZeroMoney,
  newIdempotencyKey,
} from "@/features/invoices/invoice-shared";
import { PosLinePricingDialog } from "@/features/invoices/pos-line-pricing-dialog";
import {
  makingMethodOf,
  makingValueOf,
  PosLineTable,
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
  fetchNotifications,
  fetchOwnerDocuments,
  finalizeInvoiceRequest,
  lookupArticle,
  patchInvoiceDraftRequest,
  quickReceiveArticleOntoDraftRequest,
  StaffApiError,
} from "@/lib/staff-api";
import { subtractMoney, sumMoney } from "@/lib/money";

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

function whatsappStatusCopy(status: string | undefined): string | null {
  if (!status) {
    return null;
  }
  if (status === "accepted") {
    return "Accepted by WhatsApp";
  }
  if (status === "sent") {
    return "Sent";
  }
  if (status === "delivered") {
    return "Delivered";
  }
  if (status === "failed") {
    return "Failed";
  }
  if (status === "pending") {
    return "Pending";
  }
  if (status === "skipped") {
    return "Skipped";
  }
  if (status === "unknown") {
    return "Unknown";
  }
  return status;
}

export function PosWorkspace({
  draftId,
  initialInvoice,
}: {
  draftId?: string;
  /** When opening a draft from InvoiceDetail, seed state and skip a second draft fetch. */
  initialInvoice?: Invoice;
}) {
  return (
    <Suspense fallback={<PosWorkspaceSkeleton label="Preparing draft…" />}>
      <PosWorkspaceBody draftId={draftId} initialInvoice={initialInvoice} />
    </Suspense>
  );
}

function PosWorkspaceBody({
  draftId,
  initialInvoice,
}: {
  draftId?: string;
  initialInvoice?: Invoice;
}) {
  const staff = useStaff();
  const toast = useStaffToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const allowed = staffHasPermission(staff, "billing.write");
  const canCreateCustomer = staffHasPermission(staff, "customers.write");
  const scanRef = useRef<HTMLInputElement>(null);
  const saleDone = searchParams.get("sale") === "done";

  const [customer, setCustomer] = useState<CustomerListItem | Customer | null>(() =>
    initialInvoice
      ? {
          id: initialInvoice.customer_id,
          display_name: initialInvoice.customer_display_name,
          phone_normalized: null,
          phone_display: null,
          email: null,
          is_active: true,
          is_walk_in: false,
          whatsapp_consent: null,
          created_at: initialInvoice.created_at,
        }
      : null,
  );
  const [customerEditing, setCustomerEditing] = useState(() => !initialInvoice);
  const [invoice, setInvoice] = useState<Invoice | null>(initialInvoice ?? null);
  const [scan, setScan] = useState("");
  const [scanError, setScanError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [leaveDiscardOpen, setLeaveDiscardOpen] = useState(false);
  const [pendingLeaveAction, setPendingLeaveAction] = useState<(() => void) | null>(null);
  const [tenders, setTenders] = useState<TenderRow[]>([emptyTender()]);
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey());
  const [creatingDraft, setCreatingDraft] = useState(false);
  const [pricingLine, setPricingLine] = useState<InvoiceLine | null>(null);
  const [invoiceDiscountMode, setInvoiceDiscountMode] = useState<InvoiceDiscountMode>(() =>
    discountModeFromInvoice(initialInvoice ?? null),
  );
  const [invoiceDiscountValue, setInvoiceDiscountValue] = useState(() =>
    discountValueFromInvoice(initialInvoice ?? null),
  );
  const [discountOpen, setDiscountOpen] = useState(false);
  const [inlineMaking, setInlineMaking] = useState<Record<string, InlineMakingState>>({});
  const [pendingWalkIn, setPendingWalkIn] = useState<CustomerListItem | Customer | null>(null);
  const [customerPickerKey, setCustomerPickerKey] = useState(0);
  const [quickReceiveOpen, setQuickReceiveOpen] = useState(false);
  const [quickReceiveBusy, setQuickReceiveBusy] = useState(false);
  const [browseOpen, setBrowseOpen] = useState(false);
  const [browseBusy, setBrowseBusy] = useState(false);
  const [createCustomerOpen, setCreateCustomerOpen] = useState(false);
  /** Tender rows captured at finalize so the completed rail can show Paid · Method. */
  const [finalizedTenders, setFinalizedTenders] = useState<TenderRow[]>([]);

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

  const isFinalizedView = invoice?.status === "finalized" && (saleDone || Boolean(draftId));

  const documentsQuery = useQuery({
    queryKey: ["documents", "invoice", staff.membership.organization_id, invoice?.id ?? ""],
    queryFn: async () =>
      fetchOwnerDocuments(await invoiceAccessToken(), {
        ownerType: "invoice",
        ownerId: invoice!.id,
      }),
    enabled: allowed && Boolean(invoice?.id) && isFinalizedView,
  });

  const whatsappQuery = useQuery({
    queryKey: [
      "notifications",
      "invoice-whatsapp",
      staff.membership.organization_id,
      invoice?.customer_id ?? "",
      invoice?.id ?? "",
    ],
    queryFn: async () =>
      fetchNotifications(await invoiceAccessToken(), {
        page: 1,
        pageSize: 25,
        purpose: "transactional_invoice",
        customerId: invoice!.customer_id,
      }),
    enabled: allowed && Boolean(invoice?.id) && Boolean(invoice?.customer_id) && isFinalizedView,
  });

  useEffect(() => {
    if (!draftId || !allowed) {
      return;
    }

    if (initialInvoice) {
      void (async () => {
        try {
          const token = await invoiceAccessToken();
          const walkInList = await fetchCustomers(token, {
            page: 1,
            pageSize: 1,
            isWalkIn: true,
            isActive: true,
          });
          const walkInId = walkInList.items[0]?.id;
          setCustomer((current) =>
            current ? { ...current, is_walk_in: walkInId === current.id } : current,
          );
          if (initialInvoice.status !== "finalized") {
            focusScan();
          }
        } catch {
          // Walk-in flag is optional; keep seeded customer.
        }
      })();
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
        setCustomerEditing(false);
        if (loaded.status !== "finalized") {
          focusScan();
        }
      } catch (error) {
        setActionError(invoiceErrorMessage(error));
      }
    })();
  }, [allowed, draftId, initialInvoice]);

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
      setFinalizedTenders(tenders.filter((row) => row.amount_inr.trim() !== ""));
      setInvoice(finalized);
      toast.success(`Invoice ${finalized.invoice_number} finalized`);
      await queryClient.invalidateQueries({ queryKey: ["invoices"] });
      router.replace(`/invoices/${finalized.id}?sale=done`);
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
    setActionError(null);
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

  function payRemaining() {
    if (!invoice || quoteBlocked) {
      return;
    }
    const total = invoice.grand_total_inr;
    if (isZeroMoney(total)) {
      return;
    }
    setTenders((current) => {
      const rows = current.length > 0 ? current : [emptyTender()];
      const others = sumMoney(rows.slice(0, -1).map((row) => row.amount_inr.trim() || "0.00"));
      const remaining = subtractMoney(total, others);
      const last = rows[rows.length - 1] ?? emptyTender();
      const nextAmount = remaining.startsWith("-") ? "0.00" : remaining;
      return [...rows.slice(0, -1), { ...last, amount_inr: nextAmount }];
    });
  }

  const lines = invoice?.lines ?? [];
  const draftDirty = lines.length > 0 || customer !== null;

  function resetDraftState() {
    setCustomer(null);
    setCustomerEditing(true);
    setInvoice(null);
    setScan("");
    setScanError(null);
    setActionError(null);
    setTenders([emptyTender()]);
    setFinalizedTenders([]);
    setIdempotencyKey(newIdempotencyKey());
    setPricingLine(null);
    setInvoiceDiscountMode("none");
    setInvoiceDiscountValue("");
    setDiscountOpen(false);
    setInlineMaking({});
  }

  function requestLeave(action: () => void) {
    if (finalizeMutation.isPending || isFinalizedView) {
      action();
      return;
    }
    if (draftDirty) {
      setPendingLeaveAction(() => action);
      setLeaveDiscardOpen(true);
      return;
    }
    action();
  }

  function confirmLeaveDraft() {
    resetDraftState();
    setLeaveDiscardOpen(false);
    pendingLeaveAction?.();
    setPendingLeaveAction(null);
  }

  const quoteBlocked = Boolean(invoice?.quote_error);
  const missingRate = isMissingRateError(invoice?.quote_error ?? null);
  const makingUnsaved = lines.some((line) => {
    const state = inlineMaking[line.article_id];
    if (!state) {
      return false;
    }
    return state.method !== makingMethodOf(line) || state.value !== makingValueOf(line);
  });
  const draftStatusLabel = !invoice
    ? "Draft"
    : missingRate
      ? "Draft · rate missing"
      : quoteBlocked
        ? "Draft · quote blocked"
        : makingUnsaved
          ? "Draft · unsaved making"
          : "Draft · saved";
  const canPayFull =
    Boolean(invoice) &&
    invoice?.status === "draft" &&
    !quoteBlocked &&
    lines.length > 0 &&
    !isZeroMoney(invoice.grand_total_inr);
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
    setCustomerEditing(false);
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

  function requestCustomer(next: CustomerListItem | Customer) {
    if (customer && !customer.is_walk_in && next.is_walk_in) {
      setPendingWalkIn(next);
      return;
    }
    void selectCustomer(next);
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
      throw error instanceof Error ? error : new Error(invoiceErrorMessage(error));
    } finally {
      setQuickReceiveBusy(false);
    }
  }

  const preparingDraft = (creatingDraft || patchMutation.isPending) && !invoice;
  const hydratingDraft = Boolean(draftId) && !initialInvoice && !invoice && !actionError;
  const showPosSkeleton = preparingDraft || hydratingDraft;

  if (showPosSkeleton) {
    return <PosWorkspaceSkeleton label={hydratingDraft ? "Loading draft…" : "Preparing draft…"} />;
  }

  const pdfDoc = documentsQuery.data?.items.find((item) => item.document_type === "invoice_pdf");
  const documentStatusLabel = pdfDoc
    ? pdfDoc.status === "ready"
      ? "Ready"
      : pdfDoc.status === "failed"
        ? "Failed"
        : "Pending"
    : documentsQuery.isLoading
      ? "…"
      : "Pending";

  const whatsappMatch = whatsappQuery.data?.items.find(
    (item) => item.related_type === "invoice" && item.related_id === invoice?.id,
  );
  const whatsappStatusLabel = whatsappStatusCopy(whatsappMatch?.status);

  const paymentBadge =
    invoice?.status === "finalized"
      ? isZeroMoney(invoice.amount_due_inr)
        ? "Paid"
        : "Partially paid"
      : null;

  const showCustomerBar = Boolean(customer) && !customerEditing && !isFinalizedView;

  return (
    <section className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-6">
      <div className="flex min-w-0 flex-col gap-6">
        {isFinalizedView && invoice ? (
          <div className="flex flex-col gap-2">
            <StaffBackLink label="Invoices" onPress={() => router.push("/invoices")} />
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-mono text-display-xs font-bold text-primary">
                {invoice.invoice_number}
              </h1>
              <Badge color="gray" size="md">
                Finalized
              </Badge>
              {paymentBadge ? (
                <Badge
                  color={paymentBadge === "Paid" ? "gray" : "error"}
                  size="md"
                  appearance={paymentBadge === "Paid" ? "solid" : "soft"}
                >
                  {paymentBadge}
                </Badge>
              ) : null}
            </div>
            <p className="text-sm text-secondary">
              {invoice.customer_display_name}
              {customer?.phone_display ? ` · ${customer.phone_display}` : ""}
              {" · "}
              {invoice.finalized_at
                ? new Date(invoice.finalized_at).toLocaleString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })
                : invoice.business_date}
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-2">
              <StaffBackLink
                label="Invoices"
                onPress={() => requestLeave(() => router.push("/invoices"))}
              />
              <h1 className="text-display-xs font-bold text-primary">POS billing</h1>
            </div>
            <span className="ml-auto text-sm font-medium text-secondary">{draftStatusLabel}</span>
            <Button
              color="secondary"
              size="lg"
              className="shrink-0"
              onPress={() =>
                requestLeave(() => {
                  resetDraftState();
                  if (draftId) {
                    router.replace("/invoices/new");
                  }
                })
              }
            >
              New sale
            </Button>
          </div>
        )}

        {!isFinalizedView ? (
          showCustomerBar && customer ? (
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-primary px-5 py-4 ring-1 ring-primary">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-sm font-medium text-tertiary">Customer</span>
                <span className="text-lg font-bold text-primary">
                  {customer.display_name}
                  {customer.phone_display ? (
                    <span className="font-normal text-tertiary"> · {customer.phone_display}</span>
                  ) : null}
                </span>
              </div>
              <Button
                color="tertiary"
                size="lg"
                iconLeading={Edit01}
                className="shrink-0 text-primary"
                aria-label="Change customer"
                onPress={() => setCustomerEditing(true)}
              />
            </div>
          ) : (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <div className="min-w-0 flex-1">
                <CustomerCombobox
                  key={customerPickerKey}
                  size="lg"
                  selected={customer}
                  warnIfWalkInMissing
                  onSelect={requestCustomer}
                  onClear={() => {
                    setCustomer(null);
                    setCustomerEditing(true);
                    setActionError(null);
                  }}
                  isDisabled={invoice?.status === "finalized"}
                />
              </div>
              {canCreateCustomer ? (
                <div className="flex shrink-0 flex-col gap-1.5">
                  <span className="flex h-5 items-center text-sm font-medium opacity-0" aria-hidden>
                    Customer
                  </span>
                  <Button
                    color="secondary"
                    size="lg"
                    onPress={() => setCreateCustomerOpen(true)}
                  >
                    New customer
                  </Button>
                </div>
              ) : null}
            </div>
          )
        ) : null}

        {!isFinalizedView ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
              <div className="min-w-0 flex-1">
                <ScanField
                  size="lg"
                  value={scan}
                  hint={customer ? null : "Select a customer to add stock."}
                  placeholder="Scan tag"
                  status={customer && !scanError ? "ready" : undefined}
                  terminator={devices.data?.scan_terminator ?? "Enter"}
                  expectedSuffix={devices.data?.expected_suffix ?? ""}
                  alreadyScanned={
                    new Set(
                      lines.map((line) => line.barcode).filter((value): value is string => Boolean(value)),
                    )
                  }
                  inputRef={scanRef}
                  isDisabled={draftBusy}
                  isInvalid={Boolean(scanError)}
                  error={scanError ?? undefined}
                  isClearable
                  onChange={setScan}
                  onScan={onScanBarcode}
                  onDuplicate={() => {
                    setScanError("That article is already on this invoice.");
                    setActionError(null);
                    setScan("");
                    focusScan();
                  }}
                  onUnexpectedSuffix={(raw) => {
                    setScanError(`Scanner suffix was unexpected. Raw scan: ${raw}`);
                    focusScan();
                  }}
                />
              </div>
              <div className="flex shrink-0 flex-col gap-1.5">
                <span className="flex h-5 items-center text-sm font-medium opacity-0" aria-hidden>
                  Scan barcode
                </span>
                <Button
                  color="secondary"
                  size="lg"
                  isDisabled={draftBusy || !customer}
                  onPress={() => setBrowseOpen(true)}
                >
                  Browse
                </Button>
              </div>
            </div>
            <Button
              color="secondary"
              size="lg"
              className="self-start"
              isDisabled={draftBusy || !customer}
              onPress={() => setQuickReceiveOpen(true)}
            >
              Receive &amp; add
            </Button>
          </div>
        ) : null}

        {actionError ? (
          <p className="text-sm text-error-primary" role="alert">
            {actionError}
          </p>
        ) : null}

        <TableCard.Root>
          <PosLineTable
            invoice={invoice}
            lines={lines}
            inlineMaking={inlineMaking}
            patchPending={patchMutation.isPending}
            readOnly={isFinalizedView}
            onInlineMakingChange={(articleId, next) =>
              setInlineMaking((current) => ({ ...current, [articleId]: next }))
            }
            onApplyMaking={applyInlineMaking}
            onOpenPricing={setPricingLine}
            onRemoveLine={removeLine}
            onSetRate={() => requestLeave(() => router.push("/settings?tab=rates"))}
          />
        </TableCard.Root>

        {isFinalizedView ? (
          <p className="text-sm text-tertiary">
            Articles are now Sold. Returns are made from the invoice page.
          </p>
        ) : null}
      </div>

      <div className="lg:pl-0">
        <PosTotalsPanel
          invoice={invoice}
          quoteBlocked={quoteBlocked && !isFinalizedView}
          missingRate={missingRate}
          canFinalize={Boolean(canFinalize)}
          canPayFull={canPayFull}
          finalizeReason={finalizeReason}
          finalizePending={finalizeMutation.isPending}
          patchPending={patchMutation.isPending}
          invoiceDiscountMode={invoiceDiscountMode}
          invoiceDiscountValue={invoiceDiscountValue}
          discountOpen={discountOpen}
          tenders={isFinalizedView ? finalizedTenders : tenders}
          documentStatusLabel={isFinalizedView ? documentStatusLabel : null}
          whatsappStatusLabel={isFinalizedView ? whatsappStatusLabel : null}
          onDiscountOpenChange={setDiscountOpen}
          onInvoiceDiscountModeChange={setInvoiceDiscountMode}
          onInvoiceDiscountValueChange={setInvoiceDiscountValue}
          onApplyInvoiceDiscount={applyInvoiceDiscount}
          onPayRemaining={payRemaining}
          onAddPayment={() => setTenders((current) => [...current, emptyTender()])}
          onRemoveTender={(tenderId) =>
            setTenders((current) =>
              current.length <= 1 ? current : current.filter((row) => row.id !== tenderId),
            )
          }
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
          onNewSale={() => {
            resetDraftState();
            router.replace("/invoices/new");
          }}
          onOpenInvoice={
            invoice
              ? () => {
                  router.replace(`/invoices/${invoice.id}`);
                }
              : undefined
          }
        />
      </div>

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
          setActionError(null);
          focusScan({ force: true });
        }}
        onSubmit={(input) => submitQuickReceive(input)}
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
        isOpen={Boolean(pendingWalkIn)}
        title="Switch this sale to Walk-in?"
        message="The customer on this sale will change to Walk-in."
        confirmLabel="Switch to Walk-in"
        confirmColor="primary"
        cancelLabel="Keep customer"
        onConfirm={() => {
          const next = pendingWalkIn;
          setPendingWalkIn(null);
          if (next) {
            void selectCustomer(next);
          }
        }}
        onCancel={() => {
          setPendingWalkIn(null);
          setCustomerPickerKey((value) => value + 1);
        }}
      />

      <ConfirmDialog
        isOpen={leaveDiscardOpen}
        title="Leave this sale?"
        message={
          invoice
            ? "This draft stays in Invoices. You can resume it from the invoice list."
            : "No draft has been saved. The selected customer will be cleared."
        }
        confirmLabel="Leave"
        confirmColor="primary"
        cancelLabel="Keep editing"
        onConfirm={confirmLeaveDraft}
        onCancel={() => {
          setLeaveDiscardOpen(false);
          setPendingLeaveAction(null);
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
              Amount: <MoneyText amount={invoice?.grand_total_inr ?? "0"} className="text-primary" />
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
