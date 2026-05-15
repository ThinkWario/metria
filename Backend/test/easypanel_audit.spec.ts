import { test, expect } from '@playwright/test';

test('Easypanel Access and Inspection', async ({ page }) => {
  const easypanelUrl = 'http://31.97.160.123:3000';
  const credentials = {
    email: 'cmoralesv.fb@gmail.com',
    password: '56JVdcqghGdYib7_'
  };

  console.log(`Accessing Easypanel at ${easypanelUrl}`);

  await page.goto(easypanelUrl);
  await page.waitForLoadState('networkidle');

  // Login to Easypanel
  console.log('Attempting Easypanel login...');
  await page.fill('input[type="email"], [name="email"]', credentials.email);
  await page.fill('input[type="password"], [name="password"]', credentials.password);
  await page.click('button[type="submit"], button:has-text("Login")');

  // Wait for navigation after login
  await page.waitForTimeout(5000);
  console.log(`URL after Easypanel login: ${page.url()}`);

  if (page.url().includes('/projects')) {
    console.log('Successfully logged into Easypanel.');
    
    // Navigate to bobyads project if not already there
    // The user mentioned: http://31.97.160.123:3000/projects/bobyads/app/backend_m
    await page.goto(`${easypanelUrl}/projects/bobyads`);
    await page.waitForTimeout(3000);
    
    console.log('Inspecting project: bobyads');
    const apps = await page.locator('a[href*="/app/"]').all();
    console.log(`Found ${apps.length} apps in bobyads project:`);
    for (const app of apps) {
      console.log(`App link: ${await app.getAttribute('href')}`);
    }

    // Inspect backend_m (Metria Backend presumably)
    await page.goto(`${easypanelUrl}/projects/bobyads/app/backend_m`);
    await page.waitForTimeout(3000);
    console.log('Inspecting backend_m...');
    
    // Try to find Domain/URL
    const domainText = await page.locator('text=/https?:\\/\\//').allInnerTexts();
    console.log('Possible domains found in backend_m UI:', domainText);
  } else {
    console.log('Failed to log into Easypanel or redirected elsewhere.');
    const bodyText = await page.locator('body').textContent();
    console.log('Page body snippet:', bodyText?.substring(0, 500));
  }

  await page.screenshot({ path: 'easypanel_inspection.png', fullPage: true });
});
