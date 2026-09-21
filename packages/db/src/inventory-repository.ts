import { randomUUID } from "node:crypto";

import type { PoolClient } from "pg";

import type {
  Article,
  ArticleFile,
  ArticleListItem,
  ArticlePhotographInput,
  ArticleStatus,
  CatalogueCategory,
  InventoryMovement,
  Metal,
  StockCount,
  StorageLocation,
  TagPrintEvent,
} from "@aabhushan/contracts";
import type { ArticleListFilters, InventoryRepository } from "@aabhushan/application";

import { asBusinessDate, asDecimalString, asIsoDateTime } from "./pg-values";

const ARTICLE_SORT_COLUMNS = {
  created_at: "a.created_at",
  article_number: "a.article_number",
  status: "a.status",
  gross_weight_grams: "a.gross_weight_grams",
  receipt_business_date: "a.receipt_business_date",
} as const;

type CategoryRow = {
  id: string;
  name: string;
  default_metal: string | null;
  is_active: boolean;
};

type LocationRow = {
  id: string;
  name: string;
  branch_id: string;
};

type ArticleRow = {
  id: string;
  article_number: string;
  barcode: string | null;
  category_id: string;
  category_name: string;
  metal: string;
  purity: string;
  gross_weight_grams: string;
  non_metal_weight_grams: string;
  net_metal_weight_grams: string;
  huid: string | null;
  supplier_ref: string | null;
  karigar_ref: string | null;
  receipt_business_date: Date | string;
  acquisition_cost_inr: string | null;
  location_id: string | null;
  location_name: string | null;
  status: string;
  row_version: number;
  created_at: Date;
  updated_at: Date;
  deletable?: boolean;
};

type StoneRow = {
  id: string;
  description: string;
  weight_grams: string | null;
};

type FileRow = {
  id: string;
  object_key: string;
  checksum_sha256: string;
  content_type: string;
  original_filename: string;
  byte_size: number;
};

type MovementRow = {
  id: string;
  article_id: string;
  movement_type: string;
  from_status: string | null;
  to_status: string | null;
  reason: string | null;
  actor_staff_user_id: string;
  related_invoice_id: string | null;
  related_return_id: string | null;
  created_at: Date;
};

function asMetal(value: string): Metal {
  return value === "silver" ? "silver" : "gold";
}

function asStatus(value: string): ArticleStatus {
  if (value === "available" || value === "sold" || value === "return_inspection" || value === "unavailable") {
    return value;
  }
  return "unavailable";
}

function asOptionalStatus(value: string | null): ArticleStatus | null {
  return value ? asStatus(value) : null;
}

function articleIsSellable(status: ArticleStatus): boolean {
  return status === "available";
}

function asContentType(value: string): ArticleFile["content_type"] {
  if (value === "image/png") {
    return "image/png";
  }
  if (value === "image/webp") {
    return "image/webp";
  }
  return "image/jpeg";
}

function mapCategory(row: CategoryRow): CatalogueCategory {
  return {
    id: row.id,
    name: row.name,
    default_metal: row.default_metal === "gold" || row.default_metal === "silver" ? row.default_metal : null,
    is_active: row.is_active,
  };
}

function mapLocation(row: LocationRow): StorageLocation {
  return {
    id: row.id,
    name: row.name,
    branch_id: row.branch_id,
  };
}

function mapListItem(row: ArticleRow): ArticleListItem {
  const status = asStatus(row.status);
  return {
    id: row.id,
    article_number: row.article_number,
    barcode: row.barcode,
    category_id: row.category_id,
    category_name: row.category_name,
    metal: asMetal(row.metal),
    purity: row.purity,
    gross_weight_grams: asDecimalString(row.gross_weight_grams),
    non_metal_weight_grams: asDecimalString(row.non_metal_weight_grams),
    net_metal_weight_grams: asDecimalString(row.net_metal_weight_grams),
    location_id: row.location_id,
    location_name: row.location_name,
    status,
    sellable: articleIsSellable(status),
    deletable: row.deletable === true,
    receipt_business_date: asBusinessDate(row.receipt_business_date),
    row_version: row.row_version,
  };
}

function mapFile(row: FileRow): ArticleFile {
  return {
    id: row.id,
    object_key: row.object_key,
    checksum_sha256: row.checksum_sha256,
    content_type: asContentType(row.content_type),
    original_filename: row.original_filename,
    byte_size: row.byte_size,
  };
}

function mapMovement(row: MovementRow): InventoryMovement {
  return {
    id: row.id,
    article_id: row.article_id,
    movement_type:
      row.movement_type === "sale" ||
      row.movement_type === "return_in" ||
      row.movement_type === "inspection_release" ||
      row.movement_type === "adjustment"
        ? row.movement_type
        : "receipt",
    from_status: asOptionalStatus(row.from_status),
    to_status: asOptionalStatus(row.to_status),
    reason: row.reason,
    actor_staff_user_id: row.actor_staff_user_id,
    related_invoice_id: row.related_invoice_id,
    related_return_id: row.related_return_id,
    created_at: asIsoDateTime(row.created_at),
  };
}

const articleSelect = `
SELECT
  a.id,
  a.article_number,
  a.barcode,
  a.category_id,
  c.name AS category_name,
  a.metal,
  a.purity,
  a.gross_weight_grams,
  a.non_metal_weight_grams,
  a.net_metal_weight_grams,
  a.huid,
  a.supplier_ref,
  a.karigar_ref,
  a.receipt_business_date,
  a.acquisition_cost_inr,
  a.location_id,
  l.name AS location_name,
  a.status,
  a.row_version,
  a.created_at,
  a.updated_at,
  (
    a.status = 'available'
    AND EXISTS (
      SELECT 1 FROM app.inventory_movements m
      WHERE m.organization_id = a.organization_id AND m.article_id = a.id AND m.movement_type = 'receipt'
    )
    AND NOT EXISTS (
      SELECT 1 FROM app.inventory_movements m
      WHERE m.organization_id = a.organization_id AND m.article_id = a.id AND m.movement_type <> 'receipt'
    )
    AND NOT EXISTS (
      SELECT 1 FROM app.stock_count_lines scl
      WHERE scl.organization_id = a.organization_id AND scl.article_id = a.id
    )
  ) AS deletable
FROM app.articles a
INNER JOIN app.catalogue_categories c ON c.id = a.category_id
LEFT JOIN app.storage_locations l ON l.id = a.location_id
`;

export function createInventoryRepository(
  client: PoolClient,
  organizationId: string,
  branchId: string,
): InventoryRepository {
  async function loadArticle(articleId: string): Promise<Article | null> {
    const result = await client.query<ArticleRow>(`${articleSelect} WHERE a.organization_id = $1 AND a.id = $2`, [
      organizationId,
      articleId,
    ]);
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return hydrateArticle(row);
  }

  async function hydrateArticle(row: ArticleRow): Promise<Article> {
    const stones = await client.query<StoneRow>(
      `
      SELECT id, description, weight_grams
      FROM app.article_stones
      WHERE organization_id = $1 AND article_id = $2
      ORDER BY created_at
      `,
      [organizationId, row.id],
    );
    const files = await client.query<FileRow>(
      `
      SELECT id, object_key, checksum_sha256, content_type, original_filename, byte_size
      FROM app.article_files
      WHERE organization_id = $1 AND article_id = $2
      ORDER BY created_at DESC
      `,
      [organizationId, row.id],
    );
    const item = mapListItem(row);
    return {
      ...item,
      huid: row.huid,
      supplier_ref: row.supplier_ref,
      karigar_ref: row.karigar_ref,
      acquisition_cost_inr: row.acquisition_cost_inr === null ? null : asDecimalString(row.acquisition_cost_inr),
      stones: stones.rows.map((stone) => ({
        id: stone.id,
        description: stone.description,
        weight_grams: stone.weight_grams === null ? null : asDecimalString(stone.weight_grams),
      })),
      files: files.rows.map(mapFile),
      created_at: asIsoDateTime(row.created_at),
      updated_at: asIsoDateTime(row.updated_at),
    };
  }

  async function insertPhotograph(articleId: string, photograph: ArticlePhotographInput): Promise<void> {
    const fileId = randomUUID();
    const objectKey = `articles/${organizationId}/${articleId}/${fileId}`;
    await client.query(
      `
      INSERT INTO app.article_files (
        id, organization_id, article_id, object_key, checksum_sha256, content_type, original_filename, byte_size
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        fileId,
        organizationId,
        articleId,
        objectKey,
        photograph.checksum_sha256,
        photograph.content_type,
        photograph.original_filename,
        photograph.byte_size,
      ],
    );
  }

  return {
    async listCategories() {
      const result = await client.query<CategoryRow>(
        `
        SELECT id, name, default_metal, is_active
        FROM app.catalogue_categories
        WHERE organization_id = $1
        ORDER BY name
        `,
        [organizationId],
      );
      return result.rows.map(mapCategory);
    },

    async insertCategory(input) {
      const result = await client.query<CategoryRow>(
        `
        INSERT INTO app.catalogue_categories (organization_id, name, default_metal)
        VALUES ($1, $2, $3)
        RETURNING id, name, default_metal, is_active
        `,
        [organizationId, input.name, input.default_metal ?? null],
      );
      const row = result.rows[0];
      if (!row) {
        throw new Error("Category insert returned no row.");
      }
      return mapCategory(row);
    },

    async listLocations() {
      const result = await client.query<LocationRow>(
        `
        SELECT id, name, branch_id
        FROM app.storage_locations
        WHERE organization_id = $1 AND branch_id = $2
        ORDER BY name
        `,
        [organizationId, branchId],
      );
      return result.rows.map(mapLocation);
    },

    async insertLocation(input) {
      const result = await client.query<LocationRow>(
        `
        INSERT INTO app.storage_locations (organization_id, branch_id, name)
        VALUES ($1, $2, $3)
        RETURNING id, name, branch_id
        `,
        [organizationId, branchId, input.name],
      );
      const row = result.rows[0];
      if (!row) {
        throw new Error("Storage location insert returned no row.");
      }
      return mapLocation(row);
    },

    async categoryExists(categoryId) {
      const result = await client.query<{ exists: boolean }>(
        `SELECT EXISTS(SELECT 1 FROM app.catalogue_categories WHERE organization_id = $1 AND id = $2 AND is_active) AS exists`,
        [organizationId, categoryId],
      );
      return result.rows[0]?.exists === true;
    },

    async locationExists(locationId) {
      const result = await client.query<{ exists: boolean }>(
        `SELECT EXISTS(SELECT 1 FROM app.storage_locations WHERE organization_id = $1 AND branch_id = $2 AND id = $3) AS exists`,
        [organizationId, branchId, locationId],
      );
      return result.rows[0]?.exists === true;
    },

    async listArticles(input: ArticleListFilters) {
      const sort = ARTICLE_SORT_COLUMNS[input.sort as keyof typeof ARTICLE_SORT_COLUMNS] ?? "a.created_at";
      const direction = input.direction === "asc" ? "ASC" : "DESC";
      const offset = (input.page - 1) * input.pageSize;
      const values: unknown[] = [organizationId];
      const where: string[] = ["a.organization_id = $1"];

      if (input.q) {
        values.push(`%${input.q}%`);
        where.push(
          `(a.article_number ILIKE $${String(values.length)} OR COALESCE(a.barcode, '') ILIKE $${String(values.length)} OR COALESCE(a.huid, '') ILIKE $${String(values.length)} OR COALESCE(a.supplier_ref, '') ILIKE $${String(values.length)} OR COALESCE(a.karigar_ref, '') ILIKE $${String(values.length)})`,
        );
      }
      if (input.barcode) {
        values.push(input.barcode);
        where.push(`a.barcode = $${String(values.length)}`);
      }
      if (input.articleNumber) {
        values.push(input.articleNumber);
        where.push(`a.article_number = $${String(values.length)}`);
      }
      if (input.categoryId) {
        values.push(input.categoryId);
        where.push(`a.category_id = $${String(values.length)}`);
      }
      if (input.metal) {
        values.push(input.metal);
        where.push(`a.metal = $${String(values.length)}`);
      }
      if (input.purity) {
        values.push(input.purity);
        where.push(`a.purity = $${String(values.length)}`);
      }
      if (input.status) {
        values.push(input.status);
        where.push(`a.status = $${String(values.length)}`);
      }
      if (input.minGrossWeightGrams) {
        values.push(input.minGrossWeightGrams);
        where.push(`a.gross_weight_grams >= $${String(values.length)}::numeric`);
      }
      if (input.maxGrossWeightGrams) {
        values.push(input.maxGrossWeightGrams);
        where.push(`a.gross_weight_grams <= $${String(values.length)}::numeric`);
      }

      const whereSql = where.join(" AND ");
      values.push(input.pageSize, offset);
      const limitParam = values.length - 1;
      const offsetParam = values.length;
      const list = await client.query<ArticleRow>(
        `${articleSelect} WHERE ${whereSql} ORDER BY ${sort} ${direction}, a.created_at DESC LIMIT $${String(limitParam)} OFFSET $${String(offsetParam)}`,
        values,
      );
      const countValues = values.slice(0, -2);
      const count = await client.query<{ total: string }>(
        `SELECT count(*)::text AS total FROM app.articles a WHERE ${whereSql}`,
        countValues,
      );
      return {
        items: list.rows.map(mapListItem),
        total: Number.parseInt(count.rows[0]?.total ?? "0", 10),
      };
    },

    async getArticle(articleId) {
      return loadArticle(articleId);
    },

    async getArticleByBarcode(barcode) {
      const result = await client.query<ArticleRow>(`${articleSelect} WHERE a.organization_id = $1 AND a.barcode = $2`, [
        organizationId,
        barcode,
      ]);
      const row = result.rows[0];
      if (!row) {
        return null;
      }
      return hydrateArticle(row);
    },

    async allocateArticleNumber() {
      const result = await client.query<{ prefix: string; padding: number; next_value: number }>(
        `
        SELECT prefix, padding, next_value
        FROM app.document_sequences
        WHERE organization_id = $1 AND branch_id = $2 AND document_type = 'article'
        FOR UPDATE
        `,
        [organizationId, branchId],
      );
      const row = result.rows[0];
      if (!row) {
        throw new Error("Article document sequence is missing.");
      }
      const articleNumber = `${row.prefix}${String(row.next_value).padStart(row.padding, "0")}`;
      await client.query(
        `
        UPDATE app.document_sequences
        SET next_value = next_value + 1, updated_at = timezone('utc', now())
        WHERE organization_id = $1 AND branch_id = $2 AND document_type = 'article'
        `,
        [organizationId, branchId],
      );
      return articleNumber;
    },

    async insertArticle(input) {
      const inserted = await client.query<{ id: string }>(
        `
        INSERT INTO app.articles (
          organization_id, branch_id, article_number, category_id, metal, purity,
          gross_weight_grams, non_metal_weight_grams, net_metal_weight_grams,
          huid, supplier_ref, karigar_ref, receipt_business_date, acquisition_cost_inr,
          location_id, status
        )
        VALUES (
          $1, $2, $3, $4, $5, $6,
          $7::numeric, $8::numeric, $9::numeric,
          $10, $11, $12, $13::date, $14::numeric,
          $15, 'available'
        )
        RETURNING id
        `,
        [
          organizationId,
          branchId,
          input.articleNumber,
          input.categoryId,
          input.metal,
          input.purity,
          input.grossWeightGrams,
          input.nonMetalWeightGrams,
          input.netMetalWeightGrams,
          input.huid,
          input.supplierRef,
          input.karigarRef,
          input.receiptBusinessDate,
          input.acquisitionCostInr,
          input.locationId,
        ],
      );
      const articleId = inserted.rows[0]?.id;
      if (!articleId) {
        throw new Error("Article insert returned no row.");
      }

      for (const stone of input.stones) {
        await client.query(
          `
          INSERT INTO app.article_stones (organization_id, article_id, description, weight_grams)
          VALUES ($1, $2, $3, $4::numeric)
          `,
          [organizationId, articleId, stone.description, stone.weightGrams],
        );
      }

      if (input.photograph) {
        await insertPhotograph(articleId, input.photograph);
      }

      await client.query(
        `
        INSERT INTO app.inventory_movements (
          organization_id, article_id, movement_type, from_status, to_status, actor_staff_user_id
        )
        VALUES ($1, $2, 'receipt', NULL, 'available', $3)
        `,
        [organizationId, articleId, input.actorStaffUserId],
      );

      const article = await loadArticle(articleId);
      if (!article) {
        throw new Error("Received article could not be reloaded.");
      }
      return article;
    },

    async updateArticle(input) {
      const result = await client.query<{ id: string }>(
        `
        UPDATE app.articles
        SET
          category_id = COALESCE($3, category_id),
          metal = COALESCE($4, metal),
          purity = COALESCE($5, purity),
          gross_weight_grams = COALESCE($6::numeric, gross_weight_grams),
          non_metal_weight_grams = COALESCE($7::numeric, non_metal_weight_grams),
          net_metal_weight_grams = COALESCE($8::numeric, net_metal_weight_grams),
          huid = CASE WHEN $9::boolean THEN $10 ELSE huid END,
          supplier_ref = CASE WHEN $11::boolean THEN $12 ELSE supplier_ref END,
          karigar_ref = CASE WHEN $13::boolean THEN $14 ELSE karigar_ref END,
          location_id = CASE WHEN $15::boolean THEN $16 ELSE location_id END,
          row_version = row_version + 1,
          updated_at = timezone('utc', now())
        WHERE organization_id = $1 AND id = $2 AND row_version = $17
        RETURNING id
        `,
        [
          organizationId,
          input.articleId,
          input.categoryId ?? null,
          input.metal ?? null,
          input.purity ?? null,
          input.grossWeightGrams ?? null,
          input.nonMetalWeightGrams ?? null,
          input.netMetalWeightGrams ?? null,
          input.huid !== undefined,
          input.huid ?? null,
          input.supplierRef !== undefined,
          input.supplierRef ?? null,
          input.karigarRef !== undefined,
          input.karigarRef ?? null,
          input.locationId !== undefined,
          input.locationId ?? null,
          input.expectedVersion,
        ],
      );
      if (!result.rows[0]) {
        return null;
      }
      if (input.photograph) {
        await insertPhotograph(input.articleId, input.photograph);
      }
      return loadArticle(input.articleId);
    },

    async applyStatusChange(input) {
      const result = await client.query<{ id: string }>(
        `
        UPDATE app.articles
        SET
          status = $3,
          location_id = CASE WHEN $4::boolean THEN $5 ELSE location_id END,
          row_version = row_version + 1,
          updated_at = timezone('utc', now())
        WHERE organization_id = $1 AND id = $2 AND row_version = $6 AND status = $7
        RETURNING id
        `,
        [
          organizationId,
          input.articleId,
          input.toStatus,
          input.locationId !== undefined,
          input.locationId ?? null,
          input.expectedVersion,
          input.fromStatus,
        ],
      );
      if (!result.rows[0]) {
        return null;
      }
      await client.query(
        `
        INSERT INTO app.inventory_movements (
          organization_id, article_id, movement_type, from_status, to_status, reason, actor_staff_user_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
        [
          organizationId,
          input.articleId,
          input.movementType,
          input.fromStatus,
          input.toStatus,
          input.reason,
          input.actorStaffUserId,
        ],
      );
      return loadArticle(input.articleId);
    },

    async listMovements(articleId) {
      const result = await client.query<MovementRow>(
        `
        SELECT id, article_id, movement_type, from_status, to_status, reason, actor_staff_user_id,
               related_invoice_id, related_return_id, created_at
        FROM app.inventory_movements
        WHERE organization_id = $1 AND article_id = $2
        ORDER BY created_at DESC
        LIMIT 200
        `,
        [organizationId, articleId],
      );
      return result.rows.map(mapMovement);
    },

    async getArticlesByIds(articleIds) {
      if (articleIds.length === 0) {
        return [];
      }
      const result = await client.query<ArticleRow>(`${articleSelect} WHERE a.organization_id = $1 AND a.id = ANY($2::uuid[])`, [
        organizationId,
        articleIds,
      ]);
      return result.rows.map(mapListItem);
    },

    async insertReviewedStockCount(input) {
      const header = await client.query<{ id: string; created_at: Date }>(
        `
        INSERT INTO app.stock_counts (
          organization_id, branch_id, counted_on, status, notes, actor_staff_user_id
        )
        VALUES ($1, $2, $3::date, 'reviewed', $4, $5)
        RETURNING id, created_at
        `,
        [organizationId, branchId, input.countedOn, input.notes, input.actorStaffUserId],
      );
      const stockCountId = header.rows[0]?.id;
      const createdAt = header.rows[0]?.created_at;
      if (!stockCountId || !createdAt) {
        throw new Error("Stock count insert returned no row.");
      }

      for (const line of input.lines) {
        await client.query(
          `
          INSERT INTO app.stock_count_lines (
            organization_id, stock_count_id, article_id, expected_status, counted_status, has_discrepancy
          )
          VALUES ($1, $2, $3, $4, $5, $6)
          `,
          [organizationId, stockCountId, line.articleId, line.expectedStatus, line.countedStatus, line.hasDiscrepancy],
        );

        if (line.adjustmentToStatus && line.adjustmentToStatus !== line.expectedStatus) {
          await client.query(
            `
            UPDATE app.articles
            SET status = $3, row_version = row_version + 1, updated_at = timezone('utc', now())
            WHERE organization_id = $1 AND id = $2 AND status = $4
            `,
            [organizationId, line.articleId, line.adjustmentToStatus, line.expectedStatus],
          );
          await client.query(
            `
            INSERT INTO app.inventory_movements (
              organization_id, article_id, movement_type, from_status, to_status, reason, actor_staff_user_id
            )
            VALUES ($1, $2, 'adjustment', $3, $4, $5, $6)
            `,
            [
              organizationId,
              line.articleId,
              line.expectedStatus,
              line.adjustmentToStatus,
              "Stock count discrepancy",
              input.actorStaffUserId,
            ],
          );
        }
      }

      return {
        id: stockCountId,
        counted_on: input.countedOn,
        status: "reviewed",
        notes: input.notes,
        actor_staff_user_id: input.actorStaffUserId,
        lines: input.lines.map((line) => ({
          article_id: line.articleId,
          article_number: line.articleNumber,
          expected_status: line.expectedStatus,
          counted_status: line.countedStatus,
          has_discrepancy: line.hasDiscrepancy,
        })),
        created_at: asIsoDateTime(createdAt),
      } satisfies StockCount;
    },

    async assignBarcodeIfMissing(articleId, payload) {
      const locked = await client.query<{ id: string }>(
        `
        SELECT id
        FROM app.articles
        WHERE organization_id = $1 AND id = $2
        FOR UPDATE
        `,
        [organizationId, articleId],
      );
      if (!locked.rows[0]) {
        return null;
      }
      const assigned = await client.query<{ id: string }>(
        `
        UPDATE app.articles
        SET barcode = $3, updated_at = timezone('utc', now())
        WHERE organization_id = $1 AND id = $2 AND barcode IS NULL
        RETURNING id
        `,
        [organizationId, articleId, payload],
      );
      const article = await loadArticle(articleId);
      if (!article) {
        return null;
      }
      return { article, assigned: Boolean(assigned.rows[0]) };
    },

    async getDeviceTagLayout() {
      const result = await client.query<{ tag_width_mm: string; tag_height_mm: string }>(
        `
        SELECT tag_width_mm::text, tag_height_mm::text
        FROM app.device_settings
        WHERE organization_id = $1
        `,
        [organizationId],
      );
      const row = result.rows[0];
      if (!row) {
        return null;
      }
      return {
        tagWidthMm: asDecimalString(row.tag_width_mm),
        tagHeightMm: asDecimalString(row.tag_height_mm),
      };
    },

    async getShopTagBranding() {
      const result = await client.query<{
        legal_name: string;
        logo_object_key: string | null;
        logo_content_type: string | null;
      }>(
        `
        SELECT legal_name, logo_object_key, logo_content_type
        FROM app.shop_profiles
        WHERE organization_id = $1
        LIMIT 1
        `,
        [organizationId],
      );
      const row = result.rows[0];
      if (!row) {
        return null;
      }
      const logoContentType =
        row.logo_content_type === "image/jpeg" ||
        row.logo_content_type === "image/png" ||
        row.logo_content_type === "image/webp"
          ? row.logo_content_type
          : null;
      return {
        legalName: row.legal_name,
        logoObjectKey: row.logo_object_key,
        logoContentType,
      };
    },

    async insertTagPrintEvent(input) {
      const result = await client.query<{
        id: string;
        article_id: string;
        barcode: string;
        print_kind: string;
        reason: string | null;
        template_version: string;
        actor_staff_user_id: string;
        created_at: Date;
      }>(
        `
        INSERT INTO app.tag_print_events (
          organization_id, article_id, barcode, print_kind, reason, template_version, actor_staff_user_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, article_id, barcode, print_kind, reason, template_version, actor_staff_user_id, created_at
        `,
        [
          organizationId,
          input.articleId,
          input.barcode,
          input.printKind,
          input.reason,
          input.templateVersion,
          input.actorStaffUserId,
        ],
      );
      const row = result.rows[0];
      if (!row) {
        throw new Error("Tag print insert returned no row.");
      }
      return {
        id: row.id,
        article_id: row.article_id,
        barcode: row.barcode,
        print_kind: row.print_kind === "reprint" || row.print_kind === "batch" ? row.print_kind : "initial",
        reason: row.reason,
        template_version: row.template_version,
        actor_staff_user_id: row.actor_staff_user_id,
        created_at: asIsoDateTime(row.created_at),
      } satisfies TagPrintEvent;
    },

    async writeAudit(event) {
      await client.query(
        `
        INSERT INTO app.audit_events (
          organization_id, actor_staff_user_id, action, entity_type, entity_id, reason, payload
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
        `,
        [
          organizationId,
          event.actorStaffUserId,
          event.action,
          event.entityType,
          event.entityId ?? null,
          event.reason ?? null,
          event.payload ? JSON.stringify(event.payload) : null,
        ],
      );
    },

    async getArticleDeleteEligibility(articleId) {
      const locked = await client.query<{ article_number: string; status: string }>(
        `
        SELECT article_number, status
        FROM app.articles
        WHERE organization_id = $1 AND id = $2
        FOR UPDATE
        `,
        [organizationId, articleId],
      );
      const row = locked.rows[0];
      if (!row) {
        return null;
      }
      const movements = await client.query<{ movement_type: string }>(
        `
        SELECT movement_type
        FROM app.inventory_movements
        WHERE organization_id = $1 AND article_id = $2
        `,
        [organizationId, articleId],
      );
      const countRef = await client.query<{ exists: boolean }>(
        `
        SELECT EXISTS(
          SELECT 1 FROM app.stock_count_lines
          WHERE organization_id = $1 AND article_id = $2
        ) AS exists
        `,
        [organizationId, articleId],
      );
      return {
        articleNumber: row.article_number,
        status: asStatus(row.status),
        movementTypes: movements.rows.map((movement) =>
          movement.movement_type === "sale" ||
          movement.movement_type === "return_in" ||
          movement.movement_type === "inspection_release" ||
          movement.movement_type === "adjustment"
            ? movement.movement_type
            : "receipt",
        ),
        hasStockCountReference: countRef.rows[0]?.exists === true,
      };
    },

    async deleteMistakenReceiptArticle(articleId) {
      await client.query(`DELETE FROM app.tag_print_events WHERE organization_id = $1 AND article_id = $2`, [
        organizationId,
        articleId,
      ]);
      await client.query(`DELETE FROM app.article_stones WHERE organization_id = $1 AND article_id = $2`, [
        organizationId,
        articleId,
      ]);
      await client.query(`DELETE FROM app.article_files WHERE organization_id = $1 AND article_id = $2`, [
        organizationId,
        articleId,
      ]);
      await client.query(`DELETE FROM app.inventory_movements WHERE organization_id = $1 AND article_id = $2`, [
        organizationId,
        articleId,
      ]);
      const deleted = await client.query(
        `DELETE FROM app.articles WHERE organization_id = $1 AND id = $2 RETURNING id`,
        [organizationId, articleId],
      );
      if (!deleted.rows[0]) {
        throw new Error("Article delete returned no row.");
      }
    },
  };
}
