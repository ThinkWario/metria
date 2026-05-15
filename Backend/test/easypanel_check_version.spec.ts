import { test, expect } from '@playwright/test';

test('Check Production Code Version', async ({ page }) => {
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
  
  // Try to find the Console tab
  const consoleTab = page.locator('a, button').filter({ hasText: /^Console$/ }).first();
  if (await consoleTab.count() > 0) {
      await consoleTab.click();
      await page.waitForTimeout(10000);
      
      // Type 'grep -C 5 "PlanGate" dist/index.js'
      await page.keyboard.type('grep -C 5 "PlanGate" dist/index.js');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(5000);
      
      const bodyText = await page.evaluate(() => document.body.innerText);
      console.log('--- CONSOLE OUTPUT ---');
      console.log(bodyText);
  } else {
      console.log('❌ Console tab not found.');
  }

  await page.screenshot({ path: 'easypanel_console_check.png', fullPage: true });
});
