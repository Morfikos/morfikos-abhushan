# 01 — Workspace Foundation

**Status:** Implemented and verified — 20 September 2026  
**Depends on:** none  
**Enables:** all later specs  
**Blocked by:** none for scaffolding; live secrets and hosting remain unresolved  

## Feature Overview & Objectives

Establish the Aabhushan monorepo so later units can add real features without inventing a second architecture. This unit solves the problem of starting implementation without a verified workspace, shared contracts, or runnable process boundaries.

The shop cannot use the product until later units exist. This unit only makes the agreed stack buildable: Next.js web, independent Express API, pg-boss worker, shared packages, typed configuration, and a Docker Compose skeleton.

## Scope

### In this unit

- pnpm workspace with `apps/web`, `apps/api`, `apps/worker`, and the agreed packages
- TypeScript strict mode, ESLint, Prettier, Vitest, and real `lint` / `typecheck` / `test` / `build` scripts
- Validated environment parsing in `packages/config`
- Express bootstrap with `/health/live` and `/health/ready`
- Next.js App Router shell with Untitled UI free theme providers and Inter
- Worker process that starts, validates config, and shuts down cleanly without consuming business jobs yet
- Docker Compose services for web, API, and worker against external Supabase
- OpenAPI skeleton and generated-client placeholder command

### Explicitly out of this unit

- Business tables, authentication, inventory, billing, Girvi, WhatsApp, or backups
- Redis, microservices, realtime, or a second backend
- Paid Untitled UI, shadcn/ui as the UI system, or a second visual system
- Offline synchronization or local financial queues
- Claiming that production hosting is configured

## Acceptance Conditions

- `pnpm` installs from the lockfile and the documented workspace scripts exist
- `pnpm` lint, typecheck, test, and build succeed on the empty-but-wired workspace
- API liveness returns without credentials or customer data; readiness fails closed when required config is missing
- Web renders a non-authenticated placeholder route using default Untitled UI tokens
- Worker starts and exits cleanly with the same config package as the API
- No business rule is implemented in a Next.js Route Handler or Server Action
- Secrets stay in env files that are not committed

## User Flows & Interactions

There is no staff jewellery workflow yet.

1. A developer clones the repository and copies `.env.example` files.
2. The developer installs dependencies with pnpm and runs the documented scripts.
3. The developer starts API, web, and worker locally or through Compose.
4. Opening the web app shows a compact Aabhushan identity page and a link to sign in (sign-in is implemented in spec 02).
5. Calling `GET /health/live` returns process liveness. Calling `GET /health/ready` reports whether required env and a database ping are available.

## Data Models & Schema Changes

No `app` business tables in this unit.

Prepare only:

| Object | Purpose |
| --- | --- |
| `app` schema | Created empty, not exposed to browser Supabase roles |
| `pgboss` schema | Created only if worker startup requires it; no business consumers yet |
| Database roles | Migration, API, and worker roles documented; grants deferred to spec 02/03 |

Do not add invoice, article, or customer tables here.

## API Contracts

| Method | Path | Auth | Behavior |
| --- | --- | --- | --- |
| `GET` | `/health/live` | none | `200` with `{ "status": "live" }` |
| `GET` | `/health/ready` | none | `200` when config and DB ping succeed; `503` otherwise |
| `GET` | `/api/v1` | none | OpenAPI discovery or version document; no business data |

Error shape for all future routes, introduced now:

```json
{
  "code": "CONFIG_INVALID",
  "message": "Required configuration is missing.",
  "request_id": "req_...",
  "field_errors": []
}
```

Monetary and weight values are not used yet. When they appear later they travel as decimal strings.

## UI/UX Requirements

Follow `ui-context.md`. This unit only sets the presentation baseline.

- Official free Untitled UI Next.js integration, Inter via Next.js fonts, and the blue brand ramp in `ui-context.md` (`#2c5ce6` as `brand-600`)
- Theme providers, global styles, and CSS variables from the installed free theme
- Copied free Base/Application primitives only as needed for the placeholder page
- Source layout: `apps/web/components/base/`, `apps/web/components/application/`, `apps/web/components/shared/`, `apps/web/features/`
- Record upstream Untitled UI commit `c981a73bcd6b6c68d2a54070f20f020191212828` in the import notes
- Compact original landing/placeholder: Aabhushan name, short explanation, free button to `/login`
- No paid login template, no marketing hero, no dark-mode toggle, no Lucide icons
- 404 page is original text and a free return button

## Edge Cases & Error Handling

- Missing env: processes must fail startup validation rather than boot with implicit defaults for secrets
- Database unreachable: liveness still succeeds; readiness returns `503`
- Port collision or Compose restart: web, API, and worker remain independently restartable
- Accidental `NEXT_PUBLIC_*` secret: reject in config validation
- Paid-registry or PRO Untitled UI setup attempted: stop and use the free public source only
- Existing repository later supplied: inspect before scaffolding; do not overwrite an implementation

## Open Questions

- Implementation repository and deployment owners are still unidentified
- Always-on host, domain, and SMTP are not required to scaffold locally
- Supabase project credentials are local-dev only in this unit

## Step-by-Step Implementation Sub-tasks

1. Create the pnpm workspace and TypeScript project references for apps and packages.
2. Enable `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`.
3. Add ESLint, Prettier, Vitest, and workspace scripts that call real package commands.
4. Implement `packages/config` with Zod env schemas split into public web vs server secrets.
5. Scaffold `packages/contracts` with the shared error DTO and OpenAPI version document.
6. Scaffold empty `packages/domain`, `packages/application`, `packages/db`, and `packages/integrations` with browser-safe export boundaries.
7. Bootstrap Express in `apps/api` with Pino, request IDs, health routes, and CORS allowlist from config.
8. Bootstrap Next.js in `apps/web` with Untitled UI free theme, Inter, and the placeholder page.
9. Bootstrap `apps/worker` process lifecycle without job handlers.
10. Add Compose files for the three processes; keep Supabase managed/external.
11. Add `.env.example` files and ignore real env, backups, and customer exports.
12. Run lint, typecheck, unit tests, and workspace build; record the actual commands and results in `progress-tracker.md`.

## Verification

Document-only creation of this spec is not a build. When this unit is implemented, verify with the repository’s real scripts, not invented pass commands. Confirm no paid UI dependency entered the lockfile.
