import { test, expect } from '@playwright/test';

test('Metria DB Credentials Extraction', async ({ page }) => {
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

  console.log('Clicking Credentials tab...');
  await page.click('button:has-text("Credentials"), a:has-text("Credentials")').catch(() => {});
  await page.waitForTimeout(3000);

  const bodyText = await page.locator('body').innerText();
  console.log('--- CREDENTIALS INFO ---');
  console.log(bodyText);

  await page.screenshot({ path: 'easypanel_db_credentials.png', fullPage: true });
});
