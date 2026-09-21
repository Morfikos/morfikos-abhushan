"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { StaffPermission } from "@aabhushan/contracts";

import { staffHasPermission, useStaff } from "@/features/auth/staff-shell";

export function ModulePlaceholder({
  title,
  permission,
}: {
  title: string;
  permission: StaffPermission | null;
}) {
  const staff = useStaff();
  const router = useRouter();
  const allowed = staffHasPermission(staff, permission);

  useEffect(() => {
    if (!allowed) {
      router.replace("/access-denied");
    }
  }, [allowed, router]);

  if (!allowed) {
    return null;
  }

  return (
    <section className="flex flex-col gap-3">
      <h1 className="text-display-xs text-primary font-semibold">{title}</h1>
      <p className="text-tertiary text-md">
        This workspace area is reserved for a future module. Navigation is already limited to your role; the API still
        authorizes every request independently.
      </p>
    </section>
  );
}
