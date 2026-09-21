-- Spec 13: private stored_objects catalog, generated documents metadata,
-- and upload grants for abandoned-upload cleanup. Object bytes stay in the
-- private Supabase bucket `shop-assets` (same adapter as shop logo / Girvi).
-- Browser anon/authenticated stay without grants. PDF generation is async
-- via outbox; financial commits never depend on PDF success.

CREATE TABLE IF NOT EXISTS app.stored_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES app.organizations (id),
  bucket text NOT NULL,
  object_key text NOT NULL,
  checksum_sha256 text NOT NULL,
  content_type text NOT NULL,
  byte_size integer NOT NULL,
  owner_type text,
  owner_id uuid,
  visibility text NOT NULL DEFAULT 'private',
  upload_confirmed_at timestamptz,
  created_by_staff_user_id uuid REFERENCES app.staff_users (id),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT stored_objects_bucket_not_blank CHECK (char_length(trim(bucket)) > 0),
  CONSTRAINT stored_objects_object_key_not_blank CHECK (char_length(trim(object_key)) > 0),
  CONSTRAINT stored_objects_checksum_not_blank CHECK (char_length(trim(checksum_sha256)) > 0),
  CONSTRAINT stored_objects_content_type_not_blank CHECK (char_length(trim(content_type)) > 0),
  CONSTRAINT stored_objects_byte_size_non_negative CHECK (byte_size >= 0),
  CONSTRAINT stored_objects_visibility_check CHECK (visibility = 'private'),
  CONSTRAINT stored_objects_owner_type_check CHECK (
    owner_type IS NULL
    OR owner_type IN ('article', 'customer', 'girvi', 'invoice', 'receipt', 'girvi_collateral')
  ),
  CONSTRAINT stored_objects_bucket_object_key_unique UNIQUE (bucket, object_key)
);

CREATE INDEX IF NOT EXISTS stored_objects_org_owner_idx
  ON app.stored_objects (organization_id, owner_type, owner_id);

CREATE INDEX IF NOT EXISTS stored_objects_unconfirmed_idx
  ON app.stored_objects (organization_id, created_at ASC)
  WHERE upload_confirmed_at IS NULL;

CREATE TABLE IF NOT EXISTS app.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES app.organizations (id),
  document_type text NOT NULL,
  template_version text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  stored_object_id uuid REFERENCES app.stored_objects (id),
  source_event_key text NOT NULL,
  owner_type text NOT NULL,
  owner_id uuid NOT NULL,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT documents_document_type_check CHECK (
    document_type IN ('invoice_pdf', 'receipt_pdf', 'girvi_ack_pdf')
  ),
  CONSTRAINT documents_template_version_not_blank CHECK (char_length(trim(template_version)) > 0),
  CONSTRAINT documents_status_check CHECK (status IN ('pending', 'ready', 'failed')),
  CONSTRAINT documents_source_event_key_not_blank CHECK (char_length(trim(source_event_key)) > 0),
  CONSTRAINT documents_owner_type_check CHECK (
    owner_type IN ('invoice', 'receipt', 'girvi')
  ),
  CONSTRAINT documents_org_source_event_key_unique UNIQUE (organization_id, source_event_key)
);

CREATE INDEX IF NOT EXISTS documents_org_owner_idx
  ON app.documents (organization_id, owner_type, owner_id);

CREATE INDEX IF NOT EXISTS documents_org_status_idx
  ON app.documents (organization_id, status);

ALTER TABLE app.stored_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.stored_objects FORCE ROW LEVEL SECURITY;
ALTER TABLE app.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.documents FORCE ROW LEVEL SECURITY;

CREATE POLICY org_isolation ON app.stored_objects
  FOR ALL TO app_api, app_worker
  USING (app.org_isolation_policy(organization_id))
  WITH CHECK (app.org_isolation_policy(organization_id));

CREATE POLICY org_isolation ON app.documents
  FOR ALL TO app_api, app_worker
  USING (app.org_isolation_policy(organization_id))
  WITH CHECK (app.org_isolation_policy(organization_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON app.stored_objects TO app_api, app_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.documents TO app_api, app_worker;

REVOKE ALL ON app.stored_objects FROM PUBLIC, anon, authenticated;
REVOKE ALL ON app.documents FROM PUBLIC, anon, authenticated;
