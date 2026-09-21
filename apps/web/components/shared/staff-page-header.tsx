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
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: IconComponent;
  badge?: ReactNode;
  actions?: ReactNode;
  back?: StaffPageHeaderBack;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-col gap-2", className)}>
      {back ? <StaffBackLink label={back.label} href={back.href} onPress={back.onPress} /> : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {Icon ? <Icon className="size-6 shrink-0 text-primary" aria-hidden /> : null}
            <h1 className="text-display-xs font-semibold text-primary">{title}</h1>
            {badge}
          </div>
          {description ? <p className="text-md text-tertiary">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
