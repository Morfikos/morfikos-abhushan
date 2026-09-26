import { z } from "zod";

import { invoicePaperSizeSchema, metalSchema } from "./shop";

export const storedObjectOwnerTypeSchema = z.enum([
  "article",
  "customer",
  "girvi",
  "invoice",
  "receipt",
  "girvi_collateral",
  "export",
]);
export type StoredObjectOwnerType = z.infer<typeof storedObjectOwnerTypeSchema>;

export const generatedDocumentTypeSchema = z.enum([
  "invoice_pdf",
  "receipt_pdf",
  "girvi_ack_pdf",
  "credit_note_pdf",
  "refund_pdf",
]);
export type GeneratedDocumentType = z.infer<typeof generatedDocumentTypeSchema>;

export const documentStatusSchema = z.enum(["pending", "ready", "failed"]);
export type DocumentStatus = z.infer<typeof documentStatusSchema>;

export const INVOICE_PDF_TEMPLATE_VERSION = "invoice.pdf.v2";
export const RECEIPT_PDF_TEMPLATE_VERSION = "receipt.pdf.v3";
export const GIRVI_ACK_PDF_TEMPLATE_VERSION = "girvi_ack.pdf.v2";
export const CREDIT_NOTE_PDF_TEMPLATE_VERSION = "credit_note.pdf.v2";
export const REFUND_PDF_TEMPLATE_VERSION = "refund.pdf.v2";

/** Current template version for a generated document type (Regenerate compares against this). */
export function currentTemplateVersionFor(documentType: GeneratedDocumentType): string {
  switch (documentType) {
    case "invoice_pdf":
      return INVOICE_PDF_TEMPLATE_VERSION;
    case "receipt_pdf":
      return RECEIPT_PDF_TEMPLATE_VERSION;
    case "girvi_ack_pdf":
      return GIRVI_ACK_PDF_TEMPLATE_VERSION;
    case "credit_note_pdf":
      return CREDIT_NOTE_PDF_TEMPLATE_VERSION;
    case "refund_pdf":
      return REFUND_PDF_TEMPLATE_VERSION;
    default: {
      const _exhaustive: never = documentType;
      return _exhaustive;
    }
  }
}

const imageContentTypes = ["image/jpeg", "image/png", "image/webp"] as const;
const uploadContentTypeSchema = z.enum([...imageContentTypes, "application/pdf"]);

export const fileUploadGrantRequestSchema = z
  .object({
    owner_type: storedObjectOwnerTypeSchema,
    owner_id: z.string().uuid(),
    content_type: uploadContentTypeSchema,
    byte_size: z.number().int().positive().max(5_242_880),
    purpose: z.string().trim().min(1).max(80).optional(),
  })
  .strict();

export type FileUploadGrantRequest = z.infer<typeof fileUploadGrantRequestSchema>;

export const fileUploadGrantResponseSchema = z.object({
  stored_object_id: z.string().uuid(),
  bucket: z.string().min(1),
  object_key: z.string().min(1),
  upload_url: z.string().url(),
  expires_in_seconds: z.number().int().positive(),
});

export type FileUploadGrantResponse = z.infer<typeof fileUploadGrantResponseSchema>;

export const fileUploadConfirmSchema = z
  .object({
    checksum_sha256: z.string().regex(/^[a-f0-9]{64}$/i),
    byte_size: z.number().int().positive().max(5_242_880),
    purpose: z.string().trim().min(1).max(80).optional(),
    original_filename: z.string().trim().min(1).max(255).optional(),
  })
  .strict();

export type FileUploadConfirm = z.infer<typeof fileUploadConfirmSchema>;

export const storedObjectSchema = z.object({
  id: z.string().uuid(),
  bucket: z.string().min(1),
  object_key: z.string().min(1),
  checksum_sha256: z.string().min(1),
  content_type: z.string().min(1),
  byte_size: z.number().int().nonnegative(),
  owner_type: storedObjectOwnerTypeSchema.nullable(),
  owner_id: z.string().uuid().nullable(),
  visibility: z.literal("private"),
  upload_confirmed_at: z.string().datetime({ offset: true }).nullable(),
  created_at: z.string().datetime({ offset: true }),
});

export type StoredObject = z.infer<typeof storedObjectSchema>;

export const fileAccessSchema = z.object({
  stored_object: storedObjectSchema,
  url: z.string().url(),
  expires_in_seconds: z.number().int().positive(),
});

export type FileAccess = z.infer<typeof fileAccessSchema>;

export const documentSchema = z.object({
  id: z.string().uuid(),
  document_type: generatedDocumentTypeSchema,
  template_version: z.string().min(1),
  status: documentStatusSchema,
  stored_object_id: z.string().uuid().nullable(),
  source_event_key: z.string().min(1),
  owner_type: z.enum(["invoice", "receipt", "girvi"]),
  owner_id: z.string().uuid(),
  last_error_code: z.string().nullable(),
  download_url: z.string().url().nullable(),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});

export type Document = z.infer<typeof documentSchema>;

export const documentListSchema = z.object({
  items: z.array(documentSchema),
});

export type DocumentList = z.infer<typeof documentListSchema>;

export const fileAccessByKeyQuerySchema = z
  .object({
    object_key: z.string().trim().min(1).max(500),
  })
  .strict();

export type FileAccessByKeyQuery = z.infer<typeof fileAccessByKeyQuerySchema>;

export const ownerDocumentsQuerySchema = z.object({
  owner_type: z.enum(["invoice", "receipt", "girvi"]),
  owner_id: z.string().uuid(),
});

export type OwnerDocumentsQuery = z.infer<typeof ownerDocumentsQuerySchema>;

export const invoicePrintLineSchema = z.object({
  line_no: z.number().int().positive(),
  article_number: z.string(),
  barcode: z.string().nullable(),
  description: z.string(),
  metal: metalSchema,
  purity: z.string(),
  gross_weight_grams: z.string(),
  non_metal_weight_grams: z.string(),
  net_metal_weight_grams: z.string(),
  rate_per_gram: z.string().nullable(),
  metal_value_inr: z.string(),
  making_charge_inr: z.string(),
  wastage_inr: z.string(),
  stone_charges_inr: z.string(),
  line_discount_inr: z.string(),
  line_total_inr: z.string(),
});

export const invoicePrintCollectionSchema = z.object({
  receipt_number: z.string(),
  method: z.string(),
  amount_inr: z.string(),
  business_date: z.string(),
});

export const invoicePrintSchema = z.object({
  invoice_id: z.string().uuid(),
  invoice_number: z.string(),
  business_date: z.string(),
  customer_display_name: z.string(),
  customer_phone: z.string().nullable(),
  shop_legal_name: z.string(),
  shop_address_line: z.string().nullable(),
  shop_phone: z.string().nullable(),
  shop_logo_data_uri: z.string().nullable(),
  invoice_footer: z.string().nullable(),
  invoice_paper_size: invoicePaperSizeSchema,
  lines: z.array(invoicePrintLineSchema),
  collections: z.array(invoicePrintCollectionSchema),
  metal_value_inr: z.string(),
  making_charges_inr: z.string(),
  wastage_inr: z.string(),
  stone_charges_inr: z.string(),
  discount_inr: z.string(),
  tax_inr: z.string(),
  round_off_inr: z.string(),
  grand_total_inr: z.string(),
  amount_paid_inr: z.string(),
  amount_due_inr: z.string(),
  document: documentSchema.nullable(),
});

export type InvoicePrint = z.infer<typeof invoicePrintSchema>;

export const receiptPrintAllocationSchema = z.object({
  invoice_number: z.string(),
  business_date: z.string(),
  invoice_total_inr: z.string(),
  applied_inr: z.string(),
  amount_due_inr: z.string(),
});

export type ReceiptPrintAllocation = z.infer<typeof receiptPrintAllocationSchema>;

export const receiptPrintSchema = z.object({
  payment_id: z.string().uuid(),
  receipt_number: z.string(),
  issued_at: z.string().datetime({ offset: true }),
  customer_display_name: z.string(),
  customer_phone: z.string().nullable(),
  payment_method: z.string(),
  amount_inr: z.string(),
  reference: z.string().nullable(),
  received_business_date: z.string(),
  received_by_display_name: z.string(),
  allocations: z.array(receiptPrintAllocationSchema),
  shop_legal_name: z.string(),
  shop_address_line: z.string().nullable(),
  shop_phone: z.string().nullable(),
  shop_logo_data_uri: z.string().nullable(),
  invoice_footer: z.string().nullable(),
  invoice_paper_size: invoicePaperSizeSchema,
  document: documentSchema.nullable(),
});

export type ReceiptPrint = z.infer<typeof receiptPrintSchema>;
