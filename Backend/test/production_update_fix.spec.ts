import { test, expect } from '@playwright/test';

test('Production Update: Workspace Plan and Demo User', async ({ page, context }) => {
  test.setTimeout(240000); // 4 minutes
  const easypanelUrl = 'http://31.97.160.123:3000';
  const credentials = {
    email: 'cmoralesv.fb@gmail.com',
    password: '56JVdcqghGdYib7'
  };

  console.log('Logging into Easypanel...');
  await page.goto(easypanelUrl);
  await page.fill('input[type="email"]', credentials.email);
  await page.fill('input[type="password"]', credentials.password);
  await page.click('button[type="submit"]');
  
  // Wait for navigation and check for Dashboard
  await page.waitForSelector('text=Dashboard', { timeout: 30000 });
  console.log('Logged in successfully.');

  // Navigate to the target postgres service
  const targetUrl = `${easypanelUrl}/projects/bobyads/postgres/backend_mp`;
  console.log(`Navigating to ${targetUrl}`);
  await page.goto(targetUrl);
  await page.waitForTimeout(5000);

  // Look for PgWeb section
  console.log('Looking for PgWeb section...');
  const pgWebSection = page.locator('div').filter({ has: page.locator('p:text-is("PgWeb")') }).first();
  
  const enableBtn = pgWebSection.getByRole('button', { name: 'Enable' });
  const openBtn = pgWebSection.getByRole('button', { name: 'Open' });

  if (await enableBtn.isVisible()) {
    console.log('PgWeb is disabled. Enabling...');
    await enableBtn.click();
    console.log('Clicked Enable, waiting for Open button...');
    await expect(openBtn).toBeVisible({ timeout: 60000 });
  }

  // Open PgWeb
  console.log('Opening PgWeb...');
  
  const [pgWebPage] = await Promise.all([
    context.waitForEvent('page'),
    openBtn.click()
  ]);

  await pgWebPage.waitForLoadState('networkidle');
  console.log('PgWeb loaded.');

  const sql = `
UPDATE "Workspace" SET "plan" = 'SCALE', "status" = 'ACTIVE' WHERE "id" = '2a3c8b35-e91c-4e36-afa0-b783f3734c33';

INSERT INTO "User" ("id", "email", "name", "passwordHash", "role", "workspaceId")
VALUES (gen_random_uuid(), 'demo@metria.com', 'Demo User', '$2b$10$6.gkWTgVlip7uPRr.8f4DetS0AWDxFCNeSmWiBIPZBZEWsOtgRqeW', 'ADMIN', '2a3c8b35-e91c-4e36-afa0-b783f3734c33')
ON CONFLICT ("email") DO UPDATE SET "workspaceId" = '2a3c8b35-e91c-4e36-afa0-b783f3734c33', "passwordHash" = EXCLUDED."passwordHash";
  `;

  // PgWeb UI: Usually has a sidebar with tables and a main area with SQL editor.
  console.log('Executing SQL...');
  
  // Try to find the SQL textarea
  const sqlEditor = pgWebPage.locator('textarea').first();
  await sqlEditor.fill(sql);
  
  // Click Run/Execute
  const runBtn = pgWebPage.locator('button:has-text("Run"), button:has-text("Execute")').first();
  await runBtn.click();

  console.log('Waiting for query result...');
  await pgWebPage.waitForTimeout(5000);

  // Verify result
  const resultContainer = pgWebPage.locator('.result, .table-responsive, #results, body');
  const resultText = await resultContainer.textContent();
  console.log('Execution Result Snippet:', resultText?.substring(0, 500));

  await pgWebPage.screenshot({ path: 'production_update_result.png', fullPage: true });

  // Basic validation
  if (resultText?.toLowerCase().includes('success') || 
      resultText?.toLowerCase().includes('query ok') || 
      resultText?.toLowerCase().includes('affected') ||
      resultText?.toLowerCase().includes('rows')) {
    console.log('SQL Execution appears SUCCESSFUL.');
  } else {
    console.warn('SQL Execution result was ambiguous. Check screenshot.');
  }
});
