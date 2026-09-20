-- Spec 05: permanent article barcodes and tag print audit.
-- Canonical barcode stays on app.articles.barcode (unique per organization).
-- Generation-attempt history is not stored; reprints never change the payload.
-- hardware_validated_at stays null until a physical scanner/printer drill succeeds.
-- Browser anon/authenticated stay without grants.

ALTER TABLE app.device_settings
  ADD COLUMN IF NOT EXISTS hardware_validated_at timestamptz;

ALTER TABLE app.articles
  DROP CONSTRAINT IF EXISTS articles_barcode_code128_safe;

ALTER TABLE app.articles
  ADD CONSTRAINT articles_barcode_code128_safe
  CHECK (
    barcode IS NULL
    OR (
      char_length(trim(barcode)) > 0
      AND barcode ~ '^[A-Z0-9-]{1,80}$'
    )
  );

CREATE TABLE IF NOT EXISTS app.tag_print_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES app.organizations (id),
  article_id uuid NOT NULL REFERENCES app.articles (id),
  barcode text NOT NULL,
  print_kind text NOT NULL,
  reason text,
  template_version text NOT NULL,
  actor_staff_user_id uuid NOT NULL REFERENCES app.staff_users (id),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT tag_print_events_kind_check CHECK (print_kind IN ('initial', 'reprint', 'batch')),
  CONSTRAINT tag_print_events_barcode_not_blank CHECK (char_length(trim(barcode)) > 0),
  CONSTRAINT tag_print_events_template_not_blank CHECK (char_length(trim(template_version)) > 0),
  CONSTRAINT tag_print_events_reprint_reason CHECK (
    print_kind <> 'reprint' OR (reason IS NOT NULL AND char_length(trim(reason)) > 0)
  )
);

CREATE INDEX IF NOT EXISTS tag_print_events_org_article_idx
  ON app.tag_print_events (organization_id, article_id, created_at DESC);

ALTER TABLE app.tag_print_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.tag_print_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON app.tag_print_events;

CREATE POLICY org_isolation ON app.tag_print_events
  FOR ALL TO app_api, app_worker
  USING (app.org_isolation_policy(organization_id))
  WITH CHECK (app.org_isolation_policy(organization_id));

GRANT SELECT, INSERT ON app.tag_print_events TO app_api, app_worker;

REVOKE ALL ON app.tag_print_events FROM PUBLIC, anon, authenticated;
