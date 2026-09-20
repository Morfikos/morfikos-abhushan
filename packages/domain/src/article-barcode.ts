/**
 * Permanent article barcode payloads. Code 128 subset B, ASCII A–Z / 0–9 / hyphen.
 * The payload is deterministic from the article number and is never rotated on reprint.
 */
export const TAG_TEMPLATE_VERSION = "tag-v2";

/** Minimum scannable bar height on jewellery tags (mm). */
export const TAG_BARCODE_MIN_HEIGHT_MM = 8;

/** Thin header for logo or shop name + metal/purity (mm). */
export const TAG_HEADER_HEIGHT_MM = 3.5;

/** Footer for HRI + weight (mm). */
export const TAG_FOOTER_HEIGHT_MM = 3;

/** Card inset on each side (mm). */
export const TAG_INSET_MM = 1;

/** Max logo box when the tag is tall enough (mm). */
export const TAG_LOGO_MAX_MM = 4;

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
 * Barcode band height after reserving header and footer. Floored at TAG_BARCODE_MIN_HEIGHT_MM
 * when the stamp is tall enough; otherwise returns the leftover (may be below the floor).
 */
export function tagBarcodeHeightMm(tagHeightMm: number): number {
  const usable = tagUsableHeightMm(tagHeightMm);
  const leftover = usable - TAG_HEADER_HEIGHT_MM - TAG_FOOTER_HEIGHT_MM;
  if (leftover <= 0) {
    return 0;
  }
  return leftover;
}

/** Logo only when leftover barcode band would still meet the scannable floor. */
export function tagCanShowLogo(tagHeightMm: number): boolean {
  return tagBarcodeHeightMm(tagHeightMm) >= TAG_BARCODE_MIN_HEIGHT_MM;
}
