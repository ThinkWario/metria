import { test, expect } from '@playwright/test';

test('Production Setup for Audit', async ({ page }) => {
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

  // Navigate to PgWeb for backend_mp
  console.log('Navigating to PgWeb for backend_mp...');
  await page.goto(`${easypanelUrl}/projects/bobyads/postgres/backend_mp`);
  await page.waitForTimeout(10000);

  // Try to find ANY link or button that says "Open"
  const toolContainers = await page.locator('.chakra-stack').filter({ hasText: /Open/ }).all();
  let toolUrl = '';
  
  // Look specifically for DbGate first as PgWeb failed before
  for (const container of toolContainers) {
      const text = await container.innerText();
      if (text.includes('DbGate') && text.includes('Open')) {
          console.log('Found DbGate container.');
          const link = container.locator('a:has-text("Open")').first();
          toolUrl = await link.getAttribute('href') || '';
          if (toolUrl) break;
      }
  }

  if (!toolUrl) {
      console.log('DbGate not found or not open. Looking for PgWeb Open link...');
      for (const container of toolContainers) {
          const text = await container.innerText();
          if (text.includes('PgWeb') && text.includes('Open')) {
              console.log('Found PgWeb container.');
              const link = container.locator('a:has-text("Open")').first();
              toolUrl = await link.getAttribute('href') || '';
              if (toolUrl) break;
          }
      }
  }

  if (!toolUrl) {
      console.log('No specific tool link found via containers. Searching all links...');
      const allLinks = await page.evaluate(() => Array.from(document.querySelectorAll('a')).map(a => a.href));
      toolUrl = allLinks.find(href => href.includes('dbgate')) || allLinks.find(href => href.includes('pgweb'));
  }

  if (toolUrl) {
      console.log(`Opening DB tool: ${toolUrl}`);
      await page.goto(toolUrl);
  } else {
      console.log('Clicking first available Open link...');
      const openLink = page.locator('a:has-text("Open")').first();
      if (await openLink.count() > 0) {
          await openLink.click();
      } else {
          throw new Error('Could not find any DB tool to open');
      }
  }

  console.log('Waiting for tool to load (45s)...');
  await page.waitForTimeout(45000); 
  
  const postWaitText = await page.evaluate(() => document.body.innerText);
  console.log('--- POST-WAIT PAGE TEXT START ---');
  console.log(postWaitText);
  console.log('--- POST-WAIT PAGE TEXT END ---');

  if (postWaitText.includes('not reachable') && !page.url().includes('dbgate')) {
      console.log('PgWeb unreachable. Trying to find DbGate...');
      await page.goto(`${easypanelUrl}/projects/bobyads/postgres/backend_mp`);
      await page.waitForTimeout(10000);
      const dbGateLink = page.locator('div').filter({ hasText: /DbGate/i }).locator('..').locator('a:has-text("Open")').first();
      if (await dbGateLink.count() > 0) {
          await dbGateLink.click();
          await page.waitForTimeout(45000);
      }
  }

  // Executing SQL
  console.log('Attempting to execute SQL...');
  const sqlTab = page.locator('a:has-text("Query"), button:has-text("Query"), [role="tab"]:has-text("Query"), .dbgate-tool-sql').first();
  if (await sqlTab.count() > 0) {
      console.log('Clicking Query tab...');
      await sqlTab.click();
      await page.waitForTimeout(5000);
  }

  const queryArea = page.locator('textarea, [contenteditable="true"], .CodeMirror').first();
  if (await queryArea.count() > 0) {
      const sql = `
UPDATE "Workspace" SET "plan" = 'SCALE', "status" = 'ACTIVE' WHERE "id" = '2a3c8b35-e91c-4e36-afa0-b783f3734c33';

INSERT INTO "User" ("id", "email", "name", "passwordHash", "role", "workspaceId")
VALUES (gen_random_uuid(), 'demo@metria.com', 'Demo User', '$2b$10$6.gkWTgVlip7uPRr.8f4DetS0AWDxFCNeSmWiBIPZBZEWsOtgRqeW', 'ADMIN', '2a3c8b35-e91c-4e36-afa0-b783f3734c33')
ON CONFLICT ("email") DO UPDATE SET "workspaceId" = '2a3c8b35-e91c-4e36-afa0-b783f3734c33', "passwordHash" = EXCLUDED."passwordHash";

-- Verification query
SELECT plan, status FROM "Workspace" WHERE id = '2a3c8b35-e91c-4e36-afa0-b783f3734c33';
SELECT email, role FROM "User" WHERE email = 'demo@metria.com';
      `;
      
      console.log('Sending SQL...');
      if (await queryArea.getAttribute('contenteditable') === 'true') {
          await queryArea.focus();
          await page.keyboard.type(sql);
      } else {
          await queryArea.fill(sql);
      }
      
      await page.keyboard.press('Control+Enter');
      console.log('✓ Production Setup SQL sent.');
      await page.waitForTimeout(10000);
      
      const finalResults = await page.evaluate(() => document.body.innerText);
      if (finalResults.includes('SCALE') && finalResults.includes('demo@metria.com')) {
          console.log('✅ Production Setup VERIFIED.');
      } else {
          console.log('⚠️ SQL sent but verification text not found in results page.');
      }
  } else {
      console.log('❌ Could not find textarea or editor for SQL query.');
  }

  await page.screenshot({ path: 'production_setup_audit_success.png', fullPage: true });
});
