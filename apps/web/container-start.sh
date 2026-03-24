#!/usr/bin/env sh
set -eu

log() {
  printf '[boot-deps] %s\n' "$*"
}

# Runtime browser cache path. Mount this as a volume to persist binaries.
DEPS_ROOT="${APP_DATA_DIR:-/app/data}"
PW_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$DEPS_ROOT/playwright}"
UPLOAD_PATH="${UPLOAD_DIR:-$DEPS_ROOT/uploads}"
TMP_PATH="${TMP_DIR:-$DEPS_ROOT/tmp}"
ASSET_PATH="${ASSET_DIR:-$DEPS_ROOT/assets}"
BIN_PATH="$(dirname "${FFMPEG_PATH:-$DEPS_ROOT/bin/ffmpeg}")"
CACHE_PATH="$DEPS_ROOT/cache"
FFMPEG_CACHE_PATH="$CACHE_PATH/ffmpeg"

# Create writable runtime folders on every boot.
mkdir -p \
  "$DEPS_ROOT" \
  "$UPLOAD_PATH" \
  "$TMP_PATH" \
  "$ASSET_PATH" \
  "$PW_PATH" \
  "$BIN_PATH" \
  "$CACHE_PATH" \
  "$FFMPEG_CACHE_PATH" >/dev/null 2>&1 || true

log "Dependency root: $DEPS_ROOT"
log "Playwright cache path: $PW_PATH"

# Install Chromium silently in the background on every boot.
PW_VERSION="$(cat /app/.playwright-version 2>/dev/null || true)"
(
  log "Chromium install started (version=${PW_VERSION:-latest})"
  if PLAYWRIGHT_BROWSERS_PATH="$PW_PATH" \
    bunx "playwright@${PW_VERSION:-latest}" install chromium >/dev/null 2>&1; then
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

    CACHE_DIR="$FFMPEG_CACHE_PATH"
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
      if cp "$FOUND" "$FFMPEG_BIN.tmp" && chmod 0755 "$FFMPEG_BIN.tmp" && mv "$FFMPEG_BIN.tmp" "$FFMPEG_BIN"; then
        log "FFmpeg install completed at $FFMPEG_BIN"
      else
        log "FFmpeg install failed while copying binary to $FFMPEG_BIN"
      fi
    else
      log "FFmpeg binary not found in extracted archive"
    fi
    rm -rf "$TMP_DIR"
  ) &
else
  log "FFmpeg already present at $FFMPEG_BIN"
fi

log "Starting app server"
exec bun --dns-result-order="${DNS_RESULT_ORDER:-ipv4first}" .output/server/index.mjs
