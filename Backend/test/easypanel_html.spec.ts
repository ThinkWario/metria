import { test, expect } from '@playwright/test';

test('Easypanel HTML Inspection - backend_m', async ({ page }) => {
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
  await page.waitForTimeout(10000); // Give plenty of time for JS to render

  const html = await page.content();
  console.log('--- HTML START ---');
  console.log(html.substring(0, 10000));
  console.log('--- HTML END ---');

  // Try to find any status-like text
  const text = await page.locator('body').innerText();
  console.log('--- INNER TEXT START ---');
  console.log(text);
  console.log('--- INNER TEXT END ---');
});
