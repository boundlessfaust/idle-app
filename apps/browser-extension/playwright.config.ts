import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.join(__dirname, '.output/chrome-mv3');
const FIXTURE_PORT = 7331;

export default defineConfig({
  testDir: './tests/e2e',

  // One worker: all tests share a single Chrome + extension instance.
  workers: 1,

  timeout: 30_000,
  expect: { timeout: 15_000 },

  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    trace: 'on-first-retry',
  },

  // Serve fixture HTML at http://127.0.0.1:FIXTURE_PORT/fixtures/<site>/
  // Only started when E2E_LIVE is not set (fixture-based run).
  webServer: process.env.E2E_LIVE
    ? undefined
    : {
        command: 'node tests/e2e/server.mjs',
        port: FIXTURE_PORT,
        reuseExistingServer: !process.env.CI,
        env: { E2E_FIXTURE_PORT: String(FIXTURE_PORT) },
      },

  projects: [
    {
      name: 'extension',
      testMatch: /.*\.spec\.ts$/,
      metadata: { extensionPath, fixturePort: FIXTURE_PORT },
    },
  ],
});
