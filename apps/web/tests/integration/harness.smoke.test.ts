import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface SeedManifest {
    baseUrl: string;
    actors: Record<string, { cookieHeader: string }>;
}

function readManifest(): SeedManifest {
    const filePath = resolve(process.cwd(), 'apps/web/tests/.fixtures/seed-manifest.json');
    const content = readFileSync(filePath, 'utf8');
    return JSON.parse(content) as SeedManifest;
}

describe('test harness smoke', () => {
    test('seed manifest exists with expected actors', () => {
        const manifest = readManifest();
        expect(typeof manifest.baseUrl).toBe('string');
        expect(Boolean(manifest.actors.user_admin?.cookieHeader)).toBe(true);
        expect(Boolean(manifest.actors.user_editor?.cookieHeader)).toBe(true);
        expect(Boolean(manifest.actors.user_viewer?.cookieHeader)).toBe(true);
    });

    test('public CSP endpoint responds', async () => {
        const manifest = readManifest();
        const response = await fetch(`${manifest.baseUrl}/api/report-csp`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ 'csp-report': { 'document-uri': manifest.baseUrl } })
        });
        expect(response.status).toBe(204);
    });
});
