import {
  createNotificationsRepository,
  listOrganizationsForReminders,
  listOrganizationsNeedingWhatsAppDispatch,
  withOrganizationContext,
} from "@aabhushan/db";
import {
  dispatchWhatsAppOutbox,
  evaluateReminders,
  processNotificationSend,
} from "@aabhushan/application";
import { createWhatsAppCloudAdapter, parseWhatsAppCloudConfig } from "@aabhushan/integrations";
import { createRequire } from "node:module";
import type { Logger } from "pino";
import type { Pool } from "pg";

const require = createRequire(import.meta.url);
const PgBoss = require("pg-boss") as typeof import("pg-boss");

const QUEUE_SEND = "notification.send";
const QUEUE_DISPATCH = "notification.outbox.dispatch";
const QUEUE_REMINDERS = "notification.reminders.evaluate";

type SendJob = {
  organizationId: string;
  notificationId: string;
};

export async function startNotificationJobs(
  databaseUrl: string,
  pool: Pool,
  logger: Logger,
): Promise<{ stop: () => Promise<void>; enqueueSend: (job: SendJob) => Promise<void> }> {
  const whatsapp = createWhatsAppCloudAdapter(parseWhatsAppCloudConfig(process.env));
  if (!whatsapp.isConfigured()) {
    logger.warn(
      "WhatsApp Cloud API env is not configured; notification jobs will mark sends as failed (WHATSAPP_NOT_CONFIGURED) instead of simulating delivery",
    );
  }

  const boss = new PgBoss({
    connectionString: databaseUrl,
    schema: "pgboss",
    deleteAfterSeconds: 60 * 60 * 24 * 7,
    archiveCompletedAfterSeconds: 60 * 60,
    max: 4,
  });

  boss.on("error", (error: Error) => {
    logger.error({ err: error }, "pg-boss error");
  });

  await boss.start();
  logger.info("pg-boss started (schema pgboss)");

  await boss.createQueue(QUEUE_SEND, { name: QUEUE_SEND, policy: "singleton" });
  await boss.createQueue(QUEUE_DISPATCH, { name: QUEUE_DISPATCH });
  await boss.createQueue(QUEUE_REMINDERS, { name: QUEUE_REMINDERS });

  const enqueueSend = async (job: SendJob) => {
    await boss.send(QUEUE_SEND, job, {
      singletonKey: job.notificationId,
      retryLimit: 0,
      expireInSeconds: 60 * 60,
    });
  };

  await boss.work<SendJob>(QUEUE_SEND, { batchSize: 1 }, async (jobs) => {
    for (const job of jobs) {
      const data = job.data;
      await withOrganizationContext(
        pool,
        { organizationId: data.organizationId, role: "app_worker" },
        async (client) => {
          const repo = createNotificationsRepository(client, data.organizationId);
          const outcome = await processNotificationSend(repo, whatsapp, data.notificationId);
          logger.info(
            { notification_id: data.notificationId, organization_id: data.organizationId, outcome },
            "notification send processed",
          );
        },
      );
    }
  });

  await boss.work(QUEUE_DISPATCH, async () => {
    const client = await pool.connect();
    let orgIds: string[] = [];
    try {
      orgIds = await listOrganizationsNeedingWhatsAppDispatch(client);
    } finally {
      client.release();
    }
    for (const organizationId of orgIds) {
      await withOrganizationContext(pool, { organizationId, role: "app_worker" }, async (ctx) => {
        const repo = createNotificationsRepository(ctx, organizationId);
        const count = await dispatchWhatsAppOutbox(repo, organizationId, enqueueSend);
        if (count > 0) {
          logger.info({ organization_id: organizationId, enqueued: count }, "whatsapp outbox dispatched");
        }
      });
    }
  });

  await boss.work(QUEUE_REMINDERS, async () => {
    const client = await pool.connect();
    let orgIds: string[] = [];
    try {
      orgIds = await listOrganizationsForReminders(client);
    } finally {
      client.release();
    }
    for (const organizationId of orgIds) {
      await withOrganizationContext(pool, { organizationId, role: "app_worker" }, async (ctx) => {
        const repo = createNotificationsRepository(ctx, organizationId);
        const result = await evaluateReminders(repo, organizationId, enqueueSend);
        if (result.created > 0 || result.skippedWindow) {
          logger.info(
            {
              organization_id: organizationId,
              created: result.created,
              skipped_window: result.skippedWindow,
            },
            "reminder evaluation",
          );
        }
      });
    }
  });

  await boss.schedule(QUEUE_DISPATCH, "*/1 * * * *", {}, { tz: "Asia/Kolkata" });
  await boss.schedule(QUEUE_REMINDERS, "*/5 * * * *", {}, { tz: "Asia/Kolkata" });
  await boss.send(QUEUE_DISPATCH, {});
  await boss.send(QUEUE_REMINDERS, {});

  return {
    enqueueSend,
    stop: async () => {
      await boss.stop({ graceful: true, timeout: 10_000 });
    },
  };
}
