# Supabase Auth and SMTP (spec 02)

Screens and API checks in this unit do **not** configure a live Auth project, disable signup in a dashboard, or send mail. Record those as separate environment work.

## Auth settings (required before invitations work)

In the Supabase project:

1. Disable public self-signup. Staff accounts are invitation-only. Customers are business records, not Auth users.
2. Do not enable social login, SMS OTP as the primary staff method, or WhatsApp login.
3. Set the site URL to the web origin (local: `http://localhost:3000`).
4. Allow redirect URLs:
   - `http://localhost:3000/auth/callback`
   - `http://localhost:3000/invite/accept`
   - `http://localhost:3000/auth/recovery/confirm`
5. Point invitation and recovery email templates at the original pages:
   - Invite: `{{ .SiteURL }}/auth/callback?next=/invite/accept`
   - Recovery: `{{ .SiteURL }}/auth/callback?next=/auth/recovery/confirm`
6. Copy the project URL and publishable key (`sb_publishable_…`, formerly the anon key) into `.env` / `apps/web/.env.local`. Put the privileged `sb_secret_…` key in server `.env` as `SUPABASE_SECRET_KEY` so spec 03 can send staff invitations. Never put secrets, JWT signing material, or access tokens in `NEXT_PUBLIC_*`.

The API verifies bearer tokens against the project JWKS at `${SUPABASE_URL}/auth/v1/.well-known/jwks.json` (ES256), with issuer `${SUPABASE_URL}/auth/v1` and audience `authenticated`. It then loads `app.staff_users` and an active `app.staff_memberships` row. Decoded claims and user metadata never grant access. The `sb_secret_` key is not used to verify staff sessions.

## Custom SMTP (required before invitations/recovery send)

Configure custom SMTP in the Supabase Auth email settings. Dashboard default mail is not treated as done.

Until SMTP is configured:

- Invitation and recovery sends fail visibly to the administrator or return a provider error.
- `/auth/check-email` is an instruction screen, not a delivery guarantee.
- Do not fake a successful send in application code.

If using Resend (`smtp.resend.com`, port `465`, username `resend`, API key as password): the **sender domain must be verified** in [Resend Domains](https://resend.com/domains). A configured SMTP form with an unverified from-domain (e.g. `account@morfikos.com` while `morfikos.com` is pending) returns Auth `500` / `Error sending recovery email` with Resend `550` “domain is not verified”. Check Supabase Auth logs for the gomail/Resend detail.

The exact SMTP provider and from-address remain an open shop-operation question.

## First owner

`packages/db/sql/0002_staff_authentication.sql` seeds the single organization and branch (schema identical to spec 03). It does not invent a staff password or public signup.

After creating the first Auth user with an invitation (or the dashboard invite, with public signup still disabled), insert matching `app.staff_users` and `app.staff_memberships` rows using that Auth user id. Staff management UI is spec 03.

## Apply schema

```bash
psql "$DATABASE_URL" -f packages/db/sql/0001_init_schemas.sql
psql "$DATABASE_URL" -f packages/db/sql/0002_staff_authentication.sql
psql "$DATABASE_URL" -f packages/db/sql/0003_shop_settings_and_organization.sql
```

Do not grant `app` to browser `anon` or `authenticated` roles. Spec 03 adds `app_api` / `app_worker` runtime roles, organization-scoped RLS, and `SET LOCAL` organization context.
