"use client";

import type { CSSProperties, ReactNode } from "react";
import { ChevronLeft } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { Tooltip } from "@/components/base/tooltip/tooltip";
import { ShopMark } from "@/components/shared/shop-mark";
import { isStaffNavActive } from "@/features/auth/navigation";
import {
    SIDEBAR_WIDTH_EXPANDED,
    useSidebarDrag,
} from "@/hooks/use-sidebar-drag";
import { cx } from "@/utils/cx";
import { MobileNavigationHeader } from "../base-components/mobile-header";
import { NavAccountCard } from "../base-components/nav-account-card";
import { NavItemBase } from "../base-components/nav-item";
import { NavList } from "../base-components/nav-list";
import type { NavItemDividerType, NavItemType } from "../config";

function collectNavHrefs(items: (NavItemType | NavItemDividerType)[]): string[] {
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

interface SidebarNavigationProps {
    /** URL of the currently active item. */
    activeUrl?: string;
    /** List of items to display. */
    items: (NavItemType | NavItemDividerType)[];
    /** List of footer items to display. */
    footerItems?: (NavItemType | NavItemDividerType)[];
    /** Feature card to display. May be a node or a function of the rail collapse state. */
    featureCard?: ReactNode | ((collapsed: boolean) => ReactNode);
    /** Whether to show the account card. */
    showAccountCard?: boolean;
    /** Whether to hide the right-edge chrome (shadow / handle highlight). */
    hideBorder?: boolean;
    /** Additional CSS classes to apply to the sidebar. */
    className?: string;
    /** Whether to round the account card avatar. */
    avatarRounded?: boolean;
    /** Shop legal name for the header mark. */
    shopLegalName?: string;
    /** Short-lived shop logo URL. */
    shopLogoUrl?: string | null;
    /** Desktop icon-rail mode. Ignored for the mobile drawer (always expanded). */
    collapsed?: boolean;
    /** Called when the desktop collapse control is pressed or drag snaps. */
    onCollapsedChange?: (collapsed: boolean) => void;
}

export const SidebarNavigationSimple = ({
    activeUrl,
    items,
    footerItems = [],
    featureCard,
    showAccountCard = true,
    hideBorder = false,
    className,
    shopLegalName = "Aabhushan",
    shopLogoUrl = null,
    collapsed = false,
    onCollapsedChange,
}: SidebarNavigationProps) => {
    const collapseEnabled = typeof onCollapsedChange === "function";
    const drag = useSidebarDrag({
        collapsed,
        onCollapsedChange: onCollapsedChange ?? (() => undefined),
        enabled: collapseEnabled,
    });

    const desktopWidth = collapseEnabled ? drag.widthPx : SIDEBAR_WIDTH_EXPANDED;
    const isCollapsedVisual = collapseEnabled ? drag.isCollapsedVisual : false;
    const allHrefs = [...collectNavHrefs(items), ...collectNavHrefs(footerItems)];

    const widthStyle = { "--width": `${desktopWidth}px` } as CSSProperties;
    const widthTransitionClass = cx(
        "transition-[width] duration-300 ease-in-out motion-reduce:transition-none",
        drag.isDragging && "transition-none",
    );

    const renderContent = (isCollapsed: boolean, options?: { desktop?: boolean }) => {
        const isDesktop = options?.desktop === true;

        return (
            <aside
                data-sidebar-rail={isDesktop ? "" : undefined}
                style={isDesktop ? widthStyle : undefined}
                className={cx(
                    "relative flex h-full w-full max-w-full flex-col justify-between overflow-x-hidden overflow-y-auto bg-sidebar pt-4 lg:pt-5",
                    isDesktop && "lg:w-(--width)",
                    isDesktop && widthTransitionClass,
                    className,
                )}
            >
                <div className={cx("flex flex-col gap-5", isCollapsed ? "px-2" : "px-4 lg:px-5")}>
                    <div className={cx("flex items-center gap-2", isCollapsed ? "flex-col" : "justify-between")}>
                        {isCollapsed ? (
                            <Tooltip title={shopLegalName} placement="right">
                                <span className="inline-flex">
                                    <ShopMark
                                        legalName={shopLegalName}
                                        logoUrl={shopLogoUrl}
                                        showName={false}
                                        size="sm"
                                        variant="onDark"
                                    />
                                </span>
                            </Tooltip>
                        ) : (
                            <ShopMark legalName={shopLegalName} logoUrl={shopLogoUrl} showName variant="onDark" />
                        )}
                        {collapseEnabled ? (
                            <Button
                                color="tertiary"
                                size="sm"
                                aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                                aria-expanded={!collapsed}
                                iconLeading={(props: { className?: string }) => (
                                    <ChevronLeft
                                        {...props}
                                        className={cx(
                                            props.className,
                                            "transition-transform duration-300 ease-in-out motion-reduce:transition-none",
                                            isCollapsed && "rotate-180",
                                        )}
                                    />
                                )}
                                onPress={drag.toggle}
                                className={cx(
                                    "text-sidebar-muted hover:bg-sidebar-item-hover hover:text-sidebar data-loading:bg-sidebar-item-hover",
                                    "*:data-icon:text-sidebar-muted hover:*:data-icon:text-sidebar",
                                    isCollapsed ? undefined : "max-lg:hidden",
                                )}
                            />
                        ) : null}
                    </div>
                </div>

                <NavList activeUrl={activeUrl} items={items} collapsed={isCollapsed} />

                <div className={cx("mt-auto flex flex-col gap-3 py-4 lg:py-5", isCollapsed ? "items-center px-2" : "px-4")}>
                    {footerItems.length > 0 ? (
                        <ul
                            className={cx(
                                "flex flex-col overflow-hidden transition-[opacity,max-height] duration-300 ease-in-out motion-reduce:transition-none",
                                isCollapsed ? "max-h-0 opacity-0" : "max-h-96 opacity-100",
                            )}
                            aria-hidden={isCollapsed}
                        >
                            {footerItems.map((item, index) => {
                                if ("divider" in item && item.divider) {
                                    return (
                                        <li key={`footer-divider-${index}`} className="w-full px-0.5 py-2">
                                            <hr className="h-px w-full border-none bg-border-sidebar" />
                                        </li>
                                    );
                                }
                                return (
                                    <li key={item.label} className="py-px">
                                        <NavItemBase
                                            badge={item.badge}
                                            icon={item.icon}
                                            href={item.href}
                                            type="link"
                                            current={Boolean(
                                                activeUrl && item.href && isStaffNavActive(activeUrl, item.href, allHrefs),
                                            )}
                                        >
                                            {item.label}
                                        </NavItemBase>
                                    </li>
                                );
                            })}
                        </ul>
                    ) : null}

                    {typeof featureCard === "function" ? featureCard(isCollapsed) : featureCard}

                    {showAccountCard ? (
                        <div
                            className={cx(
                                "overflow-hidden transition-[opacity,max-height] duration-300 ease-in-out motion-reduce:transition-none",
                                isCollapsed ? "max-h-0 opacity-0" : "max-h-40 opacity-100",
                            )}
                            aria-hidden={isCollapsed}
                        >
                            <NavAccountCard />
                        </div>
                    ) : null}
                </div>

                {isDesktop && collapseEnabled ? (
                    <div
                        {...drag.handleProps}
                        className={cx(
                            "absolute inset-y-0 right-0 z-10 w-2 translate-x-1/2 cursor-col-resize touch-none outline-focus-ring",
                            "hover:bg-white/10 focus-visible:outline-2 focus-visible:-outline-offset-2",
                            drag.isDragging && "bg-white/15",
                        )}
                    />
                ) : null}
            </aside>
        );
    };

    return (
        <>
            {/* Mobile header navigation — always expanded labels */}
            <MobileNavigationHeader shopLegalName={shopLegalName} shopLogoUrl={shopLogoUrl}>
                {renderContent(false)}
            </MobileNavigationHeader>

            {/* Desktop sidebar navigation — cast on wrapper (aside overflow clips shadow). */}
            <div
                className={cx(
                    "relative hidden bg-sidebar lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex",
                    !hideBorder &&
                        (drag.isDragging
                            ? "shadow-(--shadow-sidebar-rail-dragging)"
                            : "shadow-(--shadow-sidebar-rail)"),
                )}
            >
                {renderContent(isCollapsedVisual, { desktop: true })}
                {!hideBorder ? (
                    <div
                        aria-hidden
                        className={cx(
                            "pointer-events-none absolute inset-y-0 left-full w-8",
                            "bg-linear-to-r from-black/20 via-black/7 to-transparent",
                            drag.isDragging && "from-black/28 via-black/10",
                        )}
                    />
                ) : null}
            </div>

            {/* Placeholder to take up physical space because the real sidebar has `fixed` position. */}
            <div
                style={{ width: desktopWidth }}
                className={cx(
                    "invisible hidden shrink-0 lg:sticky lg:top-0 lg:bottom-0 lg:left-0 lg:block",
                    widthTransitionClass,
                )}
                aria-hidden
            />
        </>
    );
};
