import { test, expect } from '@playwright/test';

test('Easypanel Deep Inspection', async ({ page }) => {
  test.setTimeout(120000); // 2 minutes
  const easypanelUrl = 'http://31.97.160.123:3000';
  const credentials = {
    email: 'cmoralesv.fb@gmail.com',
    password: '56JVdcqghGdYib7'
  };

  console.log('Logging into Easypanel...');
  await page.goto(easypanelUrl);
  await page.fill('input[type="email"]', credentials.email);
  await page.fill('input[type="password"]', credentials.password);
  await page.click('button[type="submit"]');

  // Wait for Dashboard to be visible (confirmation of login)
  await page.waitForSelector('text=Dashboard', { timeout: 15000 });
  console.log('Logged in successfully.');

  const targetApps = ['backend_m', 'backend_mp', 'backend_mr'];
  const results = {};

  for (const app of targetApps) {
    console.log(`Inspecting ${app}...`);
    await page.goto(`${easypanelUrl}/projects/bobyads/app/${app}`);
    await page.waitForTimeout(4000);
    
    // Try to click Domains tab if available
    const domainsTab = page.locator('button:has-text("Domains"), a:has-text("Domains")');
    if (await domainsTab.count() > 0) {
        await domainsTab.first().click();
        await page.waitForTimeout(2000);
    }

    const domains = await page.locator('text=/https?:\\/\\//').allInnerTexts();
    const uniqueDomains = [...new Set(domains)].filter(d => d.startsWith('http'));
    results[app] = uniqueDomains;
    console.log(`${app} domains:`, uniqueDomains);
  }

  console.log('FINAL RESULTS:', JSON.stringify(results, null, 2));
  await page.screenshot({ path: 'production_endpoints.png', fullPage: true });
});
