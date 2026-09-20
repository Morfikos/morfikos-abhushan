/**
 * Server-only provider adapters (WhatsApp, storage, PDF, barcodes).
 * Do not import this package from the Next.js frontend.
 */
export const integrationsPackage = "integrations" as const;

export { renderCode128Svg } from "./barcode";
export { SHOP_ASSETS_BUCKET, SHOP_LOGO_SIGNED_URL_SECONDS, createShopAssetStorage } from "./storage";
