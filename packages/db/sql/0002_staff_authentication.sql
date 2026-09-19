-- Spec 02: organization-aware staff identity. Organization and branch columns
-- match spec 03; this unit does not add multi-branch workflows.
-- Do not GRANT the app schema to browser anon or authenticated roles.

CREATE TABLE IF NOT EXISTS app.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  time_zone text NOT NULL DEFAULT 'Asia/Kolkata',
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS app.branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES app.organizations (id),
  name text NOT NULL,
  address_line text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE UNIQUE INDEX IF NOT EXISTS branches_one_active_per_organization
  ON app.branches (organization_id)
  WHERE is_active;

CREATE TABLE IF NOT EXISTS app.staff_users (
  id uuid PRIMARY KEY,
  email text NOT NULL,
  display_name text NOT NULL,
  is_disabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT staff_users_email_unique UNIQUE (email)
);

CREATE TABLE IF NOT EXISTS app.staff_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES app.organizations (id),
  branch_id uuid NOT NULL REFERENCES app.branches (id),
  staff_user_id uuid NOT NULL REFERENCES app.staff_users (id),
  role text NOT NULL,
  status text NOT NULL,
  invited_at timestamptz NOT NULL,
  accepted_at timestamptz,
  suspended_at timestamptz,
  CONSTRAINT staff_memberships_role_check CHECK (role IN ('owner', 'admin', 'billing', 'inventory', 'girvi')),
  CONSTRAINT staff_memberships_status_check CHECK (status IN ('invited', 'active', 'suspended')),
  CONSTRAINT staff_memberships_org_user_unique UNIQUE (organization_id, staff_user_id)
);

CREATE TABLE IF NOT EXISTS app.staff_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES app.organizations (id),
  branch_id uuid NOT NULL REFERENCES app.branches (id),
  email text NOT NULL,
  role text NOT NULL,
  status text NOT NULL,
  expires_at timestamptz NOT NULL,
  invited_by_staff_user_id uuid NOT NULL REFERENCES app.staff_users (id),
  CONSTRAINT staff_invitations_role_check CHECK (role IN ('owner', 'admin', 'billing', 'inventory', 'girvi')),
  CONSTRAINT staff_invitations_status_check CHECK (status IN ('pending', 'accepted', 'expired', 'revoked'))
);

CREATE UNIQUE INDEX IF NOT EXISTS staff_invitations_pending_email
  ON app.staff_invitations (organization_id, lower(email))
  WHERE status = 'pending';

INSERT INTO app.organizations (id, name, time_zone)
VALUES ('11111111-1111-4111-8111-111111111111', 'Aabhushan', 'Asia/Kolkata')
ON CONFLICT (id) DO NOTHING;

INSERT INTO app.branches (id, organization_id, name, is_active)
VALUES (
  '22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111',
  'Main',
  true
)
ON CONFLICT (id) DO NOTHING;

REVOKE ALL ON ALL TABLES IN SCHEMA app FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA app FROM anon;
REVOKE ALL ON ALL TABLES IN SCHEMA app FROM authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA app FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA app FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA app FROM authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA app REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA app REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA app REVOKE ALL ON TABLES FROM authenticated;
