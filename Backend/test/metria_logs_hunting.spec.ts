import { test, expect } from '@playwright/test';

test('Metria Logs Hunting', async ({ page }) => {
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

  await page.goto(`${easypanelUrl}/projects/bobyads/app/backend_m`);
  await page.waitForTimeout(10000);

  // Look for any link or button that might lead to logs
  const allButtons = await page.locator('button, a').all();
  console.log('Searching for Logs button...');
  for (const btn of allButtons) {
    const text = await btn.textContent();
    const html = await btn.innerHTML();
    if (text?.toLowerCase().includes('log') || html.toLowerCase().includes('log')) {
        console.log(`Found potential logs element: "${text?.trim()}"`);
        await btn.click().catch(() => {});
        await page.waitForTimeout(5000);
        const logsSnippet = await page.locator('body').innerText();
        if (logsSnippet.length > 5000) {
            console.log('--- LOGS DETECTED ---');
            console.log(logsSnippet.slice(-2000));
            break;
        }
    }
  }

  await page.screenshot({ path: 'easypanel_logs_hunting.png', fullPage: true });
});
