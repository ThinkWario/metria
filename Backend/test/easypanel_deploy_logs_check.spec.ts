import { test, expect } from '@playwright/test';

test('View Latest Deployment Logs in Easypanel', async ({ page }) => {
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

  await page.goto(`${easypanelUrl}/projects/bobyads/app/backend_m/deployments`);
  await page.waitForTimeout(5000);

  console.log('Clicking latest View button...');
  const viewBtn = page.locator('button:has-text("View"), a:has-text("View")').first();
  if (await viewBtn.count() > 0) {
      await viewBtn.click();
      await page.waitForTimeout(10000);
      
      const logs = await page.evaluate(() => document.body.innerText);
      console.log('--- DEPLOYMENT LOGS ---');
      console.log(logs);
  } else {
      console.log('❌ View button not found.');
  }
  
  await page.screenshot({ path: 'easypanel_deploy_logs.png', fullPage: true });
});
