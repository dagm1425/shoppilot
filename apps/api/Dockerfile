FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml package.json ./
COPY pnpm-lock.yaml pnpm-lock.yaml
COPY apps/api/package.json apps/api/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/db/prisma packages/db/prisma
RUN pnpm install --frozen-lockfile=false

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm install --frozen-lockfile=false
RUN pnpm --filter @shoppilot/api build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api ./apps/api
COPY --from=build /app/packages/db ./packages/db
CMD ["node", "apps/api/dist/src/main.js"]
