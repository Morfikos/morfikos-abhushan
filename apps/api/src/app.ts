import { randomUUID } from "node:crypto";

import type { ServerEnv } from "@aabhushan/config/server";
import { apiVersionDocument, createApiError } from "@aabhushan/contracts";
import { createStaffAccessRepository, pingDatabase } from "@aabhushan/db";
import type { Express, NextFunction, Request, Response } from "express";

import { currentStaffResponse, requestIdOf, requireStaffAccess, type StaffRequest } from "./auth/require-staff-access";
import { loadCjs } from "./load-cjs";
import { loggerOptionsFor } from "./logger";

const cors = loadCjs<typeof import("cors")>("cors");
const express = loadCjs<typeof import("express")>("express");
const pino = loadCjs<typeof import("pino")>("pino");

function assignRequestId(req: Request): string {
  const header = req.headers["x-request-id"];
  const requestId = typeof header === "string" && header.length > 0 ? header : randomUUID();
  (req as Request & { requestId: string }).requestId = requestId;
  return requestId;
}

export function createApp(env: ServerEnv): Express {
  const app = express();
  const logger = pino(loggerOptionsFor(env));
  const staffAccessRepository = createStaffAccessRepository(env.DATABASE_URL);
  const requireStaff = requireStaffAccess(env, staffAccessRepository);

  app.disable("x-powered-by");
  app.use(express.json({ limit: "32kb" }));
  app.use((req, res, next) => {
    const requestId = assignRequestId(req);
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

  app.get("/api/v1/me", requireStaff, (req, res) => {
    res.status(200).json(currentStaffResponse(req as StaffRequest));
  });

  app.post("/api/v1/auth/session/introspect", requireStaff, (req, res) => {
    const access = (req as StaffRequest).staffAccess;
    res.status(200).json({
      active: true,
      staff_user_id: access.staff_user_id,
      organization_id: access.membership.organization_id,
      branch_id: access.membership.branch_id,
      role: access.membership.role,
    });
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
