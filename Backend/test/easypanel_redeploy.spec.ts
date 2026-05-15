import { test, expect } from '@playwright/test';

test('Force Restart Backend and Verify Plan', async ({ page }) => {
  test.setTimeout(180000);
  const easypanelUrl = 'http://31.97.160.123:3000';
  const credentials = {
    email: 'cmoralesv.fb@gmail.com',
    password: '56JVdcqghGdYib7'
  };

  await page.goto(easypanelUrl);
  await page.fill('input[type="email"]', credentials.email);
  await page.fill('input[type="password"]', credentials.password);
  await page.click('button[type="submit"]');
  await page.waitForSelector('text=Dashboard');

  console.log('Navigating to backend_m app...');
  await page.goto(`${easypanelUrl}/projects/bobyads/app/backend_m`);
  await page.waitForTimeout(10000);

  // Look for Deploy/Restart button
  const deployBtn = page.locator('button:has-text("Deploy"), button:has-text("Restart")').first();
  if (await deployBtn.count() > 0) {
      console.log('Clicking Deploy/Restart...');
      await deployBtn.click();
      await page.waitForTimeout(60000); // Wait for redeploy
  }

  await page.screenshot({ path: 'easypanel_backend_redeploy.png', fullPage: true });
});
