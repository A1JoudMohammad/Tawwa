import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || ['/repl/tools/bin/chromium', '/usr/bin/chromium', '/usr/bin/chromium-browser']
    .find(path => existsSync(path));

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  retries: 0,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    // The storefront now uses the API artifact; both must run through the
    // shared proxy rather than a standalone Vite server.
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:80',
    launchOptions: chromiumPath ? { executablePath: chromiumPath } : {},
    trace: 'retain-on-failure',
  },
});
