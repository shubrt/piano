# Next.js app as a standalone server. Railway builds with the repository root
# as context, see apps/web/railway.json.
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@11.1.1 --activate
WORKDIR /app

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY tools/typescript/package.json tools/typescript/
RUN pnpm install --frozen-lockfile --filter web... --ignore-scripts
COPY tools/typescript tools/typescript
COPY apps/web apps/web
# env.ts validates at import time; the build has no database or secrets.
ENV SKIP_ENV_VALIDATION=1 NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter web exec next build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=:: PORT=3000
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static apps/web/.next/static
# instrumentation.ts applies these on boot.
COPY --from=build /app/apps/web/drizzle apps/web/drizzle
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
