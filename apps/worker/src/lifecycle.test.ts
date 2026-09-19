import { parseServerEnv } from "@aabhushan/config/server";
import pino from "pino";
import { describe, expect, it } from "vitest";

import { startWorker } from "./lifecycle";

describe("worker lifecycle", () => {
  it("starts and stops without consuming jobs", () => {
    const env = parseServerEnv({
      NODE_ENV: "test",
      DATABASE_URL: "postgres://postgres:postgres@localhost:5432/aabhushan_dev",
      CORS_ORIGINS: "http://localhost:3000",
    });
    const logger = pino({ level: "silent" });
    const worker = startWorker(env, logger);

    expect(() => {
      worker.stop("SIGTERM");
    }).not.toThrow();
  });
});
