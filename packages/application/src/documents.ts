import { randomUUID } from "node:crypto";

import type {
  Document,
  DocumentList,
  DocumentStatus,
  GeneratedDocumentType,
  FileAccess,
  FileUploadConfirm,
  FileUploadGrantRequest,
  FileUploadGrantResponse,
  InvoicePrint,
  StoredObject,
  StoredObjectOwnerType,
  ReceiptPrint,
} from "@aabhushan/contracts";
import {
  INVOICE_PDF_TEMPLATE_VERSION,
  RECEIPT_PDF_TEMPLATE_VERSION,
  GIRVI_ACK_PDF_TEMPLATE_VERSION,
  CREDIT_NOTE_PDF_TEMPLATE_VERSION,
  REFUND_PDF_TEMPLATE_VERSION,
  currentTemplateVersionFor,
} from "@aabhushan/contracts";
import type { InvoicePaperSize } from "@aabhushan/contracts";

import { assertAnyPermission, assertPermission } from "./authorize";
import { configurationError, notFoundError, validationError } from "./http-error";
import type { ShopAssetStorage } from "./shop-settings";
import type { ResolvedStaffAccess } from "./staff-access";

export const DOCUMENT_SIGNED_URL_SECONDS = 900;
export const UPLOAD_GRANT_TTL_SECONDS = 900;
/** Unconfirmed upload rows older than this are cleaned by the worker. */
export const ABANDONED_UPLOAD_TTL_MS = 60 * 60 * 1000;
export const SHOP_ASSETS_BUCKET = "shop-assets";

function extensionForContentType(contentType: string): string {
  if (contentType === "application/pdf") {
    return "pdf";
  }
  if (contentType === "image/jpeg") {
    return "jpg";
  }
  if (contentType === "image/png") {
    return "png";
  }
  if (contentType === "image/webp") {
    return "webp";
  }
  return "bin";
}

export function buildStoredObjectKey(input: {
  organizationId: string;
  ownerType: string;
  ownerId: string;
  contentType: string;
}): string {
  return `${input.organizationId}/${input.ownerType}/${input.ownerId}/${randomUUID()}.${extensionForContentType(input.contentType)}`;
}

export function buildDocumentObjectKey(input: {
  organizationId: string;
  documentType: string;
  ownerId: string;
}): string {
  return `${input.organizationId}/documents/${input.documentType}/${input.ownerId}.pdf`;
}

export type DocumentsRepository = {
  insertStoredObject(input: {
    bucket: string;
    objectKey: string;
    checksumSha256: string;
    contentType: string;
    byteSize: number;
    ownerType: StoredObjectOwnerType | null;
    ownerId: string | null;
    createdByStaffUserId: string | null;
    uploadConfirmedAt: string | null;
  }): Promise<StoredObject>;
  /** Idempotent PDF object write for the deterministic document key. */
  upsertConfirmedStoredObject(input: {
    bucket: string;
    objectKey: string;
    checksumSha256: string;
    contentType: string;
    byteSize: number;
    ownerType: StoredObjectOwnerType;
    ownerId: string;
  }): Promise<StoredObject>;
  getStoredObject(id: string): Promise<StoredObject | null>;
  confirmStoredObject(input: {
    id: string;
    checksumSha256: string;
    byteSize: number;
  }): Promise<StoredObject | null>;
  listAbandonedUploads(olderThanIso: string): Promise<StoredObject[]>;
  deleteStoredObject(id: string): Promise<void>;
  insertArticleFileLink(input: {
    articleId: string;
    objectKey: string;
    checksumSha256: string;
    contentType: string;
    byteSize: number;
    originalFilename: string | null;
  }): Promise<void>;
  insertCustomerIdentityFileLink(input: {
    customerId: string;
    objectKey: string;
    checksumSha256: string;
    uploadedByStaffUserId: string | null;
    purpose: string;
  }): Promise<void>;
  insertGirviCollateralFileLink(input: {
    collateralItemId: string;
    objectKey: string;
    checksumSha256: string;
    uploadedByStaffUserId: string | null;
    purpose: string;
  }): Promise<void>;
  findStoredObjectByObjectKey(objectKey: string): Promise<StoredObject | null>;
  upsertDocumentPending(input: {
    documentType: GeneratedDocumentType;
    templateVersion: string;
    sourceEventKey: string;
    ownerType: "invoice" | "receipt" | "girvi";
    ownerId: string;
  }): Promise<Document>;
  getDocument(id: string): Promise<Document | null>;
  listDocumentsForOwner(ownerType: "invoice" | "receipt" | "girvi", ownerId: string): Promise<Document[]>;
  markDocumentReady(input: {
    id: string;
    storedObjectId: string;
  }): Promise<Document | null>;
  markDocumentFailed(input: {
    id: string;
    errorCode: string;
  }): Promise<Document | null>;
  findInvoicePrintSource(invoiceId: string): Promise<{
    invoice: {
      id: string;
      invoice_number: string | null;
      business_date: string;
      customer_display_name: string;
      status: string;
      metal_value_inr: string;
      making_charges_inr: string;
      wastage_inr: string;
      stone_charges_inr: string;
      discount_inr: string;
      tax_inr: string;
      round_off_inr: string;
      grand_total_inr: string;
      amount_paid_inr: string;
      amount_due_inr: string;
    };
    lines: Array<{ article_number: string; description: string; line_total_inr: string }>;
    shop: {
      legal_name: string;
      address_line: string | null;
      phone: string | null;
      invoice_footer: string | null;
    };
    invoice_paper_size: InvoicePaperSize;
  } | null>;
  findReceiptPrintSource(paymentId: string): Promise<{
    receiptNumber: string;
    issuedAt: string;
    customerDisplayName: string;
    paymentMethod: string;
    amountInr: string;
    invoiceNumbers: string[];
    shop: {
      legal_name: string;
      address_line: string | null;
      phone: string | null;
    };
    invoice_paper_size: InvoicePaperSize;
  } | null>;
  findGirviAckPrintSource(accountId: string): Promise<{
    accountNumber: string;
    customerDisplayName: string;
    releaseDateIso: string;
    recipientName: string;
    packetNumbers: string[];
    shop: {
      legal_name: string;
      address_line: string | null;
      phone: string | null;
    };
    invoice_paper_size: InvoicePaperSize;
  } | null>;
  findCreditNotePrintSource(returnId: string): Promise<{
    creditNoteNumber: string;
    invoiceNumber: string;
    invoiceId: string;
    customerDisplayName: string;
    issuedAtIso: string;
    amountInr: string;
    shop: {
      legal_name: string;
      address_line: string | null;
      phone: string | null;
    };
    invoice_paper_size: InvoicePaperSize;
  } | null>;
  findRefundPrintSource(paymentId: string): Promise<{
    refundNumber: string;
    customerDisplayName: string;
    issuedAtIso: string;
    paymentMethod: string;
    amountInr: string;
    reversesReceiptNumber: string | null;
    shop: {
      legal_name: string;
      address_line: string | null;
      phone: string | null;
    };
    invoice_paper_size: InvoicePaperSize;
  } | null>;
  claimPendingOutbox(limit: number): Promise<
    Array<{
      id: string;
      organizationId: string;
      eventKey: string;
      eventType: string;
      payload: Record<string, unknown>;
    }>
  >;
  markOutboxDispatched(id: string): Promise<void>;
};

function mapDocument(
  row: Document,
  downloadUrl: string | null = null,
): Document {
  return { ...row, download_url: downloadUrl };
}

function requireStorage(storage: ShopAssetStorage | null): ShopAssetStorage {
  if (!storage) {
    throw configurationError("SUPABASE_SECRET_KEY is required for private file storage.");
  }
  return storage;
}

function assertOwnerWrite(access: ResolvedStaffAccess, ownerType: StoredObjectOwnerType): void {
  switch (ownerType) {
    case "article":
      assertPermission(access, "inventory.write");
      return;
    case "customer":
      assertPermission(access, "customers.write");
      return;
    case "girvi":
    case "girvi_collateral":
      assertPermission(access, "girvi.write");
      return;
    case "invoice":
      assertPermission(access, "billing.write");
      return;
    case "receipt":
      assertPermission(access, "payments.write");
      return;
    default:
      throw validationError("Unsupported owner type for upload.");
  }
}

function assertOwnerRead(
  access: ResolvedStaffAccess,
  ownerType: StoredObjectOwnerType | null,
  contentType: string,
): void {
  if (ownerType === "customer" || contentType.startsWith("image/") && ownerType === null) {
    // identity files require identity_documents.read
  }
  switch (ownerType) {
    case "article":
      assertAnyPermission(access, ["inventory.read", "inventory.write"]);
      return;
    case "customer":
      assertPermission(access, "identity_documents.read");
      return;
    case "girvi":
    case "girvi_collateral":
      assertPermission(access, "girvi.write");
      return;
    case "invoice":
      assertPermission(access, "billing.write");
      return;
    case "receipt":
      assertAnyPermission(access, ["payments.write", "billing.write"]);
      return;
    default:
      throw notFoundError("The requested file was not found.");
  }
}

export async function createFileUploadGrant(
  repository: DocumentsRepository,
  storage: ShopAssetStorage | null,
  access: ResolvedStaffAccess,
  organizationId: string,
  input: FileUploadGrantRequest,
): Promise<FileUploadGrantResponse> {
  assertOwnerWrite(access, input.owner_type);
  const assetStorage = requireStorage(storage);
  if (input.content_type === "application/pdf") {
    throw validationError("Staff uploads accept images only. PDFs are generated by the worker.");
  }
  const objectKey = buildStoredObjectKey({
    organizationId,
    ownerType: input.owner_type,
    ownerId: input.owner_id,
    contentType: input.content_type,
  });
  const signed = await assetStorage.createSignedUploadUrl(objectKey, UPLOAD_GRANT_TTL_SECONDS);
  const stored = await repository.insertStoredObject({
    bucket: SHOP_ASSETS_BUCKET,
    objectKey,
    checksumSha256: "pending",
    contentType: input.content_type,
    byteSize: input.byte_size,
    ownerType: input.owner_type,
    ownerId: input.owner_id,
    createdByStaffUserId: access.staff_user_id,
    uploadConfirmedAt: null,
  });
  return {
    stored_object_id: stored.id,
    bucket: stored.bucket,
    object_key: stored.object_key,
    upload_url: signed.signedUrl,
    expires_in_seconds: signed.expiresInSeconds,
  };
}

export async function confirmFileUpload(
  repository: DocumentsRepository,
  access: ResolvedStaffAccess,
  storedObjectId: string,
  input: FileUploadConfirm,
): Promise<StoredObject> {
  const existing = await repository.getStoredObject(storedObjectId);
  if (!existing) {
    throw notFoundError("The requested file was not found.");
  }
  if (!existing.owner_type) {
    throw notFoundError("The requested file was not found.");
  }
  assertOwnerWrite(access, existing.owner_type);
  const confirmed = await repository.confirmStoredObject({
    id: storedObjectId,
    checksumSha256: input.checksum_sha256.toLowerCase(),
    byteSize: input.byte_size,
  });
  if (!confirmed || !confirmed.owner_type || !confirmed.owner_id) {
    throw notFoundError("The requested file was not found.");
  }
  if (confirmed.owner_type === "article") {
    await repository.insertArticleFileLink({
      articleId: confirmed.owner_id,
      objectKey: confirmed.object_key,
      checksumSha256: confirmed.checksum_sha256,
      contentType: confirmed.content_type,
      byteSize: confirmed.byte_size,
      originalFilename: input.original_filename ?? null,
    });
  }
  if (confirmed.owner_type === "customer") {
    await repository.insertCustomerIdentityFileLink({
      customerId: confirmed.owner_id,
      objectKey: confirmed.object_key,
      checksumSha256: confirmed.checksum_sha256,
      uploadedByStaffUserId: access.staff_user_id,
      purpose: input.purpose ?? "identity",
    });
  }
  if (confirmed.owner_type === "girvi_collateral") {
    await repository.insertGirviCollateralFileLink({
      collateralItemId: confirmed.owner_id,
      objectKey: confirmed.object_key,
      checksumSha256: confirmed.checksum_sha256,
      uploadedByStaffUserId: access.staff_user_id,
      purpose: input.purpose ?? "collateral_photo",
    });
  }
  return confirmed;
}

export async function getFileAccess(
  repository: DocumentsRepository,
  storage: ShopAssetStorage | null,
  access: ResolvedStaffAccess,
  storedObjectId: string,
): Promise<FileAccess> {
  const assetStorage = requireStorage(storage);
  const existing = await repository.getStoredObject(storedObjectId);
  if (!existing || !existing.upload_confirmed_at) {
    throw notFoundError("The requested file was not found.");
  }
  assertOwnerRead(access, existing.owner_type, existing.content_type);
  const url = await assetStorage.createSignedUrl(existing.object_key, DOCUMENT_SIGNED_URL_SECONDS);
  return {
    stored_object: existing,
    url,
    expires_in_seconds: DOCUMENT_SIGNED_URL_SECONDS,
  };
}

export async function getFileAccessByObjectKey(
  repository: DocumentsRepository,
  storage: ShopAssetStorage | null,
  access: ResolvedStaffAccess,
  objectKey: string,
): Promise<FileAccess> {
  const existing = await repository.findStoredObjectByObjectKey(objectKey);
  if (!existing || !existing.upload_confirmed_at) {
    throw notFoundError("The requested file was not found.");
  }
  return getFileAccess(repository, storage, access, existing.id);
}

export async function getDocument(
  repository: DocumentsRepository,
  storage: ShopAssetStorage | null,
  access: ResolvedStaffAccess,
  documentId: string,
): Promise<Document> {
  const doc = await repository.getDocument(documentId);
  if (!doc) {
    throw notFoundError("The requested document was not found.");
  }
  if (doc.owner_type === "invoice") {
    assertPermission(access, "billing.write");
  } else if (doc.owner_type === "receipt") {
    assertAnyPermission(access, ["payments.write", "billing.write"]);
  } else {
    assertPermission(access, "girvi.write");
  }
  let downloadUrl: string | null = null;
  if (doc.status === "ready" && doc.stored_object_id && storage) {
    const stored = await repository.getStoredObject(doc.stored_object_id);
    if (stored) {
      downloadUrl = await storage.createSignedUrl(stored.object_key, DOCUMENT_SIGNED_URL_SECONDS);
    }
  }
  return mapDocument(doc, downloadUrl);
}

export async function listDocumentsForOwner(
  repository: DocumentsRepository,
  storage: ShopAssetStorage | null,
  access: ResolvedStaffAccess,
  ownerType: "invoice" | "receipt" | "girvi",
  ownerId: string,
): Promise<DocumentList> {
  if (ownerType === "invoice") {
    assertPermission(access, "billing.write");
  } else if (ownerType === "receipt") {
    assertAnyPermission(access, ["payments.write", "billing.write"]);
  } else {
    assertPermission(access, "girvi.write");
  }
  const items = await repository.listDocumentsForOwner(ownerType, ownerId);
  const withUrls: Document[] = [];
  for (const item of items) {
    let downloadUrl: string | null = null;
    if (item.status === "ready" && item.stored_object_id && storage) {
      const stored = await repository.getStoredObject(item.stored_object_id);
      if (stored) {
        try {
          downloadUrl = await storage.createSignedUrl(stored.object_key, DOCUMENT_SIGNED_URL_SECONDS);
        } catch {
          downloadUrl = null;
        }
      }
    }
    withUrls.push(mapDocument(item, downloadUrl));
  }
  return { items: withUrls };
}

export async function retryDocument(
  repository: DocumentsRepository,
  access: ResolvedStaffAccess,
  documentId: string,
): Promise<Document> {
  const doc = await repository.getDocument(documentId);
  if (!doc) {
    throw notFoundError("The requested document was not found.");
  }
  if (doc.owner_type === "invoice") {
    assertPermission(access, "billing.write");
  } else if (doc.owner_type === "receipt") {
    assertPermission(access, "payments.write");
  } else {
    assertPermission(access, "girvi.write");
  }
  const currentVersion = currentTemplateVersionFor(doc.document_type);
  const outdatedReady = doc.status === "ready" && doc.template_version !== currentVersion;
  if (doc.status !== "failed" && !outdatedReady) {
    throw validationError("Only failed or outdated documents can be regenerated.");
  }
  return repository.upsertDocumentPending({
    documentType: doc.document_type,
    templateVersion: currentVersion,
    sourceEventKey: doc.source_event_key,
    ownerType: doc.owner_type,
    ownerId: doc.owner_id,
  });
}

export async function getInvoicePrintDto(
  repository: DocumentsRepository,
  storage: ShopAssetStorage | null,
  access: ResolvedStaffAccess,
  invoiceId: string,
): Promise<InvoicePrint> {
  assertPermission(access, "billing.write");
  const source = await repository.findInvoicePrintSource(invoiceId);
  if (!source || source.invoice.status !== "finalized" || !source.invoice.invoice_number) {
    throw notFoundError("The requested invoice was not found.");
  }
  const docs = await listDocumentsForOwner(repository, storage, access, "invoice", invoiceId);
  return {
    invoice_id: source.invoice.id,
    invoice_number: source.invoice.invoice_number,
    business_date: source.invoice.business_date,
    customer_display_name: source.invoice.customer_display_name,
    shop_legal_name: source.shop.legal_name,
    shop_address_line: source.shop.address_line,
    shop_phone: source.shop.phone,
    invoice_footer: source.shop.invoice_footer,
    invoice_paper_size: source.invoice_paper_size,
    lines: source.lines,
    metal_value_inr: source.invoice.metal_value_inr,
    making_charges_inr: source.invoice.making_charges_inr,
    wastage_inr: source.invoice.wastage_inr,
    stone_charges_inr: source.invoice.stone_charges_inr,
    discount_inr: source.invoice.discount_inr,
    tax_inr: source.invoice.tax_inr,
    round_off_inr: source.invoice.round_off_inr,
    grand_total_inr: source.invoice.grand_total_inr,
    amount_paid_inr: source.invoice.amount_paid_inr,
    amount_due_inr: source.invoice.amount_due_inr,
    document: docs.items[0] ?? null,
  };
}

export async function getReceiptPrintDto(
  repository: DocumentsRepository,
  storage: ShopAssetStorage | null,
  access: ResolvedStaffAccess,
  paymentId: string,
): Promise<ReceiptPrint> {
  assertAnyPermission(access, ["payments.write", "billing.write"]);
  const source = await repository.findReceiptPrintSource(paymentId);
  if (!source) {
    throw notFoundError("The requested receipt was not found.");
  }
  const docs = await listDocumentsForOwner(repository, storage, access, "receipt", paymentId);
  return {
    payment_id: paymentId,
    receipt_number: source.receiptNumber,
    issued_at: source.issuedAt,
    customer_display_name: source.customerDisplayName,
    payment_method: source.paymentMethod,
    amount_inr: source.amountInr,
    invoice_numbers: source.invoiceNumbers,
    shop_legal_name: source.shop.legal_name,
    shop_address_line: source.shop.address_line,
    shop_phone: source.shop.phone,
    invoice_paper_size: source.invoice_paper_size,
    document: docs.items[0] ?? null,
  };
}

export {
  INVOICE_PDF_TEMPLATE_VERSION,
  RECEIPT_PDF_TEMPLATE_VERSION,
  GIRVI_ACK_PDF_TEMPLATE_VERSION,
  CREDIT_NOTE_PDF_TEMPLATE_VERSION,
  REFUND_PDF_TEMPLATE_VERSION,
  currentTemplateVersionFor,
};
export type { DocumentStatus };
