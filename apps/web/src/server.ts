import { mkdirSync } from 'node:fs';

import { env, bootHealth } from '@repo/env';
import handler, { createServerEntry } from '@tanstack/react-start/server-entry';
import { MongoClient } from 'mongodb';

import { UPLOAD_DIR, TMP_DIR, ASSET_DIR } from '~/lib/serverVariables';

const bootIssues: string[] = [...bootHealth.issues];
let startupChecksPromise: Promise<void> | null = null;

try {
    mkdirSync(UPLOAD_DIR, { recursive: true });
    mkdirSync(TMP_DIR, { recursive: true });
    mkdirSync(ASSET_DIR, { recursive: true });
} catch (err) {
    console.error('Asset management directory creation failed:', err);
    bootIssues.push('Unable to initialize storage directories (UPLOAD_DIR/TMP_DIR/ASSET_DIR).');
}

function renderBootErrorPage(issues: string[]): string {
    const items = issues.map((issue) => `<li>${issue}</li>`).join('');
    return `<!doctype html>
    <html lang="en">
        <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>Gemma Cast Unavailable</title>
        <style>
            :root { color-scheme: dark; }
            body {
                margin: 0;
                min-height: 100vh;
                display: grid;
                place-items: center;
                background: #0a0a0a;
                color: #a3a3a3;
                font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
            }
            .card {
                width: min(860px, calc(100vw - 32px));
                border: 1px solid #27272a;
                border-radius: 16px;
                padding: 24px;
                background: linear-gradient(180deg, #111113, #0d0d0f);
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
            }
            h1 { margin: 0 0 8px; color: #fafafa; font-size: 22px; }
            p { margin: 0 0 16px; color: #a1a1aa; }
            ul { margin: 0; padding-left: 18px; color: #d4d4d8; }
            li { margin: 4px 0; }
            .hint { margin-top: 18px; color: #71717a; font-size: 13px; }
        </style>
        </head>
            <body>
                <main class="card">
                    <h1>Service temporarily unavailable</h1>
                    <p>Gemma Shop started in degraded mode due to missing or invalid startup configuration.</p>
                    <ul>${items}</ul>
                    <p class="hint">Update environment configuration and restart the service.</p>
                </main>
            </body>
    </html>`;
}

async function verifyMongoReplicaSet(): Promise<void> {
    if (!env.SERVER_DATABASE_URL) return;

    let client: MongoClient | null = null;
    try {
        client = new MongoClient(env.SERVER_DATABASE_URL, {
            serverSelectionTimeoutMS: 5000,
            connectTimeoutMS: 5000
        });
        await client.connect();

        const adminDb = client.db('admin');
        const hello = await adminDb.command({ hello: 1 });
        const setName = hello?.setName as string | undefined;

        if (!setName) {
            bootIssues.push(
                'MongoDB is reachable but not configured as a replica set. Change streams require a replica set.'
            );
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        bootIssues.push(`MongoDB connectivity check failed: ${message}`);
    } finally {
        if (client) {
            await client.close().catch(() => {});
        }
    }
}

async function runStartupChecksOnce(): Promise<void> {
    if (!startupChecksPromise) {
        startupChecksPromise = (async () => {
            if (bootIssues.length > 0) return;
            await verifyMongoReplicaSet();
        })();
    }
    await startupChecksPromise;
}

export default createServerEntry({
    async fetch(request) {
        await runStartupChecksOnce();
        if (bootIssues.length > 0) {
            const url = new URL(request.url);
            if (url.pathname.startsWith('/api/')) {
                return new Response(
                    JSON.stringify({
                        error: 'service_unavailable',
                        message:
                            'Service started in degraded mode due to startup configuration issues.',
                        issues: bootIssues
                    }),
                    { status: 503, headers: { 'Content-Type': 'application/json' } }
                );
            }
            return new Response(renderBootErrorPage(bootIssues), {
                status: 503,
                headers: { 'Content-Type': 'text/html; charset=utf-8' }
            });
        }
        return handler.fetch(request);
    }
});
