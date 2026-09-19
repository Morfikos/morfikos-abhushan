import { describe, expect, it } from "vitest";

import { parseWebEnv } from "./web";

describe("parseWebEnv", () => {
  it("accepts public identifiers only", () => {
    const env = parseWebEnv({
      NEXT_PUBLIC_API_URL: "http://localhost:3001",
      NEXT_PUBLIC_APP_NAME: "Aabhushan",
    });

    expect(env.NEXT_PUBLIC_APP_NAME).toBe("Aabhushan");
  });

  it("rejects NEXT_PUBLIC keys that look like secrets", () => {
    expect(() =>
      parseWebEnv({
        NEXT_PUBLIC_API_URL: "http://localhost:3001",
        NEXT_PUBLIC_SUPABASE_SERVICE_ROLE: "not-a-real-key",
      }),
    ).toThrow(/looks like a secret/);
  });
});
