import { currentStaffSchema, type CurrentStaff } from "@aabhushan/contracts";

import { publicEnv } from "@/lib/public-env";

export class StaffApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "StaffApiError";
    this.status = status;
    this.code = code;
  }
}

function apiUrl(path: string): string {
  return `${publicEnv.NEXT_PUBLIC_API_URL}${path}`;
}

export async function fetchCurrentStaff(accessToken: string): Promise<CurrentStaff> {
  const response = await fetch(apiUrl("/api/v1/me"), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const record = typeof body === "object" && body !== null ? (body as { code?: unknown; message?: unknown }) : {};
    const code = typeof record.code === "string" ? record.code : "REQUEST_FAILED";
    const message = typeof record.message === "string" ? record.message : "The request failed.";
    throw new StaffApiError(response.status, code, message);
  }

  return currentStaffSchema.parse(body);
}
