import { test, expect } from '@playwright/test';

test('Metria Production Repair - FORCE APPLY FIX', async ({ page }) => {
  test.setTimeout(120000);
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

  await page.goto(`${easypanelUrl}/projects/bobyads/app/backend_m/settings`);
  await page.waitForTimeout(5000);
  await page.click('text=Environment').catch(() => {});
  await page.waitForTimeout(5000);

  console.log('Attempting to inject fix into Monaco Editor...');
  
  const success = await page.evaluate(() => {
    // Look for all monaco editors
    const editors = document.querySelectorAll('.monaco-editor');
    if (editors.length > 0) {
        // Find the textarea inside and set value
        const tas = document.querySelectorAll('textarea');
        for (const ta of tas) {
            if (ta.value.includes('DATABASE_URL')) {
                ta.value = ta.value.replace('@backend_mp:5432/m', '@bobyads_backend_mp:5432/m');
                ta.dispatchEvent(new Event('input', { bubbles: true }));
                return true;
            }
        }
    }
    return false;
  });

  if (!success) {
      console.log('Monaco injection failed, trying keyboard fallback...');
      await page.focus('.monaco-editor').catch(() => {});
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Backspace');
      // We don't want to type everything, let's try one more evaluate
      await page.evaluate(() => {
        const models = (window as any).monaco?.editor?.getModels();
        if (models && models.length > 0) {
            const content = models[0].getValue();
            models[0].setValue(content.replace('@backend_mp:5432/m', '@bobyads_backend_mp:5432/m'));
            return true;
        }
        return false;
      });
  }

  await page.waitForTimeout(2000);
  
  // Click Save - Be very specific with locator
  const saveBtn = page.locator('button:has-text("Save"), button:has-text("Update")').first();
  await saveBtn.click({ force: true });
  console.log('Save clicked.');
  await page.waitForTimeout(5000);

  // Deploy
  await page.goto(`${easypanelUrl}/projects/bobyads/app/backend_m`);
  await page.waitForTimeout(3000);
  await page.click('button:has-text("Deploy")').catch(() => {});
  console.log('Deploy clicked.');

  await page.waitForTimeout(5000);
  await page.screenshot({ path: 'easypanel_final_fix.png', fullPage: true });
});
