/**
 * Permanent article barcode payloads. Code 128 subset B, ASCII A–Z / 0–9 / hyphen.
 * The payload is deterministic from the article number and is never rotated on reprint.
 */
export const TAG_TEMPLATE_VERSION = "tag-v4";

/** Minimum scannable bar height on jewellery tags (mm). */
export const TAG_BARCODE_MIN_HEIGHT_MM = 8;

/** Left rail for vertical shop legal name (mm). */
export const TAG_NAME_RAIL_WIDTH_MM = 5;

/** Gap between name rail and barcode column (mm). */
export const TAG_RAIL_GAP_MM = 0.75;

/** Footer for HRI + metal/purity + Gross/Net (mm). */
export const TAG_FOOTER_HEIGHT_MM = 5.75;

/** Card inset on each side (mm). */
export const TAG_INSET_MM = 1;

const CODE128_SAFE = /^[A-Z0-9-]{1,80}$/;

export function isCode128SafePayload(value: string): boolean {
  return CODE128_SAFE.test(value);
}

export function articleBarcodePayload(articleNumber: string): string {
  const payload = articleNumber.trim().toUpperCase();
  if (!isCode128SafePayload(payload)) {
    throw new Error("Article number is not a Code 128-safe barcode payload.");
  }
  return payload;
}

export function tagUsableHeightMm(tagHeightMm: number): number {
  return Math.max(0, tagHeightMm - TAG_INSET_MM * 2);
}

/**
 * Barcode band height after reserving the three-line footer. Floored leftover may be
 * below TAG_BARCODE_MIN_HEIGHT_MM on very short stamps; callers still render at the floor.
 */
export function tagBarcodeHeightMm(tagHeightMm: number): number {
  const leftover = tagUsableHeightMm(tagHeightMm) - TAG_FOOTER_HEIGHT_MM;
  if (leftover <= 0) {
    return 0;
  }
  return leftover;
}

/** Tags use vertical shop name only; logos stay on invoices/receipts. */
export function tagCanShowLogo(_tagHeightMm: number): boolean {
  return false;
}
