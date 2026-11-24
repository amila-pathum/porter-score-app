import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests against the real stack: Angular dev server (proxying /api) + ASP.NET Core API + PostgreSQL.
 * Locally, start `docker compose up -d db` first; the servers below are started (or reused) automatically.
 * Each test registers its own user, so tests are independent and can run in parallel.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  workers: process.env['CI'] ? 2 : undefined,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4200',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } }, grep: /@mobile/ },
  ],
  webServer: [
    {
      command: 'dotnet run --project ../server/src/Porter.Api --launch-profile http',
      url: 'http://localhost:5080/health/ready',
      reuseExistingServer: !process.env['CI'],
      timeout: 180_000,
      env: { RateLimiting__AuthPermitPerMinute: '1000' },
    },
    {
      command: 'npx ng serve --port 4200',
      url: 'http://localhost:4200',
      reuseExistingServer: !process.env['CI'],
      timeout: 180_000,
    },
  ],
});
