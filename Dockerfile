# ── Stage 1: Build ──
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package.json package-lock.json* ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# ── Stage 2: Production ──
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

# Only copy the build output — no source code, no devDependencies
COPY --from=builder /app/dist ./dist

EXPOSE 5000

# Health check for cloud platforms
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:5000/api/auction || exit 1

CMD ["node", "dist/index.cjs"]
