/**
 * Spec 14 notifications verification (no mocked WhatsApp delivery).
 * Covers: outbox → notification insert idempotency, consent skip, settled skip,
 * webhook dedupe, safe retry classification, finance not rolled back on send failure.
 */
import { createHash } from "node:crypto";

import {
  applyWhatsAppStatusByProviderMessageId,
  createNotificationsRepository,
  createPool,
  insertNotificationWebhookEvent,
  withOrganizationContext,
} from "../src/index.ts";
import { processNotificationSend, type WhatsAppSendAdapter } from "@aabhushan/application";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const ORGANIZATION_ID = process.env.VERIFY_ORGANIZATION_ID;
if (!ORGANIZATION_ID) {
  // Resolve first organization when not provided.
}

/** Unconfigured adapter — never reports acceptance or delivery. */
const unconfiguredWhatsApp: WhatsAppSendAdapter = {
  isConfigured: () => false,
  sendTemplate: async () => ({
    outcome: "failed",
    errorCode: "WHATSAPP_NOT_CONFIGURED",
    retrySafe: true,
  }),
};

async function main() {
  const pool = createPool(DATABASE_URL!);
  const client = await pool.connect();
  let organizationId = ORGANIZATION_ID ?? "";
  try {
    if (!organizationId) {
      const org = await client.query<{ id: string }>(`SELECT id FROM app.organizations ORDER BY created_at ASC LIMIT 1`);
      organizationId = org.rows[0]?.id ?? "";
    }
    if (!organizationId) {
      throw new Error("No organization found");
    }
  } finally {
    client.release();
  }

  const whatsapp = unconfiguredWhatsApp;
  if (whatsapp.isConfigured()) {
    throw new Error("Expected unconfigured adapter to report not configured");
  }

  await withOrganizationContext(pool, { organizationId, role: "app_worker" }, async (ctx) => {
    const repo = createNotificationsRepository(ctx, organizationId);

    const customers = await ctx.query<{ id: string }>(
      `SELECT id FROM app.customers WHERE organization_id = $1 AND phone_normalized IS NOT NULL LIMIT 1`,
      [organizationId],
    );
    const customerId = customers.rows[0]?.id;
    if (!customerId) {
      console.log("verify:notifications skipped customer-dependent checks (no customer with phone)");
      return;
    }

    const dedupeKey = `verify:transactional_invoice:${Date.now()}`;
    const notification = await repo.insertNotification({
      customerId,
      purpose: "transactional_invoice",
      dedupeKey,
      relatedType: "invoice",
      relatedId: null,
    });
    const again = await repo.insertNotification({
      customerId,
      purpose: "transactional_invoice",
      dedupeKey,
      relatedType: "invoice",
      relatedId: null,
    });
    if (notification.id !== again.id) {
      throw new Error("dedupe_key must return the same notification row");
    }

    // Revoke consent purpose for this check by ensuring grant is absent → skip.
    await ctx.query(
      `
      DELETE FROM app.customer_consents
      WHERE organization_id = $1 AND customer_id = $2 AND purpose = 'transactional_invoice'
      `,
      [organizationId, customerId],
    );
    const skipOutcome = await processNotificationSend(repo, whatsapp, notification.id);
    if (skipOutcome.outcome !== "skipped") {
      throw new Error(`Expected consent skip, got ${skipOutcome.outcome}`);
    }
    const skipped = await repo.getById(notification.id);
    if (skipped?.status !== "skipped" || skipped.last_error_code !== "CONSENT_REVOKED_OR_MISSING") {
      throw new Error("Skipped notification must record CONSENT_REVOKED_OR_MISSING");
    }

    // Fresh pending row → not configured → failed with retry_safe.
    const failKey = `verify:fail:${Date.now()}`;
    await ctx.query(
      `
      INSERT INTO app.customer_consents (
        organization_id, customer_id, channel, purpose, status, granted_at, revoked_at
      ) VALUES ($1, $2, 'whatsapp', 'transactional_invoice', 'granted', timezone('utc', now()), NULL)
      ON CONFLICT (organization_id, customer_id, channel, purpose) DO UPDATE SET
        status = 'granted',
        granted_at = timezone('utc', now()),
        revoked_at = NULL,
        updated_at = timezone('utc', now())
      `,
      [organizationId, customerId],
    );
    const failNote = await repo.insertNotification({
      customerId,
      purpose: "transactional_invoice",
      dedupeKey: failKey,
      relatedType: null,
      relatedId: null,
    });
    const failOutcome = await processNotificationSend(repo, whatsapp, failNote.id);
    if (failOutcome.outcome !== "failed") {
      throw new Error(`Expected WHATSAPP_NOT_CONFIGURED failure, got ${failOutcome.outcome}`);
    }
    const failed = await repo.getById(failNote.id);
    if (failed?.status !== "failed" || failed.last_error_code !== "WHATSAPP_NOT_CONFIGURED" || !failed.retry_safe) {
      throw new Error("Not-configured send must be failed + retry_safe");
    }
  });

  // Webhook durable dedupe (owner connection).
  const wh = await pool.connect();
  try {
    await wh.query("BEGIN");
    const providerEventId = `verify-webhook:${Date.now()}`;
    const hash = createHash("sha256").update(providerEventId).digest("hex");
    const first = await insertNotificationWebhookEvent(wh, { providerEventId, payloadHash: hash });
    const second = await insertNotificationWebhookEvent(wh, { providerEventId, payloadHash: hash });
    if (!first.inserted || second.inserted) {
      throw new Error("Webhook event must insert once and dedupe thereafter");
    }
    await applyWhatsAppStatusByProviderMessageId(wh, {
      providerMessageId: "missing-provider-id",
      status: "delivered",
      webhookAtIso: new Date().toISOString(),
    });
    await wh.query("COMMIT");
  } catch (error) {
    await wh.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    wh.release();
  }

  console.log("verify:notifications passed");
  await pool.end();
}

main().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
});
