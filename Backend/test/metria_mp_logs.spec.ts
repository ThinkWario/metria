import { test, expect } from '@playwright/test';

test('Metria MP Error Diagnostic', async ({ page }) => {
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

  console.log('Accessing Logs to see MP error...');
  await page.click('text=Monitor').catch(() => {});
  await page.waitForTimeout(10000);

  const logs = await page.locator('pre').allInnerTexts();
  console.log('--- LOGS (MP Check) ---');
  logs.forEach(l => {
      if (l.includes('MercadoPago') || l.includes('Preference')) {
          console.log(l.slice(-1000));
      }
  });

  await page.screenshot({ path: 'easypanel_mp_error_logs.png', fullPage: true });
});
