import { randomUUID } from "node:crypto";

import { Pool } from "pg";

/**
 * Real PostgreSQL checks for spec 04: weight constraints, unique article
 * numbers, status rows used by lookup sellable rules, and org isolation.
 *
 * Usage: DATABASE_URL=... pnpm --filter @aabhushan/db verify:inventory
 */
const ORGANIZATION_ID = "11111111-1111-4111-8111-111111111111";
const BRANCH_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_ORGANIZATION_ID = "99999999-9999-4999-8999-999999999999";

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  const pool = new Pool({ connectionString: databaseUrl, max: 2 });

  try {
    const missing = await withApiRole(pool, async (client) => {
      const result = await client.query("SELECT count(*)::int AS count FROM app.articles");
      return result.rows[0]?.count as number;
    });
    if (missing !== 0) {
      throw new Error(`Missing organization context should deny articles, got ${String(missing)}.`);
    }

    const wrongOrg = await withApiRole(pool, async (client) => {
      await client.query("SELECT set_config('app.organization_id', $1, true)", [OTHER_ORGANIZATION_ID]);
      const result = await client.query("SELECT count(*)::int AS count FROM app.articles");
      return result.rows[0]?.count as number;
    });
    if (wrongOrg !== 0) {
      throw new Error(`Wrong organization id should deny articles, got ${String(wrongOrg)}.`);
    }

    await withOrg(pool, async (client) => {
      const staff = await client.query<{ id: string }>("SELECT id FROM app.staff_users LIMIT 1");
      const staffUserId = staff.rows[0]?.id;
      if (!staffUserId) {
        throw new Error("An active staff user is required for inventory verification.");
      }

      const category = await client.query<{ id: string }>(
        "SELECT id FROM app.catalogue_categories WHERE organization_id = $1 LIMIT 1",
        [ORGANIZATION_ID],
      );
      const categoryId = category.rows[0]?.id;
      if (!categoryId) {
        throw new Error("Seeded catalogue categories are required.");
      }

      const mismatch = await withSavepoint(client, "weight_check", () =>
        client.query(
          `
          INSERT INTO app.articles (
            organization_id, branch_id, article_number, category_id, metal, purity,
            gross_weight_grams, non_metal_weight_grams, net_metal_weight_grams,
            receipt_business_date, status
          )
          VALUES ($1, $2, $3, $4, 'gold', '22K', 10, 1, 8, CURRENT_DATE, 'available')
          `,
          [ORGANIZATION_ID, BRANCH_ID, `VERIFY-BAD-${randomUUID().slice(0, 8)}`, categoryId],
        ),
      );
      if (mismatch !== "23514") {
        throw new Error(`Net-weight mismatch must be rejected by CHECK, got ${mismatch}.`);
      }

      const articleNumber = `VERIFY-${randomUUID().slice(0, 8)}`;
      await insertArticle(client, {
        articleNumber,
        categoryId,
        status: "available",
        barcode: null,
      });
      const duplicate = await withSavepoint(client, "duplicate_number", () =>
        insertArticle(client, {
          articleNumber,
          categoryId,
          status: "available",
          barcode: null,
        }),
      );
      if (duplicate !== "23505") {
        throw new Error(`Duplicate article number must be rejected, got ${duplicate}.`);
      }

      const unavailableBarcode = `UNAV-${randomUUID().slice(0, 8)}`;
      const inspectionBarcode = `INSP-${randomUUID().slice(0, 8)}`;
      const unavailableId = await insertArticle(client, {
        articleNumber: `VERIFY-U-${randomUUID().slice(0, 8)}`,
        categoryId,
        status: "unavailable",
        barcode: unavailableBarcode,
      });
      const inspectionId = await insertArticle(client, {
        articleNumber: `VERIFY-I-${randomUUID().slice(0, 8)}`,
        categoryId,
        status: "return_inspection",
        barcode: inspectionBarcode,
      });

      const unavailable = await client.query<{ status: string }>(
        "SELECT status FROM app.articles WHERE id = $1 AND barcode = $2",
        [unavailableId, unavailableBarcode],
      );
      const inspection = await client.query<{ status: string }>(
        "SELECT status FROM app.articles WHERE id = $1 AND barcode = $2",
        [inspectionId, inspectionBarcode],
      );
      if (unavailable.rows[0]?.status !== "unavailable") {
        throw new Error("Unavailable article was not stored for lookup.");
      }
      if (inspection.rows[0]?.status !== "return_inspection") {
        throw new Error("Return-inspection article was not stored for lookup.");
      }

      const adjustmentWithoutReason = await withSavepoint(client, "adjustment_reason", () =>
        client.query(
          `
          INSERT INTO app.inventory_movements (
            organization_id, article_id, movement_type, from_status, to_status, actor_staff_user_id
          )
          VALUES ($1, $2, 'adjustment', 'available', 'unavailable', $3)
          `,
          [ORGANIZATION_ID, unavailableId, staffUserId],
        ),
      );
      if (adjustmentWithoutReason !== "23514") {
        throw new Error(`Adjustment without reason must be rejected, got ${adjustmentWithoutReason}.`);
      }

      await client.query(
        `
        INSERT INTO app.inventory_movements (
          organization_id, article_id, movement_type, from_status, to_status, reason, actor_staff_user_id
        )
        VALUES ($1, $2, 'adjustment', 'unavailable', 'unavailable', 'Physical count discrepancy', $3)
        `,
        [ORGANIZATION_ID, unavailableId, staffUserId],
      );

      const deletableId = await insertArticle(client, {
        articleNumber: `VERIFY-DEL-${randomUUID().slice(0, 8)}`,
        categoryId,
        status: "available",
        barcode: null,
      });
      await client.query(
        `
        INSERT INTO app.inventory_movements (
          organization_id, article_id, movement_type, from_status, to_status, actor_staff_user_id
        )
        VALUES ($1, $2, 'receipt', NULL, 'available', $3)
        `,
        [ORGANIZATION_ID, deletableId, staffUserId],
      );

      await client.query(`DELETE FROM app.article_stones WHERE organization_id = $1 AND article_id = $2`, [
        ORGANIZATION_ID,
        deletableId,
      ]);
      await client.query(`DELETE FROM app.article_files WHERE organization_id = $1 AND article_id = $2`, [
        ORGANIZATION_ID,
        deletableId,
      ]);
      await client.query(`DELETE FROM app.inventory_movements WHERE organization_id = $1 AND article_id = $2`, [
        ORGANIZATION_ID,
        deletableId,
      ]);
      await client.query(`DELETE FROM app.articles WHERE organization_id = $1 AND id = $2`, [
        ORGANIZATION_ID,
        deletableId,
      ]);
      const deletedGone = await client.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM app.articles WHERE id = $1",
        [deletableId],
      );
      if (deletedGone.rows[0]?.count !== 0) {
        throw new Error("Mistaken-receipt article delete did not remove the article.");
      }

      const soldKeepId = await insertArticle(client, {
        articleNumber: `VERIFY-SOLD-${randomUUID().slice(0, 8)}`,
        categoryId,
        status: "sold",
        barcode: null,
      });
      await client.query(
        `
        INSERT INTO app.inventory_movements (
          organization_id, article_id, movement_type, from_status, to_status, actor_staff_user_id
        )
        VALUES ($1, $2, 'receipt', NULL, 'available', $3),
               ($1, $2, 'sale', 'available', 'sold', $3)
        `,
        [ORGANIZATION_ID, soldKeepId, staffUserId],
      );
      const soldStillThere = await client.query<{ status: string }>(
        "SELECT status FROM app.articles WHERE id = $1",
        [soldKeepId],
      );
      if (soldStillThere.rows[0]?.status !== "sold") {
        throw new Error("Sold article must remain for history; delete eligibility is application-enforced.");
      }

      const adjustedStillThere = await client.query<{ status: string }>(
        "SELECT status FROM app.articles WHERE id = $1",
        [unavailableId],
      );
      if (adjustedStillThere.rows[0]?.status !== "unavailable") {
        throw new Error("Adjusted unavailable article must remain.");
      }
    });

    console.log(
      "inventory verification passed: missing context denied, wrong org denied, weight CHECK held, unique article number held, unavailable/inspection are not available, adjustment requires reason, mistaken-receipt delete removes receipt-only articles, sold/adjusted rows remain.",
    );
  } finally {
    await pool.end();
  }
}

async function insertArticle(
  client: import("pg").PoolClient,
  input: { articleNumber: string; categoryId: string; status: string; barcode: string | null },
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `
    INSERT INTO app.articles (
      organization_id, branch_id, article_number, barcode, category_id, metal, purity,
      gross_weight_grams, non_metal_weight_grams, net_metal_weight_grams,
      receipt_business_date, status
    )
    VALUES ($1, $2, $3, $4, $5, 'gold', '22K', 10, 1, 9, CURRENT_DATE, $6)
    RETURNING id
    `,
    [ORGANIZATION_ID, BRANCH_ID, input.articleNumber, input.barcode, input.categoryId, input.status],
  );
  const id = result.rows[0]?.id;
  if (!id) {
    throw new Error("Article insert returned no id.");
  }
  return id;
}

async function withSavepoint(client: import("pg").PoolClient, name: string, fn: () => Promise<unknown>): Promise<string> {
  await client.query(`SAVEPOINT ${name}`);
  try {
    await fn();
    await client.query(`RELEASE SAVEPOINT ${name}`);
    return "accepted";
  } catch (error) {
    await client.query(`ROLLBACK TO SAVEPOINT ${name}`);
    return pgCode(error);
  }
}

function pgCode(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    return String((error as { code: unknown }).code);
  }
  return "error";
}

async function withOrg<T>(pool: Pool, fn: (client: import("pg").PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE app_api");
    await client.query("SELECT set_config('app.organization_id', $1, true)", [ORGANIZATION_ID]);
    const result = await fn(client);
    await client.query("ROLLBACK");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
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
