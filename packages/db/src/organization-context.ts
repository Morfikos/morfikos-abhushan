import { Pool, type PoolClient, type PoolConfig } from "pg";

export function createPool(databaseUrl: string, config: Omit<PoolConfig, "connectionString"> = {}): Pool {
  return new Pool({
    connectionString: databaseUrl,
    max: config.max ?? 10,
    idleTimeoutMillis: config.idleTimeoutMillis ?? 10_000,
    connectionTimeoutMillis: config.connectionTimeoutMillis ?? 8_000,
    ...config,
  });
}

export type RuntimeDbRole = "app_api" | "app_worker";

export async function withOrganizationContext<T>(
  pool: Pool,
  input: { organizationId: string; role?: RuntimeDbRole },
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const role = input.role ?? "app_api";
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL ROLE ${role}`);
    await client.query("SELECT set_config('app.organization_id', $1, true)", [input.organizationId]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
