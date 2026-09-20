import { randomUUID } from "node:crypto";

import type { ServerEnv } from "@aabhushan/config/server";
import { apiVersionDocument, createApiError } from "@aabhushan/contracts";
import { createPool, createStaffAccessRepository, pingDatabase } from "@aabhushan/db";
import type { Express, NextFunction, Request, Response } from "express";

import { currentStaffResponse, requestIdOf, requireStaffAccess, type StaffRequest } from "./auth/require-staff-access";
import { createStaffAuthInviter } from "./auth/supabase-admin";
import { sendHandlerError } from "./http/errors";
import { loadCjs } from "./load-cjs";
import { loggerOptionsFor } from "./logger";
import { registerShopRoutes } from "./routes/shop";
import { registerStaffRoutes } from "./routes/staff";

const cors = loadCjs<typeof import("cors")>("cors");
const express = loadCjs<typeof import("express")>("express");
const pino = loadCjs<typeof import("pino")>("pino");

function assignRequestId(req: Request): string {
  const header = req.headers["x-request-id"];
  const requestId = typeof header === "string" && header.length > 0 ? header : randomUUID();
  (req as Request & { requestId: string }).requestId = requestId;
  return requestId;
}

function requestLogLevel(req: Request, status: number): "info" | "warn" | "error" | "debug" | null {
  if (req.method === "OPTIONS") {
    return null;
  }

  if (req.path === "/health/live" || req.path === "/health/ready") {
    return status >= 500 ? "error" : "debug";
  }

  if (req.path === "/api/v1/me" && status < 400) {
    return "debug";
  }

  if (status >= 500) {
    return "error";
  }

  if (status >= 400) {
    return "warn";
  }

  return "info";
}

export function createApp(env: ServerEnv): Express {
  const app = express();
  const logger = pino(loggerOptionsFor(env));
  const pool = createPool(env.DATABASE_URL);
  const staffAccessRepository = createStaffAccessRepository(pool);
  const requireStaff = requireStaffAccess(env, staffAccessRepository);
  const authInviter = createStaffAuthInviter(env);

  app.disable("x-powered-by");
  app.use(express.json({ limit: "32kb" }));
  app.use((req, res, next) => {
    const requestId = assignRequestId(req);
    res.setHeader("x-request-id", requestId);
    const started = Date.now();
    res.on("finish", () => {
      const level = requestLogLevel(req, res.statusCode);
      if (!level) {
        return;
      }

      logger[level](
        {
          request_id: requestId,
          method: req.method,
          path: req.path,
          status: res.statusCode,
          duration_ms: Date.now() - started,
        },
        "request",
      );
    });
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

  registerShopRoutes(app, pool, requireStaff);
  registerStaffRoutes(app, pool, env, authInviter, requireStaff);

  app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (sendHandlerError(req, res, error)) {
      return;
    }

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
