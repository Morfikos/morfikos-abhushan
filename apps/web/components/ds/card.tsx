import type { HTMLAttributes, ReactNode } from "react";

import { cx } from "@/utils/cx";

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  /**
   * Visual affordance only — hover elevates with `shadow-ds`.
   * Put a real `<a>` or `<button>` inside; never attach onClick to the card.
   */
  interactive?: boolean;
  /** Accent ring for the currently selected card in a set. */
  selected?: boolean;
};

/**
 * Surface card: white work surface, subtle border, card radius and density pad.
 * Interactive cards lift on hover; selection is a ring, not a fill.
 */
export function Card({ children, className, interactive = false, selected = false, ...rest }: CardProps) {
  return (
    <div
      className={cx(
        "rounded-card border border-border-subtle bg-surface p-card",
        interactive &&
          "transition-shadow duration-(--dur-fast) ease-ds motion-safe:hover:shadow-ds motion-reduce:hover:shadow-none",
        selected && "border-border-accent ring-2 ring-border-accent ring-offset-2 ring-offset-surface",
        className,
      )}
      data-interactive={interactive || undefined}
      data-selected={selected || undefined}
      {...rest}
    >
      {children}
    </div>
  );
}
