# ARA Payroll — Developed by ARA Intelligent Solutions
# Multi-stage build producing a small Next.js standalone image.

FROM node:22-bookworm-slim AS base
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate && npm run build

# One-off job: apply migrations and ensure platform defaults (docker compose "migrate" service).
FROM builder AS migrator
CMD ["sh", "-c", "npx prisma migrate deploy && npm run db:seed"]

FROM base AS runner
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 STORAGE_DIR=/data/storage
RUN groupadd --system --gid 1001 ara && useradd --system --uid 1001 --gid ara ara && mkdir -p /data/storage && chown -R ara:ara /data
COPY --from=builder --chown=ara:ara /app/.next/standalone ./
COPY --from=builder --chown=ara:ara /app/.next/static ./.next/static
COPY --from=builder --chown=ara:ara /app/public ./public
COPY --from=builder --chown=ara:ara /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=ara:ara /app/node_modules/@prisma ./node_modules/@prisma
USER ara
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
