FROM node:24-alpine AS base
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.12.1 --activate

FROM base AS deps
COPY pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY apps ./apps
COPY packages ./packages

RUN pnpm install --frozen-lockfile --ignore-scripts

FROM deps AS build
RUN pnpm --filter @taskforge/web build

FROM node:24-alpine AS runtime
WORKDIR /app
RUN addgroup -S nodejs && adduser -S nodejs -G nodejs

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=build /app/apps/web/.next ./.next
COPY --from=build /app/apps/web/public ./public
COPY --from=build /app/apps/web/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules

USER nodejs
EXPOSE 3000
CMD ["pnpm", "--filter", "@taskforge/web", "start"]
