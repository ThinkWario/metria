import { test, expect } from '@playwright/test';

test('Metria Direct Domain Fix', async ({ page }) => {
  test.setTimeout(300000);
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

  console.log('Navigating directly to domains config...');
  await page.goto(`${easypanelUrl}/projects/bobyads/app/backend_m/domains`);
  await page.waitForTimeout(10000);

  // Take screenshot to see if we are there
  await page.screenshot({ path: 'direct_domains_check.png' });

  // Try to find ANY input with 80 or empty
  const inputs = await page.locator('input').all();
  for (const input of inputs) {
      const val = await input.inputValue();
      const placeholder = await input.getAttribute('placeholder');
      console.log(`Input value: "${val}" | Placeholder: "${placeholder}"`);
      if (val === '80' || placeholder === '80') {
          console.log('Found Port 80 input! Changing to 4000...');
          await input.fill('4000');
          await page.keyboard.press('Enter');
          const saveBtn = page.locator('button:has-text("Save"), button:has-text("Update")').first();
          await saveBtn.click();
          console.log('Saved port change.');
          await page.waitForTimeout(5000);
      }
  }
});
