import { z } from "zod";

import { refineBusinessDateBounds } from "./business-date-range";
import { paymentMethodSchema } from "./invoices";
import { paginatedResponseSchema } from "./pagination";
import { businessDateSchema } from "./shop";

const moneyAmountSchema = z
  .string()
  .regex(/^-?\d+(\.\d{1,2})?$/, "Use a money decimal string with at most 2 fractional digits.");

const positiveMoneyAmountSchema = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, "Use a positive money decimal string with at most 2 fractional digits.")
  .refine((value) => !/^0+(\.0+)?$/.test(value), "Amount must be greater than zero.");

export const paymentStatusSchema = z.enum(["posted", "reversed"]);
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

export const paymentKindSchema = z.enum(["collection", "refund", "reversal"]);
export type PaymentKind = z.infer<typeof paymentKindSchema>;

export const paymentAllocationSchema = z.object({
  id: z.string().uuid(),
  invoice_id: z.string().uuid(),
  invoice_number: z.string().nullable(),
  business_date: businessDateSchema,
  amount_inr: moneyAmountSchema,
});

export type PaymentAllocation = z.infer<typeof paymentAllocationSchema>;

export const paymentSchema = z.object({
  id: z.string().uuid(),
  customer_id: z.string().uuid(),
  customer_display_name: z.string().min(1),
  method: paymentMethodSchema,
  amount_inr: moneyAmountSchema,
  reference: z.string().nullable(),
  status: paymentStatusSchema,
  kind: paymentKindSchema,
  received_business_date: businessDateSchema,
  received_at: z.string().datetime({ offset: true }),
  received_by_staff_user_id: z.string().uuid(),
  receipt_number: z.string().nullable(),
  receipt_issued_at: z.string().datetime({ offset: true }).nullable(),
  reverses_payment_id: z.string().uuid().nullable(),
  reversed_by_payment_id: z.string().uuid().nullable(),
  allocations: z.array(paymentAllocationSchema),
});

export type Payment = z.infer<typeof paymentSchema>;

/** One tender in a split payment. Each tender becomes one payment row and one receipt. */
export const paymentTenderSchema = z
  .object({
    method: paymentMethodSchema,
    amount_inr: positiveMoneyAmountSchema,
    reference: z.string().trim().max(120).nullable().optional(),
  })
  .strict();

export type PaymentTender = z.infer<typeof paymentTenderSchema>;

export const paymentAllocationInputSchema = z
  .object({
    invoice_id: z.string().uuid(),
    amount_inr: positiveMoneyAmountSchema,
  })
  .strict();

export type PaymentAllocationInput = z.infer<typeof paymentAllocationInputSchema>;

export const paymentCreateSchema = z
  .object({
    customer_id: z.string().uuid(),
    received_business_date: businessDateSchema.optional(),
    tenders: z.array(paymentTenderSchema).min(1).max(10),
    allocations: z.array(paymentAllocationInputSchema).min(1).max(50),
  })
  .strict()
  .refine(
    (value) => new Set(value.allocations.map((item) => item.invoice_id)).size === value.allocations.length,
    { message: "List each invoice once per payment post.", path: ["allocations"] },
  );

export type PaymentCreate = z.infer<typeof paymentCreateSchema>;

/** A split tender posts several payments together; each carries its own receipt. */
export const paymentCreateResultSchema = z.object({
  payments: z.array(paymentSchema).min(1),
  total_inr: moneyAmountSchema,
});

export type PaymentCreateResult = z.infer<typeof paymentCreateResultSchema>;

export const PAYMENT_SORT_FIELDS = ["received_at", "received_business_date", "amount_inr"] as const;

export const paymentListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    page_size: z.coerce.number().int().min(1).max(100).default(20),
    sort: z.enum(PAYMENT_SORT_FIELDS).default("received_at"),
    direction: z.enum(["asc", "desc"]).default("desc"),
    customer_id: z.string().uuid().optional(),
    invoice_id: z.string().uuid().optional(),
    method: paymentMethodSchema.optional(),
    received_business_date: businessDateSchema.optional(),
    received_business_date_from: businessDateSchema.optional(),
    received_business_date_to: businessDateSchema.optional(),
    q: z.string().trim().max(120).optional(),
  })
  .superRefine((value, ctx) => {
    refineBusinessDateBounds(
      {
        exact: value.received_business_date,
        from: value.received_business_date_from,
        to: value.received_business_date_to,
      },
      ctx,
      {
        exact: "received_business_date",
        from: "received_business_date_from",
        to: "received_business_date_to",
      },
    );
  });

export type PaymentListQuery = z.infer<typeof paymentListQuerySchema>;

export const paymentListSchema = paginatedResponseSchema(paymentSchema, PAYMENT_SORT_FIELDS);
export type PaymentList = z.infer<typeof paymentListSchema>;

export const invoicePaymentsSchema = z.object({
  invoice_id: z.string().uuid(),
  invoice_number: z.string().nullable(),
  grand_total_inr: moneyAmountSchema,
  amount_paid_inr: moneyAmountSchema,
  amount_due_inr: moneyAmountSchema,
  allocated_inr: moneyAmountSchema,
  items: z.array(paymentSchema),
});

export type InvoicePayments = z.infer<typeof invoicePaymentsSchema>;

export const outstandingInvoiceSchema = z.object({
  invoice_id: z.string().uuid(),
  invoice_number: z.string().nullable(),
  business_date: businessDateSchema,
  grand_total_inr: moneyAmountSchema,
  amount_paid_inr: moneyAmountSchema,
  amount_due_inr: moneyAmountSchema,
});

export type OutstandingInvoice = z.infer<typeof outstandingInvoiceSchema>;

/**
 * Sales dues only. Girvi principal and interest never appear here: a customer
 * with a Girvi loan and no unpaid invoice reads `sales_due_inr` of `0.00`.
 */
export const customerSalesStatementSchema = z.object({
  customer_id: z.string().uuid(),
  display_name: z.string().min(1),
  sales_due_inr: moneyAmountSchema,
  finalized_invoice_count: z.number().int().nonnegative(),
  outstanding_invoices: z.array(outstandingInvoiceSchema),
  payments: z.array(paymentSchema),
  credit_notes: z.array(
    z.object({
      id: z.string().uuid(),
      credit_note_number: z.string().min(1),
      invoice_id: z.string().uuid(),
      invoice_number: z.string().nullable(),
      amount_inr: moneyAmountSchema,
      issued_at: z.string().datetime({ offset: true }),
    }),
  ),
});

export type CustomerSalesStatement = z.infer<typeof customerSalesStatementSchema>;

/**
 * Collections period query. Omit all date params for all-time totals.
 * Prefer `business_date` for a single day, or from/to for an inclusive range.
 */
export const dailyCollectionsQuerySchema = z
  .object({
    business_date: businessDateSchema.optional(),
    business_date_from: businessDateSchema.optional(),
    business_date_to: businessDateSchema.optional(),
  })
  .superRefine((value, ctx) => {
    refineBusinessDateBounds(
      {
        exact: value.business_date,
        from: value.business_date_from,
        to: value.business_date_to,
      },
      ctx,
      {
        exact: "business_date",
        from: "business_date_from",
        to: "business_date_to",
      },
    );
  });

export type DailyCollectionsQuery = z.infer<typeof dailyCollectionsQuerySchema>;

export const dailyCollectionMethodSchema = z.object({
  method: paymentMethodSchema,
  amount_inr: moneyAmountSchema,
  payment_count: z.number().int().nonnegative(),
});

/**
 * Collections received on a business date. These are receipts against sales,
 * not sales totals, and they exclude Girvi receipts.
 */
export const dailyCollectionsSchema = z.object({
  business_date: businessDateSchema,
  methods: z.array(dailyCollectionMethodSchema),
  total_inr: moneyAmountSchema,
  payment_count: z.number().int().nonnegative(),
});

export type DailyCollections = z.infer<typeof dailyCollectionsSchema>;
