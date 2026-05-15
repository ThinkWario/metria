import { test, expect } from '@playwright/test';

test('Expose Metria DB', async ({ page }) => {
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

  await page.goto(`${easypanelUrl}/projects/bobyads/postgres/backend_mp/expose`);
  await page.waitForTimeout(5000);

  const bodyText = await page.locator('body').innerText();
  console.log('--- EXPOSE INFO ---');
  console.log(bodyText);

  // If there is an input with the exposed port, let's find it
  const exposedPort = await page.locator('input[placeholder*="port"], input[value*="5432"]').first().getAttribute('value').catch(() => '');
  console.log(`Exposed port found: ${exposedPort}`);

  await page.screenshot({ path: 'easypanel_db_expose.png', fullPage: true });
});
