import { describe, expect, it } from "vitest";

import { parseServerEnv } from "./server";

describe("parseServerEnv", () => {
  const valid = {
    DATABASE_URL: "postgres://postgres:postgres@localhost:5432/aabhushan_dev",
    CORS_ORIGINS: "http://localhost:3000",
  };

  it("requires a real DATABASE_URL instead of an implicit default", () => {
    expect(() => parseServerEnv({ CORS_ORIGINS: "http://localhost:3000" })).toThrow();
  });

  it("parses CORS as an allowlist", () => {
    const env = parseServerEnv({
      ...valid,
      CORS_ORIGINS: "http://localhost:3000, http://127.0.0.1:3000",
    });

    expect(env.corsOrigins).toEqual(["http://localhost:3000", "http://127.0.0.1:3000"]);
  });

  it("rejects NEXT_PUBLIC keys that look like secrets", () => {
    expect(() =>
      parseServerEnv({
        ...valid,
        NEXT_PUBLIC_DATABASE_PASSWORD: "secret",
      }),
    ).toThrow(/looks like a secret/);
  });
});
