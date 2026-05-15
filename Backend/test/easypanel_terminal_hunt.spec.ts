import { test, expect } from '@playwright/test';

test('Check Overview for Terminal in Easypanel', async ({ page }) => {
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

  // Look for any button that might be a console (often an icon without text)
  const buttons = await page.locator('button').all();
  for (const btn of buttons) {
      const title = await btn.getAttribute('title');
      const label = await btn.getAttribute('aria-label');
      const inner = await btn.innerHTML();
      console.log(`Button: title=${title}, label=${label}, hasSvg=${inner.includes('svg')}`);
      
      if (title?.toLowerCase().includes('console') || title?.toLowerCase().includes('terminal') || 
          label?.toLowerCase().includes('console') || label?.toLowerCase().includes('terminal')) {
          console.log('FOUND TERMINAL BUTTON!');
          await btn.click();
          await page.waitForTimeout(10000);
          break;
      }
  }

  await page.screenshot({ path: 'easypanel_overview_buttons.png', fullPage: true });
});
