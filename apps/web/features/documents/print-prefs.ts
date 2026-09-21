import type { InvoicePaperSize } from "@aabhushan/contracts";
import type { PrintLabelLanguage } from "@aabhushan/contracts";

export const PRINT_FORMAT_STORAGE_KEY = "aabhushan.print.format";
export const PRINT_LANG_STORAGE_KEY = "aabhushan.print.lang";

export const PRINT_FORMATS: InvoicePaperSize[] = ["80mm", "A5", "A4"];
export const PRINT_LANGUAGES: PrintLabelLanguage[] = ["en", "hi", "both"];

export function readPrintFormat(): InvoicePaperSize {
  if (typeof window === "undefined") {
    return "80mm";
  }
  const raw = window.localStorage.getItem(PRINT_FORMAT_STORAGE_KEY);
  if (raw === "A4" || raw === "A5" || raw === "80mm") {
    return raw;
  }
  return "80mm";
}

export function writePrintFormat(format: InvoicePaperSize): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(PRINT_FORMAT_STORAGE_KEY, format);
}

export function readPrintLanguage(): PrintLabelLanguage {
  if (typeof window === "undefined") {
    return "en";
  }
  const raw = window.localStorage.getItem(PRINT_LANG_STORAGE_KEY);
  if (raw === "en" || raw === "hi" || raw === "both") {
    return raw;
  }
  return "en";
}

export function writePrintLanguage(lang: PrintLabelLanguage): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(PRINT_LANG_STORAGE_KEY, lang);
}

export function formatLabel(format: InvoicePaperSize): string {
  if (format === "80mm") {
    return "Thermal";
  }
  return format;
}

export function languageLabel(lang: PrintLabelLanguage): string {
  if (lang === "en") {
    return "EN";
  }
  if (lang === "hi") {
    return "HI";
  }
  return "Both";
}
