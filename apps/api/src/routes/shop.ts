import type { Express, NextFunction, Request, Response } from "express";
import type { Pool } from "@aabhushan/db";

import {
  createMetalRate,
  getDeviceSettings,
  getDocumentSequences,
  getReminderSettings,
  getShopProfile,
  listAuditEvents,
  listMetalRates,
  updateDeviceSettings,
  updateDocumentSequences,
  updateReminderSettings,
  updateShopProfile,
} from "@aabhushan/application";
import {
  auditListQuerySchema,
  deviceSettingsPatchSchema,
  documentSequencesPatchSchema,
  metalRateCreateSchema,
  metalRateListQuerySchema,
  reminderSettingsPatchSchema,
  shopProfilePatchSchema,
} from "@aabhushan/contracts";
import { createShopSettingsRepository, withOrganizationContext } from "@aabhushan/db";

import type { StaffRequest } from "../auth/require-staff-access";
import { parseBody, parseQuery, sendHandlerError } from "../http/errors";

async function withShopRepo<T>(pool: Pool, req: StaffRequest, fn: (repo: ReturnType<typeof createShopSettingsRepository>) => Promise<T>): Promise<T> {
  return withOrganizationContext(pool, { organizationId: req.staffAccess.membership.organization_id }, async (client) => {
    return fn(createShopSettingsRepository(client, req.staffAccess.membership.organization_id));
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

export function registerShopRoutes(app: Express, pool: Pool, requireStaff: (req: Request, res: Response, next: NextFunction) => void): void {
  app.get(
    "/api/v1/shop/profile",
    requireStaff,
    handle(async (req, res) => {
      const profile = await withShopRepo(pool, req, (repo) => getShopProfile(repo));
      res.status(200).json(profile);
    }),
  );

  app.patch(
    "/api/v1/shop/profile",
    requireStaff,
    handle(async (req, res) => {
      const patch = parseBody(shopProfilePatchSchema, req.body);
      const profile = await withShopRepo(pool, req, (repo) => updateShopProfile(repo, req.staffAccess, patch));
      res.status(200).json(profile);
    }),
  );

  app.get(
    "/api/v1/shop/rates",
    requireStaff,
    handle(async (req, res) => {
      const query = parseQuery(metalRateListQuerySchema, req);
      const result = await withShopRepo(pool, req, (repo) =>
        listMetalRates(repo, req.staffAccess, {
          page: query.page,
          pageSize: query.page_size,
          sort: query.sort,
          direction: query.direction,
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
    "/api/v1/shop/rates",
    requireStaff,
    handle(async (req, res) => {
      const body = parseBody(metalRateCreateSchema, req.body);
      const rate = await withShopRepo(pool, req, (repo) => createMetalRate(repo, req.staffAccess, body));
      res.status(201).json(rate);
    }),
  );

  app.get(
    "/api/v1/shop/sequences",
    requireStaff,
    handle(async (req, res) => {
      const items = await withShopRepo(pool, req, (repo) => getDocumentSequences(repo, req.staffAccess));
      res.status(200).json({ items });
    }),
  );

  app.patch(
    "/api/v1/shop/sequences",
    requireStaff,
    handle(async (req, res) => {
      const body = parseBody(documentSequencesPatchSchema, req.body);
      const items = await withShopRepo(pool, req, (repo) => updateDocumentSequences(repo, req.staffAccess, body.items));
      res.status(200).json({ items });
    }),
  );

  app.get(
    "/api/v1/shop/devices",
    requireStaff,
    handle(async (req, res) => {
      const devices = await withShopRepo(pool, req, (repo) => getDeviceSettings(repo, req.staffAccess));
      res.status(200).json(devices);
    }),
  );

  app.patch(
    "/api/v1/shop/devices",
    requireStaff,
    handle(async (req, res) => {
      const patch = parseBody(deviceSettingsPatchSchema, req.body);
      const devices = await withShopRepo(pool, req, (repo) => updateDeviceSettings(repo, req.staffAccess, patch));
      res.status(200).json(devices);
    }),
  );

  app.get(
    "/api/v1/shop/reminders",
    requireStaff,
    handle(async (req, res) => {
      const reminders = await withShopRepo(pool, req, (repo) => getReminderSettings(repo, req.staffAccess));
      res.status(200).json(reminders);
    }),
  );

  app.patch(
    "/api/v1/shop/reminders",
    requireStaff,
    handle(async (req, res) => {
      const patch = parseBody(reminderSettingsPatchSchema, req.body);
      const reminders = await withShopRepo(pool, req, (repo) => updateReminderSettings(repo, req.staffAccess, patch));
      res.status(200).json(reminders);
    }),
  );

  app.get(
    "/api/v1/audit",
    requireStaff,
    handle(async (req, res) => {
      const query = parseQuery(auditListQuerySchema, req);
      const result = await withShopRepo(pool, req, (repo) =>
        listAuditEvents(repo, req.staffAccess, {
          page: query.page,
          pageSize: query.page_size,
          sort: query.sort,
          direction: query.direction,
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
}
