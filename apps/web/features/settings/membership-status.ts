import type { StaffMembershipStatus } from "@aabhushan/contracts";

export function membershipStatusLabel(status: StaffMembershipStatus): string {
  if (status === "invited") {
    return "Invited";
  }
  if (status === "suspended") {
    return "Suspended";
  }
  return "Active";
}

export function membershipStatusColor(status: StaffMembershipStatus): "success" | "warning" | "gray" {
  if (status === "active") {
    return "success";
  }
  if (status === "invited") {
    return "warning";
  }
  return "gray";
}
