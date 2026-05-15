import { test, expect } from '@playwright/test';

test('Frontend Production Network Trace', async ({ page }) => {
  const frontendUrl = 'https://metria-metrics.vercel.app';
  const credentials = {
    email: 'cmoralesv.fb@gmail.com',
    password: '56JVdcqghGdYib7'
  };

  console.log(`Tracing network on ${frontendUrl}`);

  // Capture ALL requests
  page.on('request', request => {
    console.log(`REQ: ${request.method()} ${request.url()}`);
  });

  page.on('requestfailed', request => {
    console.log(`FAILED REQ: ${request.url()} - ${request.failure()?.errorText}`);
  });

  await page.goto(frontendUrl);
  await page.waitForLoadState('networkidle');

  await page.fill('input[type="email"]', credentials.email);
  await page.fill('input[type="password"]', credentials.password);
  
  console.log('Clicking login button...');
  await page.click('button:has-text("Ingresar")');
  
  // Wait 10 seconds to capture any async failures
  await page.waitForTimeout(10000);
  
  await page.screenshot({ path: 'frontend_network_trace.png' });
});
