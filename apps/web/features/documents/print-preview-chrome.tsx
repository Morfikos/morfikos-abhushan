"use client";

import type { ReactNode } from "react";

import { usePrintDocumentTitle } from "@/features/documents/use-print-document-title";
import { cx } from "@/utils/cx";

export type PrintPreviewChromeProps = {
  title: ReactNode;
  metadata?: ReactNode;
  helpers?: ReactNode;
  primaryAction: ReactNode;
  secondaryAction: ReactNode;
  controls?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Extra class on the sticky header (e.g. tag print CSS hide target). */
  headerClassName?: string;
  /** Extra class on the preview stage wrapper (e.g. tag-print-stage). */
  stageClassName?: string;
};

export function PrintPreviewChrome({
  title,
  metadata,
  helpers,
  primaryAction,
  secondaryAction,
  controls,
  footer,
  children,
  className,
  headerClassName,
  stageClassName,
}: PrintPreviewChromeProps) {
  usePrintDocumentTitle();

  return (
    <div className={cx("min-h-screen bg-secondary text-primary print:bg-white print:text-black", className)}>
      <div
        className={cx(
          "sticky top-0 z-10 border-b border-secondary bg-primary print:hidden",
          headerClassName,
        )}
      >
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <h1 className="text-lg font-semibold text-primary">{title}</h1>
              {metadata ? (
                <div className="flex flex-wrap items-center gap-2 text-sm text-tertiary">{metadata}</div>
              ) : null}
              {helpers}
            </div>
            <div className="flex flex-wrap gap-2">
              {primaryAction}
              {secondaryAction}
            </div>
          </div>
          {controls}
          {footer}
        </div>
      </div>

      <div className={cx("px-4 py-6 print:p-0", stageClassName)}>{children}</div>
    </div>
  );
}

export function PrintPreviewPill({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-md bg-secondary px-2 py-0.5 font-medium text-secondary ring-1 ring-inset ring-secondary">
      {children}
    </span>
  );
}
