import type { Express, NextFunction, Request, Response } from "express";
import type { Pool } from "@aabhushan/db";

import {
  activateGirviAccount,
  createGirviDraft,
  deleteGirviDraft,
  getGirviAccount,
  getGirviCollateralFileView,
  getGirviStatement,
  listGirviAccounts,
  moveGirviCustodyLocation,
  patchGirviDraft,
  quoteGirviSettlement,
  recordGirviRepayment,
  releaseGirviCollateral,
  settleGirviAccount,
  uploadGirviCollateralFile,
  type ShopAssetStorage,
} from "@aabhushan/application";
import {
  girviAccountActivateSchema,
  girviAccountCreateSchema,
  girviAccountListQuerySchema,
  girviAccountPatchSchema,
  girviCollateralFileUploadQuerySchema,
  girviCustodyMoveCreateSchema,
  girviDraftDeleteQuerySchema,
  girviReleaseCreateSchema,
  girviRepaymentCreateSchema,
  girviSettlementCreateSchema,
  girviSettlementQuoteRequestSchema,
  girviStatementQuerySchema,
} from "@aabhushan/contracts";
import { GIRVI_COLLATERAL_MAX_BYTES } from "@aabhushan/domain";
import { createGirviRepository, withOrganizationContext } from "@aabhushan/db";
import multer from "multer";

import type { StaffRequest } from "../auth/require-staff-access";
import { parseBody, parsePathUuid, parseQuery, sendHandlerError } from "../http/errors";

const collateralUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: GIRVI_COLLATERAL_MAX_BYTES, files: 1 },
});

function handle(fn: (req: StaffRequest, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    void fn(req as StaffRequest, res).catch((error: unknown) => {
      if (!sendHandlerError(req, res, error)) {
        next(error);
      }
    });
  };
}

function idempotencyKeyFrom(req: Request): string | undefined {
  const raw = req.headers["idempotency-key"];
  if (typeof raw === "string") {
    return raw;
  }
  if (Array.isArray(raw) && typeof raw[0] === "string") {
    return raw[0];
  }
  return undefined;
}

export function registerGirviRoutes(
  app: Express,
  pool: Pool,
  requireStaff: (req: Request, res: Response, next: NextFunction) => void,
  storage: ShopAssetStorage | null = null,
): void {
  app.get(
    "/api/v1/girvi/accounts",
    requireStaff,
    handle(async (req, res) => {
      const query = parseQuery(girviAccountListQuerySchema, req);
      const result = await withOrganizationContext(
        pool,
        { organizationId: req.staffAccess.membership.organization_id },
        async (client) => {
          const repo = createGirviRepository(
            client,
            req.staffAccess.membership.organization_id,
            req.staffAccess.membership.branch_id,
          );
          return listGirviAccounts(repo, req.staffAccess, {
            page: query.page,
            pageSize: query.page_size,
            sort: query.sort,
            direction: query.direction,
            ...(query.status ? { status: query.status } : {}),
            ...(query.customer_id ? { customerId: query.customer_id } : {}),
            ...(query.maturity_from ? { maturityFrom: query.maturity_from } : {}),
            ...(query.maturity_to ? { maturityTo: query.maturity_to } : {}),
            ...(query.is_overdue === true ? { isOverdue: true } : {}),
            ...(query.q ? { q: query.q } : {}),
          });
        },
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
    "/api/v1/girvi/accounts",
    requireStaff,
    handle(async (req, res) => {
      const body = parseBody(girviAccountCreateSchema, req.body);
      const result = await withOrganizationContext(
        pool,
        { organizationId: req.staffAccess.membership.organization_id },
        async (client) => {
          const repo = createGirviRepository(
            client,
            req.staffAccess.membership.organization_id,
            req.staffAccess.membership.branch_id,
          );
          return createGirviDraft(repo, req.staffAccess, body);
        },
      );
      res.status(201).json(result);
    }),
  );

  app.get(
    "/api/v1/girvi/accounts/:id",
    requireStaff,
    handle(async (req, res) => {
      const accountId = parsePathUuid(req.params.id, "id");
      const result = await withOrganizationContext(
        pool,
        { organizationId: req.staffAccess.membership.organization_id },
        async (client) => {
          const repo = createGirviRepository(
            client,
            req.staffAccess.membership.organization_id,
            req.staffAccess.membership.branch_id,
          );
          return getGirviAccount(repo, req.staffAccess, accountId);
        },
      );
      res.status(200).json(result);
    }),
  );

  app.patch(
    "/api/v1/girvi/accounts/:id",
    requireStaff,
    handle(async (req, res) => {
      const accountId = parsePathUuid(req.params.id, "id");
      const body = parseBody(girviAccountPatchSchema, req.body);
      const result = await withOrganizationContext(
        pool,
        { organizationId: req.staffAccess.membership.organization_id },
        async (client) => {
          const repo = createGirviRepository(
            client,
            req.staffAccess.membership.organization_id,
            req.staffAccess.membership.branch_id,
          );
          return patchGirviDraft(repo, req.staffAccess, accountId, body);
        },
      );
      res.status(200).json(result);
    }),
  );

  app.delete(
    "/api/v1/girvi/accounts/:id",
    requireStaff,
    handle(async (req, res) => {
      const accountId = parsePathUuid(req.params.id, "id");
      const query = parseQuery(girviDraftDeleteQuerySchema, req);
      await withOrganizationContext(
        pool,
        { organizationId: req.staffAccess.membership.organization_id },
        async (client) => {
          const repo = createGirviRepository(
            client,
            req.staffAccess.membership.organization_id,
            req.staffAccess.membership.branch_id,
          );
          await deleteGirviDraft(repo, req.staffAccess, accountId, query.row_version, storage);
        },
      );
      res.status(204).send();
    }),
  );

  app.post(
    "/api/v1/girvi/accounts/:id/activate",
    requireStaff,
    handle(async (req, res) => {
      const accountId = parsePathUuid(req.params.id, "id");
      const body = parseBody(girviAccountActivateSchema, req.body);
      const result = await withOrganizationContext(
        pool,
        { organizationId: req.staffAccess.membership.organization_id },
        async (client) => {
          const repo = createGirviRepository(
            client,
            req.staffAccess.membership.organization_id,
            req.staffAccess.membership.branch_id,
          );
          return activateGirviAccount(repo, req.staffAccess, accountId, body, idempotencyKeyFrom(req));
        },
      );
      res.status(200).json(result);
    }),
  );

  // Reading a statement never posts interest; it recalculates from frozen terms.
  app.get(
    "/api/v1/girvi/accounts/:id/statement",
    requireStaff,
    handle(async (req, res) => {
      const accountId = parsePathUuid(req.params.id, "id");
      const query = parseQuery(girviStatementQuerySchema, req);
      const result = await withOrganizationContext(
        pool,
        { organizationId: req.staffAccess.membership.organization_id },
        async (client) => {
          const repo = createGirviRepository(
            client,
            req.staffAccess.membership.organization_id,
            req.staffAccess.membership.branch_id,
          );
          return getGirviStatement(repo, req.staffAccess, accountId, query.as_of);
        },
      );
      res.status(200).json(result);
    }),
  );

  app.post(
    "/api/v1/girvi/accounts/:id/repayments",
    requireStaff,
    handle(async (req, res) => {
      const accountId = parsePathUuid(req.params.id, "id");
      const body = parseBody(girviRepaymentCreateSchema, req.body);
      const result = await withOrganizationContext(
        pool,
        { organizationId: req.staffAccess.membership.organization_id },
        async (client) => {
          const repo = createGirviRepository(
            client,
            req.staffAccess.membership.organization_id,
            req.staffAccess.membership.branch_id,
          );
          return recordGirviRepayment(repo, req.staffAccess, accountId, body, idempotencyKeyFrom(req));
        },
      );
      res.status(201).json(result);
    }),
  );

  app.post(
    "/api/v1/girvi/accounts/:id/settlement-quote",
    requireStaff,
    handle(async (req, res) => {
      const accountId = parsePathUuid(req.params.id, "id");
      const body = parseBody(girviSettlementQuoteRequestSchema, req.body ?? {});
      const result = await withOrganizationContext(
        pool,
        { organizationId: req.staffAccess.membership.organization_id },
        async (client) => {
          const repo = createGirviRepository(
            client,
            req.staffAccess.membership.organization_id,
            req.staffAccess.membership.branch_id,
          );
          return quoteGirviSettlement(repo, req.staffAccess, accountId, body.business_date);
        },
      );
      res.status(200).json(result);
    }),
  );

  app.post(
    "/api/v1/girvi/accounts/:id/settle",
    requireStaff,
    handle(async (req, res) => {
      const accountId = parsePathUuid(req.params.id, "id");
      const body = parseBody(girviSettlementCreateSchema, req.body);
      const result = await withOrganizationContext(
        pool,
        { organizationId: req.staffAccess.membership.organization_id },
        async (client) => {
          const repo = createGirviRepository(
            client,
            req.staffAccess.membership.organization_id,
            req.staffAccess.membership.branch_id,
          );
          return settleGirviAccount(repo, req.staffAccess, accountId, body, idempotencyKeyFrom(req));
        },
      );
      res.status(201).json(result);
    }),
  );

  // Physical handover is a separate audited action behind `girvi.release`.
  app.post(
    "/api/v1/girvi/accounts/:id/release",
    requireStaff,
    handle(async (req, res) => {
      const accountId = parsePathUuid(req.params.id, "id");
      const body = parseBody(girviReleaseCreateSchema, req.body);
      const result = await withOrganizationContext(
        pool,
        { organizationId: req.staffAccess.membership.organization_id },
        async (client) => {
          const repo = createGirviRepository(
            client,
            req.staffAccess.membership.organization_id,
            req.staffAccess.membership.branch_id,
          );
          return releaseGirviCollateral(repo, req.staffAccess, accountId, body, idempotencyKeyFrom(req));
        },
      );
      res.status(201).json(result);
    }),
  );

  app.post(
    "/api/v1/girvi/accounts/:id/custody-moves",
    requireStaff,
    handle(async (req, res) => {
      const accountId = parsePathUuid(req.params.id, "id");
      const body = parseBody(girviCustodyMoveCreateSchema, req.body);
      const result = await withOrganizationContext(
        pool,
        { organizationId: req.staffAccess.membership.organization_id },
        async (client) => {
          const repo = createGirviRepository(
            client,
            req.staffAccess.membership.organization_id,
            req.staffAccess.membership.branch_id,
          );
          return moveGirviCustodyLocation(repo, req.staffAccess, accountId, body, idempotencyKeyFrom(req));
        },
      );
      res.status(201).json(result);
    }),
  );

  app.post(
    "/api/v1/girvi/accounts/:id/collateral/:itemId/files",
    requireStaff,
    (req, res, next) => {
      collateralUpload.single("file")(req, res, (error: unknown) => {
        if (error instanceof multer.MulterError) {
          if (error.code === "LIMIT_FILE_SIZE") {
            res.status(422).json({
              code: "VALIDATION_ERROR",
              message: "Collateral photo must be at most 5 MB.",
              field_errors: [{ field: "file", message: "Maximum size is 5 MB." }],
              request_id: req.headers["x-request-id"] ?? null,
            });
            return;
          }
          res.status(422).json({
            code: "VALIDATION_ERROR",
            message: "Invalid collateral photo upload.",
            field_errors: [{ field: "file", message: error.message }],
            request_id: req.headers["x-request-id"] ?? null,
          });
          return;
        }
        if (error) {
          next(error);
          return;
        }
        next();
      });
    },
    handle(async (req, res) => {
      const accountId = parsePathUuid(req.params.id, "id");
      const itemId = parsePathUuid(req.params.itemId, "itemId");
      const query = parseQuery(girviCollateralFileUploadQuerySchema, req);
      const file = req.file;
      if (!file) {
        res.status(422).json({
          code: "VALIDATION_ERROR",
          message: 'Attach a JPEG, PNG, or WebP file as field "file".',
          field_errors: [{ field: "file", message: "File is required." }],
          request_id: req.headers["x-request-id"] ?? null,
        });
        return;
      }
      const result = await withOrganizationContext(
        pool,
        { organizationId: req.staffAccess.membership.organization_id },
        async (client) => {
          const repo = createGirviRepository(
            client,
            req.staffAccess.membership.organization_id,
            req.staffAccess.membership.branch_id,
          );
          return uploadGirviCollateralFile(repo, req.staffAccess, storage, {
            accountId,
            collateralItemId: itemId,
            bytes: file.buffer,
            declaredContentType: file.mimetype,
            purpose: query.purpose,
          });
        },
      );
      res.status(201).json(result);
    }),
  );

  app.get(
    "/api/v1/girvi/accounts/:id/collateral/:itemId/files/:fileId",
    requireStaff,
    handle(async (req, res) => {
      const accountId = parsePathUuid(req.params.id, "id");
      const itemId = parsePathUuid(req.params.itemId, "itemId");
      const fileId = parsePathUuid(req.params.fileId, "fileId");
      const result = await withOrganizationContext(
        pool,
        { organizationId: req.staffAccess.membership.organization_id },
        async (client) => {
          const repo = createGirviRepository(
            client,
            req.staffAccess.membership.organization_id,
            req.staffAccess.membership.branch_id,
          );
          return getGirviCollateralFileView(repo, req.staffAccess, storage, {
            accountId,
            collateralItemId: itemId,
            fileId,
          });
        },
      );
      res.status(200).json(result);
    }),
  );
}
