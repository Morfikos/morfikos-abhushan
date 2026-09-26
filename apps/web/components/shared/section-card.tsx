"use client";

import type { ElementType, ReactNode } from "react";

import { cx } from "@/utils/cx";

export function SectionCard({
  title,
  description,
  actions,
  children,
  className,
  tone = "default",
  as: Tag = "div",
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** `metric` = denser money/readout tiles (Girvi statement). */
  tone?: "default" | "metric";
  as?: ElementType;
}) {
  const hasHeader = Boolean(title || description || actions);

  return (
    <Tag
      className={cx(
        "flex flex-col rounded-xl bg-primary shadow-xs ring-1 ring-secondary",
        tone === "metric" ? "gap-1 p-4" : "gap-4 p-4 md:p-5",
        className,
      )}
    >
      {hasHeader ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {title || description ? (
            <div className="flex min-w-0 flex-col gap-1">
              {title ? <h2 className="text-lg font-semibold text-primary">{title}</h2> : null}
              {description ? <p className="text-sm text-tertiary">{description}</p> : null}
            </div>
          ) : (
            <div />
          )}
          {actions ? <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </Tag>
  );
}
