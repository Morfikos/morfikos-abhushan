import type { CurrentStaff, StaffInvitationStatus, StaffMembershipStatus, StaffRole } from "@aabhushan/contracts";
import { STAFF_PERMISSION_MAP_VERSION, permissionsForRole } from "@aabhushan/domain";

export class StaffAccessError extends Error {
  readonly code: "AUTH_INVALID" | "MEMBERSHIP_DENIED";
  readonly httpStatus: 401 | 403;

  constructor(code: "AUTH_INVALID" | "MEMBERSHIP_DENIED", message: string, httpStatus: 401 | 403) {
    super(message);
    this.name = "StaffAccessError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export function invalidAuthError(message = "The access token is invalid or expired."): StaffAccessError {
  return new StaffAccessError("AUTH_INVALID", message, 401);
}

export function membershipDeniedError(
  message = "You do not have an active staff membership.",
): StaffAccessError {
  return new StaffAccessError("MEMBERSHIP_DENIED", message, 403);
}

export type StaffMembershipRecord = {
  id: string;
  organizationId: string;
  branchId: string;
  role: StaffRole;
  status: StaffMembershipStatus;
};

export type StaffInvitationRecord = {
  id: string;
  email: string;
  status: StaffInvitationStatus;
  expiresAt: Date;
};

export type StaffUserRecord = {
  id: string;
  email: string;
  displayName: string;
  isDisabled: boolean;
  membership: StaffMembershipRecord | null;
  invitation: StaffInvitationRecord | null;
};

export type StaffAccessRepository = {
  findByAuthUserId(authUserId: string): Promise<StaffUserRecord | null>;
  activateInvitedMembership(input: {
    staffUserId: string;
    membershipId: string;
    invitationId: string;
    displayName: string;
  }): Promise<StaffUserRecord>;
};

export type ResolvedStaffAccess = CurrentStaff & {
  authUserId: string;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isInvitationAcceptable(invitation: StaffInvitationRecord, now: Date, staffEmail: string): boolean {
  return (
    invitation.status === "pending" &&
    invitation.expiresAt.getTime() > now.getTime() &&
    normalizeEmail(invitation.email) === normalizeEmail(staffEmail)
  );
}

export async function resolveStaffAccess(input: {
  repository: StaffAccessRepository;
  authUserId: string;
  tokenEmail: string | undefined;
  profileDisplayName: string | undefined;
  now?: Date;
}): Promise<ResolvedStaffAccess> {
  const now = input.now ?? new Date();
  const record = await input.repository.findByAuthUserId(input.authUserId);

  if (!record || record.isDisabled || !record.membership) {
    throw membershipDeniedError();
  }

  let activeRecord = record;

  if (record.membership.status === "invited") {
    if (!record.invitation || !isInvitationAcceptable(record.invitation, now, record.email)) {
      throw membershipDeniedError();
    }

    const displayName =
      input.profileDisplayName && input.profileDisplayName.trim().length > 0
        ? input.profileDisplayName.trim()
        : record.displayName;

    activeRecord = await input.repository.activateInvitedMembership({
      staffUserId: record.id,
      membershipId: record.membership.id,
      invitationId: record.invitation.id,
      displayName,
    });
  }

  if (!activeRecord.membership || activeRecord.membership.status !== "active" || activeRecord.isDisabled) {
    throw membershipDeniedError();
  }

  if (input.tokenEmail && normalizeEmail(input.tokenEmail) !== normalizeEmail(activeRecord.email)) {
    throw membershipDeniedError();
  }

  return {
    authUserId: activeRecord.id,
    staff_user_id: activeRecord.id,
    email: activeRecord.email,
    display_name: activeRecord.displayName,
    membership: {
      id: activeRecord.membership.id,
      organization_id: activeRecord.membership.organizationId,
      branch_id: activeRecord.membership.branchId,
      role: activeRecord.membership.role,
      status: "active",
    },
    permissions: permissionsForRole(activeRecord.membership.role),
    permission_map_version: STAFF_PERMISSION_MAP_VERSION,
  };
}

export function toCurrentStaffDto(access: ResolvedStaffAccess): CurrentStaff {
  return {
    staff_user_id: access.staff_user_id,
    email: access.email,
    display_name: access.display_name,
    membership: access.membership,
    permissions: access.permissions,
    permission_map_version: access.permission_map_version,
  };
}
