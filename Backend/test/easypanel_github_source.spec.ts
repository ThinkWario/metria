import { test, expect } from '@playwright/test';

test('Check Github Source in Easypanel', async ({ page }) => {
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

  await page.goto(`${easypanelUrl}/projects/bobyads/app/backend_m/source`);
  await page.waitForTimeout(5000);

  console.log('Clicking Github button...');
  const githubBtn = page.locator('button').filter({ hasText: /^Github$/ }).first();
  if (await githubBtn.count() > 0) {
      await githubBtn.click();
      await page.waitForTimeout(5000);
      
      const configText = await page.evaluate(() => document.body.innerText);
      console.log('--- GITHUB CONFIG START ---');
      console.log(configText);
  } else {
      console.log('❌ Github button not found.');
  }
  
  await page.screenshot({ path: 'easypanel_github_config.png', fullPage: true });
});
