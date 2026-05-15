import { test, expect } from '@playwright/test';

test('Extract DATABASE_URL from Backend Env', async ({ page }) => {
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

  await page.goto(`${easypanelUrl}/projects/bobyads/app/backend_m/settings`);
  await page.waitForTimeout(5000);

  // Click on "Environment" or "Variables" tab
  await page.click('button:has-text("Environment"), a:has-text("Environment")').catch(() => {});
  await page.waitForTimeout(5000);

  const bodyText = await page.locator('body').innerText();
  console.log('--- ENV VARS START ---');
  // Use regex to find DATABASE_URL or REDIS_URL
  const match = bodyText.match(/DATABASE_URL\s+(.*)/);
  if (match) {
      console.log('Found DATABASE_URL match line:', match[0]);
  } else {
      console.log('DATABASE_URL label not found directly. Listing all text parts...');
      const allTexts = await page.evaluate(() => Array.from(document.querySelectorAll('input, div, span')).map(el => (el as any).value || el.innerText).filter(t => t && t.length > 5));
      const dbUrlPart = allTexts.find(t => t.includes('postgresql://') || t.includes('postgres://'));
      console.log('Found DB URL Part:', dbUrlPart);
  }
  
  // Try to find unmask buttons in ENV tab
  const unmaskButtons = await page.locator('button:has(svg)').all();
  for (const btn of unmaskButtons) {
      await btn.click().catch(() => {});
  }
  await page.waitForTimeout(2000);
  
  const bodyTextUnmasked = await page.evaluate(() => document.body.innerText);
  console.log('--- ENV VARS UNMASKED ---');
  const dbUrlMatch = bodyTextUnmasked.match(/postgresql?:\/\/[^\s]*/);
  if (dbUrlMatch) {
      console.log('EXTRACTED_DB_URL:', dbUrlMatch[0]);
  }

  await page.screenshot({ path: 'easypanel_env_vars.png', fullPage: true });
});
