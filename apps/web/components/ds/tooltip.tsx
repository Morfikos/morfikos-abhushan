"use client";

import type { ReactNode } from "react";
import type {
  ButtonProps as AriaButtonProps,
  ButtonRenderProps,
  TooltipProps as AriaTooltipProps,
  TooltipRenderProps,
  TooltipTriggerComponentProps as AriaTooltipTriggerComponentProps,
} from "react-aria-components";
import {
  Button as AriaButton,
  Tooltip as AriaTooltip,
  TooltipTrigger as AriaTooltipTrigger,
} from "react-aria-components";

import { cx } from "@/utils/cx";

export type TooltipProps = AriaTooltipTriggerComponentProps &
  Omit<AriaTooltipProps, "children"> & {
    /** Tooltip body. Never the only source of a control's accessible name. */
    content: ReactNode;
    children: ReactNode;
    /**
     * Delay before showing (ms).
     * @default 400
     */
    delay?: number;
    /**
     * Delay before hiding (ms).
     * @default 80
     */
    closeDelay?: number;
  };

/**
 * Inverse-surface tooltip. Delay 400ms in / 80ms out. Keyboard-reachable via RAC;
 * never use as the sole label for a control — pair with `aria-label` or visible text.
 */
export function Tooltip({
  content,
  children,
  delay = 400,
  closeDelay = 80,
  trigger,
  isDisabled,
  isOpen,
  defaultOpen,
  offset = 6,
  crossOffset,
  placement = "top",
  onOpenChange,
  className,
  ...tooltipProps
}: TooltipProps) {
  return (
    <AriaTooltipTrigger
      {...{ trigger, delay, closeDelay, isDisabled, isOpen, defaultOpen, onOpenChange }}
    >
      {children}
      <AriaTooltip
        {...tooltipProps}
        offset={offset}
        placement={placement}
        crossOffset={crossOffset}
        className={(values: TooltipRenderProps & { defaultClassName: string | undefined }) =>
          cx(
            values.isEntering && "ease-out animate-in fade-in zoom-in-95 duration-(--dur-base)",
            values.isExiting && "ease-in animate-out fade-out zoom-out-95 duration-(--dur-fast)",
            typeof className === "function" ? className(values) : className,
          )
        }
      >
        <div
          role="tooltip"
          className="z-50 max-w-xs rounded-(--radius-md) bg-surface-inverse px-2 py-1 text-2xs text-content-inverse shadow-ds-lg"
        >
          {content}
        </div>
      </AriaTooltip>
    </AriaTooltipTrigger>
  );
}

export type TooltipTriggerProps = AriaButtonProps;

/** Focusable trigger wrapper for icon-only or non-button hosts. */
export function TooltipTrigger({ children, className, ...buttonProps }: TooltipTriggerProps) {
  return (
    <AriaButton
      {...buttonProps}
      className={(values: ButtonRenderProps & { defaultClassName: string | undefined }) =>
        cx(
          "h-max w-max rounded-(--radius-md)",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)",
          typeof className === "function" ? className(values) : className,
        )
      }
    >
      {children}
    </AriaButton>
  );
}
