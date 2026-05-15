import { test, expect } from '@playwright/test';

test('Easypanel Final Check - Bobyads & Backend', async ({ page }) => {
  const easypanelUrl = 'http://31.97.160.123:3000';
  const credentials = {
    email: 'cmoralesv.fb@gmail.com',
    password: '56JVdcqghGdYib7'
  };

  await page.goto(easypanelUrl);
  await page.waitForLoadState('networkidle');

  await page.fill('input[type="email"]', credentials.email);
  await page.fill('input[type="password"]', credentials.password);
  await page.click('button[type="submit"]');

  // We know we are logged in even if URL says "/" for a moment because of the snippet
  await page.waitForURL('**/projects**', { timeout: 15000 }).catch(() => console.log('Timeout waiting for /projects, trying direct navigation'));
  
  await page.goto(`${easypanelUrl}/projects/bobyads`);
  await page.waitForLoadState('networkidle');
  console.log(`Currently at: ${page.url()}`);

  // Get all app links in bobyads
  const appLinks = await page.locator('a[href*="/app/"]').all();
  console.log(`Found ${appLinks.length} app links in bobyads.`);
  for (const link of appLinks) {
    const href = await link.getAttribute('href');
    const text = await link.textContent();
    console.log(`App: ${text?.trim()} | Link: ${href}`);
  }

  // Go to backend_m specifically
  await page.goto(`${easypanelUrl}/projects/bobyads/app/backend_m`);
  await page.waitForTimeout(5000);
  console.log(`Inspecting backend_m at: ${page.url()}`);

  // Find the public URL in Domains tab if possible
  await page.click('text=Domains').catch(() => console.log('Domains tab not clickable, searching on main page'));
  await page.waitForTimeout(2000);
  
  const domains = await page.locator('text=/https?:\\/\\//').allInnerTexts();
  console.log('Domains found:', domains);

  await page.screenshot({ path: 'easypanel_final_result.png', fullPage: true });
});
