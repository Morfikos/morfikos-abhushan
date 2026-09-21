-- Spec 13 improvement: credit note and refund PDF document types.
-- Keeps existing invoice_pdf / receipt_pdf / girvi_ack_pdf values.

ALTER TABLE app.documents
  DROP CONSTRAINT IF EXISTS documents_document_type_check;

ALTER TABLE app.documents
  ADD CONSTRAINT documents_document_type_check CHECK (
    document_type IN (
      'invoice_pdf',
      'receipt_pdf',
      'girvi_ack_pdf',
      'credit_note_pdf',
      'refund_pdf'
    )
  );
