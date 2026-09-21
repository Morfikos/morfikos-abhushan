"use client";

import type { ReactNode } from "react";

import { cx } from "@/utils/cx";

export function StickyFormActions({
  children,
  variant,
  className,
}: {
  children: ReactNode;
  variant: "bar" | "inset";
  className?: string;
}) {
  if (variant === "bar") {
    return (
      <div
        className={cx(
          "sticky bottom-0 z-10 flex flex-wrap gap-3 rounded-xl border border-secondary bg-primary px-4 py-4 shadow-xs md:px-5",
          className,
        )}
      >
        {children}
      </div>
    );
  }

  return (
    <div
      className={cx(
        "sticky bottom-0 z-10 -mx-4 border-t border-secondary bg-primary px-4 py-4 md:-mx-5 md:px-5",
        className,
      )}
    >
      {children}
    </div>
  );
}
