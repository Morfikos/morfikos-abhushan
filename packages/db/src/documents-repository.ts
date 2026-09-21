import type {
  Document,
  GeneratedDocumentType,
  StoredObject,
  StoredObjectOwnerType,
} from "@aabhushan/contracts";
import type { DocumentsRepository } from "@aabhushan/application";
import type { PoolClient } from "pg";

type StoredObjectRow = {
  id: string;
  organization_id: string;
  bucket: string;
  object_key: string;
  checksum_sha256: string;
  content_type: string;
  byte_size: number;
  owner_type: string | null;
  owner_id: string | null;
  visibility: string;
  upload_confirmed_at: Date | string | null;
  created_at: Date | string;
};

type DocumentRow = {
  id: string;
  organization_id: string;
  document_type: string;
  template_version: string;
  status: string;
  stored_object_id: string | null;
  source_event_key: string;
  owner_type: string;
  owner_id: string;
  last_error_code: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

function asIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function asIsoOrNull(value: Date | string | null): string | null {
  return value == null ? null : asIso(value);
}

function mapStoredObject(row: StoredObjectRow): StoredObject {
  return {
    id: row.id,
    bucket: row.bucket,
    object_key: row.object_key,
    checksum_sha256: row.checksum_sha256,
    content_type: row.content_type,
    byte_size: row.byte_size,
    owner_type: (row.owner_type as StoredObjectOwnerType | null) ?? null,
    owner_id: row.owner_id,
    visibility: "private",
    upload_confirmed_at: asIsoOrNull(row.upload_confirmed_at),
    created_at: asIso(row.created_at),
  };
}

function mapDocument(row: DocumentRow): Document {
  return {
    id: row.id,
    document_type: row.document_type as Document["document_type"],
    template_version: row.template_version,
    status: row.status as Document["status"],
    stored_object_id: row.stored_object_id,
    source_event_key: row.source_event_key,
    owner_type: row.owner_type as Document["owner_type"],
    owner_id: row.owner_id,
    last_error_code: row.last_error_code,
    download_url: null,
    created_at: asIso(row.created_at),
    updated_at: asIso(row.updated_at),
  };
}

function money(value: string | number): string {
  return Number(value).toFixed(2);
}

async function loadInvoicePaperSize(
  client: PoolClient,
  organizationId: string,
): Promise<"A4" | "A5" | "80mm"> {
  const result = await client.query<{ invoice_paper_size: string }>(
    `
    SELECT invoice_paper_size
    FROM app.device_settings
    WHERE organization_id = $1
    LIMIT 1
    `,
    [organizationId],
  );
  const value = result.rows[0]?.invoice_paper_size;
  if (value === "A4" || value === "80mm") {
    return value;
  }
  return "A5";
}

export function createDocumentsRepository(client: PoolClient, organizationId: string): DocumentsRepository {
  return {
    async insertStoredObject(input) {
      const result = await client.query<StoredObjectRow>(
        `
        INSERT INTO app.stored_objects (
          organization_id, bucket, object_key, checksum_sha256, content_type, byte_size,
          owner_type, owner_id, visibility, upload_confirmed_at, created_by_staff_user_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'private', $9::timestamptz, $10)
        RETURNING *
        `,
        [
          organizationId,
          input.bucket,
          input.objectKey,
          input.checksumSha256,
          input.contentType,
          input.byteSize,
          input.ownerType,
          input.ownerId,
          input.uploadConfirmedAt,
          input.createdByStaffUserId,
        ],
      );
      return mapStoredObject(result.rows[0]!);
    },

    async upsertConfirmedStoredObject(input) {
      const result = await client.query<StoredObjectRow>(
        `
        INSERT INTO app.stored_objects (
          organization_id, bucket, object_key, checksum_sha256, content_type, byte_size,
          owner_type, owner_id, visibility, upload_confirmed_at, created_by_staff_user_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'private', timezone('utc', now()), NULL)
        ON CONFLICT (bucket, object_key) DO UPDATE SET
          checksum_sha256 = EXCLUDED.checksum_sha256,
          content_type = EXCLUDED.content_type,
          byte_size = EXCLUDED.byte_size,
          owner_type = EXCLUDED.owner_type,
          owner_id = EXCLUDED.owner_id,
          upload_confirmed_at = timezone('utc', now())
        RETURNING *
        `,
        [
          organizationId,
          input.bucket,
          input.objectKey,
          input.checksumSha256,
          input.contentType,
          input.byteSize,
          input.ownerType,
          input.ownerId,
        ],
      );
      return mapStoredObject(result.rows[0]!);
    },

    async getStoredObject(id) {
      const result = await client.query<StoredObjectRow>(
        `SELECT * FROM app.stored_objects WHERE organization_id = $1 AND id = $2`,
        [organizationId, id],
      );
      return result.rows[0] ? mapStoredObject(result.rows[0]) : null;
    },

    async confirmStoredObject(input) {
      const result = await client.query<StoredObjectRow>(
        `
        UPDATE app.stored_objects
        SET checksum_sha256 = $3,
            byte_size = $4,
            upload_confirmed_at = timezone('utc', now())
        WHERE organization_id = $1 AND id = $2 AND upload_confirmed_at IS NULL
        RETURNING *
        `,
        [organizationId, input.id, input.checksumSha256, input.byteSize],
      );
      return result.rows[0] ? mapStoredObject(result.rows[0]) : null;
    },

    async listAbandonedUploads(olderThanIso) {
      const result = await client.query<StoredObjectRow>(
        `
        SELECT * FROM app.stored_objects
        WHERE organization_id = $1
          AND upload_confirmed_at IS NULL
          AND created_at < $2::timestamptz
        ORDER BY created_at ASC
        LIMIT 50
        `,
        [organizationId, olderThanIso],
      );
      return result.rows.map(mapStoredObject);
    },

    async deleteStoredObject(id) {
      await client.query(`DELETE FROM app.stored_objects WHERE organization_id = $1 AND id = $2`, [
        organizationId,
        id,
      ]);
    },

    async insertArticleFileLink(input) {
      // One current photograph per article: replace, do not append.
      await client.query(`DELETE FROM app.article_files WHERE organization_id = $1 AND article_id = $2`, [
        organizationId,
        input.articleId,
      ]);
      await client.query(
        `
        INSERT INTO app.article_files (
          organization_id, article_id, object_key, checksum_sha256, content_type, original_filename, byte_size
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
        [
          organizationId,
          input.articleId,
          input.objectKey,
          input.checksumSha256,
          input.contentType,
          input.originalFilename,
          input.byteSize,
        ],
      );
    },

    async insertCustomerIdentityFileLink(input) {
      await client.query(
        `
        INSERT INTO app.customer_identity_files (
          organization_id, customer_id, object_key, checksum_sha256, uploaded_by_staff_user_id, purpose
        ) VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (organization_id, object_key) DO NOTHING
        `,
        [
          organizationId,
          input.customerId,
          input.objectKey,
          input.checksumSha256,
          input.uploadedByStaffUserId,
          input.purpose,
        ],
      );
    },

    async insertGirviCollateralFileLink(input) {
      const item = await client.query<{ girvi_account_id: string }>(
        `
        SELECT girvi_account_id
        FROM app.girvi_collateral_items
        WHERE organization_id = $1 AND id = $2
        `,
        [organizationId, input.collateralItemId],
      );
      const accountId = item.rows[0]?.girvi_account_id;
      if (!accountId) {
        throw new Error("Girvi collateral item not found for file link.");
      }
      await client.query(
        `
        INSERT INTO app.girvi_collateral_files (
          organization_id, girvi_account_id, collateral_item_id, object_key, checksum_sha256,
          uploaded_by_staff_user_id, purpose
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (organization_id, object_key) DO NOTHING
        `,
        [
          organizationId,
          accountId,
          input.collateralItemId,
          input.objectKey,
          input.checksumSha256,
          input.uploadedByStaffUserId,
          input.purpose,
        ],
      );
    },

    async findStoredObjectByObjectKey(objectKey) {
      const result = await client.query<StoredObjectRow>(
        `SELECT * FROM app.stored_objects WHERE organization_id = $1 AND object_key = $2`,
        [organizationId, objectKey],
      );
      return result.rows[0] ? mapStoredObject(result.rows[0]) : null;
    },

    async upsertDocumentPending(input) {
      const result = await client.query<DocumentRow>(
        `
        INSERT INTO app.documents (
          organization_id, document_type, template_version, status, source_event_key, owner_type, owner_id
        ) VALUES ($1, $2, $3, 'pending', $4, $5, $6)
        ON CONFLICT (organization_id, source_event_key) DO UPDATE SET
          status = 'pending',
          template_version = EXCLUDED.template_version,
          stored_object_id = NULL,
          last_error_code = NULL,
          updated_at = timezone('utc', now())
        RETURNING *
        `,
        [
          organizationId,
          input.documentType,
          input.templateVersion,
          input.sourceEventKey,
          input.ownerType,
          input.ownerId,
        ],
      );
      return mapDocument(result.rows[0]!);
    },

    async getDocument(id) {
      const result = await client.query<DocumentRow>(
        `SELECT * FROM app.documents WHERE organization_id = $1 AND id = $2`,
        [organizationId, id],
      );
      return result.rows[0] ? mapDocument(result.rows[0]) : null;
    },

    async listDocumentsForOwner(ownerType, ownerId) {
      const result = await client.query<DocumentRow>(
        `
        SELECT * FROM app.documents
        WHERE organization_id = $1 AND owner_type = $2 AND owner_id = $3
        ORDER BY created_at DESC
        `,
        [organizationId, ownerType, ownerId],
      );
      return result.rows.map(mapDocument);
    },

    async markDocumentReady(input) {
      const result = await client.query<DocumentRow>(
        `
        UPDATE app.documents
        SET status = 'ready',
            stored_object_id = $3,
            last_error_code = NULL,
            updated_at = timezone('utc', now())
        WHERE organization_id = $1 AND id = $2
        RETURNING *
        `,
        [organizationId, input.id, input.storedObjectId],
      );
      return result.rows[0] ? mapDocument(result.rows[0]) : null;
    },

    async markDocumentFailed(input) {
      const result = await client.query<DocumentRow>(
        `
        UPDATE app.documents
        SET status = 'failed',
            last_error_code = $3,
            updated_at = timezone('utc', now())
        WHERE organization_id = $1 AND id = $2
        RETURNING *
        `,
        [organizationId, input.id, input.errorCode],
      );
      return result.rows[0] ? mapDocument(result.rows[0]) : null;
    },

    async findInvoicePrintSource(invoiceId) {
      const invoiceResult = await client.query<{
        id: string;
        invoice_number: string | null;
        business_date: string;
        customer_display_name: string;
        status: string;
        metal_value_inr: string;
        making_charges_inr: string;
        wastage_inr: string;
        stone_charges_inr: string;
        discount_inr: string;
        tax_inr: string;
        round_off_inr: string;
        grand_total_inr: string;
        amount_paid_inr: string;
        amount_due_inr: string;
      }>(
        `
        SELECT
          i.id, i.invoice_number, i.business_date::text AS business_date, c.display_name AS customer_display_name,
          i.status, i.metal_value_inr::text, i.making_charges_inr::text, i.wastage_inr::text,
          i.stone_charges_inr::text, i.discount_inr::text, i.tax_inr::text, i.round_off_inr::text,
          i.grand_total_inr::text, i.amount_paid_inr::text, i.amount_due_inr::text
        FROM app.invoices i
        JOIN app.customers c ON c.id = i.customer_id AND c.organization_id = i.organization_id
        WHERE i.organization_id = $1 AND i.id = $2
        `,
        [organizationId, invoiceId],
      );
      const invoice = invoiceResult.rows[0];
      if (!invoice) {
        return null;
      }
      const lines = await client.query<{
        article_number: string;
        description: string;
        line_total_inr: string;
      }>(
        `
        SELECT article_number, description, line_total_inr::text
        FROM app.invoice_lines
        WHERE organization_id = $1 AND invoice_id = $2
        ORDER BY line_number ASC
        `,
        [organizationId, invoiceId],
      );
      const shop = await client.query<{
        legal_name: string;
        address_line: string | null;
        phone: string | null;
        invoice_footer: string | null;
      }>(
        `
        SELECT legal_name, address_line, phone, invoice_footer
        FROM app.shop_profiles
        WHERE organization_id = $1
        LIMIT 1
        `,
        [organizationId],
      );
      const shopRow = shop.rows[0];
      if (!shopRow) {
        return null;
      }
      const invoice_paper_size = await loadInvoicePaperSize(client, organizationId);
      return {
        invoice: {
          ...invoice,
          metal_value_inr: money(invoice.metal_value_inr),
          making_charges_inr: money(invoice.making_charges_inr),
          wastage_inr: money(invoice.wastage_inr),
          stone_charges_inr: money(invoice.stone_charges_inr),
          discount_inr: money(invoice.discount_inr),
          tax_inr: money(invoice.tax_inr),
          round_off_inr: money(invoice.round_off_inr),
          grand_total_inr: money(invoice.grand_total_inr),
          amount_paid_inr: money(invoice.amount_paid_inr),
          amount_due_inr: money(invoice.amount_due_inr),
        },
        lines: lines.rows.map((line) => ({
          article_number: line.article_number,
          description: line.description,
          line_total_inr: money(line.line_total_inr),
        })),
        shop: shopRow,
        invoice_paper_size,
      };
    },

    async findReceiptPrintSource(paymentId) {
      const result = await client.query<{
        receipt_number: string;
        issued_at: Date | string;
        customer_display_name: string;
        method: string;
        amount_inr: string;
        invoice_numbers: string | null;
        legal_name: string;
        address_line: string | null;
        phone: string | null;
      }>(
        `
        SELECT
          r.receipt_number,
          r.issued_at,
          c.display_name AS customer_display_name,
          p.method,
          p.amount_inr::text,
          (
            SELECT string_agg(DISTINCT i.invoice_number, ', ' ORDER BY i.invoice_number)
            FROM app.payment_allocations pa
            JOIN app.invoices i ON i.id = pa.invoice_id AND i.organization_id = pa.organization_id
            WHERE pa.organization_id = p.organization_id AND pa.payment_id = p.id
          ) AS invoice_numbers,
          sp.legal_name,
          sp.address_line,
          sp.phone
        FROM app.receipts r
        JOIN app.payments p ON p.id = r.payment_id AND p.organization_id = r.organization_id
        JOIN app.customers c ON c.id = p.customer_id AND c.organization_id = p.organization_id
        JOIN app.shop_profiles sp ON sp.organization_id = r.organization_id
        WHERE r.organization_id = $1 AND r.payment_id = $2
        `,
        [organizationId, paymentId],
      );
      const row = result.rows[0];
      if (!row) {
        return null;
      }
      return {
        receiptNumber: row.receipt_number,
        issuedAt: asIso(row.issued_at),
        customerDisplayName: row.customer_display_name,
        paymentMethod: row.method,
        amountInr: money(row.amount_inr),
        invoiceNumbers: row.invoice_numbers ? row.invoice_numbers.split(", ").filter(Boolean) : [],
        shop: {
          legal_name: row.legal_name,
          address_line: row.address_line,
          phone: row.phone,
        },
        invoice_paper_size: await loadInvoicePaperSize(client, organizationId),
      };
    },

    async findGirviAckPrintSource(accountId) {
      const result = await client.query<{
        account_number: string;
        customer_display_name: string;
        release_date: string;
        recipient_name: string;
        packet_numbers: string[];
        legal_name: string;
        address_line: string | null;
        phone: string | null;
      }>(
        `
        SELECT
          a.account_number,
          c.display_name AS customer_display_name,
          r.created_at AS release_date,
          r.recipient_name,
          r.packet_numbers_verified AS packet_numbers,
          sp.legal_name,
          sp.address_line,
          sp.phone
        FROM app.girvi_accounts a
        JOIN app.customers c ON c.id = a.customer_id AND c.organization_id = a.organization_id
        JOIN app.girvi_release_events r
          ON r.girvi_account_id = a.id AND r.organization_id = a.organization_id
        JOIN app.shop_profiles sp ON sp.organization_id = a.organization_id
        WHERE a.organization_id = $1 AND a.id = $2
        LIMIT 1
        `,
        [organizationId, accountId],
      );
      const row = result.rows[0];
      if (!row) {
        return null;
      }
      return {
        accountNumber: row.account_number,
        customerDisplayName: row.customer_display_name,
        releaseDateIso: asIso(row.release_date),
        recipientName: row.recipient_name,
        packetNumbers: row.packet_numbers ?? [],
        shop: {
          legal_name: row.legal_name,
          address_line: row.address_line,
          phone: row.phone,
        },
        invoice_paper_size: await loadInvoicePaperSize(client, organizationId),
      };
    },

    async findCreditNotePrintSource(returnId) {
      const result = await client.query<{
        credit_note_number: string;
        invoice_number: string;
        invoice_id: string;
        customer_display_name: string;
        issued_at: string;
        amount_inr: string;
        legal_name: string;
        address_line: string | null;
        phone: string | null;
      }>(
        `
        SELECT
          cn.credit_note_number,
          i.invoice_number,
          i.id AS invoice_id,
          c.display_name AS customer_display_name,
          cn.issued_at,
          cn.amount_inr::text,
          sp.legal_name,
          sp.address_line,
          sp.phone
        FROM app.credit_notes cn
        JOIN app.invoices i ON i.id = cn.invoice_id AND i.organization_id = cn.organization_id
        JOIN app.customers c ON c.id = i.customer_id AND c.organization_id = i.organization_id
        JOIN app.shop_profiles sp ON sp.organization_id = cn.organization_id
        WHERE cn.organization_id = $1 AND cn.return_id = $2
        LIMIT 1
        `,
        [organizationId, returnId],
      );
      const row = result.rows[0];
      if (!row || !row.invoice_number) {
        return null;
      }
      return {
        creditNoteNumber: row.credit_note_number,
        invoiceNumber: row.invoice_number,
        invoiceId: row.invoice_id,
        customerDisplayName: row.customer_display_name,
        issuedAtIso: asIso(row.issued_at),
        amountInr: money(row.amount_inr),
        shop: {
          legal_name: row.legal_name,
          address_line: row.address_line,
          phone: row.phone,
        },
        invoice_paper_size: await loadInvoicePaperSize(client, organizationId),
      };
    },

    async findRefundPrintSource(paymentId) {
      const result = await client.query<{
        refund_number: string;
        customer_display_name: string;
        issued_at: string;
        method: string;
        amount_inr: string;
        reverses_receipt_number: string | null;
        legal_name: string;
        address_line: string | null;
        phone: string | null;
      }>(
        `
        SELECT
          r.receipt_number AS refund_number,
          c.display_name AS customer_display_name,
          r.issued_at,
          p.method,
          p.amount_inr::text,
          orig_r.receipt_number AS reverses_receipt_number,
          sp.legal_name,
          sp.address_line,
          sp.phone
        FROM app.payments p
        JOIN app.receipts r ON r.payment_id = p.id AND r.organization_id = p.organization_id
        JOIN app.customers c ON c.id = p.customer_id AND c.organization_id = p.organization_id
        JOIN app.shop_profiles sp ON sp.organization_id = p.organization_id
        LEFT JOIN app.receipts orig_r
          ON orig_r.payment_id = p.reverses_payment_id AND orig_r.organization_id = p.organization_id
        WHERE p.organization_id = $1 AND p.id = $2 AND p.kind = 'refund'
        LIMIT 1
        `,
        [organizationId, paymentId],
      );
      const row = result.rows[0];
      if (!row) {
        return null;
      }
      return {
        refundNumber: row.refund_number,
        customerDisplayName: row.customer_display_name,
        issuedAtIso: asIso(row.issued_at),
        paymentMethod: row.method,
        amountInr: money(row.amount_inr),
        reversesReceiptNumber: row.reverses_receipt_number,
        shop: {
          legal_name: row.legal_name,
          address_line: row.address_line,
          phone: row.phone,
        },
        invoice_paper_size: await loadInvoicePaperSize(client, organizationId),
      };
    },

    async claimPendingOutbox(limit) {
      const result = await client.query<{
        id: string;
        organization_id: string;
        event_key: string;
        event_type: string;
        payload: Record<string, unknown>;
      }>(
        `
        SELECT id, organization_id, event_key, event_type, payload
        FROM app.outbox_events
        WHERE organization_id = $1 AND dispatched_at IS NULL
          AND event_type IN (
            'invoice.finalized',
            'receipt.requested',
            'girvi.released',
            'credit_note.requested',
            'refund.requested'
          )
        ORDER BY created_at ASC
        LIMIT $2
        FOR UPDATE SKIP LOCKED
        `,
        [organizationId, limit],
      );
      return result.rows.map((row) => ({
        id: row.id,
        organizationId: row.organization_id,
        eventKey: row.event_key,
        eventType: row.event_type,
        payload: row.payload,
      }));
    },

    async markOutboxDispatched(id) {
      await client.query(
        `
        UPDATE app.outbox_events
        SET dispatched_at = timezone('utc', now())
        WHERE organization_id = $1 AND id = $2
        `,
        [organizationId, id],
      );
    },
  };
}

/** Worker helper: list org ids with pending document outbox or abandoned uploads. */
export async function listOrganizationsNeedingDocumentWork(client: PoolClient): Promise<string[]> {
  const result = await client.query<{ organization_id: string }>(
    `
    SELECT DISTINCT organization_id FROM (
      SELECT organization_id FROM app.outbox_events
      WHERE dispatched_at IS NULL
        AND event_type IN (
          'invoice.finalized',
          'receipt.requested',
          'girvi.released',
          'credit_note.requested',
          'refund.requested'
        )
      UNION
      SELECT organization_id FROM app.documents WHERE status = 'pending'
      UNION
      SELECT organization_id FROM app.stored_objects
      WHERE upload_confirmed_at IS NULL
        AND created_at < timezone('utc', now()) - interval '1 hour'
    ) pending
    `,
  );
  return result.rows.map((row) => row.organization_id);
}
