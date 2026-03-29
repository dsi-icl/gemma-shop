import { defineConfig, devices } from 'playwright/test';

const baseURL =
    process.env.TEST_BASE_URL || `http://localhost:${process.env.WEB_HOST_PORT ?? '3870'}`;

export default defineConfig({
    testDir: './tests/e2e',
    timeout: 60_000,
    expect: {
        timeout: 10_000
    },
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? [['dot'], ['html', { open: 'never' }]] : [['list']],
    use: {
        baseURL,
        trace: 'retain-on-failure',
        video: 'retain-on-failure',
        screenshot: 'only-on-failure'
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] }
        }
    ]
});
