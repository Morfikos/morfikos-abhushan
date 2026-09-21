import type {
  Notification,
  NotificationAttention,
  NotificationListQuery,
  NotificationListResponse,
  NotificationPurpose,
} from "@aabhushan/contracts";

import { assertPermission } from "./authorize";
import { ApplicationHttpError, conflictError, notFoundError, validationError } from "./http-error";
import type { ResolvedStaffAccess } from "./staff-access";

export type WhatsAppSendAdapter = {
  isConfigured(): boolean;
  sendTemplate(input: {
    toE164: string;
    purpose: NotificationPurpose;
    languageCode: "en" | "hi";
    bodyParameters: string[];
  }): Promise<
    | { outcome: "accepted"; providerMessageId: string }
    | { outcome: "failed"; errorCode: string; retrySafe: boolean }
    | { outcome: "unknown"; errorCode: string }
  >;
};
export type NotificationsRepository = {
  list(input: {
    page: number;
    pageSize: number;
    status?: Notification["status"];
    purpose?: NotificationPurpose;
    customerId?: string;
  }): Promise<{ items: Notification[]; total: number }>;
  attentionCounts(): Promise<{ failed: number; unknown: number }>;
  getById(id: string): Promise<Notification | null>;
  loadSendContext(notificationId: string): Promise<{
    notification: Notification;
    phoneE164: string | null;
    consentGranted: boolean;
    balanceStillDue: boolean | null;
    accountSettled: boolean | null;
    language: "en" | "hi";
    bodyParameters: string[];
  } | null>;
  markSkipped(input: { id: string; errorCode: string }): Promise<void>;
  markAccepted(input: { id: string; providerMessageId: string; templateName: string }): Promise<void>;
  markFailed(input: { id: string; errorCode: string; retrySafe: boolean }): Promise<void>;
  markUnknown(input: { id: string; errorCode: string }): Promise<void>;
  resetForRetry(id: string): Promise<Notification | null>;
  insertNotification(input: {
    customerId: string;
    purpose: NotificationPurpose;
    dedupeKey: string;
    relatedType: "invoice" | "payment" | "girvi" | null;
    relatedId: string | null;
    templateName?: string | null;
  }): Promise<Notification>;
  insertWhatsAppOutbox(input: {
    eventKey: string;
    purpose: NotificationPurpose;
    customerId: string;
    relatedType: "invoice" | "payment" | "girvi";
    relatedId: string;
    dedupeKey: string;
  }): Promise<void>;
  claimPendingWhatsAppOutbox(limit: number): Promise<
    Array<{
      id: string;
      organizationId: string;
      eventKey: string;
      eventType: string;
      payload: {
        purpose: NotificationPurpose;
        customer_id: string;
        related_type: "invoice" | "payment" | "girvi";
        related_id: string;
        dedupe_key: string;
        template_name?: string;
      };
    }>
  >;
  markOutboxDispatched(id: string): Promise<void>;
  listDueInvoiceReminderCandidates(limit: number): Promise<
    Array<{ invoice_id: string; customer_id: string; invoice_number: string; amount_due_inr: string }>
  >;
  listGirviReminderCandidates(limit: number): Promise<
    Array<{ girvi_account_id: string; customer_id: string; account_number: string }>
  >;
  getReminderWindow(): Promise<{
    enabledInvoice: boolean;
    enabledGirvi: boolean;
    start: string;
    end: string;
    language: "en" | "hi";
  } | null>;
};

export type NotificationJobEnqueue = (input: {
  organizationId: string;
  notificationId: string;
}) => Promise<void>;

function requiresBalanceCheck(purpose: NotificationPurpose): boolean {
  return purpose === "due_reminder" || purpose === "girvi_reminder";
}

/**
 * Kolkata wall-clock check against reminder send_window_start/end (HH:MM:SS or HH:MM).
 */
export function isWithinSendWindow(now: Date, start: string, end: string, timeZone = "Asia/Kolkata"): boolean {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  const current = hour * 60 + minute;
  const parse = (value: string) => {
    const [h, m] = value.split(":").map((piece) => Number(piece));
    return (h || 0) * 60 + (m || 0);
  };
  const startMin = parse(start);
  const endMin = parse(end);
  if (startMin <= endMin) {
    return current >= startMin && current <= endMin;
  }
  return current >= startMin || current <= endMin;
}

export async function listNotifications(
  access: ResolvedStaffAccess,
  repo: NotificationsRepository,
  query: NotificationListQuery,
): Promise<NotificationListResponse> {
  assertPermission(access, "notifications.read");
  const page = query.page;
  const pageSize = query.page_size;
  const result = await repo.list({
    page,
    pageSize,
    ...(query.status ? { status: query.status } : {}),
    ...(query.purpose ? { purpose: query.purpose } : {}),
    ...(query.customer_id ? { customerId: query.customer_id } : {}),
  });
  return {
    items: result.items,
    total: result.total,
    page,
    page_size: pageSize,
  };
}

export async function getNotificationAttention(
  access: ResolvedStaffAccess,
  repo: NotificationsRepository,
): Promise<NotificationAttention> {
  assertPermission(access, "notifications.read");
  return repo.attentionCounts();
}

export async function retryNotification(
  access: ResolvedStaffAccess,
  repo: NotificationsRepository,
  notificationId: string,
): Promise<{ notification: Notification }> {
  assertPermission(access, "notifications.retry");
  const current = await repo.getById(notificationId);
  if (!current) {
    throw notFoundError("Notification not found.");
  }
  if (current.status === "unknown") {
    throw conflictError(
      "NOTIFICATION_NEEDS_RECONCILE",
      "Unknown sends must be reconciled — do not blind-resend.",
    );
  }
  if (current.status !== "failed" || !current.retry_safe) {
    throw validationError("Retry is only offered for failed notifications classified as safe to retry.", [
      { field: "id", message: "Not safely retryable." },
    ]);
  }
  if (!current.related_type || !current.related_id) {
    throw validationError("Notification is missing related resource identifiers for retry.", [
      { field: "id", message: "related_type and related_id are required." },
    ]);
  }
  const reset = await repo.resetForRetry(notificationId);
  if (!reset || reset.status !== "pending") {
    throw conflictError("NOTIFICATION_RETRY_RACE", "Notification could not be reset for retry.");
  }
  await repo.insertWhatsAppOutbox({
    eventKey: `whatsapp.retry:${reset.id}:${Date.now()}`,
    purpose: reset.purpose,
    customerId: reset.customer_id,
    relatedType: current.related_type,
    relatedId: current.related_id,
    dedupeKey: reset.dedupe_key,
  });
  return { notification: reset };
}

export async function processNotificationSend(
  repo: NotificationsRepository,
  whatsapp: WhatsAppSendAdapter,
  notificationId: string,
): Promise<{ outcome: "accepted" | "failed" | "skipped" | "unknown" }> {
  const ctx = await repo.loadSendContext(notificationId);
  if (!ctx) {
    return { outcome: "skipped" };
  }
  const { notification } = ctx;

  if (notification.status !== "pending") {
    return { outcome: "skipped" };
  }

  if (!ctx.consentGranted) {
    await repo.markSkipped({ id: notification.id, errorCode: "CONSENT_REVOKED_OR_MISSING" });
    return { outcome: "skipped" };
  }
  if (!ctx.phoneE164) {
    await repo.markSkipped({ id: notification.id, errorCode: "PHONE_MISSING" });
    return { outcome: "skipped" };
  }

  if (requiresBalanceCheck(notification.purpose)) {
    if (ctx.accountSettled) {
      await repo.markSkipped({ id: notification.id, errorCode: "ACCOUNT_SETTLED" });
      return { outcome: "skipped" };
    }
    if (ctx.balanceStillDue === false) {
      await repo.markSkipped({ id: notification.id, errorCode: "BALANCE_CLEARED" });
      return { outcome: "skipped" };
    }
  }

  if (!whatsapp.isConfigured()) {
    await repo.markFailed({
      id: notification.id,
      errorCode: "WHATSAPP_NOT_CONFIGURED",
      retrySafe: true,
    });
    return { outcome: "failed" };
  }

  const templateName =
    notification.template_name ??
    ({
      transactional_invoice: "transactional_invoice",
      transactional_receipt: "transactional_receipt",
      due_reminder: "due_reminder",
      girvi_reminder: "girvi_reminder",
    } as const)[notification.purpose];

  const result = await whatsapp.sendTemplate({
    toE164: ctx.phoneE164,
    purpose: notification.purpose,
    languageCode: ctx.language,
    bodyParameters: ctx.bodyParameters.slice(0, 3),
  });

  if (result.outcome === "accepted") {
    await repo.markAccepted({
      id: notification.id,
      providerMessageId: result.providerMessageId,
      templateName,
    });
    return { outcome: "accepted" };
  }
  if (result.outcome === "unknown") {
    await repo.markUnknown({ id: notification.id, errorCode: result.errorCode });
    return { outcome: "unknown" };
  }
  await repo.markFailed({
    id: notification.id,
    errorCode: result.errorCode,
    retrySafe: result.retrySafe,
  });
  return { outcome: "failed" };
}

export async function dispatchWhatsAppOutbox(
  repo: NotificationsRepository,
  organizationId: string,
  enqueue: NotificationJobEnqueue,
  limit = 20,
): Promise<number> {
  const events = await repo.claimPendingWhatsAppOutbox(limit);
  let enqueued = 0;
  for (const event of events) {
    try {
      const payload = event.payload;
      const notification = await repo.insertNotification({
        customerId: payload.customer_id,
        purpose: payload.purpose,
        dedupeKey: payload.dedupe_key,
        relatedType: payload.related_type,
        relatedId: payload.related_id,
        templateName: payload.template_name ?? null,
      });
      if (notification.status === "pending") {
        await enqueue({ organizationId, notificationId: notification.id });
        enqueued += 1;
      }
      await repo.markOutboxDispatched(event.id);
    } catch {
      // Leave dispatched_at null for retry.
    }
  }
  return enqueued;
}

export async function evaluateReminders(
  repo: NotificationsRepository,
  organizationId: string,
  enqueue: NotificationJobEnqueue,
  now = new Date(),
): Promise<{ created: number; skippedWindow: boolean }> {
  const window = await repo.getReminderWindow();
  if (!window) {
    return { created: 0, skippedWindow: false };
  }
  if (!window.enabledInvoice && !window.enabledGirvi) {
    return { created: 0, skippedWindow: false };
  }
  if (!isWithinSendWindow(now, window.start, window.end)) {
    return { created: 0, skippedWindow: true };
  }

  let created = 0;
  const businessDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  if (window.enabledInvoice) {
    const candidates = await repo.listDueInvoiceReminderCandidates(50);
    for (const candidate of candidates) {
      const dedupeKey = `due_reminder:${candidate.invoice_id}:${businessDate}`;
      const notification = await repo.insertNotification({
        customerId: candidate.customer_id,
        purpose: "due_reminder",
        dedupeKey,
        relatedType: "invoice",
        relatedId: candidate.invoice_id,
      });
      if (notification.status === "pending") {
        await enqueue({ organizationId, notificationId: notification.id });
        created += 1;
      }
    }
  }

  if (window.enabledGirvi) {
    const candidates = await repo.listGirviReminderCandidates(50);
    for (const candidate of candidates) {
      const dedupeKey = `girvi_reminder:${candidate.girvi_account_id}:${businessDate}`;
      const notification = await repo.insertNotification({
        customerId: candidate.customer_id,
        purpose: "girvi_reminder",
        dedupeKey,
        relatedType: "girvi",
        relatedId: candidate.girvi_account_id,
      });
      if (notification.status === "pending") {
        await enqueue({ organizationId, notificationId: notification.id });
        created += 1;
      }
    }
  }

  return { created, skippedWindow: false };
}

export function notificationRetryNotAllowedError(message: string): ApplicationHttpError {
  return new ApplicationHttpError("NOTIFICATION_RETRY_NOT_ALLOWED", message, 422);
}
