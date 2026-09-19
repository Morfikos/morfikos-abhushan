import { z } from "zod";

export const fieldErrorSchema = z.object({
  field: z.string(),
  message: z.string(),
});

export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  request_id: z.string(),
  field_errors: z.array(fieldErrorSchema).default([]),
});

export type FieldError = z.infer<typeof fieldErrorSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;

export function createApiError(input: {
  code: string;
  message: string;
  request_id: string;
  field_errors?: FieldError[];
}): ApiError {
  return apiErrorSchema.parse({
    code: input.code,
    message: input.message,
    request_id: input.request_id,
    field_errors: input.field_errors ?? [],
  });
}

export const apiVersionDocument = {
  openapi: "3.1.0",
  info: {
    title: "Aabhushan API",
    version: "v1",
    description: "Versioned staff API discovery document. No business data is included.",
  },
  servers: [{ url: "/api/v1" }],
  paths: {
    "/health/live": {
      get: {
        summary: "Process liveness",
        responses: { "200": { description: "Process is live" } },
      },
    },
    "/health/ready": {
      get: {
        summary: "Readiness including configuration and database ping",
        responses: {
          "200": { description: "Ready" },
          "503": { description: "Not ready" },
        },
      },
    },
    "/api/v1": {
      get: {
        summary: "OpenAPI version document",
        responses: { "200": { description: "Version document" } },
      },
    },
    "/me": {
      get: {
        summary: "Current staff profile, membership, role, and permissions",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Authenticated membership" },
          "401": { description: "Missing or invalid token" },
          "403": { description: "Disabled, suspended, or missing membership" },
        },
      },
    },
    "/auth/session/introspect": {
      post: {
        summary: "Explicit backend session check for a bearer token",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Active membership" },
          "401": { description: "Missing or invalid token" },
          "403": { description: "Disabled, suspended, or missing membership" },
        },
      },
    },
  },
} as const;

export {
  PUBLIC_SELF_SIGNUP_ENABLED,
  currentStaffMembershipSchema,
  currentStaffSchema,
  sessionIntrospectionSchema,
  staffInvitationStatusSchema,
  staffMembershipStatusSchema,
  staffPermissionSchema,
  staffRoleSchema,
} from "./staff";
export type {
  CurrentStaff,
  SessionIntrospection,
  StaffInvitationStatus,
  StaffMembershipStatus,
  StaffPermission,
  StaffRole,
} from "./staff";
