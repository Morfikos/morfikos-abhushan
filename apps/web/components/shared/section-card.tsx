"use client";

import type { ElementType, ReactNode } from "react";

import { cx } from "@/utils/cx";

export function SectionCard({
  title,
  description,
  children,
  className,
  as: Tag = "div",
}: {
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  as?: ElementType;
}) {
  return (
    <Tag className={cx("flex flex-col gap-4 rounded-xl bg-primary p-4 shadow-xs ring-1 ring-secondary md:p-5", className)}>
      {title || description ? (
        <div>
          {title ? <h2 className="text-lg font-semibold text-primary">{title}</h2> : null}
          {description ? <p className="text-sm text-tertiary">{description}</p> : null}
        </div>
      ) : null}
      {children}
    </Tag>
  );
}
