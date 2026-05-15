import { test, expect } from '@playwright/test';

test('Update DB via Backend Console in Easypanel', async ({ page }) => {
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
  await page.waitForTimeout(5000);

  // Look for the terminal or input
  const terminal = page.locator('textarea, .xterm-helper-textarea').first();
  if (await terminal.count() > 0) {
      console.log('Terminal found. Sending command...');
      
      const nodeCommand = `
node -e "const { PrismaClient } = require('@prisma/client'); const p = new PrismaClient(); async function run() { await p.workspace.update({ where: { id: '2a3c8b35-e91c-4e36-afa0-b783f3734c33' }, data: { plan: 'SCALE', subscriptionStatus: 'ACTIVE' } }); await p.user.update({ where: { email: 'cmoralesv.fb@gmail.com' }, data: { role: 'ADMIN', workspaceId: '2a3c8b35-e91c-4e36-afa0-b783f3734c33' } }); console.log('UPDATE_SUCCESS'); process.exit(0); } run();"
      `.trim();
      
      await terminal.focus();
      await page.keyboard.type(nodeCommand);
      await page.keyboard.press('Enter');
      
      console.log('Command sent. Waiting for output...');
      await page.waitForTimeout(20000);
  } else {
      console.log('❌ Terminal not found.');
      const bodyText = await page.evaluate(() => document.body.innerText);
      if (bodyText.includes('Console')) {
          console.log('Console tab is open but textarea not found. Trying to find any input...');
          await page.keyboard.press('Tab'); // Maybe focus it
          // Or search for an iframe
          const iframes = await page.evaluate(() => Array.from(document.querySelectorAll('iframe')).map(f => f.src));
          console.log('Iframes in console:', iframes);
      }
  }

  await page.screenshot({ path: 'easypanel_backend_console.png', fullPage: true });
});
