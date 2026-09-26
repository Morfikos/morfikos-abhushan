"use client";

import type { FC, HTMLAttributes, MouseEventHandler, ReactNode } from "react";
import NextLink from "next/link";
import { ChevronDown, Share04 } from "@untitledui/icons";
import { Link as AriaLink } from "react-aria-components";

import { Badge } from "@/components/base/badges/badges";
import { isSameOriginAppPath } from "@/lib/client-navigation";
import { cx, sortCx } from "@/utils/cx";

const styles = sortCx({
    root: "group relative flex min-h-11 max-h-11 w-full cursor-pointer items-center rounded-lg bg-transparent outline-focus-ring transition duration-100 ease-linear select-none hover:bg-sidebar-item-hover focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-2",
    rootSelected: "bg-sidebar-item-active hover:bg-brand-solid_hover",
});

interface NavItemBaseProps {
    /** Whether the nav item shows only an icon. */
    iconOnly?: boolean;
    /** Whether the collapsible nav item is open. */
    open?: boolean;
    /** URL to navigate to when the nav item is clicked. */
    href?: string;
    /** Type of the nav item. */
    type: "link" | "collapsible" | "collapsible-child";
    /** Icon component to display. */
    icon?: FC<HTMLAttributes<HTMLOrSVGElement>>;
    /** Badge to display. */
    badge?: ReactNode;
    /** Whether the nav item is currently active. */
    current?: boolean;
    /** Whether to truncate the label text. */
    truncate?: boolean;
    /** Handler for click events. */
    onClick?: MouseEventHandler;
    /** Content to display. */
    children?: ReactNode;
}

export const NavItemBase = ({ current, type, badge, href, icon: Icon, children, truncate = true, onClick }: NavItemBaseProps) => {
    const iconElement = Icon && (
        <Icon
            aria-hidden="true"
            className={cx(
                "mr-2.5 size-6 shrink-0 text-sidebar-muted transition-inherit-all group-hover/item:text-sidebar",
                current && "text-white stroke-[2.25px]",
            )}
        />
    );

    const badgeElement =
        badge && (typeof badge === "string" || typeof badge === "number") ? (
            <Badge className="ml-3" color="brand" type="pill-color" size="md">
                {badge}
            </Badge>
        ) : (
            badge
        );

    const labelElement = (
        <span
            className={cx(
                "flex-1 text-md font-medium text-sidebar-muted transition-inherit-all group-hover/item:text-sidebar",
                truncate && "truncate",
                current && "font-semibold text-white",
            )}
        >
            {children}
        </span>
    );

    const isExternal = Boolean(href && href.startsWith("http"));
    const useAppLink = Boolean(href && !isExternal && isSameOriginAppPath(href));
    const externalIcon = isExternal && <Share04 className="size-5 stroke-[2.5px] text-sidebar-muted" />;

    if (type === "collapsible") {
        return (
            <summary className={cx("px-3 py-2.5", styles.root, current && styles.rootSelected)} onClick={onClick}>
                {iconElement}

                {labelElement}

                {badgeElement}

                <ChevronDown aria-hidden="true" className="ml-3 size-5 shrink-0 stroke-[2.5px] text-sidebar-muted in-open:-scale-y-100" />
            </summary>
        );
    }

    if (type === "collapsible-child") {
        const childClassName = cx("py-2.5 pr-3 pl-11", styles.root, current && styles.rootSelected);
        if (useAppLink && href) {
            return (
                <NextLink
                    href={href}
                    className={childClassName}
                    onClick={onClick}
                    aria-current={current ? "page" : undefined}
                >
                    {labelElement}
                    {badgeElement}
                </NextLink>
            );
        }
        return (
            <AriaLink
                href={href!}
                target={isExternal ? "_blank" : undefined}
                rel={isExternal ? "noopener noreferrer" : undefined}
                className={childClassName}
                onClick={onClick}
                aria-current={current ? "page" : undefined}
            >
                {labelElement}
                {externalIcon}
                {badgeElement}
            </AriaLink>
        );
    }

    const linkClassName = cx("group/item px-3 py-2.5", styles.root, current && styles.rootSelected);
    if (useAppLink && href) {
        return (
            <NextLink href={href} className={linkClassName} onClick={onClick} aria-current={current ? "page" : undefined}>
                {iconElement}
                {labelElement}
                {badgeElement}
            </NextLink>
        );
    }

    return (
        <AriaLink
            href={href!}
            target={isExternal ? "_blank" : undefined}
            rel={isExternal ? "noopener noreferrer" : undefined}
            className={linkClassName}
            onClick={onClick}
            aria-current={current ? "page" : undefined}
        >
            {iconElement}
            {labelElement}
            {externalIcon}
            {badgeElement}
        </AriaLink>
    );
};
