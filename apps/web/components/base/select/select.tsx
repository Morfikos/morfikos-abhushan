"use client";

import type { FC, ReactNode, Ref, RefAttributes } from "react";
import { isValidElement } from "react";
import { ChevronDown } from "@untitledui/icons";
import type { SelectProps as AriaSelectProps } from "react-aria-components";
import { Button as AriaButton, ListBox as AriaListBox, Select as AriaSelect, SelectValue as AriaSelectValue } from "react-aria-components";
import { Avatar } from "@/components/base/avatar/avatar";
import { HintText } from "@/components/base/input/hint-text";
import { Label } from "@/components/base/input/label";
import { cx } from "@/utils/cx";
import { isReactComponent } from "@/utils/is-react-component";
import { ComboBox } from "./combobox";
import { Popover } from "./popover";
import { SelectItem } from "./select-item";
import { type CommonProps, SelectContext, type SelectItemType, sizes } from "./select-shared";

export { SelectContext, sizes, type CommonProps, type SelectItemType } from "./select-shared";

export interface SelectProps extends Omit<AriaSelectProps<SelectItemType>, "children" | "items">, RefAttributes<HTMLDivElement>, CommonProps {
    items?: SelectItemType[];
    popoverClassName?: string;
    icon?: FC | ReactNode;
    /** Shows a spinner in the trigger and keeps the control disabled. */
    isLoading?: boolean;
    children: ReactNode | ((item: SelectItemType) => ReactNode);
}

interface SelectValueProps {
    isOpen: boolean;
    size: "sm" | "md" | "lg";
    isFocused: boolean;
    isDisabled: boolean;
    isInvalid: boolean;
    isLoading?: boolean;
    placeholder?: string;
    ref?: Ref<HTMLButtonElement>;
    icon?: FC | ReactNode;
}

const SelectLoadingIcon = ({ size }: { size: "sm" | "md" | "lg" }) => (
    <svg
        fill="none"
        aria-hidden="true"
        viewBox="0 0 20 20"
        className={cx("ml-auto shrink-0 text-fg-quaternary", size === "lg" ? "size-5" : "size-4")}
    >
        <circle className="stroke-current opacity-30" cx="10" cy="10" r="8" fill="none" strokeWidth="2" />
        <circle
            className="origin-center animate-spin stroke-current"
            cx="10"
            cy="10"
            r="8"
            fill="none"
            strokeWidth="2"
            strokeDasharray="12.5 50"
            strokeLinecap="round"
        />
    </svg>
);

const SelectValue = ({ isOpen, isFocused, isDisabled, isInvalid, isLoading, size, placeholder, icon, ref }: SelectValueProps) => {
    return (
        <AriaButton
            ref={ref}
            className={cx(
                "relative flex w-full cursor-pointer items-center rounded-lg bg-primary shadow-xs ring-1 ring-primary outline-hidden transition duration-100 ease-linear ring-inset",
                isInvalid && "ring-error_subtle",
                (isFocused || isOpen) && !isInvalid && "ring-2 ring-brand",
                (isFocused || isOpen) && isInvalid && "ring-2 ring-error",
                isDisabled && "cursor-not-allowed opacity-50",
            )}
        >
            <AriaSelectValue<SelectItemType>
                className={(state) =>
                    cx(
                        "flex h-max w-full items-center justify-start truncate text-left align-middle",

                        sizes[size].root,

                        // With icon
                        (state.selectedItems[0]?.icon || icon) && sizes[size].withIcon,

                        // Icon styles
                        "*:data-icon:shrink-0 *:data-icon:text-fg-quaternary",
                    )
                }
            >
                {(state) => {
                    const selectedItem = state.selectedItems[0];
                    const Icon = selectedItem?.icon || icon;

                    return (
                        <>
                            {selectedItem?.avatarUrl ? (
                                <Avatar size="xs" src={selectedItem.avatarUrl} alt={selectedItem.label} className={cx(size === "sm" && "size-5")} />
                            ) : isReactComponent(Icon) ? (
                                <Icon data-icon aria-hidden="true" />
                            ) : isValidElement(Icon) ? (
                                Icon
                            ) : null}

                            {selectedItem ? (
                                <section className={cx("flex w-full truncate", sizes[size].textContainer)}>
                                    <p className={cx("truncate font-medium text-primary", sizes[size].text)}>{selectedItem?.label}</p>
                                    {selectedItem?.supportingText && <p className={cx("text-tertiary", sizes[size].text)}>{selectedItem?.supportingText}</p>}
                                </section>
                            ) : (
                                <p className={cx("text-placeholder", sizes[size].text)}>{placeholder}</p>
                            )}

                            {isLoading ? (
                                <SelectLoadingIcon size={size} />
                            ) : (
                                <ChevronDown
                                    aria-hidden="true"
                                    className={cx(
                                        "ml-auto shrink-0 text-fg-quaternary transition-transform duration-100",
                                        size === "lg" ? "size-5" : "size-4 stroke-[2.25px]",
                                        isOpen && "rotate-180",
                                    )}
                                />
                            )}
                        </>
                    );
                }}
            </AriaSelectValue>
        </AriaButton>
    );
};

const Select = ({
    placeholder = "Select",
    icon,
    size = "md",
    children,
    items,
    label,
    hint,
    error,
    tooltip,
    hideRequiredIndicator,
    className,
    isLoading,
    ...rest
}: SelectProps) => {
    return (
        <SelectContext.Provider value={{ size }}>
            <AriaSelect {...rest} className={(state) => cx("flex flex-col gap-1.5", typeof className === "function" ? className(state) : className)}>
                {(state) => (
                    <>
                        {label && (
                            <Label isRequired={!hideRequiredIndicator && state.isRequired} isInvalid={state.isInvalid} tooltip={tooltip}>
                                {label}
                            </Label>
                        )}

                        <SelectValue {...state} {...{ size, placeholder, isLoading }} icon={icon} />

                        <Popover size={size} className={rest.popoverClassName}>
                            <AriaListBox items={items} className="size-full outline-hidden">
                                {children}
                            </AriaListBox>
                        </Popover>

                        {hint ? (
                            <HintText slot="description" className={cx(size === "sm" && "text-xs")}>
                                {hint}
                            </HintText>
                        ) : null}
                        {error ? (
                            <HintText slot="errorMessage" className={cx(size === "sm" && "text-xs")}>
                                {error}
                            </HintText>
                        ) : null}
                    </>
                )}
            </AriaSelect>
        </SelectContext.Provider>
    );
};

const _Select = Select as typeof Select & {
    ComboBox: typeof ComboBox;
    Item: typeof SelectItem;
};
_Select.ComboBox = ComboBox;
_Select.Item = SelectItem;

export { _Select as Select };
