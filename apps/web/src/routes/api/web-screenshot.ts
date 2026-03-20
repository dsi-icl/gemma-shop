import { unlink } from 'node:fs/promises';
import { join } from 'node:path';

import { createFileRoute } from '@tanstack/react-router';
import { chromium } from 'playwright';

import { computeBlurhash, generateVariants } from '~/lib/serverAssetUtils';
import { ASSET_DIR } from '~/lib/serverVariables';

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

export const Route = createFileRoute('/api/web-screenshot')({
    server: {
        handlers: {
            POST: async ({ request }: { request: Request }) => {
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
                    browser = await chromium.launch({ headless: true });
                    const context = await browser.newContext({
                        viewport: { width: viewportWidth, height: viewportHeight }
                    });
                    const page = await context.newPage();

                    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

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
                    return new Response(
                        JSON.stringify({ error: err.message || 'Screenshot capture failed' }),
                        { status: 500, headers: { 'Content-Type': 'application/json' } }
                    );
                }
            }
        }
    }
});
