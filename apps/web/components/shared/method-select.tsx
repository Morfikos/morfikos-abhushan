"use client";

import type { PaymentMethod } from "@aabhushan/contracts";
import { ChevronDown } from "@untitledui/icons";

import { Button } from "@/components/base/buttons/button";
import { Dropdown } from "@/components/base/dropdown/dropdown";
import { SegmentedField } from "@/components/shared/segmented-field";
import { PAYMENT_METHODS, paymentMethodLabel, paymentMethodOptions } from "@/lib/payment-methods";
import { cx } from "@/utils/cx";

export function MethodSelect({
  value,
  onChange,
  isDisabled = false,
  isInvalid = false,
  isRequired = false,
  label,
  hint,
  error,
  size = "sm",
  layout = "segmented",
  className,
  "aria-label": ariaLabel,
}: {
  value: PaymentMethod;
  onChange: (method: PaymentMethod) => void;
  isDisabled?: boolean;
  isInvalid?: boolean;
  isRequired?: boolean;
  label?: string;
  hint?: string;
  error?: string;
  size?: "sm" | "md";
  layout?: "segmented" | "menu";
  className?: string;
  "aria-label"?: string;
}) {
  const resolvedAria = ariaLabel ?? label ?? "Payment method";

  if (layout === "menu") {
    return (
      <div className={cx("flex w-full flex-col gap-1.5", className)}>
        <Dropdown.Root>
          <Button
            color="secondary"
            size={size}
            className="w-full justify-between"
            isDisabled={isDisabled}
            aria-label={resolvedAria}
            iconTrailing={ChevronDown}
          >
            {paymentMethodLabel(value)}
          </Button>
          <Dropdown.Popover className="w-40">
            <Dropdown.Menu
              selectionMode="single"
              selectedKeys={new Set([value])}
              onSelectionChange={(keys) => {
                const [first] = keys;
                if (typeof first === "string" && (PAYMENT_METHODS as readonly string[]).includes(first)) {
                  onChange(first as PaymentMethod);
                }
              }}
            >
              {PAYMENT_METHODS.map((method) => (
                <Dropdown.Item key={method} id={method} label={paymentMethodLabel(method)} />
              ))}
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown.Root>
      </div>
    );
  }

  return (
    <SegmentedField
      label={label}
      hint={hint}
      error={error}
      aria-label={resolvedAria}
      value={value}
      onChange={onChange}
      isDisabled={isDisabled}
      isInvalid={isInvalid}
      isRequired={isRequired}
      size={size}
      className={className}
      options={paymentMethodOptions()}
    />
  );
}
