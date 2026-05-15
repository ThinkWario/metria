import { test, expect } from '@playwright/test';

test('Metria Deep Infrastructure Audit', async ({ page }) => {
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

  await page.goto(`${easypanelUrl}/projects/bobyads/app/backend_m`);
  await page.waitForTimeout(5000);

  // 1. Check Domains & Ports
  console.log('--- DOMAINS SECTION ---');
  await page.click('text=Domains').catch(() => {});
  await page.waitForTimeout(5000);
  
  const allInputs = await page.locator('input').all();
  for (const input of allInputs) {
      const val = await input.inputValue();
      const label = await page.evaluate(el => {
          const l = el.closest('div')?.querySelector('label');
          return l ? l.innerText : 'No label';
      }, await input.elementHandle());
      console.log(`Input Label: ${label} | Value: ${val}`);
  }

  // 2. Check Deployments for Errors
  console.log('--- DEPLOYMENTS SECTION ---');
  await page.click('text=Deployments').catch(() => {});
  await page.waitForTimeout(5000);
  const deployments = await page.locator('.flex-col').innerText().catch(() => 'No deployments info');
  console.log(deployments.substring(0, 2000));

  // 3. Check Monitor for REAL logs
  console.log('--- MONITOR SECTION ---');
  await page.click('text=Monitor').catch(() => {});
  await page.waitForTimeout(10000);
  const logs = await page.locator('pre').allInnerTexts();
  console.log('Logs captured:', logs.length);
  logs.forEach(l => console.log(l.slice(-500)));

  await page.screenshot({ path: 'easypanel_full_audit.png', fullPage: true });
});
