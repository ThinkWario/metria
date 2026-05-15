import { test, expect } from '@playwright/test';

test('Metria Production Repair - Diagnostic', async ({ page }) => {
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

  // 1. Check if backend_m is running
  console.log('Checking backend_m status...');
  await page.goto(`${easypanelUrl}/projects/bobyads/app/backend_m`);
  await page.waitForTimeout(5000);
  
  const status = await page.locator('.status-badge, .badge').first().textContent().catch(() => 'Unknown');
  console.log(`backend_m Status: ${status?.trim()}`);

  // 2. Check Logs
  await page.click('text=Monitor').catch(() => {});
  await page.waitForTimeout(5000);
  const logs = await page.locator('pre, .log-container').last().textContent().catch(() => 'No logs found');
  console.log('--- BACKEND_M LOGS ---');
  console.log(logs?.slice(-2000)); // Last 2000 chars

  // 3. Check ENV
  await page.goto(`${easypanelUrl}/projects/bobyads/app/backend_m/settings`);
  await page.click('text=Environment').catch(() => {});
  await page.waitForTimeout(3000);
  const envContent = await page.locator('textarea, .monaco-editor').first().textContent().catch(() => 'No env content');
  console.log('--- ENV PREVIEW (Redacted) ---');
  console.log(envContent?.includes('DATABASE_URL') ? 'DATABASE_URL exists' : 'DATABASE_URL MISSING');
  console.log(envContent?.includes('REDIS_URL') ? 'REDIS_URL exists' : 'REDIS_URL MISSING');

  // 4. Check backend_mp and backend_mr status
  for (const db of ['backend_mp', 'backend_mr']) {
    console.log(`Checking ${db} status...`);
    const type = db === 'backend_mp' ? 'postgres' : 'redis';
    await page.goto(`${easypanelUrl}/projects/bobyads/${type}/${db}`);
    await page.waitForTimeout(3000);
    const dbStatus = await page.locator('.badge').first().textContent().catch(() => 'Unknown');
    console.log(`${db} Status: ${dbStatus?.trim()}`);
  }

  await page.screenshot({ path: 'repair_diagnostic.png', fullPage: true });
});
