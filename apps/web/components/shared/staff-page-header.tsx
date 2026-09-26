"use client";

import type { ComponentType, ReactNode, SVGProps } from "react";

import { StaffBackLink } from "@/components/application/staff-back-link";
import { cx } from "@/utils/cx";

type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;

export type StaffPageHeaderBack = {
  label: string;
  href?: string;
  onPress?: () => void;
};

export function StaffPageHeader({
  title,
  description,
  icon: Icon,
  badge,
  actions,
  back,
  density = "default",
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: IconComponent;
  badge?: ReactNode;
  actions?: ReactNode;
  back?: StaffPageHeaderBack;
  /** `comfort` loosens gaps and bumps title/description/back for mid-aged counter screens (inventory). */
  density?: "default" | "comfort";
  className?: string;
}) {
  const comfort = density === "comfort";

  return (
    <div className={cx("flex flex-col", comfort ? "gap-3" : "gap-2", className)}>
      {back ? (
        <StaffBackLink
          label={back.label}
          href={back.href}
          onPress={back.onPress}
          size={comfort ? "md" : "sm"}
        />
      ) : null}
      <div className={cx("flex flex-wrap items-start justify-between", comfort ? "gap-4" : "gap-3")}>
        <div className={cx("flex min-w-0 flex-col", comfort ? "gap-3" : "gap-2")}>
          <div className={cx("flex flex-wrap items-center", comfort ? "gap-3" : "gap-2")}>
            {Icon ? (
              <Icon
                className={cx("shrink-0 text-primary", comfort ? "size-7" : "size-6")}
                aria-hidden
              />
            ) : null}
            <h1
              className={cx(
                "font-semibold text-primary",
                comfort ? "text-display-sm" : "text-display-xs",
              )}
            >
              {title}
            </h1>
            {badge}
          </div>
          {description ? (
            <p className={cx("text-tertiary", comfort ? "text-lg" : "text-md")}>{description}</p>
          ) : null}
        </div>
        {actions ? (
          <div className={cx("flex flex-wrap", comfort ? "gap-3" : "gap-2")}>{actions}</div>
        ) : null}
      </div>
    </div>
  );
}
