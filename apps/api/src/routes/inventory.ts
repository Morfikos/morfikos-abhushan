import type { Express, NextFunction, Request, Response } from "express";
import type { Pool } from "@aabhushan/db";

import {
  adjustArticle,
  assignArticleBarcode,
  assignArticleBarcodesBatch,
  bulkDeleteArticles,
  createCatalogueCategory,
  createPurityLabel,
  createStockCount,
  createStorageLocation,
  deleteArticle,
  getArticle,
  getArticleTagPreview,
  listArticleMovements,
  listArticles,
  listCatalogueCategories,
  listPurityLabels,
  listStorageLocations,
  lookupArticleByBarcode,
  patchPurityLabel,
  patchStorageLocation,
  receiveArticle,
  recordArticleTagPrint,
  releaseArticleFromInspection,
  updateArticle,
} from "@aabhushan/application";
import {
  articleAdjustmentSchema,
  articleBarcodeBatchSchema,
  articleBulkDeleteSchema,
  articleCreateSchema,
  articleInspectionReleaseSchema,
  articleListQuerySchema,
  articleLookupQuerySchema,
  articlePatchSchema,
  catalogueCategoryCreateSchema,
  purityLabelCreateSchema,
  purityLabelListQuerySchema,
  purityLabelPatchSchema,
  stockCountCreateSchema,
  storageLocationCreateSchema,
  storageLocationListQuerySchema,
  storageLocationPatchSchema,
  tagPrintCreateSchema,
} from "@aabhushan/contracts";
import { createInventoryRepository, withOrganizationContext } from "@aabhushan/db";
import { renderCode128Svg } from "@aabhushan/integrations";
import type { ShopAssetStorage } from "@aabhushan/application";

import type { StaffRequest } from "../auth/require-staff-access";
import { parseBody, parsePathUuid, parseQuery, sendHandlerError } from "../http/errors";

async function withInventoryRepo<T>(
  pool: Pool,
  req: StaffRequest,
  fn: (repo: ReturnType<typeof createInventoryRepository>) => Promise<T>,
): Promise<T> {
  return withOrganizationContext(pool, { organizationId: req.staffAccess.membership.organization_id }, async (client) => {
    return fn(
      createInventoryRepository(client, req.staffAccess.membership.organization_id, req.staffAccess.membership.branch_id),
    );
  });
}

function handle(fn: (req: StaffRequest, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    void fn(req as StaffRequest, res).catch((error: unknown) => {
      if (!sendHandlerError(req, res, error)) {
        next(error);
      }
    });
  };
}

export function registerInventoryRoutes(
  app: Express,
  pool: Pool,
  requireStaff: (req: Request, res: Response, next: NextFunction) => void,
  storage: ShopAssetStorage | null,
): void {
  app.get(
    "/api/v1/catalogue-categories",
    requireStaff,
    handle(async (req, res) => {
      const items = await withInventoryRepo(pool, req, (repo) => listCatalogueCategories(repo, req.staffAccess));
      res.status(200).json({ items });
    }),
  );

  app.post(
    "/api/v1/catalogue-categories",
    requireStaff,
    handle(async (req, res) => {
      const body = parseBody(catalogueCategoryCreateSchema, req.body);
      const category = await withInventoryRepo(pool, req, (repo) => createCatalogueCategory(repo, req.staffAccess, body));
      res.status(201).json(category);
    }),
  );

  app.get(
    "/api/v1/storage-locations",
    requireStaff,
    handle(async (req, res) => {
      const query = parseQuery(storageLocationListQuerySchema, req);
      const items = await withInventoryRepo(pool, req, (repo) =>
        listStorageLocations(repo, req.staffAccess, { includeInactive: query.include_inactive }),
      );
      res.status(200).json({ items });
    }),
  );

  app.post(
    "/api/v1/storage-locations",
    requireStaff,
    handle(async (req, res) => {
      const body = parseBody(storageLocationCreateSchema, req.body);
      const location = await withInventoryRepo(pool, req, (repo) => createStorageLocation(repo, req.staffAccess, body));
      res.status(201).json(location);
    }),
  );

  app.patch(
    "/api/v1/storage-locations/:id",
    requireStaff,
    handle(async (req, res) => {
      const locationId = parsePathUuid(req.params.id, "id");
      const body = parseBody(storageLocationPatchSchema, req.body);
      const location = await withInventoryRepo(pool, req, (repo) =>
        patchStorageLocation(repo, req.staffAccess, locationId, body),
      );
      res.status(200).json(location);
    }),
  );

  app.get(
    "/api/v1/purity-labels",
    requireStaff,
    handle(async (req, res) => {
      const query = parseQuery(purityLabelListQuerySchema, req);
      const items = await withInventoryRepo(pool, req, (repo) =>
        listPurityLabels(repo, req.staffAccess, { includeInactive: query.include_inactive }),
      );
      res.status(200).json({ items });
    }),
  );

  app.post(
    "/api/v1/purity-labels",
    requireStaff,
    handle(async (req, res) => {
      const body = parseBody(purityLabelCreateSchema, req.body);
      const label = await withInventoryRepo(pool, req, (repo) => createPurityLabel(repo, req.staffAccess, body));
      res.status(201).json(label);
    }),
  );

  app.patch(
    "/api/v1/purity-labels/:id",
    requireStaff,
    handle(async (req, res) => {
      const purityLabelId = parsePathUuid(req.params.id, "id");
      const body = parseBody(purityLabelPatchSchema, req.body);
      const label = await withInventoryRepo(pool, req, (repo) =>
        patchPurityLabel(repo, req.staffAccess, purityLabelId, body),
      );
      res.status(200).json(label);
    }),
  );

  app.get(
    "/api/v1/articles/lookup",
    requireStaff,
    handle(async (req, res) => {
      const query = parseQuery(articleLookupQuerySchema, req);
      const article = await withInventoryRepo(pool, req, (repo) =>
        lookupArticleByBarcode(repo, req.staffAccess, query.barcode, query.for_sale === "true"),
      );
      res.status(200).json(article);
    }),
  );

  app.post(
    "/api/v1/articles/barcodes/batch",
    requireStaff,
    handle(async (req, res) => {
      const body = parseBody(articleBarcodeBatchSchema, req.body);
      const items = await withInventoryRepo(pool, req, (repo) =>
        assignArticleBarcodesBatch(repo, req.staffAccess, body.ids),
      );
      res.status(200).json({ items });
    }),
  );

  app.get(
    "/api/v1/articles",
    requireStaff,
    handle(async (req, res) => {
      const query = parseQuery(articleListQuerySchema, req);
      const result = await withInventoryRepo(pool, req, (repo) =>
        listArticles(repo, req.staffAccess, {
          page: query.page,
          pageSize: query.page_size,
          sort: query.sort,
          direction: query.direction,
          ...(query.q ? { q: query.q } : {}),
          ...(query.barcode ? { barcode: query.barcode } : {}),
          ...(query.article_number ? { articleNumber: query.article_number } : {}),
          ...(query.category_id ? { categoryId: query.category_id } : {}),
          ...(query.metal ? { metal: query.metal } : {}),
          ...(query.purity ? { purity: query.purity } : {}),
          ...(query.status ? { status: query.status } : {}),
          ...(query.min_gross_weight_grams ? { minGrossWeightGrams: query.min_gross_weight_grams } : {}),
          ...(query.max_gross_weight_grams ? { maxGrossWeightGrams: query.max_gross_weight_grams } : {}),
        }),
      );
      res.status(200).json({
        items: result.items,
        page: query.page,
        page_size: query.page_size,
        total: result.total,
        sort: query.sort,
        direction: query.direction,
      });
    }),
  );

  app.post(
    "/api/v1/articles",
    requireStaff,
    handle(async (req, res) => {
      const body = parseBody(articleCreateSchema, req.body);
      const article = await withInventoryRepo(pool, req, (repo) => receiveArticle(repo, req.staffAccess, body));
      res.status(201).json(article);
    }),
  );

  app.post(
    "/api/v1/articles/bulk-delete",
    requireStaff,
    handle(async (req, res) => {
      const body = parseBody(articleBulkDeleteSchema, req.body);
      const result = await withInventoryRepo(pool, req, (repo) => bulkDeleteArticles(repo, req.staffAccess, body.ids));
      res.status(200).json(result);
    }),
  );

  app.get(
    "/api/v1/articles/:id/movements",
    requireStaff,
    handle(async (req, res) => {
      const articleId = parsePathUuid(req.params.id, "id");
      const items = await withInventoryRepo(pool, req, (repo) => listArticleMovements(repo, req.staffAccess, articleId));
      res.status(200).json({ items });
    }),
  );

  app.post(
    "/api/v1/articles/:id/adjustments",
    requireStaff,
    handle(async (req, res) => {
      const articleId = parsePathUuid(req.params.id, "id");
      const body = parseBody(articleAdjustmentSchema, req.body);
      const article = await withInventoryRepo(pool, req, (repo) => adjustArticle(repo, req.staffAccess, articleId, body));
      res.status(201).json(article);
    }),
  );

  app.post(
    "/api/v1/articles/:id/inspection-release",
    requireStaff,
    handle(async (req, res) => {
      const articleId = parsePathUuid(req.params.id, "id");
      const body = parseBody(articleInspectionReleaseSchema, req.body);
      const article = await withInventoryRepo(pool, req, (repo) =>
        releaseArticleFromInspection(repo, req.staffAccess, articleId, body),
      );
      res.status(200).json(article);
    }),
  );

  app.post(
    "/api/v1/articles/:id/barcode",
    requireStaff,
    handle(async (req, res) => {
      const articleId = parsePathUuid(req.params.id, "id");
      const article = await withInventoryRepo(pool, req, (repo) => assignArticleBarcode(repo, req.staffAccess, articleId));
      res.status(200).json(article);
    }),
  );

  app.get(
    "/api/v1/articles/:id/tag-preview",
    requireStaff,
    handle(async (req, res) => {
      const articleId = parsePathUuid(req.params.id, "id");
      const preview = await withInventoryRepo(pool, req, (repo) =>
        getArticleTagPreview(
          repo,
          req.staffAccess,
          articleId,
          renderCode128Svg,
          async (objectKey, contentType) => {
            if (!storage) {
              return null;
            }
            return storage.downloadAsDataUri(objectKey, contentType);
          },
        ),
      );
      res.status(200).json(preview);
    }),
  );

  app.post(
    "/api/v1/articles/:id/tag-prints",
    requireStaff,
    handle(async (req, res) => {
      const articleId = parsePathUuid(req.params.id, "id");
      const body = parseBody(tagPrintCreateSchema, req.body);
      const event = await withInventoryRepo(pool, req, (repo) =>
        recordArticleTagPrint(repo, req.staffAccess, articleId, body),
      );
      res.status(201).json(event);
    }),
  );

  app.get(
    "/api/v1/articles/:id",
    requireStaff,
    handle(async (req, res) => {
      const articleId = parsePathUuid(req.params.id, "id");
      const article = await withInventoryRepo(pool, req, (repo) => getArticle(repo, req.staffAccess, articleId));
      res.status(200).json(article);
    }),
  );

  app.patch(
    "/api/v1/articles/:id",
    requireStaff,
    handle(async (req, res) => {
      const articleId = parsePathUuid(req.params.id, "id");
      const body = parseBody(articlePatchSchema, req.body);
      const article = await withInventoryRepo(pool, req, (repo) => updateArticle(repo, req.staffAccess, articleId, body));
      res.status(200).json(article);
    }),
  );

  app.delete(
    "/api/v1/articles/:id",
    requireStaff,
    handle(async (req, res) => {
      const articleId = parsePathUuid(req.params.id, "id");
      await withInventoryRepo(pool, req, (repo) => deleteArticle(repo, req.staffAccess, articleId));
      res.status(204).send();
    }),
  );

  app.post(
    "/api/v1/stock-counts",
    requireStaff,
    handle(async (req, res) => {
      const body = parseBody(stockCountCreateSchema, req.body);
      const count = await withInventoryRepo(pool, req, (repo) => createStockCount(repo, req.staffAccess, body));
      res.status(201).json(count);
    }),
  );
}
