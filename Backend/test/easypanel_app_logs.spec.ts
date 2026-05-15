import { test, expect } from '@playwright/test';

test('Check Easypanel Application Logs', async ({ page }) => {
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
  await page.waitForTimeout(5000);

  console.log('Clicking Logs tab...');
  // Find the Logs tab more reliably
  const logsTab = page.locator('a, button').filter({ hasText: /^Logs$/ }).first();
  if (await logsTab.count() > 0) {
      await logsTab.click();
      await page.waitForTimeout(15000); // Wait for logs to stream
      
      const logsText = await page.evaluate(() => document.body.innerText);
      console.log('--- APPLICATION LOGS START ---');
      // Look for the last 20 lines of logs
      const lines = logsText.split('\n');
      console.log(lines.slice(-30).join('\n'));
      console.log('--- APPLICATION LOGS END ---');
  } else {
      console.log('❌ Logs tab not found.');
  }
  
  await page.screenshot({ path: 'easypanel_app_logs.png', fullPage: true });
});
