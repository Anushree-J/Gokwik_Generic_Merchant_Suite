import { defineConfig } from '@playwright/test';
import * as dotenv from 'dotenv';

dotenv.config();

export default defineConfig({
  testDir: './src/tests',
  timeout: 360_000,
  retries: 0,
  workers: 1,

  reporter: [
    ['list'],
    ['html', { outputFolder: 'report/html', open: 'never' }],
    ['junit', { outputFile: 'report/junit-results.xml' }],
  ],

  outputDir: 'report/artifacts',

  use: {
    headless: false,
    channel: 'chrome',
    viewport: null,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
    ignoreHTTPSErrors: true,
    launchOptions: {
      args: [
        '--start-maximized',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-extensions',
        '--disable-popup-blocking',
        '--remote-allow-origins=*',
      ],
    },
  },

  projects: [
    {
      name: 'generic-merchant',
      use: { channel: 'chrome' },
      testMatch: ['**/Generic_FullCheckoutSuite.ts'],
    },
  ],
});
