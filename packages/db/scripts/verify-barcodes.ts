import { randomUUID } from "node:crypto";

import { Pool } from "pg";

import {
  ApplicationHttpError,
  assignArticleBarcode,
  lookupArticleByBarcode,
  type ResolvedStaffAccess,
} from "@aabhushan/application";
import { permissionsForRole, STAFF_PERMISSION_MAP_VERSION, articleBarcodePayload } from "@aabhushan/domain";
import { createInventoryRepository } from "../src/inventory-repository";

/**
 * Real PostgreSQL and application checks for spec 05: unique barcodes,
 * idempotent assign, and sold-article POS lookup rejection.
 *
 * Usage: DATABASE_URL=... pnpm --filter @aabhushan/db verify:barcodes
 */
const ORGANIZATION_ID = "11111111-1111-4111-8111-111111111111";
const BRANCH_ID = "22222222-2222-4222-8222-222222222222";

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  const pool = new Pool({ connectionString: databaseUrl, max: 2 });

  try {
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
        throw new Error("An active staff user is required for barcode verification.");
      }

      const category = await client.query<{ id: string }>(
        "SELECT id FROM app.catalogue_categories WHERE organization_id = $1 LIMIT 1",
        [ORGANIZATION_ID],
      );
      const categoryId = category.rows[0]?.id;
      if (!categoryId) {
        throw new Error("Seeded catalogue categories are required.");
      }

      const hardware = await client.query<{ hardware_validated_at: Date | null }>(
        "SELECT hardware_validated_at FROM app.device_settings WHERE organization_id = $1",
        [ORGANIZATION_ID],
      );
      if (hardware.rows[0] && hardware.rows[0].hardware_validated_at !== null) {
        throw new Error("hardware_validated_at must stay null until a physical drill succeeds.");
      }

      const unsafeBarcode = await withSavepoint(client, "unsafe_barcode", () =>
        insertArticle(client, {
          articleNumber: `VERIFY-BC-UNSAFE-${randomUUID().slice(0, 8).toUpperCase()}`,
          categoryId,
          status: "available",
          barcode: "not valid!",
        }),
      );
      if (unsafeBarcode !== "23514") {
        throw new Error(`Code 128-unsafe barcode must be rejected by CHECK, got ${unsafeBarcode}.`);
      }

      const sharedBarcode = `VERIFY-DUP-${randomUUID().slice(0, 8).toUpperCase()}`;
      await insertArticle(client, {
        articleNumber: `VERIFY-BC-A-${randomUUID().slice(0, 8).toUpperCase()}`,
        categoryId,
        status: "available",
        barcode: sharedBarcode,
      });
      const duplicateBarcode = await withSavepoint(client, "duplicate_barcode", () =>
        insertArticle(client, {
          articleNumber: `VERIFY-BC-B-${randomUUID().slice(0, 8).toUpperCase()}`,
          categoryId,
          status: "available",
          barcode: sharedBarcode,
        }),
      );
      if (duplicateBarcode !== "23505") {
        throw new Error(`Duplicate organization barcode must be rejected, got ${duplicateBarcode}.`);
      }

      const assignNumber = `VERIFY-BC-${randomUUID().slice(0, 8).toUpperCase()}`;
      const assignId = await insertArticle(client, {
        articleNumber: assignNumber,
        categoryId,
        status: "available",
        barcode: null,
      });
      const expectedPayload = articleBarcodePayload(assignNumber);
      const repo = createInventoryRepository(client, ORGANIZATION_ID, BRANCH_ID);
      const access = staffAccess(staffRow);
      const first = await assignArticleBarcode(repo, access, assignId);
      const second = await assignArticleBarcode(repo, access, assignId);
      if (first.barcode !== expectedPayload || second.barcode !== expectedPayload) {
        throw new Error("Barcode assign must be deterministic from the article number.");
      }
      if (first.barcode !== second.barcode) {
        throw new Error("Idempotent assign must keep the original barcode.");
      }

      const reprintWithoutReason = await withSavepoint(client, "reprint_reason", () =>
        client.query(
          `
          INSERT INTO app.tag_print_events (
            organization_id, article_id, barcode, print_kind, template_version, actor_staff_user_id
          )
        VALUES ($1, $2, $3, 'reprint', 'tag-v4', $4)
          `,
          [ORGANIZATION_ID, assignId, expectedPayload, staffRow.id],
        ),
      );
      if (reprintWithoutReason !== "23514") {
        throw new Error(`Reprint without reason must be rejected, got ${reprintWithoutReason}.`);
      }

      await client.query(
        `
        INSERT INTO app.tag_print_events (
          organization_id, article_id, barcode, print_kind, reason, template_version, actor_staff_user_id
        )
        VALUES ($1, $2, $3, 'reprint', 'Damaged tag', 'tag-v4', $4)
        `,
        [ORGANIZATION_ID, assignId, expectedPayload, staffRow.id],
      );
      const afterReprint = await client.query<{ barcode: string }>("SELECT barcode FROM app.articles WHERE id = $1", [
        assignId,
      ]);
      if (afterReprint.rows[0]?.barcode !== expectedPayload) {
        throw new Error("Reprint must not issue a new barcode.");
      }

      const soldNumber = `VERIFY-SOLD-BC-${randomUUID().slice(0, 8).toUpperCase()}`;
      const soldBarcode = articleBarcodePayload(soldNumber);
      await insertArticle(client, {
        articleNumber: soldNumber,
        categoryId,
        status: "sold",
        barcode: soldBarcode,
      });
      try {
        await lookupArticleByBarcode(repo, access, soldBarcode, true);
        throw new Error("Sold article POS lookup must fail.");
      } catch (error) {
        if (!(error instanceof ApplicationHttpError) || error.code !== "ARTICLE_SOLD") {
          throw error instanceof Error ? error : new Error("Sold article POS lookup must fail as ARTICLE_SOLD.");
        }
      }

      const historical = await lookupArticleByBarcode(repo, access, soldBarcode, false);
      if (historical.barcode !== soldBarcode || historical.status !== "sold") {
        throw new Error("Sold article lookup without for_sale must still return the historical tag.");
      }

      const unavailableNumber = `VERIFY-UNAV-BC-${randomUUID().slice(0, 8).toUpperCase()}`;
      const unavailableBarcode = articleBarcodePayload(unavailableNumber);
      await insertArticle(client, {
        articleNumber: unavailableNumber,
        categoryId,
        status: "unavailable",
        barcode: unavailableBarcode,
      });
      try {
        await lookupArticleByBarcode(repo, access, unavailableBarcode, true);
        throw new Error("Unavailable article POS lookup must fail.");
      } catch (error) {
        if (!(error instanceof ApplicationHttpError) || error.code !== "ARTICLE_NOT_SELLABLE") {
          throw error instanceof Error ? error : new Error("Unavailable POS lookup must fail as ARTICLE_NOT_SELLABLE.");
        }
      }

      try {
        await lookupArticleByBarcode(repo, access, "UNKNOWN-BARCODE-NOT-STORED", false);
        throw new Error("Unknown barcode lookup must fail.");
      } catch (error) {
        if (!(error instanceof ApplicationHttpError) || error.code !== "NOT_FOUND") {
          throw error instanceof Error ? error : new Error("Unknown barcode must fail as NOT_FOUND.");
        }
      }
    });

    console.log(
      "barcode verification passed: unique barcode held, Code 128 CHECK held, assign is idempotent, reprint keeps the payload, sold POS add fails, unavailable POS add fails, unknown barcode 404s, hardware_validated_at stays null.",
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

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
