import type { Express, NextFunction, Request, Response } from "express";
import type { Pool } from "@aabhushan/db";

import { inviteStaffMember, listStaffDirectory, suspendStaffMember, type StaffAuthInviter } from "@aabhushan/application";
import { staffInviteRequestSchema, staffListQuerySchema } from "@aabhushan/contracts";
import type { ServerEnv } from "@aabhushan/config/server";
import { createStaffDirectoryRepository, withOrganizationContext } from "@aabhushan/db";

import type { StaffRequest } from "../auth/require-staff-access";
import { parseBody, parseQuery, sendHandlerError } from "../http/errors";

function handle(fn: (req: StaffRequest, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    void fn(req as StaffRequest, res).catch((error: unknown) => {
      if (!sendHandlerError(req, res, error)) {
        next(error);
      }
    });
  };
}

export function registerStaffRoutes(
  app: Express,
  pool: Pool,
  env: ServerEnv,
  authInviter: StaffAuthInviter | null,
  requireStaff: (req: Request, res: Response, next: NextFunction) => void,
): void {
  app.get(
    "/api/v1/staff",
    requireStaff,
    handle(async (req, res) => {
      const query = parseQuery(staffListQuerySchema, req);
      const result = await withOrganizationContext(
        pool,
        { organizationId: req.staffAccess.membership.organization_id },
        async (client) => {
          const repo = createStaffDirectoryRepository(
            client,
            req.staffAccess.membership.organization_id,
            req.staffAccess.membership.branch_id,
          );
          return listStaffDirectory(repo, req.staffAccess, {
            page: query.page,
            pageSize: query.page_size,
            sort: query.sort,
            direction: query.direction,
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
    "/api/v1/staff",
    requireStaff,
    handle(async (req, res) => {
      const body = parseBody(staffInviteRequestSchema, req.body);
      const redirectTo = `${env.WEB_ORIGIN.replace(/\/$/, "")}/auth/callback?next=/invite/accept`;
      const staff = await withOrganizationContext(
        pool,
        { organizationId: req.staffAccess.membership.organization_id },
        async (client) => {
          const repo = createStaffDirectoryRepository(
            client,
            req.staffAccess.membership.organization_id,
            req.staffAccess.membership.branch_id,
          );
          return inviteStaffMember(repo, authInviter, req.staffAccess, body, redirectTo);
        },
      );
      res.status(201).json(staff);
    }),
  );

  app.post(
    "/api/v1/staff/:id/suspend",
    requireStaff,
    handle(async (req, res) => {
      const staffUserId = typeof req.params.id === "string" ? req.params.id : req.params.id?.[0];
      if (!staffUserId) {
        res.status(400).json({
          code: "INVALID_INPUT",
          message: "A staff user id is required.",
          request_id: req.requestId,
          field_errors: [],
        });
        return;
      }

      const staff = await withOrganizationContext(
        pool,
        { organizationId: req.staffAccess.membership.organization_id },
        async (client) => {
          const repo = createStaffDirectoryRepository(
            client,
            req.staffAccess.membership.organization_id,
            req.staffAccess.membership.branch_id,
          );
          return suspendStaffMember(repo, req.staffAccess, staffUserId);
        },
      );
      res.status(200).json(staff);
    }),
  );
}
