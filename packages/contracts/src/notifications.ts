import { z } from "zod";

export const notificationChannelSchema = z.literal("whatsapp");
export const notificationPurposeSchema = z.enum([
  "transactional_invoice",
  "transactional_receipt",
  "due_reminder",
  "girvi_reminder",
]);
export const notificationStatusSchema = z.enum([
  "pending",
  "accepted",
  "sent",
  "delivered",
  "failed",
  "unknown",
  "skipped",
]);
export const notificationRelatedTypeSchema = z.enum(["invoice", "payment", "girvi"]);

export type NotificationChannel = z.infer<typeof notificationChannelSchema>;
export type NotificationPurpose = z.infer<typeof notificationPurposeSchema>;
export type NotificationStatus = z.infer<typeof notificationStatusSchema>;
export type NotificationRelatedType = z.infer<typeof notificationRelatedTypeSchema>;

export const notificationSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  customer_id: z.string().uuid(),
  customer_display_name: z.string().min(1),
  channel: notificationChannelSchema,
  purpose: notificationPurposeSchema,
  template_name: z.string().nullable(),
  provider_message_id: z.string().nullable(),
  status: notificationStatusSchema,
  last_error_code: z.string().nullable(),
  retry_safe: z.boolean(),
  last_webhook_at: z.string().datetime({ offset: true }).nullable(),
  consent_checked_at: z.string().datetime({ offset: true }).nullable(),
  balance_checked_at: z.string().datetime({ offset: true }).nullable(),
  related_type: notificationRelatedTypeSchema.nullable(),
  related_id: z.string().uuid().nullable(),
  dedupe_key: z.string().min(1),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});

export type Notification = z.infer<typeof notificationSchema>;

export const notificationListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(25),
  status: notificationStatusSchema.optional(),
  purpose: notificationPurposeSchema.optional(),
  customer_id: z.string().uuid().optional(),
});

export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;

export const notificationListResponseSchema = z.object({
  items: z.array(notificationSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  page_size: z.number().int().positive(),
});

export type NotificationListResponse = z.infer<typeof notificationListResponseSchema>;

export const notificationRetryResponseSchema = z.object({
  notification: notificationSchema,
});

export type NotificationRetryResponse = z.infer<typeof notificationRetryResponseSchema>;

/** Sidebar attention counts — outstanding failed/unknown deliveries (not period-bounded). */
export const notificationAttentionSchema = z.object({
  failed: z.number().int().nonnegative(),
  unknown: z.number().int().nonnegative(),
});

export type NotificationAttention = z.infer<typeof notificationAttentionSchema>;

/** Human labels for staff UI — never call provider acceptance "Delivered". */
export const NOTIFICATION_STATUS_LABELS: Record<NotificationStatus, string> = {
  pending: "Pending",
  accepted: "Accepted by provider",
  sent: "Sent",
  delivered: "Delivered",
  failed: "Failed",
  unknown: "Unknown",
  skipped: "Skipped",
};
