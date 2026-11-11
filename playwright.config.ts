import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  // Inside node_modules, so test output never needs ignoring separately.
  outputDir: './node_modules/.cache/playwright',
  fullyParallel: true,
  reporter: 'line',
  use: {
    baseURL: 'http://localhost:5199',
    trace: 'retain-on-failure',
  },
  // `pnpm test:e2e` runs Chromium; `pnpm test:e2e:cross` the other two. Only Chromium
  // can grant clipboard permissions, so tests that read the clipboard skip the others.
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        permissions: ['clipboard-read', 'clipboard-write'],
      },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5199',
    reuseExistingServer: true,
  },
})
