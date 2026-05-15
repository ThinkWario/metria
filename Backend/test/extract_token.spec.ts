import { test, expect } from '@playwright/test';

test('Extract Token from Production', async ({ page }) => {
  const loginUrl = 'https://metria-metrics.vercel.app/login';
  const credentials = {
    email: 'cmoralesv.fb@gmail.com',
    password: '56JVdcqghGdYib7'
  };

  await page.goto(loginUrl);
  await page.fill('input[type="email"]', credentials.email);
  await page.fill('input[type="password"]', credentials.password);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard');
  await page.waitForTimeout(5000);

  const ls = await page.evaluate(() => JSON.stringify(localStorage));
  console.log('LOCAL_STORAGE:', ls);
  
  const cookies = await page.context().cookies();
  console.log('COOKIES:', JSON.stringify(cookies));
});
