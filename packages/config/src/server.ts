import { z } from "zod";

import { assertNoPublicSecrets } from "./public-env";

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  CORS_ORIGINS: z.string().min(1),
  API_HOST: z.string().min(1).default("0.0.0.0"),
  API_PORT: z.coerce.number().int().positive().default(3001),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema> & {
  corsOrigins: string[];
};

export function parseServerEnv(env: Record<string, string | undefined>): ServerEnv {
  assertNoPublicSecrets(env);

  const parsed = serverEnvSchema.parse({
    NODE_ENV: env.NODE_ENV,
    DATABASE_URL: env.DATABASE_URL,
    CORS_ORIGINS: env.CORS_ORIGINS,
    API_HOST: env.API_HOST,
    API_PORT: env.API_PORT,
    LOG_LEVEL: env.LOG_LEVEL,
  });

  const corsOrigins = parsed.CORS_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  if (corsOrigins.length === 0) {
    throw new Error("CORS_ORIGINS must contain at least one origin.");
  }

  return {
    ...parsed,
    corsOrigins,
  };
}
