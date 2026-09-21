import { createHash } from "node:crypto";

import {
  getNotificationAttention,
  listNotifications,
  retryNotification,
} from "@aabhushan/application";
import {
  notificationListQuerySchema,
} from "@aabhushan/contracts";
import {
  applyWhatsAppStatusByProviderMessageId,
  createNotificationsRepository,
  insertNotificationWebhookEvent,
  withOrganizationContext,
  type Pool,
} from "@aabhushan/db";
import { createWhatsAppCloudAdapter, parseWhatsAppCloudConfig } from "@aabhushan/integrations";
import type { Express, NextFunction, Request, Response } from "express";

import type { StaffRequest } from "../auth/require-staff-access";
import { parsePathUuid, parseQuery, sendHandlerError } from "../http/errors";

function handle(fn: (req: StaffRequest, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    void fn(req as StaffRequest, res).catch((error: unknown) => {
      if (!sendHandlerError(req, res, error)) {
        next(error);
      }
    });
  };
}

export function registerNotificationRoutes(
  app: Express,
  pool: Pool,
  requireStaff: (req: Request, res: Response, next: NextFunction) => void,
): void {
  app.get(
    "/api/v1/notifications",
    requireStaff,
    handle(async (req, res) => {
      const query = parseQuery(notificationListQuerySchema, req);
      const result = await withOrganizationContext(
        pool,
        { organizationId: req.staffAccess.membership.organization_id },
        async (client) => {
          const repo = createNotificationsRepository(
            client,
            req.staffAccess.membership.organization_id,
          );
          return listNotifications(req.staffAccess, repo, query);
        },
      );
      res.status(200).json(result);
    }),
  );

  app.get(
    "/api/v1/notifications/attention",
    requireStaff,
    handle(async (req, res) => {
      const result = await withOrganizationContext(
        pool,
        { organizationId: req.staffAccess.membership.organization_id },
        async (client) => {
          const repo = createNotificationsRepository(
            client,
            req.staffAccess.membership.organization_id,
          );
          return getNotificationAttention(req.staffAccess, repo);
        },
      );
      res.status(200).json(result);
    }),
  );

  app.post(
    "/api/v1/notifications/:id/retry",
    requireStaff,
    handle(async (req, res) => {
      const id = parsePathUuid(req.params.id, "id");
      const result = await withOrganizationContext(
        pool,
        { organizationId: req.staffAccess.membership.organization_id },
        async (client) => {
          const repo = createNotificationsRepository(
            client,
            req.staffAccess.membership.organization_id,
          );
          return retryNotification(req.staffAccess, repo, id);
        },
      );
      res.status(200).json(result);
    }),
  );
}

/**
 * WhatsApp Cloud webhooks: signature on raw body, no staff bearer.
 * Register with express.raw before the global JSON parser for this path only.
 */
export function registerWhatsAppWebhookRoutes(app: Express, pool: Pool): void {
  const whatsapp = createWhatsAppCloudAdapter(parseWhatsAppCloudConfig(process.env));

  app.get("/api/v1/webhooks/whatsapp", (req, res) => {
    const challenge = whatsapp.verifyWebhookChallenge({
      mode: typeof req.query["hub.mode"] === "string" ? req.query["hub.mode"] : undefined,
      token: typeof req.query["hub.verify_token"] === "string" ? req.query["hub.verify_token"] : undefined,
      challenge: typeof req.query["hub.challenge"] === "string" ? req.query["hub.challenge"] : undefined,
    });
    if (challenge === null) {
      res.status(403).send("Forbidden");
      return;
    }
    res.status(200).send(challenge);
  });

  app.post("/api/v1/webhooks/whatsapp", async (req, res) => {
    const rawBody = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {}));
    const signature =
      typeof req.headers["x-hub-signature-256"] === "string"
        ? req.headers["x-hub-signature-256"]
        : undefined;

    if (!whatsapp.isConfigured() || !whatsapp.verifySignature(rawBody, signature)) {
      res.status(401).json({ code: "INVALID_SIGNATURE", message: "Webhook signature rejected." });
      return;
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody.toString("utf8"));
    } catch {
      res.status(400).json({ code: "INVALID_JSON", message: "Webhook body is not JSON." });
      return;
    }

    // Acknowledge after durable receipt of each provider event id.
    const statuses = whatsapp.parseStatusWebhooks(payload);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const status of statuses) {
        const payloadHash = createHash("sha256").update(rawBody).digest("hex");
        const { inserted } = await insertNotificationWebhookEvent(client, {
          providerEventId: status.providerEventId,
          payloadHash,
        });
        if (!inserted) {
          continue;
        }
        await applyWhatsAppStatusByProviderMessageId(client, {
          providerMessageId: status.providerMessageId,
          status: status.status,
          webhookAtIso: status.timestampIso,
        });
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      res.status(500).json({ code: "WEBHOOK_PERSIST_FAILED", message: "Could not persist webhook." });
      return;
    } finally {
      client.release();
    }

    res.status(200).json({ ok: true });
  });
}
