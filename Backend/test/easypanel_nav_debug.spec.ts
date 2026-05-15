import { test, expect } from '@playwright/test';

test('Find Logs and Monitor in Easypanel', async ({ page }) => {
  test.setTimeout(180000);
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

  console.log('Navigating to backend_m app...');
  await page.goto(`${easypanelUrl}/projects/bobyads/app/backend_m`);
  await page.waitForTimeout(5000);

  // Debug: Log all text and links to find where logs are
  const allLinks = await page.evaluate(() => Array.from(document.querySelectorAll('a, button')).map(el => ({ text: el.innerText, tag: el.tagName })));
  console.log('All links/buttons:', JSON.stringify(allLinks, null, 2));

  // Try to click "Monitor" if it exists in the current context or sidebar
  const monitorLink = page.locator('a:has-text("Monitor"), button:has-text("Monitor")').first();
  if (await monitorLink.count() > 0) {
      console.log('Clicking Monitor...');
      await monitorLink.click();
      await page.waitForTimeout(5000);
      
      // Look for logs inside monitor
      const logsLink = page.locator('a:has-text("Logs"), button:has-text("Logs")').first();
      if (await logsLink.count() > 0) {
          console.log('Found Logs in Monitor. Clicking...');
          await logsLink.click();
          await page.waitForTimeout(10000);
          console.log('Logs text:', (await page.evaluate(() => document.body.innerText)).substring(0, 1000));
      }
  }

  await page.screenshot({ path: 'easypanel_navigation_debug.png', fullPage: true });
});
