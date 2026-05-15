import { test, expect } from '@playwright/test';

test('Metria Domain Port Audit', async ({ page }) => {
  test.setTimeout(600000); // 10 minutes
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
  await page.waitForTimeout(10000);

  const inputs = await page.locator('input').all();
  console.log(`Found ${inputs.length} inputs on Domains page.`);
  
  for (const input of inputs) {
      const val = await input.inputValue();
      const id = await input.getAttribute('id');
      const name = await input.getAttribute('name');
      const placeholder = await input.getAttribute('placeholder');
      console.log(`Input: ID=${id} | Name=${name} | Placeholder=${placeholder} | Value=${val}`);
      
      // If we find an input with value 80 or empty but looks like a port
      if (val === '80' || (placeholder === '80' && !val)) {
          console.log('Targeting this input for port change...');
          await input.fill('4000');
          const saveBtn = page.locator('button:has-text("Save"), button:has-text("Update")').first();
          await saveBtn.click();
          console.log('Save clicked after port change.');
          await page.waitForTimeout(5000);
      }
  }

  await page.screenshot({ path: 'easypanel_domain_port_check.png', fullPage: true });
});
