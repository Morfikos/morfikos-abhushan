import { parseServerEnv } from "@aabhushan/config/server";

import { createApp } from "./app";
import { loadCjs } from "./load-cjs";
import { loggerOptionsFor } from "./logger";

const pino = loadCjs<typeof import("pino")>("pino");

const env = parseServerEnv(process.env);
const logger = pino(loggerOptionsFor(env));
const app = createApp(env);

const server = app.listen(env.API_PORT, env.API_HOST, () => {
  logger.info({ host: env.API_HOST, port: env.API_PORT }, "api listening");
});

function shutdown(signal: string) {
  logger.info({ signal }, "api shutting down");
  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGTERM", () => {
  shutdown("SIGTERM");
});
process.on("SIGINT", () => {
  shutdown("SIGINT");
});
