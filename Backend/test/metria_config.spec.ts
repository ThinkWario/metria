import { test, expect } from '@playwright/test';

test('Metria backend_m Config Check', async ({ page }) => {
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

  // Check the App Port
  const body = await page.locator('body').innerText();
  console.log('--- BACKEND_M INFO ---');
  if (body.includes('Port')) {
      console.log('Port info found in text');
      // Extract port using regex from the text
      const portMatch = body.match(/Port\s+(\d+)/i);
      if (portMatch) console.log(`Detected internal port: ${portMatch[1]}`);
  }

  // Check "Advanced" or "Settings" to find the port mapping
  await page.click('text=Advanced').catch(() => {});
  await page.waitForTimeout(2000);
  const advancedText = await page.locator('body').innerText();
  console.log('Advanced info:', advancedText.substring(0, 1000));

  await page.screenshot({ path: 'easypanel_backend_config.png', fullPage: true });
});
