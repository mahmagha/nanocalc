// Playwright configuration for the browser tests of the built site (_site, made by tools/build.js).
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: __dirname,
  testMatch: /\.spec\.js$/,
  timeout: 120000,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: '../../playwright-report' }]],
  outputDir: '../../test-results',
  use: { baseURL: 'http://127.0.0.1:8090', trace: 'retain-on-failure' },
  webServer: { command: 'node tools/serve.js 8090 _site', cwd: '../..', url: 'http://127.0.0.1:8090/index.html', reuseExistingServer: false, timeout: 30000 },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } }
  ]
});
