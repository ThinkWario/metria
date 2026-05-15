import { test, expect } from '@playwright/test';

test('Frontend Server Action Diagnostic', async ({ page }) => {
  const frontendUrl = 'https://metria-metrics.vercel.app/login';
  const credentials = {
    email: 'cmoralesv.fb@gmail.com',
    password: '56JVdcqghGdYib7'
  };

  console.log(`Starting Server Action diagnostic on ${frontendUrl}`);

  await page.goto(frontendUrl);
  await page.waitForLoadState('networkidle');

  await page.fill('input[name="email"]', credentials.email);
  await page.fill('input[name="password"]', credentials.password);
  
  // Listen for the fetch response (Server Action)
  const responsePromise = page.waitForResponse(response => 
    response.url().includes('/login') && response.request().method() === 'POST'
  );

  console.log('Clicking login...');
  await page.click('button[type="submit"]');

  const response = await responsePromise;
  console.log(`Server Action Response Status: ${response.status()}`);
  
  // In Next.js, Server Action errors often come in the body or as a redirect
  const body = await response.text();
  console.log('Server Action Response Body (start):', body.substring(0, 500));

  // Check for toast or error msg on UI
  await page.waitForTimeout(5000);
  const errorText = await page.locator('[role="status"], .sonner-toast, .error-message').textContent().catch(() => 'No UI error found');
  console.log(`UI Error Message: ${errorText}`);

  await page.screenshot({ path: 'frontend_action_error.png' });
});
