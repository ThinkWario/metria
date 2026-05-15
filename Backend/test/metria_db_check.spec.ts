import { test, expect } from '@playwright/test';

test('Metria DB Name Check', async ({ page }) => {
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

  console.log('Navigating to backend_mp (Postgres)...');
  await page.goto(`${easypanelUrl}/projects/bobyads/postgres/backend_mp`);
  await page.waitForTimeout(5000);

  const body = await page.locator('body').innerText();
  console.log('--- POSTGRES INFO ---');
  console.log(body);

  // Look for Database Name
  const dbNameMatch = body.match(/Database\s+([^\n]+)/i);
  if (dbNameMatch) console.log(`Detected DB Name: ${dbNameMatch[1]}`);
  
  const userMatch = body.match(/User\s+([^\n]+)/i);
  if (userMatch) console.log(`Detected DB User: ${userMatch[1]}`);

  await page.screenshot({ path: 'easypanel_db_info.png', fullPage: true });
});
