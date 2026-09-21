"use client";

import type { FC, MouseEventHandler, ReactNode } from "react";
import NextLink from "next/link";
import { Pressable } from "react-aria-components";

import { Badge } from "@/components/base/badges/badges";
import { Tooltip } from "@/components/base/tooltip/tooltip";
import { isSameOriginAppPath } from "@/lib/client-navigation";
import { cx } from "@/utils/cx";

interface NavButtonProps {
    /** Whether the collapsible nav item is open. */
    open?: boolean;
    /** URL to navigate to when the button is clicked. */
    href?: string;
    /** Label text for the button. */
    label?: string;
    /** Icon component to display. */
    icon?: FC<{ className?: string }>;
    /** Whether the button is currently active. */
    current?: boolean;
    /** Optional attention badge (e.g. notification count). */
    badge?: ReactNode;
    /** Handler for click events. */
    onClick?: MouseEventHandler;
    /** Additional CSS classes to apply to the button. */
    className?: string;
    /** Placement of the tooltip. */
    tooltipPlacement?: "top" | "right" | "bottom" | "left";
    /** Content to display. */
    children?: ReactNode;
}

export const NavButton = ({
    current,
    label,
    href,
    icon: Icon,
    badge,
    className,
    tooltipPlacement = "right",
    onClick,
    children,
}: NavButtonProps) => {
    const iconOnly = !children;
    const useAppLink = Boolean(href && isSameOriginAppPath(href));

    const badgeElement =
        badge == null || badge === false ? null : typeof badge === "string" || typeof badge === "number" ? (
            <Badge
                className="absolute -right-0.5 -top-0.5 min-w-4 justify-center px-1"
                color="brand"
                type="pill-color"
                size="sm"
            >
                {badge}
            </Badge>
        ) : (
            <span className="absolute -right-0.5 -top-0.5">{badge}</span>
        );

    const classNames = cx(
        "group/item relative flex w-full cursor-pointer items-center justify-center gap-1 rounded-md bg-transparent outline-focus-ring transition duration-100 ease-linear select-none hover:bg-tertiary focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-2",
        current && "bg-brand-primary hover:bg-brand-secondary",
        iconOnly ? "size-9" : "px-2 py-1.5",
        className,
    );

    const content = (
        <>
            {Icon && (
                <Icon
                    aria-hidden="true"
                    className={cx(
                        "size-5 shrink-0 text-fg-quaternary transition-inherit-all group-hover/item:text-fg-quaternary_hover",
                        current && "text-fg-brand-primary",
                    )}
                />
            )}

            {children && (
                <span
                    className={cx(
                        "px-0.5 text-sm font-semibold transition duration-100 ease-linear group-hover/item:text-secondary_hover",
                        current && "text-brand-secondary",
                    )}
                >
                    {children}
                </span>
            )}
            {badgeElement}
        </>
    );

    return (
        <Tooltip isDisabled={!label} title={label} placement={tooltipPlacement}>
            {useAppLink && href ? (
                <NextLink
                    href={href}
                    aria-label={label}
                    aria-current={current ? "page" : undefined}
                    onClick={onClick}
                    className={classNames}
                >
                    {content}
                </NextLink>
            ) : (
                <Pressable>
                    <a
                        href={href}
                        aria-label={label}
                        aria-current={current ? "page" : undefined}
                        onClick={onClick}
                        className={classNames}
                    >
                        {content}
                    </a>
                </Pressable>
            )}
        </Tooltip>
    );
};
