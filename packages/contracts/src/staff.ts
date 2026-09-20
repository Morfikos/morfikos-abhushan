import { z } from "zod";

export const staffRoleSchema = z.enum(["owner", "admin", "billing", "inventory", "girvi"]);
export const staffMembershipStatusSchema = z.enum(["invited", "active", "suspended"]);
export const staffInvitationStatusSchema = z.enum(["pending", "accepted", "expired", "revoked"]);
export const staffPermissionSchema = z.enum([
  "staff.manage",
  "settings.write",
  "rates.read",
  "rates.write",
  "inventory.read",
  "inventory.write",
  "billing.write",
  "payments.write",
  "refunds.approve",
  "customers.read",
  "customers.write",
  "girvi.write",
  "girvi.release",
  "identity_documents.read",
  "reports.read",
  "audit.read",
]);

export type StaffRole = z.infer<typeof staffRoleSchema>;
export type StaffMembershipStatus = z.infer<typeof staffMembershipStatusSchema>;
export type StaffInvitationStatus = z.infer<typeof staffInvitationStatusSchema>;
export type StaffPermission = z.infer<typeof staffPermissionSchema>;

export const currentStaffMembershipSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  branch_id: z.string().uuid(),
  role: staffRoleSchema,
  status: z.literal("active"),
});

export const currentStaffSchema = z.object({
  staff_user_id: z.string().uuid(),
  email: z.string().email(),
  display_name: z.string().min(1),
  membership: currentStaffMembershipSchema,
  permissions: z.array(staffPermissionSchema),
  permission_map_version: z.number().int().positive(),
});

export const sessionIntrospectionSchema = z.object({
  active: z.literal(true),
  staff_user_id: z.string().uuid(),
  organization_id: z.string().uuid(),
  branch_id: z.string().uuid(),
  role: staffRoleSchema,
});

export type CurrentStaff = z.infer<typeof currentStaffSchema>;
export type SessionIntrospection = z.infer<typeof sessionIntrospectionSchema>;

export const PUBLIC_SELF_SIGNUP_ENABLED = false;
