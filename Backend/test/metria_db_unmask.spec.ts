import { test, expect } from '@playwright/test';

test('Unmask and Extract DB Credentials', async ({ page }) => {
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
  await page.waitForTimeout(5000);

  console.log('Page Title:', await page.title());
  
  const bodyHtml = await page.evaluate(() => document.body.innerHTML);
  console.log('--- CREDENTIALS HTML SNIPPET ---');
  console.log(bodyHtml.substring(0, 3000));
  
  const inputs = await page.locator('input, textarea').all();
  console.log(`Found ${inputs.length} inputs.`);
  
  for (const input of inputs) {
      const label = await input.locator('xpath=./../../preceding-sibling::label').textContent().catch(() => 'No Label');
      const value = await input.getAttribute('value');
      const type = await input.getAttribute('type');
      console.log(`Input [${label}]: type=${type}, value=${value?.substring(0, 10)}...`);
      
      // Try to unmask
      const parent = input.locator('xpath=./..');
      const buttons = await parent.locator('button').all();
      for (const btn of buttons) {
          await btn.click().catch(() => {});
          await page.waitForTimeout(500);
          const newVal = await input.getAttribute('value');
          console.log(`  Unmasked [${label}]: ${newVal}`);
      }
  }

  await page.screenshot({ path: 'unmasked_credentials.png', fullPage: true });
});
