# ============================================
# Stage 1 — Install dependencies & build
# ============================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root workspace config
COPY package.json package-lock.json* ./
COPY packages ./packages
COPY frontend ./frontend

# Install all dependencies (workspace resolves shared-types / shared-ui)
RUN npm install --legacy-peer-deps

# Build shared packages first, then frontend
RUN npm run build --workspace=packages/shared-types 2>/dev/null || true && \
    npm run build --workspace=packages/shared-ui 2>/dev/null || true

WORKDIR /app/frontend
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ============================================
# Stage 2 — Production runner
# ============================================
FROM node:20-alpine AS runner

# Standalone output preserves monorepo layout, so WORKDIR = monorepo root
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Add non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone output (preserves monorepo layout: frontend/server.js)
COPY --from=builder /app/frontend/.next/standalone ./
# Copy static assets and public to correct relative path
COPY --from=builder /app/frontend/.next/static ./frontend/.next/static
COPY --from=builder /app/frontend/public ./frontend/public

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "frontend/server.js"]
