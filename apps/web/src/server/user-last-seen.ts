import '@tanstack/react-start/server-only';
import { throttle } from '@tanstack/pacer';

import { collections } from './collections';

const LAST_SEEN_THROTTLE_MS = Math.max(
    10_000,
    Number(process.env.USER_LAST_SEEN_THROTTLE_MS ?? 60_000)
);
const LAST_SEEN_CACHE_TTL_MS = Math.max(LAST_SEEN_THROTTLE_MS * 5, 10 * 60_000);

type LastSeenCacheEntry = {
    throttledWrite: (seenAtMs: number) => void;
    lastTouchedAtMs: number;
};

const _hmr = ((globalThis as any).__HTTP_USER_LAST_SEEN__ as
    | { byEmail: Map<string, LastSeenCacheEntry> }
    | undefined) ?? { byEmail: new Map<string, LastSeenCacheEntry>() };
(globalThis as any).__HTTP_USER_LAST_SEEN__ = _hmr;

function normalizeEmail(email: string | null | undefined): string | null {
    if (typeof email !== 'string') return null;
    const normalized = email.trim().toLowerCase();
    return normalized.length > 0 ? normalized : null;
}

function cleanupExpiredEntries(nowMs: number) {
    for (const [email, entry] of _hmr.byEmail) {
        if (nowMs - entry.lastTouchedAtMs > LAST_SEEN_CACHE_TTL_MS) {
            _hmr.byEmail.delete(email);
        }
    }
}

function createCacheEntry(email: string): LastSeenCacheEntry {
    const throttledWrite = throttle(
        (seenAtMs: number) => {
            void collections.users
                .updateOne({ email }, { $max: { lastSeen: new Date(seenAtMs) } })
                .catch((error) => {
                    console.error('[Auth] Failed to update user lastSeen', { email, error });
                });
        },
        { wait: LAST_SEEN_THROTTLE_MS }
    );

    return { throttledWrite, lastTouchedAtMs: Date.now() };
}

export function touchUserLastSeenThrottled(email: string | null | undefined): void {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) return;

    const nowMs = Date.now();
    cleanupExpiredEntries(nowMs);

    let entry = _hmr.byEmail.get(normalizedEmail);
    if (!entry) {
        entry = createCacheEntry(normalizedEmail);
        _hmr.byEmail.set(normalizedEmail, entry);
    }

    entry.lastTouchedAtMs = nowMs;
    entry.throttledWrite(nowMs);
}
