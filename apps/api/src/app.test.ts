import { parseServerEnv } from "@aabhushan/config/server";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "./app";

const env = parseServerEnv({
  NODE_ENV: "test",
  DATABASE_URL: "postgres://invalid:invalid@127.0.0.1:1/missing",
  CORS_ORIGINS: "http://localhost:3000",
});

const app = createApp(env);

describe("api health", () => {
  it("returns liveness without credentials or customer data", async () => {
    const response = await request(app).get("/health/live");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "live" });
    expect(JSON.stringify(response.body)).not.toMatch(/customer|token|password/i);
  });

  it("fails readiness closed when the database is unreachable", async () => {
    const response = await request(app).get("/health/ready");

    expect(response.status).toBe(503);
    expect(response.body.code).toBe("NOT_READY");
    expect(response.body.field_errors).toEqual([]);
    expect(typeof response.body.request_id).toBe("string");
  });

  it("returns the OpenAPI version document", async () => {
    const response = await request(app).get("/api/v1");

    expect(response.status).toBe(200);
    expect(response.body.info.version).toBe("v1");
  });
});
