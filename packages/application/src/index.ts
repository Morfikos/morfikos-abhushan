/**
 * Server-only application services. Do not import this package from the Next.js frontend.
 */
export const applicationPackage = "application" as const;

export {
  invalidAuthError,
  membershipDeniedError,
  resolveStaffAccess,
  StaffAccessError,
  toCurrentStaffDto,
} from "./staff-access";
export type {
  ResolvedStaffAccess,
  StaffAccessRepository,
  StaffInvitationRecord,
  StaffMembershipRecord,
  StaffUserRecord,
} from "./staff-access";
