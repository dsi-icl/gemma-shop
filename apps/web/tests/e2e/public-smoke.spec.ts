import { expect, test } from 'playwright/test';

test('public homepage loads', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();
});
