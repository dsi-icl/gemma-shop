import { defineEventHandler, getQuery, getRequestHost } from 'nitro/h3';

const PROXY_ALLOWED_REFERRERS = (process.env.PROXY_ALLOWED_REFERRERS ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
const PROXY_ALLOW_MISSING_REFERRER =
    process.env.PROXY_ALLOW_MISSING_REFERRER === 'true' || process.env.NODE_ENV !== 'production';
const PROXY_FETCH_TIMEOUT_MS = Number(process.env.PROXY_FETCH_TIMEOUT_MS ?? 8000);
const PROXY_MAX_BYTES = Number(process.env.PROXY_MAX_BYTES ?? 4 * 1024 * 1024);

function buildAbsoluteUrl(
    event: Parameters<typeof getRequestHost>[0],
    path: '/web-nonet?l=wall' | '/web-corsissue?l=wall'
): string {
    const host = getRequestHost(event, { xForwardedHost: true });
    const proto = event.req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() || 'http';
    return `${proto}://${host}${path}`;
}

function isHttpUrl(value: string): boolean {
    try {
        const parsed = new URL(value);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
}

function getAncestorOrigin(event: Parameters<typeof getRequestHost>[0]): string | null {
    const referer = event.req.headers.get('referer');
    const origin = event.req.headers.get('origin');
    try {
        if (referer) return new URL(referer).origin;
    } catch {}
    try {
        if (origin) return new URL(origin).origin;
    } catch {}
    return null;
}

function getAllowedReferrers(event: Parameters<typeof getRequestHost>[0]): string[] {
    const host = getRequestHost(event, { xForwardedHost: true });
    return [...PROXY_ALLOWED_REFERRERS, `http://${host}`, `https://${host}`];
}

function isAllowedReferrer(rawValue: string | null, allowlist: string[]): boolean {
    if (!rawValue) return false;
    try {
        const valueUrl = new URL(rawValue);
        return allowlist.some((allowed) => {
            if (allowed.includes('://')) {
                return rawValue.startsWith(allowed);
            }
            return valueUrl.host === allowed || valueUrl.hostname === allowed;
        });
    } catch {
        return false;
    }
}

function parseFrameAncestors(csp: string): string[] | null {
    const parts = csp.split(';').map((p) => p.trim());
    const directive = parts.find((p) => p.toLowerCase().startsWith('frame-ancestors'));
    if (!directive) return null;
    return directive
        .split(/\s+/)
        .slice(1)
        .map((v) => v.trim())
        .filter(Boolean);
}

function tokenAllowsAncestor(token: string, ancestorOrigin: string, targetOrigin: string): boolean {
    const t = token.toLowerCase();
    if (t === '*') return true;
    if (t === "'none'") return false;
    if (t === "'self'") return ancestorOrigin === targetOrigin;
    if (t === "'unsafe-inline'" || t === "'unsafe-eval'") return false;
    if (t.endsWith(':') && !t.includes('/')) {
        return ancestorOrigin.startsWith(t);
    }
    try {
        return new URL(token).origin === ancestorOrigin;
    } catch {
        return false;
    }
}

function wouldRejectFraming(
    headers: Headers,
    targetUrl: string,
    ancestorOrigin: string | null
): { reject: boolean; reason?: string } {
    const xfo = (headers.get('x-frame-options') ?? '').toLowerCase();
    const csp = headers.get('content-security-policy') ?? '';
    const targetOrigin = new URL(targetUrl).origin;

    if (xfo.includes('deny')) {
        return { reject: true, reason: 'x-frame-options=DENY' };
    }
    if (xfo.includes('sameorigin')) {
        if (!ancestorOrigin || ancestorOrigin !== targetOrigin) {
            return { reject: true, reason: 'x-frame-options=SAMEORIGIN' };
        }
    }

    const allowFromMatch = xfo.match(/allow-from\s+([^\s]+)/i);
    if (allowFromMatch?.[1]) {
        try {
            const allowedOrigin = new URL(allowFromMatch[1]).origin;
            if (!ancestorOrigin || ancestorOrigin !== allowedOrigin) {
                return { reject: true, reason: 'x-frame-options=ALLOW-FROM mismatch' };
            }
        } catch {
            return { reject: true, reason: 'x-frame-options=ALLOW-FROM invalid' };
        }
    }

    const frameAncestors = parseFrameAncestors(csp);
    if (frameAncestors && frameAncestors.length > 0) {
        if (!ancestorOrigin) {
            return { reject: true, reason: 'csp frame-ancestors present; unknown ancestor origin' };
        }
        const allowed = frameAncestors.some((token) =>
            tokenAllowsAncestor(token, ancestorOrigin, targetOrigin)
        );
        if (!allowed) {
            return { reject: true, reason: 'csp frame-ancestors blocks this ancestor' };
        }
    }

    return { reject: false };
}

function ensureBaseTag(html: string, upstreamUrl: string): string {
    const baseTag = `<base href="${upstreamUrl.replaceAll('"', '&quot;')}">`;
    if (/<base\b[^>]*>/i.test(html)) {
        return html.replace(/<base\b[^>]*>/i, baseTag);
    }
    if (/<head\b[^>]*>/i.test(html)) {
        return html.replace(/<head\b[^>]*>/i, (m) => `${m}${baseTag}`);
    }
    if (/<html\b[^>]*>/i.test(html)) {
        return html.replace(/<html\b[^>]*>/i, (m) => `${m}<head>${baseTag}</head>`);
    }
    return `<head>${baseTag}</head>${html}`;
}

function rewriteHtml(html: string, upstreamUrl: string): string {
    return ensureBaseTag(html, upstreamUrl);
}

async function readWithCap(response: Response, maxBytes: number): Promise<string> {
    const reader = response.body?.getReader();
    if (!reader) return '';
    const decoder = new TextDecoder();
    let total = 0;
    let out = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        total += value.byteLength;
        if (total > maxBytes) {
            throw new Error(`__proxy_too_large__:${maxBytes}`);
        }
        out += decoder.decode(value, { stream: true });
    }
    out += decoder.decode();
    return out;
}

export default defineEventHandler(async (event) => {
    const { url, check } = getQuery(event);
    const checkOnly = check === '1' || check === 'true';
    const rawUrl = typeof url === 'string' ? url : '';
    if (!rawUrl || !isHttpUrl(rawUrl)) {
        if (checkOnly) {
            return Response.json(
                { ok: false, reason: 'invalid_url', fallback: '/web-nonet?l=wall' },
                { status: 200 }
            );
        }
        return Response.redirect(buildAbsoluteUrl(event, '/web-nonet?l=wall'), 302);
    }

    const allowlist = getAllowedReferrers(event);
    const referer = event.req.headers.get('referer');
    const origin = event.req.headers.get('origin');
    const allowed =
        isAllowedReferrer(referer ?? null, allowlist) ||
        isAllowedReferrer(origin ?? null, allowlist);

    if (!allowed && !PROXY_ALLOW_MISSING_REFERRER) {
        if (checkOnly) {
            return Response.json(
                { ok: false, reason: 'forbidden_origin', fallback: '/web-nonet?l=wall' },
                { status: 200 }
            );
        }
        return Response.redirect(buildAbsoluteUrl(event, '/web-nonet?l=wall'), 302);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROXY_FETCH_TIMEOUT_MS);

    try {
        const upstream = await fetch(rawUrl, {
            redirect: 'follow',
            signal: controller.signal,
            headers: {
                'user-agent': 'gemma-wall-proxy/1.0',
                accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5'
            }
        });

        if (!upstream.ok) {
            if (checkOnly) {
                return Response.json(
                    {
                        ok: false,
                        reason: `upstream_status_${upstream.status}`,
                        fallback: '/web-nonet?l=wall'
                    },
                    { status: 200 }
                );
            }
            return Response.redirect(buildAbsoluteUrl(event, '/web-nonet?l=wall'), 302);
        }

        if (checkOnly) {
            const framing = wouldRejectFraming(
                upstream.headers,
                upstream.url || rawUrl,
                getAncestorOrigin(event)
            );
            if (framing.reject) {
                return Response.json(
                    {
                        ok: false,
                        reason: framing.reason ?? 'frame_blocked',
                        fallback: '/web-corsissue?l=wall'
                    },
                    { status: 200 }
                );
            }
            return Response.json({ ok: true }, { status: 200 });
        }

        const contentType = upstream.headers.get('content-type') ?? '';
        const isHtmlLike =
            contentType.includes('text/html') ||
            contentType.includes('application/xhtml+xml') ||
            contentType === '';
        if (!isHtmlLike) {
            return Response.redirect(buildAbsoluteUrl(event, '/web-nonet?l=wall'), 302);
        }

        const sourceHtml = await readWithCap(upstream, PROXY_MAX_BYTES);
        const rewritten = rewriteHtml(sourceHtml, upstream.url || rawUrl);

        return new Response(rewritten, {
            status: 200,
            headers: {
                'content-type': 'text/html; charset=utf-8',
                'cache-control': 'public, max-age=30'
            }
        });
    } catch {
        if (checkOnly) {
            return Response.json(
                { ok: false, reason: 'network_error', fallback: '/web-nonet?l=wall' },
                { status: 200 }
            );
        }
        return Response.redirect(buildAbsoluteUrl(event, '/web-nonet?l=wall'), 302);
    } finally {
        clearTimeout(timeout);
    }
});
