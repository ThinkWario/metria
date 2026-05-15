import { test, expect } from '@playwright/test';

test('Unmask DB Credentials via Sibling Search', async ({ page }) => {
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

  await page.goto(`${easypanelUrl}/projects/bobyads/postgres/backend_mp/credentials`);
  await page.waitForTimeout(10000);

  // Look for any masked password dots and the button next to it
  const dots = page.locator('text=••••••••••');
  const count = await dots.count();
  console.log(`Found ${count} masked fields.`);

  for (let i = 0; i < count; i++) {
      const dotField = dots.nth(i);
      // Usually there is a button in the same container
      const container = dotField.locator('xpath=./..');
      const eyeBtn = container.locator('button').first();
      if (await eyeBtn.count() > 0) {
          console.log(`Clicking eye button for field ${i}...`);
          await eyeBtn.click();
          await page.waitForTimeout(2000);
          const unmaskedText = await container.innerText();
          console.log(`Field ${i} Text: ${unmaskedText}`);
      }
  }

  // Also search for "Connection URL" specifically
  const connUrlLabel = page.locator('text=Internal Connection URL');
  if (await connUrlLabel.count() > 0) {
      console.log('Found Connection URL label.');
      const container = connUrlLabel.locator('xpath=./..');
      const eyeBtn = container.locator('button').first();
      if (await eyeBtn.count() > 0) {
          await eyeBtn.click();
          await page.waitForTimeout(2000);
          console.log('Connection URL:', await container.innerText());
      }
  }

  await page.screenshot({ path: 'unmasked_credentials_v2.png', fullPage: true });
});
