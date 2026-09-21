"use client";

import {
  createContext,
  isValidElement,
  useContext,
  type FC,
  type PropsWithChildren,
  type ReactNode,
  type RefAttributes,
} from "react";
import {
  ToggleButton as AriaToggleButton,
  ToggleButtonGroup as AriaToggleButtonGroup,
  type ToggleButtonGroupProps,
  type ToggleButtonProps,
} from "react-aria-components";
import { cx, sortCx } from "@/utils/cx";
import { isReactComponent } from "@/utils/is-react-component";

type ButtonGroupSize = "sm" | "md" | "lg";

const styles = sortCx({
  item: [
    "inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap",
    "bg-transparent font-medium text-content transition-[background-color,color,opacity]",
    "duration-[var(--dur-fast)] ease-[var(--ease)]",
    "border-0 border-r border-border-default last:border-r-0",
    "hover:bg-surface-sunken",
    "focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
    "disabled:cursor-not-allowed disabled:opacity-45 disabled:pointer-events-none",
    "aria-pressed:bg-accent-hover aria-pressed:text-content-accent",
    "*:data-icon:pointer-events-none *:data-icon:shrink-0",
  ].join(" "),

  sizes: {
    sm: "h-control-sm gap-1 px-2.5 text-ds-sm *:data-icon:size-3.5",
    md: "h-control gap-1.5 px-3.5 text-ds-sm *:data-icon:size-4",
    lg: "h-control-lg gap-1.5 px-4 text-ds-base *:data-icon:size-5",
  },
});

const ButtonGroupContext = createContext<{ size: ButtonGroupSize } | null>(null);

export interface ButtonGroupItemProps extends ToggleButtonProps, RefAttributes<HTMLButtonElement> {
  iconLeading?: FC<{ className?: string }> | ReactNode;
  iconTrailing?: FC<{ className?: string }> | ReactNode;
  className?: string;
}

export function ButtonGroupItem({
  iconLeading: IconLeading,
  iconTrailing: IconTrailing,
  children,
  className,
  ...otherProps
}: PropsWithChildren<ButtonGroupItemProps>) {
  const context = useContext(ButtonGroupContext);

  if (!context) {
    throw new Error("ButtonGroupItem must be used within a ButtonGroup");
  }

  const { size } = context;
  const isIcon = (IconLeading || IconTrailing) && !children;

  return (
    <AriaToggleButton
      {...otherProps}
      data-icon-only={isIcon ? true : undefined}
      className={cx(styles.item, styles.sizes[size], isIcon && "px-0 aspect-square", className)}
    >
      {isReactComponent(IconLeading) && <IconLeading data-icon="leading" className="pointer-events-none shrink-0" />}
      {isValidElement(IconLeading) && IconLeading}

      {children}

      {isReactComponent(IconTrailing) && <IconTrailing data-icon="trailing" className="pointer-events-none shrink-0" />}
      {isValidElement(IconTrailing) && IconTrailing}
    </AriaToggleButton>
  );
}

export interface ButtonGroupProps extends Omit<ToggleButtonGroupProps, "orientation">, RefAttributes<HTMLDivElement> {
  size?: ButtonGroupSize;
  className?: string;
}

/**
 * Segmented control: shared outer border, 1px internal dividers, single `aria-pressed` member.
 */
export function ButtonGroup({ children, size = "md", className, ...otherProps }: ButtonGroupProps) {
  return (
    <ButtonGroupContext.Provider value={{ size }}>
      <AriaToggleButtonGroup
        selectionMode="single"
        className={cx(
          "inline-flex w-max overflow-hidden rounded-md border border-border-default",
          className,
        )}
        {...otherProps}
      >
        {children}
      </AriaToggleButtonGroup>
    </ButtonGroupContext.Provider>
  );
}
