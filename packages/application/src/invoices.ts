import { createHash } from "node:crypto";

import type {
  Invoice,
  InvoiceDraftCreate,
  InvoiceDraftPatch,
  InvoiceDraftQuickArticle,
  InvoiceFinalize,
  InvoiceLinePricing,
  InvoiceListItem,
  InvoiceQuoteRequest,
  InvoiceQuoteResponse,
  InvoiceStatus,
  Metal,
  PaymentMethod,
} from "@aabhushan/contracts";
import { DEFAULT_INVOICE_LINE_PRICING } from "@aabhushan/contracts";
import {
  CalculationDomainError,
  decimalFromString,
  kolkataBusinessDate,
  quoteInvoice,
  type CalculationPolicy,
  type InvoiceQuoteInput,
  type InvoiceQuoteResult,
} from "@aabhushan/domain";

import { assertPermission } from "./authorize";
import {
  ApplicationHttpError,
  conflictError,
  notFoundError,
  validationError,
} from "./http-error";
import { assertArticleWeights, type InventoryRepository } from "./inventory";
import type { ResolvedStaffAccess } from "./staff-access";

export type InvoiceQuoteRepository = {
  findByVersion(version: string): Promise<(CalculationPolicy & { id: string }) | null>;
  findApprovedByVersion(version: string): Promise<(CalculationPolicy & { id: string }) | null>;
  findLatestApproved(): Promise<(CalculationPolicy & { id: string }) | null>;
};

export type InvoiceDraftLineInput = {
  lineNo: number;
  articleId: string;
  articleNumber: string;
  barcode: string | null;
  description: string;
  metal: Metal;
  purity: string;
  grossWeightGrams: string;
  nonMetalWeightGrams: string;
  netMetalWeightGrams: string;
  ratePerGram: string | null;
  metalValueInr: string;
  makingChargeInr: string;
  wastageInr: string;
  stoneChargesInr: string;
  lineDiscountInr: string;
  lineTotalInr: string;
  pricing: InvoiceLinePricing;
};

export type InvoiceQuoteTotals = {
  calculationPolicyVersion: string | null;
  metalValueInr: string;
  makingChargesInr: string;
  wastageInr: string;
  stoneChargesInr: string;
  discountInr: string;
  taxInr: string;
  roundOffInr: string;
  grandTotalInr: string;
};

export type LockedArticle = {
  id: string;
  articleNumber: string;
  barcode: string | null;
  metal: Metal;
  purity: string;
  grossWeightGrams: string;
  nonMetalWeightGrams: string;
  netMetalWeightGrams: string;
  status: string;
  categoryName: string;
  rowVersion: number;
  description: string;
};

export type InvoiceListFilters = {
  page: number;
  pageSize: number;
  sort: "updated_at" | "business_date" | "grand_total_inr" | "status";
  direction: "asc" | "desc";
  status?: InvoiceStatus;
  customerId?: string;
  businessDateFrom?: string;
  businessDateTo?: string;
  q?: string;
};

export type InvoiceRepository = {
  createDraft(input: {
    customerId: string;
    businessDate: string;
    lines: InvoiceDraftLineInput[];
    quoteTotals: InvoiceQuoteTotals | null;
    invoiceDiscount: Invoice["invoice_discount"];
  }): Promise<Invoice>;
  getInvoice(invoiceId: string): Promise<Invoice | null>;
  listInvoices(input: InvoiceListFilters): Promise<{ items: InvoiceListItem[]; total: number }>;
  patchDraft(input: {
    invoiceId: string;
    customerId?: string;
    lines: InvoiceDraftLineInput[];
    quoteTotals: InvoiceQuoteTotals | null;
    invoiceDiscount: Invoice["invoice_discount"];
  }): Promise<Invoice>;
  lockDraftForUpdate(invoiceId: string): Promise<Invoice | null>;
  lockArticlesAscending(articleIds: string[]): Promise<LockedArticle[]>;
  findRatePerGram(input: { metal: Metal; purity: string; businessDate: string }): Promise<string | null>;
  findMakingChargeDefault(input: { metal: Metal; purity: string }): Promise<InvoiceLinePricing["making_charge"] | null>;
  allocateInvoiceNumber(): Promise<string>;
  markFinalized(input: {
    invoiceId: string;
    invoiceNumber: string;
    finalizedByStaffUserId: string;
    quote: InvoiceQuoteResponse;
    amountPaidInr: string;
    amountDueInr: string;
    lineSnapshots: Array<{
      articleId: string;
      articleNumber: string;
      barcode: string | null;
      description: string;
      metal: Metal;
      purity: string;
      grossWeightGrams: string;
      nonMetalWeightGrams: string;
      netMetalWeightGrams: string;
      ratePerGram: string;
      metalValueInr: string;
      makingChargeInr: string;
      wastageInr: string;
      stoneChargesInr: string;
      lineDiscountInr: string;
      lineTotalInr: string;
    }>;
  }): Promise<void>;
  insertSaleMovements(input: {
    invoiceId: string;
    articleIds: string[];
    actorStaffUserId: string;
  }): Promise<void>;
  /**
   * Initial tenders use the spec 09 payment, allocation, and receipt tables so a
   * counter sale and a later collection share one ledger.
   */
  insertPayments(input: {
    invoiceId: string;
    customerId: string;
    businessDate: string;
    actorStaffUserId: string;
    payments: Array<{ method: PaymentMethod; amountInr: string; reference: string | null }>;
  }): Promise<Array<{ paymentId: string; receiptNumber: string }>>;
  writeAudit(event: {
    actorStaffUserId: string;
    action: string;
    entityType: string;
    entityId: string;
    payload: Record<string, unknown>;
  }): Promise<void>;
  findIdempotency(input: {
    operation: string;
    key: string;
  }): Promise<{ requestHash: string; responseStatus: number; responseBody: unknown } | null>;
  insertIdempotency(input: {
    operation: string;
    key: string;
    requestHash: string;
    responseStatus: number;
    responseBody: unknown;
  }): Promise<void>;
  insertOutbox(input: {
    eventKey: string;
    eventType: string;
    payload: Record<string, unknown>;
  }): Promise<void>;
  customerExists(customerId: string): Promise<boolean>;
};

const FINALIZE_OPERATION = "invoice.finalize";
const ZERO = "0.00";

function normalizeLinePricing(input: Partial<InvoiceLinePricing> | null | undefined): InvoiceLinePricing {
  return {
    making_charge: input?.making_charge ?? DEFAULT_INVOICE_LINE_PRICING.making_charge,
    wastage: input?.wastage ?? DEFAULT_INVOICE_LINE_PRICING.wastage ?? { method: "none" },
    stone_charges: input?.stone_charges ?? [],
    line_discount: input?.line_discount ?? null,
  };
}

async function pricingForNewArticle(
  repo: InvoiceRepository,
  article: LockedArticle,
): Promise<InvoiceLinePricing> {
  const making = await repo.findMakingChargeDefault({ metal: article.metal, purity: article.purity });
  if (making) {
    return normalizeLinePricing({
      ...DEFAULT_INVOICE_LINE_PRICING,
      making_charge: making,
    });
  }
  return normalizeLinePricing(DEFAULT_INVOICE_LINE_PRICING);
}

function mapDomainError(error: CalculationDomainError): ApplicationHttpError {
  const fieldErrors = error.field ? [{ field: error.field, message: error.message }] : [];
  return new ApplicationHttpError(error.code, error.message, 422, fieldErrors);
}

function toDomainInput(body: InvoiceQuoteRequest, policyVersion: string): InvoiceQuoteInput {
  return {
    policyVersion,
    businessDate: body.business_date,
    lines: body.lines.map((line) => {
      const making = line.making_charge;
      let makingChargeInput: InvoiceQuoteInput["lines"][number]["makingChargeInput"];
      if (making.method === "fixed") {
        makingChargeInput = { method: "fixed", amountInr: making.amount_inr };
      } else if (making.method === "per_gram") {
        makingChargeInput = { method: "per_gram", ratePerGram: making.rate_per_gram };
      } else {
        makingChargeInput = { method: "percent_of_metal", percent: making.percent };
      }

      let wastageInput: InvoiceQuoteInput["lines"][number]["wastageInput"] = { method: "none" };
      if (line.wastage) {
        if (line.wastage.method === "none") {
          wastageInput = { method: "none" };
        } else {
          wastageInput = { method: "percent_of_net_weight", percent: line.wastage.percent };
        }
      }

      let lineDiscountInput: InvoiceQuoteInput["lines"][number]["lineDiscountInput"] = null;
      if (line.line_discount) {
        lineDiscountInput =
          line.line_discount.method === "amount"
            ? { method: "amount", amountInr: line.line_discount.amount_inr }
            : { method: "percent", percent: line.line_discount.percent };
      }

      return {
        lineId: line.line_id,
        ...(line.article_id ? { articleId: line.article_id } : {}),
        metal: line.metal,
        purity: line.purity,
        grossWeightGrams: line.gross_weight_grams,
        nonMetalWeightGrams: line.non_metal_weight_grams,
        netMetalWeightGrams: line.net_metal_weight_grams,
        ratePerGram: line.rate_per_gram,
        makingChargeInput,
        wastageInput,
        stoneCharges: (line.stone_charges ?? []).map((stone) => ({
          description: stone.description,
          amountInr: stone.amount_inr,
        })),
        lineDiscountInput,
      };
    }),
    invoiceDiscountInput: body.invoice_discount
      ? body.invoice_discount.method === "amount"
        ? { method: "amount", amountInr: body.invoice_discount.amount_inr }
        : { method: "percent", percent: body.invoice_discount.percent }
      : null,
    taxInput: body.tax ?? { method: "gst_jewellery_intra" },
  };
}

function toResponse(result: InvoiceQuoteResult): InvoiceQuoteResponse {
  return {
    policy_version: result.policyVersion,
    currency: result.currency,
    lines: result.lines.map((line) => ({
      line_id: line.lineId,
      article_id: line.articleId,
      metal_value_inr: line.metalValueInr,
      making_charge_inr: line.makingChargeInr,
      wastage_inr: line.wastageInr,
      stone_charges_inr: line.stoneChargesInr,
      line_discount_inr: line.lineDiscountInr,
      invoice_discount_allocated_inr: line.invoiceDiscountAllocatedInr,
      taxable_inr: line.taxableInr,
      line_subtotal_inr: line.lineSubtotalInr,
    })),
    metal_value_inr: result.metalValueInr,
    making_charge_inr: result.makingChargeInr,
    wastage_inr: result.wastageInr,
    stone_charges_inr: result.stoneChargesInr,
    line_discounts_inr: result.lineDiscountsInr,
    invoice_discount_inr: result.invoiceDiscountInr,
    taxable_inr: result.taxableInr,
    cgst_inr: result.cgstInr,
    sgst_inr: result.sgstInr,
    igst_inr: result.igstInr,
    tax_inr: result.taxInr,
    round_off_inr: result.roundOffInr,
    grand_total_inr: result.grandTotalInr,
    rounding_applied: result.roundingApplied,
  };
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

export function hashFinalizePayload(body: InvoiceFinalize): string {
  return createHash("sha256").update(canonicalJson(body)).digest("hex");
}

function withQuoteError(invoice: Invoice, error: ApplicationHttpError | null): Invoice {
  if (!error) {
    return { ...invoice, quote_error: null };
  }
  return {
    ...invoice,
    quote_error: { code: error.code, message: error.message },
  };
}

async function resolvePolicy(
  policyRepo: InvoiceQuoteRepository,
  policyVersion: string | undefined,
): Promise<CalculationPolicy> {
  if (policyVersion) {
    const byVersion = await policyRepo.findByVersion(policyVersion);
    if (!byVersion) {
      throw new ApplicationHttpError(
        "CALCULATION_POLICY_UNAPPROVED",
        `No calculation policy version ${policyVersion} exists for this organization.`,
        422,
        [{ field: "policy_version", message: "Unknown calculation policy version." }],
      );
    }
    return byVersion;
  }
  const latest = await policyRepo.findLatestApproved();
  if (!latest) {
    throw new ApplicationHttpError(
      "CALCULATION_POLICY_UNAPPROVED",
      "No approved calculation policy exists. Seed invoice.v1 with pnpm seed:calculation-policy.",
      422,
    );
  }
  return latest;
}

async function buildLinesFromArticles(
  repo: InvoiceRepository,
  articles: LockedArticle[],
  businessDate: string,
  quote: InvoiceQuoteResponse | null,
  pricingByArticleId: Map<string, InvoiceLinePricing>,
): Promise<InvoiceDraftLineInput[]> {
  const lines: InvoiceDraftLineInput[] = [];
  for (let index = 0; index < articles.length; index += 1) {
    const article = articles[index];
    if (!article) {
      continue;
    }
    const rate = await repo.findRatePerGram({
      metal: article.metal,
      purity: article.purity,
      businessDate,
    });
    const breakdown = quote?.lines.find((line) => line.article_id === article.id);
    lines.push({
      lineNo: index + 1,
      articleId: article.id,
      articleNumber: article.articleNumber,
      barcode: article.barcode,
      description: article.description,
      metal: article.metal,
      purity: article.purity,
      grossWeightGrams: article.grossWeightGrams,
      nonMetalWeightGrams: article.nonMetalWeightGrams,
      netMetalWeightGrams: article.netMetalWeightGrams,
      ratePerGram: rate,
      metalValueInr: breakdown?.metal_value_inr ?? ZERO,
      makingChargeInr: breakdown?.making_charge_inr ?? ZERO,
      wastageInr: breakdown?.wastage_inr ?? ZERO,
      stoneChargesInr: breakdown?.stone_charges_inr ?? ZERO,
      lineDiscountInr: breakdown?.line_discount_inr ?? ZERO,
      lineTotalInr: breakdown?.line_subtotal_inr ?? ZERO,
      pricing: normalizeLinePricing(pricingByArticleId.get(article.id)),
    });
  }
  return lines;
}

async function tryQuoteArticles(
  repo: InvoiceRepository,
  policyRepo: InvoiceQuoteRepository,
  articles: LockedArticle[],
  businessDate: string,
  pricingByArticleId: Map<string, InvoiceLinePricing>,
  invoiceDiscount: Invoice["invoice_discount"],
): Promise<{ quote: InvoiceQuoteResponse | null; error: ApplicationHttpError | null }> {
  if (articles.length === 0) {
    return { quote: null, error: null };
  }

  const quoteLines: InvoiceQuoteRequest["lines"] = [];
  for (const article of articles) {
    const rate = await repo.findRatePerGram({
      metal: article.metal,
      purity: article.purity,
      businessDate,
    });
    if (!rate) {
      return {
        quote: null,
        error: new ApplicationHttpError(
          "CALCULATION_INPUT_INVALID",
          `No metal rate for ${article.metal} ${article.purity} as of ${businessDate}.`,
          422,
          [{ field: "rate_per_gram", message: "Metal rate is missing for this business date." }],
        ),
      };
    }
    const pricing = normalizeLinePricing(pricingByArticleId.get(article.id));
    quoteLines.push({
      line_id: article.id,
      article_id: article.id,
      metal: article.metal,
      purity: article.purity,
      gross_weight_grams: article.grossWeightGrams,
      non_metal_weight_grams: article.nonMetalWeightGrams,
      net_metal_weight_grams: article.netMetalWeightGrams,
      rate_per_gram: rate,
      making_charge: pricing.making_charge,
      wastage: pricing.wastage ?? { method: "none" },
      stone_charges: pricing.stone_charges ?? [],
      ...(pricing.line_discount ? { line_discount: pricing.line_discount } : {}),
    });
  }

  try {
    const policy = await resolvePolicy(policyRepo, undefined);
    const result = quoteInvoice(
      toDomainInput(
        {
          business_date: businessDate,
          lines: quoteLines,
          ...(invoiceDiscount ? { invoice_discount: invoiceDiscount } : {}),
          tax: { method: "gst_jewellery_intra" },
        },
        policy.version,
      ),
      policy,
    );
    return { quote: toResponse(result), error: null };
  } catch (error) {
    if (error instanceof CalculationDomainError) {
      return { quote: null, error: mapDomainError(error) };
    }
    if (error instanceof ApplicationHttpError) {
      return { quote: null, error };
    }
    throw error;
  }
}

function totalsFromQuote(quote: InvoiceQuoteResponse | null): InvoiceQuoteTotals | null {
  if (!quote) {
    return null;
  }
  return {
    calculationPolicyVersion: quote.policy_version,
    metalValueInr: quote.metal_value_inr,
    makingChargesInr: quote.making_charge_inr,
    wastageInr: quote.wastage_inr,
    stoneChargesInr: quote.stone_charges_inr,
    discountInr: moneySum([quote.line_discounts_inr, quote.invoice_discount_inr]),
    taxInr: quote.tax_inr,
    roundOffInr: quote.round_off_inr,
    grandTotalInr: quote.grand_total_inr,
  };
}

function moneySum(amounts: string[]): string {
  let total = decimalFromString("0");
  for (const amount of amounts) {
    total = total.plus(decimalFromString(amount));
  }
  return total.toFixed(2);
}

function moneyGt(left: string, right: string): boolean {
  return decimalFromString(left).gt(decimalFromString(right));
}

function moneyMinus(left: string, right: string): string {
  return decimalFromString(left).minus(decimalFromString(right)).toFixed(2);
}

/**
 * Server-authoritative invoice quote. Does not create a sale.
 * Fails closed until an approved policy with owner-confirmed methods exists.
 */
export async function quoteInvoiceForStaff(
  repo: InvoiceQuoteRepository,
  access: ResolvedStaffAccess,
  body: InvoiceQuoteRequest,
): Promise<InvoiceQuoteResponse> {
  assertPermission(access, "billing.write");

  const businessDate = body.business_date || kolkataBusinessDate();
  const request: InvoiceQuoteRequest = { ...body, business_date: businessDate };
  const policy = await resolvePolicy(repo, request.policy_version);

  try {
    const result = quoteInvoice(toDomainInput(request, policy.version), policy);
    return toResponse(result);
  } catch (error) {
    if (error instanceof CalculationDomainError) {
      throw mapDomainError(error);
    }
    throw error;
  }
}

export async function createInvoiceDraft(
  repo: InvoiceRepository,
  policyRepo: InvoiceQuoteRepository,
  access: ResolvedStaffAccess,
  body: InvoiceDraftCreate,
): Promise<Invoice> {
  assertPermission(access, "billing.write");

  if (!(await repo.customerExists(body.customer_id))) {
    throw notFoundError("Customer was not found.");
  }

  const businessDate = body.business_date ?? kolkataBusinessDate();
  const articleIds = [...new Set(body.article_ids ?? [])];
  if ((body.article_ids?.length ?? 0) !== articleIds.length) {
    throw conflictError("ARTICLE_ALREADY_ON_DRAFT", "The same article cannot appear twice on one invoice.");
  }

  const articles = articleIds.length > 0 ? await repo.lockArticlesAscending(articleIds) : [];
  if (articles.length !== articleIds.length) {
    throw notFoundError("One or more articles were not found.");
  }
  for (const article of articles) {
    if (article.status !== "available") {
      throw conflictError(
        article.status === "sold" ? "ARTICLE_SOLD" : "ARTICLE_NOT_SELLABLE",
        `Article ${article.articleNumber} is not available for sale.`,
      );
    }
  }

  const pricingByArticleId = new Map<string, InvoiceLinePricing>();
  for (const article of articles) {
    pricingByArticleId.set(article.id, await pricingForNewArticle(repo, article));
  }

  const { quote, error } = await tryQuoteArticles(
    repo,
    policyRepo,
    articles,
    businessDate,
    pricingByArticleId,
    null,
  );
  const lines = await buildLinesFromArticles(repo, articles, businessDate, quote, pricingByArticleId);
  const invoice = await repo.createDraft({
    customerId: body.customer_id,
    businessDate,
    lines,
    quoteTotals: totalsFromQuote(quote),
    invoiceDiscount: null,
  });

  await repo.writeAudit({
    actorStaffUserId: access.staff_user_id,
    action: "invoice.draft.create",
    entityType: "invoice",
    entityId: invoice.id,
    payload: { customer_id: body.customer_id, line_count: lines.length },
  });
  return withQuoteError(invoice, error);
}

export async function getInvoice(
  repo: InvoiceRepository,
  access: ResolvedStaffAccess,
  invoiceId: string,
): Promise<Invoice> {
  assertPermission(access, "billing.write");
  const invoice = await repo.getInvoice(invoiceId);
  if (!invoice) {
    throw notFoundError("Invoice was not found.");
  }
  return invoice;
}

export async function listInvoices(
  repo: InvoiceRepository,
  access: ResolvedStaffAccess,
  filters: InvoiceListFilters,
): Promise<{ items: InvoiceListItem[]; total: number }> {
  assertPermission(access, "billing.write");
  return repo.listInvoices(filters);
}

export async function patchInvoiceDraft(
  repo: InvoiceRepository,
  policyRepo: InvoiceQuoteRepository,
  access: ResolvedStaffAccess,
  invoiceId: string,
  body: InvoiceDraftPatch,
): Promise<Invoice> {
  assertPermission(access, "billing.write");

  const existing = await repo.lockDraftForUpdate(invoiceId);
  if (!existing) {
    throw notFoundError("Invoice draft was not found.");
  }
  if (existing.status !== "draft") {
    throw conflictError("INVOICE_NOT_DRAFT", "Only draft invoices can be edited.");
  }

  if (body.customer_id !== undefined && !(await repo.customerExists(body.customer_id))) {
    throw notFoundError("Customer was not found.");
  }

  const currentArticleIds = existing.lines.map((line) => line.article_id);
  const removeSet = new Set(body.remove_article_ids ?? []);
  let nextIds = currentArticleIds.filter((id) => !removeSet.has(id));

  for (const articleId of body.add_article_ids ?? []) {
    if (nextIds.includes(articleId)) {
      throw conflictError("ARTICLE_ALREADY_ON_DRAFT", "That article is already on this draft.");
    }
    nextIds.push(articleId);
  }

  nextIds = [...new Set(nextIds)];
  const articles = nextIds.length > 0 ? await repo.lockArticlesAscending(nextIds) : [];
  if (articles.length !== nextIds.length) {
    throw notFoundError("One or more articles were not found.");
  }
  for (const article of articles) {
    if (article.status !== "available") {
      throw conflictError(
        article.status === "sold" ? "ARTICLE_SOLD" : "ARTICLE_NOT_SELLABLE",
        `Article ${article.articleNumber} is not available for sale.`,
      );
    }
  }

  const pricingByArticleId = new Map<string, InvoiceLinePricing>();
  for (const line of existing.lines) {
    if (nextIds.includes(line.article_id)) {
      pricingByArticleId.set(line.article_id, normalizeLinePricing(line.pricing));
    }
  }
  for (const articleId of body.add_article_ids ?? []) {
    if (!pricingByArticleId.has(articleId)) {
      const article = articles.find((item) => item.id === articleId);
      if (!article) {
        throw notFoundError("One or more articles were not found.");
      }
      pricingByArticleId.set(articleId, await pricingForNewArticle(repo, article));
    }
  }
  for (const update of body.line_pricing ?? []) {
    if (!nextIds.includes(update.article_id)) {
      throw validationError("line_pricing refers to an article not on this draft.", [
        { field: "line_pricing", message: `Unknown article ${update.article_id}.` },
      ]);
    }
    pricingByArticleId.set(
      update.article_id,
      normalizeLinePricing({
        making_charge: update.making_charge,
        wastage: update.wastage,
        stone_charges: update.stone_charges,
        line_discount: update.line_discount,
      }),
    );
  }

  const invoiceDiscount =
    body.invoice_discount !== undefined ? body.invoice_discount : existing.invoice_discount;

  const { quote, error } = await tryQuoteArticles(
    repo,
    policyRepo,
    articles,
    existing.business_date,
    pricingByArticleId,
    invoiceDiscount,
  );
  const lines = await buildLinesFromArticles(
    repo,
    articles,
    existing.business_date,
    quote,
    pricingByArticleId,
  );
  const patchInput: {
    invoiceId: string;
    customerId?: string;
    lines: InvoiceDraftLineInput[];
    quoteTotals: InvoiceQuoteTotals | null;
    invoiceDiscount: Invoice["invoice_discount"];
  } = {
    invoiceId,
    lines,
    quoteTotals: totalsFromQuote(quote),
    invoiceDiscount,
  };
  if (body.customer_id !== undefined) {
    patchInput.customerId = body.customer_id;
  }

  const invoice = await repo.patchDraft(patchInput);
  await repo.writeAudit({
    actorStaffUserId: access.staff_user_id,
    action: "invoice.draft.patch",
    entityType: "invoice",
    entityId: invoice.id,
    payload: { line_count: lines.length },
  });
  return withQuoteError(invoice, error);
}

function emptyToNull(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === "23505";
}

function isCheckViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === "23514";
}

/**
 * POS quick receive: create a minimal available article and add it to the draft
 * in one caller transaction. Authorized by billing.write (not inventory.write).
 */
export async function quickReceiveArticleOntoDraft(
  invoiceRepo: InvoiceRepository,
  inventoryRepo: InventoryRepository,
  policyRepo: InvoiceQuoteRepository,
  access: ResolvedStaffAccess,
  invoiceId: string,
  body: InvoiceDraftQuickArticle,
  now: Date = new Date(),
): Promise<Invoice> {
  assertPermission(access, "billing.write");

  const existing = await invoiceRepo.lockDraftForUpdate(invoiceId);
  if (!existing) {
    throw notFoundError("Invoice draft was not found.");
  }
  if (existing.status !== "draft") {
    throw conflictError("INVOICE_NOT_DRAFT", "Only draft invoices can be edited.");
  }

  const nonMetal = body.non_metal_weight_grams ?? "0";
  assertArticleWeights({
    grossWeightGrams: body.gross_weight_grams,
    nonMetalWeightGrams: nonMetal,
    netMetalWeightGrams: body.net_metal_weight_grams,
  });

  if (!(await inventoryRepo.categoryExists(body.category_id))) {
    throw validationError("Category was not found.", [{ field: "category_id", message: "Unknown category." }]);
  }
  if (body.location_id && !(await inventoryRepo.locationExists(body.location_id))) {
    throw validationError("Storage location was not found.", [
      { field: "location_id", message: "Unknown location." },
    ]);
  }

  const articleNumber = await inventoryRepo.allocateArticleNumber();
  let articleId: string;
  try {
    const article = await inventoryRepo.insertArticle({
      articleNumber,
      categoryId: body.category_id,
      metal: body.metal,
      purity: body.purity,
      grossWeightGrams: body.gross_weight_grams,
      nonMetalWeightGrams: nonMetal,
      netMetalWeightGrams: body.net_metal_weight_grams,
      huid: emptyToNull(body.huid),
      supplierRef: null,
      karigarRef: null,
      receiptBusinessDate: kolkataBusinessDate(now),
      acquisitionCostInr: null,
      locationId: body.location_id ?? null,
      stones: [],
      photograph: null,
      actorStaffUserId: access.staff_user_id,
    });
    articleId = article.id;
    await inventoryRepo.writeAudit({
      actorStaffUserId: access.staff_user_id,
      action: "inventory.article.receive",
      entityType: "article",
      entityId: article.id,
      payload: {
        article_number: article.article_number,
        status: article.status,
        net_metal_weight_grams: article.net_metal_weight_grams,
        source: "pos_quick_receive",
        invoice_id: invoiceId,
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw conflictError("ARTICLE_NUMBER_CONFLICT", "An article with this number already exists.");
    }
    if (isCheckViolation(error)) {
      throw validationError("Net metal weight must equal gross weight minus non-metal weight.", [
        { field: "net_metal_weight_grams", message: "Does not match gross minus non-metal weight." },
      ]);
    }
    throw error;
  }

  const updated = await patchInvoiceDraft(invoiceRepo, policyRepo, access, invoiceId, {
    add_article_ids: [articleId],
  });

  await invoiceRepo.writeAudit({
    actorStaffUserId: access.staff_user_id,
    action: "invoice.draft.quick_receive",
    entityType: "invoice",
    entityId: invoiceId,
    payload: { article_id: articleId, article_number: articleNumber },
  });

  return updated;
}

export async function refreshDraftQuote(
  repo: InvoiceRepository,
  policyRepo: InvoiceQuoteRepository,
  access: ResolvedStaffAccess,
  invoiceId: string,
): Promise<Invoice> {
  assertPermission(access, "billing.write");
  const existing = await repo.lockDraftForUpdate(invoiceId);
  if (!existing) {
    throw notFoundError("Invoice draft was not found.");
  }
  if (existing.status !== "draft") {
    throw conflictError("INVOICE_NOT_DRAFT", "Only draft invoices can be quoted.");
  }

  const articleIds = existing.lines.map((line) => line.article_id);
  const articles = articleIds.length > 0 ? await repo.lockArticlesAscending(articleIds) : [];
  const pricingByArticleId = new Map<string, InvoiceLinePricing>();
  for (const line of existing.lines) {
    pricingByArticleId.set(line.article_id, normalizeLinePricing(line.pricing));
  }
  const { quote, error } = await tryQuoteArticles(
    repo,
    policyRepo,
    articles,
    existing.business_date,
    pricingByArticleId,
    existing.invoice_discount,
  );
  if (error) {
    throw error;
  }
  if (!quote) {
    throw validationError("Draft has no lines to quote.", [{ field: "lines", message: "Add at least one article." }]);
  }

  const lines = await buildLinesFromArticles(
    repo,
    articles,
    existing.business_date,
    quote,
    pricingByArticleId,
  );
  const invoice = await repo.patchDraft({
    invoiceId,
    lines,
    quoteTotals: totalsFromQuote(quote),
    invoiceDiscount: existing.invoice_discount,
  });
  return withQuoteError(invoice, null);
}

export async function finalizeInvoice(
  repo: InvoiceRepository,
  policyRepo: InvoiceQuoteRepository,
  access: ResolvedStaffAccess,
  invoiceId: string,
  body: InvoiceFinalize,
  idempotencyKey: string | undefined,
): Promise<Invoice> {
  assertPermission(access, "billing.write");

  if (!idempotencyKey || !idempotencyKey.trim()) {
    throw validationError("Idempotency-Key header is required to finalize an invoice.", [
      { field: "Idempotency-Key", message: "Provide a non-empty Idempotency-Key header." },
    ]);
  }
  const key = idempotencyKey.trim();
  const requestHash = hashFinalizePayload(body);

  const existingKey = await repo.findIdempotency({ operation: FINALIZE_OPERATION, key });
  if (existingKey) {
    if (existingKey.requestHash !== requestHash) {
      throw conflictError(
        "IDEMPOTENCY_KEY_REUSED",
        "This Idempotency-Key was already used with a different finalize payload.",
      );
    }
    return existingKey.responseBody as Invoice;
  }

  const draft = await repo.lockDraftForUpdate(invoiceId);
  if (!draft) {
    throw notFoundError("Invoice draft was not found.");
  }
  if (draft.status !== "draft") {
    throw conflictError("INVOICE_NOT_DRAFT", "This invoice is already finalized.");
  }
  if (draft.lines.length === 0) {
    throw validationError("Cannot finalize an invoice with no lines.", [
      { field: "lines", message: "Add at least one available article." },
    ]);
  }
  if (draft.quote_version !== body.quote_version) {
    throw conflictError(
      "STALE_QUOTE",
      "The quote changed since this screen loaded. Refresh the draft totals and try again.",
    );
  }

  const articleIds = draft.lines.map((line) => line.article_id);
  const articles = await repo.lockArticlesAscending(articleIds);
  if (articles.length !== articleIds.length) {
    throw conflictError("ARTICLE_UNAVAILABLE", "One or more articles are no longer available.");
  }
  for (const article of articles) {
    if (article.status !== "available") {
      throw conflictError(
        article.status === "sold" ? "ARTICLE_SOLD" : "ARTICLE_NOT_SELLABLE",
        `Article ${article.articleNumber} is not available for sale.`,
      );
    }
  }

  const { quote, error } = await tryQuoteArticles(
    repo,
    policyRepo,
    articles,
    draft.business_date,
    (() => {
      const map = new Map<string, InvoiceLinePricing>();
      for (const line of draft.lines) {
        map.set(line.article_id, normalizeLinePricing(line.pricing));
      }
      return map;
    })(),
    draft.invoice_discount,
  );
  if (error || !quote) {
    throw error ?? new ApplicationHttpError(
      "CALCULATION_POLICY_UNAPPROVED",
      "Calculations are blocked: no approved calculation policy or quote could be produced.",
      422,
    );
  }

  const payments = body.payments ?? [];
  const paidTotal = moneySum(payments.map((payment) => payment.amount_inr));
  if (moneyGt(paidTotal, quote.grand_total_inr)) {
    throw validationError("Initial tender cannot exceed the invoice grand total.", [
      { field: "payments", message: "Overpayment is not permitted without an approved credit policy." },
    ]);
  }
  const amountDue = moneyMinus(quote.grand_total_inr, paidTotal);

  const invoiceNumber = await repo.allocateInvoiceNumber();
  const lineSnapshots = await Promise.all(
    articles.map(async (article) => {
      const rate = await repo.findRatePerGram({
        metal: article.metal,
        purity: article.purity,
        businessDate: draft.business_date,
      });
      if (!rate) {
        throw new ApplicationHttpError(
          "CALCULATION_INPUT_INVALID",
          `No metal rate for ${article.metal} ${article.purity} as of ${draft.business_date}.`,
          422,
        );
      }
      const breakdown = quote.lines.find((line) => line.article_id === article.id);
      if (!breakdown) {
        throw new ApplicationHttpError(
          "CALCULATION_INPUT_INVALID",
          `Missing quote breakdown for article ${article.articleNumber}.`,
          422,
        );
      }
      return {
        articleId: article.id,
        articleNumber: article.articleNumber,
        barcode: article.barcode,
        description: article.description,
        metal: article.metal,
        purity: article.purity,
        grossWeightGrams: article.grossWeightGrams,
        nonMetalWeightGrams: article.nonMetalWeightGrams,
        netMetalWeightGrams: article.netMetalWeightGrams,
        ratePerGram: rate,
        metalValueInr: breakdown.metal_value_inr,
        makingChargeInr: breakdown.making_charge_inr,
        wastageInr: breakdown.wastage_inr,
        stoneChargesInr: breakdown.stone_charges_inr,
        lineDiscountInr: breakdown.line_discount_inr,
        lineTotalInr: breakdown.line_subtotal_inr,
      };
    }),
  );

  await repo.markFinalized({
    invoiceId,
    invoiceNumber,
    finalizedByStaffUserId: access.staff_user_id,
    quote,
    amountPaidInr: paidTotal,
    amountDueInr: amountDue,
    lineSnapshots,
  });

  await repo.insertSaleMovements({
    invoiceId,
    articleIds,
    actorStaffUserId: access.staff_user_id,
  });

  const postedTenders =
    payments.length > 0
      ? await repo.insertPayments({
          invoiceId,
          customerId: draft.customer_id,
          businessDate: draft.business_date,
          actorStaffUserId: access.staff_user_id,
          payments: payments.map((payment) => ({
            method: payment.method,
            amountInr: payment.amount_inr,
            reference: payment.reference ?? null,
          })),
        })
      : [];

  for (const tender of postedTenders) {
    await repo.insertOutbox({
      eventKey: `receipt.requested:${tender.paymentId}`,
      eventType: "receipt.requested",
      payload: { payment_id: tender.paymentId, receipt_number: tender.receiptNumber, invoice_id: invoiceId },
    });
  }

  await repo.writeAudit({
    actorStaffUserId: access.staff_user_id,
    action: "invoice.finalize",
    entityType: "invoice",
    entityId: invoiceId,
    payload: {
      invoice_number: invoiceNumber,
      grand_total_inr: quote.grand_total_inr,
      amount_paid_inr: paidTotal,
      amount_due_inr: amountDue,
    },
  });

  await repo.insertOutbox({
    eventKey: `invoice.finalized:${invoiceId}`,
    eventType: "invoice.finalized",
    payload: { invoice_id: invoiceId, invoice_number: invoiceNumber },
  });

  const finalized = await repo.getInvoice(invoiceId);
  if (!finalized) {
    throw new Error("Finalized invoice could not be reloaded.");
  }

  await repo.insertIdempotency({
    operation: FINALIZE_OPERATION,
    key,
    requestHash,
    responseStatus: 200,
    responseBody: finalized,
  });

  return finalized;
}
