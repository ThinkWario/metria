import { test, expect } from '@playwright/test';

test('Execute SQL in Production via PgWeb New Tab', async ({ context, page }) => {
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

  console.log('Navigating to backend_mp postgres service...');
  await page.goto(`${easypanelUrl}/projects/bobyads/postgres/backend_mp`);
  await page.waitForTimeout(10000);

  // Find the Open link for PgWeb
  const pgWebOpenLink = page.locator('div').filter({ hasText: /^PgWeb$/ }).locator('..').locator('a:has-text("Open")').first();
  
  if (await pgWebOpenLink.count() === 0) {
      console.log('PgWeb Open link not found. Is it enabled?');
      const enableBtn = page.locator('div').filter({ hasText: /^PgWeb$/ }).locator('..').locator('button:has-text("Enable")').first();
      if (await enableBtn.count() > 0) {
          await enableBtn.click();
          await page.waitForTimeout(15000);
      }
  }

  console.log('Clicking PgWeb Open link and waiting for new tab...');
  const [newPage] = await Promise.all([
    context.waitForEvent('page'),
    pgWebOpenLink.click(),
  ]);

  await newPage.waitForLoadState();
  console.log('New tab opened:', newPage.url());

  // Wait for the editor
  console.log('Waiting for PgWeb editor...');
  await newPage.waitForTimeout(15000);
  
  const pgWebText = await newPage.evaluate(() => document.body.innerText);
  if (pgWebText.includes('Service is not reachable')) {
      console.log('PgWeb unreachable. Trying DbGate...');
      await page.bringToFront();
      const dbGateOpenLink = page.locator('div').filter({ hasText: /^DbGate$/ }).locator('..').locator('a:has-text("Open")').first();
      
      const [dbGatePage] = await Promise.all([
        context.waitForEvent('page'),
        dbGateOpenLink.click(),
      ]);
      await dbGatePage.waitForLoadState();
      console.log('DbGate tab opened:', dbGatePage.url());
      await dbGatePage.waitForTimeout(20000);
      
      // Attempt SQL in DbGate
      const editor = dbGatePage.locator('textarea, .CodeMirror, [contenteditable="true"]').first();
      if (await editor.count() > 0) {
          console.log('Found editor in DbGate.');
          await executeSql(dbGatePage, editor);
      }
  } else {
      const editor = newPage.locator('textarea, .CodeMirror, [contenteditable="true"]').first();
      if (await editor.count() > 0) {
          console.log('Found editor in PgWeb.');
          await executeSql(newPage, editor);
      }
  }

  async function executeSql(targetPage: any, editor: any) {
      const sql = `
UPDATE "Workspace" SET "plan" = 'SCALE', "status" = 'ACTIVE' WHERE "id" = '2a3c8b35-e91c-4e36-afa0-b783f3734c33';
UPDATE "User" SET "role" = 'ADMIN', "workspaceId" = '2a3c8b35-e91c-4e36-afa0-b783f3734c33' WHERE "email" = 'cmoralesv.fb@gmail.com';

INSERT INTO "User" ("id", "email", "name", "passwordHash", "role", "workspaceId")
VALUES (gen_random_uuid(), 'demo@metria.com', 'Demo User', '$2b$10$6.gkWTgVlip7uPRr.8f4DetS0AWDxFCNeSmWiBIPZBZEWsOtgRqeW', 'ADMIN', '2a3c8b35-e91c-4e36-afa0-b783f3734c33')
ON CONFLICT ("email") DO UPDATE SET "workspaceId" = '2a3c8b35-e91c-4e36-afa0-b783f3734c33', "passwordHash" = EXCLUDED."passwordHash";
      `;
      
      if (await editor.getAttribute('contenteditable') === 'true') {
          await editor.focus();
          await targetPage.keyboard.type(sql);
      } else {
          await editor.fill(sql);
      }
      
      await targetPage.keyboard.press('Control+Enter');
      console.log('✓ SQL executed.');
      await targetPage.waitForTimeout(5000);
      await targetPage.screenshot({ path: 'sql_execution_result.png', fullPage: true });
  }

  await page.screenshot({ path: 'easypanel_final_state.png', fullPage: true });
});
