import { test as base, chromium, type BrowserContext, type Page } from '@playwright/test';
import path from 'path';

const EXTENSION_PATH = path.join(__dirname, '..', 'extension');

type ExtensionFixtures = {
  extensionContext: BrowserContext;
  extensionId: string;
  extensionPopup: Page;
};

export const test = base.extend<ExtensionFixtures>({
  // eslint-disable-next-line no-empty-pattern
  extensionContext: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
      ],
    });

    await use(context);
    await context.close();
  },

  extensionId: async ({ extensionContext }, use) => {
    // Ждём service worker расширения
    let sw = extensionContext.serviceWorkers()[0];
    if (!sw) {
      sw = await extensionContext.waitForEvent('serviceworker');
    }
    const id = sw.url().split('/')[2];
    await use(id);
  },

  extensionPopup: async ({ extensionContext, extensionId }, use) => {
    // Очищаем storage перед тестом
    const cleanupPage = await extensionContext.newPage();
    await cleanupPage.goto(`chrome-extension://${extensionId}/popup.html`);
    await cleanupPage.evaluate(() => chrome.storage.local.clear());
    await cleanupPage.close();

    // Открываем чистый popup
    const popup = await extensionContext.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await popup.waitForLoadState('domcontentloaded');

    await use(popup);
  },
});

export { expect } from '@playwright/test';
