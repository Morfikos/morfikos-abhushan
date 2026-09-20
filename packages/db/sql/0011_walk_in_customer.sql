-- Spec 08 UX: system walk-in customer flag (one per organization).
-- Browser anon/authenticated stay without grants.

ALTER TABLE app.customers
  ADD COLUMN IF NOT EXISTS is_walk_in boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS customers_org_walk_in_unique
  ON app.customers (organization_id)
  WHERE is_walk_in;

COMMENT ON COLUMN app.customers.is_walk_in IS
  'True for the single org walk-in POS shortcut customer. Not editable from staff create/edit forms.';
