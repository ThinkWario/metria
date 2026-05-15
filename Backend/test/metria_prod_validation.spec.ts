import { test, expect } from '@playwright/test';

test('Metria Production Validation', async ({ page }) => {
  test.setTimeout(120000);
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

  // Go to backend_m
  console.log('Navigating to backend_m...');
  await page.goto(`${easypanelUrl}/projects/bobyads/app/backend_m`);
  await page.waitForTimeout(5000);

  // Extract Domains
  await page.click('text=Domains').catch(() => {});
  await page.waitForTimeout(2000);
  const domains = await page.locator('text=/https?:\\/\\//').allInnerTexts();
  const metriaApiUrl = [...new Set(domains)].find(d => d.includes('3awmod.easypanel.host') || d.includes('metria'));
  console.log(`METRIA_API_URL candidates:`, metriaApiUrl);

  // Extract ENV
  await page.goto(`${easypanelUrl}/projects/bobyads/app/backend_m/settings`); // Assuming settings tab
  await page.click('text=Environment').catch(() => {});
  await page.waitForTimeout(2000);
  const envText = await page.locator('body').textContent();
  console.log('Environment check completed.');

  // Check Logs
  await page.goto(`${easypanelUrl}/projects/bobyads/app/backend_m`);
  await page.click('text=Monitor').catch(() => {});
  await page.waitForTimeout(5000);
  const logs = await page.locator('body').textContent();
  console.log('--- LOGS SNIPPET ---');
  console.log(logs?.substring(0, 1000));
  
  await page.screenshot({ path: 'metria_production_logs.png', fullPage: true });
});
