import { Pool, type PoolClient, type PoolConfig } from "pg";

function guardCheckedOutClient(client: PoolClient): PoolClient {
  const onError = () => {
    // A dropped socket also rejects the in-flight query. This listener keeps that drop from exiting the process.
  };
  client.on("error", onError);
  const release = client.release.bind(client);
  client.release = (err?: Error | boolean) => {
    client.removeListener("error", onError);
    release(err);
  };
  return client;
}

export function createPool(databaseUrl: string, config: Omit<PoolConfig, "connectionString"> = {}): Pool {
  // Session-mode pooler allows 15 clients total. API + worker + pg-boss must stay under that.
  const pool = new Pool({
    connectionString: databaseUrl,
    max: config.max ?? 4,
    idleTimeoutMillis: config.idleTimeoutMillis ?? 10_000,
    connectionTimeoutMillis: config.connectionTimeoutMillis ?? 8_000,
    keepAlive: config.keepAlive ?? true,
    ...config,
  });

  pool.on("error", () => {
    // Idle clients emit error when the pooler closes the socket. Handling it keeps the API and worker alive.
  });

  const connect = pool.connect.bind(pool) as Pool["connect"];
  pool.connect = ((...args: Parameters<Pool["connect"]>) => {
    if (typeof args[0] === "function") {
      return connect(...args);
    }
    return Promise.resolve(connect()).then((client) => guardCheckedOutClient(client as PoolClient));
  }) as Pool["connect"];

  return pool;
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
