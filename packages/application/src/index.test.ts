import { describe, expect, it } from "vitest";

import { applicationPackage } from "./index";

describe("application package", () => {
  it("is a server-side placeholder", () => {
    expect(applicationPackage).toBe("application");
  });
});
