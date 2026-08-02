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
    pnpm install --filter @taskforge/web... --frozen-lockfile

COPY tsconfig.base.json ./
COPY apps/web ./apps/web
COPY packages/contracts ./packages/contracts

RUN pnpm --filter @taskforge/contracts build
RUN pnpm --filter @taskforge/web build

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
WORKDIR /app
RUN addgroup -S nodejs && adduser -S nodejs -G nodejs

COPY --from=build --chown=nodejs:nodejs /workspace/apps/web/.next/standalone ./
COPY --from=build --chown=nodejs:nodejs /workspace/apps/web/.next/static ./apps/web/.next/static

USER nodejs
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
