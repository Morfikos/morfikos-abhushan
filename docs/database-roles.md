# Database roles (spec 01)

The empty `app` schema is created by `packages/db/sql/0001_init_schemas.sql`. No business tables exist yet.

Planned roles — grants are deferred to specs 02 and 03:

| Role | Purpose |
| --- | --- |
| Migration | Owns schema objects and applies reviewed migrations |
| API | Restricted runtime role for Express; subject to organization RLS later |
| Worker | Restricted runtime role for background jobs; no consumers in spec 01 |

Browser `anon` and `authenticated` Supabase roles must not receive grants on `app`.

The `pgboss` schema is not created in this unit because the worker does not start job consumers yet.

Supabase remains an external managed service. Compose does not run Postgres.
