import { Client } from "pg";

/**
 * Server-only database helpers. Do not import this package from the Next.js frontend.
 * Browser Supabase roles must not receive grants on the `app` schema.
 */
export async function pingDatabase(databaseUrl: string): Promise<boolean> {
  const client = new Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 2000,
  });

  try {
    await client.connect();
    await client.query("SELECT 1");
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => undefined);
  }
}
