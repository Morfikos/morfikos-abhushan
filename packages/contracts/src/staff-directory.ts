import { z } from "zod";

import { paginatedResponseSchema } from "./pagination";
import { staffInvitationStatusSchema, staffMembershipStatusSchema, staffRoleSchema } from "./staff";

export const invitibleStaffRoleSchema = z.enum(["admin", "billing", "inventory", "girvi"]);
export type InvitibleStaffRole = z.infer<typeof invitibleStaffRoleSchema>;

export const staffDirectoryItemSchema = z.object({
  id: z.string().uuid(),
  staff_user_id: z.string().uuid(),
  email: z.string().email(),
  display_name: z.string().min(1),
  role: staffRoleSchema,
  status: staffMembershipStatusSchema,
  invited_at: z.string().datetime({ offset: true }),
  accepted_at: z.string().datetime({ offset: true }).nullable(),
  suspended_at: z.string().datetime({ offset: true }).nullable(),
  invitation_status: staffInvitationStatusSchema.nullable(),
});

export const STAFF_SORT_FIELDS = ["email", "display_name", "role", "status", "invited_at"] as const;
export const staffListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(STAFF_SORT_FIELDS).default("invited_at"),
  direction: z.enum(["asc", "desc"]).default("desc"),
});
export const staffListSchema = paginatedResponseSchema(staffDirectoryItemSchema, STAFF_SORT_FIELDS);

export const staffInviteRequestSchema = z
  .object({
    email: z.string().trim().email(),
    role: invitibleStaffRoleSchema,
    display_name: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

export type StaffDirectoryItem = z.infer<typeof staffDirectoryItemSchema>;
export type StaffList = z.infer<typeof staffListSchema>;
export type StaffInviteRequest = z.infer<typeof staffInviteRequestSchema>;
