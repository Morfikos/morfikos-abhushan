import { z } from "zod";

import { assertNoPublicSecrets } from "./public-env";

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  CORS_ORIGINS: z.string().min(1),
  API_HOST: z.string().min(1).default("0.0.0.0"),
  API_PORT: z.coerce.number().int().positive().default(3001),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  SUPABASE_URL: z.string().url(),
  SUPABASE_JWT_AUDIENCE: z.string().min(1).default("authenticated"),
  SUPABASE_JWT_ISSUER: z.string().url().optional(),
  SUPABASE_JWT_JWKS_URL: z.string().url().optional(),
  SUPABASE_SECRET_KEY: z.string().min(1).optional(),
  WEB_ORIGIN: z.string().url().optional(),
});

export type ServerEnv = {
  NODE_ENV: "development" | "test" | "production";
  DATABASE_URL: string;
  CORS_ORIGINS: string;
  corsOrigins: string[];
  API_HOST: string;
  API_PORT: number;
  LOG_LEVEL: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";
  SUPABASE_URL: string;
  SUPABASE_JWT_AUDIENCE: string;
  SUPABASE_JWT_ISSUER: string;
  SUPABASE_JWT_JWKS_URL: string;
  SUPABASE_SECRET_KEY?: string;
  WEB_ORIGIN: string;
};

export function deriveSupabaseJwtIssuer(supabaseUrl: string, explicitIssuer?: string): string {
  if (explicitIssuer) {
    return explicitIssuer;
  }

  return `${supabaseUrl.replace(/\/$/, "")}/auth/v1`;
}

export function deriveSupabaseJwtJwksUrl(supabaseUrl: string, explicitJwksUrl?: string): string {
  if (explicitJwksUrl) {
    return explicitJwksUrl;
  }

  return `${deriveSupabaseJwtIssuer(supabaseUrl)}/.well-known/jwks.json`;
}

export function parseServerEnv(env: Record<string, string | undefined>): ServerEnv {
  assertNoPublicSecrets(env);

  const parsed = serverEnvSchema.parse({
    NODE_ENV: env.NODE_ENV,
    DATABASE_URL: env.DATABASE_URL,
    CORS_ORIGINS: env.CORS_ORIGINS,
    API_HOST: env.API_HOST,
    API_PORT: env.API_PORT,
    LOG_LEVEL: env.LOG_LEVEL,
    SUPABASE_URL: env.SUPABASE_URL,
    SUPABASE_JWT_AUDIENCE: env.SUPABASE_JWT_AUDIENCE,
    SUPABASE_JWT_ISSUER: env.SUPABASE_JWT_ISSUER,
    SUPABASE_JWT_JWKS_URL: env.SUPABASE_JWT_JWKS_URL,
    SUPABASE_SECRET_KEY: env.SUPABASE_SECRET_KEY,
    WEB_ORIGIN: env.WEB_ORIGIN,
  });

  const corsOrigins = parsed.CORS_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  if (corsOrigins.length === 0) {
    throw new Error("CORS_ORIGINS must contain at least one origin.");
  }

  return {
    NODE_ENV: parsed.NODE_ENV,
    DATABASE_URL: parsed.DATABASE_URL,
    CORS_ORIGINS: parsed.CORS_ORIGINS,
    corsOrigins,
    API_HOST: parsed.API_HOST,
    API_PORT: parsed.API_PORT,
    LOG_LEVEL: parsed.LOG_LEVEL,
    SUPABASE_URL: parsed.SUPABASE_URL,
    SUPABASE_JWT_AUDIENCE: parsed.SUPABASE_JWT_AUDIENCE,
    SUPABASE_JWT_ISSUER: deriveSupabaseJwtIssuer(parsed.SUPABASE_URL, parsed.SUPABASE_JWT_ISSUER),
    SUPABASE_JWT_JWKS_URL: deriveSupabaseJwtJwksUrl(parsed.SUPABASE_URL, parsed.SUPABASE_JWT_JWKS_URL),
    ...(parsed.SUPABASE_SECRET_KEY ? { SUPABASE_SECRET_KEY: parsed.SUPABASE_SECRET_KEY } : {}),
    WEB_ORIGIN: parsed.WEB_ORIGIN ?? corsOrigins[0] ?? "http://localhost:3000",
  };
}
