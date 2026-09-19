# syntax=docker/dockerfile:1

FROM node:24-bookworm-slim AS base
WORKDIR /app
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps ./apps
COPY packages ./packages
COPY tsconfig.base.json eslint.config.js .prettierrc ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
ARG APP=api
RUN pnpm --filter "@aabhushan/${APP}..." build

FROM base AS runner
ARG APP=api
ENV APP=$APP
ENV NODE_ENV=production
COPY --from=build /app /app
WORKDIR /app
CMD ["sh", "-c", "pnpm --filter \"@aabhushan/$APP\" start"]
