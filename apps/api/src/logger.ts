import type { ServerEnv } from "@aabhushan/config/server";
import type { LoggerOptions } from "pino";

const REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.Authorization",
  "headers.authorization",
  "access_token",
  "refresh_token",
  "password",
  "*.password",
  "*.access_token",
  "*.refresh_token",
  "phone",
  "phone_normalized",
  "phone_display",
  "email",
  "notes",
  "address_line",
  "*.phone",
  "*.phone_normalized",
  "*.phone_display",
  "*.email",
  "*.notes",
  "*.address_line",
  "*.object_key",
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
