"use client";

import type { HTMLAttributes, ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle,
  InfoCircle,
  X,
  XCircle,
} from "@untitledui/icons";

import { cx } from "@/utils/cx";

export type AlertTone = "info" | "success" | "warning" | "error";

export type AlertProps = {
  tone?: AlertTone;
  children: ReactNode;
  /** Optional title above the body. */
  title?: ReactNode;
  /** When set, renders a dismiss control. */
  onDismiss?: () => void;
  /** Accessible label for the dismiss control. */
  dismissLabel?: string;
  className?: string;
} & Omit<HTMLAttributes<HTMLDivElement>, "children" | "className" | "title" | "role">;

const toneClass: Record<AlertTone, string> = {
  info: "bg-info-bg text-info-fg border-l-info-fg",
  success: "bg-success-bg text-success-fg border-l-success-fg",
  warning: "bg-warning-bg text-warning-fg border-l-warning-fg",
  error: "bg-error-bg text-error-fg border-l-error-fg",
};

const markClass: Record<AlertTone, string> = {
  info: "text-info-mark",
  success: "text-success-mark",
  warning: "text-warning-mark",
  error: "text-error-mark",
};

const toneIcon = {
  info: InfoCircle,
  success: CheckCircle,
  warning: AlertTriangle,
  error: XCircle,
} as const;

/**
 * Inline status alert with a 3px inset left bar. Info/success use `role="status"`;
 * warning/error use `role="alert"`.
 */
export function Alert({
  tone = "info",
  title,
  children,
  onDismiss,
  dismissLabel = "Dismiss",
  className,
  ...rest
}: AlertProps) {
  const Icon = toneIcon[tone];
  const role = tone === "warning" || tone === "error" ? "alert" : "status";

  return (
    <div
      role={role}
      className={cx(
        "flex items-start gap-2 rounded-(--radius-md) border-l-[3px] px-3 py-2.5 text-ds-sm",
        toneClass[tone],
        className,
      )}
      {...rest}
    >
      <Icon aria-hidden className={cx("mt-0.5 size-4 shrink-0", markClass[tone])} />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-medium text-ds-sm">{title}</p> : null}
        <div className={title ? "mt-0.5 text-ds-xs" : undefined}>{children}</div>
      </div>
      {onDismiss ? (
        <button
          type="button"
          aria-label={dismissLabel}
          onClick={onDismiss}
          className={cx(
            "shrink-0 rounded-(--radius-md) p-1",
            "transition-[opacity,background-color] duration-(--dur-fast) ease-(--ease)",
            "hover:bg-surface-sunken",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)",
            "disabled:pointer-events-none disabled:opacity-45",
          )}
        >
          <X aria-hidden className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}
