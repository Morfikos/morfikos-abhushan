"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronSelectorVertical, LogOut01 } from "@untitledui/icons";
import type { PopoverProps as AriaPopoverProps } from "react-aria-components";
import {
  Button as AriaButton,
  Dialog as AriaDialog,
  DialogTrigger as AriaDialogTrigger,
  Popover as AriaPopover,
} from "react-aria-components";

import { Avatar } from "@/components/base/avatar/avatar";
import { AvatarLabelGroup } from "@/components/base/avatar/avatar-label-group";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { cx } from "@/utils/cx";

const HOVER_CLOSE_MS = 180;

type StaffNavAccountCardProps = {
  name: string;
  email: string;
  /** Shown after email when expanded (e.g. membership role). */
  role?: string;
  initials: string;
  onSignOut: () => void;
  /** Compact avatar-only trigger for the collapsed sidebar rail. */
  collapsed?: boolean;
  className?: string;
};

export function StaffNavAccountCard({
  name,
  email,
  role,
  initials,
  onSignOut,
  collapsed = false,
  className,
}: StaffNavAccountCardProps) {
  const triggerRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDesktop = useBreakpoint("lg");
  const [isOpen, setIsOpen] = useState(false);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const openMenu = useCallback(() => {
    clearCloseTimer();
    setIsOpen(true);
  }, [clearCloseTimer]);

  const scheduleClose = useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      setIsOpen(false);
      closeTimerRef.current = null;
    }, HOVER_CLOSE_MS);
  }, [clearCloseTimer]);

  useEffect(() => () => clearCloseTimer(), [clearCloseTimer]);

  const subtitle = role ? `${email} · ${role}` : email;
  const placement: AriaPopoverProps["placement"] = collapsed
    ? "right"
    : isDesktop
      ? "right bottom"
      : "top";

  return (
    <div
      ref={triggerRef}
      className={cx("relative", className)}
      onMouseEnter={openMenu}
      onMouseLeave={scheduleClose}
    >
      <AriaDialogTrigger isOpen={isOpen} onOpenChange={setIsOpen}>
        {collapsed ? (
          <AriaButton
            aria-label={`${name}. Account menu`}
            className={cx(
              "flex cursor-pointer items-center justify-center rounded-full outline-focus-ring transition duration-100 ease-linear",
              "focus-visible:outline-2 focus-visible:outline-offset-2",
            )}
          >
            <Avatar size="sm" initials={initials} alt="" border className="ring-white/20" />
          </AriaButton>
        ) : (
          <AriaButton
            aria-label={`${name}. Account menu`}
            className={cx(
              "relative flex w-full cursor-pointer items-center gap-3 rounded-xl p-3 text-left ring-1 ring-sidebar ring-inset outline-focus-ring",
              "bg-white/5 transition duration-100 ease-linear hover:bg-sidebar-item-hover",
              "focus-visible:outline-2 focus-visible:outline-offset-2",
              "pressed:bg-sidebar-item-hover",
            )}
          >
            <AvatarLabelGroup
              size="md"
              initials={initials}
              title={name}
              subtitle={subtitle}
              alt=""
              avatarClassName="ring-white/20"
              titleClassName="text-sidebar"
              subtitleClassName="text-sidebar-muted"
            />
            <ChevronSelectorVertical className="size-4 shrink-0 stroke-[2.25px] text-sidebar-muted" aria-hidden />
          </AriaButton>
        )}
        <AriaPopover
          placement={placement}
          triggerRef={triggerRef}
          offset={placement === "top" ? 8 : 0}
          isNonModal
          className={({ isEntering, isExiting }) =>
            cx(
              "origin-(--trigger-anchor-point) will-change-transform",
              isEntering &&
                "duration-150 ease-out animate-in fade-in placement-right:slide-in-from-left-0.5 placement-top:slide-in-from-bottom-0.5 placement-bottom:slide-in-from-top-0.5",
              isExiting &&
                "duration-100 ease-in animate-out fade-out placement-right:slide-out-to-left-0.5 placement-top:slide-out-to-bottom-0.5 placement-bottom:slide-out-to-top-0.5",
            )
          }
        >
          <AriaDialog className="w-56 rounded-xl bg-primary shadow-lg ring-1 ring-secondary outline-hidden">
            <div className="p-1.5" onMouseEnter={openMenu} onMouseLeave={scheduleClose}>
              <AriaButton
                className={cx(
                  "group/item flex w-full cursor-pointer items-center gap-2 rounded-md p-2 text-sm font-semibold text-secondary outline-focus-ring",
                  "hover:bg-primary_hover hover:text-secondary_hover",
                  "focus-visible:outline-2 focus-visible:outline-offset-2",
                )}
                onPress={() => {
                  setIsOpen(false);
                  onSignOut();
                }}
              >
                <LogOut01 className="size-5 text-fg-quaternary group-hover/item:text-fg-quaternary_hover" />
                Sign out
              </AriaButton>
            </div>
          </AriaDialog>
        </AriaPopover>
      </AriaDialogTrigger>
    </div>
  );
}
