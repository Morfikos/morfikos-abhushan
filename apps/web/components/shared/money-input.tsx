"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import {
  formatMoneyInputDisplay,
  isMoneyShape,
  isZeroMoney,
  normalizeMoneyInput,
  sanitizeMoneyInput,
} from "@/lib/money";
import { cx } from "@/utils/cx";

function digitIndexBefore(text: string, caret: number): number {
  let count = 0;
  const end = Math.min(Math.max(caret, 0), text.length);
  for (let i = 0; i < end; i += 1) {
    const ch = text[i];
    if (ch !== undefined && ((ch >= "0" && ch <= "9") || ch === ".")) {
      count += 1;
    }
  }
  return count;
}

function caretFromDigitIndex(text: string, digitIndex: number): number {
  if (digitIndex <= 0) {
    return 0;
  }
  let count = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch !== undefined && ((ch >= "0" && ch <= "9") || ch === ".")) {
      count += 1;
      if (count >= digitIndex) {
        return i + 1;
      }
    }
  }
  return text.length;
}

function normalizeOnBlur(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === ".") {
    return null;
  }
  if (/^\d+\.$/.test(trimmed) || isMoneyShape(trimmed)) {
    const normalized = normalizeMoneyInput(trimmed);
    return normalized !== raw ? normalized : null;
  }
  return null;
}

export function MoneyInput({
  label,
  value,
  onChange,
  isDisabled = false,
  isInvalid = false,
  isRequired = false,
  hint,
  error,
  placeholder = "0.00",
  className,
  size = "md",
  fillLabel = "Due",
  onFill,
  "aria-label": ariaLabel,
  onKeyDown,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  isDisabled?: boolean;
  isInvalid?: boolean;
  isRequired?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  placeholder?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
  fillLabel?: string;
  onFill?: () => void;
  "aria-label"?: string;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
}) {
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const valueRef = useRef(value);
  const pendingCaretDigits = useRef<number | null>(null);
  const selectAllOnFocus = useRef(false);
  valueRef.current = value;
  const displayValue = focused ? value : formatMoneyInputDisplay(value);

  useLayoutEffect(() => {
    if (!focused) {
      return;
    }
    const el = inputRef.current;
    if (!el) {
      return;
    }
    if (selectAllOnFocus.current) {
      selectAllOnFocus.current = false;
      pendingCaretDigits.current = null;
      el.select();
      return;
    }
    if (pendingCaretDigits.current === null) {
      return;
    }
    const next = caretFromDigitIndex(el.value, pendingCaretDigits.current);
    pendingCaretDigits.current = null;
    el.setSelectionRange(next, next);
  }, [focused, value]);

  const resolvedHint =
    onFill || hint ? (
      <span className="flex w-full flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        {hint ? <span className="min-w-0 flex-1">{hint}</span> : <span className="min-w-0 flex-1" />}
        {onFill ? (
          <Button
            color="link-color"
            size="sm"
            className="shrink-0 px-0 font-semibold"
            isDisabled={isDisabled}
            onPress={onFill}
          >
            {fillLabel}
          </Button>
        ) : null}
      </span>
    ) : undefined;

  return (
    <div
      className={cx("flex w-full flex-col", className)}
      onFocusCapture={() => {
        if (focused) {
          return;
        }
        const el = inputRef.current;
        if (isZeroMoney(valueRef.current)) {
          selectAllOnFocus.current = true;
        } else if (el) {
          pendingCaretDigits.current = digitIndexBefore(
            el.value,
            el.selectionStart ?? el.value.length,
          );
        }
        setFocused(true);
      }}
      onBlurCapture={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
          return;
        }
        setFocused(false);
        const next = normalizeOnBlur(valueRef.current);
        if (next !== null) {
          onChange(next);
        }
      }}
    >
      <Input
        ref={inputRef}
        label={label}
        {...(label ? {} : { "aria-label": ariaLabel ?? "Amount" })}
        type="text"
        inputMode="decimal"
        size={size}
        value={displayValue}
        onChange={(next) => onChange(sanitizeMoneyInput(next))}
        onKeyDown={onKeyDown}
        isDisabled={isDisabled}
        isInvalid={isInvalid}
        isRequired={isRequired}
        placeholder={placeholder}
        hint={resolvedHint}
        error={error}
        prefix="₹"
        inputClassName="text-right tabular-nums"
      />
    </div>
  );
}
