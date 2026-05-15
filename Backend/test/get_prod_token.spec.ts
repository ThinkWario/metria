import { test, expect } from '@playwright/test';
import fs from 'fs';

test('Get Production Token and Test API', async ({ page }) => {
  const loginUrl = 'https://metria-metrics.vercel.app/login';
  const credentials = {
    email: 'cmoralesv.fb@gmail.com',
    password: '56JVdcqghGdYib7'
  };

  await page.goto(loginUrl);
  await page.fill('input[type="email"]', credentials.email);
  await page.fill('input[type="password"]', credentials.password);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard');

  const token = await page.evaluate(() => localStorage.getItem('auth-token') || localStorage.getItem('token'));
  console.log('TOKEN:', token);
  
  if (token) {
      const response = await page.evaluate(async (t) => {
          const res = await fetch('https://bobyads-backend-m.3awmod.easypanel.host/api/messaging/conversations?status=OPEN', {
              headers: { 'Authorization': `Bearer ${t}` }
          });
          return { status: res.status, body: await res.json() };
      }, token);
      
      console.log('API_RESPONSE:', JSON.stringify(response));
  }
});
