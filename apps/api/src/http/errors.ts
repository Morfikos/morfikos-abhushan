import type { Request, Response } from "express";

import { ApplicationHttpError, StaffAccessError } from "@aabhushan/application";
import { createApiError } from "@aabhushan/contracts";

import { requestIdOf } from "../auth/require-staff-access";

type SchemaIssue = {
  path: PropertyKey[];
  message: string;
};

type SchemaParseResult<T> =
  | { success: true; data: T }
  | { success: false; error: { issues: SchemaIssue[] } };

type RuntimeSchema<T> = {
  safeParse: (value: unknown) => SchemaParseResult<T>;
};

export function queryRecord(req: Request): Record<string, string | undefined> {
  const record: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(req.query)) {
    if (typeof value === "string") {
      record[key] = value;
    } else if (Array.isArray(value) && typeof value[0] === "string") {
      record[key] = value[0];
    }
  }
  return record;
}

export function parseBody<T>(schema: RuntimeSchema<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw schemaHttpError(parsed.error.issues);
  }
  return parsed.data;
}

export function parseQuery<T>(schema: RuntimeSchema<T>, req: Request): T {
  const parsed = schema.safeParse(queryRecord(req));
  if (!parsed.success) {
    throw schemaHttpError(parsed.error.issues);
  }
  return parsed.data;
}

export function schemaHttpError(issues: SchemaIssue[]): ApplicationHttpError {
  return new ApplicationHttpError(
    "INVALID_INPUT",
    "The request was not valid.",
    400,
    issues.map((issue) => ({
      field: issue.path.map(String).join(".") || "body",
      message: issue.message,
    })),
  );
}

export function sendHandlerError(req: Request, res: Response, error: unknown): boolean {
  if (error instanceof StaffAccessError) {
    res.setHeader("Cache-Control", "private, no-store");
    res.status(error.httpStatus).json(
      createApiError({
        code: error.code,
        message: error.message,
        request_id: requestIdOf(req),
      }),
    );
    return true;
  }

  if (error instanceof ApplicationHttpError) {
    res.setHeader("Cache-Control", "private, no-store");
    res.status(error.httpStatus).json(
      createApiError({
        code: error.code,
        message: error.message,
        request_id: requestIdOf(req),
        field_errors: error.fieldErrors,
      }),
    );
    return true;
  }

  return false;
}
