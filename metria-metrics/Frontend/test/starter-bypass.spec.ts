import { test, expect } from '@playwright/test';

test.describe('Metria Metrics: User Flow & Starter Plan Bypass', () => {
  const loginUrl = 'https://metria-metrics.vercel.app/login';
  const testEmail = 'admin@metria.com'; // User known to be ADMIN/STARTER
  const testPassword = 'metria2025'; // Updated from user hint

  test('should login and access SCALE-level features as STARTER', async ({ page }) => {
    // 1. Navigate to Login
    await page.goto(loginUrl);
    await expect(page).toHaveTitle(/Metria/);

    // 2. Perform Login
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');

    // 3. Verify Dashboard Access
    await expect(page).toHaveURL(/.*dashboard/);
    await expect(page.locator('text=Centro de Control')).toBeVisible();

    // 4. Verify STARTER Banner is present
    await expect(page.locator('text=PLAN STARTER')).toBeVisible();

    // 5. TEST THE BYPASS: Navigate to a SCALE-restricted module (e.g., AI Settings)
    // In a normal system, this would 403 or redirect if not Scale.
    await page.goto('/dashboard/settings/ai-agent');
    
    // Check if the page content loads instead of an error
    await expect(page.locator('text=Gestión de Agentes IA')).toBeVisible();
    await expect(page.locator('text=Cerebro y Personalidad')).toBeVisible();

    // 6. Navigate to Marketing (Another restricted module)
    await page.click('text=Marketing & Ads');
    await expect(page.locator('text=Andromeda')).toBeVisible();
  });
});
