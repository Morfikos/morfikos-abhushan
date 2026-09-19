import type { ServerEnv } from "@aabhushan/config/server";
import type { LoggerOptions } from "pino";

export const apiLoggerOptions: LoggerOptions = {
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.Authorization",
      "headers.authorization",
      "access_token",
      "refresh_token",
      "password",
      "*.password",
      "*.access_token",
      "*.refresh_token",
    ],
    censor: "[redacted]",
  },
};

export function loggerOptionsFor(env: Pick<ServerEnv, "LOG_LEVEL">): LoggerOptions {
  return {
    ...apiLoggerOptions,
    level: env.LOG_LEVEL,
  };
}
