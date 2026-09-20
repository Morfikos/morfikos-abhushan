import type { Express, NextFunction, Request, Response } from "express";
import type { Pool } from "@aabhushan/db";

import {
  collectionsPeriodFromQuery,
  getCustomerSalesStatement,
  getDailyCollections,
  getPayment,
  listInvoicePayments,
  listPayments,
  paymentListDateFilters,
  recordPayment,
  refundPayment,
  reversePayment,
} from "@aabhushan/application";
import {
  dailyCollectionsQuerySchema,
  paymentCreateSchema,
  paymentListQuerySchema,
  paymentRefundCreateSchema,
  paymentReversalCreateSchema,
} from "@aabhushan/contracts";
import { createPaymentRepository, withOrganizationContext } from "@aabhushan/db";

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

export function registerPaymentRoutes(
  app: Express,
  pool: Pool,
  requireStaff: (req: Request, res: Response, next: NextFunction) => void,
): void {
  app.post(
    "/api/v1/payments",
    requireStaff,
    handle(async (req, res) => {
      const body = parseBody(paymentCreateSchema, req.body);
      const idempotencyKey = idempotencyKeyFrom(req);
      const result = await withOrganizationContext(
        pool,
        { organizationId: req.staffAccess.membership.organization_id },
        async (client) => {
          const repo = createPaymentRepository(
            client,
            req.staffAccess.membership.organization_id,
            req.staffAccess.membership.branch_id,
          );
          return recordPayment(repo, req.staffAccess, body, idempotencyKey);
        },
      );
      res.status(201).json(result);
    }),
  );

  app.get(
    "/api/v1/payments",
    requireStaff,
    handle(async (req, res) => {
      const query = parseQuery(paymentListQuerySchema, req);
      const dateFilters = paymentListDateFilters(query);
      const result = await withOrganizationContext(
        pool,
        { organizationId: req.staffAccess.membership.organization_id },
        async (client) => {
          const repo = createPaymentRepository(
            client,
            req.staffAccess.membership.organization_id,
            req.staffAccess.membership.branch_id,
          );
          return listPayments(repo, req.staffAccess, {
            page: query.page,
            pageSize: query.page_size,
            sort: query.sort,
            direction: query.direction,
            ...(query.customer_id ? { customerId: query.customer_id } : {}),
            ...(query.invoice_id ? { invoiceId: query.invoice_id } : {}),
            ...(query.method ? { method: query.method } : {}),
            ...dateFilters,
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

  app.get(
    "/api/v1/collections/daily",
    requireStaff,
    handle(async (req, res) => {
      const query = parseQuery(dailyCollectionsQuerySchema, req);
      const period = collectionsPeriodFromQuery(query);
      const collections = await withOrganizationContext(
        pool,
        { organizationId: req.staffAccess.membership.organization_id },
        async (client) => {
          const repo = createPaymentRepository(
            client,
            req.staffAccess.membership.organization_id,
            req.staffAccess.membership.branch_id,
          );
          return getDailyCollections(repo, req.staffAccess, period);
        },
      );
      res.status(200).json(collections);
    }),
  );

  app.get(
    "/api/v1/payments/:id",
    requireStaff,
    handle(async (req, res) => {
      const paymentId = parsePathUuid(req.params.id, "id");
      const payment = await withOrganizationContext(
        pool,
        { organizationId: req.staffAccess.membership.organization_id },
        async (client) => {
          const repo = createPaymentRepository(
            client,
            req.staffAccess.membership.organization_id,
            req.staffAccess.membership.branch_id,
          );
          return getPayment(repo, req.staffAccess, paymentId);
        },
      );
      res.status(200).json(payment);
    }),
  );

  app.post(
    "/api/v1/payments/:id/refunds",
    requireStaff,
    handle(async (req, res) => {
      const paymentId = parsePathUuid(req.params.id, "id");
      const body = parseBody(paymentRefundCreateSchema, req.body);
      const idempotencyKey = idempotencyKeyFrom(req);
      const payment = await withOrganizationContext(
        pool,
        { organizationId: req.staffAccess.membership.organization_id },
        async (client) => {
          const repo = createPaymentRepository(
            client,
            req.staffAccess.membership.organization_id,
            req.staffAccess.membership.branch_id,
          );
          return refundPayment(repo, req.staffAccess, paymentId, body, idempotencyKey);
        },
      );
      res.status(201).json(payment);
    }),
  );

  app.post(
    "/api/v1/payments/:id/reversals",
    requireStaff,
    handle(async (req, res) => {
      const paymentId = parsePathUuid(req.params.id, "id");
      const body = parseBody(paymentReversalCreateSchema, req.body);
      const idempotencyKey = idempotencyKeyFrom(req);
      const payment = await withOrganizationContext(
        pool,
        { organizationId: req.staffAccess.membership.organization_id },
        async (client) => {
          const repo = createPaymentRepository(
            client,
            req.staffAccess.membership.organization_id,
            req.staffAccess.membership.branch_id,
          );
          return reversePayment(repo, req.staffAccess, paymentId, body, idempotencyKey);
        },
      );
      res.status(201).json(payment);
    }),
  );

  app.get(
    "/api/v1/invoices/:id/payments",
    requireStaff,
    handle(async (req, res) => {
      const invoiceId = parsePathUuid(req.params.id, "id");
      const result = await withOrganizationContext(
        pool,
        { organizationId: req.staffAccess.membership.organization_id },
        async (client) => {
          const repo = createPaymentRepository(
            client,
            req.staffAccess.membership.organization_id,
            req.staffAccess.membership.branch_id,
          );
          return listInvoicePayments(repo, req.staffAccess, invoiceId);
        },
      );
      res.status(200).json(result);
    }),
  );

  app.get(
    "/api/v1/customers/:id/sales-statement",
    requireStaff,
    handle(async (req, res) => {
      const customerId = parsePathUuid(req.params.id, "id");
      const statement = await withOrganizationContext(
        pool,
        { organizationId: req.staffAccess.membership.organization_id },
        async (client) => {
          const repo = createPaymentRepository(
            client,
            req.staffAccess.membership.organization_id,
            req.staffAccess.membership.branch_id,
          );
          return getCustomerSalesStatement(repo, req.staffAccess, customerId);
        },
      );
      res.status(200).json(statement);
    }),
  );
}
