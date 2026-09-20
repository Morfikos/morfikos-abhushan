import { Pool } from "pg";

/**
 * Real PostgreSQL checks for spec 03: missing organization context denies
 * access, a wrong organization id cannot read shop rows, and SET LOCAL
 * context does not leak across pooled connections.
 *
 * Usage: DATABASE_URL=... pnpm --filter @aabhushan/db verify:org-context
 */
async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  const organizationId = "11111111-1111-4111-8111-111111111111";
  const otherOrganizationId = "99999999-9999-4999-8999-999999999999";
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });

  try {
    const missing = await withApiRole(pool, async (client) => {
      const result = await client.query("SELECT count(*)::int AS count FROM app.shop_profiles");
      return result.rows[0]?.count as number;
    });
    if (missing !== 0) {
      throw new Error(`Missing organization context should deny rows, got ${String(missing)}.`);
    }

    const scoped = await withApiRole(pool, async (client) => {
      await client.query("SELECT set_config('app.organization_id', $1, true)", [organizationId]);
      const result = await client.query("SELECT count(*)::int AS count FROM app.shop_profiles");
      return result.rows[0]?.count as number;
    });
    if (scoped < 1) {
      throw new Error("Correct organization context should return the seeded shop profile.");
    }

    const wrongOrg = await withApiRole(pool, async (client) => {
      await client.query("SELECT set_config('app.organization_id', $1, true)", [otherOrganizationId]);
      const result = await client.query("SELECT count(*)::int AS count FROM app.shop_profiles");
      return result.rows[0]?.count as number;
    });
    if (wrongOrg !== 0) {
      throw new Error(`Wrong organization id should deny rows, got ${String(wrongOrg)}.`);
    }

    const first = await pool.connect();
    const second = await pool.connect();
    try {
      await first.query("BEGIN");
      await first.query("SET LOCAL ROLE app_api");
      await first.query("SELECT set_config('app.organization_id', $1, true)", [organizationId]);
      const during = await first.query("SELECT count(*)::int AS count FROM app.shop_profiles");
      if ((during.rows[0]?.count as number) < 1) {
        throw new Error("Pooled connection lost organization context inside the transaction.");
      }
      await first.query("COMMIT");

      await second.query("BEGIN");
      await second.query("SET LOCAL ROLE app_api");
      const leaked = await second.query("SELECT count(*)::int AS count FROM app.shop_profiles");
      await second.query("COMMIT");
      if ((leaked.rows[0]?.count as number) !== 0) {
        throw new Error("Organization context leaked onto another pooled connection.");
      }

      await first.query("BEGIN");
      await first.query("SET LOCAL ROLE app_api");
      const reused = await first.query("SELECT count(*)::int AS count FROM app.shop_profiles");
      await first.query("COMMIT");
      if ((reused.rows[0]?.count as number) !== 0) {
        throw new Error("Organization context leaked after commit on a reused pooled connection.");
      }
    } finally {
      first.release();
      second.release();
    }

    const secondOrgCreate = await pool.query(
      `
      INSERT INTO app.organizations (name)
      VALUES ('Must reject')
      `,
    ).then(
      () => "accepted",
      (error: unknown) => (typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : "error"),
    );
    if (secondOrgCreate === "accepted") {
      throw new Error("A second organization insert must be rejected in MVP.");
    }

    console.log("org-context verification passed: missing context denied, wrong org denied, pool isolation held, second org rejected.");
  } finally {
    await pool.end();
  }
}

async function withApiRole<T>(pool: Pool, fn: (client: import("pg").PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE app_api");
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

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
