"use client";

import { isStaffNavActive } from "@/features/auth/navigation";
import { cx } from "@/utils/cx";
import type { NavItemDividerType, NavItemType } from "../config";
import { NavButton } from "./nav-button";
import { NavItemBase } from "./nav-item";

interface NavListProps {
    /** URL of the currently active item. */
    activeUrl?: string;
    /** Additional CSS classes to apply to the list. */
    className?: string;
    /** List of items to display. */
    items: (NavItemType | NavItemDividerType)[];
    /** When true, flat links render as icon-only buttons with tooltips. */
    collapsed?: boolean;
}

function collectHrefs(items: (NavItemType | NavItemDividerType)[]): string[] {
    const hrefs: string[] = [];
    for (const item of items) {
        if ("divider" in item && item.divider) {
            continue;
        }
        if (item.href) {
            hrefs.push(item.href);
        }
        for (const child of item.items ?? []) {
            if (child.href) {
                hrefs.push(child.href);
            }
        }
    }
    return hrefs;
}

export const NavList = ({ activeUrl, items, className, collapsed = false }: NavListProps) => {
    const allHrefs = collectHrefs(items);
    const pathname = activeUrl ?? "";
    const activeItem = items.find((item) => {
        if ("divider" in item && item.divider) {
            return false;
        }
        if (item.href && isStaffNavActive(pathname, item.href, allHrefs)) {
            return true;
        }
        return item.items?.some((subItem) => subItem.href && isStaffNavActive(pathname, subItem.href, allHrefs));
    });

    return (
        <ul className={cx("flex flex-col pt-5", collapsed ? "items-center px-2" : "px-4", className)}>
            {items.map((item, index) => {
                if (item.divider) {
                    return (
                        <li key={index} className="w-full px-0.5 py-2">
                            <hr className="h-px w-full border-none bg-border-secondary" />
                        </li>
                    );
                }

                if (item.items?.length) {
                    return (
                        <details key={item.label} open={activeItem?.href === item.href} className="appearance-none py-0.25">
                            <NavItemBase href={item.href} badge={item.badge} icon={item.icon} type="collapsible">
                                {item.label}
                            </NavItemBase>

                            <dd>
                                <ul className="pb-1">
                                    {item.items.map((childItem) => (
                                        <li key={childItem.label} className="py-0.25">
                                            <NavItemBase
                                                href={childItem.href}
                                                badge={childItem.badge}
                                                type="collapsible-child"
                                                current={Boolean(
                                                    childItem.href && isStaffNavActive(pathname, childItem.href, allHrefs),
                                                )}
                                            >
                                                {childItem.label}
                                            </NavItemBase>
                                        </li>
                                    ))}
                                </ul>
                            </dd>
                        </details>
                    );
                }

                const current = Boolean(item.href && isStaffNavActive(pathname, item.href, allHrefs));

                if (collapsed) {
                    return (
                        <li key={item.label} className="py-px">
                            <NavButton
                                label={item.label}
                                icon={item.icon}
                                href={item.href}
                                current={current}
                                badge={item.badge}
                                tooltipPlacement="right"
                            />
                        </li>
                    );
                }

                return (
                    <li key={item.label} className="py-px">
                        <NavItemBase type="link" badge={item.badge} icon={item.icon} href={item.href} current={current}>
                            {item.label}
                        </NavItemBase>
                    </li>
                );
            })}
        </ul>
    );
};
