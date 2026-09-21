"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

export const SIDEBAR_WIDTH_EXPANDED = 280;
export const SIDEBAR_WIDTH_COLLAPSED = 72;

type UseSidebarDragArgs = {
    collapsed: boolean;
    onCollapsedChange: (collapsed: boolean) => void;
    expandedWidth?: number;
    collapsedWidth?: number;
    enabled?: boolean;
};

export type SidebarDragHandleProps = {
    onPointerDown: (event: PointerEvent<HTMLElement>) => void;
    onPointerMove: (event: PointerEvent<HTMLElement>) => void;
    onPointerUp: (event: PointerEvent<HTMLElement>) => void;
    onPointerCancel: (event: PointerEvent<HTMLElement>) => void;
    onDoubleClick: () => void;
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
    role: "separator";
    "aria-orientation": "vertical";
    "aria-valuenow": number;
    "aria-valuemin": number;
    "aria-valuemax": number;
    "aria-label": string;
    tabIndex: number;
};

type UseSidebarDragResult = {
    widthPx: number;
    isDragging: boolean;
    isCollapsedVisual: boolean;
    handleProps: SidebarDragHandleProps;
    toggle: () => void;
};

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

export function useSidebarDrag({
    collapsed,
    onCollapsedChange,
    expandedWidth = SIDEBAR_WIDTH_EXPANDED,
    collapsedWidth = SIDEBAR_WIDTH_COLLAPSED,
    enabled = true,
}: UseSidebarDragArgs): UseSidebarDragResult {
    const midpoint = (expandedWidth + collapsedWidth) / 2;
    const restWidth = collapsed ? collapsedWidth : expandedWidth;

    const [dragWidth, setDragWidth] = useState<number | null>(null);
    const [isDragging, setIsDragging] = useState(false);

    const originLeftRef = useRef(0);
    const widthRef = useRef(restWidth);
    const bodyStyleRef = useRef<{ cursor: string; userSelect: string } | null>(null);

    widthRef.current = dragWidth ?? restWidth;

    const restoreBodyStyle = useCallback(() => {
        if (!bodyStyleRef.current || typeof document === "undefined") {
            return;
        }
        document.body.style.cursor = bodyStyleRef.current.cursor;
        document.body.style.userSelect = bodyStyleRef.current.userSelect;
        bodyStyleRef.current = null;
    }, []);

    const snapToNearest = useCallback(
        (width: number) => {
            const nextCollapsed = width < midpoint;
            onCollapsedChange(nextCollapsed);
            setDragWidth(null);
            setIsDragging(false);
            restoreBodyStyle();
        },
        [midpoint, onCollapsedChange, restoreBodyStyle],
    );

    const toggle = useCallback(() => {
        onCollapsedChange(!collapsed);
        setDragWidth(null);
        setIsDragging(false);
    }, [collapsed, onCollapsedChange]);

    useEffect(() => {
        if (!isDragging) {
            setDragWidth(null);
        }
    }, [collapsed, isDragging]);

    useEffect(() => {
        return () => {
            restoreBodyStyle();
        };
    }, [restoreBodyStyle]);

    const onPointerDown = useCallback(
        (event: PointerEvent<HTMLElement>) => {
            if (!enabled || event.button !== 0) {
                return;
            }
            event.preventDefault();
            const target = event.currentTarget;
            target.setPointerCapture(event.pointerId);

            const rail = target.closest("[data-sidebar-rail]");
            const left = rail?.getBoundingClientRect().left ?? 0;
            originLeftRef.current = left;

            bodyStyleRef.current = {
                cursor: document.body.style.cursor,
                userSelect: document.body.style.userSelect,
            };
            document.body.style.cursor = "col-resize";
            document.body.style.userSelect = "none";

            setIsDragging(true);
            const next = clamp(event.clientX - left, collapsedWidth, expandedWidth);
            widthRef.current = next;
            setDragWidth(next);
        },
        [collapsedWidth, enabled, expandedWidth],
    );

    const onPointerMove = useCallback(
        (event: PointerEvent<HTMLElement>) => {
            if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
                return;
            }
            const next = clamp(event.clientX - originLeftRef.current, collapsedWidth, expandedWidth);
            widthRef.current = next;
            setDragWidth(next);
        },
        [collapsedWidth, expandedWidth],
    );

    const onPointerUp = useCallback(
        (event: PointerEvent<HTMLElement>) => {
            if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
                return;
            }
            event.currentTarget.releasePointerCapture(event.pointerId);
            snapToNearest(widthRef.current);
        },
        [snapToNearest],
    );

    const onPointerCancel = useCallback(
        (event: PointerEvent<HTMLElement>) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
            }
            snapToNearest(widthRef.current);
        },
        [snapToNearest],
    );

    const onKeyDown = useCallback(
        (event: KeyboardEvent<HTMLElement>) => {
            if (!enabled) {
                return;
            }
            if (event.key === "ArrowLeft" || event.key === "Home") {
                event.preventDefault();
                onCollapsedChange(true);
            } else if (event.key === "ArrowRight" || event.key === "End") {
                event.preventDefault();
                onCollapsedChange(false);
            } else if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                toggle();
            }
        },
        [enabled, onCollapsedChange, toggle],
    );

    const widthPx = dragWidth ?? restWidth;
    const isCollapsedVisual = widthPx < midpoint;

    return {
        widthPx,
        isDragging,
        isCollapsedVisual,
        handleProps: {
            onPointerDown,
            onPointerMove,
            onPointerUp,
            onPointerCancel,
            onDoubleClick: toggle,
            onKeyDown,
            role: "separator",
            "aria-orientation": "vertical",
            "aria-valuenow": Math.round(widthPx),
            "aria-valuemin": collapsedWidth,
            "aria-valuemax": expandedWidth,
            "aria-label": "Resize sidebar",
            tabIndex: enabled ? 0 : -1,
        },
        toggle,
    };
}
