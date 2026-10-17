import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';
process.env.PLAYWRIGHT_BROWSERS_PATH ??= '/workspace/.cache/ms-playwright';
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'offline.spec.ts',
  outputDir: 'production-test-results',
  workers: 1,
  timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:4180', trace: 'retain-on-failure' },
  projects: [{
    name: 'chromium',
    use: {
      ...devices['iPad Pro 11'],
      defaultBrowserType: 'chromium',
      launchOptions: {
        executablePath: existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined,
      },
    },
  }, { name: 'webkit', use: { ...devices['iPad Pro 11'] } }],
  webServer: {
    command: 'npm run preview -- --port 4180 --outDir .production-test-dist',
    url: 'http://127.0.0.1:4180',
    reuseExistingServer: !process.env.CI,
  },
});
