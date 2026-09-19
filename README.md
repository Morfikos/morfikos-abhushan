# Aabhushan

Staff jewellery management workspace: Next.js web, independent Express API, and a pg-boss worker process. Supabase stays external.

## Prerequisites

- Node.js 24 LTS
- pnpm 10
- A PostgreSQL URL for readiness checks (local or Supabase). The API starts only when `DATABASE_URL` is a valid URL; `/health/ready` is `503` until the database answers.

## Setup

```bash
cp .env.example .env
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Local development

```bash
pnpm dev
```

- Web: http://localhost:3000
- API liveness: http://localhost:3001/health/live
- API readiness: http://localhost:3001/health/ready
- API version document: http://localhost:3001/api/v1

Or start processes independently with Docker Compose after copying `.env`:

```bash
docker compose up --build
```

## Scripts

| Command | Purpose |
| --- | --- |
| `pnpm lint` | ESLint across workspace packages |
| `pnpm typecheck` | TypeScript checks |
| `pnpm test` | Vitest |
| `pnpm build` | Package and app builds |
| `pnpm generate:client` | Placeholder for generated API clients |

Do not commit `.env`, backups, or customer exports.
