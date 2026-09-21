import {
  createExport,
  getCollectionsReport,
  getDashboardReport,
  getExportJob,
  getGirviReport,
  getInventoryReport,
  getSalesReport,
  type ShopAssetStorage,
} from "@aabhushan/application";
import { exportCreateSchema, reportRangeQuerySchema } from "@aabhushan/contracts";
import { createReportsRepository, withOrganizationContext, type Pool } from "@aabhushan/db";
import type { Express, NextFunction, Request, Response } from "express";

import type { StaffRequest } from "../auth/require-staff-access";
import { parseBody, parsePathUuid, parseQuery, sendHandlerError } from "../http/errors";

function handle(fn: (req: StaffRequest, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    void fn(req as StaffRequest, res).catch((error: unknown) => {
      if (!sendHandlerError(req, res, error)) {
        next(error);
      }
    });
  };
}

function noStore(res: Response): void {
  res.setHeader("Cache-Control", "private, no-store");
}

export function registerReportRoutes(
  app: Express,
  pool: Pool,
  requireStaff: (req: Request, res: Response, next: NextFunction) => void,
  storage: ShopAssetStorage | null,
): void {
  app.get(
    "/api/v1/reports/dashboard",
    requireStaff,
    handle(async (req, res) => {
      const query = parseQuery(reportRangeQuerySchema, req);
      const result = await withOrganizationContext(
        pool,
        { organizationId: req.staffAccess.membership.organization_id },
        async (client) => {
          const repo = createReportsRepository(client, req.staffAccess.membership.organization_id);
          return getDashboardReport(req.staffAccess, repo, query);
        },
      );
      noStore(res);
      res.status(200).json(result);
    }),
  );

  app.get(
    "/api/v1/reports/sales",
    requireStaff,
    handle(async (req, res) => {
      const query = parseQuery(reportRangeQuerySchema, req);
      const result = await withOrganizationContext(
        pool,
        { organizationId: req.staffAccess.membership.organization_id },
        async (client) => {
          const repo = createReportsRepository(client, req.staffAccess.membership.organization_id);
          return getSalesReport(req.staffAccess, repo, query);
        },
      );
      noStore(res);
      res.status(200).json(result);
    }),
  );

  app.get(
    "/api/v1/reports/collections",
    requireStaff,
    handle(async (req, res) => {
      const query = parseQuery(reportRangeQuerySchema, req);
      const result = await withOrganizationContext(
        pool,
        { organizationId: req.staffAccess.membership.organization_id },
        async (client) => {
          const repo = createReportsRepository(client, req.staffAccess.membership.organization_id);
          return getCollectionsReport(req.staffAccess, repo, query);
        },
      );
      noStore(res);
      res.status(200).json(result);
    }),
  );

  app.get(
    "/api/v1/reports/inventory",
    requireStaff,
    handle(async (req, res) => {
      const result = await withOrganizationContext(
        pool,
        { organizationId: req.staffAccess.membership.organization_id },
        async (client) => {
          const repo = createReportsRepository(client, req.staffAccess.membership.organization_id);
          return getInventoryReport(req.staffAccess, repo);
        },
      );
      noStore(res);
      res.status(200).json(result);
    }),
  );

  app.get(
    "/api/v1/reports/girvi",
    requireStaff,
    handle(async (req, res) => {
      const query = parseQuery(reportRangeQuerySchema, req);
      const result = await withOrganizationContext(
        pool,
        { organizationId: req.staffAccess.membership.organization_id },
        async (client) => {
          const repo = createReportsRepository(client, req.staffAccess.membership.organization_id);
          return getGirviReport(req.staffAccess, repo, query);
        },
      );
      noStore(res);
      res.status(200).json(result);
    }),
  );

  app.post(
    "/api/v1/exports",
    requireStaff,
    handle(async (req, res) => {
      const body = parseBody(exportCreateSchema, req.body);
      const result = await withOrganizationContext(
        pool,
        { organizationId: req.staffAccess.membership.organization_id },
        async (client) => {
          const repo = createReportsRepository(client, req.staffAccess.membership.organization_id);
          return createExport(req.staffAccess, repo, body);
        },
      );
      noStore(res);
      res.status(result.delivery === "queued" ? 202 : 200).json(result);
    }),
  );

  app.get(
    "/api/v1/exports/:id",
    requireStaff,
    handle(async (req, res) => {
      const id = parsePathUuid(req.params.id, "id");
      const result = await withOrganizationContext(
        pool,
        { organizationId: req.staffAccess.membership.organization_id },
        async (client) => {
          const repo = createReportsRepository(client, req.staffAccess.membership.organization_id);
          return getExportJob(req.staffAccess, repo, storage, id);
        },
      );
      noStore(res);
      res.status(200).json(result);
    }),
  );
}
