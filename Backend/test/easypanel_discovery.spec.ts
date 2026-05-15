import { test, expect } from '@playwright/test';

test('Easypanel Service Discovery', async ({ page }) => {
  test.setTimeout(180000); // 3 minutes
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

  const projectsToTry = ['bobyads', 'metria', 'metria-metrics', 'metrics', 'backend'];
  const appsToTry = ['backend_m', 'backend_mp', 'backend_mr'];

  for (const project of projectsToTry) {
    console.log(`--- Checking Project: ${project} ---`);
    await page.goto(`${easypanelUrl}/projects/${project}`);
    await page.waitForTimeout(3000);
    
    const body = await page.locator('body').textContent();
    if (body?.includes('404') || body?.includes('Not Found') || body?.length < 1000) {
        console.log(`Project ${project} likely does not exist.`);
        continue;
    }

    console.log(`Project ${project} exists. Checking apps...`);
    for (const app of appsToTry) {
        await page.goto(`${easypanelUrl}/projects/${project}/app/${app}`);
        await page.waitForTimeout(3000);
        const appBody = await page.locator('body').textContent();
        if (appBody?.includes(app) && !appBody?.includes('404')) {
            console.log(`SUCCESS: Found app ${app} in project ${project}`);
            
            // Extract Domain
            const domains = await page.locator('text=/https?:\\/\\//').allInnerTexts();
            console.log(`${app} Domains:`, [...new Set(domains)].filter(d => d.startsWith('http')));
            
            // Extract ENV (Database)
            await page.click('text=Settings').catch(() => {});
            await page.waitForTimeout(2000);
            await page.click('text=Environment').catch(() => {});
            await page.waitForTimeout(2000);
            const envText = await page.locator('body').textContent();
            if (envText?.includes('DATABASE_URL')) {
                console.log(`${app} ENV contains DATABASE_URL`);
            }
        }
    }
  }

  await page.screenshot({ path: 'easypanel_discovery.png', fullPage: true });
});
