const { defineConfig } = require('@playwright/test')

const PORT = Number(process.env.E2E_PORT || 3100)

module.exports = defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.cjs',
  timeout: 60000,
  workers: 1,
  use: { baseURL: `http://localhost:${PORT}`, viewport: { width: 1440, height: 1000 }, headless: true, screenshot: 'only-on-failure', acceptDownloads: true },
  webServer: { command: `npx next start -p ${PORT}`, url: `http://localhost:${PORT}/flow`, reuseExistingServer: false, timeout: 120000 },
})
