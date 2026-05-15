import { test, expect } from '@playwright/test';

test('Update DB via Backend Console with Known URL', async ({ page }) => {
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

  console.log('Navigating to backend_m console...');
  await page.goto(`${easypanelUrl}/projects/bobyads/app/backend_m`);
  await page.waitForTimeout(5000);
  
  await page.click('button:has-text("Console"), a:has-text("Console")').catch(() => {});
  await page.waitForTimeout(10000);

  // The console is usually an xterm.js instance. We type into the textarea.
  const terminal = page.locator('textarea, .xterm-helper-textarea').first();
  if (await terminal.count() > 0) {
      console.log('Terminal found. Sending command...');
      
      const dbUrl = "postgresql://admin:Admin2026!@backend_mp:5432/m?sslmode=disable";
      const nodeCommand = `DATABASE_URL="${dbUrl}" node -e "const { PrismaClient } = require('@prisma/client'); const p = new PrismaClient(); async function run() { try { await p.workspace.update({ where: { id: '2a3c8b35-e91c-4e36-afa0-b783f3734c33' }, data: { plan: 'SCALE', subscriptionStatus: 'ACTIVE' } }); await p.user.update({ where: { email: 'cmoralesv.fb@gmail.com' }, data: { role: 'ADMIN', workspaceId: '2a3c8b35-e91c-4e36-afa0-b783f3734c33' } }); console.log('UPDATE_SUCCESS_DONE'); } catch(e) { console.log('UPDATE_ERROR: ' + e.message); } process.exit(0); } run();"`;
      
      await terminal.focus();
      await page.keyboard.type(nodeCommand);
      await page.keyboard.press('Enter');
      
      console.log('Command sent. Waiting 30s for execution...');
      await page.waitForTimeout(30000);
      
      const logs = await page.evaluate(() => document.body.innerText);
      if (logs.includes('UPDATE_SUCCESS_DONE')) {
          console.log('✅ DB Update via Console confirmed.');
      } else {
          console.log('⚠️ Command sent but success message not seen in console text.');
      }
  } else {
      console.log('❌ Terminal not found.');
  }

  await page.screenshot({ path: 'easypanel_console_final.png', fullPage: true });
});
