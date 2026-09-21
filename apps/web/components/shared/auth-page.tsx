"use client";

import Image from "next/image";
import type { ReactNode } from "react";

import { cx } from "@/utils/cx";

const BRAND_PANEL_SRC = "/auth/brand-panel.jpg";

function BrandPanelBackdrop({ sizes }: { sizes: string }) {
  return (
    <>
      <Image
        src={BRAND_PANEL_SRC}
        alt=""
        fill
        priority
        sizes={sizes}
        className="object-cover object-center"
        aria-hidden
      />
      <div
        className="absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-black/20"
        aria-hidden
      />
    </>
  );
}

export function AuthPage({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-screen flex-col lg:grid lg:grid-cols-2">
      <div
        className={cx(
          "relative h-40 w-full overflow-hidden sm:h-44 lg:hidden",
          "animate-in fade-in duration-500 motion-reduce:animate-none",
        )}
      >
        <BrandPanelBackdrop sizes="100vw" />
      </div>

      <aside
        className={cx(
          "relative hidden overflow-hidden lg:block",
          "animate-in fade-in slide-in-from-left-2 duration-500 motion-reduce:animate-none",
        )}
      >
        <BrandPanelBackdrop sizes="50vw" />
      </aside>

      <div className="flex flex-1 flex-col justify-center bg-primary px-6 py-12 lg:px-12 lg:py-16">
        <div
          className={cx(
            "mx-auto flex w-full max-w-md flex-col gap-8",
            "animate-in fade-in duration-500 delay-100 motion-reduce:animate-none",
          )}
        >
          <div className="flex flex-col gap-3">
            <h1 className="text-display-xs font-semibold text-primary">{title}</h1>
            <p className="text-md text-tertiary">{description}</p>
          </div>
          <div className="flex flex-col gap-4">{children}</div>
        </div>
      </div>
    </main>
  );
}
