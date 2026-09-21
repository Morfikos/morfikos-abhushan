"use client";

import type { ReactNode, Ref } from "react";
import { Text as AriaText, type TextProps as AriaTextProps } from "react-aria-components";

import { cx } from "@/utils/cx";

export type HelpTextProps = Omit<AriaTextProps, "children" | "slot"> & {
  children: ReactNode;
  ref?: Ref<HTMLElement>;
};

/** Muted description slot for field composites (RadioGroup, etc.). */
export function HelpText({ children, className, ...props }: HelpTextProps) {
  return (
    <AriaText
      {...props}
      slot="description"
      className={cx("text-ds-xs text-content-muted", className)}
    >
      {children}
    </AriaText>
  );
}

HelpText.displayName = "HelpText";
