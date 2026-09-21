import { z } from "zod";

import { refineBusinessDateBounds } from "./business-date-range";
import { articleCreateSchema } from "./inventory";
import { paginatedResponseSchema } from "./pagination";
import { businessDateSchema, metalSchema } from "./shop";

const weightGramsSchema = z
  .string()
  .regex(/^\d+(\.\d{1,4})?$/, "Use a weight decimal string with at most 4 fractional digits.");

const ratePerGramSchema = z
  .string()
  .regex(/^\d+(\.\d{1,6})?$/, "Use a rate decimal string with at most 6 fractional digits.");

const moneyAmountSchema = z
  .string()
  .regex(/^-?\d+(\.\d{1,2})?$/, "Use a money decimal string with at most 2 fractional digits.");

const positiveMoneyAmountSchema = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, "Use a positive money decimal string with at most 2 fractional digits.")
  .refine((value) => value !== "0" && !/^0+(\.0+)?$/.test(value), "Amount must be greater than zero.");

const percentSchema = z
  .string()
  .regex(/^\d+(\.\d{1,6})?$/, "Use a percent decimal string with at most 6 fractional digits.")
  .refine((value) => Number(value) <= 100, "Percent must be between 0 and 100.");

export const makingChargeSchema = z.discriminatedUnion("method", [
  z.object({ method: z.literal("fixed"), amount_inr: moneyAmountSchema }).strict(),
  z.object({ method: z.literal("per_gram"), rate_per_gram: ratePerGramSchema }).strict(),
  z.object({ method: z.literal("percent_of_metal"), percent: percentSchema }).strict(),
]);

export type MakingCharge = z.infer<typeof makingChargeSchema>;

const wastageSchema = z.discriminatedUnion("method", [
  z.object({ method: z.literal("none") }).strict(),
  z.object({ method: z.literal("percent_of_net_weight"), percent: percentSchema }).strict(),
]);

const discountSchema = z.discriminatedUnion("method", [
  z.object({ method: z.literal("amount"), amount_inr: moneyAmountSchema }).strict(),
  z.object({ method: z.literal("percent"), percent: percentSchema }).strict(),
]);

const taxSchema = z.discriminatedUnion("method", [
  z.object({ method: z.literal("gst_jewellery_intra") }).strict(),
  z.object({ method: z.literal("gst_jewellery_igst") }).strict(),
]);

const stoneChargeSchema = z
  .object({
    description: z.string().trim().min(1).max(120),
    amount_inr: moneyAmountSchema,
  })
  .strict();

export const invoiceLinePricingSchema = z
  .object({
    making_charge: makingChargeSchema,
    wastage: wastageSchema.nullable().optional(),
    stone_charges: z.array(stoneChargeSchema).max(20).optional(),
    line_discount: discountSchema.nullable().optional(),
  })
  .strict();

export type InvoiceLinePricing = z.infer<typeof invoiceLinePricingSchema>;

export const DEFAULT_INVOICE_LINE_PRICING: InvoiceLinePricing = {
  making_charge: { method: "fixed", amount_inr: "0.00" },
  wastage: { method: "none" },
  stone_charges: [],
  line_discount: null,
};

export const makingChargeDefaultSchema = z.object({
  id: z.string().uuid(),
  metal: metalSchema,
  purity: z.string().min(1),
  making_charge: makingChargeSchema,
  updated_by_staff_user_id: z.string().uuid(),
  updated_at: z.string().datetime({ offset: true }),
});

export const makingChargeDefaultUpsertSchema = z
  .object({
    metal: metalSchema,
    purity: z.string().trim().min(1).max(40),
    making_charge: makingChargeSchema,
  })
  .strict();

export const MAKING_CHARGE_DEFAULT_SORT_FIELDS = ["metal", "purity", "updated_at"] as const;

export const makingChargeDefaultListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(50),
  sort: z.enum(MAKING_CHARGE_DEFAULT_SORT_FIELDS).default("metal"),
  direction: z.enum(["asc", "desc"]).default("asc"),
});

export const makingChargeDefaultListSchema = paginatedResponseSchema(
  makingChargeDefaultSchema,
  MAKING_CHARGE_DEFAULT_SORT_FIELDS,
);

export type MakingChargeDefault = z.infer<typeof makingChargeDefaultSchema>;
export type MakingChargeDefaultUpsert = z.infer<typeof makingChargeDefaultUpsertSchema>;
export type MakingChargeDefaultList = z.infer<typeof makingChargeDefaultListSchema>;

export const invoiceQuoteLineRequestSchema = z
  .object({
    line_id: z.string().trim().min(1).max(80),
    article_id: z.string().uuid().optional(),
    metal: metalSchema,
    purity: z.string().trim().min(1).max(40),
    gross_weight_grams: weightGramsSchema,
    non_metal_weight_grams: weightGramsSchema,
    net_metal_weight_grams: weightGramsSchema,
    rate_per_gram: ratePerGramSchema,
    making_charge: makingChargeSchema,
    wastage: wastageSchema.nullable().optional(),
    stone_charges: z.array(stoneChargeSchema).max(20).optional(),
    line_discount: discountSchema.nullable().optional(),
  })
  .strict();

export const invoiceQuoteRequestSchema = z
  .object({
    policy_version: z.string().trim().min(1).max(80).optional(),
    business_date: businessDateSchema,
    lines: z.array(invoiceQuoteLineRequestSchema).min(1).max(100),
    invoice_discount: discountSchema.nullable().optional(),
    tax: taxSchema.nullable().optional(),
  })
  .strict();

export type InvoiceQuoteRequest = z.infer<typeof invoiceQuoteRequestSchema>;
export type InvoiceQuoteLineRequest = z.infer<typeof invoiceQuoteLineRequestSchema>;

export const invoiceQuoteLineBreakdownSchema = z.object({
  line_id: z.string(),
  article_id: z.string().uuid().nullable(),
  metal_value_inr: moneyAmountSchema,
  making_charge_inr: moneyAmountSchema,
  wastage_inr: moneyAmountSchema,
  stone_charges_inr: moneyAmountSchema,
  line_discount_inr: moneyAmountSchema,
  invoice_discount_allocated_inr: moneyAmountSchema,
  taxable_inr: moneyAmountSchema,
  line_subtotal_inr: moneyAmountSchema,
});

export const invoiceQuoteResponseSchema = z.object({
  policy_version: z.string(),
  currency: z.literal("INR"),
  lines: z.array(invoiceQuoteLineBreakdownSchema),
  metal_value_inr: moneyAmountSchema,
  making_charge_inr: moneyAmountSchema,
  wastage_inr: moneyAmountSchema,
  stone_charges_inr: moneyAmountSchema,
  line_discounts_inr: moneyAmountSchema,
  invoice_discount_inr: moneyAmountSchema,
  taxable_inr: moneyAmountSchema,
  cgst_inr: moneyAmountSchema,
  sgst_inr: moneyAmountSchema,
  igst_inr: moneyAmountSchema,
  tax_inr: moneyAmountSchema,
  round_off_inr: moneyAmountSchema,
  grand_total_inr: moneyAmountSchema,
  rounding_applied: z.object({
    mode: z.string(),
    scale: z.number().int().nonnegative(),
    stage: z.literal("grand_total"),
  }),
});

export type InvoiceQuoteResponse = z.infer<typeof invoiceQuoteResponseSchema>;

export const calculationPolicyStatusSchema = z.enum(["draft", "approved", "retired"]);

export const calculationPolicySchema = z.object({
  id: z.string().uuid(),
  version: z.string(),
  status: calculationPolicyStatusSchema,
  currency: z.literal("INR"),
  weight_unit: z.literal("g"),
  rate_unit: z.literal("per_g"),
  making_charge_method: z.string().nullable(),
  wastage_method: z.string().nullable(),
  discount_method: z.string().nullable(),
  tax_method: z.string().nullable(),
  rounding_mode: z.string().nullable(),
  rounding_scale: z.number().int().nullable(),
  approved_at: z.string().datetime({ offset: true }).nullable(),
});

export type CalculationPolicyDto = z.infer<typeof calculationPolicySchema>;

export const invoiceStatusSchema = z.enum(["draft", "finalized"]);
export type InvoiceStatus = z.infer<typeof invoiceStatusSchema>;

export const paymentMethodSchema = z.enum(["cash", "upi", "card", "bank"]);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

export const invoiceQuoteErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
});

export type InvoiceQuoteError = z.infer<typeof invoiceQuoteErrorSchema>;

export const invoiceLineSchema = z.object({
  id: z.string().uuid(),
  line_no: z.number().int().positive(),
  article_id: z.string().uuid(),
  article_number: z.string().min(1),
  barcode: z.string().nullable(),
  description: z.string().min(1),
  metal: metalSchema,
  purity: z.string().min(1),
  gross_weight_grams: weightGramsSchema,
  non_metal_weight_grams: weightGramsSchema,
  net_metal_weight_grams: weightGramsSchema,
  rate_per_gram: ratePerGramSchema.nullable(),
  metal_value_inr: moneyAmountSchema,
  making_charge_inr: moneyAmountSchema,
  wastage_inr: moneyAmountSchema,
  stone_charges_inr: moneyAmountSchema,
  line_discount_inr: moneyAmountSchema,
  line_total_inr: moneyAmountSchema,
  pricing: invoiceLinePricingSchema,
});

export type InvoiceLine = z.infer<typeof invoiceLineSchema>;

export const invoiceSchema = z.object({
  id: z.string().uuid(),
  invoice_number: z.string().nullable(),
  customer_id: z.string().uuid(),
  customer_display_name: z.string().min(1),
  status: invoiceStatusSchema,
  business_date: businessDateSchema,
  quote_version: z.number().int().positive(),
  calculation_policy_version: z.string().nullable(),
  metal_value_inr: moneyAmountSchema,
  making_charges_inr: moneyAmountSchema,
  wastage_inr: moneyAmountSchema,
  stone_charges_inr: moneyAmountSchema,
  discount_inr: moneyAmountSchema,
  tax_inr: moneyAmountSchema,
  round_off_inr: moneyAmountSchema,
  grand_total_inr: moneyAmountSchema,
  amount_paid_inr: moneyAmountSchema,
  amount_due_inr: moneyAmountSchema,
  invoice_discount: discountSchema.nullable(),
  finalized_at: z.string().datetime({ offset: true }).nullable(),
  finalized_by_staff_user_id: z.string().uuid().nullable(),
  row_version: z.number().int().positive(),
  lines: z.array(invoiceLineSchema),
  quote_error: invoiceQuoteErrorSchema.nullable(),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});

export type Invoice = z.infer<typeof invoiceSchema>;

export const invoiceListItemSchema = z.object({
  id: z.string().uuid(),
  invoice_number: z.string().nullable(),
  customer_id: z.string().uuid(),
  customer_display_name: z.string().min(1),
  status: invoiceStatusSchema,
  business_date: businessDateSchema,
  grand_total_inr: moneyAmountSchema,
  amount_paid_inr: moneyAmountSchema,
  amount_due_inr: moneyAmountSchema,
  quote_version: z.number().int().positive(),
  line_count: z.number().int().nonnegative(),
  finalized_at: z.string().datetime({ offset: true }).nullable(),
  updated_at: z.string().datetime({ offset: true }),
});

export type InvoiceListItem = z.infer<typeof invoiceListItemSchema>;

export const INVOICE_SORT_FIELDS = ["updated_at", "business_date", "grand_total_inr", "status"] as const;

export const invoiceListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    page_size: z.coerce.number().int().min(1).max(100).default(20),
    sort: z.enum(INVOICE_SORT_FIELDS).default("updated_at"),
    direction: z.enum(["asc", "desc"]).default("desc"),
    status: invoiceStatusSchema.optional(),
    customer_id: z.string().uuid().optional(),
    business_date_from: businessDateSchema.optional(),
    business_date_to: businessDateSchema.optional(),
    q: z.string().trim().max(120).optional(),
    has_due: z
      .enum(["1", "0", "true", "false"])
      .optional()
      .transform((value) => (value === undefined ? undefined : value === "1" || value === "true")),
  })
  .superRefine((value, ctx) => {
    refineBusinessDateBounds(
      {
        from: value.business_date_from,
        to: value.business_date_to,
      },
      ctx,
      {
        exact: "business_date_from",
        from: "business_date_from",
        to: "business_date_to",
      },
    );
  });

export type InvoiceListQuery = z.infer<typeof invoiceListQuerySchema>;

export const invoiceListSchema = paginatedResponseSchema(invoiceListItemSchema, INVOICE_SORT_FIELDS);
export type InvoiceList = z.infer<typeof invoiceListSchema>;

export const invoiceDraftCreateSchema = z
  .object({
    customer_id: z.string().uuid(),
    business_date: businessDateSchema.optional(),
    article_ids: z.array(z.string().uuid()).max(100).optional(),
  })
  .strict();

export type InvoiceDraftCreate = z.infer<typeof invoiceDraftCreateSchema>;

export const invoiceDraftPatchSchema = z
  .object({
    customer_id: z.string().uuid().optional(),
    add_article_ids: z.array(z.string().uuid()).max(50).optional(),
    remove_article_ids: z.array(z.string().uuid()).max(50).optional(),
    invoice_discount: discountSchema.nullable().optional(),
    line_pricing: z
      .array(
        z
          .object({
            article_id: z.string().uuid(),
            making_charge: makingChargeSchema,
            wastage: wastageSchema.nullable().optional(),
            stone_charges: z.array(stoneChargeSchema).max(20).optional(),
            line_discount: discountSchema.nullable().optional(),
          })
          .strict(),
      )
      .max(100)
      .optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.customer_id !== undefined ||
      (value.add_article_ids !== undefined && value.add_article_ids.length > 0) ||
      (value.remove_article_ids !== undefined && value.remove_article_ids.length > 0) ||
      value.invoice_discount !== undefined ||
      (value.line_pricing !== undefined && value.line_pricing.length > 0),
    {
      message:
        "Provide customer_id, add_article_ids, remove_article_ids, invoice_discount, or line_pricing.",
    },
  );

export type InvoiceDraftPatch = z.infer<typeof invoiceDraftPatchSchema>;

export const invoiceDraftQuickArticleSchema = articleCreateSchema
  .pick({
    category_id: true,
    metal: true,
    purity: true,
    gross_weight_grams: true,
    non_metal_weight_grams: true,
    net_metal_weight_grams: true,
    location_id: true,
    huid: true,
  })
  .strict();

export type InvoiceDraftQuickArticle = z.infer<typeof invoiceDraftQuickArticleSchema>;

export const invoiceFinalizePaymentSchema = z
  .object({
    method: paymentMethodSchema,
    amount_inr: positiveMoneyAmountSchema,
    reference: z.string().trim().max(120).nullable().optional(),
  })
  .strict();

export type InvoiceFinalizePayment = z.infer<typeof invoiceFinalizePaymentSchema>;

export const invoiceFinalizeSchema = z
  .object({
    quote_version: z.number().int().positive(),
    payments: z.array(invoiceFinalizePaymentSchema).max(10).optional(),
  })
  .strict();

export type InvoiceFinalize = z.infer<typeof invoiceFinalizeSchema>;
