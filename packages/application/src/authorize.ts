import type { StaffPermission } from "@aabhushan/contracts";
import { roleHasPermission } from "@aabhushan/domain";

import { permissionDeniedError } from "./http-error";
import type { ResolvedStaffAccess } from "./staff-access";

export function assertPermission(access: ResolvedStaffAccess, permission: StaffPermission): void {
  if (!roleHasPermission(access.membership.role, permission)) {
    throw permissionDeniedError();
  }
}
