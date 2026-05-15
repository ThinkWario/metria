import { test, expect } from '@playwright/test';

test('Configure Github Source in Easypanel', async ({ page }) => {
  test.setTimeout(240000);
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
  await page.locator('button').filter({ hasText: /^Github$/ }).first().click();
  await page.waitForTimeout(3000);

  console.log('Filling Github details...');
  await page.locator('input[placeholder*="username"]').first().fill('ThinkWario');
  await page.locator('input[placeholder*="repository"]').first().fill('metria');
  await page.locator('input[placeholder*="branch"]').first().fill('main');
  await page.locator('input[placeholder*="monorepo"]').first().fill('Backend');

  console.log('Clicking Save...');
  // There are two Save buttons, let's find the one in the Source section
  const sourceSection = page.locator('div').filter({ hasText: /^Source$/ }).locator('..');
  const saveBtn = sourceSection.locator('button:has-text("Save")').first();
  await saveBtn.click();
  
  await page.waitForTimeout(10000);
  console.log('Source saved. Triggering deploy...');
  
  const deployBtn = page.locator('button:has-text("Deploy")').first();
  if (await deployBtn.count() > 0) {
      await deployBtn.click();
      console.log('Deploy triggered. Waiting 3m for build...');
      await page.waitForTimeout(180000);
  }

  await page.screenshot({ path: 'easypanel_github_configured.png', fullPage: true });
});
