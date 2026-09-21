"use client";

import { ArrowLeft } from "@untitledui/icons";

import { Button } from "@/components/base/buttons/button";

type StaffBackLinkProps = {
  label: string;
  href?: string;
  onPress?: () => void;
};

/**
 * Header back control for staff detail and form pages.
 * Prefer `href` for predictable list/parent navigation; use `onPress` when
 * leaving must run discard confirmation first.
 */
export function StaffBackLink({ label, href, onPress }: StaffBackLinkProps) {
  if (onPress) {
    return (
      <Button color="link-gray" size="sm" iconLeading={ArrowLeft} className="self-start px-0" onPress={onPress}>
        {label}
      </Button>
    );
  }

  if (!href) {
    throw new Error("StaffBackLink requires href or onPress.");
  }

  return (
    <Button color="link-gray" size="sm" iconLeading={ArrowLeft} className="self-start px-0" href={href}>
      {label}
    </Button>
  );
}
