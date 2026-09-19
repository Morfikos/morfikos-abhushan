import { describe, expect, it } from "vitest";

import { integrationsPackage } from "./index";

describe("integrations package", () => {
  it("is a server-side placeholder", () => {
    expect(integrationsPackage).toBe("integrations");
  });
});
