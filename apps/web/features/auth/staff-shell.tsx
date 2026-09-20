"use client";

import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { CurrentStaff, StaffPermission } from "@aabhushan/contracts";
import { customerInitials } from "@aabhushan/domain";
import { LogOut01 } from "@untitledui/icons";

import { SidebarNavigationSimple } from "@/components/application/app-navigation/sidebar-navigation/sidebar-simple";
import { Avatar } from "@/components/base/avatar/avatar";
import { Button } from "@/components/base/buttons/button";
import { Tooltip } from "@/components/base/tooltip/tooltip";
import { navigationForPermissions } from "@/features/auth/navigation";
import { createQueryClient, staffMeQueryKey } from "@/lib/query-client";
import { fetchCurrentStaff, fetchShopProfile, StaffApiError } from "@/lib/staff-api";
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

function StaffShellChrome({ children, staff, onSignOut }: { children: ReactNode; staff: CurrentStaff; onSignOut: () => void }) {
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const profileQuery = useQuery({
    queryKey: ["shop", "profile", staff.membership.organization_id],
    queryFn: async () => {
      const supabase = createBrowserSupabaseClient();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        throw new StaffApiError(401, "AUTH_INVALID", "Sign in is required.");
      }
      return fetchShopProfile(token);
    },
  });

  const navigation = navigationForPermissions(staff.permissions).map((item) => ({
    label: item.label,
    href: item.href,
    icon: item.icon,
  }));

  return (
    <div className="bg-primary flex min-h-screen">
      <SidebarNavigationSimple
        activeUrl={pathname}
        items={navigation}
        showAccountCard={false}
        shopLegalName={profileQuery.data?.legal_name ?? "Aabhushan"}
        shopLogoUrl={profileQuery.data?.logo_url ?? null}
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
        featureCard={(isCollapsed) =>
          isCollapsed ? (
            <div className="flex flex-col items-center gap-2">
              <Tooltip title={`${staff.display_name} · ${staff.membership.role}`} placement="right">
                <span className="inline-flex">
                  <Avatar size="sm" initials={customerInitials(staff.display_name)} alt="" />
                </span>
              </Tooltip>
              <Tooltip title="Sign out" placement="right">
                <Button color="secondary" size="sm" iconLeading={LogOut01} aria-label="Sign out" onPress={() => void onSignOut()} />
              </Tooltip>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div>
                <p className="text-sm font-semibold text-primary">{staff.display_name}</p>
                <p className="text-xs text-tertiary">
                  {staff.email} · {staff.membership.role}
                </p>
              </div>
              <Button color="secondary" size="sm" iconLeading={LogOut01} onPress={() => void onSignOut()}>
                Sign out
              </Button>
            </div>
          )
        }
      />
      <div className="min-w-0 flex-1 px-4 py-6 lg:px-8">{children}</div>
    </div>
  );
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

  return (
    <QueryClientProvider client={queryClientRef.current}>
      <StaffContext.Provider value={staff}>
        <StaffShellChrome staff={staff} onSignOut={signOut}>
          {children}
        </StaffShellChrome>
      </StaffContext.Provider>
    </QueryClientProvider>
  );
}
