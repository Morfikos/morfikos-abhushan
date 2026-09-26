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

export function membershipStatusColor(status: StaffMembershipStatus): "success" | "blue" | "orange" {
  if (status === "active") {
    return "success";
  }
  if (status === "invited") {
    return "blue";
  }
  return "orange";
}

export function catalogueActiveBadgeColor(isActive: boolean): "success" | "gray" {
  return isActive ? "success" : "gray";
}
