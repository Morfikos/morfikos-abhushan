import { createHmac, timingSafeEqual } from "node:crypto";

export type WhatsAppCloudConfig = {
  accessToken: string;
  phoneNumberId: string;
  appSecret: string;
  verifyToken: string;
  apiVersion: string;
  /** Template names keyed by consent purpose — required for live sends. */
  templates: {
    transactional_invoice: string;
    transactional_receipt: string;
    due_reminder: string;
    girvi_reminder: string;
  };
};

export type WhatsAppSendInput = {
  toE164: string;
  purpose: keyof WhatsAppCloudConfig["templates"];
  languageCode: "en" | "hi";
  /** Body parameters only — no private identity beyond what templates allow. */
  bodyParameters: string[];
};

export type WhatsAppSendResult =
  | { outcome: "accepted"; providerMessageId: string }
  | { outcome: "failed"; errorCode: string; retrySafe: boolean }
  | { outcome: "unknown"; errorCode: string };

export type WhatsAppWebhookStatus = {
  providerEventId: string;
  providerMessageId: string;
  status: "sent" | "delivered" | "failed" | "unknown";
  timestampIso: string;
};

export class WhatsAppNotConfiguredError extends Error {
  readonly code = "WHATSAPP_NOT_CONFIGURED";

  constructor(message = "WhatsApp Cloud API is not configured.") {
    super(message);
    this.name = "WhatsAppNotConfiguredError";
  }
}

export function parseWhatsAppCloudConfig(env: Record<string, string | undefined>): WhatsAppCloudConfig | null {
  const accessToken = env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const appSecret = env.WHATSAPP_APP_SECRET?.trim();
  const verifyToken = env.WHATSAPP_VERIFY_TOKEN?.trim();
  if (!accessToken || !phoneNumberId || !appSecret || !verifyToken) {
    return null;
  }

  return {
    accessToken,
    phoneNumberId,
    appSecret,
    verifyToken,
    apiVersion: env.WHATSAPP_API_VERSION?.trim() || "v21.0",
    templates: {
      transactional_invoice: env.WHATSAPP_TEMPLATE_INVOICE?.trim() || "transactional_invoice",
      transactional_receipt: env.WHATSAPP_TEMPLATE_RECEIPT?.trim() || "transactional_receipt",
      due_reminder: env.WHATSAPP_TEMPLATE_DUE_REMINDER?.trim() || "due_reminder",
      girvi_reminder: env.WHATSAPP_TEMPLATE_GIRVI_REMINDER?.trim() || "girvi_reminder",
    },
  };
}

export function createWhatsAppCloudAdapter(config: WhatsAppCloudConfig | null) {
  return {
    isConfigured(): boolean {
      return config !== null;
    },

    verifyWebhookChallenge(input: { mode: string | undefined; token: string | undefined; challenge: string | undefined }): string | null {
      if (!config) {
        return null;
      }
      if (input.mode !== "subscribe" || !input.token || !input.challenge) {
        return null;
      }
      if (input.token !== config.verifyToken) {
        return null;
      }
      return input.challenge;
    },

    /**
     * Meta signed payload: `sha256=<hex>` over the raw body with the app secret.
     */
    verifySignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
      if (!config || !signatureHeader) {
        return false;
      }
      const expected = createHmac("sha256", config.appSecret).update(rawBody).digest("hex");
      const provided = signatureHeader.startsWith("sha256=") ? signatureHeader.slice("sha256=".length) : signatureHeader;
      try {
        const a = Buffer.from(expected, "hex");
        const b = Buffer.from(provided, "hex");
        return a.length === b.length && timingSafeEqual(a, b);
      } catch {
        return false;
      }
    },

    async sendTemplate(input: WhatsAppSendInput): Promise<WhatsAppSendResult> {
      if (!config) {
        throw new WhatsAppNotConfiguredError();
      }

      const templateName = config.templates[input.purpose];
      const url = `https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`;
      const to = input.toE164.replace(/^\+/, "");
      const body = {
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: templateName,
          language: { code: input.languageCode === "hi" ? "hi" : "en" },
          components:
            input.bodyParameters.length > 0
              ? [
                  {
                    type: "body",
                    parameters: input.bodyParameters.map((text) => ({ type: "text", text })),
                  },
                ]
              : [],
        },
      };

      let response: Response;
      try {
        response = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
      } catch {
        return { outcome: "unknown", errorCode: "WHATSAPP_NETWORK_ERROR" };
      }

      const raw = (await response.json().catch(() => null)) as
        | { messages?: Array<{ id?: string }>; error?: { code?: number; message?: string; error_subcode?: number } }
        | null;

      if (response.ok) {
        const providerMessageId = raw?.messages?.[0]?.id;
        if (!providerMessageId) {
          return { outcome: "unknown", errorCode: "WHATSAPP_ACCEPT_WITHOUT_ID" };
        }
        return { outcome: "accepted", providerMessageId };
      }

      const code = raw?.error?.code;
      // Template / parameter rejection — do not retry-loop.
      if (response.status === 400 || code === 132000 || code === 132001 || code === 132005 || code === 132007) {
        return { outcome: "failed", errorCode: `WHATSAPP_TEMPLATE_REJECTED_${code ?? response.status}`, retrySafe: false };
      }
      if (response.status >= 500 || response.status === 429) {
        return { outcome: "unknown", errorCode: `WHATSAPP_PROVIDER_${response.status}` };
      }
      return {
        outcome: "failed",
        errorCode: `WHATSAPP_PROVIDER_${response.status}`,
        retrySafe: response.status >= 500,
      };
    },

    parseStatusWebhooks(payload: unknown): WhatsAppWebhookStatus[] {
      const root = payload as {
        entry?: Array<{
          id?: string;
          changes?: Array<{
            value?: {
              statuses?: Array<{
                id?: string;
                status?: string;
                timestamp?: string;
                errors?: unknown[];
              }>;
            };
          }>;
        }>;
      };
      const out: WhatsAppWebhookStatus[] = [];
      for (const entry of root.entry ?? []) {
        for (const change of entry.changes ?? []) {
          for (const status of change.value?.statuses ?? []) {
            if (!status.id) {
              continue;
            }
            const mapped =
              status.status === "sent"
                ? "sent"
                : status.status === "delivered" || status.status === "read"
                  ? "delivered"
                  : status.status === "failed"
                    ? "failed"
                    : "unknown";
            const ts = status.timestamp
              ? new Date(Number(status.timestamp) * 1000).toISOString()
              : new Date().toISOString();
            out.push({
              providerEventId: `${status.id}:${status.status ?? "unknown"}:${status.timestamp ?? "0"}`,
              providerMessageId: status.id,
              status: mapped,
              timestampIso: ts,
            });
          }
        }
      }
      return out;
    },
  };
}

export type WhatsAppCloudAdapter = ReturnType<typeof createWhatsAppCloudAdapter>;
