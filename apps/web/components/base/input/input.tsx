"use client";

import { type ComponentType, type ReactNode, type Ref, createContext, useContext, useState } from "react";
import { Eye, EyeOff, HelpCircle, InfoCircle, XClose } from "@untitledui/icons";
import type { GroupRenderProps, InputProps as AriaInputProps, TextFieldProps as AriaTextFieldProps, TextFieldRenderProps } from "react-aria-components";
import { Button as AriaButton, Group as AriaGroup, Input as AriaInput, TextField as AriaTextField } from "react-aria-components";
import { HintText } from "@/components/base/input/hint-text";
import { Label } from "@/components/base/input/label";
import { Tooltip, TooltipTrigger } from "@/components/base/tooltip/tooltip";
import { cx, sortCx } from "@/utils/cx";

export interface InputBaseProps extends Omit<AriaInputProps, "size" | "prefix"> {
    /** Tooltip message on hover (in-field help icon). Prefer Label tooltip when a label is present. */
    tooltip?: string;
    /** Whether the input is invalid. */
    isInvalid?: boolean;
    /** Whether the input is disabled. */
    isDisabled?: boolean;
    /** Whether the input is read only. */
    isReadOnly?: boolean;
    /** Whether the input is required. */
    isRequired?: boolean;
    /**
     * Input size.
     * @default "md"
     */
    size?: "sm" | "md" | "lg";
    /** Placeholder text. */
    placeholder?: string;
    /** Class name for the icon. */
    iconClassName?: string;
    /** Class name for the input. */
    inputClassName?: string;
    /** Class name for the input wrapper. */
    wrapperClassName?: string;
    /** Class name for the tooltip. */
    tooltipClassName?: string;
    /** Keyboard shortcut to display (short key only, e.g. ⌘K). */
    shortcut?: string | boolean;
    /** Text prefix inside the field (units such as ₹). */
    prefix?: ReactNode;
    /** Text suffix inside the field (units such as g). */
    suffix?: ReactNode;
    /** Show a clear control when the value is non-empty. */
    isClearable?: boolean;
    /** Called when the clear control is pressed. */
    onClear?: () => void;
    /** Whether the clear control should render (non-empty value). */
    showClear?: boolean;
    ref?: Ref<HTMLInputElement>;
    groupRef?: Ref<HTMLDivElement>;
    /** Icon component to display on the left side of the input. */
    icon?: ComponentType<{ className?: string }>;
    autoCapitalize?: AriaInputProps["autoCapitalize"];
    autoCorrect?: string;
    /** Native spellcheck; prefer boolean for callers. */
    spellCheck?: boolean | "true" | "false";
}

export const InputBase = ({
    ref,
    tooltip,
    shortcut,
    groupRef,
    size = "md",
    isInvalid,
    isDisabled,
    isReadOnly,
    icon: Icon,
    placeholder,
    wrapperClassName,
    tooltipClassName,
    inputClassName,
    iconClassName,
    prefix,
    suffix,
    isClearable,
    onClear,
    showClear = false,
    type = "text",
    ...inputProps
}: InputBaseProps) => {
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);

    const hasSuffix = Boolean(suffix);
    const showInvalidIcon = Boolean(isInvalid) && !hasSuffix && type !== "password";
    const clearVisible = Boolean(isClearable && showClear && !isDisabled && !isReadOnly && type !== "password");
    const hasTrailingIcon = Boolean(tooltip) || showInvalidIcon || type === "password" || clearVisible;
    const hasLeadingIcon = Boolean(Icon);
    const hasPrefix = Boolean(prefix);
    const hasShortcut = Boolean(shortcut);

    const context = useContext(TextFieldContext);

    const inputSize = context?.size || size;

    const sizes = sortCx({
        sm: {
            root: cx(
                "px-3 py-2 text-sm",
                hasLeadingIcon && "pl-9",
                hasPrefix && !hasLeadingIcon && "pl-8",
                hasTrailingIcon && "pr-9",
                hasSuffix && !hasTrailingIcon && "pr-8",
                hasSuffix && clearVisible && "pr-14",
                hasShortcut && "pr-12",
            ),
            iconLeading: "left-3 size-4 stroke-[2.25px]",
            iconTrailing: "right-3",
            prefix: "left-3 text-sm",
            suffix: "right-3 text-sm",
            shortcut: "pr-1.5",
        },
        md: {
            root: cx(
                "px-3 py-2 text-md",
                hasLeadingIcon && "pl-10",
                hasPrefix && !hasLeadingIcon && "pl-8",
                hasTrailingIcon && "pr-9",
                hasSuffix && !hasTrailingIcon && "pr-8",
                hasSuffix && clearVisible && "pr-14",
                hasShortcut && "pr-12",
            ),
            iconLeading: "left-3 size-5",
            iconTrailing: "right-3",
            prefix: "left-3 text-md",
            suffix: "right-3 text-md",
            shortcut: "pr-2",
        },
        lg: {
            root: cx(
                "px-3.5 py-2.5 text-md",
                hasLeadingIcon && "pl-10.5",
                hasPrefix && !hasLeadingIcon && "pl-9",
                hasTrailingIcon && "pr-9.5",
                hasSuffix && !hasTrailingIcon && "pr-9",
                hasSuffix && clearVisible && "pr-16",
                hasShortcut && "pr-14",
            ),
            iconLeading: "left-3.5 size-5",
            iconTrailing: "right-3.5",
            prefix: "left-3.5 text-md",
            suffix: "right-3.5 text-md",
            shortcut: "pr-2.5",
        },
    });

    return (
        <AriaGroup
            {...{ isDisabled, isInvalid, isReadOnly }}
            ref={groupRef}
            className={({ isFocusWithin, isDisabled, isInvalid }: GroupRenderProps) =>
                cx(
                    "group/input relative flex w-full flex-row place-content-center place-items-center rounded-lg bg-primary shadow-xs ring-1 ring-primary transition-shadow duration-100 ease-linear ring-inset",

                    isFocusWithin && !isDisabled && !isReadOnly && "ring-2 ring-brand",

                    // Read-only state styles
                    isReadOnly && "cursor-default bg-secondary",
                    "group-readonly:cursor-default group-readonly:bg-secondary",

                    // Disabled state styles (opacity once; parent TextField also has data-disabled)
                    isDisabled && "cursor-not-allowed opacity-50 in-data-input-wrapper:opacity-100",
                    "group-disabled:cursor-not-allowed group-disabled:opacity-50 in-data-input-wrapper:group-disabled:opacity-100",

                    // Invalid state styles
                    isInvalid && "ring-error_subtle",
                    "group-invalid:ring-error_subtle",

                    // Invalid state with focus-within styles
                    isInvalid && isFocusWithin && "ring-2 ring-error",
                    isFocusWithin && "group-invalid:ring-2 group-invalid:ring-error",

                    context?.wrapperClassName,
                    wrapperClassName,
                )
            }
        >
            {Icon && (
                <Icon className={cx("pointer-events-none absolute text-fg-quaternary", sizes[inputSize].iconLeading, context?.iconClassName, iconClassName)} />
            )}

            {prefix && !Icon ? (
                <span
                    aria-hidden="true"
                    className={cx("pointer-events-none absolute font-medium text-fg-quaternary", sizes[inputSize].prefix)}
                >
                    {prefix}
                </span>
            ) : null}

            <AriaInput
                {...(inputProps as AriaInputProps)}
                ref={ref}
                type={type === "password" && isPasswordVisible ? "text" : type}
                placeholder={placeholder}
                className={cx(
                    "m-0 w-full bg-transparent text-primary ring-0 outline-hidden placeholder:text-placeholder autofill:rounded-lg autofill:text-primary disabled:cursor-not-allowed",
                    "read-only:cursor-default",
                    sizes[inputSize].root,
                    context?.inputClassName,
                    inputClassName,
                )}
            />

            {suffix && type !== "password" ? (
                <span
                    aria-hidden="true"
                    className={cx(
                        "pointer-events-none absolute font-medium text-fg-quaternary",
                        clearVisible ? "right-9 text-sm md:text-md" : sizes[inputSize].suffix,
                    )}
                >
                    {suffix}
                </span>
            ) : null}

            {tooltip && type !== "password" && (
                <Tooltip title={tooltip} placement="top">
                    <TooltipTrigger
                        className={cx(
                            "absolute cursor-pointer text-fg-quaternary transition duration-100 ease-linear group-invalid/input:hidden hover:text-fg-quaternary_hover focus:text-fg-quaternary_hover",
                            sizes[inputSize].iconTrailing,
                            context?.tooltipClassName,
                            tooltipClassName,
                        )}
                    >
                        <HelpCircle className="size-4 stroke-[2.25px]" />
                    </TooltipTrigger>
                </Tooltip>
            )}

            {showInvalidIcon ? (
                <InfoCircle
                    className={cx(
                        "pointer-events-none absolute size-4 stroke-[2.25px] text-fg-error-secondary",
                        sizes[inputSize].iconTrailing,
                        context?.tooltipClassName,
                        tooltipClassName,
                    )}
                />
            ) : null}

            {clearVisible ? (
                <AriaButton
                    aria-label="Clear"
                    onClick={() => onClear?.()}
                    className={cx(
                        "absolute flex size-6 cursor-pointer items-center justify-center rounded text-fg-quaternary transition duration-100 ease-linear hover:text-fg-quaternary_hover focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand",
                        sizes[inputSize].iconTrailing,
                    )}
                >
                    <XClose className="size-4 stroke-[2.25px]" />
                </AriaButton>
            ) : null}

            {type === "password" && (
                <AriaButton
                    aria-label={isPasswordVisible ? "Hide password" : "Show password"}
                    onClick={() => setIsPasswordVisible(!isPasswordVisible)}
                    className={cx(
                        "absolute flex size-6 cursor-pointer items-center justify-center rounded text-fg-quaternary transition duration-100 ease-linear hover:text-fg-quaternary_hover focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand",
                        sizes[inputSize].iconTrailing,
                    )}
                >
                    {isPasswordVisible ? <EyeOff className="size-4 stroke-[2.25px]" /> : <Eye className="size-4 stroke-[2.25px]" />}
                </AriaButton>
            )}

            {shortcut && (
                <div
                    className={cx(
                        "pointer-events-none absolute inset-y-0.5 right-0.5 z-10 hidden items-center rounded-r-[inherit] bg-linear-to-r from-transparent to-bg-primary to-40% pl-8 md:flex",
                        sizes[inputSize].shortcut,
                        isReadOnly && "to-bg-secondary",
                    )}
                >
                    <span
                        aria-hidden="true"
                        className="pointer-events-none rounded px-1 py-px text-xs font-medium text-quaternary ring-1 ring-secondary select-none ring-inset"
                    >
                        {typeof shortcut === "string" ? shortcut : "⌘K"}
                    </span>
                </div>
            )}
        </AriaGroup>
    );
};

InputBase.displayName = "InputBase";

interface TextFieldContextProps extends Partial<Pick<InputBaseProps, "size" | "wrapperClassName" | "inputClassName" | "iconClassName" | "tooltipClassName">> {}

const TextFieldContext = createContext<TextFieldContextProps>({});

export interface TextFieldProps extends AriaTextFieldProps, TextFieldContextProps {}

export const TextField = ({ className, size = "md", inputClassName, wrapperClassName, iconClassName, tooltipClassName, ...props }: TextFieldProps) => {
    return (
        <TextFieldContext.Provider value={{ inputClassName, wrapperClassName, iconClassName, tooltipClassName, size }}>
            <AriaTextField
                {...props}
                data-input-wrapper
                data-input-size={size}
                className={(state: TextFieldRenderProps & { defaultClassName: string | undefined }) =>
                    cx("group flex h-max w-full flex-col items-start justify-start gap-1.5", typeof className === "function" ? className(state) : className)
                }
            />
        </TextFieldContext.Provider>
    );
};

TextField.displayName = "TextField";

export interface InputProps
    extends
        Omit<AriaTextFieldProps, "value" | "onChange" | "spellCheck" | "autoCapitalize" | "autoCorrect">,
        Pick<
            InputBaseProps,
            | "ref"
            | "placeholder"
            | "icon"
            | "shortcut"
            | "tooltip"
            | "groupRef"
            | "size"
            | "wrapperClassName"
            | "inputClassName"
            | "iconClassName"
            | "tooltipClassName"
            | "prefix"
            | "suffix"
            | "isClearable"
            | "autoCapitalize"
            | "autoCorrect"
            | "spellCheck"
        > {
    /** Label text for the input */
    label?: string;
    /** Helper text displayed below the input */
    hint?: ReactNode;
    /** Error message displayed below the input (and below hint when both are set) */
    error?: ReactNode;
    /** Whether to hide required indicator from label */
    hideRequiredIndicator?: boolean;
    /** Controlled input value. */
    value?: string;
    /** Handler that is called when the value changes. */
    onChange?: (value: string) => void;
}

export const Input = ({
    size = "md",
    placeholder,
    icon: Icon,
    label,
    hint,
    error,
    shortcut,
    hideRequiredIndicator,
    className,
    ref,
    groupRef,
    tooltip,
    iconClassName,
    inputClassName,
    wrapperClassName,
    tooltipClassName,
    prefix,
    suffix,
    isClearable,
    autoCapitalize,
    autoCorrect,
    spellCheck,
    type = "text",
    validationBehavior = "aria",
    value,
    onChange,
    ...props
}: InputProps) => {
    const labelTooltip = label ? tooltip : undefined;
    const fieldTooltip = label ? undefined : tooltip;
    const showClear = Boolean(isClearable && value && value.length > 0);

    return (
        <TextField
            aria-label={!label ? placeholder : undefined}
            {...props}
            value={value}
            onChange={onChange}
            size={size}
            className={className}
            validationBehavior={validationBehavior}
        >
            {({ isRequired, isInvalid, isReadOnly }) => (
                <>
                    {label && (
                        <Label isRequired={!hideRequiredIndicator && isRequired} isInvalid={isInvalid} tooltip={labelTooltip}>
                            {label}
                        </Label>
                    )}

                    <InputBase
                        {...{
                            ref,
                            groupRef,
                            size,
                            placeholder,
                            icon: Icon,
                            shortcut,
                            iconClassName,
                            inputClassName,
                            wrapperClassName,
                            tooltipClassName,
                            tooltip: fieldTooltip,
                            type,
                            prefix,
                            suffix,
                            isReadOnly,
                            isClearable,
                            showClear,
                            onClear: () => onChange?.(""),
                            autoCapitalize,
                            autoCorrect,
                            spellCheck,
                        }}
                    />

                    {hint ? <HintText slot="description">{hint}</HintText> : null}
                    {error ? <HintText slot="errorMessage">{error}</HintText> : null}
                </>
            )}
        </TextField>
    );
};

Input.displayName = "Input";
