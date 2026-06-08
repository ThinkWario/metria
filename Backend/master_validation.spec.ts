import { test, expect } from '@playwright/test';

/**
 * FULL SYSTEM VALIDATION (ADR 001, 003, 004, 005)
 * Verifies OAuth UI, WhatsApp QR flow, and CRM Lifecycle logic.
 */

test.describe('Metria Master Validation', () => {

  test('Omni-OAuth UI & Redirection', async ({ page }) => {
    await page.goto('https://metria-metrics.vercel.app/login');
    await page.locator('input[name="email"]').fill('admin@metria.com');
    await page.locator('input[name="password"]').fill('metria2025');
    await page.getByRole('button', { name: /Ingresar/i }).click();
    await page.waitForURL('**/dashboard');

    await page.goto('https://metria-metrics.vercel.app/dashboard/settings?tab=integrations');
    
    // Check for the new Integration Hub Bento Grid
    const hubTitle = page.locator('text=Centro de Integraciones (Omni-OAuth)');
    await expect(hubTitle).toBeVisible();

    // Verify Meta Ads Card & Button
    const metaCard = page.locator('text=Meta Ads');
    await expect(metaCard).toBeVisible();
    const connectMetaBtn = page.getByRole('button', { name: /Conectar Ahora/i }).first();
    await expect(connectMetaBtn).toBeVisible();

    console.log('✅ Omni-OAuth UI verified.');
  });

  test('WhatsApp Native QR Dialog', async ({ page }) => {
    await page.goto('https://metria-metrics.vercel.app/login');
    await page.locator('input[name="email"]').fill('admin@metria.com');
    await page.locator('input[name="password"]').fill('metria2025');
    await page.getByRole('button', { name: /Ingresar/i }).click();
    
    await page.goto('https://metria-metrics.vercel.app/dashboard/settings?tab=integrations');

    // Click "Conectar Ahora" on the WhatsApp Native card (first card in our plan)
    const connectWaBtn = page.getByRole('button', { name: /Conectar Ahora/i }).first();
    await connectWaBtn.click();

    // Verify Dialog opens
    const dialogTitle = page.locator('text=Conectar WhatsApp');
    await expect(dialogTitle).toBeVisible();
    
    // Verify initial status
    const initializingText = page.locator('text=Iniciando motor nativo...');
    await expect(initializingText).toBeVisible();

    console.log('✅ WhatsApp Native QR flow verified.');
  });

  test('CRM Lifecycle & Inbox Integrity', async ({ page }) => {
    await page.goto('https://metria-metrics.vercel.app/login');
    await page.locator('input[name="email"]').fill('admin@metria.com');
    await page.locator('input[name="password"]').fill('metria2025');
    await page.getByRole('button', { name: /Ingresar/i }).click();

    // 1. Check CRM List
    await page.goto('https://metria-metrics.vercel.app/dashboard/crm');
    await expect(page.locator('text=Juan Perez')).toBeVisible({ timeout: 15000 });

    // 2. Check Pipelines (Kanban)
    await page.goto('https://metria-metrics.vercel.app/dashboard/crm/pipelines');
    // Verify stages exist
    await expect(page.locator('text=Lead')).toBeVisible();
    await expect(page.locator('text=Negociación')).toBeVisible();

    // 3. Check Inbox Messages
    await page.goto('https://metria-metrics.vercel.app/dashboard/inbox');
    await expect(page.locator('text=Carlos Chat')).toBeVisible();

    console.log('✅ CRM Lifecycle & Inbox data visibility verified.');
  });
});
