// playwright.config.js
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 60000,
  use: {
    headless: false, // show browser
    viewport: { width: 1280, height: 800 },
    screenshot: 'on', // take screenshots on failure & when using page.screenshot()
    video: 'on', // record video
    trace: 'on-first-retry', // capture debugging trace
  },
  reporter: [
    ['html', { open: 'never' }] // HTML report
  ]
});
