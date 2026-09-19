import { describe, expect, it } from "vitest";

import { apiVersionDocument, createApiError } from "./index";

describe("contracts", () => {
  it("creates the shared error shape", () => {
    expect(
      createApiError({
        code: "CONFIG_INVALID",
        message: "Required configuration is missing.",
        request_id: "req_test",
      }),
    ).toEqual({
      code: "CONFIG_INVALID",
      message: "Required configuration is missing.",
      request_id: "req_test",
      field_errors: [],
    });
  });

  it("exposes an OpenAPI version document without business schemas", () => {
    expect(apiVersionDocument.info.version).toBe("v1");
    expect(JSON.stringify(apiVersionDocument)).not.toMatch(/invoice|article|customer/i);
  });
});
