import { test, expect } from '@playwright/test';

test('Metria ENV Extraction', async ({ page }) => {
  test.setTimeout(120000);
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
  
  await page.click('text=Environment').catch(() => {});
  await page.waitForTimeout(5000);

  // Easypanel uses Monaco Editor (VS Code style) for ENV. 
  // We might need to look for specific text or copy it.
  const envText = await page.locator('.monaco-editor').innerText().catch(() => 'Monaco not found');
  console.log('--- ENV CONTENT ---');
  console.log(envText);
  console.log('--- END ENV ---');

  // Try to find any textarea if Monaco is not used
  const textareas = await page.locator('textarea').all();
  for (const ta of textareas) {
      console.log('Textarea content:', await ta.inputValue());
  }

  await page.screenshot({ path: 'easypanel_env_debug.png', fullPage: true });
});
