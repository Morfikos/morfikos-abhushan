"use client";

import { type ReactNode } from "react";
import { cx } from "@/utils/cx";
import { Avatar, type AvatarProps } from "./avatar";

const styles = {
    sm: { title: "text-sm ", subtitle: "text-xs" },
    md: { title: "text-sm ", subtitle: "text-sm" },
    lg: { title: "text-md ", subtitle: "text-md" },
};

interface AvatarLabelGroupProps extends AvatarProps {
    size: "sm" | "md" | "lg";
    rounded?: boolean;
    title: string | ReactNode;
    subtitle: string | ReactNode;
    avatarClassName?: string;
    /** Overrides default `text-primary` on the title. */
    titleClassName?: string;
    /** Overrides default `text-tertiary` on the subtitle. */
    subtitleClassName?: string;
}

export const AvatarLabelGroup = ({
    title,
    subtitle,
    className,
    rounded,
    avatarClassName,
    titleClassName,
    subtitleClassName,
    ...props
}: AvatarLabelGroupProps) => {
    return (
        <figure className={cx("group flex min-w-0 flex-1 items-center gap-2", className)}>
            <Avatar border rounded={rounded} className={avatarClassName} {...props} />
            <figcaption className="min-w-0 flex-1">
                <p className={cx("font-semibold text-primary", styles[props.size].title, titleClassName)}>{title}</p>
                <p className={cx("truncate text-tertiary", styles[props.size].subtitle, subtitleClassName)}>{subtitle}</p>
            </figcaption>
        </figure>
    );
};
