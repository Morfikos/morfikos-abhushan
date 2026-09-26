"use client";

import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { CurrentStaff, StaffPermission } from "@aabhushan/contracts";
import { customerInitials, kolkataBusinessDate } from "@aabhushan/domain";
import { XClose } from "@untitledui/icons";

import type { NavItemDividerType, NavItemType } from "@/components/application/app-navigation/config";
import { StaffNavAccountCard } from "@/components/application/app-navigation/base-components/staff-nav-account-card";
import { SidebarNavigationSimple } from "@/components/application/app-navigation/sidebar-navigation/sidebar-simple";
import { StaffShellSkeleton } from "@/components/application/skeleton/skeleton";
import { StaffToastProvider } from "@/components/application/toast/staff-toast";
import { Button } from "@/components/base/buttons/button";
import { navigationForPermissions } from "@/features/auth/navigation";
import { getBrowserQueryClient, staffMeQueryKey } from "@/lib/query-client";
import {
  clearStaffSessionCache,
  readStaffSessionCache,
  writeStaffSessionCache,
} from "@/lib/staff-session-cache";
import {
  fetchCurrentStaff,
  fetchMetalRatesCoverage,
  fetchNotificationAttention,
  fetchShopProfile,
  StaffApiError,
} from "@/lib/staff-api";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

const StaffContext = createContext<CurrentStaff | null>(null);

const SIDEBAR_COLLAPSED_KEY = "aabhushan.staff.sidebarCollapsed";

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

async function staffAccessToken(): Promise<string> {
  const supabase = createBrowserSupabaseClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new StaffApiError(401, "AUTH_INVALID", "Sign in is required.");
  }
  return token;
}

export function ratesCoverageDismissKey(businessDate: string): string {
  return `staff-rates-banner-dismissed:${businessDate}`;
}

function StaffRatesBanner({ staff }: { staff: CurrentStaff }) {
  const router = useRouter();
  const pathname = usePathname();
  const canSee =
    staffHasPermission(staff, "billing.write") ||
    staffHasPermission(staff, "rates.read") ||
    staffHasPermission(staff, "rates.write");
  const businessDate = kolkataBusinessDate();
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.sessionStorage.getItem(ratesCoverageDismissKey(businessDate)) === "1";
  });

  const coverageQuery = useQuery({
    queryKey: ["shop", "rates-coverage", staff.membership.organization_id, businessDate],
    queryFn: async () => fetchMetalRatesCoverage(await staffAccessToken(), businessDate),
    enabled: canSee && !dismissed && pathname !== "/inventory/receive",
    staleTime: 60_000,
  });

  // Receive article shows its own slim rates strip; hide the shell banner there.
  if (!canSee || dismissed || pathname === "/inventory/receive") {
    return null;
  }

  const coverage = coverageQuery.data;
  if (!coverage || (coverage.gold && coverage.silver)) {
    return null;
  }

  return (
    <div
      className="sticky top-14 z-20 -mx-4 mb-4 flex flex-col gap-3 rounded-none border-b border-secondary bg-warning-primary px-4 py-3 ring-0 sm:flex-row sm:items-center sm:justify-between lg:top-0 lg:-mx-8 lg:rounded-xl lg:border-0 lg:px-8 lg:ring-1 lg:ring-secondary"
      role="status"
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold text-primary">Today’s metal rates are incomplete</p>
        <p className="text-sm text-tertiary">
          Enter today’s gold and silver rates before quoting sales
          {!coverage.gold && !coverage.silver
            ? "."
            : !coverage.gold
              ? " (gold missing)."
              : " (silver missing)."}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button color="secondary" size="sm" onPress={() => router.push("/settings?tab=rates")}>
          Open rates
        </Button>
        <Button
          color="tertiary"
          size="sm"
          iconLeading={XClose}
          aria-label="Dismiss rates reminder"
          onPress={() => {
            window.sessionStorage.setItem(ratesCoverageDismissKey(businessDate), "1");
            setDismissed(true);
          }}
        />
      </div>
    </div>
  );
}

function StaffShellChrome({ children, staff, onSignOut }: { children: ReactNode; staff: CurrentStaff; onSignOut: () => void }) {
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    try {
      return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  });
  function handleCollapsedChange(next: boolean) {
    setSidebarCollapsed(next);
    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
    } catch {
      // Ignore private-mode / blocked storage.
    }
  }

  const profileQuery = useQuery({
    queryKey: ["shop", "profile", staff.membership.organization_id],
    queryFn: async () => fetchShopProfile(await staffAccessToken()),
  });

  const canReadNotifications = staffHasPermission(staff, "notifications.read");
  const attentionQuery = useQuery({
    queryKey: ["notifications", "attention", staff.membership.organization_id],
    queryFn: async () => fetchNotificationAttention(await staffAccessToken()),
    enabled: canReadNotifications,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const notificationBadgeCount =
    (attentionQuery.data?.failed ?? 0) + (attentionQuery.data?.unknown ?? 0);

  const navigation: (NavItemType | NavItemDividerType)[] = [];
  for (const item of navigationForPermissions(staff.permissions)) {
    if (item.href === "/settings" && navigation.length > 0) {
      navigation.push({ divider: true });
    }
    navigation.push({
      label: item.label,
      href: item.href,
      icon: item.icon,
      ...(item.href === "/notifications" && notificationBadgeCount > 0
        ? { badge: notificationBadgeCount }
        : {}),
    });
  }

  return (
    <div className="bg-secondary flex min-h-screen">
      <SidebarNavigationSimple
        activeUrl={pathname}
        items={navigation}
        showAccountCard={false}
        shopLegalName={profileQuery.data?.legal_name ?? "Aabhushan"}
        shopLogoUrl={profileQuery.data?.logo_url ?? null}
        collapsed={sidebarCollapsed}
        onCollapsedChange={handleCollapsedChange}
        featureCard={(isCollapsed) => (
          <StaffNavAccountCard
            name={staff.display_name}
            email={staff.email}
            role={staff.membership.role}
            initials={customerInitials(staff.display_name)}
            onSignOut={() => void onSignOut()}
            collapsed={isCollapsed}
          />
        )}
      />
      <div className="min-w-0 flex-1 px-4 py-6 lg:px-8">
        <StaffRatesBanner staff={staff} />
        {children}
      </div>
    </div>
  );
}

export function StaffShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = getBrowserQueryClient();
  const previousStaffId = useRef<string | null>(null);
  // Always null on first paint so SSR HTML matches client hydration.
  // Session cache is applied in useLayoutEffect (before paint, after hydrate).
  const [staff, setStaff] = useState<CurrentStaff | null>(null);
  const [error, setError] = useState<string | null>(null);

  // After hydrate: restore tab session before paint (avoids blank gate without SSR mismatch).
  useLayoutEffect(() => {
    const cached = readStaffSessionCache();
    if (!cached) {
      return;
    }
    previousStaffId.current = cached.staff_user_id;
    queryClient.setQueryData(staffMeQueryKey, cached);
    setStaff(cached);
  }, [queryClient]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const supabase = createBrowserSupabaseClient();
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;

      if (!accessToken) {
        clearStaffSessionCache();
        setStaff(null);
        router.replace("/login");
        return;
      }

      try {
        const current = await fetchCurrentStaff(accessToken);
        if (cancelled) {
          return;
        }

        if (previousStaffId.current && previousStaffId.current !== current.staff_user_id) {
          queryClient.clear();
        }
        previousStaffId.current = current.staff_user_id;
        queryClient.setQueryData(staffMeQueryKey, current);
        writeStaffSessionCache(current);
        setStaff(current);
        setError(null);
      } catch (requestError) {
        if (cancelled) {
          return;
        }
        if (requestError instanceof StaffApiError && requestError.status === 403) {
          clearStaffSessionCache();
          queryClient.clear();
          setStaff(null);
          await supabase.auth.signOut();
          router.replace("/access-denied");
          return;
        }
        if (requestError instanceof StaffApiError && requestError.status === 401) {
          clearStaffSessionCache();
          queryClient.clear();
          setStaff(null);
          await supabase.auth.signOut();
          router.replace("/login");
          return;
        }
        if (!readStaffSessionCache()) {
          setError("The staff session could not be verified. Try again.");
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [queryClient, router]);

  async function signOut() {
    const supabase = createBrowserSupabaseClient();
    clearStaffSessionCache();
    queryClient.clear();
    setStaff(null);
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  if (error && !staff) {
    return (
      <QueryClientProvider client={queryClient}>
        <main className="bg-primary mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-6">
          <p className="text-error-primary text-sm">{error}</p>
          <Button color="secondary" size="md" onPress={() => window.location.reload()}>
            Retry
          </Button>
        </main>
      </QueryClientProvider>
    );
  }

  if (!staff) {
    return (
      <QueryClientProvider client={queryClient}>
        <StaffShellSkeleton pathname={pathname} />
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <StaffContext.Provider value={staff}>
        <StaffToastProvider>
          <StaffShellChrome staff={staff} onSignOut={signOut}>
            {children}
          </StaffShellChrome>
        </StaffToastProvider>
      </StaffContext.Provider>
    </QueryClientProvider>
  );
}
