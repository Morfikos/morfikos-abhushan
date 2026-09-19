import { parseServerEnv } from "@aabhushan/config/server";
import pino from "pino";

import { startWorker } from "./lifecycle";

const env = parseServerEnv(process.env);
const logger = pino({ level: env.LOG_LEVEL });
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
