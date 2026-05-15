import { test, expect } from '@playwright/test';

test('Repair Easypanel DB Tools', async ({ page }) => {
  test.setTimeout(240000);
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

  console.log('Navigating to backend_mp postgres service...');
  await page.goto(`${easypanelUrl}/projects/bobyads/postgres/backend_mp`);
  await page.waitForTimeout(10000);

  // REPAIR PGWEB
  console.log('--- REPAIRING PGWEB ---');
  const pgWebSection = page.locator('div.chakra-stack').filter({ hasText: /^PgWeb$/ }).locator('..');
  const disableBtn = pgWebSection.locator('button:has-text("Disable")').first();
  const enableBtn = pgWebSection.locator('button:has-text("Enable")').first();

  if (await disableBtn.count() > 0) {
      console.log('PgWeb is active but unreachable. Disabling to restart...');
      await disableBtn.click();
      await page.waitForTimeout(15000);
      await page.reload();
      await page.waitForTimeout(5000);
  }

  const freshEnableBtn = page.locator('div.chakra-stack').filter({ hasText: /^PgWeb$/ }).locator('..').locator('button:has-text("Enable")').first();
  if (await freshEnableBtn.count() > 0) {
      console.log('Enabling PgWeb...');
      await freshEnableBtn.click();
      await page.waitForTimeout(30000); // Wait for deployment
  }

  // REPAIR DBGATE (Alternative)
  console.log('--- REPAIRING DBGATE ---');
  const dbGateSection = page.locator('div.chakra-stack').filter({ hasText: /^DbGate$/ }).locator('..');
  const dbDisableBtn = dbGateSection.locator('button:has-text("Disable")').first();
  
  if (await dbDisableBtn.count() > 0) {
      console.log('DbGate is active but unreachable. Disabling to restart...');
      await dbDisableBtn.click();
      await page.waitForTimeout(15000);
      await page.reload();
      await page.waitForTimeout(5000);
  }

  const freshDbEnableBtn = page.locator('div.chakra-stack').filter({ hasText: /^DbGate$/ }).locator('..').locator('button:has-text("Enable")').first();
  if (await freshDbEnableBtn.count() > 0) {
      console.log('Enabling DbGate...');
      await freshDbEnableBtn.click();
      await page.waitForTimeout(30000);
  }

  // Verify final status
  await page.reload();
  await page.waitForTimeout(10000);
  await page.screenshot({ path: 'easypanel_repair_status.png', fullPage: true });
  
  const finalOpenLinks = await page.locator('a:has-text("Open")').count();
  console.log(`Repair completed. Available Open links: ${finalOpenLinks}`);
});
