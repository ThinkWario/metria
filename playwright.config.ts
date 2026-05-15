import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './Backend/test',
  timeout: 300000,
  use: {
    headless: true,
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
    screenshot: 'on',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
