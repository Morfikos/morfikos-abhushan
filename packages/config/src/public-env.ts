export const FORBIDDEN_PUBLIC_SECRET_PATTERN = /(SECRET|PASSWORD|PRIVATE_KEY|SERVICE_ROLE|ACCESS_TOKEN)/i;

export function assertNoPublicSecrets(env: Record<string, string | undefined>): void {
  for (const key of Object.keys(env)) {
    if (key.startsWith("NEXT_PUBLIC_") && FORBIDDEN_PUBLIC_SECRET_PATTERN.test(key)) {
      throw new Error(`Public environment variable ${key} looks like a secret and is rejected.`);
    }
  }
}
