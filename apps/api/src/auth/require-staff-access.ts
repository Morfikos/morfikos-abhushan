import type { NextFunction, Request, Response } from "express";

import {
  StaffAccessError,
  invalidAuthError,
  resolveStaffAccess,
  toCurrentStaffDto,
  type ResolvedStaffAccess,
  type StaffAccessRepository,
} from "@aabhushan/application";
import { createApiError } from "@aabhushan/contracts";
import type { ServerEnv } from "@aabhushan/config/server";

import { verifyAccessToken } from "./verify-access-token";

export type StaffRequest = Request & {
  requestId: string;
  staffAccess: ResolvedStaffAccess;
};

function bearerTokenFrom(req: Request): string {
  const header = req.headers.authorization;
  if (typeof header !== "string" || !header.toLowerCase().startsWith("bearer ")) {
    throw invalidAuthError("Authentication is required.");
  }

  const token = header.slice("bearer ".length).trim();
  if (token.length === 0) {
    throw invalidAuthError("Authentication is required.");
  }

  return token;
}

export function sendStaffAccessError(req: Request, res: Response, error: StaffAccessError): void {
  res.setHeader("Cache-Control", "private, no-store");
  res.status(error.httpStatus).json(
    createApiError({
      code: error.code,
      message: error.message,
      request_id: requestIdOf(req),
    }),
  );
}

export function requestIdOf(req: Request): string {
  const header = req.headers["x-request-id"];
  if (typeof header === "string" && header.length > 0) {
    return header;
  }

  const existing = (req as Request & { requestId?: string }).requestId;
  return existing ?? "unknown";
}

export function requireStaffAccess(env: ServerEnv, repository: StaffAccessRepository) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = bearerTokenFrom(req);
      const verified = await verifyAccessToken(token, env);
      const staffAccess = await resolveStaffAccess({
        repository,
        authUserId: verified.authUserId,
        tokenEmail: verified.email,
        profileDisplayName: verified.profileDisplayName,
      });

      const staffReq = req as StaffRequest;
      staffReq.staffAccess = staffAccess;
      res.setHeader("Cache-Control", "private, no-store");
      next();
    } catch (error) {
      if (error instanceof StaffAccessError) {
        sendStaffAccessError(req, res, error);
        return;
      }

      next(error);
    }
  };
}

export function currentStaffResponse(req: StaffRequest) {
  return toCurrentStaffDto(req.staffAccess);
}
