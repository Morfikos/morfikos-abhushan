import type { FieldError } from "@aabhushan/contracts";

export {
  ApplicationHttpError,
  configurationError,
  conflictError,
  missingOrganizationContextError,
  notFoundError,
  permissionDeniedError,
  validationError,
} from "./http-error";
export { assertPermission } from "./authorize";
export {
  createMetalRate,
  getDeviceSettings,
  getDocumentSequences,
  getReminderSettings,
  getShopProfile,
  listAuditEvents,
  listMetalRates,
  updateDeviceSettings,
  updateDocumentSequences,
  updateReminderSettings,
  updateShopProfile,
} from "./shop-settings";
export type {
  AuditWrite,
  PaginatedRows,
  PaginationInput,
  ShopSettingsRepository,
} from "./shop-settings";
export { inviteStaffMember, listStaffDirectory, suspendStaffMember } from "./staff-directory";
export type { StaffAuthInviteResult, StaffAuthInviter, StaffDirectoryRepository } from "./staff-directory";
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

export type { FieldError };
