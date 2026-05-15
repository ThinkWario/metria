import { test, expect } from '@playwright/test';

test('Metria Real-time Logs Diagnostic', async ({ page }) => {
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

  await page.goto(`${easypanelUrl}/projects/bobyads/app/backend_m`);
  await page.waitForTimeout(5000);

  console.log('Accessing Monitor/Logs...');
  await page.click('text=Monitor').catch(() => {});
  await page.waitForTimeout(10000);

  // Try to find the log container
  const logs = await page.locator('pre').allTextContents().catch(() => ['No pre logs found']);
  console.log('--- LOGS START ---');
  logs.forEach(l => console.log(l));
  console.log('--- LOGS END ---');

  // Also check "Deployments" for build/run logs
  await page.click('text=Deployments').catch(() => {});
  await page.waitForTimeout(5000);
  const deployments = await page.locator('body').innerText();
  console.log('Deployments snippet:', deployments.substring(0, 1000));

  await page.screenshot({ path: 'easypanel_full_monitor.png', fullPage: true });
});
