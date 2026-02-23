import { test, expect } from './fixtures';

const TM_URL = 'https://terraforming-mars.herokuapp.com';
const GOTO_OPTS = { waitUntil: 'domcontentloaded' as const, timeout: 45_000 };

// Ждём пока content script обработает карточки
async function waitForExtension(page: import('@playwright/test').Page) {
  await page.waitForSelector('[data-tm-processed]', { timeout: 15_000 });
}

test.describe('Overlay на TM сайте', () => {
  test.setTimeout(60_000); // herokuapp бывает медленный

  test('расширение инжектится и обрабатывает карточки', async ({ extensionContext }) => {
    const page = await extensionContext.newPage();
    await page.goto(`${TM_URL}/cards`, GOTO_OPTS);
    await waitForExtension(page);

    // Карточки должны получить data-tm-processed
    const processed = await page.locator('[data-tm-processed]').count();
    expect(processed).toBeGreaterThan(0);

    // Карточки должны получить data-tm-tier
    const tiered = await page.locator('[data-tm-tier]').count();
    expect(tiered).toBeGreaterThan(0);

    // Карточки должны получить data-tm-card
    const named = await page.locator('[data-tm-card]').count();
    expect(named).toBeGreaterThan(0);

    await page.close();
  });

  test('tier badges видны на карточках', async ({ extensionContext }) => {
    const page = await extensionContext.newPage();
    await page.goto(`${TM_URL}/cards`, GOTO_OPTS);
    await waitForExtension(page);

    const badges = page.locator('.tm-tier-badge');
    const count = await badges.count();
    expect(count).toBeGreaterThan(0);

    // Первый badge видим
    await expect(badges.first()).toBeVisible();

    await page.close();
  });

  test('tooltip появляется при hover', async ({ extensionContext }) => {
    const page = await extensionContext.newPage();
    await page.goto(`${TM_URL}/cards`, GOTO_OPTS);
    await waitForExtension(page);

    // Hover на карточку с tip-обработчиком (data-tm-tip ставится при injectBadge)
    const card = page.locator('.card-container[data-tm-tip]').first();
    await card.scrollIntoViewIfNeeded();
    await card.hover();
    await page.waitForTimeout(300);

    // Если hover не триггерит mouseenter, диспатчим вручную
    const tooltipVisible = await page.locator('.tm-tooltip-panel').isVisible().catch(() => false);
    if (!tooltipVisible) {
      await card.dispatchEvent('mouseenter');
    }

    const tooltip = page.locator('.tm-tooltip-panel');
    await expect(tooltip).toBeVisible({ timeout: 5000 });

    await page.close();
  });
});
