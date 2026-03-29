import { setTimeout as sleep } from 'node:timers/promises';

const baseUrl =
    process.env.TEST_BASE_URL || `http://localhost:${process.env.WEB_HOST_PORT ?? '3870'}`;
const healthUrl = `${baseUrl}/`;
const maxAttempts = Number(process.env.TEST_PREPARE_MAX_ATTEMPTS ?? '30');
const delayMs = Number(process.env.TEST_PREPARE_DELAY_MS ?? '1000');

async function waitForWeb() {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const response = await fetch(healthUrl, { method: 'GET' });
            if (response.ok) {
                console.log(`[test-harness] Web is ready at ${baseUrl}`);
                return;
            }
        } catch {
            // Ignore until retries exhausted.
        }
        await sleep(delayMs);
    }
    throw new Error(`[test-harness] Web did not become ready at ${baseUrl}`);
}

await waitForWeb();
await import('./seed.mjs');
process.exit(0);
