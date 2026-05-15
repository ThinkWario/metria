import { test, expect } from '@playwright/test';

test('Metria Logs Capture', async ({ page }) => {
  test.setTimeout(300000); // 5 minutes
  const easypanelUrl = 'http://31.97.160.123:3000';
  const credentials = {
    email: 'cmoralesv.fb@gmail.com',
    password: '56JVdcqghGdYib7'
  };

  await page.goto(easypanelUrl);
  await page.fill('input[type="email"]', credentials.email);
  await page.fill('input[type="password"]', credentials.password);
  await page.click('button[type="submit"]');
  await page.waitForSelector('text=Dashboard', { timeout: 30000 });

  console.log('Navigating to backend_m monitor...');
  await page.goto(`${easypanelUrl}/projects/bobyads/app/backend_m`);
  await page.waitForTimeout(10000);
  
  // Try to find Monitor tab
  const monitorTab = page.locator('button:has-text("Monitor"), a:has-text("Monitor")');
  if (await monitorTab.count() > 0) {
      await monitorTab.first().click();
      console.log('Clicked Monitor tab');
      await page.waitForTimeout(10000);
  }

  const logs = await page.locator('body').innerText();
  console.log('--- PAGE TEXT DUMP (Logs check) ---');
  console.log(logs);
  console.log('--- END DUMP ---');

  await page.screenshot({ path: 'easypanel_logs_diagnostic.png', fullPage: true });
});
