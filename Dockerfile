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

ARG OCI_CREATED=unknown
ARG OCI_VERSION=dev
ARG OCI_REVISION=unknown
ARG OCI_SOURCE=https://github.com/dsi-icl/gemma-cast

LABEL org.opencontainers.image.title="gemma-shop" \
      org.opencontainers.image.description="Collaborative multi-tenant presentation system for large video walls" \
      org.opencontainers.image.url="https://github.com/dsi-icl/gemma-cast" \
      org.opencontainers.image.source="${OCI_SOURCE}" \
      org.opencontainers.image.documentation="https://github.com/dsi-icl/gemma-cast#readme" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.version="${OCI_VERSION}" \
      org.opencontainers.image.revision="${OCI_REVISION}" \
      org.opencontainers.image.created="${OCI_CREATED}" \
      org.opencontainers.image.vendor="florian-guitton" \
      org.opencontainers.image.base.name="docker.io/library/node:24-bookworm-slim"

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    RUNTIME_DEPS_DIR=/app/runtime-deps \
    PLAYWRIGHT_BROWSERS_PATH=/app/runtime-deps/playwright \
    FFMPEG_PATH=/app/runtime-deps/bin/ffmpeg \
    FFMPEG_STATIC_URL=https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz \
    FFMPEG_STATIC_SHA256=

WORKDIR /app/apps/web
COPY package.json /app/package.json

# Runtime system packages:
# - tini: proper signal handling / zombie reaping
# - ca-certificates: TLS trust store
# - curl/xz-utils: required to fetch/extract static ffmpeg at boot
# - Playwright browser OS deps (Chromium) so boot-time install can run reliably
RUN set -eux; \
    PW_VERSION="$(node -e "const v=require('/app/package.json')?.workspaces?.catalog?.playwright; if(!v){process.exit(1)}; process.stdout.write(String(v).replace(/^[~^]/,''))")"; \
    echo "$PW_VERSION" > /app/.playwright-version

# Layer A: keep base OS packages current.
RUN set -eux; \
    apt-get update; \
    apt-get -y upgrade; \
    rm -rf /var/lib/apt/lists/*

# Layer B: minimal process/runtime essentials.
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends tini ca-certificates curl xz-utils; \
    rm -rf /var/lib/apt/lists/*

# Layer C: browser shared-library dependencies used by Playwright Chromium.
RUN set -eux; \
    PW_VERSION="$(cat /app/.playwright-version)"; \
    npx --yes "playwright@$PW_VERSION" install-deps chromium; \
    rm -rf /root/.npm; \
    rm -rf /var/lib/apt/lists/*

# Create dedicated non-root user.
RUN groupadd --system --gid 10001 app && \
    useradd --system --uid 10001 --gid 10001 --home /app --shell /usr/sbin/nologin app

# Only copy Nitro runtime artifacts (not source tree/public dev files).
COPY --from=build --chown=app:app /workspace/apps/web/.output/server ./.output/server
COPY --from=build --chown=app:app /workspace/apps/web/.output/public ./.output/public
COPY --from=build --chown=app:app /workspace/apps/web/.output/nitro.json ./.output/nitro.json

# Writable dirs used by server-side upload/asset pipeline.
RUN mkdir -p .uploads .tmp public/assets /app/runtime-deps/playwright /app/runtime-deps/bin /app/runtime-deps/cache && chown -R app:app /app

# Source maps are not needed in production runtime image.
RUN find ./.output -type f -name '*.map' -delete || true

RUN cat >/usr/local/bin/container-start.sh <<'SH' && chmod +x /usr/local/bin/container-start.sh
#!/usr/bin/env sh
set -eu

log() {
  printf '[boot-deps] %s\n' "$*"
}

# Runtime browser cache path. Mount this as a volume to persist binaries.
DEPS_ROOT="${RUNTIME_DEPS_DIR:-/app/runtime-deps}"
PW_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$DEPS_ROOT/playwright}"
mkdir -p "$PW_PATH" >/dev/null 2>&1 || true
log "Dependency root: $DEPS_ROOT"
log "Playwright cache path: $PW_PATH"

# Install Chromium silently in the background on every boot.
PW_VERSION="$(cat /app/.playwright-version 2>/dev/null || true)"
(
  log "Chromium install started (version=${PW_VERSION:-latest})"
  if PLAYWRIGHT_BROWSERS_PATH="$PW_PATH" \
    npx --yes "playwright@${PW_VERSION:-latest}" install chromium >/dev/null 2>&1; then
    log "Chromium install completed"
  else
    log "Chromium install failed (app will continue; screenshot feature may be unavailable temporarily)"
  fi
) &

# Install static ffmpeg silently in the background if missing.
FFMPEG_BIN="${FFMPEG_PATH:-$DEPS_ROOT/bin/ffmpeg}"
if [ ! -x "$FFMPEG_BIN" ]; then
  (
    log "FFmpeg install started"
    URL="${FFMPEG_STATIC_URL:-}"
    SHA="${FFMPEG_STATIC_SHA256:-}"
    if [ -z "$URL" ]; then
      log "FFmpeg install skipped: FFMPEG_STATIC_URL is empty"
      exit 0
    fi

    CACHE_DIR="$DEPS_ROOT/cache/ffmpeg"
    TMP_DIR="$(mktemp -d /tmp/ffmpeg.XXXXXX)"
    ARCHIVE="$TMP_DIR/ffmpeg.tar.xz"
    mkdir -p "$CACHE_DIR" "$(dirname "$FFMPEG_BIN")" >/dev/null 2>&1 || true

    if [ -f "$CACHE_DIR/archive.tar.xz" ] && [ -n "$SHA" ]; then
      if echo "$SHA  $CACHE_DIR/archive.tar.xz" | sha256sum -c - >/dev/null 2>&1; then
        log "FFmpeg cache hit (checksum valid)"
        cp "$CACHE_DIR/archive.tar.xz" "$ARCHIVE"
      else
        log "FFmpeg cache present but checksum invalid; redownloading"
      fi
    fi

    if [ ! -f "$ARCHIVE" ]; then
      log "Downloading FFmpeg archive"
      if ! curl -fsSL "$URL" -o "$ARCHIVE"; then
        log "FFmpeg download failed"
        exit 0
      fi
      if [ -n "$SHA" ]; then
        if ! echo "$SHA  $ARCHIVE" | sha256sum -c - >/dev/null 2>&1; then
          log "FFmpeg checksum verification failed"
          exit 0
        fi
      fi
      cp "$ARCHIVE" "$CACHE_DIR/archive.tar.xz" >/dev/null 2>&1 || true
    fi

    if ! tar -xJf "$ARCHIVE" -C "$TMP_DIR" >/dev/null 2>&1; then
      log "FFmpeg archive extraction failed"
      exit 0
    fi
    FOUND="$(find "$TMP_DIR" -type f -name ffmpeg | head -n 1)"
    if [ -n "$FOUND" ]; then
      cp "$FOUND" "$FFMPEG_BIN.tmp" && chmod 0755 "$FFMPEG_BIN.tmp" && mv "$FFMPEG_BIN.tmp" "$FFMPEG_BIN"
      log "FFmpeg install completed at $FFMPEG_BIN"
    else
      log "FFmpeg binary not found in extracted archive"
    fi
    rm -rf "$TMP_DIR"
  ) &
else
  log "FFmpeg already present at $FFMPEG_BIN"
fi

log "Starting app server"
exec node .output/server/index.mjs
SH

USER app
EXPOSE 3000

ENTRYPOINT ["tini", "--", "/usr/local/bin/container-start.sh"]
