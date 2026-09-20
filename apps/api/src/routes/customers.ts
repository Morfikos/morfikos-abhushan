import type { Express, NextFunction, Request, Response } from "express";
import type { Pool } from "@aabhushan/db";

import {
  createCustomer,
  getCustomer,
  listCustomerConsents,
  listCustomerIdentityFiles,
  listCustomers,
  putCustomerConsents,
  updateCustomer,
} from "@aabhushan/application";
import {
  customerConsentsPutSchema,
  customerCreateSchema,
  customerListQuerySchema,
  customerPatchSchema,
} from "@aabhushan/contracts";
import { createCustomerRepository, withOrganizationContext } from "@aabhushan/db";

import type { StaffRequest } from "../auth/require-staff-access";
import { parseBody, parsePathUuid, parseQuery, sendHandlerError } from "../http/errors";

async function withCustomerRepo<T>(
  pool: Pool,
  req: StaffRequest,
  fn: (repo: ReturnType<typeof createCustomerRepository>) => Promise<T>,
): Promise<T> {
  return withOrganizationContext(pool, { organizationId: req.staffAccess.membership.organization_id }, async (client) => {
    return fn(createCustomerRepository(client, req.staffAccess.membership.organization_id));
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

export function registerCustomerRoutes(
  app: Express,
  pool: Pool,
  requireStaff: (req: Request, res: Response, next: NextFunction) => void,
): void {
  app.get(
    "/api/v1/customers",
    requireStaff,
    handle(async (req, res) => {
      const query = parseQuery(customerListQuerySchema, req);
      const result = await withCustomerRepo(pool, req, (repo) =>
        listCustomers(repo, req.staffAccess, {
          page: query.page,
          pageSize: query.page_size,
          sort: query.sort,
          direction: query.direction,
          ...(query.is_active !== undefined ? { isActive: query.is_active } : {}),
          ...(query.q ? { q: query.q } : {}),
          ...(query.is_walk_in !== undefined ? { isWalkIn: query.is_walk_in } : {}),
          ...(query.whatsapp_consent ? { whatsappConsent: query.whatsapp_consent } : {}),
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
    "/api/v1/customers",
    requireStaff,
    handle(async (req, res) => {
      const body = parseBody(customerCreateSchema, req.body);
      const customer = await withCustomerRepo(pool, req, (repo) => createCustomer(repo, req.staffAccess, body));
      res.status(201).json(customer);
    }),
  );

  app.get(
    "/api/v1/customers/:id/consents",
    requireStaff,
    handle(async (req, res) => {
      const customerId = parsePathUuid(req.params.id, "id");
      const items = await withCustomerRepo(pool, req, (repo) => listCustomerConsents(repo, req.staffAccess, customerId));
      res.status(200).json({ items });
    }),
  );

  app.put(
    "/api/v1/customers/:id/consents",
    requireStaff,
    handle(async (req, res) => {
      const customerId = parsePathUuid(req.params.id, "id");
      const body = parseBody(customerConsentsPutSchema, req.body);
      const items = await withCustomerRepo(pool, req, (repo) =>
        putCustomerConsents(repo, req.staffAccess, customerId, body.items),
      );
      res.status(200).json({ items });
    }),
  );

  app.get(
    "/api/v1/customers/:id/identity-files",
    requireStaff,
    handle(async (req, res) => {
      const customerId = parsePathUuid(req.params.id, "id");
      const items = await withCustomerRepo(pool, req, (repo) =>
        listCustomerIdentityFiles(repo, req.staffAccess, customerId),
      );
      res.status(200).json({ items });
    }),
  );

  app.get(
    "/api/v1/customers/:id",
    requireStaff,
    handle(async (req, res) => {
      const customerId = parsePathUuid(req.params.id, "id");
      const customer = await withCustomerRepo(pool, req, (repo) => getCustomer(repo, req.staffAccess, customerId));
      res.status(200).json(customer);
    }),
  );

  app.patch(
    "/api/v1/customers/:id",
    requireStaff,
    handle(async (req, res) => {
      const customerId = parsePathUuid(req.params.id, "id");
      const body = parseBody(customerPatchSchema, req.body);
      const customer = await withCustomerRepo(pool, req, (repo) =>
        updateCustomer(repo, req.staffAccess, customerId, body),
      );
      res.status(200).json(customer);
    }),
  );
}
