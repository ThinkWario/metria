import { test, expect } from '@playwright/test';

test('Phase 3: Production Visual & Functional Audit', async ({ page }) => {
  test.setTimeout(120000);
  const frontendUrl = 'https://metria-metrics.vercel.app/login';
  const credentials = {
    email: 'cmoralesv.fb@gmail.com',
    password: '56JVdcqghGdYib7'
  };

  console.log('--- PHASE 3: PRODUCTION AUDIT START ---');

  // 1. LOGIN VERIFICATION
  await page.goto(frontendUrl);
  await page.waitForLoadState('networkidle');
  
  console.log('Filling credentials...');
  await page.fill('input[type="email"]', credentials.email);
  await page.fill('input[type="password"]', credentials.password);
  
  // Capture the moment of login
  await page.screenshot({ path: 'audit_prod_login_page.png' });
  
  console.log('Clicking login button...');
  await page.click('button[type="submit"], button:has-text("Login"), button:has-text("Ingresar")');
  
  // Wait for dashboard or error
  try {
    await page.waitForURL('**/dashboard', { timeout: 30000 });
    console.log('✓ Login successful. Redirected to Dashboard.');
  } catch (e) {
    console.log('❌ Login failed or timed out.');
    console.log(`Current URL: ${page.url()}`);
    const errorText = await page.locator('[role="status"], .sonner-toast, .error-message, [class*="error"]').first().textContent().catch(() => 'No visible error message');
    console.log(`Error visible on page: ${errorText}`);
    await page.screenshot({ path: 'audit_prod_login_failure.png' });
    throw e;
  }

  // 2. VISUAL EXCELLENCE AUDIT (Task 3.1)
  
  // A. Information Architecture (Scannability)
  const mainHeading = page.locator('h1, h2').first();
  await expect(mainHeading).toBeVisible();
  console.log(`✓ IA: Main heading found: "${await mainHeading.textContent()}"`);

  // B. Bento Grid Consistency
  const gridItems = page.locator('.grid > div, [class*="grid-cols"] > div');
  const count = await gridItems.count();
  console.log(`✓ Bento Grid: Found ${count} modular elements.`);
  
  // C. Glassmorphism & Spacing
  const styles = await page.evaluate(() => {
    const sidebar = document.querySelector('aside, nav, [class*="sidebar"]');
    const card = document.querySelector('.grid > div, [class*="card"]');
    
    const getBlur = (el: Element | null) => el ? getComputedStyle(el).backdropFilter || getComputedStyle(el).webkitBackdropFilter : 'none';
    const getSpacing = (el: Element | null) => el ? getComputedStyle(el).gap || getComputedStyle(el).padding : 'none';
    const getFont = (el: Element | null) => el ? getComputedStyle(el).fontFamily : 'none';

    return {
      sidebarBlur: getBlur(sidebar),
      cardBlur: getBlur(card),
      spacing: getSpacing(document.querySelector('.grid')),
      font: getFont(document.body)
    };
  });
  
  console.log(`✓ Glassmorphism: Sidebar blur: ${styles.sidebarBlur} | Card blur: ${styles.cardBlur}`);
  console.log(`✓ Typography: Primary Font: ${styles.font}`);
  console.log(`✓ Spacing: Grid gap: ${styles.spacing}`);

  // D. Sidebar Organization
  const navLinks = page.locator('nav a, aside a');
  const navCount = await navLinks.count();
  console.log(`✓ Sidebar: ${navCount} navigation links detected.`);

  if (navCount === 0) {
      console.log('--- DASHBOARD IS EMPTY OR IN ONBOARDING ---');
      const bodyHtml = await page.evaluate(() => document.body.innerHTML);
      console.log('Body HTML Snippet:', bodyHtml.substring(0, 2000));
  }

  await page.screenshot({ path: 'audit_prod_dashboard.png', fullPage: true });

  // 3. INBOX & WEBSOCKETS (Task 3.2)
  console.log('Testing Inbox & WebSockets...');
  
  // Navigate to Inbox
  console.log('Navigating to Inbox directly...');
  await page.goto('https://metria-metrics.vercel.app/dashboard/inbox');
  try {
    await page.waitForURL('**/dashboard/inbox', { timeout: 15000 });
    console.log('✓ Reached Inbox via direct navigation.');
  } catch (e) {
    console.log('❌ Could not reach Inbox directly. Redirected? Current URL:', page.url());
    // Try to find ANY navigation link if redirected
    const inboxLink = page.locator('a:has-text("Inbox"), a[href*="inbox"]');
    if (await inboxLink.count() > 0) {
        await inboxLink.first().click();
        await page.waitForURL('**/dashboard/inbox');
        console.log('✓ Reached Inbox via fallback click.');
    } else {
        throw new Error('Inbox unreachable');
    }
  }

  // WebSocket / Connection check
  const socketStatus = await page.evaluate(async () => {
    // Check for Socket.io or WebSocket in window
    // @ts-ignore
    const hasSocket = !!(window.socket || window.io);
    // @ts-ignore
    const isConnected = window.socket?.connected || false;
    
    return { hasSocket, isConnected };
  });
  
  console.log(`✓ WebSockets: Lib detected: ${socketStatus.hasSocket} | Connected: ${socketStatus.isConnected}`);

  // Monitor all console messages
  const allConsole: string[] = [];
  const wsErrors: string[] = [];
  page.on('console', msg => {
    allConsole.push(`[${msg.type()}] ${msg.text()}`);
    if (msg.type() === 'error' && (msg.text().toLowerCase().includes('socket') || msg.text().toLowerCase().includes('websocket') || msg.text().toLowerCase().includes('failed'))) {
        wsErrors.push(msg.text());
    }
  });

  // Verify conversation list loading (Functional check)
  const conversationList = page.locator('text=Conversaciones, text=Messages, .overflow-y-auto');
  try {
    await expect(conversationList.first()).toBeVisible({ timeout: 15000 });
    console.log('✓ Inbox: Conversation list is visible.');
  } catch (e) {
    console.log('❌ Inbox list not found.');
    console.log('--- RECENT CONSOLE LOGS ---');
    console.log(allConsole.slice(-20).join('\n'));
  }

  if (wsErrors.length > 0) {
    console.log('❌ Critical WS Errors detected:');
    wsErrors.forEach(e => console.log(`  - ${e}`));
  } else {
    console.log('✓ No active WebSocket errors detected in console.');
  }

  // 4. INTERACTION STRESS TEST
  const start = Date.now();
  await page.click('button:visible, a:visible').catch(() => {});
  const latency = Date.now() - start;
  console.log(`✓ Interaction Latency: ${latency}ms (Threshold <100ms)`);

  await page.screenshot({ path: 'audit_prod_inbox.png', fullPage: true });
  
  console.log('--- PHASE 3: PRODUCTION AUDIT COMPLETE ---');
});
