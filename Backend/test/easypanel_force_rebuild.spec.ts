import { test, expect } from '@playwright/test';

test('Force Configure Github and Rebuild', async ({ page }) => {
  test.setTimeout(300000);
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

  await page.goto(`${easypanelUrl}/projects/bobyads/app/backend_m/source`);
  await page.waitForTimeout(5000);

  console.log('Clicking Github tab...');
  await page.locator('button').filter({ hasText: /^Github$/ }).first().click();
  await page.waitForTimeout(5000);

  console.log('Using JS injection to fill Github fields...');
  await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input'));
    const owner = inputs.find(i => i.placeholder.includes('username') || i.parentElement?.innerText.includes('Owner'));
    const repo = inputs.find(i => i.placeholder.includes('repository') || i.parentElement?.innerText.includes('Repository'));
    const branch = inputs.find(i => i.placeholder.includes('branch') || i.parentElement?.innerText.includes('Branch'));
    const path = inputs.find(i => i.placeholder.includes('monorepo') || i.parentElement?.innerText.includes('Path'));

    if (owner) { (owner as any).value = 'ThinkWario'; owner.dispatchEvent(new Event('input', { bubbles: true })); }
    if (repo) { (repo as any).value = 'metria'; repo.dispatchEvent(new Event('input', { bubbles: true })); }
    if (branch) { (branch as any).value = 'main'; branch.dispatchEvent(new Event('input', { bubbles: true })); }
    if (path) { (path as any).value = 'Backend'; path.dispatchEvent(new Event('input', { bubbles: true })); }
  });

  await page.waitForTimeout(2000);
  console.log('Clicking Save...');
  const saveBtn = page.locator('button:has-text("Save")').first();
  await saveBtn.click();
  
  await page.waitForTimeout(10000);
  console.log('Triggering Force Rebuild...');
  await page.goto(`${easypanelUrl}/projects/bobyads/app/backend_m`);
  await page.waitForTimeout(5000);
  
  const rebuildBtn = page.locator('button:has-text("Force Rebuild")').first();
  if (await rebuildBtn.count() > 0) {
      await rebuildBtn.click();
      console.log('Rebuild triggered. Waiting 5m for build...');
      await page.waitForTimeout(300000);
  }

  await page.screenshot({ path: 'easypanel_final_rebuild.png', fullPage: true });
});
