import type { ServerEnv } from "@aabhushan/config/server";
import type { LoggerOptions } from "pino";

const REDACT_PATHS = [
  "upload_url",
  "download_url",
  "signed_url",
  "logo_url",
  "*.upload_url",
  "*.download_url",
  "*.signed_url",
  "*.logo_url",
  "url",
  "*.url",
  "*.object_key",
] as const;

export function loggerOptionsFor(env: Pick<ServerEnv, "LOG_LEVEL" | "NODE_ENV">): LoggerOptions {
  const redact = {
    paths: [...REDACT_PATHS],
    censor: "[redacted]",
  };

  if (env.NODE_ENV === "development") {
    return {
      redact,
      level: env.LOG_LEVEL,
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss",
          ignore: "pid,hostname",
          singleLine: true,
        },
      },
    };
  }

  return {
    redact,
    level: env.LOG_LEVEL,
  };
}
