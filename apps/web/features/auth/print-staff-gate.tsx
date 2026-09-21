"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import type { CurrentStaff, StaffPermission } from "@aabhushan/contracts";

import { PrintDocumentSkeleton, TagPrintSkeleton } from "@/components/application/skeleton/skeleton";
import { Button } from "@/components/base/buttons/button";
import { getBrowserQueryClient } from "@/lib/query-client";
import { fetchCurrentStaff, StaffApiError } from "@/lib/staff-api";
import {
  clearStaffSessionCache,
  readStaffSessionCache,
  writeStaffSessionCache,
} from "@/lib/staff-session-cache";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

function printGateAllows(staff: CurrentStaff, pathname: string): boolean {
  const permissions = staff.permissions;
  if (pathname.startsWith("/print/tags")) {
    return permissions.includes("inventory.write");
  }
  if (pathname.startsWith("/print/invoices")) {
    return permissions.includes("billing.write");
  }
  if (pathname.startsWith("/print/receipts")) {
    return permissions.includes("payments.write") || permissions.includes("billing.write");
  }
  // Unknown print route: require any print-capable permission.
  const anyPrint: StaffPermission[] = ["inventory.write", "billing.write", "payments.write"];
  return anyPrint.some((permission) => permissions.includes(permission));
}

export function PrintStaffGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  // Always false on first paint so SSR HTML matches client hydration (no storage on server).
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useLayoutEffect(() => {
    const cached = readStaffSessionCache();
    if (cached && printGateAllows(cached, pathname)) {
      setReady(true);
    }
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const supabase = createBrowserSupabaseClient();
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken) {
        clearStaffSessionCache();
        router.replace("/login");
        return;
      }

      try {
        const staff = await fetchCurrentStaff(accessToken);
        if (cancelled) {
          return;
        }
        writeStaffSessionCache(staff);
        if (!printGateAllows(staff, pathname)) {
          router.replace("/access-denied");
          return;
        }
        setReady(true);
        setError(null);
      } catch (requestError) {
        if (cancelled) {
          return;
        }
        if (requestError instanceof StaffApiError && requestError.status === 403) {
          clearStaffSessionCache();
          await supabase.auth.signOut();
          router.replace("/access-denied");
          return;
        }
        if (requestError instanceof StaffApiError && requestError.status === 401) {
          clearStaffSessionCache();
          await supabase.auth.signOut();
          router.replace("/login");
          return;
        }
        const fallback = readStaffSessionCache();
        if (!fallback || !printGateAllows(fallback, pathname)) {
          setError("The staff session could not be verified. Try again.");
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  if (error && !ready) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 bg-white px-6 text-black">
        <p className="text-sm text-red-700">{error}</p>
        <Button color="secondary" size="md" onPress={() => window.location.reload()}>
          Retry
        </Button>
      </main>
    );
  }

  if (!ready) {
    if (pathname.startsWith("/print/tags")) {
      return <TagPrintSkeleton label="Preparing tags…" />;
    }
    return <PrintDocumentSkeleton label="Loading print view…" />;
  }

  return <QueryClientProvider client={getBrowserQueryClient()}>{children}</QueryClientProvider>;
}
