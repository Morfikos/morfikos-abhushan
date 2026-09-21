"use client";

import { type ReactNode, type Ref, createContext, useContext } from "react";
import {
  Label as AriaLabel,
  Radio as AriaRadio,
  RadioGroup as AriaRadioGroup,
  type RadioGroupProps as AriaRadioGroupProps,
  type RadioProps as AriaRadioProps,
  type RadioRenderProps,
} from "react-aria-components";
import { FieldError } from "@/components/ds/field-error";
import { HelpText } from "@/components/ds/help-text";
import { cx } from "@/utils/cx";

const RadioGroupContext = createContext<{ isInvalid?: boolean } | null>(null);

export interface RadioGroupProps extends AriaRadioGroupProps {
  /** Group legend (rendered as RAC Label → legend-equivalent). */
  label?: ReactNode;
  description?: ReactNode;
  errorMessage?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * Radio group via RAC (role="radiogroup"). Arrow keys move within the group.
 */
export function RadioGroup({
  label,
  description,
  errorMessage,
  children,
  className,
  isInvalid,
  isRequired,
  ...props
}: RadioGroupProps) {
  const invalid = Boolean(isInvalid) || Boolean(errorMessage);

  return (
    <RadioGroupContext.Provider value={{ isInvalid: invalid }}>
      <AriaRadioGroup
        {...props}
        isRequired={isRequired}
        isInvalid={invalid}
        className={cx("flex flex-col gap-2", className)}
      >
        {label ? (
          <AriaLabel className="text-ds-xs font-normal text-content-muted">
            {label}
            {isRequired ? <span className="font-normal text-content-muted"> required</span> : null}
          </AriaLabel>
        ) : null}
        <div className="flex flex-col gap-2">{children}</div>
        {description ? <HelpText>{description}</HelpText> : null}
        {errorMessage ? <FieldError>{errorMessage}</FieldError> : <FieldError />}
      </AriaRadioGroup>
    </RadioGroupContext.Provider>
  );
}

RadioGroup.displayName = "RadioGroup";

export interface RadioProps extends AriaRadioProps {
  label?: ReactNode;
  description?: ReactNode;
  ref?: Ref<HTMLLabelElement>;
}

function RadioMark({
  isSelected,
  isFocusVisible,
  isDisabled,
  isHovered,
  isInvalid,
}: {
  isSelected: boolean;
  isFocusVisible: boolean;
  isDisabled: boolean;
  isHovered: boolean;
  isInvalid?: boolean;
}) {
  return (
    <span
      aria-hidden
      className={cx(
        "relative flex size-4 shrink-0 items-center justify-center rounded-full",
        "border border-border-strong bg-surface",
        "transition-[background-color,border-color] duration-(--dur-fast) ease-(--ease)",
        isHovered && !isDisabled && !isSelected && "border-border-accent",
        isSelected && "border-accent bg-accent",
        isInvalid && !isSelected && "border-error-border",
        isInvalid && isSelected && "border-error-fg bg-error-pressed",
        isFocusVisible && "outline-2 outline-offset-2 outline-(--focus-ring)",
        isDisabled && "opacity-45",
      )}
    >
      <span
        className={cx(
          "size-1.5 rounded-full bg-content-on-accent opacity-0 transition-opacity duration-(--dur-fast)",
          isSelected && "opacity-100",
        )}
      />
    </span>
  );
}

export function Radio({ label, description, className, ...props }: RadioProps) {
  const group = useContext(RadioGroupContext);

  return (
    <AriaRadio
      {...props}
      className={(state: RadioRenderProps & { defaultClassName: string | undefined }) =>
        cx(
          "group flex items-start gap-2",
          state.isDisabled && "cursor-not-allowed",
          typeof className === "function" ? className(state) : className,
        )
      }
    >
      {({ isSelected, isDisabled, isFocusVisible, isHovered }: RadioRenderProps) => (
        <>
          <RadioMark
            isSelected={isSelected}
            isDisabled={isDisabled}
            isFocusVisible={isFocusVisible}
            isHovered={isHovered}
            isInvalid={group?.isInvalid}
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
    </AriaRadio>
  );
}

Radio.displayName = "Radio";
