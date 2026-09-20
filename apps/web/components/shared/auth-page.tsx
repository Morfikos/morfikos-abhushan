"use client";

import { useEffect, useState, type ReactNode } from "react";

import { ShopMark } from "@/components/shared/shop-mark";
import { fetchPublicShopBranding } from "@/lib/staff-api";

export function AuthPage({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  const [legalName, setLegalName] = useState("Aabhushan");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchPublicShopBranding()
      .then((branding) => {
        if (cancelled) {
          return;
        }
        setLegalName(branding.legal_name);
        setLogoUrl(branding.logo_url);
      })
      .catch(() => {
        // Keep product fallback when API is offline.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="bg-primary mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-16">
      <ShopMark legalName={legalName} logoUrl={logoUrl} />
      <h1 className="text-display-xs text-primary font-semibold">{title}</h1>
      <p className="text-tertiary text-md">{description}</p>
      {children}
    </main>
  );
}
