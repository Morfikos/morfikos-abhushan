import type { Express, NextFunction, Request, Response } from "express";
import type { Pool } from "@aabhushan/db";
import type { ServerEnv } from "@aabhushan/config/server";
import multer from "multer";

import {
  createMetalRate,
  deleteMakingChargeDefault,
  getDeviceSettings,
  getDocumentSequences,
  getPublicShopBranding,
  getReminderSettings,
  getShopProfile,
  listAuditEvents,
  listMakingChargeDefaults,
  listMetalRates,
  removeShopLogo,
  updateDeviceSettings,
  updateDocumentSequences,
  updateReminderSettings,
  updateShopProfile,
  uploadShopLogo,
  upsertMakingChargeDefault,
  type ShopAssetStorage,
} from "@aabhushan/application";
import {
  auditListQuerySchema,
  deviceSettingsPatchSchema,
  documentSequencesPatchSchema,
  makingChargeDefaultListQuerySchema,
  makingChargeDefaultUpsertSchema,
  metalRateCreateSchema,
  metalRateListQuerySchema,
  reminderSettingsPatchSchema,
  shopProfilePatchSchema,
} from "@aabhushan/contracts";
import { SHOP_LOGO_MAX_BYTES } from "@aabhushan/domain";
import { createShopSettingsRepository, withOrganizationContext } from "@aabhushan/db";

import type { StaffRequest } from "../auth/require-staff-access";
import { parseBody, parsePathUuid, parseQuery, sendHandlerError } from "../http/errors";

/** Seeded single-organization id for public branding (MVP one-shop). */
const PUBLIC_ORGANIZATION_ID = "11111111-1111-4111-8111-111111111111";

const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: SHOP_LOGO_MAX_BYTES, files: 1 },
});

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

export function registerShopRoutes(
  app: Express,
  pool: Pool,
  requireStaff: (req: Request, res: Response, next: NextFunction) => void,
  storage: ShopAssetStorage | null,
): void {
  app.get(
    "/api/v1/public/shop-branding",
    (req, res, next) => {
      void (async () => {
        const branding = await withOrganizationContext(pool, { organizationId: PUBLIC_ORGANIZATION_ID }, async (client) => {
          const repo = createShopSettingsRepository(client, PUBLIC_ORGANIZATION_ID);
          return getPublicShopBranding(repo, storage);
        });
        res.status(200).json(branding);
      })().catch((error: unknown) => {
        if (!sendHandlerError(req, res, error)) {
          next(error);
        }
      });
    },
  );

  app.get(
    "/api/v1/shop/profile",
    requireStaff,
    handle(async (req, res) => {
      const profile = await withShopRepo(pool, req, (repo) => getShopProfile(repo, storage));
      res.status(200).json(profile);
    }),
  );

  app.patch(
    "/api/v1/shop/profile",
    requireStaff,
    handle(async (req, res) => {
      const patch = parseBody(shopProfilePatchSchema, req.body);
      const profile = await withShopRepo(pool, req, (repo) => updateShopProfile(repo, req.staffAccess, patch, storage));
      res.status(200).json(profile);
    }),
  );

  app.post(
    "/api/v1/shop/logo",
    requireStaff,
    (req, res, next) => {
      logoUpload.single("file")(req, res, (error: unknown) => {
        if (error instanceof multer.MulterError) {
          if (error.code === "LIMIT_FILE_SIZE") {
            res.status(422).json({
              code: "VALIDATION_ERROR",
              message: "Shop logo must be at most 1 MB.",
              field_errors: [{ field: "file", message: "Maximum size is 1 MB." }],
              request_id: req.headers["x-request-id"] ?? null,
            });
            return;
          }
          res.status(422).json({
            code: "VALIDATION_ERROR",
            message: "Invalid logo upload.",
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
      const file = req.file;
      if (!file) {
        res.status(422).json({
          code: "VALIDATION_ERROR",
          message: "Attach a JPEG, PNG, or WebP file as field \"file\".",
          field_errors: [{ field: "file", message: "File is required." }],
          request_id: req.headers["x-request-id"] ?? null,
        });
        return;
      }
      const profile = await withShopRepo(pool, req, (repo) =>
        uploadShopLogo(repo, req.staffAccess, storage, {
          bytes: file.buffer,
          declaredContentType: file.mimetype,
        }),
      );
      res.status(200).json(profile);
    }),
  );

  app.delete(
    "/api/v1/shop/logo",
    requireStaff,
    handle(async (req, res) => {
      const profile = await withShopRepo(pool, req, (repo) => removeShopLogo(repo, req.staffAccess, storage));
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
    "/api/v1/shop/making-defaults",
    requireStaff,
    handle(async (req, res) => {
      const query = parseQuery(makingChargeDefaultListQuerySchema, req);
      const result = await withShopRepo(pool, req, (repo) =>
        listMakingChargeDefaults(repo, req.staffAccess, {
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

  app.put(
    "/api/v1/shop/making-defaults",
    requireStaff,
    handle(async (req, res) => {
      const body = parseBody(makingChargeDefaultUpsertSchema, req.body);
      const row = await withShopRepo(pool, req, (repo) => upsertMakingChargeDefault(repo, req.staffAccess, body));
      res.status(200).json(row);
    }),
  );

  app.delete(
    "/api/v1/shop/making-defaults/:id",
    requireStaff,
    handle(async (req, res) => {
      const id = parsePathUuid(req.params.id, "id");
      await withShopRepo(pool, req, (repo) => deleteMakingChargeDefault(repo, req.staffAccess, id));
      res.status(204).send();
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

// Keep ServerEnv import available for future storage wiring without unused noise.
void (0 as unknown as ServerEnv);
