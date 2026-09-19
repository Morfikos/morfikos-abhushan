import { randomUUID } from "node:crypto";

import type { ServerEnv } from "@aabhushan/config/server";
import { createApiError, apiVersionDocument } from "@aabhushan/contracts";
import { pingDatabase } from "@aabhushan/db";
import type { Express, NextFunction, Request, Response } from "express";

import { loadCjs } from "./load-cjs";

const cors = loadCjs<typeof import("cors")>("cors");
const express = loadCjs<typeof import("express")>("express");
const pino = loadCjs<typeof import("pino")>("pino");

function requestIdOf(req: Request): string {
  const header = req.headers["x-request-id"];
  if (typeof header === "string" && header.length > 0) {
    return header;
  }
  return randomUUID();
}

export function createApp(env: ServerEnv): Express {
  const app = express();
  const logger = pino({ level: env.LOG_LEVEL });

  app.disable("x-powered-by");
  app.use((req, res, next) => {
    const requestId = requestIdOf(req);
    res.setHeader("x-request-id", requestId);
    logger.info({ request_id: requestId, method: req.method, path: req.path }, "request");
    next();
  });
  app.use(
    cors({
      origin: env.corsOrigins,
    }),
  );

  app.get("/health/live", (_req, res) => {
    res.status(200).json({ status: "live" });
  });

  app.get("/health/ready", async (req, res) => {
    const ready = await pingDatabase(env.DATABASE_URL);
    if (!ready) {
      res.status(503).json(
        createApiError({
          code: "NOT_READY",
          message: "Required configuration is present but the database ping failed.",
          request_id: requestIdOf(req),
        }),
      );
      return;
    }

    res.status(200).json({ status: "ready" });
  });

  app.get("/api/v1", (_req, res) => {
    res.status(200).json(apiVersionDocument);
  });

  app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
    logger.error({ err: error, request_id: requestIdOf(req) }, "unhandled api error");
    res.status(500).json(
      createApiError({
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred.",
        request_id: requestIdOf(req),
      }),
    );
  });

  return app;
}
