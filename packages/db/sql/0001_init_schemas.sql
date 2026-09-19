-- Spec 01: empty business schema only.
-- Do not expose `app` to browser anon or authenticated Supabase roles.
-- Migration / API / worker role grants are deferred to specs 02 and 03.

CREATE SCHEMA IF NOT EXISTS app;

-- The pgboss schema is created only when the worker starts consuming jobs.
-- Spec 01 does not start pg-boss consumers.
