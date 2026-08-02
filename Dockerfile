# ---------------------------------------------------------------------------
# Zonash storefront — self-hosted production image
#
# Build:  docker build -t zonash-storefront .
# Run:    docker run --env-file .env -p 3000:3000 zonash-storefront
#
# The build targets Nitro's `node-server` preset (NITRO_PRESET below), which
# emits a plain Node HTTP server at .output/server/index.mjs — no Cloudflare,
# no Lovable runtime required.
# ---------------------------------------------------------------------------

# ---- build stage ----------------------------------------------------------
FROM oven/bun:1 AS build
WORKDIR /app

# Nitro target: standalone Node server instead of the Cloudflare default.
ENV NITRO_PRESET=node-server
ENV NODE_ENV=production

# Dependencies first so layer caching survives source-only changes.
COPY package.json bun.lock* bunfig.toml* ./
RUN bun install --frozen-lockfile || bun install

COPY . .

# VITE_* values are inlined into the client bundle at build time, so they must
# be present here (not just at runtime). Pass them with --build-arg.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_SUPABASE_PROJECT_ID
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_SUPABASE_PROJECT_ID=$VITE_SUPABASE_PROJECT_ID

RUN bun run build

# ---- runtime stage --------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Only the build output ships — no source, no node_modules, no bun.
COPY --from=build /app/.output ./.output

# Run unprivileged.
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", ".output/server/index.mjs"]
