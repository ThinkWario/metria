import { test, expect } from '@playwright/test';

test('Precision SQL execution in PgWeb', async ({ context, page }) => {
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

  await page.goto(`${easypanelUrl}/projects/bobyads/postgres/backend_mp`);
  await page.waitForTimeout(10000);

  const pgWebOpenLink = page.locator('div').filter({ hasText: /^PgWeb$/ }).locator('..').locator('a:has-text("Open")').first();
  
  const [newPage] = await Promise.all([
    context.waitForEvent('page'),
    pgWebOpenLink.click(),
  ]);

  await newPage.waitForLoadState('networkidle');
  console.log('PgWeb page opened.');

  // Wait for loading SVG to disappear
  await newPage.waitForSelector('svg', { state: 'hidden', timeout: 60000 }).catch(() => console.log('Wait for SVG hidden timed out.'));
  
  // Try to reload if unreachable
  if ((await newPage.evaluate(() => document.body.innerText)).includes('Service is not reachable')) {
      console.log('Unreachable. Reloading...');
      await newPage.reload();
      await newPage.waitForTimeout(10000);
  }

  // Look for any editor
  const selectors = [
      'textarea',
      '[contenteditable="true"]',
      '.CodeMirror',
      '.ace_text-input'
  ];

  let editor: any = null;
  for (const sel of selectors) {
      const el = newPage.locator(sel).first();
      if (await el.count() > 0) {
          editor = el;
          console.log(`Found editor with selector: ${sel}`);
          break;
      }
  }

  if (editor) {
      const sql = `UPDATE "Workspace" SET "plan" = 'SCALE', "status" = 'ACTIVE' WHERE "id" = '2a3c8b35-e91c-4e36-afa0-b783f3734c33'; UPDATE "User" SET "role" = 'ADMIN', "workspaceId" = '2a3c8b35-e91c-4e36-afa0-b783f3734c33' WHERE "email" = 'cmoralesv.fb@gmail.com';`;
      
      await editor.focus();
      await newPage.keyboard.type(sql);
      await newPage.keyboard.press('Control+Enter');
      console.log('SQL sent.');
      await newPage.waitForTimeout(5000);
      await newPage.screenshot({ path: 'pgweb_sql_result.png', fullPage: true });
  } else {
      console.log('❌ No editor found even after precision wait.');
      console.log('Body Text:', (await newPage.evaluate(() => document.body.innerText)).substring(0, 500));
  }
});
