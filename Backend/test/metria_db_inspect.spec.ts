import { test, expect } from '@playwright/test';

test('Metria DB Data Inspection', async ({ page }) => {
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

  console.log('Checking if DB tools are enabled...');
  const pgWebBtn = page.locator('button:has-text("PgWeb")').first(); // Adjust based on dump
  const dbGateBtn = page.locator('button:has-text("DbGate")').first();

  // Try to find the "Enable" or "Open" button
  const toolsSection = await page.locator('body').innerText();
  if (toolsSection.includes('PgWeb') && toolsSection.includes('Enable')) {
      console.log('Enabling PgWeb...');
      await page.locator('div:has-text("PgWeb") >> button:has-text("Enable")').click().catch(() => {});
      await page.waitForTimeout(10000);
  }

  // Look for a link to open the tool
  const externalLink = page.locator('a[target="_blank"]').first();
  if (await externalLink.count() > 0) {
      const href = await externalLink.getAttribute('href');
      console.log(`DB Tool Link: ${href}`);
      if (href) {
          await page.goto(href);
          await page.waitForTimeout(10000);
          console.log('Inside DB Tool (hopefully)');
          await page.screenshot({ path: 'db_tool_view.png' });
          
          // Try a quick query if it's PgWeb
          const queryArea = page.locator('textarea');
          if (await queryArea.count() > 0) {
              await queryArea.fill('SELECT email, role FROM users;');
              await page.keyboard.press('Control+Enter');
              await page.waitForTimeout(5000);
              const results = await page.locator('table').innerText().catch(() => 'No table results');
              console.log('--- USER LIST ---');
              console.log(results);
          }
      }
  }

  await page.screenshot({ path: 'easypanel_db_inspection.png', fullPage: true });
});
