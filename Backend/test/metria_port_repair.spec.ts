import { test, expect } from '@playwright/test';

test('Metria Proxy Port Repair', async ({ page }) => {
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
  await page.waitForTimeout(3000);

  // Look for port inputs
  const portInputs = await page.locator('input[type="number"], input[placeholder="80"]').all();
  console.log(`Found ${portInputs.length} potential port inputs.`);
  
  for (const input of portInputs) {
      const val = await input.inputValue();
      console.log(`Current Proxy Port Value: ${val}`);
      if (val === '80' || val === '') {
          console.log('Port 80 detected. Changing to 4000...');
          await input.fill('4000');
          // Look for a save button nearby
          const saveBtn = page.locator('button:has-text("Save"), button:has-text("Update"), button:has-text("Deploy")').first();
          await saveBtn.click();
          console.log('Saved! Waiting for redeploy...');
          await page.waitForTimeout(5000);
      }
  }

  await page.screenshot({ path: 'easypanel_port_repair.png', fullPage: true });
});
