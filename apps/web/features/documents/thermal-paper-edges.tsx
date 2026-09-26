import type { ReactNode } from "react";

import { cx } from "@/utils/cx";

/**
 * Scalloped top/bottom edges so a paper slip reads as torn thermal stock.
 * Parent must provide a contrasting stage (staff `bg-secondary` or print stage)
 * so the punched teeth reveal that color.
 */
export function ThermalPaperEdges({
  children,
  className,
  paperClassName = "bg-primary",
}: {
  children: ReactNode;
  className?: string;
  /** Paper fill — use `bg-white` for monochrome print HTML. */
  paperClassName?: string;
}) {
  return (
    <div
      className={cx(
        "min-h-0",
        paperClassName,
        // Top + bottom semicircle punch; middle strip fully opaque.
        "[mask-image:radial-gradient(circle_at_6px_0,transparent_5.5px,#000_6px),radial-gradient(circle_at_6px_100%,transparent_5.5px,#000_6px),linear-gradient(#000,#000)]",
        "[mask-size:12px_6px,12px_6px,100%_calc(100%-12px)]",
        "[mask-position:0_0,0_100%,0_6px]",
        "[mask-repeat:repeat-x,repeat-x,no-repeat]",
        className,
      )}
    >
      {children}
    </div>
  );
}
