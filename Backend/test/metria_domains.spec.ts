import { test, expect } from '@playwright/test';

test('Metria Domain Extraction', async ({ page }) => {
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

  console.log('Clicking Domains tab...');
  await page.click('button:has-text("Domains")').catch(() => console.log('Button not found by text, searching by role'));
  
  await page.waitForTimeout(3000);
  const bodyText = await page.locator('body').innerText();
  console.log('--- DOMAINS PAGE TEXT ---');
  console.log(bodyText);
  
  const links = await page.locator('a').all();
  for (const link of links) {
    const href = await link.getAttribute('href');
    if (href?.startsWith('http')) {
        console.log(`Potential Public Link: ${href}`);
    }
  }

  await page.screenshot({ path: 'easypanel_domains.png', fullPage: true });
});
