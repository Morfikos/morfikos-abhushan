import { parseWebEnv } from "@aabhushan/config/web";
import { describe, expect, it } from "vitest";

describe("web public env", () => {
  it("loads only public identifiers", () => {
    const env = parseWebEnv({
      NEXT_PUBLIC_API_URL: "http://localhost:3001",
      NEXT_PUBLIC_APP_NAME: "Aabhushan",
    });

    expect(env.NEXT_PUBLIC_API_URL).toBe("http://localhost:3001");
  });
});
