"use client";

import type { Key } from "react-aria-components";
import type { PaymentMethod } from "@aabhushan/contracts";

import { ButtonGroup, ButtonGroupItem } from "@/components/base/button-group/button-group";
import { Label } from "@/components/base/input/label";
import { PAYMENT_METHODS, paymentMethodLabel } from "@/lib/payment-methods";
import { cx } from "@/utils/cx";

export function MethodSelect({
  value,
  onChange,
  isDisabled = false,
  label,
  className,
}: {
  value: PaymentMethod;
  onChange: (method: PaymentMethod) => void;
  isDisabled?: boolean;
  label?: string;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      {label ? <Label>{label}</Label> : null}
      <ButtonGroup
        aria-label={label ?? "Tender method"}
        size="sm"
        selectedKeys={new Set([value])}
        disallowEmptySelection
        isDisabled={isDisabled}
        className="w-full"
        onSelectionChange={(keys) => {
          const next = [...keys][0] as Key | undefined;
          if (typeof next === "string" && PAYMENT_METHODS.includes(next as PaymentMethod)) {
            onChange(next as PaymentMethod);
          }
        }}
      >
        {PAYMENT_METHODS.map((method) => (
          <ButtonGroupItem
            key={method}
            id={method}
            className={cx(
              "flex-1 justify-center",
              "selected:bg-brand-primary selected:text-brand-secondary selected:font-semibold",
            )}
          >
            {paymentMethodLabel(method)}
          </ButtonGroupItem>
        ))}
      </ButtonGroup>
    </div>
  );
}
