# syntax=docker/dockerfile:1.7

FROM node:24-alpine AS base
WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,target=/pnpm/store pnpm install --frozen-lockfile

FROM deps AS builder
COPY . .
RUN pnpm run build

FROM base AS prod-deps
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,target=/pnpm/store pnpm install --prod --frozen-lockfile

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S appgroup -g 1001 && adduser -S appuser -u 1001 -G appgroup

FROM runtime AS web
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=9559

# Ship only the traced Next.js runtime instead of the full build output.
COPY --from=builder --chown=appuser:appgroup /app/.next/standalone ./
COPY --from=builder --chown=appuser:appgroup /app/.next/static ./.next/static
COPY --from=builder --chown=appuser:appgroup /app/public ./public
COPY --from=builder --chown=appuser:appgroup /app/scripts ./scripts
COPY --from=builder --chown=appuser:appgroup /app/src/server/db/migrations ./src/server/db/migrations

USER appuser
EXPOSE 9559
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:9559/api/health >/dev/null || exit 1
CMD ["node", "server.js"]

FROM runtime AS worker

# Worker still runs TypeScript via tsx, but only needs production deps now.
COPY --from=prod-deps --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/package.json ./package.json
COPY --from=builder --chown=appuser:appgroup /app/tsconfig.json ./tsconfig.json
COPY --from=builder --chown=appuser:appgroup /app/src ./src
COPY --from=builder --chown=appuser:appgroup /app/scripts ./scripts

USER appuser
CMD ["node", "node_modules/tsx/dist/cli.mjs", "src/worker/index.ts"]
