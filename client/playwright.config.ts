import { defineConfig, devices } from '@playwright/test';

// e2e tests run against the disposable Docker stack (client/e2e/compose.e2e.yaml), never against the dev database.
const port = process.env['E2E_PORT'] ?? '18080';

export default defineConfig({
  testDir: './e2e/specs',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  fullyParallel: true,
  workers: process.env['CI'] ? 2 : undefined,
  retries: process.env['CI'] ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // --mute-audio: the generated test songs are sine tones; the browser plays them silently (the app still sees normal,
    // unmuted media elements)
    launchOptions: { args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
