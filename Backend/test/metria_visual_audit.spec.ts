import { test, expect } from '@playwright/test';

test('Metria Visual Domain Audit', async ({ page }) => {
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

  console.log('Navigating to Domains tab...');
  await page.click('button:has-text("Domains"), a:has-text("Domains")').catch(() => {});
  await page.waitForTimeout(10000);

  // Take a high-res screenshot
  await page.screenshot({ path: 'easypanel_domains_tab.png', fullPage: true });
  
  // Dump all input and button roles
  const elements = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('input, button, select, label')).map(el => ({
        tag: el.tagName,
        text: (el as HTMLElement).innerText,
        placeholder: (el as HTMLInputElement).placeholder,
        value: (el as HTMLInputElement).value,
        id: el.id,
        className: el.className
    }));
  });
  console.log('--- ELEMENTS DUMP ---');
  console.log(JSON.stringify(elements, null, 2));
});
