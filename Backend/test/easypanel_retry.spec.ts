import { test, expect } from '@playwright/test';

test('Easypanel Robust Login Attempt', async ({ page }) => {
  const easypanelUrl = 'http://31.97.160.123:3000';
  const credentials = {
    email: 'cmoralesv.fb@gmail.com',
    password: '56JVdcqghGdYib7'
  };

  console.log(`Retrying Easypanel login at ${easypanelUrl}`);

  await page.goto(easypanelUrl);
  await page.waitForLoadState('networkidle');

  // Explicitly wait for the inputs
  const emailInput = page.locator('input[type="email"]');
  const passwordInput = page.locator('input[type="password"]');
  const loginBtn = page.locator('button[type="submit"]');

  await emailInput.waitFor({ state: 'visible' });
  
  // Fill one by one with small delays
  await emailInput.click();
  await emailInput.fill(credentials.email);
  
  await passwordInput.click();
  await passwordInput.fill(credentials.password);

  console.log('Inputs filled. Submitting...');
  await loginBtn.click();

  // Wait for either success (projects page) or error message
  try {
    await page.waitForURL('**/projects**', { timeout: 10000 });
    console.log('Success! URL is now:', page.url());
  } catch (e) {
    console.log('Did not redirect to /projects. URL:', page.url());
    const errorMsg = await page.locator('text=/Wrong|Error|Invalid/i').textContent().catch(() => 'No error msg found');
    console.log('Error message on page:', errorMsg);
  }

  await page.screenshot({ path: 'easypanel_retry.png' });
});
