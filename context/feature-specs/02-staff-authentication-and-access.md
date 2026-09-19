# 02 — Staff Authentication and Access

**Status:** Implemented — 20 September 2026. Live SMTP, a real Supabase project, and the first owner seed remain configuration work.  
**Depends on:** `01-workspace-foundation`  
**Enables:** all authenticated staff screens  
**Blocked by:** SMTP provider choice for invitations/recovery in a real environment  

## Feature Overview & Objectives

Give invited staff a secure way to sign in and keep uninvited people out. Customers are jewellery-business records, not Auth users. Public self-signup is disabled.

This unit solves disconnected shop access: staff currently share informal logins or paper registers. The system must invite named staff, verify sessions on the web, and independently verify tokens on Express before any business data is readable.

## Scope

### In this unit

- Invitation-based Supabase Auth
- Custom SMTP configuration as a documented integration requirement, not a simulated success
- Next.js SSR session integration
- Express verification of token signature, expiry, issuer, and audience
- Application membership resolution after token verification
- Login, invitation acceptance, recovery, and expired-link screens from free controls
- Suspended membership blocking even if a previous token is still valid
- Logout that clears sensitive TanStack Query caches

### Explicitly out of this unit

- Customer Auth accounts or a customer portal
- Social login, SMS OTP as the primary staff method, or WhatsApp login
- Multi-business SaaS onboarding
- Fine-grained shop settings UI (spec 03)
- Any financial mutation

## Acceptance Conditions

- An uninvited email cannot create an account through the UI or Auth settings
- An invited staff member can accept the invitation, set a password, and sign in
- Express rejects missing, expired, unsigned, or wrong-audience tokens with `401`
- A valid token for a suspended or missing membership is denied with `403`
- Page routes hide unauthorized navigation, but API authorization is independent of the UI
- Recovery and expired-invitation states are explicit and do not expose whether a private record exists beyond the invited email flow
- No access token appears in URLs, logs, or `NEXT_PUBLIC_*` values

## User Flows & Interactions

### Invite and accept

1. Owner/admin creates an invitation for an email and intended role (role assignment is stored in membership; UI for staff management may land in spec 03).
2. Supabase sends the invitation through configured SMTP.
3. The invitee opens the original invitation-acceptance page.
4. The invitee sets a password and lands in the authenticated shell, or sees an expired/invalid invitation explanation with a recovery path.

### Sign in

1. Staff open the compact Aabhushan login page.
2. They submit email and password. The client shows loading and field errors.
3. Supabase creates a session. The web app stores it through `@supabase/ssr`.
4. Subsequent API calls send `Authorization: Bearer <access_token>`.
5. Express verifies the token, then loads the active membership. Navigation is filtered by role.

### Recovery

1. Staff request password recovery from the login page.
2. If SMTP is configured, they see a check-email state. The page does not claim delivery succeeded unless the provider accepted the request.
3. The recovery link opens an original reset page. Invalid or expired links show a resend/contact-admin state.

### Sign out

1. Staff choose sign out.
2. The session is cleared and sensitive query caches are removed.
3. The next protected page visit returns to login.

## Data Models & Schema Changes

All tables live in the non-exposed `app` schema. UUID primary keys.

### `staff_users`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | Matches Supabase Auth user id |
| `email` | `text` not null | Unique |
| `display_name` | `text` not null | |
| `is_disabled` | `boolean` not null default false | Auth-user level disable |
| `created_at` | `timestamptz` not null | UTC |
| `updated_at` | `timestamptz` not null | UTC |

### `staff_memberships`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `organization_id` | `uuid` not null | FK → `organizations` (created in spec 03 if not seeded here) |
| `branch_id` | `uuid` not null | FK → `branches` |
| `staff_user_id` | `uuid` not null | FK → `staff_users` |
| `role` | `text` not null | `owner`, `admin`, `billing`, `inventory`, `girvi` |
| `status` | `text` not null | `invited`, `active`, `suspended` |
| `invited_at` | `timestamptz` not null | |
| `accepted_at` | `timestamptz` | |
| `suspended_at` | `timestamptz` | |

Constraints:

- Unique `(organization_id, staff_user_id)`
- MVP allows one organization and one branch; the columns still exist

### `staff_invitations`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `organization_id` | `uuid` not null | |
| `branch_id` | `uuid` not null | |
| `email` | `text` not null | |
| `role` | `text` not null | |
| `status` | `text` not null | `pending`, `accepted`, `expired`, `revoked` |
| `expires_at` | `timestamptz` not null | |
| `invited_by_staff_user_id` | `uuid` not null | |

If `organizations` / `branches` are created as a seed in this unit, keep the schema identical to spec 03 and do not invent multi-branch workflows.

## API Contracts

| Method | Path | Permission | Behavior |
| --- | --- | --- | --- |
| `GET` | `/api/v1/me` | authenticated membership | Current staff profile, membership, role, permission list |
| `POST` | `/api/v1/auth/session/introspect` | bearer token | Used only if the web needs an explicit backend session check; otherwise `GET /me` is enough |

Express auth middleware:

1. Require bearer token.
2. Verify signature, expiry, issuer, and audience with configured keys.
3. Resolve `staff_users` + active `staff_memberships`.
4. Set transaction-local organization context in later data units; in this unit at least attach verified context to the request object.
5. Never authorize from decoded claims or editable user metadata alone.

Status mapping: `401` invalid/missing auth, `403` disabled/suspended/no membership.

## UI/UX Requirements

Original compact pages using free Base inputs, buttons, and optional `input/pin-input.tsx` only if a real verification endpoint needs a code. No paid auth templates. No unconfigured social buttons. No public “Create account” link.

Required screens:

- `/login` — Aabhushan identity, email, password, submit feedback, recovery link
- `/invite/accept` — password + display name for a valid invitation
- `/auth/recovery` — request reset
- `/auth/recovery/confirm` — set new password
- `/auth/check-email` — instructions, not a delivery guarantee
- `/auth/expired` — expired or invalid invitation/recovery
- Denied-access page distinct from 404

Use default light theme, visible labels, and error text. PIN input only when the real Supabase flow requires it.

## Edge Cases & Error Handling

- Wrong password: generic authentication failure; do not reveal whether the email exists beyond the invitation flow’s own pages
- SMTP unconfigured: invitation/recovery APIs return a visible configuration failure to the admin; do not fake sent mail
- Token valid, membership suspended: `403`, force sign-out on the web
- Concurrent sessions: allowed unless later policy says otherwise; suspend still blocks all of them on the next API call
- Network failure during login: retryable error, no “signed in” state
- Browser cache of authenticated pages: do not share-cache session-bearing responses

## Open Questions

- Who may invite and suspend staff besides owner/admin (shop-operation question)
- Exact SMTP provider and from-address
- Whether display names must be bilingual

## Step-by-Step Implementation Sub-tasks

1. Seed or migrate `staff_users`, `staff_memberships`, and `staff_invitations` with organization-aware FKs.
2. Disable public signup in Supabase and document the Auth configuration.
3. Wire custom SMTP as an explicit setup step; do not treat dashboard defaults as done.
4. Implement token verification in `apps/api` using project signing keys.
5. Implement membership resolution and `/api/v1/me`.
6. Integrate `@supabase/ssr` in Next.js; add route protection that still calls the API for authorization.
7. Build the original login, invite, recovery, and expired pages from free controls.
8. Clear query caches on logout and membership change.
9. Add integration tests: valid token, expired token, suspended membership, uninvited signup blocked.
10. Record SMTP and Auth setup as configuration work, separate from the screens.

## Verification

Manual sign-in is not enough. Verify denied API access with a valid session but suspended membership, and confirm tokens never appear in logs.
