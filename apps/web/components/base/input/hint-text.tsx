"use client";

import type { ReactNode, Ref } from "react";
import type { TextProps as AriaTextProps } from "react-aria-components";
import { Text as AriaText } from "react-aria-components";
import { cx } from "@/utils/cx";

interface HintTextProps extends AriaTextProps {
    /**
     * Slot for the text. Use `description` for help and `errorMessage` for field errors.
     * @default "description"
     */
    slot?: "description" | "errorMessage";
    ref?: Ref<HTMLElement>;
    size?: "sm" | "md";
    children: ReactNode;
}

export const HintText = ({ slot = "description", className, size = "md", ...props }: HintTextProps) => {
    const isError = slot === "errorMessage";

    return (
        <AriaText
            {...props}
            slot={slot}
            className={cx(
                "text-sm",
                isError ? "text-error-primary" : "text-tertiary",

                // Size
                size === "sm" && "text-xs",
                "in-data-[input-size=sm]:text-xs",

                className,
            )}
        />
    );
};

HintText.displayName = "HintText";
