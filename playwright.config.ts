import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  retries: 0,
  workers: 1, // расширение требует одного браузера
  reporter: 'list',
  projects: [
    {
      name: 'extension',
      use: {
        browserName: 'chromium',
      },
    },
  ],
});
