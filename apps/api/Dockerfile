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
RUN pnpm --filter @taskforge/api build

FROM node:24-alpine AS runtime
WORKDIR /app
RUN addgroup -S nodejs && adduser -S nodejs -G nodejs

COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules

USER nodejs
EXPOSE 4000
CMD ["node", "dist/index.js"]
