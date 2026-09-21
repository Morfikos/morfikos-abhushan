"use client";

import type { ReactNode, Ref } from "react";
import {
  Switch as AriaSwitch,
  type SwitchProps as AriaSwitchProps,
  type SwitchRenderProps,
} from "react-aria-components";
import { cx } from "@/utils/cx";

export type ToggleProps = AriaSwitchProps & {
  label?: ReactNode;
  description?: ReactNode;
  ref?: Ref<HTMLLabelElement>;
};

/**
 * 34×20 switch with a 16px knob. Track: sunken → accent. RAC Switch provides role="switch".
 */
export function Toggle({ label, description, className, ...props }: ToggleProps) {
  return (
    <AriaSwitch
      {...props}
      className={(state: SwitchRenderProps & { defaultClassName: string | undefined }) =>
        cx(
          "group flex w-max items-start gap-2",
          state.isDisabled && "cursor-not-allowed",
          typeof className === "function" ? className(state) : className,
        )
      }
    >
      {({ isSelected, isDisabled, isFocusVisible, isHovered }: SwitchRenderProps) => (
        <>
          <span
            aria-hidden
            className={cx(
              "relative inline-flex h-5 w-8.5 shrink-0 items-center rounded-full p-0.5",
              "bg-surface-sunken transition-colors duration-(--dur-fast) ease-(--ease)",
              isSelected && "bg-accent",
              isHovered && !isDisabled && !isSelected && "bg-surface-sunken",
              isHovered && !isDisabled && isSelected && "bg-accent-pressed",
              isFocusVisible && "outline-2 outline-offset-2 outline-(--focus-ring)",
              isDisabled && "opacity-45",
            )}
          >
            <span
              className={cx(
                "size-4 rounded-full bg-surface shadow-ds-sm",
                "transition-transform duration-(--dur-fast) ease-(--ease)",
                "motion-reduce:transition-none",
                isSelected && "translate-x-3.5 bg-content-on-accent",
              )}
            />
          </span>

          {(label || description) && (
            <span className="inline-flex min-w-0 flex-col">
              {label ? (
                <span className="text-ds-sm font-normal text-content select-none">{label}</span>
              ) : null}
              {description ? (
                <span
                  className="text-ds-xs text-content-muted"
                  onClick={(event) => event.stopPropagation()}
                >
                  {description}
                </span>
              ) : null}
            </span>
          )}
        </>
      )}
    </AriaSwitch>
  );
}

Toggle.displayName = "Toggle";
