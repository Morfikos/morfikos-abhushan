"use client";

import type { InvoicePaperSize, PrintLabelLanguage } from "@aabhushan/contracts";
import type { ReactNode } from "react";

import { Button } from "@/components/base/buttons/button";
import { PrintPreviewChrome, PrintPreviewPill } from "@/features/documents/print-preview-chrome";
import { printMaxWidthClass } from "@/features/documents/print-paper";
import { cx } from "@/utils/cx";

import { formatLabel, languageLabel, PRINT_FORMATS, PRINT_LANGUAGES } from "./print-prefs";

type PrintDocumentChromeProps = {
  title: string;
  documentId?: string;
  backHref: string;
  backLabel?: string;
  format: InvoicePaperSize;
  onFormatChange: (format: InvoicePaperSize) => void;
  language: PrintLabelLanguage;
  onLanguageChange: (language: PrintLabelLanguage) => void;
  children: ReactNode;
  className?: string;
};

export function PrintDocumentChrome({
  title,
  documentId,
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
          {documentId ? <PrintPreviewPill>{documentId}</PrintPreviewPill> : null}
          <PrintPreviewPill>{formatLabel(format)}</PrintPreviewPill>
          <PrintPreviewPill>{languageLabel(language)}</PrintPreviewPill>
        </>
      }
      helpers={
        <p className="text-xs text-tertiary">
          In the print dialog, turn off “Headers and footers” so date, title, and URL are not printed.
        </p>
      }
      primaryAction={
        <Button
          color="primary"
          size="md"
          onPress={() => {
            window.print();
          }}
        >
          Print
        </Button>
      }
      secondaryAction={
        <Button color="secondary" size="md" href={backHref}>
          {backLabel}
        </Button>
      }
      controls={
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-tertiary">Format</span>
              <div className="flex overflow-hidden rounded-lg ring-1 ring-secondary" role="group" aria-label="Print format">
                {PRINT_FORMATS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={cx(
                      "px-3 py-2 text-sm font-semibold transition",
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
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-tertiary">Language</span>
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
                      "px-3 py-2 text-sm font-semibold transition",
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
          </div>
          <p className="text-xs text-tertiary">
            {formatLabel(format)} · {languageLabel(language)} — remembered on this device
          </p>
        </div>
      }
    >
      <div className={cx("mx-auto w-full print:max-w-none", printMaxWidthClass(format))}>
        <div className="w-full rounded-lg border border-neutral-200 bg-white shadow-sm print:rounded-none print:border-0 print:shadow-none">
          {children}
        </div>
        <p className="mt-3 text-center text-xs text-tertiary print:hidden">
          Preview — Print uses this size. Does not change Settings.
        </p>
      </div>
    </PrintPreviewChrome>
  );
}
