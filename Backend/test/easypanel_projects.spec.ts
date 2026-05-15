import { test, expect } from '@playwright/test';

test('Easypanel Direct Navigation', async ({ page }) => {
  const easypanelUrl = 'http://31.97.160.123:3000';
  const credentials = {
    email: 'cmoralesv.fb@gmail.com',
    password: '56JVdcqghGdYib7'
  };

  await page.goto(easypanelUrl);
  await page.fill('input[type="email"]', credentials.email);
  await page.fill('input[type="password"]', credentials.password);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(5000);

  // Direct navigation to projects
  await page.goto(`${easypanelUrl}/projects`);
  await page.waitForTimeout(3000);
  console.log(`At URL: ${page.url()}`);

  const allLinks = await page.locator('a').all();
  console.log(`Found ${allLinks.length} total links on /projects`);
  for (const link of allLinks) {
    const href = await link.getAttribute('href');
    const text = await link.textContent();
    if (href?.includes('/projects/')) {
        console.log(`PROJECT LINK: "${text?.trim()}" | Href: ${href}`);
    }
  }

  await page.screenshot({ path: 'easypanel_projects_view.png', fullPage: true });
});
