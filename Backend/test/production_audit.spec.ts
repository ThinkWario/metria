import { test, expect } from '@playwright/test';

test('Production Audit - Inspect HTML', async ({ page }) => {
  const frontendUrl = 'https://metria-metrics.vercel.app/login';
  await page.goto(frontendUrl);
  await page.waitForLoadState('networkidle');

  const content = await page.content();
  console.log('--- PAGE CONTENT START ---');
  console.log(content.substring(0, 5000)); // First 5000 chars
  console.log('--- PAGE CONTENT END ---');

  const buttons = await page.locator('button').all();
  console.log(`Found ${buttons.length} buttons:`);
  for (const btn of buttons) {
    const text = await btn.textContent();
    const type = await btn.getAttribute('type');
    console.log(`Button: "${text.trim()}" | Type: ${type}`);
  }

  const inputs = await page.locator('input').all();
  console.log(`Found ${inputs.length} inputs:`);
  for (const input of inputs) {
    const name = await input.getAttribute('name');
    const type = await input.getAttribute('type');
    const placeholder = await input.getAttribute('placeholder');
    console.log(`Input: name=${name} | type=${type} | placeholder=${placeholder}`);
  }
});
