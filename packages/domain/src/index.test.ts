import { describe, expect, it } from "vitest";

import { domainPackage } from "./index";

describe("domain package", () => {
  it("exposes a browser-safe placeholder", () => {
    expect(domainPackage).toBe("domain");
  });
});
