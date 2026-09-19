import type { ServerEnv } from "@aabhushan/config/server";
import type { Logger } from "pino";

export function startWorker(env: ServerEnv, logger: Logger): { stop: (signal: string) => void } {
  logger.info({ nodeEnv: env.NODE_ENV }, "worker started; no job consumers in this unit");

  const stop = (signal: string) => {
    logger.info({ signal }, "worker shutting down");
  };

  return { stop };
}
