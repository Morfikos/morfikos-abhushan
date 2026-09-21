"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { Button } from "@/components/base/buttons/button";
import { fetchCurrentStaff, StaffApiError } from "@/lib/staff-api";
import {
  clearStaffSessionCache,
  readStaffSessionCache,
  writeStaffSessionCache,
} from "@/lib/staff-session-cache";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

export function PrintStaffGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const cached = readStaffSessionCache();
    if (cached?.permissions.includes("inventory.write")) {
      setReady(true);
    }

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
        if (!staff.permissions.includes("inventory.write")) {
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
        if (!readStaffSessionCache()?.permissions.includes("inventory.write")) {
          setError("The staff session could not be verified. Try again.");
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [router]);

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
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center bg-white px-6 text-black">
        <p className="text-sm">Checking staff access…</p>
      </main>
    );
  }

  return <>{children}</>;
}
