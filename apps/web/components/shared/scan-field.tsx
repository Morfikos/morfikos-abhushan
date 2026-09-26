"use client";

import { useRef, type KeyboardEvent, type ReactNode, type Ref } from "react";
import type { ScanTerminator } from "@aabhushan/contracts";
import { Scan } from "@untitledui/icons";

import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { cx } from "@/utils/cx";

/** Max ms between keystrokes for a scanner burst (handoff: ~30ms per character; 50ms allows slower wedges). */
const SCAN_BURST_MS = 50;

const LOOKUP_DUAL_HINT = "Scan a tag, or type and press Enter to search.";
const TERMINATOR_NONE_HINT = "Use Lookup after the scan finishes.";

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
  /**
   * When set with terminator Enter/Tab, slow Enter applies search instead of scan.
   * POS and other scan-only callers omit this.
   */
  onSearch?: (query: string) => void;
  isDisabled?: boolean;
  isInvalid?: boolean;
  /** Helper under the input. Pass `null` to hide; omit to use the terminator / dual-mode default. */
  hint?: string | null;
  /** Field-level error under the input. */
  error?: string;
  placeholder?: string;
  tooltip?: string;
  inputRef?: Ref<HTMLInputElement>;
  /** Scanner readiness shown under the field. */
  status?: "ready" | "idle";
  /** Show an in-field clear control when the value is non-empty. */
  isClearable?: boolean;
  /** Extra content under the field (e.g. scan-not-found actions). */
  footer?: ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg";
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

function resolveInputElement(ref: Ref<HTMLInputElement> | undefined): HTMLInputElement | null {
  if (!ref || typeof ref === "function") {
    return null;
  }
  return ref.current;
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
  onSearch,
  isDisabled,
  isInvalid,
  hint,
  error,
  placeholder = "Scan barcode",
  tooltip = "Looks up an article by barcode.",
  inputRef,
  status,
  isClearable = false,
  footer,
  className,
  size = "md",
}: ScanFieldProps) {
  const localRef = useRef<HTMLInputElement>(null);
  const resolvedRef = inputRef ?? localRef;
  const completeKey = terminatorKey(terminator);
  const lastKeyAt = useRef(0);
  const burstActive = useRef(false);
  const lookupMode = Boolean(onSearch) && completeKey !== null;
  const terminatorHint =
    terminator === "None"
      ? TERMINATOR_NONE_HINT
      : `Scanner ${terminator} completes lookup.`;
  const defaultHint = lookupMode ? LOOKUP_DUAL_HINT : terminatorHint;
  const forceNoneHint = terminator === "None" && hint === null;
  const resolvedHint = forceNoneHint
    ? TERMINATOR_NONE_HINT
    : hint === null
      ? undefined
      : (hint ?? defaultHint);
  const statusLabel =
    status === "ready" ? "Scanner ready" : status === "idle" ? "Waiting for scanner…" : undefined;
  const showStatus = Boolean(statusLabel) && !error;
  const showLookup = terminator === "None";

  function readRaw(): string {
    return resolveInputElement(resolvedRef)?.value ?? value;
  }

  function finishScan(rawOverride?: string) {
    const result = completeScanBuffer({ raw: rawOverride ?? readRaw(), expectedSuffix });
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

  function noteKeyTiming(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key.length !== 1 && event.key !== "Unidentified") {
      return;
    }
    const now = Date.now();
    if (lastKeyAt.current > 0 && now - lastKeyAt.current <= SCAN_BURST_MS) {
      burstActive.current = true;
    } else if (lastKeyAt.current === 0) {
      burstActive.current = false;
    } else if (now - lastKeyAt.current > SCAN_BURST_MS) {
      burstActive.current = false;
    }
    lastKeyAt.current = now;
  }

  function handleChange(next: string) {
    if (next.length === 0) {
      burstActive.current = false;
      lastKeyAt.current = 0;
    }
    onChange(next);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    noteKeyTiming(event);

    if (event.key === "Enter") {
      event.preventDefault();
    }

    const raw = readRaw();

    if (lookupMode) {
      const hasSuffix = Boolean(expectedSuffix) && raw.endsWith(expectedSuffix);
      const isBurst = burstActive.current && raw.trim().length > 0;
      const treatAsScan = isBurst || hasSuffix;

      if (completeKey && event.key === completeKey && treatAsScan) {
        event.preventDefault();
        finishScan(raw);
        burstActive.current = false;
        return;
      }
      if (event.key === "Enter" && !treatAsScan) {
        event.preventDefault();
        onSearch?.(raw.trim());
        return;
      }
      if (completeKey && event.key === completeKey && !treatAsScan) {
        return;
      }
      return;
    }

    if (completeKey && event.key === completeKey) {
      event.preventDefault();
      finishScan(raw);
    }
  }

  return (
    <div className={className ?? "flex flex-col gap-2"}>
      <Input
        label={label}
        value={value}
        placeholder={placeholder}
        hint={resolvedHint}
        error={error}
        tooltip={tooltip}
        icon={Scan}
        size={size}
        ref={resolvedRef}
        isDisabled={isDisabled}
        isInvalid={isInvalid}
        isClearable={isClearable}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        onChange={handleChange}
        onKeyDown={onKeyDown}
      />
      {error ? (
        <span className="sr-only" aria-live="polite">
          {error}
        </span>
      ) : null}
      {showStatus ? (
        <p
          className={cx(
            "flex items-center gap-2 font-medium text-secondary",
            size === "lg" ? "text-md" : "text-sm",
          )}
        >
          <span
            aria-hidden
            className={cx(
              "size-2 shrink-0 rounded-full",
              status === "ready" ? "bg-success-solid" : "bg-fg-quaternary",
            )}
          />
          {statusLabel}
        </p>
      ) : null}
      {showLookup ? (
        <div>
          <Button color="secondary" size="sm" isDisabled={isDisabled} onPress={() => finishScan()}>
            Lookup
          </Button>
        </div>
      ) : null}
      {footer}
    </div>
  );
}
