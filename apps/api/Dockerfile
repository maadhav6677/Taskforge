# syntax=docker/dockerfile:1.7

FROM node:24-alpine AS toolchain
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@10.12.1 --activate

FROM toolchain AS build
COPY pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json

RUN --mount=type=cache,id=taskforge-pnpm,target=/pnpm/store \
    pnpm install --filter @taskforge/api... --frozen-lockfile

COPY tsconfig.base.json ./
COPY apps/api ./apps/api
COPY packages/contracts ./packages/contracts

RUN pnpm --filter @taskforge/contracts build
RUN pnpm --filter @taskforge/api build
RUN pnpm --filter @taskforge/api --prod deploy --legacy /prod/api

FROM node:24-alpine AS runtime-base
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S nodejs && adduser -S nodejs -G nodejs

COPY --from=build --chown=nodejs:nodejs /prod/api ./

USER nodejs

FROM runtime-base AS api
EXPOSE 4000
CMD ["node", "dist/index.js"]

FROM runtime-base AS worker
CMD ["node", "dist/worker.js"]
