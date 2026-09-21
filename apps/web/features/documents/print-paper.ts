import type { InvoicePaperSize } from "@aabhushan/contracts";

export function printPageCss(size: InvoicePaperSize): string {
  if (size === "A4") {
    return "@page { size: A4; margin: 12mm; }";
  }
  if (size === "A5") {
    return "@page { size: A5; margin: 10mm; }";
  }
  return "@page { size: 80mm auto; margin: 3mm; }";
}

export function printMaxWidthClass(size: InvoicePaperSize): string {
  if (size === "A4") {
    return "max-w-[210mm]";
  }
  if (size === "A5") {
    return "max-w-[148mm]";
  }
  return "max-w-[80mm]";
}

export function isThermalPrint(size: InvoicePaperSize): boolean {
  return size === "80mm";
}
