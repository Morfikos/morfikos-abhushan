"use client";

import { useRef, type KeyboardEvent, type Ref } from "react";
import type { ScanTerminator } from "@aabhushan/contracts";
import { Scan } from "@untitledui/icons";

import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";

export type ScanFieldProps = {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  terminator: ScanTerminator;
  expectedSuffix: string;
  alreadyScanned?: Set<string>;
  onScan: (payload: string) => void;
  onDuplicate?: (payload: string) => void;
  onUnexpectedSuffix?: (raw: string) => void;
  isDisabled?: boolean;
  /** Helper under the input. Pass `null` to hide; omit to use the terminator default. */
  hint?: string | null;
  placeholder?: string;
  tooltip?: string;
  inputRef?: Ref<HTMLInputElement>;
};

function terminatorKey(terminator: ScanTerminator): string | null {
  if (terminator === "Enter") {
    return "Enter";
  }
  if (terminator === "Tab") {
    return "Tab";
  }
  return null;
}

export function completeScanBuffer(input: {
  raw: string;
  expectedSuffix: string;
}): { ok: true; payload: string } | { ok: false; reason: "empty" | "unexpected_suffix"; raw: string } {
  const raw = input.raw;
  if (!raw.trim()) {
    return { ok: false, reason: "empty", raw };
  }
  if (input.expectedSuffix) {
    if (!raw.endsWith(input.expectedSuffix)) {
      return { ok: false, reason: "unexpected_suffix", raw };
    }
    const payload = raw.slice(0, -input.expectedSuffix.length).trim();
    if (!payload) {
      return { ok: false, reason: "empty", raw };
    }
    return { ok: true, payload };
  }
  return { ok: true, payload: raw.trim() };
}

export function ScanField({
  label = "Scan barcode",
  value,
  onChange,
  terminator,
  expectedSuffix,
  alreadyScanned,
  onScan,
  onDuplicate,
  onUnexpectedSuffix,
  isDisabled,
  hint,
  placeholder = "Scan barcode",
  tooltip = "This field looks up an article. It does not finalize sales.",
  inputRef,
}: ScanFieldProps) {
  const localRef = useRef<HTMLInputElement>(null);
  const resolvedRef = inputRef ?? localRef;
  const completeKey = terminatorKey(terminator);
  const terminatorHint =
    terminator === "None"
      ? "Configured terminator is None. Use Lookup after the scanner finishes."
      : `Scanner ${terminator} completes lookup. It does not finalize payment.`;
  const resolvedHint = hint === null ? undefined : (hint ?? terminatorHint);

  function finishScan() {
    const result = completeScanBuffer({ raw: value, expectedSuffix });
    if (!result.ok) {
      if (result.reason === "unexpected_suffix") {
        onUnexpectedSuffix?.(result.raw);
      }
      return;
    }
    if (alreadyScanned?.has(result.payload)) {
      onDuplicate?.(result.payload);
      return;
    }
    onScan(result.payload);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
    }
    if (completeKey && event.key === completeKey) {
      event.preventDefault();
      finishScan();
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Input
        label={label}
        value={value}
        placeholder={placeholder}
        hint={resolvedHint}
        tooltip={tooltip}
        icon={Scan}
        ref={resolvedRef}
        isDisabled={isDisabled}
        autoComplete="off"
        onChange={onChange}
        onKeyDown={onKeyDown}
      />
      {terminator === "None" ? (
        <div>
          <Button color="secondary" size="sm" isDisabled={isDisabled} onPress={finishScan}>
            Lookup
          </Button>
        </div>
      ) : null}
    </div>
  );
}
