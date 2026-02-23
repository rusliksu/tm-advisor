import { test, expect } from './fixtures';

const TM_URL = 'https://terraforming-mars.herokuapp.com';

test.describe('Горячие клавиши', () => {
  test.setTimeout(60_000);

  test('? открывает справку, Escape закрывает', async ({ extensionContext }) => {
    const page = await extensionContext.newPage();
    await page.goto(`${TM_URL}/cards`, { waitUntil: 'networkidle', timeout: 30_000 });
    await page.waitForTimeout(3000);

    await page.click('body');
    await page.waitForTimeout(300);

    // Playwright press('?') может не генерировать правильный e.key
    // Диспатчим вручную — как реальное нажатие Shift+/ на клавиатуре
    await page.evaluate(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: '?', code: 'Slash', shiftKey: true, bubbles: true,
      }));
    });

    const help = page.locator('.tm-hotkey-help');
    await expect(help).toBeVisible({ timeout: 5000 });

    await page.keyboard.press('Escape');
    await expect(help).toBeHidden();

    await page.close();
  });

  test('K открывает поиск карт', async ({ extensionContext }) => {
    const page = await extensionContext.newPage();
    await page.goto(`${TM_URL}/cards`, { waitUntil: 'networkidle', timeout: 30_000 });
    await page.waitForTimeout(3000);

    await page.click('body');
    await page.waitForTimeout(300);

    await page.keyboard.press('k');
    const search = page.locator('.tm-search-overlay');
    await expect(search).toBeVisible({ timeout: 5000 });

    // Escape закрывает
    await page.keyboard.press('Escape');
    await expect(search).toBeHidden();

    await page.close();
  });

  test('A toggle advisor panel (создаёт элемент)', async ({ extensionContext }) => {
    const page = await extensionContext.newPage();
    await page.goto(`${TM_URL}/cards`, { waitUntil: 'networkidle', timeout: 30_000 });
    await page.waitForTimeout(3000);

    await page.click('body');
    await page.waitForTimeout(300);

    await page.keyboard.press('a');
    // На /cards нет данных игры → updateAdvisor() ставит display:none
    // Но элемент создаётся в DOM — это доказывает что хоткей работает
    const advisor = page.locator('.tm-advisor-panel');
    await expect(advisor).toBeAttached({ timeout: 5000 });

    await page.close();
  });

  test('B toggle Claude panel', async ({ extensionContext }) => {
    const page = await extensionContext.newPage();
    await page.goto(`${TM_URL}/cards`, { waitUntil: 'networkidle', timeout: 30_000 });
    await page.waitForTimeout(3000);

    await page.click('body');
    await page.waitForTimeout(300);

    await page.keyboard.press('b');
    const claude = page.locator('.tm-claude-panel');
    await expect(claude).toBeVisible({ timeout: 5000 });

    await page.keyboard.press('b');
    await expect(claude).toBeHidden();

    await page.close();
  });

  test('L toggle log panel', async ({ extensionContext }) => {
    const page = await extensionContext.newPage();
    await page.goto(`${TM_URL}/cards`, { waitUntil: 'networkidle', timeout: 30_000 });
    await page.waitForTimeout(3000);

    await page.click('body');
    await page.waitForTimeout(300);

    await page.keyboard.press('l');
    const logPanel = page.locator('.tm-log-panel');
    await expect(logPanel).toBeVisible({ timeout: 5000 });

    await page.keyboard.press('l');
    await expect(logPanel).toBeHidden();

    await page.close();
  });
});
