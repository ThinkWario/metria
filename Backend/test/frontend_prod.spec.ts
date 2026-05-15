import { test, expect } from '@playwright/test';

test('Frontend Production Login', async ({ page }) => {
  const frontendUrl = 'https://metria-metrics.vercel.app';
  const credentials = {
    email: 'cmoralesv.fb@gmail.com',
    password: '56JVdcqghGdYib7'
  };

  console.log(`Attempting login on ${frontendUrl}`);

  // Capture network requests to see API URL
  page.on('request', request => {
    if (request.url().includes('/api/')) {
        console.log(`API REQUEST: ${request.method()} ${request.url()}`);
    }
  });

  page.on('response', response => {
    if (response.url().includes('/api/')) {
        console.log(`API RESPONSE [${response.status()}]: ${response.url()}`);
    }
  });

  await page.goto(frontendUrl);
  await page.waitForLoadState('networkidle');

  if (page.url().includes('/login')) {
    await page.fill('input[type="email"]', credentials.email);
    await page.fill('input[type="password"]', credentials.password);
    await page.click('button[type="submit"]');
    
    // Wait for redirect or error
    await page.waitForTimeout(5000);
    console.log(`URL after login: ${page.url()}`);
    
    if (page.url().includes('/dashboard') || page.url().includes('/onboarding')) {
        console.log('Login SUCCESSFUL on Frontend.');
    } else {
        console.log('Login FAILED on Frontend.');
        const errorText = await page.locator('[role="status"], .sonner-toast, .error-message').textContent().catch(() => 'No error msg');
        console.log(`Error: ${errorText}`);
    }
  }

  await page.screenshot({ path: 'frontend_prod_login.png', fullPage: true });
});
