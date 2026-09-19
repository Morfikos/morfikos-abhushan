import { parseServerEnv } from "@aabhushan/config/server";
import pino from "pino";

import { startWorker } from "./lifecycle";
import { loggerOptionsFor } from "./logger";

const env = parseServerEnv(process.env);
const logger = pino(loggerOptionsFor(env));
const worker = startWorker(env, logger);

function shutdown(signal: string) {
  worker.stop(signal);
  process.exit(0);
}

process.on("SIGTERM", () => {
  shutdown("SIGTERM");
});
process.on("SIGINT", () => {
  shutdown("SIGINT");
});
