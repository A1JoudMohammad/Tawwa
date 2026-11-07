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
    baseURL: 'http://127.0.0.1:4178',
    launchOptions: chromiumPath ? { executablePath: chromiumPath } : {},
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'BASE_PATH=/ PORT=4178 pnpm run dev',
    url: 'http://127.0.0.1:4178',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
