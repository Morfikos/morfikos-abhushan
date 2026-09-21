"use client";

import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { Tooltip } from "@/components/base/tooltip/tooltip";
import { ShopMark } from "@/components/shared/shop-mark";
import { isStaffNavActive } from "@/features/auth/navigation";
import { cx } from "@/utils/cx";
import { MobileNavigationHeader } from "../base-components/mobile-header";
import { NavAccountCard } from "../base-components/nav-account-card";
import { NavItemBase } from "../base-components/nav-item";
import { NavList } from "../base-components/nav-list";
import type { NavItemType } from "../config";

const EXPANDED_SIDEBAR_WIDTH = 280;
const COLLAPSED_SIDEBAR_WIDTH = 72;

function collectNavHrefs(items: NavItemType[]): string[] {
    const hrefs: string[] = [];
    for (const item of items) {
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
    items: NavItemType[];
    /** List of footer items to display. */
    footerItems?: NavItemType[];
    /** Feature card to display. May be a node or a function of the rail collapse state. */
    featureCard?: ReactNode | ((collapsed: boolean) => ReactNode);
    /** Whether to show the account card. */
    showAccountCard?: boolean;
    /** Whether to hide the right side border. */
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
    /** Called when the desktop collapse control is pressed. */
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
    const desktopWidth = collapsed ? COLLAPSED_SIDEBAR_WIDTH : EXPANDED_SIDEBAR_WIDTH;
    const allHrefs = [...collectNavHrefs(items), ...collectNavHrefs(footerItems)];

    const renderContent = (isCollapsed: boolean) => (
        <aside
            style={
                {
                    "--width": `${isCollapsed ? COLLAPSED_SIDEBAR_WIDTH : EXPANDED_SIDEBAR_WIDTH}px`,
                } as React.CSSProperties
            }
            className={cx(
                "flex h-full w-full max-w-full flex-col justify-between overflow-auto bg-sidebar pt-4 lg:w-(--width) lg:pt-5",
                !hideBorder && "border-secondary md:border-r",
                className,
            )}
        >
            <div className={cx("flex flex-col gap-5", isCollapsed ? "px-2" : "px-4 lg:px-5")}>
                <div className={cx("flex items-center gap-2", isCollapsed ? "flex-col" : "justify-between")}>
                    {isCollapsed ? (
                        <Tooltip title={shopLegalName} placement="right">
                            <span className="inline-flex">
                                <ShopMark legalName={shopLegalName} logoUrl={shopLogoUrl} showName={false} size="sm" />
                            </span>
                        </Tooltip>
                    ) : (
                        <ShopMark legalName={shopLegalName} logoUrl={shopLogoUrl} />
                    )}
                    {onCollapsedChange ? (
                        <Button
                            color="tertiary"
                            size="sm"
                            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                            iconLeading={isCollapsed ? ChevronRight : ChevronLeft}
                            onPress={() => onCollapsedChange(!isCollapsed)}
                            className={cx(isCollapsed ? undefined : "max-lg:hidden")}
                        />
                    ) : null}
                </div>
            </div>

            <NavList activeUrl={activeUrl} items={items} collapsed={isCollapsed} />

            <div className={cx("mt-auto flex flex-col gap-3 py-4 lg:py-5", isCollapsed ? "items-center px-2" : "px-4")}>
                {footerItems.length > 0 && !isCollapsed ? (
                    <ul className="flex flex-col">
                        {footerItems.map((item) => (
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
                        ))}
                    </ul>
                ) : null}

                {typeof featureCard === "function" ? featureCard(isCollapsed) : featureCard}

                {showAccountCard && !isCollapsed ? <NavAccountCard /> : null}
            </div>
        </aside>
    );

    return (
        <>
            {/* Mobile header navigation — always expanded labels */}
            <MobileNavigationHeader shopLegalName={shopLegalName} shopLogoUrl={shopLogoUrl}>
                {renderContent(false)}
            </MobileNavigationHeader>

            {/* Desktop sidebar navigation */}
            <div className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:flex">{renderContent(collapsed)}</div>

            {/* Placeholder to take up physical space because the real sidebar has `fixed` position. */}
            <div
                style={{
                    paddingLeft: desktopWidth,
                }}
                className="invisible hidden lg:sticky lg:top-0 lg:bottom-0 lg:left-0 lg:block"
            />
        </>
    );
};
