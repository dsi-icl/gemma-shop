type MaybeHeaders = Headers | Record<string, unknown> | undefined | null;

type StoredEntry = {
    timestamps: number[];
};

const DEFAULT_LIMIT_PER_MINUTE = 200;
const RATE_LIMIT_PER_MINUTE = Math.max(
    1,
    Number(process.env.RATE_LIMIT_PER_MINUTE ?? DEFAULT_LIMIT_PER_MINUTE)
);
const TRUST_FORWARDED_HEADERS = ['1', 'true', 'yes', 'on'].includes(
    String(process.env.TRUST_FORWARDED_HEADERS ?? '').toLowerCase()
);
const WINDOW_MS = 60_000;

const store = (process as any).__RATE_LIMIT_STORE__ ?? new Map<string, StoredEntry>();
(process as any).__RATE_LIMIT_STORE__ = store;

function pickHeader(headers: MaybeHeaders, key: string): string | null {
    if (!headers) return null;

    if (typeof (headers as any).get === 'function') {
        return (headers as any).get(key);
    }

    const raw = (headers as Record<string, unknown>)[key.toLowerCase()];
    if (Array.isArray(raw)) return typeof raw[0] === 'string' ? raw[0] : null;
    return typeof raw === 'string' ? raw : null;
}

function sanitizeIp(value: string | null): string | null {
    if (!value) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

export function getClientIpFromHeaders(headers: MaybeHeaders): string {
    if (!TRUST_FORWARDED_HEADERS) return 'unknown';

    const xff = pickHeader(headers, 'x-forwarded-for');
    if (xff) {
        const first = sanitizeIp(xff.split(',')[0]?.trim() ?? null);
        if (first) return first;
    }

    const forwarded = pickHeader(headers, 'forwarded');
    if (forwarded) {
        const match = forwarded.match(/for="?([^;,\s"]+)"?/i);
        const parsed = sanitizeIp(match?.[1] ?? null);
        if (parsed) return parsed;
    }

    const cf = sanitizeIp(pickHeader(headers, 'cf-connecting-ip'));
    if (cf) return cf;

    const realIp = sanitizeIp(pickHeader(headers, 'x-real-ip'));
    if (realIp) return realIp;

    return 'unknown';
}

export function buildRateLimitSubjectKey(input: {
    actorId?: string | null;
    deviceId?: string | null;
    ip?: string | null;
    peerId?: string | null;
}): string {
    if (input.actorId) return `actor:${input.actorId}`;
    if (input.deviceId) return `device:${input.deviceId}`;
    if (input.ip) return `ip:${input.ip}`;
    if (input.peerId) return `peer:${input.peerId}`;
    return 'anonymous';
}

export function checkRateLimit(input: { subjectKey: string }): {
    allowed: boolean;
    retryAfterMs: number;
    remaining: number;
    limitPerMinute: number;
} {
    const now = Date.now();
    const cutoff = now - WINDOW_MS;
    const key = input.subjectKey;
    const entry = store.get(key) ?? { timestamps: [] };

    entry.timestamps = entry.timestamps.filter((ts: number) => ts >= cutoff);
    if (entry.timestamps.length >= RATE_LIMIT_PER_MINUTE) {
        const oldest = entry.timestamps[0] ?? now;
        const retryAfterMs = Math.max(1_000, WINDOW_MS - (now - oldest));
        store.set(key, entry);
        return {
            allowed: false,
            retryAfterMs,
            remaining: 0,
            limitPerMinute: RATE_LIMIT_PER_MINUTE
        };
    }

    entry.timestamps.push(now);
    store.set(key, entry);

    return {
        allowed: true,
        retryAfterMs: 0,
        remaining: Math.max(0, RATE_LIMIT_PER_MINUTE - entry.timestamps.length),
        limitPerMinute: RATE_LIMIT_PER_MINUTE
    };
}
