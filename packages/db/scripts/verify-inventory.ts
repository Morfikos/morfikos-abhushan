import { randomUUID } from "node:crypto";

import { Pool } from "pg";

import {
  ApplicationHttpError,
  updateArticle,
  type ResolvedStaffAccess,
} from "@aabhushan/application";
import { permissionsForRole, STAFF_PERMISSION_MAP_VERSION } from "@aabhushan/domain";
import { createDocumentsRepository } from "../src/documents-repository";
import { createInventoryRepository } from "../src/inventory-repository";

/**
 * Real PostgreSQL checks for spec 04: weight constraints, unique article
 * numbers, status rows used by lookup sellable rules, org isolation,
 * PATCH sold-lock, and article photo replace (one current file).
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
      const staff = await client.query<{
        id: string;
        email: string;
        display_name: string;
        membership_id: string;
        role: "owner" | "admin" | "billing" | "inventory" | "girvi";
      }>(
        `
        SELECT su.id, su.email, su.display_name, sm.id AS membership_id, sm.role
        FROM app.staff_users su
        JOIN app.staff_memberships sm ON sm.staff_user_id = su.id
        WHERE sm.organization_id = $1 AND sm.status = 'active'
        LIMIT 1
        `,
        [ORGANIZATION_ID],
      );
      const staffRow = staff.rows[0];
      if (!staffRow) {
        throw new Error("An active staff user is required for inventory verification.");
      }
      const staffUserId = staffRow.id;
      const access = staffAccess(staffRow);
      const inventoryRepo = createInventoryRepository(client, ORGANIZATION_ID, BRANCH_ID);
      const documentsRepo = createDocumentsRepository(client, ORGANIZATION_ID);

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

      const unavailableBarcode = `UNAV-${randomUUID().slice(0, 8).toUpperCase()}`;
      const inspectionBarcode = `INSP-${randomUUID().slice(0, 8).toUpperCase()}`;
      const unavailableId = await insertArticle(client, {
        articleNumber: `VERIFY-U-${randomUUID().slice(0, 8).toUpperCase()}`,
        categoryId,
        status: "unavailable",
        barcode: unavailableBarcode,
      });
      const inspectionId = await insertArticle(client, {
        articleNumber: `VERIFY-I-${randomUUID().slice(0, 8).toUpperCase()}`,
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

      const patchAvailableId = await insertArticle(client, {
        articleNumber: `VERIFY-PATCH-${randomUUID().slice(0, 8)}`,
        categoryId,
        status: "available",
        barcode: null,
      });
      const beforePatch = await inventoryRepo.getArticle(patchAvailableId);
      if (!beforePatch) {
        throw new Error("Available article for PATCH was not found.");
      }
      const patched = await updateArticle(inventoryRepo, access, patchAvailableId, {
        row_version: beforePatch.row_version,
        purity: "18K",
        gross_weight_grams: "12",
        non_metal_weight_grams: "1",
        net_metal_weight_grams: "11",
      });
      if (patched.purity !== "18K" || Number(patched.net_metal_weight_grams) !== 11) {
        throw new Error(
          `Available article PATCH must update purity and weights, got purity=${patched.purity} net=${patched.net_metal_weight_grams}.`,
        );
      }

      const soldForPatchId = await insertArticle(client, {
        articleNumber: `VERIFY-SOLD-PATCH-${randomUUID().slice(0, 8)}`,
        categoryId,
        status: "sold",
        barcode: null,
      });
      const soldBefore = await inventoryRepo.getArticle(soldForPatchId);
      if (!soldBefore) {
        throw new Error("Sold article for PATCH lock was not found.");
      }
      try {
        await updateArticle(inventoryRepo, access, soldForPatchId, {
          row_version: soldBefore.row_version,
          purity: "14K",
        });
        throw new Error("Sold article identity PATCH must fail.");
      } catch (error) {
        if (!(error instanceof ApplicationHttpError) || error.code !== "VALIDATION_ERROR") {
          throw error instanceof Error
            ? error
            : new Error("Sold article identity PATCH must fail with validation error.");
        }
      }

      const photoArticleId = await insertArticle(client, {
        articleNumber: `VERIFY-PHOTO-${randomUUID().slice(0, 8)}`,
        categoryId,
        status: "available",
        barcode: null,
      });
      const firstKey = `${ORGANIZATION_ID}/article/${photoArticleId}/${randomUUID()}.jpg`;
      const secondKey = `${ORGANIZATION_ID}/article/${photoArticleId}/${randomUUID()}.jpg`;
      await documentsRepo.insertArticleFileLink({
        articleId: photoArticleId,
        objectKey: firstKey,
        checksumSha256: "a".repeat(64),
        contentType: "image/jpeg",
        byteSize: 1024,
        originalFilename: "first.jpg",
      });
      await documentsRepo.insertArticleFileLink({
        articleId: photoArticleId,
        objectKey: secondKey,
        checksumSha256: "b".repeat(64),
        contentType: "image/jpeg",
        byteSize: 2048,
        originalFilename: "second.jpg",
      });
      const photoRows = await client.query<{ object_key: string; original_filename: string }>(
        `
        SELECT object_key, original_filename
        FROM app.article_files
        WHERE organization_id = $1 AND article_id = $2
        `,
        [ORGANIZATION_ID, photoArticleId],
      );
      if (photoRows.rows.length !== 1) {
        throw new Error(`Article photo replace must leave one file, got ${String(photoRows.rows.length)}.`);
      }
      if (photoRows.rows[0]?.object_key !== secondKey || photoRows.rows[0]?.original_filename !== "second.jpg") {
        throw new Error("Article photo replace must keep the newest object_key.");
      }
    });

    console.log(
      "inventory verification passed: missing context denied, wrong org denied, weight CHECK held, unique article number held, unavailable/inspection are not available, adjustment requires reason, mistaken-receipt delete removes receipt-only articles, sold/adjusted rows remain, available PATCH updates weights, sold identity PATCH rejected, article photo confirm replaces prior file.",
    );
  } finally {
    await pool.end();
  }
}

function staffAccess(row: {
  id: string;
  email: string;
  display_name: string;
  membership_id: string;
  role: "owner" | "admin" | "billing" | "inventory" | "girvi";
}): ResolvedStaffAccess {
  return {
    staff_user_id: row.id,
    email: row.email,
    display_name: row.display_name,
    membership: {
      id: row.membership_id,
      organization_id: ORGANIZATION_ID,
      branch_id: BRANCH_ID,
      role: row.role,
      status: "active",
    },
    permissions: permissionsForRole(row.role),
    permission_map_version: STAFF_PERMISSION_MAP_VERSION,
    authUserId: randomUUID(),
  };
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
