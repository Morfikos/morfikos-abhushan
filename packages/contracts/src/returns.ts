import { z } from "zod";

import { paymentSchema } from "./payments";
import { businessDateSchema } from "./shop";

const moneyAmountSchema = z
  .string()
  .regex(/^-?\d+(\.\d{1,2})?$/, "Use a money decimal string with at most 2 fractional digits.");

const positiveMoneyAmountSchema = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, "Use a positive money decimal string with at most 2 fractional digits.")
  .refine((value) => !/^0+(\.0+)?$/.test(value), "Amount must be greater than zero.");

export const invoiceReturnStatusSchema = z.enum(["accepted", "rejected"]);
export type InvoiceReturnStatus = z.infer<typeof invoiceReturnStatusSchema>;

export const invoiceReturnCreateSchema = z
  .object({
    invoice_line_id: z.string().uuid(),
    article_id: z.string().uuid(),
    reason: z.string().trim().min(1).max(500),
    customer_acknowledged: z.literal(true),
  })
  .strict();

export type InvoiceReturnCreate = z.infer<typeof invoiceReturnCreateSchema>;

export const invoiceReturnSchema = z.object({
  id: z.string().uuid(),
  invoice_id: z.string().uuid(),
  invoice_number: z.string().nullable(),
  invoice_line_id: z.string().uuid(),
  article_id: z.string().uuid(),
  article_number: z.string().min(1),
  article_description: z.string().min(1),
  status: invoiceReturnStatusSchema,
  reason: z.string().min(1),
  accepted_by_staff_user_id: z.string().uuid(),
  created_at: z.string().datetime({ offset: true }),
});

export type InvoiceReturn = z.infer<typeof invoiceReturnSchema>;

export const creditNoteSchema = z.object({
  id: z.string().uuid(),
  credit_note_number: z.string().min(1),
  invoice_id: z.string().uuid(),
  invoice_number: z.string().nullable(),
  return_id: z.string().uuid().nullable(),
  amount_inr: moneyAmountSchema,
  issued_at: z.string().datetime({ offset: true }),
});

export type CreditNote = z.infer<typeof creditNoteSchema>;

export const invoiceReturnAcceptResultSchema = z.object({
  return: invoiceReturnSchema,
  credit_note: creditNoteSchema,
  article_status: z.literal("return_inspection"),
  amount_due_inr: moneyAmountSchema,
  amount_paid_inr: moneyAmountSchema,
});

export type InvoiceReturnAcceptResult = z.infer<typeof invoiceReturnAcceptResultSchema>;

export const paymentRefundCreateSchema = z
  .object({
    amount_inr: positiveMoneyAmountSchema.optional(),
    reason: z.string().trim().min(1).max(500),
    method: z.enum(["cash", "upi", "card", "bank"]).optional(),
  })
  .strict();

export type PaymentRefundCreate = z.infer<typeof paymentRefundCreateSchema>;

export const paymentReversalCreateSchema = z
  .object({
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

export type PaymentReversalCreate = z.infer<typeof paymentReversalCreateSchema>;

export const invoiceCorrectionsSchema = z.object({
  invoice_id: z.string().uuid(),
  invoice_number: z.string().nullable(),
  customer_id: z.string().uuid(),
  grand_total_inr: moneyAmountSchema,
  credited_inr: moneyAmountSchema,
  net_collected_inr: moneyAmountSchema,
  amount_paid_inr: moneyAmountSchema,
  amount_due_inr: moneyAmountSchema,
  returns: z.array(invoiceReturnSchema),
  credit_notes: z.array(creditNoteSchema),
  payments: z.array(paymentSchema),
});

export type InvoiceCorrections = z.infer<typeof invoiceCorrectionsSchema>;

export const statementCorrectionLineKindSchema = z.enum(["collection", "credit", "refund", "reversal"]);
export type StatementCorrectionLineKind = z.infer<typeof statementCorrectionLineKindSchema>;

export const statementCorrectionLineSchema = z.object({
  kind: statementCorrectionLineKindSchema,
  id: z.string().uuid(),
  label: z.string().min(1),
  business_date: businessDateSchema.nullable(),
  occurred_at: z.string().datetime({ offset: true }),
  amount_inr: moneyAmountSchema,
  invoice_number: z.string().nullable(),
});

export type StatementCorrectionLine = z.infer<typeof statementCorrectionLineSchema>;
