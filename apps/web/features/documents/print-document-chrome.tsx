"use client";

import type { InvoicePaperSize, PrintLabelLanguage } from "@aabhushan/contracts";
import type { ReactNode } from "react";

import { Button } from "@/components/base/buttons/button";
import {
  PrintPreviewChrome,
  PrintPreviewPill,
} from "@/features/documents/print-preview-chrome";
import { printMaxWidthClass } from "@/features/documents/print-paper";
import { cx } from "@/utils/cx";

import { formatLabel, languageLabel, PRINT_FORMATS, PRINT_LANGUAGES } from "./print-prefs";

type PrintDocumentChromeProps = {
  title: string;
  /** Mono document id shown in the metadata row (invoice / receipt number). */
  documentId?: string;
  /** Optional customer (or other) name as a metadata pill. */
  documentSubject?: string;
  backHref: string;
  backLabel?: string;
  format: InvoicePaperSize;
  onFormatChange: (format: InvoicePaperSize) => void;
  language: PrintLabelLanguage;
  onLanguageChange: (language: PrintLabelLanguage) => void;
  children: ReactNode;
  className?: string;
};

function formatCaption(format: InvoicePaperSize): string {
  if (format === "80mm") {
    return "Thermal · counter receipt printer, 80 mm";
  }
  if (format === "A5") {
    return "A5 · half sheet, compact bill";
  }
  return "A4 · full tax invoice with item table";
}

export function PrintDocumentChrome({
  title,
  documentId,
  documentSubject,
  backHref,
  backLabel = "Back",
  format,
  onFormatChange,
  language,
  onLanguageChange,
  children,
  className,
}: PrintDocumentChromeProps) {
  return (
    <PrintPreviewChrome
      className={className}
      title={title}
      metadata={
        <>
          {documentId ? <span className="font-mono font-semibold">{documentId}</span> : null}
          {documentSubject ? <PrintPreviewPill>{documentSubject}</PrintPreviewPill> : null}
        </>
      }
      helpers={
        <>
          <p className="text-md text-tertiary">
            {formatCaption(format)}. Remembered on this device.
          </p>
          <p className="text-sm text-tertiary">
            In the print dialog, turn off “Headers and footers” so date, title, and URL are not printed.
          </p>
        </>
      }
      primaryAction={
        <Button
          color="primary"
          size="lg"
          onPress={() => {
            window.print();
          }}
        >
          Print
        </Button>
      }
      secondaryAction={
        <Button color="secondary" size="lg" href={backHref}>
          {backLabel}
        </Button>
      }
      controls={
        <div className="flex flex-wrap items-center gap-3">
          <div
            className="flex overflow-hidden rounded-lg ring-1 ring-secondary"
            role="group"
            aria-label="Print format"
          >
            {PRINT_FORMATS.map((option) => (
              <button
                key={option}
                type="button"
                className={cx(
                  "h-11 px-3.5 text-sm font-semibold transition",
                  format === option
                    ? "bg-brand-solid text-white"
                    : "bg-primary text-secondary hover:bg-primary_hover",
                )}
                onClick={() => onFormatChange(option)}
              >
                {formatLabel(option)}
              </button>
            ))}
          </div>

          <div
            className="flex overflow-hidden rounded-lg ring-1 ring-secondary"
            role="group"
            aria-label="Print language"
          >
            {PRINT_LANGUAGES.map((option) => (
              <button
                key={option}
                type="button"
                className={cx(
                  "h-11 px-3.5 text-sm font-semibold transition",
                  language === option
                    ? "bg-brand-solid text-white"
                    : "bg-primary text-secondary hover:bg-primary_hover",
                )}
                onClick={() => onLanguageChange(option)}
              >
                {languageLabel(option)}
              </button>
            ))}
          </div>
        </div>
      }
    >
      <div className={cx("mx-auto w-full print:max-w-none", printMaxWidthClass(format))}>
        <div className="w-full rounded-lg border border-neutral-200 bg-white shadow-sm print:rounded-none print:border-0 print:shadow-none">
          {children}
        </div>
        <p className="mt-3 text-center text-xs text-tertiary print:hidden">
          {formatLabel(format)} · Print uses this size. Does not change Settings.
        </p>
      </div>
    </PrintPreviewChrome>
  );
}
