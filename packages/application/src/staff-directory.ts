import type { StaffDirectoryItem, StaffInviteRequest } from "@aabhushan/contracts";

import { assertPermission } from "./authorize";
import { conflictError, configurationError, notFoundError, validationError } from "./http-error";
import type { PaginatedRows, PaginationInput } from "./shop-settings";
import type { ResolvedStaffAccess } from "./staff-access";

export type StaffAuthInviteResult = {
  authUserId: string;
  email: string;
};

export type StaffAuthInviter = {
  inviteByEmail(input: { email: string; displayName: string; redirectTo: string }): Promise<StaffAuthInviteResult>;
};

export type StaffDirectoryRepository = {
  listStaff(input: PaginationInput): Promise<PaginatedRows<StaffDirectoryItem>>;
  findMembershipByStaffUserId(staffUserId: string): Promise<StaffDirectoryItem | null>;
  countActiveOwners(): Promise<number>;
  inviteStaff(input: {
    authUserId: string;
    email: string;
    displayName: string;
    role: StaffInviteRequest["role"];
    invitedByStaffUserId: string;
    expiresAt: Date;
  }): Promise<StaffDirectoryItem>;
  suspendMembership(staffUserId: string, at: Date): Promise<StaffDirectoryItem>;
  writeAudit(event: {
    actorStaffUserId: string | null;
    action: string;
    entityType: string;
    entityId?: string;
    reason?: string;
    payload?: Record<string, unknown>;
  }): Promise<void>;
};

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function listStaffDirectory(
  repository: StaffDirectoryRepository,
  access: ResolvedStaffAccess,
  input: PaginationInput,
): Promise<PaginatedRows<StaffDirectoryItem>> {
  assertPermission(access, "staff.manage");
  return repository.listStaff(input);
}

export async function inviteStaffMember(
  repository: StaffDirectoryRepository,
  authInviter: StaffAuthInviter | null,
  access: ResolvedStaffAccess,
  input: StaffInviteRequest,
  redirectTo: string,
  now: Date = new Date(),
): Promise<StaffDirectoryItem> {
  assertPermission(access, "staff.manage");

  if (!authInviter) {
    throw configurationError("Staff invitations need a configured Supabase secret key and custom SMTP. The invite was not sent.");
  }

  const email = input.email.trim().toLowerCase();
  let invited: StaffAuthInviteResult;
  try {
    invited = await authInviter.inviteByEmail({
      email,
      displayName: input.display_name?.trim() || email,
      redirectTo,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The invitation could not be sent.";
    throw configurationError(message);
  }

  try {
    const staff = await repository.inviteStaff({
      authUserId: invited.authUserId,
      email,
      displayName: input.display_name?.trim() || email,
      role: input.role,
      invitedByStaffUserId: access.staff_user_id,
      expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
    });
    await repository.writeAudit({
      actorStaffUserId: access.staff_user_id,
      action: "staff.invite",
      entityType: "staff_membership",
      entityId: staff.id,
      payload: { email: staff.email, role: staff.role },
    });
    return staff;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw conflictError("STAFF_EXISTS", "That email already has a membership or pending invitation.");
    }
    throw error;
  }
}

export async function suspendStaffMember(
  repository: StaffDirectoryRepository,
  access: ResolvedStaffAccess,
  staffUserId: string,
  now: Date = new Date(),
): Promise<StaffDirectoryItem> {
  assertPermission(access, "staff.manage");

  const existing = await repository.findMembershipByStaffUserId(staffUserId);
  if (!existing) {
    throw notFoundError("That staff membership was not found.");
  }

  if (existing.staff_user_id === access.staff_user_id) {
    throw validationError("You cannot suspend your own membership.");
  }

  if (existing.role === "owner" && existing.status === "active") {
    const owners = await repository.countActiveOwners();
    if (owners <= 1) {
      throw validationError("The last active owner cannot be suspended.");
    }
  }

  const suspended = await repository.suspendMembership(staffUserId, now);
  await repository.writeAudit({
    actorStaffUserId: access.staff_user_id,
    action: "staff.suspend",
    entityType: "staff_membership",
    entityId: suspended.id,
    payload: { email: suspended.email, role: suspended.role },
  });
  return suspended;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === "23505";
}
