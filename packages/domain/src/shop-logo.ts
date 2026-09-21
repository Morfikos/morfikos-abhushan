export const SHOP_LOGO_MAX_BYTES = 1_048_576;
/** Packet photos share shop-assets; bucket limit is 5 MB (logo stays 1 MB). */
export const GIRVI_COLLATERAL_MAX_BYTES = 5_242_880;

export type ShopLogoContentType = "image/jpeg" | "image/png" | "image/webp";

export function detectShopLogoContentType(bytes: Uint8Array): ShopLogoContentType | null {
  if (bytes.length < 12) {
    return null;
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}
