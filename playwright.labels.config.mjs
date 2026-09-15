import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './testing/labels-e2e',
  testMatch: '**/*.spec.js',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90000,
  expect: {
    timeout: 10000
  },
  use: {
    browserName: 'chromium',
    headless: true,
    baseURL: 'http://127.0.0.1:4173'
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173/testing/labels-e2e/print-harness.html?count=1',
    reuseExistingServer: !process.env.CI,
    timeout: 120000
  }
})
