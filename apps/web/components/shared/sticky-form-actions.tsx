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
          "sticky bottom-0 z-10 flex flex-wrap justify-end gap-3 rounded-xl border border-secondary bg-primary px-4 pt-4 shadow-xs md:px-5",
          "pb-[max(1rem,env(safe-area-inset-bottom))]",
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
        "sticky bottom-0 z-10 -mx-4 flex flex-wrap gap-3 border-t border-secondary bg-primary px-4 pt-4 md:-mx-5 md:px-5",
        "pb-[max(1rem,env(safe-area-inset-bottom))]",
        className,
      )}
    >
      {children}
    </div>
  );
}
