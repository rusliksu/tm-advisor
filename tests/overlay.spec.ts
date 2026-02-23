import { test, expect } from './fixtures';

const TM_URL = 'https://terraforming-mars.herokuapp.com';

test.describe('Overlay на TM сайте', () => {
  test.setTimeout(60_000); // herokuapp бывает медленный

  test('расширение инжектится и обрабатывает карточки', async ({ extensionContext }) => {
    const page = await extensionContext.newPage();
    await page.goto(TM_URL, { waitUntil: 'networkidle', timeout: 30_000 });
    // Ждём пока content script отработает
    await page.waitForTimeout(3000);

    // Проверяем что на странице есть обработанные карточки
    // На главной странице могут быть карточки в превью или нужно зайти в /cards
    await page.goto(`${TM_URL}/cards`, { waitUntil: 'networkidle', timeout: 30_000 });
    await page.waitForTimeout(3000);

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
    await page.goto(`${TM_URL}/cards`, { waitUntil: 'networkidle', timeout: 30_000 });
    await page.waitForTimeout(3000);

    const badges = page.locator('.tm-tier-badge');
    const count = await badges.count();
    expect(count).toBeGreaterThan(0);

    // Первый badge видим
    await expect(badges.first()).toBeVisible();

    await page.close();
  });

  test('tooltip появляется при hover', async ({ extensionContext }) => {
    const page = await extensionContext.newPage();
    await page.goto(`${TM_URL}/cards`, { waitUntil: 'networkidle', timeout: 30_000 });
    await page.waitForTimeout(3000);

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
