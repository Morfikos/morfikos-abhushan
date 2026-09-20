"use client";

import type { ComponentPropsWithRef } from "react";
import { createContext, useContext } from "react";

import { cx } from "@/utils/cx";

interface RootContextProps {
    size?: "sm" | "md" | "lg";
}

const RootContext = createContext<RootContextProps>({ size: "lg" });

interface RootProps extends ComponentPropsWithRef<"div">, RootContextProps {}

const Root = ({ size = "lg", className, ...props }: RootProps) => {
    return (
        <RootContext.Provider value={{ size }}>
            <div {...props} className={cx("flex w-full max-w-lg flex-col items-center justify-center text-center", className)} />
        </RootContext.Provider>
    );
};

interface HeaderProps extends ComponentPropsWithRef<"div"> {
    pattern?: "none" | "circle";
    patternSize?: "sm" | "md" | "lg";
}

const Header = ({ pattern: _pattern = "none", patternSize: _patternSize, className, ...props }: HeaderProps) => {
    return <div {...props} className={cx("relative flex flex-col items-center", className)} />;
};

const Content = ({ className, ...props }: ComponentPropsWithRef<"div">) => {
    const { size } = useContext(RootContext);
    return <div {...props} className={cx("z-10 flex flex-col items-center", size === "lg" ? "gap-2" : "gap-1", className)} />;
};

const Title = ({ className, ...props }: ComponentPropsWithRef<"h1">) => {
    const { size } = useContext(RootContext);
    return (
        <h1
            {...props}
            className={cx("text-primary font-semibold", size === "lg" ? "text-display-xs" : "text-lg", className)}
        />
    );
};

const Description = ({ className, ...props }: ComponentPropsWithRef<"p">) => {
    return <p {...props} className={cx("text-tertiary text-sm", className)} />;
};

const Footer = ({ className, ...props }: ComponentPropsWithRef<"div">) => {
    return <div {...props} className={cx("z-10 mt-6 flex flex-wrap items-center justify-center gap-3", className)} />;
};

const EmptyState = Root as typeof Root & {
    Title: typeof Title;
    Header: typeof Header;
    Footer: typeof Footer;
    Content: typeof Content;
    Description: typeof Description;
};

EmptyState.Title = Title;
EmptyState.Header = Header;
EmptyState.Footer = Footer;
EmptyState.Content = Content;
EmptyState.Description = Description;

export { EmptyState };
