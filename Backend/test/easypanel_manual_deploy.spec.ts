import { test, expect } from '@playwright/test';

test('Trigger Manual Deploy in Easypanel', async ({ page }) => {
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

  console.log('Clicking Deploy button...');
  const deployBtn = page.locator('button:has-text("Deploy")').first();
  if (await deployBtn.count() > 0) {
      await deployBtn.click();
      console.log('Deploy clicked. Waiting for deployment to finish (2m)...');
      await page.waitForTimeout(120000);
  } else {
      console.log('❌ Deploy button not found.');
  }

  await page.screenshot({ path: 'easypanel_manual_deploy.png', fullPage: true });
});
