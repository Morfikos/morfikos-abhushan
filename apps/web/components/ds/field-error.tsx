"use client";

import type { ReactNode, Ref } from "react";
import {
  FieldError as AriaFieldError,
  type FieldErrorProps as AriaFieldErrorProps,
  type FieldErrorRenderProps,
} from "react-aria-components";

import { cx } from "@/utils/cx";

export type FieldErrorProps = Omit<AriaFieldErrorProps, "children"> & {
  children?: ReactNode;
  ref?: Ref<HTMLElement>;
};

/** Validation message slot; without children, RAC reads the parent field's error. */
export function FieldError({ children, className, ...props }: FieldErrorProps) {
  return (
    <AriaFieldError
      {...props}
      className={(values: FieldErrorRenderProps & { defaultClassName: string | undefined }) =>
        cx(
          "text-ds-xs text-error-fg",
          typeof className === "function" ? className(values) : className,
        )
      }
    >
      {children}
    </AriaFieldError>
  );
}

FieldError.displayName = "FieldError";
