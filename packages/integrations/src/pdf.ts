import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import PDFDocument from "pdfkit";
import { bilingualLabel, type DocumentLabelKey } from "@aabhushan/contracts";
import type { InvoicePaperSize } from "@aabhushan/contracts";

const FONT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../assets/fonts");
const FONT_REGULAR = join(FONT_DIR, "NotoSansDevanagari-Regular.ttf");
const FONT_BOLD = join(FONT_DIR, "NotoSansDevanagari-Bold.ttf");

const FONT_REGULAR_NAME = "NotoSansDevanagari";
const FONT_BOLD_NAME = "NotoSansDevanagari-Bold";

/** @deprecated Prefer pageSizeForInvoicePaper — kept for callers expecting A4 points. */
export const DOCUMENT_PAGE_SIZE: [number, number] = [595.28, 841.89];

const THERMAL_WIDTH_PT = 226.77; // 80mm
const THERMAL_HEIGHT_PT = 841.89; // long roll; content drives length

export function isThermalPaper(size: InvoicePaperSize): boolean {
  return size === "80mm";
}

export function pageSizeForInvoicePaper(size: InvoicePaperSize): "A4" | "A5" | [number, number] {
  if (size === "A4") {
    return "A4";
  }
  if (size === "A5") {
    return "A5";
  }
  return [THERMAL_WIDTH_PT, THERMAL_HEIGHT_PT];
}

export function marginForInvoicePaper(size: InvoicePaperSize): number {
  return isThermalPaper(size) ? 10 : size === "A5" ? 36 : 48;
}

export type InvoicePdfLine = {
  description: string;
  articleNumber: string;
  lineTotalInr: string;
};

type ShopFields = {
  shopLegalName: string;
  shopAddressLine: string | null;
  shopPhone: string | null;
  paperSize: InvoicePaperSize;
};

export type InvoicePdfInput = ShopFields & {
  invoiceFooter: string | null;
  invoiceNumber: string;
  businessDate: string;
  customerDisplayName: string;
  lines: InvoicePdfLine[];
  metalValueInr: string;
  makingChargesInr: string;
  wastageInr: string;
  stoneChargesInr: string;
  discountInr: string;
  taxInr: string;
  roundOffInr: string;
  grandTotalInr: string;
  amountPaidInr: string;
  amountDueInr: string;
};

export type ReceiptPdfInput = ShopFields & {
  receiptNumber: string;
  issuedAtIso: string;
  customerDisplayName: string;
  paymentMethod: string;
  amountInr: string;
  invoiceNumbers: string[];
};

export type GirviAckPdfInput = ShopFields & {
  accountNumber: string;
  customerDisplayName: string;
  releaseDateIso: string;
  recipientName: string;
  packetNumbers: string[];
};

export type CreditNotePdfInput = ShopFields & {
  creditNoteNumber: string;
  invoiceNumber: string;
  customerDisplayName: string;
  issuedAtIso: string;
  amountInr: string;
};

export type RefundPdfInput = ShopFields & {
  refundNumber: string;
  customerDisplayName: string;
  issuedAtIso: string;
  paymentMethod: string;
  amountInr: string;
  reversesReceiptNumber: string | null;
};

function formatInr(value: string): string {
  return `₹${value}`;
}

function collectPdf(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    doc.on("end", () => {
      resolve(Buffer.concat(chunks));
    });
    doc.on("error", reject);
  });
}

function createDocument(paperSize: InvoicePaperSize): PDFKit.PDFDocument {
  const doc = new PDFDocument({
    size: pageSizeForInvoicePaper(paperSize),
    margin: marginForInvoicePaper(paperSize),
  });
  doc.registerFont(FONT_REGULAR_NAME, FONT_REGULAR);
  doc.registerFont(FONT_BOLD_NAME, FONT_BOLD);
  return doc;
}

function fontRegular(doc: PDFKit.PDFDocument, size: number): void {
  doc.font(FONT_REGULAR_NAME).fontSize(size);
}

function fontBold(doc: PDFKit.PDFDocument, size: number): void {
  doc.font(FONT_BOLD_NAME).fontSize(size);
}

function label(key: DocumentLabelKey): string {
  return bilingualLabel(key);
}

function writeShopHeader(doc: PDFKit.PDFDocument, shop: ShopFields, thermal: boolean): void {
  const titleSize = thermal ? 12 : 16;
  const bodySize = thermal ? 8 : 10;
  doc.fillColor("#000000");
  fontBold(doc, titleSize);
  doc.text(shop.shopLegalName);
  fontRegular(doc, bodySize);
  if (shop.shopAddressLine) {
    doc.text(shop.shopAddressLine);
  }
  if (shop.shopPhone) {
    doc.text(shop.shopPhone);
  }
  doc.moveDown(thermal ? 0.5 : 1);
}

function writeLabeledValue(
  doc: PDFKit.PDFDocument,
  key: DocumentLabelKey,
  value: string,
  options?: { bold?: boolean; bodySize?: number },
): void {
  const bodySize = options?.bodySize ?? 10;
  if (options?.bold) {
    fontBold(doc, bodySize);
  } else {
    fontRegular(doc, bodySize);
  }
  doc.text(`${label(key)}: ${value}`);
}

function writeStackedRow(
  doc: PDFKit.PDFDocument,
  left: string,
  right: string,
  options?: { bold?: boolean; bodySize?: number },
): void {
  const bodySize = options?.bodySize ?? 10;
  if (options?.bold) {
    fontBold(doc, bodySize);
  } else {
    fontRegular(doc, bodySize);
  }
  doc.text(left);
  doc.text(right, { align: "right" });
}

/** Renders a bilingual invoice PDF from finalized snapshot fields only. */
export async function renderInvoicePdf(input: InvoicePdfInput): Promise<Buffer> {
  const thermal = isThermalPaper(input.paperSize);
  const doc = createDocument(input.paperSize);
  const done = collectPdf(doc);
  const bodySize = thermal ? 8 : 10;
  const titleSize = thermal ? 11 : 14;

  writeShopHeader(doc, input, thermal);
  fontBold(doc, titleSize);
  doc.text(label("tax_invoice"));
  writeLabeledValue(doc, "invoice", input.invoiceNumber, { bodySize });
  writeLabeledValue(doc, "business_date", input.businessDate, { bodySize });
  writeLabeledValue(doc, "customer", input.customerDisplayName, { bodySize });
  doc.moveDown(0.5);

  fontBold(doc, bodySize);
  doc.text(label("lines"));
  for (const line of input.lines) {
    if (thermal) {
      writeStackedRow(doc, `${line.articleNumber} — ${line.description}`, formatInr(line.lineTotalInr), {
        bodySize,
      });
    } else {
      fontRegular(doc, bodySize);
      doc.text(`${line.articleNumber} — ${line.description}`, { continued: true });
      doc.text(formatInr(line.lineTotalInr), { align: "right" });
    }
  }

  doc.moveDown(0.5);
  const totals: Array<[DocumentLabelKey, string]> = [
    ["metal", input.metalValueInr],
    ["making", input.makingChargesInr],
    ["wastage", input.wastageInr],
    ["stones", input.stoneChargesInr],
    ["discount", input.discountInr],
    ["tax", input.taxInr],
    ["round_off", input.roundOffInr],
    ["grand_total", input.grandTotalInr],
    ["paid", input.amountPaidInr],
    ["due", input.amountDueInr],
  ];
  for (const [key, value] of totals) {
    const bold = key === "grand_total";
    if (thermal) {
      writeStackedRow(doc, label(key), formatInr(value), { bold, bodySize });
    } else {
      if (bold) {
        fontBold(doc, bodySize);
      } else {
        fontRegular(doc, bodySize);
      }
      doc.text(label(key), { continued: true });
      doc.text(formatInr(value), { align: "right" });
    }
  }

  if (input.invoiceFooter) {
    doc.moveDown(0.5);
    fontRegular(doc, thermal ? 7 : 9);
    doc.text(input.invoiceFooter);
  }

  doc.end();
  return done;
}

/** Renders a bilingual receipt PDF from payment/receipt snapshot fields. */
export async function renderReceiptPdf(input: ReceiptPdfInput): Promise<Buffer> {
  const thermal = isThermalPaper(input.paperSize);
  const doc = createDocument(input.paperSize);
  const done = collectPdf(doc);
  const bodySize = thermal ? 8 : 10;
  const titleSize = thermal ? 11 : 14;

  writeShopHeader(doc, input, thermal);
  fontBold(doc, titleSize);
  doc.text(label("receipt"));
  writeLabeledValue(doc, "receipt", input.receiptNumber, { bodySize });
  writeLabeledValue(doc, "issued", input.issuedAtIso, { bodySize });
  writeLabeledValue(doc, "customer", input.customerDisplayName, { bodySize });
  writeLabeledValue(doc, "method", input.paymentMethod, { bodySize });
  writeLabeledValue(doc, "amount", formatInr(input.amountInr), { bold: true, bodySize });
  if (input.invoiceNumbers.length > 0) {
    writeLabeledValue(doc, "invoices", input.invoiceNumbers.join(", "), { bodySize });
  }

  doc.end();
  return done;
}

/** Acknowledgement of physical collateral handover after Girvi release. */
export async function renderGirviAckPdf(input: GirviAckPdfInput): Promise<Buffer> {
  const thermal = isThermalPaper(input.paperSize);
  const doc = createDocument(input.paperSize);
  const done = collectPdf(doc);
  const bodySize = thermal ? 8 : 10;
  const titleSize = thermal ? 11 : 14;

  writeShopHeader(doc, input, thermal);
  fontBold(doc, titleSize);
  doc.text(label("girvi_release_ack"));
  writeLabeledValue(doc, "account", input.accountNumber, { bodySize });
  writeLabeledValue(doc, "customer", input.customerDisplayName, { bodySize });
  writeLabeledValue(doc, "released", input.releaseDateIso, { bodySize });
  writeLabeledValue(doc, "recipient", input.recipientName, { bodySize });
  doc.moveDown(0.5);
  fontBold(doc, bodySize);
  doc.text(label("packets_verified"));
  fontRegular(doc, bodySize);
  for (const packet of input.packetNumbers) {
    doc.text(`• ${packet}`);
  }

  doc.end();
  return done;
}

export async function renderCreditNotePdf(input: CreditNotePdfInput): Promise<Buffer> {
  const thermal = isThermalPaper(input.paperSize);
  const doc = createDocument(input.paperSize);
  const done = collectPdf(doc);
  const bodySize = thermal ? 8 : 10;
  const titleSize = thermal ? 11 : 14;

  writeShopHeader(doc, input, thermal);
  fontBold(doc, titleSize);
  doc.text(label("credit_note"));
  writeLabeledValue(doc, "credit_note", input.creditNoteNumber, { bodySize });
  writeLabeledValue(doc, "invoice", input.invoiceNumber, { bodySize });
  writeLabeledValue(doc, "customer", input.customerDisplayName, { bodySize });
  writeLabeledValue(doc, "issued", input.issuedAtIso, { bodySize });
  writeLabeledValue(doc, "amount", formatInr(input.amountInr), { bold: true, bodySize });

  doc.end();
  return done;
}

export async function renderRefundPdf(input: RefundPdfInput): Promise<Buffer> {
  const thermal = isThermalPaper(input.paperSize);
  const doc = createDocument(input.paperSize);
  const done = collectPdf(doc);
  const bodySize = thermal ? 8 : 10;
  const titleSize = thermal ? 11 : 14;

  writeShopHeader(doc, input, thermal);
  fontBold(doc, titleSize);
  doc.text(label("refund"));
  writeLabeledValue(doc, "refund", input.refundNumber, { bodySize });
  writeLabeledValue(doc, "customer", input.customerDisplayName, { bodySize });
  writeLabeledValue(doc, "issued", input.issuedAtIso, { bodySize });
  writeLabeledValue(doc, "method", input.paymentMethod, { bodySize });
  writeLabeledValue(doc, "amount", formatInr(input.amountInr), { bold: true, bodySize });
  if (input.reversesReceiptNumber) {
    writeLabeledValue(doc, "reverses_receipt", input.reversesReceiptNumber, { bodySize });
  }

  doc.end();
  return done;
}
