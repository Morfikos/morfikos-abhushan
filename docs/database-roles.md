# Database roles (spec 02)

`packages/db/sql/0001_init_schemas.sql` creates the empty `app` schema. `packages/db/sql/0002_staff_authentication.sql` adds `organizations`, `branches`, `staff_users`, `staff_memberships`, and `staff_invitations`, and seeds the single Aabhushan organization and Main branch.

| Role | Purpose |
| --- | --- |
| Migration | Owns schema objects and applies reviewed SQL files |
| API | Restricted runtime role for Express; SELECT/UPDATE on staff tables for membership resolution. Organization-scoped RLS is spec 03 |
| Worker | Restricted runtime role for background jobs; no consumers in this unit |

Browser `anon` and `authenticated` Supabase roles must not receive grants on `app`.

Transaction-local organization context is attached to the Express request in this unit. Setting it on the database session is spec 03.

The `pgboss` schema is not created here because the worker does not start job consumers yet.

Supabase remains an external managed service. Compose does not run Postgres.
