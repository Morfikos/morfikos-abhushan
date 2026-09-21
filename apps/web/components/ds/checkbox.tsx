"use client";

import type { ReactNode, Ref } from "react";
import {
  Checkbox as AriaCheckbox,
  type CheckboxProps as AriaCheckboxProps,
  type CheckboxRenderProps,
} from "react-aria-components";
import { cx } from "@/utils/cx";

export interface CheckboxProps extends AriaCheckboxProps {
  label?: ReactNode;
  description?: ReactNode;
  /** Marks the control invalid (error border on the box). */
  isInvalid?: boolean;
  ref?: Ref<HTMLLabelElement>;
}

function CheckboxMark({
  isSelected,
  isIndeterminate,
  isFocusVisible,
  isDisabled,
  isInvalid,
  isHovered,
}: {
  isSelected: boolean;
  isIndeterminate: boolean;
  isFocusVisible: boolean;
  isDisabled: boolean;
  isInvalid?: boolean;
  isHovered: boolean;
}) {
  const checked = isSelected || isIndeterminate;

  return (
    <span
      aria-hidden
      className={cx(
        "relative flex size-4 shrink-0 items-center justify-center rounded-(--radius-sm)",
        "border border-border-strong bg-surface",
        "transition-[background-color,border-color] duration-(--dur-fast) ease-(--ease)",
        isHovered && !isDisabled && !checked && "border-border-accent",
        checked && "border-accent bg-accent",
        isInvalid && !checked && "border-error-border",
        isInvalid && checked && "border-error-fg bg-error-pressed",
        isFocusVisible && "outline-2 outline-offset-2 outline-(--focus-ring)",
        isDisabled && "opacity-45",
      )}
    >
      {/* Indeterminate dash */}
      <svg
        viewBox="0 0 14 14"
        fill="none"
        className={cx(
          "absolute size-3 text-content-on-accent opacity-0 transition-opacity duration-(--dur-fast)",
          isIndeterminate && "opacity-100",
        )}
      >
        <path
          d="M3 7h8"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      {/* Check */}
      <svg
        viewBox="0 0 14 14"
        fill="none"
        className={cx(
          "absolute size-3 text-content-on-accent opacity-0 transition-opacity duration-(--dur-fast)",
          isSelected && !isIndeterminate && "opacity-100",
        )}
      >
        <path
          d="M11.5 3.5 5.25 9.75 2.5 7"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

/**
 * 16px checkbox. Indeterminate exposes aria-checked="mixed" via RAC.
 */
export function Checkbox({
  label,
  description,
  className,
  isInvalid,
  ...props
}: CheckboxProps) {
  return (
    <AriaCheckbox
      {...props}
      className={(state: CheckboxRenderProps & { defaultClassName: string | undefined }) =>
        cx(
          "group flex items-start gap-2",
          state.isDisabled && "cursor-not-allowed",
          typeof className === "function" ? className(state) : className,
        )
      }
    >
      {({
        isSelected,
        isIndeterminate,
        isDisabled,
        isFocusVisible,
        isHovered,
      }: CheckboxRenderProps) => (
        <>
          <CheckboxMark
            isSelected={isSelected}
            isIndeterminate={isIndeterminate}
            isDisabled={isDisabled}
            isFocusVisible={isFocusVisible}
            isHovered={isHovered}
            isInvalid={isInvalid}
          />
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
    </AriaCheckbox>
  );
}

Checkbox.displayName = "Checkbox";
