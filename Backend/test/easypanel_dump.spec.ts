import { test, expect } from '@playwright/test';

test('Easypanel Text Dump', async ({ page }) => {
  const easypanelUrl = 'http://31.97.160.123:3000';
  const credentials = {
    email: 'cmoralesv.fb@gmail.com',
    password: '56JVdcqghGdYib7'
  };

  await page.goto(easypanelUrl);
  await page.fill('input[type="email"]', credentials.email);
  await page.fill('input[type="password"]', credentials.password);
  await page.click('button[type="submit"]');
  
  // Wait for login to complete
  await page.waitForTimeout(10000);
  console.log(`Current URL: ${page.url()}`);

  const bodyText = await page.locator('body').innerText();
  console.log('--- FULL PAGE TEXT START ---');
  console.log(bodyText);
  console.log('--- FULL PAGE TEXT END ---');

  // Find all links
  const links = await page.locator('a').all();
  console.log(`Found ${links.length} links:`);
  for (const link of links) {
    const text = await link.textContent();
    const href = await link.getAttribute('href');
    if (href?.includes('/projects/')) {
        console.log(`LINK: "${text?.trim()}" | HREF: ${href}`);
    }
  }

  await page.screenshot({ path: 'easypanel_text_dump.png', fullPage: true });
});
