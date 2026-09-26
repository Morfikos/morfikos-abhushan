/**
 * Server-only provider adapters (WhatsApp, storage, PDF, barcodes).
 * Do not import this package from the Next.js frontend.
 */
export const integrationsPackage = "integrations" as const;

export { renderCode128Svg } from "./barcode";
export {
  DOCUMENT_PAGE_SIZE,
  isThermalPaper,
  marginForInvoicePaper,
  pageSizeForInvoicePaper,
  renderInvoicePdf,
  renderReceiptPdf,
  renderGirviAckPdf,
  renderCreditNotePdf,
  renderRefundPdf,
} from "./pdf";
export type {
  InvoicePdfInput,
  InvoicePdfLine,
  ReceiptPdfInput,
  ReceiptPdfAllocation,
  GirviAckPdfInput,
  CreditNotePdfInput,
  RefundPdfInput,
} from "./pdf";
export {
  SHOP_ASSETS_BUCKET,
  SHOP_LOGO_SIGNED_URL_SECONDS,
  GIRVI_COLLATERAL_SIGNED_URL_SECONDS,
  STORED_OBJECT_SIGNED_URL_SECONDS,
  SIGNED_UPLOAD_URL_SECONDS,
  createShopAssetStorage,
  girviCollateralObjectKey,
  documentObjectKey,
  storedObjectKey,
} from "./storage";
export {
  WhatsAppNotConfiguredError,
  createWhatsAppCloudAdapter,
  parseWhatsAppCloudConfig,
} from "./whatsapp";
export type {
  WhatsAppCloudAdapter,
  WhatsAppCloudConfig,
  WhatsAppSendInput,
  WhatsAppSendResult,
  WhatsAppWebhookStatus,
} from "./whatsapp";
