import { test, expect } from '@playwright/test';

test('Force Expose Postgres Port', async ({ page }) => {
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

  console.log('Navigating to backend_mp postgres expose tab...');
  await page.goto(`${easypanelUrl}/projects/bobyads/postgres/backend_mp/expose`);
  await page.waitForTimeout(10000);

  // Look for the port input
  const portInput = page.locator('input[placeholder*="port"], input[type="number"]').first();
  if (await portInput.count() > 0) {
      console.log('Exposing port 5433...');
      await portInput.fill('5433');
      const saveBtn = page.locator('button:has-text("Save"), button:has-text("Guardar")').first();
      await saveBtn.click();
      console.log('Save clicked. Waiting for deployment...');
      await page.waitForTimeout(30000);
  } else {
      console.log('❌ Port input not found. Trying to find any input in the expose area...');
      const allInputs = await page.locator('input').all();
      for(const input of allInputs) {
          console.log('Input found:', await input.getAttribute('placeholder'));
      }
  }

  await page.screenshot({ path: 'easypanel_db_expose_attempt.png', fullPage: true });
});
