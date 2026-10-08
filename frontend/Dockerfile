# syntax=docker/dockerfile:1
# ============================================
# Stage 1 — Install dependencies & build
# ============================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root workspace config
COPY package.json package-lock.json* ./
COPY packages ./packages
COPY frontend ./frontend

# Install all dependencies (workspace resolves shared-types)
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# Build shared packages first, then frontend
RUN npm run build --workspace=packages/shared-types

WORKDIR /app/frontend
ENV NEXT_TELEMETRY_DISABLED=1

# In production behind nginx, use empty baseURL so API calls are relative
# (browser sends to same origin → nginx proxies /api/ to backend)
ARG NEXT_PUBLIC_API_BASE_URL=""
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}

# Microsoft Clarity (session replay/heatmaps). Vazio = script não é injetado.
# NEXT_PUBLIC_* é inlined no bundle no build, por isso entra como ARG e não como env de runtime.
ARG NEXT_PUBLIC_CLARITY_PROJECT_ID=""
ENV NEXT_PUBLIC_CLARITY_PROJECT_ID=${NEXT_PUBLIC_CLARITY_PROJECT_ID}

# Tags de medição/marketing (lib/marketingTags.ts) — todas sob o consentimento do banner de cookies.
# GA4 tem padrão no código (G-BF9G0RFCDB); Google Ads (AW-…), o rótulo da conversão de cadastro e o
# Meta Pixel ficam desligados enquanto vazios. Build-time pelo mesmo motivo do Clarity.
ARG NEXT_PUBLIC_GA4_ID=""
ENV NEXT_PUBLIC_GA4_ID=${NEXT_PUBLIC_GA4_ID}
ARG NEXT_PUBLIC_GOOGLE_ADS_ID=""
ENV NEXT_PUBLIC_GOOGLE_ADS_ID=${NEXT_PUBLIC_GOOGLE_ADS_ID}
ARG NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL=""
ENV NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL=${NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL}
ARG NEXT_PUBLIC_META_PIXEL_ID=""
ENV NEXT_PUBLIC_META_PIXEL_ID=${NEXT_PUBLIC_META_PIXEL_ID}

# WhatsApp comercial (landing, /planos e billing). Só dígitos com DDI, ex.: 5511999998888.
# Vazio = os botões de WhatsApp não aparecem. Build-time pelo mesmo motivo do Clarity (V-06).
ARG NEXT_PUBLIC_SUPPORT_WHATSAPP=""
ENV NEXT_PUBLIC_SUPPORT_WHATSAPP=${NEXT_PUBLIC_SUPPORT_WHATSAPP}

# Divulgação da Área do Médium na landing, /planos e /login (AM-24). "true" mostra o link
# "Sou médium", a linha no comparativo e a pergunta no FAQ; qualquer outro valor esconde.
# Build-time pelo mesmo motivo do WhatsApp. Padrão desligado enquanto a Área está em piloto.
ARG NEXT_PUBLIC_AREA_MEDIUM_DIVULGADA="false"
ENV NEXT_PUBLIC_AREA_MEDIUM_DIVULGADA=${NEXT_PUBLIC_AREA_MEDIUM_DIVULGADA}

# Sentry (browser + server bundles). Também build-time: sem isto o DSN sai vazio
# do bundle e o Sentry do frontend fica desligado em produção, mesmo com a
# variável no environment do container.
ARG NEXT_PUBLIC_SENTRY_DSN=""
ENV NEXT_PUBLIC_SENTRY_DSN=${NEXT_PUBLIC_SENTRY_DSN}
ARG NEXT_PUBLIC_SENTRY_ENVIRONMENT="production"
ENV NEXT_PUBLIC_SENTRY_ENVIRONMENT=${NEXT_PUBLIC_SENTRY_ENVIRONMENT}

# O `next build` passou do limite padrão de heap do Node (~2 GB) no deploy de
# 2026-10-07 ("JavaScript heap out of memory"). A VPS tem ~6 GB livres e o
# limite vale só para este estágio de build (o runner não é afetado).
ENV NODE_OPTIONS=--max-old-space-size=4096
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
