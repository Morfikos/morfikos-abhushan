"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { CurrentStaff, StaffPermission } from "@aabhushan/contracts";

import { Button } from "@/components/base/buttons/button";
import { navigationForPermissions } from "@/features/auth/navigation";
import { createQueryClient, staffMeQueryKey } from "@/lib/query-client";
import { fetchCurrentStaff, StaffApiError } from "@/lib/staff-api";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

const StaffContext = createContext<CurrentStaff | null>(null);

export function useStaff(): CurrentStaff {
  const staff = useContext(StaffContext);
  if (!staff) {
    throw new Error("useStaff must be used inside StaffShell.");
  }
  return staff;
}

export function staffHasPermission(staff: CurrentStaff, permission: StaffPermission | null): boolean {
  return permission === null || staff.permissions.includes(permission);
}

export function StaffShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const queryClientRef = useRef(createQueryClient());
  const previousStaffId = useRef<string | null>(null);
  const [staff, setStaff] = useState<CurrentStaff | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const supabase = createBrowserSupabaseClient();
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;

      if (!accessToken) {
        router.replace("/login");
        return;
      }

      try {
        const current = await fetchCurrentStaff(accessToken);
        if (cancelled) {
          return;
        }

        if (previousStaffId.current && previousStaffId.current !== current.staff_user_id) {
          queryClientRef.current.clear();
        }
        previousStaffId.current = current.staff_user_id;
        queryClientRef.current.setQueryData(staffMeQueryKey, current);
        setStaff(current);
      } catch (requestError) {
        if (cancelled) {
          return;
        }
        if (requestError instanceof StaffApiError && requestError.status === 403) {
          queryClientRef.current.clear();
          await supabase.auth.signOut();
          router.replace("/access-denied");
          return;
        }
        if (requestError instanceof StaffApiError && requestError.status === 401) {
          queryClientRef.current.clear();
          await supabase.auth.signOut();
          router.replace("/login");
          return;
        }
        setError("The staff session could not be verified. Try again.");
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function signOut() {
    const supabase = createBrowserSupabaseClient();
    queryClientRef.current.clear();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  if (error) {
    return (
      <main className="bg-primary mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-6">
        <p className="text-error-primary text-sm">{error}</p>
        <Button color="secondary" size="md" onPress={() => window.location.reload()}>
          Retry
        </Button>
      </main>
    );
  }

  if (!staff) {
    return (
      <main className="bg-primary mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
        <p className="text-tertiary text-sm">Checking staff access…</p>
      </main>
    );
  }

  const navigation = navigationForPermissions(staff.permissions);

  return (
    <QueryClientProvider client={queryClientRef.current}>
      <StaffContext.Provider value={staff}>
      <div className="bg-primary min-h-screen">
        <header className="border-secondary flex flex-wrap items-center justify-between gap-3 border-b px-6 py-4">
          <p className="text-brand-secondary text-sm font-semibold">Aabhushan</p>
          <p className="text-tertiary text-sm">
            {staff.display_name} · {staff.membership.role}
          </p>
          <Button color="secondary" size="sm" onPress={() => void signOut()}>
            Sign out
          </Button>
        </header>
        <div className="flex flex-col gap-6 px-6 py-6 lg:flex-row">
          <nav aria-label="Staff" className="flex flex-col gap-2 lg:w-52">
            {navigation.map((item) => (
              <a key={item.href} href={item.href} className="text-secondary text-sm font-medium hover:text-primary">
                {item.label}
              </a>
            ))}
          </nav>
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </div>
      </StaffContext.Provider>
    </QueryClientProvider>
  );
}
