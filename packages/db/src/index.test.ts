import { describe, expect, it } from "vitest";

import { pingDatabase } from "./index";

describe("pingDatabase", () => {
  it("returns false when the database is unreachable", async () => {
    await expect(pingDatabase("postgres://invalid:invalid@127.0.0.1:1/missing")).resolves.toBe(false);
  });
});
