import type { ServerEnv } from "@aabhushan/config/server";
import { invalidAuthError } from "@aabhushan/application";
import { createRemoteJWKSet, jwtVerify, errors as JoseErrors, type JWTVerifyGetKey } from "jose";

export type VerifiedAccessToken = {
  authUserId: string;
  email: string | undefined;
  profileDisplayName: string | undefined;
};

const jwksByUrl = new Map<string, JWTVerifyGetKey>();

function jwksFor(jwksUrl: string): JWTVerifyGetKey {
  const existing = jwksByUrl.get(jwksUrl);
  if (existing) {
    return existing;
  }

  const jwks = createRemoteJWKSet(new URL(jwksUrl));
  jwksByUrl.set(jwksUrl, jwks);
  return jwks;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return undefined;
}

function readDisplayName(payload: Record<string, unknown>): string | undefined {
  const metadata = asRecord(payload.user_metadata);
  const displayName = metadata?.display_name;
  return typeof displayName === "string" && displayName.trim().length > 0 ? displayName.trim() : undefined;
}

export async function verifyAccessToken(
  token: string,
  env: Pick<ServerEnv, "SUPABASE_JWT_JWKS_URL" | "SUPABASE_JWT_ISSUER" | "SUPABASE_JWT_AUDIENCE">,
): Promise<VerifiedAccessToken> {
  try {
    const { payload } = await jwtVerify(token, jwksFor(env.SUPABASE_JWT_JWKS_URL), {
      issuer: env.SUPABASE_JWT_ISSUER,
      audience: env.SUPABASE_JWT_AUDIENCE,
      algorithms: ["ES256"],
      clockTolerance: 0,
    });

    if (typeof payload.sub !== "string" || payload.sub.length === 0) {
      throw invalidAuthError();
    }

    return {
      authUserId: payload.sub,
      email: typeof payload.email === "string" ? payload.email : undefined,
      profileDisplayName: readDisplayName(payload),
    };
  } catch (error) {
    if (error instanceof JoseErrors.JOSEError) {
      throw invalidAuthError();
    }

    throw error;
  }
}
