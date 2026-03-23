# syntax=docker/dockerfile:1.7

FROM oven/bun:1.3.11 AS build
WORKDIR /workspace

# Install dependencies first for better cache reuse.
COPY package.json bun.lock bunfig.toml turbo.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/auth/package.json packages/auth/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/emails/package.json packages/emails/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY tooling/tsconfig/package.json tooling/tsconfig/package.json

RUN bun install --frozen-lockfile

# Build the web app (Nitro output in apps/web/.output).
COPY . .
RUN bun run build --filter=@repo/web

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    PLAYWRIGHT_BROWSERS_PATH=/app/ms-playwright

WORKDIR /app/apps/web
COPY package.json /app/package.json

# Runtime system packages:
# - tini: proper signal handling / zombie reaping
# - ca-certificates: TLS trust store
# - ffmpeg: required by upload processing
# - Playwright browser OS deps (Chromium) so boot-time install can run reliably
RUN set -eux; \
    PW_VERSION="$(node -e "const v=require('/app/package.json')?.workspaces?.catalog?.playwright; if(!v){process.exit(1)}; process.stdout.write(String(v).replace(/^[~^]/,''))")"; \
    echo "$PW_VERSION" > /app/.playwright-version; \
    apt-get update; \
    apt-get -y upgrade; \
    apt-get install -y --no-install-recommends tini ca-certificates ffmpeg; \
    npx --yes "playwright@$PW_VERSION" install-deps chromium; \
    rm -rf /root/.npm; \
    rm -rf /var/lib/apt/lists/*

# Create dedicated non-root user.
RUN groupadd --system --gid 10001 app && \
    useradd --system --uid 10001 --gid 10001 --home /app --shell /usr/sbin/nologin app

# Only copy runtime artifacts.
COPY --from=build --chown=app:app /workspace/apps/web/.output ./.output
COPY --from=build --chown=app:app /workspace/apps/web/public ./public

# Writable dirs used by server-side upload/asset pipeline.
RUN mkdir -p .uploads .tmp public/assets /app/ms-playwright && chown -R app:app /app

RUN cat >/usr/local/bin/container-start.sh <<'SH' && chmod +x /usr/local/bin/container-start.sh
#!/usr/bin/env sh
set -eu

# Runtime browser cache path. Mount this as a volume to persist binaries.
PW_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/app/ms-playwright}"
mkdir -p "$PW_PATH" >/dev/null 2>&1 || true

# Install Chromium silently in the background on every boot.
PW_VERSION="$(cat /app/.playwright-version 2>/dev/null || true)"
(
  PLAYWRIGHT_BROWSERS_PATH="$PW_PATH" \
    npx --yes "playwright@${PW_VERSION:-latest}" install chromium >/dev/null 2>&1 || true
) &

exec node .output/server/index.mjs
SH

USER app
EXPOSE 3000

ENTRYPOINT ["tini", "--", "/usr/local/bin/container-start.sh"]
