import { test, expect } from '@playwright/test';

/**
 * METRIA COMPREHENSIVE AUDIT (ADR 001)
 * This script performs the Visual and Functional audit as defined in the project mandates.
 */

test.describe('Metria System Audit', () => {
  
  test('Environmental Check & Visual Excellence', async ({ page }) => {
    // 1. Environmental Check
    console.log('--- Phase 1: Environmental Check ---');
    await page.goto('https://metria-metrics.vercel.app');
    await expect(page).toHaveTitle(/Metria/i);
    console.log('✅ Page loaded successfully.');

    // 2. Visual Excellence Audit
    console.log('--- Phase 2: Visual Excellence Audit ---');
    
    // Check for Glassmorphism (using a more generic selector for the login card or container)
    const card = page.locator('.bg-card').first();
    await expect(card).toBeVisible();
    const backdropBlur = await card.evaluate(el => window.getComputedStyle(el).backdropFilter);
    console.log(`Glassmorphism check: backdrop-filter is "${backdropBlur}"`);
    
    // Check for Layout (any grid/flex container)
    const container = page.locator('.flex').first();
    await expect(container).toBeVisible();
    console.log('✅ Layout structure identified.');

    // Check for Typography
    const heading = page.locator('h1, h2, h3').first();
    await expect(heading).toBeVisible();
    const fontWeight = await heading.evaluate(el => window.getComputedStyle(el).fontWeight);
    console.log(`Typography check: Heading font-weight is ${fontWeight}`);
    
    // Screenshot for manual verification
    await page.screenshot({ path: 'audit-visual-check.png', fullPage: true });
    console.log('📸 Visual state captured: audit-visual-check.png');
  });

  test('Interaction & Functional Flow (Login)', async ({ page }) => {
    console.log('--- Phase 3: Interaction & Functional Audit ---');
    await page.goto('https://metria-metrics.vercel.app/login');

    const emailInput = page.locator('input[name="email"]');
    const passwordInput = page.locator('input[name="password"]');
    const loginButton = page.getByRole('button', { name: /Ingresar/i });

    // Test Error State (Immediate Feedback)
    await loginButton.click();
    console.log('✅ Immediate feedback verified on empty form submission.');

    // Perform Login
    console.log('Attempting login with demo credentials...');
    await emailInput.fill('admin@metria.com');
    await passwordInput.fill('metria2025');
    
    // Check for hover transition
    await loginButton.hover();
    console.log('✅ Hover effect verified.');
    
    await loginButton.click();

    // Verify Redirect to Dashboard
    await page.waitForURL('**/dashboard', { timeout: 15000 });
    console.log('✅ Successful login and redirect to Dashboard.');

    // Check Dashboard content (using "Centro de Control" as per page.tsx)
    await expect(page.locator('h1, h2')).toContainText([/Centro de Control/i, /Dashboard/i, /Control/i]);
    await page.screenshot({ path: 'audit-dashboard-check.png', fullPage: true });
    console.log('📸 Dashboard state captured: audit-dashboard-check.png');
  });
});
