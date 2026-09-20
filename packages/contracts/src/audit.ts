import { z } from "zod";

import { paginatedResponseSchema } from "./pagination";

export const auditEventSchema = z.object({
  id: z.string().uuid(),
  actor_staff_user_id: z.string().uuid().nullable(),
  action: z.string().min(1),
  entity_type: z.string().min(1),
  entity_id: z.string().uuid().nullable(),
  reason: z.string().nullable(),
  payload: z.record(z.unknown()).nullable(),
  created_at: z.string().datetime({ offset: true }),
});

export const AUDIT_SORT_FIELDS = ["created_at", "action", "entity_type"] as const;
export const auditListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(AUDIT_SORT_FIELDS).default("created_at"),
  direction: z.enum(["asc", "desc"]).default("desc"),
});
export const auditListSchema = paginatedResponseSchema(auditEventSchema, AUDIT_SORT_FIELDS);

export type AuditEvent = z.infer<typeof auditEventSchema>;
export type AuditList = z.infer<typeof auditListSchema>;
