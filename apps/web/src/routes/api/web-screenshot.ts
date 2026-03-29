import { lookup } from 'node:dns/promises';
import { unlink } from 'node:fs/promises';
import { isIP } from 'node:net';
import { join } from 'node:path';

import { auth } from '@repo/auth/auth';
import { createFileRoute } from '@tanstack/react-router';

import { computeBlurhash, generateVariants } from '~/lib/serverAssetUtils';
import { ASSET_DIR } from '~/lib/serverVariables';
import {
    buildRateLimitSubjectKey,
    checkRateLimit,
    getClientIpFromHeaders
} from '~/server/rateLimit';

function urlToBaseId(url: string): string {
    // Deterministic short id from URL for filenames
    let hash = 0;
    for (let i = 0; i < url.length; i++) {
        hash = ((hash << 5) - hash + url.charCodeAt(i)) | 0;
    }
    return `web_${(hash >>> 0).toString(36)}`;
}

async function cleanupPreviousFiles(baseId: string): Promise<void> {
    try {
        const { readdir } = await import('node:fs/promises');
        const files = await readdir(ASSET_DIR);
        for (const file of files) {
            if (file.startsWith(baseId)) {
                await unlink(join(ASSET_DIR, file)).catch(() => {});
            }
        }
    } catch {
        // Best-effort cleanup
    }
}

const screenshotAllowlist = String(process.env.WEB_SCREENSHOT_ALLOWLIST ?? '')
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);

function isForbiddenIp(ip: string): boolean {
    const version = isIP(ip);
    if (version === 4) {
        return (
            ip.startsWith('127.') ||
            ip.startsWith('10.') ||
            ip.startsWith('192.168.') ||
            /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip) ||
            ip.startsWith('169.254.') ||
            ip === '0.0.0.0'
        );
    }
    if (version === 6) {
        const normalized = ip.toLowerCase();
        return (
            normalized === '::1' ||
            normalized.startsWith('fc') ||
            normalized.startsWith('fd') ||
            normalized.startsWith('fe80:')
        );
    }
    return false;
}

async function assertScreenshotTargetSafe(rawUrl: string) {
    let parsed: URL;
    try {
        parsed = new URL(rawUrl);
    } catch {
        throw new Error('Invalid URL');
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('Only http/https URLs are allowed');
    }

    const host = parsed.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.localhost')) {
        throw new Error('Blocked host');
    }
    if (screenshotAllowlist.length > 0 && !screenshotAllowlist.includes(host)) {
        throw new Error('Host is not allowlisted');
    }

    if (isForbiddenIp(host)) throw new Error('Blocked IP target');

    const resolved = await lookup(host, { all: true });
    if (resolved.some((entry) => isForbiddenIp(entry.address))) {
        throw new Error('Blocked resolved IP target');
    }
}

export const Route = createFileRoute('/api/web-screenshot')({
    server: {
        handlers: {
            POST: async ({ request }: { request: Request }) => {
                const session = await auth.api.getSession({ headers: request.headers });
                const internalToken = request.headers.get('x-internal-screenshot-token');
                const isInternal =
                    Boolean(process.env.SCREENSHOT_INTERNAL_TOKEN) &&
                    internalToken === process.env.SCREENSHOT_INTERNAL_TOKEN;
                if (!session && !isInternal) {
                    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                        status: 401,
                        headers: { 'Content-Type': 'application/json' }
                    });
                }

                const requesterIp = getClientIpFromHeaders(request.headers);
                const subjectKey = buildRateLimitSubjectKey({
                    actorId: session?.user?.email ?? null,
                    ip: requesterIp
                });
                const rateLimit = checkRateLimit({
                    subjectKey
                });
                if (!rateLimit.allowed) {
                    return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
                        status: 429,
                        headers: {
                            'Content-Type': 'application/json',
                            'Retry-After': String(Math.ceil(rateLimit.retryAfterMs / 1000))
                        }
                    });
                }

                let body: {
                    url: string;
                    width: number;
                    height: number;
                    scale?: number;
                    previousBaseId?: string;
                };

                try {
                    body = await request.json();
                } catch {
                    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
                        status: 400,
                        headers: { 'Content-Type': 'application/json' }
                    });
                }

                const { url, width, height, scale = 1 } = body;

                if (!url || !width || !height) {
                    return new Response(
                        JSON.stringify({ error: 'url, width, and height are required' }),
                        { status: 400, headers: { 'Content-Type': 'application/json' } }
                    );
                }
                if (
                    !Number.isFinite(width) ||
                    !Number.isFinite(height) ||
                    width < 64 ||
                    height < 64 ||
                    width > 8192 ||
                    height > 8192
                ) {
                    return new Response(JSON.stringify({ error: 'Invalid viewport dimensions' }), {
                        status: 400,
                        headers: { 'Content-Type': 'application/json' }
                    });
                }
                if (!Number.isFinite(scale) || scale <= 0 || scale > 4) {
                    return new Response(JSON.stringify({ error: 'Invalid scale' }), {
                        status: 400,
                        headers: { 'Content-Type': 'application/json' }
                    });
                }

                try {
                    await assertScreenshotTargetSafe(url);
                } catch (error: any) {
                    return new Response(
                        JSON.stringify({ error: error?.message ?? 'Blocked target' }),
                        {
                            status: 400,
                            headers: { 'Content-Type': 'application/json' }
                        }
                    );
                }

                // Clean up previous screenshot files if provided
                if (body.previousBaseId) {
                    await cleanupPreviousFiles(body.previousBaseId);
                }

                const baseId = urlToBaseId(url);
                const filename = `${baseId}.png`;
                const screenshotPath = join(ASSET_DIR, filename);

                // Match the wall iframe: viewport = layer size / scale, so the page
                // renders exactly as it appears in the scaled iframe on the wall.
                const viewportWidth = Math.max(1, Math.round(width / scale));
                const viewportHeight = Math.max(1, Math.round(height / scale));

                let browser;
                try {
                    const { chromium } = await import('playwright');
                    browser = await chromium.launch({ headless: true });
                    const context = await browser.newContext({
                        viewport: { width: viewportWidth, height: viewportHeight }
                    });
                    const page = await context.newPage();

                    await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });

                    // Clip to the viewport so the screenshot matches the layer dimensions
                    await page.screenshot({
                        path: screenshotPath,
                        type: 'png',
                        clip: { x: 0, y: 0, width: viewportWidth, height: viewportHeight }
                    });
                    await browser.close();
                    browser = undefined;

                    // Generate blurhash and variants using the shared pipeline
                    const blurhash = await computeBlurhash(screenshotPath);
                    const sizes = await generateVariants(screenshotPath, baseId);

                    return new Response(JSON.stringify({ filename, baseId, blurhash, sizes }), {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' }
                    });
                } catch (err: any) {
                    console.error('[WebScreenshot] Failed:', err);
                    if (browser) await browser.close().catch(() => {});
                    const message = String(err?.message ?? 'Screenshot capture failed');
                    const notReady =
                        message.includes('Executable does not exist') ||
                        message.includes('browserType.launch') ||
                        message.includes('playwright');
                    return new Response(
                        JSON.stringify({
                            error: notReady
                                ? 'Screenshot browser is not ready yet. Retry shortly.'
                                : message
                        }),
                        {
                            status: notReady ? 503 : 500,
                            headers: { 'Content-Type': 'application/json' }
                        }
                    );
                }
            }
        }
    }
});
