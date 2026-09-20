import type { Express, NextFunction, Request, Response } from "express";
import type { Pool } from "@aabhushan/db";

import {
  ApplicationHttpError,
  acceptInvoiceReturn,
  createInvoiceDraft,
  finalizeInvoice,
  getInvoice,
  getInvoiceCorrections,
  listInvoices,
  patchInvoiceDraft,
  quickReceiveArticleOntoDraft,
  quoteInvoiceForStaff,
} from "@aabhushan/application";
import {
  invoiceDraftCreateSchema,
  invoiceDraftPatchSchema,
  invoiceDraftQuickArticleSchema,
  invoiceFinalizeSchema,
  invoiceListQuerySchema,
  invoiceQuoteRequestSchema,
  invoiceReturnCreateSchema,
} from "@aabhushan/contracts";
import {
  createCalculationPolicyRepository,
  createInventoryRepository,
  createInvoiceRepository,
  createPaymentRepository,
  createReturnsRepository,
  withOrganizationContext,
} from "@aabhushan/db";

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

export function registerInvoiceRoutes(
  app: Express,
  pool: Pool,
  requireStaff: (req: Request, res: Response, next: NextFunction) => void,
): void {
  app.post(
    "/api/v1/invoices/quote",
    requireStaff,
    handle(async (req, res) => {
      const body = parseBody(invoiceQuoteRequestSchema, req.body);
      const quote = await withOrganizationContext(
        pool,
        { organizationId: req.staffAccess.membership.organization_id },
        async (client) => {
          const repo = createCalculationPolicyRepository(
            client,
            req.staffAccess.membership.organization_id,
          );
          return quoteInvoiceForStaff(repo, req.staffAccess, body);
        },
      );
      res.status(200).json(quote);
    }),
  );

  app.post(
    "/api/v1/invoices/drafts",
    requireStaff,
    handle(async (req, res) => {
      const body = parseBody(invoiceDraftCreateSchema, req.body);
      const invoice = await withOrganizationContext(
        pool,
        { organizationId: req.staffAccess.membership.organization_id },
        async (client) => {
          const repo = createInvoiceRepository(
            client,
            req.staffAccess.membership.organization_id,
            req.staffAccess.membership.branch_id,
          );
          const policyRepo = createCalculationPolicyRepository(
            client,
            req.staffAccess.membership.organization_id,
          );
          return createInvoiceDraft(repo, policyRepo, req.staffAccess, body);
        },
      );
      res.status(201).json(invoice);
    }),
  );

  app.get(
    "/api/v1/invoices/drafts/:id",
    requireStaff,
    handle(async (req, res) => {
      const invoiceId = parsePathUuid(req.params.id, "id");
      const invoice = await withOrganizationContext(
        pool,
        { organizationId: req.staffAccess.membership.organization_id },
        async (client) => {
          const repo = createInvoiceRepository(
            client,
            req.staffAccess.membership.organization_id,
            req.staffAccess.membership.branch_id,
          );
          return getInvoice(repo, req.staffAccess, invoiceId);
        },
      );
      if (invoice.status !== "draft") {
        throw new ApplicationHttpError("INVOICE_NOT_DRAFT", "This invoice is not a draft.", 409);
      }
      res.status(200).json(invoice);
    }),
  );

  app.patch(
    "/api/v1/invoices/drafts/:id",
    requireStaff,
    handle(async (req, res) => {
      const invoiceId = parsePathUuid(req.params.id, "id");
      const body = parseBody(invoiceDraftPatchSchema, req.body);
      const invoice = await withOrganizationContext(
        pool,
        { organizationId: req.staffAccess.membership.organization_id },
        async (client) => {
          const repo = createInvoiceRepository(
            client,
            req.staffAccess.membership.organization_id,
            req.staffAccess.membership.branch_id,
          );
          const policyRepo = createCalculationPolicyRepository(
            client,
            req.staffAccess.membership.organization_id,
          );
          return patchInvoiceDraft(repo, policyRepo, req.staffAccess, invoiceId, body);
        },
      );
      res.status(200).json(invoice);
    }),
  );

  app.post(
    "/api/v1/invoices/drafts/:id/quick-articles",
    requireStaff,
    handle(async (req, res) => {
      const invoiceId = parsePathUuid(req.params.id, "id");
      const body = parseBody(invoiceDraftQuickArticleSchema, req.body);
      const invoice = await withOrganizationContext(
        pool,
        { organizationId: req.staffAccess.membership.organization_id },
        async (client) => {
          const invoiceRepo = createInvoiceRepository(
            client,
            req.staffAccess.membership.organization_id,
            req.staffAccess.membership.branch_id,
          );
          const inventoryRepo = createInventoryRepository(
            client,
            req.staffAccess.membership.organization_id,
            req.staffAccess.membership.branch_id,
          );
          const policyRepo = createCalculationPolicyRepository(
            client,
            req.staffAccess.membership.organization_id,
          );
          return quickReceiveArticleOntoDraft(
            invoiceRepo,
            inventoryRepo,
            policyRepo,
            req.staffAccess,
            invoiceId,
            body,
          );
        },
      );
      res.status(200).json(invoice);
    }),
  );

  app.get(
    "/api/v1/invoices",
    requireStaff,
    handle(async (req, res) => {
      const query = parseQuery(invoiceListQuerySchema, req);
      const result = await withOrganizationContext(
        pool,
        { organizationId: req.staffAccess.membership.organization_id },
        async (client) => {
          const repo = createInvoiceRepository(
            client,
            req.staffAccess.membership.organization_id,
            req.staffAccess.membership.branch_id,
          );
          return listInvoices(repo, req.staffAccess, {
            page: query.page,
            pageSize: query.page_size,
            sort: query.sort,
            direction: query.direction,
            ...(query.status ? { status: query.status } : {}),
            ...(query.customer_id ? { customerId: query.customer_id } : {}),
            ...(query.business_date_from ? { businessDateFrom: query.business_date_from } : {}),
            ...(query.business_date_to ? { businessDateTo: query.business_date_to } : {}),
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
    "/api/v1/invoices/:id",
    requireStaff,
    handle(async (req, res) => {
      const invoiceId = parsePathUuid(req.params.id, "id");
      const invoice = await withOrganizationContext(
        pool,
        { organizationId: req.staffAccess.membership.organization_id },
        async (client) => {
          const repo = createInvoiceRepository(
            client,
            req.staffAccess.membership.organization_id,
            req.staffAccess.membership.branch_id,
          );
          return getInvoice(repo, req.staffAccess, invoiceId);
        },
      );
      res.status(200).json(invoice);
    }),
  );

  app.post(
    "/api/v1/invoices/:id/finalize",
    requireStaff,
    handle(async (req, res) => {
      const invoiceId = parsePathUuid(req.params.id, "id");
      const body = parseBody(invoiceFinalizeSchema, req.body);
      const idempotencyKey = idempotencyKeyFrom(req);
      const invoice = await withOrganizationContext(
        pool,
        { organizationId: req.staffAccess.membership.organization_id },
        async (client) => {
          const repo = createInvoiceRepository(
            client,
            req.staffAccess.membership.organization_id,
            req.staffAccess.membership.branch_id,
          );
          const policyRepo = createCalculationPolicyRepository(
            client,
            req.staffAccess.membership.organization_id,
          );
          return finalizeInvoice(repo, policyRepo, req.staffAccess, invoiceId, body, idempotencyKey);
        },
      );
      res.status(200).json(invoice);
    }),
  );

  app.post(
    "/api/v1/invoices/:id/returns",
    requireStaff,
    handle(async (req, res) => {
      const invoiceId = parsePathUuid(req.params.id, "id");
      const body = parseBody(invoiceReturnCreateSchema, req.body);
      const idempotencyKey = idempotencyKeyFrom(req);
      const result = await withOrganizationContext(
        pool,
        { organizationId: req.staffAccess.membership.organization_id },
        async (client) => {
          const returnsRepo = createReturnsRepository(
            client,
            req.staffAccess.membership.organization_id,
            req.staffAccess.membership.branch_id,
          );
          const paymentRepo = createPaymentRepository(
            client,
            req.staffAccess.membership.organization_id,
            req.staffAccess.membership.branch_id,
          );
          return acceptInvoiceReturn(returnsRepo, paymentRepo, req.staffAccess, invoiceId, body, idempotencyKey);
        },
      );
      res.status(201).json(result);
    }),
  );

  app.get(
    "/api/v1/invoices/:id/corrections",
    requireStaff,
    handle(async (req, res) => {
      const invoiceId = parsePathUuid(req.params.id, "id");
      const corrections = await withOrganizationContext(
        pool,
        { organizationId: req.staffAccess.membership.organization_id },
        async (client) => {
          const repo = createReturnsRepository(
            client,
            req.staffAccess.membership.organization_id,
            req.staffAccess.membership.branch_id,
          );
          return getInvoiceCorrections(repo, req.staffAccess, invoiceId);
        },
      );
      res.status(200).json(corrections);
    }),
  );
}
