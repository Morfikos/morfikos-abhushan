import type { ServerEnv } from "@aabhushan/config/server";
import type { LoggerOptions } from "pino";

export function loggerOptionsFor(env: Pick<ServerEnv, "LOG_LEVEL" | "NODE_ENV">): LoggerOptions {
  if (env.NODE_ENV === "development") {
    return {
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
    level: env.LOG_LEVEL,
  };
}
