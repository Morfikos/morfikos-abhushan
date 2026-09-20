import bwipjs from "bwip-js/node";

/**
 * Server-only Code 128 SVG. Callers must not treat this as a public image URL
 * or as proof that a physical tag printed.
 *
 * Bar height is driven by the remaining millimetres on the jewellery tag after
 * header and footer. Quiet zone uses horizontal padding modules, not overflow clipping.
 */
export function renderCode128Svg(payload: string, options?: { heightMm?: number }): string {
  const heightMm = Math.max(8, options?.heightMm ?? 10);
  return bwipjs.toSVG({
    bcid: "code128",
    text: payload,
    scale: 2,
    height: heightMm,
    includetext: false,
    paddingwidth: 12,
    paddingheight: 1,
    backgroundcolor: "ffffff",
    barcolor: "000000",
  });
}
