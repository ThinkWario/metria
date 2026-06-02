import { test, expect } from '@playwright/test';

/**
 * DEEP DATA VERIFICATION (ADR 001)
 * This script verifies that the injected CRM and Inbox data is actually visible in the UI.
 */

test.describe('Metria Data Integrity Check', () => {

  test('Verify CRM & Inbox Content', async ({ page }) => {
    console.log('--- Phase 1: Login ---');
    await page.goto('https://metria-metrics.vercel.app/login');
    await page.locator('input[name="email"]').fill('admin@metria.com');
    await page.locator('input[name="password"]').fill('metria2025');
    await page.getByRole('button', { name: /Ingresar/i }).click();
    await page.waitForURL('**/dashboard');
    console.log('✅ Login successful.');

    // 1. Verify CRM Data
    console.log('--- Phase 2: CRM Verification ---');
    await page.goto('https://metria-metrics.vercel.app/dashboard/crm');
    await page.waitForLoadState('networkidle');
    
    // Check if "Juan Perez" or other contacts are in the list
    const contactName = page.locator('text=Juan Perez').first();
    await expect(contactName).toBeVisible({ timeout: 10000 });
    console.log('✅ CRM: Contact "Juan Perez" verified in list.');

    // 2. Verify Inbox Data
    console.log('--- Phase 3: Inbox Verification ---');
    await page.goto('https://metria-metrics.vercel.app/dashboard/inbox');
    await page.waitForLoadState('networkidle');

    // Check if the chat list has the contacts
    const chatItem = page.locator('text=Maria Jose').first();
    await expect(chatItem).toBeVisible({ timeout: 10000 });
    console.log('✅ Inbox: Chat with "Maria Jose" verified.');

    // Select a chat and check messages
    await chatItem.click();
    const messageContent = page.locator('text=envíos a regiones').first();
    await expect(messageContent).toBeVisible({ timeout: 10000 });
    console.log('✅ Inbox: Message content verified.');

    // 3. Verify Channels Status
    console.log('--- Phase 4: Channels Verification ---');
    await page.goto('https://metria-metrics.vercel.app/dashboard/settings/channels');
    await page.waitForLoadState('networkidle');
    
    const connectedBadge = page.locator('text=Connected').first();
    await expect(connectedBadge).toBeVisible({ timeout: 10000 });
    console.log('✅ Channels: "Connected" status verified.');

    await page.screenshot({ path: 'deep-verification-success.png', fullPage: true });
    console.log('📸 Final verification screenshot: deep-verification-success.png');
  });
});
