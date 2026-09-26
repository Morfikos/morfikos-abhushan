import {
  ABANDONED_UPLOAD_TTL_MS,
  buildDocumentObjectKey,
  INVOICE_PDF_TEMPLATE_VERSION,
  RECEIPT_PDF_TEMPLATE_VERSION,
  GIRVI_ACK_PDF_TEMPLATE_VERSION,
  CREDIT_NOTE_PDF_TEMPLATE_VERSION,
  REFUND_PDF_TEMPLATE_VERSION,
  SHOP_ASSETS_BUCKET,
  processQueuedExport,
  type DocumentsRepository,
  type ShopAssetStorage,
} from "@aabhushan/application";
import {
  createDocumentsRepository,
  createPool,
  createReportsRepository,
  listOrganizationsNeedingDocumentWork,
  listOrganizationsNeedingExportWork,
  withOrganizationContext,
} from "@aabhushan/db";
import {
  createShopAssetStorage,
  renderCreditNotePdf,
  renderGirviAckPdf,
  renderInvoicePdf,
  renderReceiptPdf,
  renderRefundPdf,
} from "@aabhushan/integrations";
import type { ServerEnv } from "@aabhushan/config/server";
import type { Logger } from "pino";
import type { Pool } from "pg";

const POLL_MS = 5_000;

async function generateInvoicePdf(
  repo: DocumentsRepository,
  storage: ShopAssetStorage,
  organizationId: string,
  documentId: string,
  invoiceId: string,
): Promise<void> {
  const source = await repo.findInvoicePrintSource(invoiceId);
  if (!source || !source.invoice.invoice_number) {
    await repo.markDocumentFailed({ id: documentId, errorCode: "INVOICE_NOT_FOUND" });
    return;
  }
  const bytes = await renderInvoicePdf({
    shopLegalName: source.shop.legal_name,
    shopAddressLine: source.shop.address_line,
    shopPhone: source.shop.phone,
    paperSize: source.invoice_paper_size,
    invoiceFooter: source.shop.invoice_footer,
    invoiceNumber: source.invoice.invoice_number,
    businessDate: source.invoice.business_date,
    customerDisplayName: source.invoice.customer_display_name,
    lines: source.lines.map((line) => ({
      description: line.description,
      articleNumber: line.article_number,
      lineTotalInr: line.line_total_inr,
    })),
    metalValueInr: source.invoice.metal_value_inr,
    makingChargesInr: source.invoice.making_charges_inr,
    wastageInr: source.invoice.wastage_inr,
    stoneChargesInr: source.invoice.stone_charges_inr,
    discountInr: source.invoice.discount_inr,
    taxInr: source.invoice.tax_inr,
    roundOffInr: source.invoice.round_off_inr,
    grandTotalInr: source.invoice.grand_total_inr,
    amountPaidInr: source.invoice.amount_paid_inr,
    amountDueInr: source.invoice.amount_due_inr,
  });
  const objectKey = buildDocumentObjectKey({
    organizationId,
    documentType: "invoice_pdf",
    ownerId: invoiceId,
  });
  const uploaded = await storage.uploadPrivateObject({
    objectKey,
    bytes,
    contentType: "application/pdf",
    upsert: true,
  });
  const stored = await repo.upsertConfirmedStoredObject({
    bucket: SHOP_ASSETS_BUCKET,
    objectKey: uploaded.objectKey,
    checksumSha256: uploaded.checksumSha256,
    contentType: "application/pdf",
    byteSize: uploaded.byteSize,
    ownerType: "invoice",
    ownerId: invoiceId,
  });
  await repo.markDocumentReady({ id: documentId, storedObjectId: stored.id });
}

async function generateReceiptPdf(
  repo: DocumentsRepository,
  storage: ShopAssetStorage,
  organizationId: string,
  documentId: string,
  paymentId: string,
): Promise<void> {
  const source = await repo.findReceiptPrintSource(paymentId);
  if (!source) {
    await repo.markDocumentFailed({ id: documentId, errorCode: "RECEIPT_NOT_FOUND" });
    return;
  }
  const bytes = await renderReceiptPdf({
    shopLegalName: source.shop.legal_name,
    shopAddressLine: source.shop.address_line,
    shopPhone: source.shop.phone,
    paperSize: source.invoice_paper_size,
    receiptNumber: source.receiptNumber,
    issuedAtIso: source.issuedAt,
    customerDisplayName: source.customerDisplayName,
    customerPhone: source.customerPhone,
    paymentMethod: source.paymentMethod,
    amountInr: source.amountInr,
    reference: source.reference,
    receivedBusinessDate: source.receivedBusinessDate,
    receivedByDisplayName: source.receivedByDisplayName,
    invoiceFooter: source.shop.invoice_footer,
    allocations: source.allocations.map((row) => ({
      invoiceNumber: row.invoice_number,
      businessDate: row.business_date,
      invoiceTotalInr: row.invoice_total_inr,
      appliedInr: row.applied_inr,
      amountDueInr: row.amount_due_inr,
    })),
  });
  const objectKey = buildDocumentObjectKey({
    organizationId,
    documentType: "receipt_pdf",
    ownerId: paymentId,
  });
  const uploaded = await storage.uploadPrivateObject({
    objectKey,
    bytes,
    contentType: "application/pdf",
    upsert: true,
  });
  const stored = await repo.upsertConfirmedStoredObject({
    bucket: SHOP_ASSETS_BUCKET,
    objectKey: uploaded.objectKey,
    checksumSha256: uploaded.checksumSha256,
    contentType: "application/pdf",
    byteSize: uploaded.byteSize,
    ownerType: "receipt",
    ownerId: paymentId,
  });
  await repo.markDocumentReady({ id: documentId, storedObjectId: stored.id });
}

async function generateGirviAckPdf(
  repo: DocumentsRepository,
  storage: ShopAssetStorage,
  organizationId: string,
  documentId: string,
  accountId: string,
): Promise<void> {
  const source = await repo.findGirviAckPrintSource(accountId);
  if (!source) {
    await repo.markDocumentFailed({ id: documentId, errorCode: "GIRVI_ACK_NOT_FOUND" });
    return;
  }
  const bytes = await renderGirviAckPdf({
    shopLegalName: source.shop.legal_name,
    shopAddressLine: source.shop.address_line,
    shopPhone: source.shop.phone,
    paperSize: source.invoice_paper_size,
    accountNumber: source.accountNumber,
    customerDisplayName: source.customerDisplayName,
    releaseDateIso: source.releaseDateIso,
    recipientName: source.recipientName,
    packetNumbers: source.packetNumbers,
  });
  const objectKey = buildDocumentObjectKey({
    organizationId,
    documentType: "girvi_ack_pdf",
    ownerId: accountId,
  });
  const uploaded = await storage.uploadPrivateObject({
    objectKey,
    bytes,
    contentType: "application/pdf",
    upsert: true,
  });
  const stored = await repo.upsertConfirmedStoredObject({
    bucket: SHOP_ASSETS_BUCKET,
    objectKey: uploaded.objectKey,
    checksumSha256: uploaded.checksumSha256,
    contentType: "application/pdf",
    byteSize: uploaded.byteSize,
    ownerType: "girvi",
    ownerId: accountId,
  });
  await repo.markDocumentReady({ id: documentId, storedObjectId: stored.id });
}

async function generateCreditNotePdf(
  repo: DocumentsRepository,
  storage: ShopAssetStorage,
  organizationId: string,
  documentId: string,
  returnId: string,
): Promise<void> {
  const source = await repo.findCreditNotePrintSource(returnId);
  if (!source) {
    await repo.markDocumentFailed({ id: documentId, errorCode: "CREDIT_NOTE_NOT_FOUND" });
    return;
  }
  const bytes = await renderCreditNotePdf({
    shopLegalName: source.shop.legal_name,
    shopAddressLine: source.shop.address_line,
    shopPhone: source.shop.phone,
    paperSize: source.invoice_paper_size,
    creditNoteNumber: source.creditNoteNumber,
    invoiceNumber: source.invoiceNumber,
    customerDisplayName: source.customerDisplayName,
    issuedAtIso: source.issuedAtIso,
    amountInr: source.amountInr,
  });
  const objectKey = buildDocumentObjectKey({
    organizationId,
    documentType: "credit_note_pdf",
    ownerId: returnId,
  });
  const uploaded = await storage.uploadPrivateObject({
    objectKey,
    bytes,
    contentType: "application/pdf",
    upsert: true,
  });
  const stored = await repo.upsertConfirmedStoredObject({
    bucket: SHOP_ASSETS_BUCKET,
    objectKey: uploaded.objectKey,
    checksumSha256: uploaded.checksumSha256,
    contentType: "application/pdf",
    byteSize: uploaded.byteSize,
    ownerType: "invoice",
    ownerId: source.invoiceId,
  });
  await repo.markDocumentReady({ id: documentId, storedObjectId: stored.id });
}

async function generateRefundPdf(
  repo: DocumentsRepository,
  storage: ShopAssetStorage,
  organizationId: string,
  documentId: string,
  paymentId: string,
): Promise<void> {
  const source = await repo.findRefundPrintSource(paymentId);
  if (!source) {
    await repo.markDocumentFailed({ id: documentId, errorCode: "REFUND_NOT_FOUND" });
    return;
  }
  const bytes = await renderRefundPdf({
    shopLegalName: source.shop.legal_name,
    shopAddressLine: source.shop.address_line,
    shopPhone: source.shop.phone,
    paperSize: source.invoice_paper_size,
    refundNumber: source.refundNumber,
    customerDisplayName: source.customerDisplayName,
    issuedAtIso: source.issuedAtIso,
    paymentMethod: source.paymentMethod,
    amountInr: source.amountInr,
    reversesReceiptNumber: source.reversesReceiptNumber,
  });
  const objectKey = buildDocumentObjectKey({
    organizationId,
    documentType: "refund_pdf",
    ownerId: paymentId,
  });
  const uploaded = await storage.uploadPrivateObject({
    objectKey,
    bytes,
    contentType: "application/pdf",
    upsert: true,
  });
  const stored = await repo.upsertConfirmedStoredObject({
    bucket: SHOP_ASSETS_BUCKET,
    objectKey: uploaded.objectKey,
    checksumSha256: uploaded.checksumSha256,
    contentType: "application/pdf",
    byteSize: uploaded.byteSize,
    ownerType: "receipt",
    ownerId: paymentId,
  });
  await repo.markDocumentReady({ id: documentId, storedObjectId: stored.id });
}

async function processOrganization(
  pool: Pool,
  storage: ShopAssetStorage,
  organizationId: string,
  logger: Logger,
): Promise<void> {
  await withOrganizationContext(pool, { organizationId, role: "app_worker" }, async (client) => {
    const repo = createDocumentsRepository(client, organizationId);

    const events = await repo.claimPendingOutbox(20);
    for (const event of events) {
      try {
        if (event.eventType === "invoice.finalized") {
          const invoiceId = String(event.payload.invoice_id ?? "");
          if (!invoiceId) {
            await repo.markOutboxDispatched(event.id);
            continue;
          }
          const doc = await repo.upsertDocumentPending({
            documentType: "invoice_pdf",
            templateVersion: INVOICE_PDF_TEMPLATE_VERSION,
            sourceEventKey: event.eventKey,
            ownerType: "invoice",
            ownerId: invoiceId,
          });
          try {
            await generateInvoicePdf(repo, storage, organizationId, doc.id, invoiceId);
          } catch (error) {
            logger.error({ err: error, document_id: doc.id }, "invoice pdf generation failed");
            await repo.markDocumentFailed({ id: doc.id, errorCode: "PDF_GENERATION_FAILED" });
          }
          await repo.markOutboxDispatched(event.id);
        } else if (event.eventType === "receipt.requested") {
          const paymentId = String(event.payload.payment_id ?? "");
          if (!paymentId) {
            await repo.markOutboxDispatched(event.id);
            continue;
          }
          const doc = await repo.upsertDocumentPending({
            documentType: "receipt_pdf",
            templateVersion: RECEIPT_PDF_TEMPLATE_VERSION,
            sourceEventKey: event.eventKey,
            ownerType: "receipt",
            ownerId: paymentId,
          });
          try {
            await generateReceiptPdf(repo, storage, organizationId, doc.id, paymentId);
          } catch (error) {
            logger.error({ err: error, document_id: doc.id }, "receipt pdf generation failed");
            await repo.markDocumentFailed({ id: doc.id, errorCode: "PDF_GENERATION_FAILED" });
          }
          await repo.markOutboxDispatched(event.id);
        } else if (event.eventType === "girvi.released") {
          const accountId = String(event.payload.girvi_account_id ?? "");
          if (!accountId) {
            await repo.markOutboxDispatched(event.id);
            continue;
          }
          const doc = await repo.upsertDocumentPending({
            documentType: "girvi_ack_pdf",
            templateVersion: GIRVI_ACK_PDF_TEMPLATE_VERSION,
            sourceEventKey: event.eventKey,
            ownerType: "girvi",
            ownerId: accountId,
          });
          try {
            await generateGirviAckPdf(repo, storage, organizationId, doc.id, accountId);
          } catch (error) {
            logger.error({ err: error, document_id: doc.id }, "girvi ack pdf generation failed");
            await repo.markDocumentFailed({ id: doc.id, errorCode: "PDF_GENERATION_FAILED" });
          }
          await repo.markOutboxDispatched(event.id);
        } else if (event.eventType === "credit_note.requested") {
          const returnId = String(event.payload.return_id ?? "");
          const invoiceId = String(event.payload.invoice_id ?? "");
          if (!returnId || !invoiceId) {
            await repo.markOutboxDispatched(event.id);
            continue;
          }
          const doc = await repo.upsertDocumentPending({
            documentType: "credit_note_pdf",
            templateVersion: CREDIT_NOTE_PDF_TEMPLATE_VERSION,
            sourceEventKey: event.eventKey,
            ownerType: "invoice",
            ownerId: invoiceId,
          });
          try {
            await generateCreditNotePdf(repo, storage, organizationId, doc.id, returnId);
          } catch (error) {
            logger.error({ err: error, document_id: doc.id }, "credit note pdf generation failed");
            await repo.markDocumentFailed({ id: doc.id, errorCode: "PDF_GENERATION_FAILED" });
          }
          await repo.markOutboxDispatched(event.id);
        } else if (event.eventType === "refund.requested") {
          const paymentId = String(event.payload.payment_id ?? "");
          if (!paymentId) {
            await repo.markOutboxDispatched(event.id);
            continue;
          }
          const doc = await repo.upsertDocumentPending({
            documentType: "refund_pdf",
            templateVersion: REFUND_PDF_TEMPLATE_VERSION,
            sourceEventKey: event.eventKey,
            ownerType: "receipt",
            ownerId: paymentId,
          });
          try {
            await generateRefundPdf(repo, storage, organizationId, doc.id, paymentId);
          } catch (error) {
            logger.error({ err: error, document_id: doc.id }, "refund pdf generation failed");
            await repo.markDocumentFailed({ id: doc.id, errorCode: "PDF_GENERATION_FAILED" });
          }
          await repo.markOutboxDispatched(event.id);
        }
      } catch (error) {
        logger.error({ err: error, event_id: event.id }, "outbox document event failed");
        // Leave dispatched_at null for retry; financial record stays finalized.
      }
    }

    const pendingDocs = await client.query<{
      id: string;
      document_type: string;
      owner_id: string;
      source_event_key: string;
    }>(
      `
      SELECT id, document_type, owner_id, source_event_key
      FROM app.documents
      WHERE organization_id = $1 AND status = 'pending'
      ORDER BY created_at ASC
      LIMIT 20
      `,
      [organizationId],
    );
    for (const row of pendingDocs.rows) {
      try {
        if (row.document_type === "invoice_pdf") {
          await generateInvoicePdf(repo, storage, organizationId, row.id, row.owner_id);
        } else if (row.document_type === "receipt_pdf") {
          await generateReceiptPdf(repo, storage, organizationId, row.id, row.owner_id);
        } else if (row.document_type === "girvi_ack_pdf") {
          await generateGirviAckPdf(repo, storage, organizationId, row.id, row.owner_id);
        } else if (row.document_type === "credit_note_pdf") {
          const returnId = row.source_event_key.startsWith("credit_note.requested:")
            ? row.source_event_key.slice("credit_note.requested:".length)
            : "";
          if (returnId) {
            await generateCreditNotePdf(repo, storage, organizationId, row.id, returnId);
          } else {
            await repo.markDocumentFailed({ id: row.id, errorCode: "CREDIT_NOTE_SOURCE_MISSING" });
          }
        } else if (row.document_type === "refund_pdf") {
          await generateRefundPdf(repo, storage, organizationId, row.id, row.owner_id);
        }
      } catch (error) {
        logger.error({ err: error, document_id: row.id }, "pending document generation failed");
        await repo.markDocumentFailed({ id: row.id, errorCode: "PDF_GENERATION_FAILED" });
      }
    }

    const olderThan = new Date(Date.now() - ABANDONED_UPLOAD_TTL_MS).toISOString();
    const abandoned = await repo.listAbandonedUploads(olderThan);
    for (const item of abandoned) {
      try {
        await storage.removeObject(item.object_key);
      } catch {
        // Object may never have been uploaded.
      }
      await repo.deleteStoredObject(item.id);
    }
  });
}

async function processExportJobs(
  pool: Pool,
  storage: ShopAssetStorage,
  organizationId: string,
  logger: Logger,
): Promise<void> {
  await withOrganizationContext(pool, { organizationId, role: "app_worker" }, async (client) => {
    const repo = createReportsRepository(client, organizationId);
    const jobs = await repo.listPendingExportJobs(10);
    for (const job of jobs) {
      try {
        await processQueuedExport(repo, storage, organizationId, job.id);
      } catch (error) {
        logger.error({ err: error, export_job_id: job.id }, "export job failed");
      }
    }
  });
}

import { startNotificationJobs } from "./notifications-jobs";

export function startWorker(env: ServerEnv, logger: Logger): { stop: (signal: string) => void } {
  const pool = createPool(env.DATABASE_URL);
  const storage = env.SUPABASE_SECRET_KEY
    ? createShopAssetStorage(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY)
    : null;

  if (!storage) {
    logger.warn("worker started without SUPABASE_SECRET_KEY; document PDF jobs will be skipped");
  } else {
    logger.info("worker started; polling outbox for document PDF jobs");
  }

  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopNotifications: (() => Promise<void>) | null = null;

  void (async () => {
    try {
      const jobs = await startNotificationJobs(env.DATABASE_URL, pool, logger);
      stopNotifications = jobs.stop;
    } catch (error) {
      logger.error(
        { err: error },
        "pg-boss notification jobs failed to start; reminders will not run until the worker is healthy",
      );
    }
  })();

  const tick = async () => {
    if (stopped) {
      return;
    }
    try {
      if (storage) {
        const client = await pool.connect();
        let orgIds: string[] = [];
        let exportOrgIds: string[] = [];
        try {
          orgIds = await listOrganizationsNeedingDocumentWork(client);
          exportOrgIds = await listOrganizationsNeedingExportWork(client);
        } finally {
          client.release();
        }
        for (const organizationId of orgIds) {
          await processOrganization(pool, storage, organizationId, logger);
        }
        for (const organizationId of exportOrgIds) {
          await processExportJobs(pool, storage, organizationId, logger);
        }
      }
    } catch (error) {
      logger.error({ err: error }, "worker tick failed");
    } finally {
      if (!stopped) {
        timer = setTimeout(() => {
          void tick();
        }, POLL_MS);
      }
    }
  };

  void tick();

  const stop = (signal: string) => {
    stopped = true;
    if (timer) {
      clearTimeout(timer);
    }
    logger.info({ signal }, "worker shutting down");
    void (async () => {
      if (stopNotifications) {
        await stopNotifications().catch(() => undefined);
      }
      await pool.end();
    })();
  };

  return { stop };
}
