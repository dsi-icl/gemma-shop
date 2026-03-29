import { expect, test } from 'playwright/test';

test.use({ storageState: 'apps/web/tests/.auth/user_admin.json' });

test('admin actor can access admin route without guest redirect', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).not.toHaveURL(/\/login/i);
    await expect(page.locator('body')).toBeVisible();
});
