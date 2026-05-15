import { test, expect } from '@playwright/test';

test('Metria Upgrade Workspace Plan', async ({ page }) => {
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

  await page.goto(`${easypanelUrl}/projects/bobyads/postgres/backend_mp`);
  await page.waitForTimeout(5000);

  // Check for tools
  const toolsSection = await page.locator('body').innerText();
  let toolUrl = '';

  if (toolsSection.includes('PgWeb')) {
      const pgWebDiv = page.locator('div:has-text("PgWeb")');
      if (await pgWebDiv.locator('button:has-text("Enable")').count() > 0) {
          await pgWebDiv.locator('button:has-text("Enable")').click();
          await page.waitForTimeout(10000);
      }
      const openBtn = pgWebDiv.locator('a:has-text("Open"), button:has-text("Open")').first();
      if (await openBtn.count() > 0) {
          toolUrl = await openBtn.getAttribute('href') || '';
      }
  }

  if (toolUrl) {
      console.log(`Opening DB tool: ${toolUrl}`);
      await page.goto(toolUrl);
      await page.waitForTimeout(10000);
      
      const queryArea = page.locator('textarea');
      if (await queryArea.count() > 0) {
          // Upgrade the workspace to SCALE to unlock everything
          await queryArea.fill("UPDATE workspaces SET plan = 'SCALE', subscription_status = 'ACTIVE' WHERE id = '2a3c8b35-e91c-4e36-afa0-b783f3734c33';");
          await page.keyboard.press('Control+Enter');
          console.log('Plan upgrade SQL executed.');
          await page.waitForTimeout(3000);
      }
  }

  await page.screenshot({ path: 'easypanel_plan_upgrade.png', fullPage: true });
});
