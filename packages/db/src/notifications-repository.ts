import type {
  Notification,
  NotificationPurpose,
  NotificationRelatedType,
  NotificationStatus,
} from "@aabhushan/contracts";
import type { PoolClient } from "pg";

type NotificationRow = {
  id: string;
  organization_id: string;
  customer_id: string;
  customer_display_name: string;
  channel: "whatsapp";
  purpose: NotificationPurpose;
  template_name: string | null;
  provider_message_id: string | null;
  status: NotificationStatus;
  last_error_code: string | null;
  retry_safe: boolean;
  last_webhook_at: Date | null;
  consent_checked_at: Date | null;
  balance_checked_at: Date | null;
  related_type: NotificationRelatedType | null;
  related_id: string | null;
  dedupe_key: string;
  created_at: Date;
  updated_at: Date;
};

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function mapNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    organization_id: row.organization_id,
    customer_id: row.customer_id,
    customer_display_name: row.customer_display_name,
    channel: row.channel,
    purpose: row.purpose,
    template_name: row.template_name,
    provider_message_id: row.provider_message_id,
    status: row.status,
    last_error_code: row.last_error_code,
    retry_safe: row.retry_safe,
    last_webhook_at: toIso(row.last_webhook_at),
    consent_checked_at: toIso(row.consent_checked_at),
    balance_checked_at: toIso(row.balance_checked_at),
    related_type: row.related_type,
    related_id: row.related_id,
    dedupe_key: row.dedupe_key,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

const SELECT_NOTIFICATION = `
  SELECT
    n.id,
    n.organization_id,
    n.customer_id,
    c.display_name AS customer_display_name,
    n.channel,
    n.purpose,
    n.template_name,
    n.provider_message_id,
    n.status,
    n.last_error_code,
    n.retry_safe,
    n.last_webhook_at,
    n.consent_checked_at,
    n.balance_checked_at,
    n.related_type,
    n.related_id,
    n.dedupe_key,
    n.created_at,
    n.updated_at
  FROM app.notifications n
  INNER JOIN app.customers c ON c.id = n.customer_id AND c.organization_id = n.organization_id
`;

export type WhatsAppOutboxPayload = {
  purpose: NotificationPurpose;
  customer_id: string;
  related_type: NotificationRelatedType;
  related_id: string;
  dedupe_key: string;
  template_name?: string;
};

export type NotificationSendContext = {
  notification: Notification;
  phoneE164: string | null;
  consentGranted: boolean;
  balanceStillDue: boolean | null;
  accountSettled: boolean | null;
  language: "en" | "hi";
  bodyParameters: string[];
};

export function createNotificationsRepository(client: PoolClient, organizationId: string) {
  return {
    async claimPendingWhatsAppOutbox(limit: number) {
      const result = await client.query<{
        id: string;
        organization_id: string;
        event_key: string;
        event_type: string;
        payload: WhatsAppOutboxPayload;
      }>(
        `
        SELECT id, organization_id, event_key, event_type, payload
        FROM app.outbox_events
        WHERE organization_id = $1
          AND dispatched_at IS NULL
          AND event_type = 'whatsapp.send.requested'
        ORDER BY created_at ASC
        LIMIT $2
        FOR UPDATE SKIP LOCKED
        `,
        [organizationId, limit],
      );
      return result.rows.map((row) => ({
        id: row.id,
        organizationId: row.organization_id,
        eventKey: row.event_key,
        eventType: row.event_type,
        payload: row.payload,
      }));
    },

    async markOutboxDispatched(id: string) {
      await client.query(
        `
        UPDATE app.outbox_events
        SET dispatched_at = timezone('utc', now())
        WHERE organization_id = $1 AND id = $2
        `,
        [organizationId, id],
      );
    },

    async insertWhatsAppOutbox(input: {
      eventKey: string;
      purpose: NotificationPurpose;
      customerId: string;
      relatedType: NotificationRelatedType;
      relatedId: string;
      dedupeKey: string;
    }) {
      await client.query(
        `
        INSERT INTO app.outbox_events (organization_id, event_key, event_type, payload)
        VALUES ($1, $2, 'whatsapp.send.requested', $3::jsonb)
        ON CONFLICT (organization_id, event_key) DO NOTHING
        `,
        [
          organizationId,
          input.eventKey,
          JSON.stringify({
            purpose: input.purpose,
            customer_id: input.customerId,
            related_type: input.relatedType,
            related_id: input.relatedId,
            dedupe_key: input.dedupeKey,
          }),
        ],
      );
    },

    async insertNotification(input: {
      customerId: string;
      purpose: NotificationPurpose;
      dedupeKey: string;
      relatedType: NotificationRelatedType | null;
      relatedId: string | null;
      templateName?: string | null;
    }): Promise<Notification> {
      await client.query(
        `
        INSERT INTO app.notifications (
          organization_id, customer_id, channel, purpose, template_name,
          status, related_type, related_id, dedupe_key
        )
        VALUES ($1, $2, 'whatsapp', $3, $4, 'pending', $5, $6, $7)
        ON CONFLICT (organization_id, dedupe_key) DO NOTHING
        `,
        [
          organizationId,
          input.customerId,
          input.purpose,
          input.templateName ?? null,
          input.relatedType,
          input.relatedId,
          input.dedupeKey,
        ],
      );
      const existing = await this.getByDedupeKey(input.dedupeKey);
      if (!existing) {
        throw new Error("Notification insert failed.");
      }
      return existing;
    },

    async getById(id: string): Promise<Notification | null> {
      const result = await client.query<NotificationRow>(
        `${SELECT_NOTIFICATION} WHERE n.organization_id = $1 AND n.id = $2`,
        [organizationId, id],
      );
      const row = result.rows[0];
      return row ? mapNotification(row) : null;
    },

    async getByDedupeKey(dedupeKey: string): Promise<Notification | null> {
      const result = await client.query<NotificationRow>(
        `${SELECT_NOTIFICATION} WHERE n.organization_id = $1 AND n.dedupe_key = $2`,
        [organizationId, dedupeKey],
      );
      const row = result.rows[0];
      return row ? mapNotification(row) : null;
    },

    async list(input: {
      page: number;
      pageSize: number;
      status?: NotificationStatus;
      purpose?: NotificationPurpose;
      customerId?: string;
    }): Promise<{ items: Notification[]; total: number }> {
      const conditions = ["n.organization_id = $1"];
      const params: unknown[] = [organizationId];
      if (input.status) {
        params.push(input.status);
        conditions.push(`n.status = $${params.length}`);
      }
      if (input.purpose) {
        params.push(input.purpose);
        conditions.push(`n.purpose = $${params.length}`);
      }
      if (input.customerId) {
        params.push(input.customerId);
        conditions.push(`n.customer_id = $${params.length}`);
      }
      const where = conditions.join(" AND ");
      const count = await client.query<{ total: string }>(
        `SELECT count(*)::text AS total FROM app.notifications n WHERE ${where}`,
        params,
      );
      const offset = (input.page - 1) * input.pageSize;
      params.push(input.pageSize, offset);
      const result = await client.query<NotificationRow>(
        `
        ${SELECT_NOTIFICATION}
        WHERE ${where}
        ORDER BY n.created_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}
        `,
        params,
      );
      return {
        items: result.rows.map(mapNotification),
        total: Number(count.rows[0]?.total ?? 0),
      };
    },

    async attentionCounts(): Promise<{ failed: number; unknown: number }> {
      const result = await client.query<{ failed: string; unknown: string }>(
        `
        SELECT
          count(*) FILTER (WHERE status = 'failed')::text AS failed,
          count(*) FILTER (WHERE status = 'unknown')::text AS unknown
        FROM app.notifications
        WHERE organization_id = $1
        `,
        [organizationId],
      );
      return {
        failed: Number(result.rows[0]?.failed ?? 0),
        unknown: Number(result.rows[0]?.unknown ?? 0),
      };
    },

    async loadSendContext(notificationId: string): Promise<NotificationSendContext | null> {
      const notification = await this.getById(notificationId);
      if (!notification) {
        return null;
      }

      const customer = await client.query<{ phone_normalized: string | null }>(
        `
        SELECT phone_normalized
        FROM app.customers
        WHERE organization_id = $1 AND id = $2
        `,
        [organizationId, notification.customer_id],
      );
      const phoneE164 = customer.rows[0]?.phone_normalized ?? null;

      const consent = await client.query<{ status: string }>(
        `
        SELECT status
        FROM app.customer_consents
        WHERE organization_id = $1
          AND customer_id = $2
          AND channel = 'whatsapp'
          AND purpose = $3
        `,
        [organizationId, notification.customer_id, notification.purpose],
      );
      const consentGranted = consent.rows[0]?.status === "granted";

      const reminders = await client.query<{ language: "en" | "hi" }>(
        `
        SELECT language
        FROM app.reminder_settings
        WHERE organization_id = $1
        `,
        [organizationId],
      );
      const language = reminders.rows[0]?.language ?? "en";

      let balanceStillDue: boolean | null = null;
      let accountSettled: boolean | null = null;
      const bodyParameters: string[] = [];

      if (notification.related_type === "invoice" && notification.related_id) {
        const invoice = await client.query<{
          invoice_number: string | null;
          amount_due_inr: string;
          status: string;
        }>(
          `
          SELECT invoice_number, amount_due_inr::text, status
          FROM app.invoices
          WHERE organization_id = $1 AND id = $2
          `,
          [organizationId, notification.related_id],
        );
        const row = invoice.rows[0];
        if (row) {
          const due = Number(row.amount_due_inr);
          balanceStillDue = Number.isFinite(due) && due > 0;
          if (row.invoice_number) {
            bodyParameters.push(row.invoice_number);
          }
          if (notification.purpose === "due_reminder" || notification.purpose === "transactional_invoice") {
            bodyParameters.push(row.amount_due_inr);
          }
        } else {
          balanceStillDue = false;
        }
      }

      if (notification.related_type === "payment" && notification.related_id) {
        const payment = await client.query<{ receipt_number: string | null; amount_inr: string }>(
          `
          SELECT r.receipt_number, p.amount_inr::text
          FROM app.payments p
          LEFT JOIN app.receipts r ON r.payment_id = p.id AND r.organization_id = p.organization_id
          WHERE p.organization_id = $1 AND p.id = $2
          `,
          [organizationId, notification.related_id],
        );
        const row = payment.rows[0];
        if (row?.receipt_number) {
          bodyParameters.push(row.receipt_number);
        }
        if (row?.amount_inr) {
          bodyParameters.push(row.amount_inr);
        }
      }

      if (notification.related_type === "girvi" && notification.related_id) {
        const girvi = await client.query<{
          account_number: string | null;
          status: string;
          principal_outstanding_inr: string;
          interest_outstanding_inr: string;
        }>(
          `
          SELECT account_number, status,
            principal_outstanding_inr::text, interest_outstanding_inr::text
          FROM app.girvi_accounts
          WHERE organization_id = $1 AND id = $2
          `,
          [organizationId, notification.related_id],
        );
        const row = girvi.rows[0];
        if (row) {
          accountSettled = row.status === "settled" || row.status === "released";
          const principal = Number(row.principal_outstanding_inr);
          const interest = Number(row.interest_outstanding_inr);
          balanceStillDue = !accountSettled && (principal > 0 || interest > 0);
          if (row.account_number) {
            bodyParameters.push(row.account_number);
          }
        } else {
          accountSettled = true;
          balanceStillDue = false;
        }
      }

      return {
        notification,
        phoneE164,
        consentGranted,
        balanceStillDue,
        accountSettled,
        language,
        bodyParameters,
      };
    },

    async markSkipped(input: { id: string; errorCode: string }) {
      await client.query(
        `
        UPDATE app.notifications
        SET status = 'skipped',
            last_error_code = $3,
            consent_checked_at = timezone('utc', now()),
            balance_checked_at = timezone('utc', now()),
            retry_safe = false,
            updated_at = timezone('utc', now())
        WHERE organization_id = $1 AND id = $2
        `,
        [organizationId, input.id, input.errorCode],
      );
    },

    async markAccepted(input: {
      id: string;
      providerMessageId: string;
      templateName: string;
    }) {
      await client.query(
        `
        UPDATE app.notifications
        SET status = 'accepted',
            provider_message_id = $3,
            template_name = $4,
            last_error_code = NULL,
            retry_safe = false,
            consent_checked_at = timezone('utc', now()),
            balance_checked_at = timezone('utc', now()),
            updated_at = timezone('utc', now())
        WHERE organization_id = $1 AND id = $2
        `,
        [organizationId, input.id, input.providerMessageId, input.templateName],
      );
    },

    async markFailed(input: { id: string; errorCode: string; retrySafe: boolean }) {
      await client.query(
        `
        UPDATE app.notifications
        SET status = 'failed',
            last_error_code = $3,
            retry_safe = $4,
            consent_checked_at = timezone('utc', now()),
            balance_checked_at = timezone('utc', now()),
            updated_at = timezone('utc', now())
        WHERE organization_id = $1 AND id = $2
        `,
        [organizationId, input.id, input.errorCode, input.retrySafe],
      );
    },

    async markUnknown(input: { id: string; errorCode: string }) {
      await client.query(
        `
        UPDATE app.notifications
        SET status = 'unknown',
            last_error_code = $3,
            retry_safe = false,
            consent_checked_at = timezone('utc', now()),
            balance_checked_at = timezone('utc', now()),
            updated_at = timezone('utc', now())
        WHERE organization_id = $1 AND id = $2
        `,
        [organizationId, input.id, input.errorCode],
      );
    },

    async resetForRetry(id: string): Promise<Notification | null> {
      await client.query(
        `
        UPDATE app.notifications
        SET status = 'pending',
            last_error_code = NULL,
            retry_safe = false,
            updated_at = timezone('utc', now())
        WHERE organization_id = $1 AND id = $2 AND status = 'failed' AND retry_safe = true
        `,
        [organizationId, id],
      );
      return this.getById(id);
    },

    async listDueInvoiceReminderCandidates(limit: number) {
      const result = await client.query<{
        invoice_id: string;
        customer_id: string;
        invoice_number: string;
        amount_due_inr: string;
      }>(
        `
        SELECT i.id AS invoice_id, i.customer_id, i.invoice_number, i.amount_due_inr::text
        FROM app.invoices i
        INNER JOIN app.reminder_settings rs ON rs.organization_id = i.organization_id
        WHERE i.organization_id = $1
          AND rs.invoice_due_reminders_enabled = true
          AND i.status = 'finalized'
          AND i.amount_due_inr > 0
          AND EXISTS (
            SELECT 1 FROM app.customer_consents cc
            WHERE cc.organization_id = i.organization_id
              AND cc.customer_id = i.customer_id
              AND cc.channel = 'whatsapp'
              AND cc.purpose = 'due_reminder'
              AND cc.status = 'granted'
          )
        ORDER BY i.business_date ASC, i.created_at ASC
        LIMIT $2
        `,
        [organizationId, limit],
      );
      return result.rows;
    },

    async listGirviReminderCandidates(limit: number) {
      const result = await client.query<{
        girvi_account_id: string;
        customer_id: string;
        account_number: string;
      }>(
        `
        SELECT g.id AS girvi_account_id, g.customer_id, g.account_number
        FROM app.girvi_accounts g
        INNER JOIN app.reminder_settings rs ON rs.organization_id = g.organization_id
        WHERE g.organization_id = $1
          AND rs.girvi_reminders_enabled = true
          AND g.status = 'active'
          AND (g.principal_outstanding_inr > 0 OR g.interest_outstanding_inr > 0)
          AND EXISTS (
            SELECT 1 FROM app.customer_consents cc
            WHERE cc.organization_id = g.organization_id
              AND cc.customer_id = g.customer_id
              AND cc.channel = 'whatsapp'
              AND cc.purpose = 'girvi_reminder'
              AND cc.status = 'granted'
          )
        ORDER BY g.maturity_business_date ASC NULLS LAST, g.created_at ASC
        LIMIT $2
        `,
        [organizationId, limit],
      );
      return result.rows;
    },

    async getReminderWindow(): Promise<{
      enabledInvoice: boolean;
      enabledGirvi: boolean;
      start: string;
      end: string;
      language: "en" | "hi";
    } | null> {
      const result = await client.query<{
        girvi_reminders_enabled: boolean;
        invoice_due_reminders_enabled: boolean;
        send_window_start: string;
        send_window_end: string;
        language: "en" | "hi";
      }>(
        `
        SELECT girvi_reminders_enabled, invoice_due_reminders_enabled,
          send_window_start::text, send_window_end::text, language
        FROM app.reminder_settings
        WHERE organization_id = $1
        `,
        [organizationId],
      );
      const row = result.rows[0];
      if (!row) {
        return null;
      }
      return {
        enabledInvoice: row.invoice_due_reminders_enabled,
        enabledGirvi: row.girvi_reminders_enabled,
        start: row.send_window_start,
        end: row.send_window_end,
        language: row.language,
      };
    },
  };
}

export type NotificationsRepository = ReturnType<typeof createNotificationsRepository>;

/** Privileged webhook helpers (no org RLS role). Connecting role must own/bypass. */
export async function insertNotificationWebhookEvent(
  client: PoolClient,
  input: { providerEventId: string; payloadHash: string; organizationId?: string | null },
): Promise<{ inserted: boolean }> {
  const result = await client.query(
    `
    INSERT INTO app.notification_webhook_events (
      organization_id, provider, provider_event_id, payload_hash
    )
    VALUES ($1, 'whatsapp_cloud', $2, $3)
    ON CONFLICT (provider, provider_event_id) DO NOTHING
    RETURNING id
    `,
    [input.organizationId ?? null, input.providerEventId, input.payloadHash],
  );
  return { inserted: (result.rowCount ?? 0) > 0 };
}

export async function applyWhatsAppStatusByProviderMessageId(
  client: PoolClient,
  input: {
    providerMessageId: string;
    status: "sent" | "delivered" | "failed" | "unknown";
    webhookAtIso: string;
  },
): Promise<{ organizationId: string | null; notificationId: string | null }> {
  const found = await client.query<{ id: string; organization_id: string; status: NotificationStatus }>(
    `
    SELECT id, organization_id, status
    FROM app.notifications
    WHERE provider_message_id = $1
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [input.providerMessageId],
  );
  const row = found.rows[0];
  if (!row) {
    return { organizationId: null, notificationId: null };
  }

  // Do not regress delivered → sent, or corrupt history with out-of-order webhooks.
  const rank: Record<NotificationStatus, number> = {
    pending: 0,
    accepted: 1,
    sent: 2,
    delivered: 3,
    failed: 4,
    unknown: 4,
    skipped: 0,
  };
  const next = input.status;
  if (rank[next] < rank[row.status] && row.status !== "failed" && row.status !== "unknown") {
    return { organizationId: row.organization_id, notificationId: row.id };
  }

  await client.query(
    `
    UPDATE app.notifications
    SET status = $2,
        last_webhook_at = $3::timestamptz,
        updated_at = timezone('utc', now())
    WHERE id = $1
    `,
    [row.id, next, input.webhookAtIso],
  );
  return { organizationId: row.organization_id, notificationId: row.id };
}

export async function listOrganizationsNeedingWhatsAppDispatch(client: PoolClient): Promise<string[]> {
  const result = await client.query<{ organization_id: string }>(
    `
    SELECT DISTINCT organization_id
    FROM app.outbox_events
    WHERE dispatched_at IS NULL AND event_type = 'whatsapp.send.requested'
    `,
  );
  return result.rows.map((row) => row.organization_id);
}

export async function listOrganizationsForReminders(client: PoolClient): Promise<string[]> {
  const result = await client.query<{ organization_id: string }>(
    `
    SELECT organization_id
    FROM app.reminder_settings
    WHERE girvi_reminders_enabled = true OR invoice_due_reminders_enabled = true
    `,
  );
  return result.rows.map((row) => row.organization_id);
}
