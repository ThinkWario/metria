import { test, expect } from '@playwright/test';

test('Easypanel Direct App Access', async ({ page }) => {
  const easypanelUrl = 'http://31.97.160.123:3000';
  const credentials = {
    email: 'cmoralesv.fb@gmail.com',
    password: '56JVdcqghGdYib7'
  };

  await page.goto(easypanelUrl);
  await page.fill('input[type="email"]', credentials.email);
  await page.fill('input[type="password"]', credentials.password);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(5000);

  const apps = ['backend_m', 'backend_mp', 'backend_mr'];
  for (const app of apps) {
    const url = `${easypanelUrl}/projects/bobyads/app/${app}`;
    console.log(`Checking: ${url}`);
    await page.goto(url);
    await page.waitForTimeout(5000);
    console.log(`URL after navigation: ${page.url()}`);
    
    const body = await page.locator('body').textContent();
    if (body?.includes(app)) {
        console.log(`FOUND app ${app} in bobyads project.`);
        // Try to extract domain
        const domainText = await page.locator('text=/https?:\\/\\//').allInnerTexts();
        console.log(`${app} Domains:`, [...new Set(domainText)].filter(d => d.startsWith('http')));
    } else {
        console.log(`App ${app} NOT found in bobyads project (Current text snippet: ${body?.substring(0, 100)})`);
    }
  }

  await page.screenshot({ path: 'easypanel_direct_apps.png', fullPage: true });
});
