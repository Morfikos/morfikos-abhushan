import type { Express, NextFunction, Request, Response } from "express";
import type { Pool } from "@aabhushan/db";
import type { ShopAssetStorage } from "@aabhushan/application";
import {
  confirmFileUpload,
  createFileUploadGrant,
  getDocument,
  getFileAccess,
  getFileAccessByObjectKey,
  getInvoicePrintDto,
  getReceiptPrintDto,
  listDocumentsForOwner,
  retryDocument,
} from "@aabhushan/application";
import {
  fileAccessByKeyQuerySchema,
  fileUploadConfirmSchema,
  fileUploadGrantRequestSchema,
  ownerDocumentsQuerySchema,
} from "@aabhushan/contracts";
import { createDocumentsRepository, withOrganizationContext } from "@aabhushan/db";

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

export function registerDocumentRoutes(
  app: Express,
  pool: Pool,
  requireStaff: (req: Request, res: Response, next: NextFunction) => void,
  storage: ShopAssetStorage | null,
): void {
  app.post(
    "/api/v1/files/upload-grants",
    requireStaff,
    handle(async (req, res) => {
      const body = parseBody(fileUploadGrantRequestSchema, req.body);
      const result = await withOrganizationContext(
        pool,
        { organizationId: req.staffAccess.membership.organization_id },
        async (client) => {
          const repo = createDocumentsRepository(client, req.staffAccess.membership.organization_id);
          return createFileUploadGrant(
            repo,
            storage,
            req.staffAccess,
            req.staffAccess.membership.organization_id,
            body,
          );
        },
      );
      res.status(201).json(result);
    }),
  );

  app.post(
    "/api/v1/files/:id/confirm",
    requireStaff,
    handle(async (req, res) => {
      const fileId = parsePathUuid(req.params.id, "id");
      const body = parseBody(fileUploadConfirmSchema, req.body);
      const result = await withOrganizationContext(
        pool,
        { organizationId: req.staffAccess.membership.organization_id },
        async (client) => {
          const repo = createDocumentsRepository(client, req.staffAccess.membership.organization_id);
          return confirmFileUpload(repo, req.staffAccess, fileId, body);
        },
      );
      res.status(200).json(result);
    }),
  );

  app.get(
    "/api/v1/files/:id/access",
    requireStaff,
    handle(async (req, res) => {
      const fileId = parsePathUuid(req.params.id, "id");
      const result = await withOrganizationContext(
        pool,
        { organizationId: req.staffAccess.membership.organization_id },
        async (client) => {
          const repo = createDocumentsRepository(client, req.staffAccess.membership.organization_id);
          return getFileAccess(repo, storage, req.staffAccess, fileId);
        },
      );
      // Never log the signed URL in full — only return it to the authorized client.
      res.status(200).json(result);
    }),
  );

  app.get(
    "/api/v1/files/access-by-key",
    requireStaff,
    handle(async (req, res) => {
      const query = parseQuery(fileAccessByKeyQuerySchema, req);
      const result = await withOrganizationContext(
        pool,
        { organizationId: req.staffAccess.membership.organization_id },
        async (client) => {
          const repo = createDocumentsRepository(client, req.staffAccess.membership.organization_id);
          return getFileAccessByObjectKey(repo, storage, req.staffAccess, query.object_key);
        },
      );
      res.status(200).json(result);
    }),
  );

  app.get(
    "/api/v1/documents",
    requireStaff,
    handle(async (req, res) => {
      const query = parseQuery(ownerDocumentsQuerySchema, req);
      const result = await withOrganizationContext(
        pool,
        { organizationId: req.staffAccess.membership.organization_id },
        async (client) => {
          const repo = createDocumentsRepository(client, req.staffAccess.membership.organization_id);
          return listDocumentsForOwner(repo, storage, req.staffAccess, query.owner_type, query.owner_id);
        },
      );
      res.status(200).json(result);
    }),
  );

  app.get(
    "/api/v1/documents/:id",
    requireStaff,
    handle(async (req, res) => {
      const documentId = parsePathUuid(req.params.id, "id");
      const result = await withOrganizationContext(
        pool,
        { organizationId: req.staffAccess.membership.organization_id },
        async (client) => {
          const repo = createDocumentsRepository(client, req.staffAccess.membership.organization_id);
          return getDocument(repo, storage, req.staffAccess, documentId);
        },
      );
      res.status(200).json(result);
    }),
  );

  app.post(
    "/api/v1/documents/:id/retry",
    requireStaff,
    handle(async (req, res) => {
      const documentId = parsePathUuid(req.params.id, "id");
      const result = await withOrganizationContext(
        pool,
        { organizationId: req.staffAccess.membership.organization_id },
        async (client) => {
          const repo = createDocumentsRepository(client, req.staffAccess.membership.organization_id);
          return retryDocument(repo, req.staffAccess, documentId);
        },
      );
      res.status(200).json(result);
    }),
  );

  app.get(
    "/api/v1/invoices/:id/print",
    requireStaff,
    handle(async (req, res) => {
      const invoiceId = parsePathUuid(req.params.id, "id");
      const result = await withOrganizationContext(
        pool,
        { organizationId: req.staffAccess.membership.organization_id },
        async (client) => {
          const repo = createDocumentsRepository(client, req.staffAccess.membership.organization_id);
          return getInvoicePrintDto(repo, storage, req.staffAccess, invoiceId);
        },
      );
      res.status(200).json(result);
    }),
  );

  app.get(
    "/api/v1/payments/:id/print",
    requireStaff,
    handle(async (req, res) => {
      const paymentId = parsePathUuid(req.params.id, "id");
      const result = await withOrganizationContext(
        pool,
        { organizationId: req.staffAccess.membership.organization_id },
        async (client) => {
          const repo = createDocumentsRepository(client, req.staffAccess.membership.organization_id);
          return getReceiptPrintDto(repo, storage, req.staffAccess, paymentId);
        },
      );
      res.status(200).json(result);
    }),
  );
}
