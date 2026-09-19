import { StaffShell } from "@/features/auth/staff-shell";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

export default function StaffLayout({ children }: { children: ReactNode }) {
  return <StaffShell>{children}</StaffShell>;
}
