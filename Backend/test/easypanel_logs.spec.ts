import { test, expect } from '@playwright/test';

test('Check Easypanel Logs for DB Tools', async ({ page }) => {
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

  await page.goto(`${easypanelUrl}/projects/bobyads/postgres/backend_mp`);
  await page.waitForTimeout(5000);

  console.log('Checking Logs for backend_mp postgres...');
  await page.click('button:has-text("Logs"), a:has-text("Logs")').first().click().catch(() => {});
  await page.waitForTimeout(10000);
  
  const pgLogs = await page.evaluate(() => document.body.innerText);
  console.log('--- POSTGRES LOGS SNIPPET ---');
  console.log(pgLogs.substring(0, 1000));

  // Check if there are separate logs for PgWeb/DbGate (sometimes they appear in "Advanced" or as sidecar)
  // In Easypanel, sidecars logs are sometimes tricky to find.
  
  await page.screenshot({ path: 'easypanel_db_logs.png', fullPage: true });
});
