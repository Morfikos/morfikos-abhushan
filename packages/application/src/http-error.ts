import type { FieldError } from "@aabhushan/contracts";

export class ApplicationHttpError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  readonly fieldErrors: FieldError[];

  constructor(code: string, message: string, httpStatus: number, fieldErrors: FieldError[] = []) {
    super(message);
    this.name = "ApplicationHttpError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.fieldErrors = fieldErrors;
  }
}

export function permissionDeniedError(message = "You do not have permission to perform this action."): ApplicationHttpError {
  return new ApplicationHttpError("PERMISSION_DENIED", message, 403);
}

export function conflictError(code: string, message: string): ApplicationHttpError {
  return new ApplicationHttpError(code, message, 409);
}

export function validationError(message: string, fieldErrors: FieldError[] = []): ApplicationHttpError {
  return new ApplicationHttpError("VALIDATION_ERROR", message, 422, fieldErrors);
}

export function notFoundError(message = "The requested resource was not found."): ApplicationHttpError {
  return new ApplicationHttpError("NOT_FOUND", message, 404);
}

export function configurationError(message: string): ApplicationHttpError {
  return new ApplicationHttpError("CONFIGURATION_ERROR", message, 503);
}

export function missingOrganizationContextError(): ApplicationHttpError {
  return new ApplicationHttpError(
    "ORGANIZATION_CONTEXT_MISSING",
    "Organization context is required for this operation.",
    403,
  );
}
