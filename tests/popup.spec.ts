import { test, expect } from './fixtures';

test.describe('Popup UI', () => {
  test('открывается с заголовком и версией', async ({ extensionPopup: popup }) => {
    const title = popup.locator('h3');
    await expect(title).toHaveText('TM Tier Overlay');

    const info = popup.locator('.info');
    await expect(info).toContainText('v');
  });

  test('4 таба переключаются', async ({ extensionPopup: popup }) => {
    const tabs = popup.locator('.tab');
    await expect(tabs).toHaveCount(4);

    // По умолчанию активен overlay
    await expect(tabs.nth(0)).toHaveClass(/active/);
    await expect(popup.locator('#tab-overlay')).toHaveClass(/active/);

    // Кликаем logs
    await tabs.nth(1).click();
    await expect(tabs.nth(1)).toHaveClass(/active/);
    await expect(tabs.nth(0)).not.toHaveClass(/active/);
    await expect(popup.locator('#tab-logs')).toHaveClass(/active/);

    // Кликаем stats
    await tabs.nth(2).click();
    await expect(tabs.nth(2)).toHaveClass(/active/);
    await expect(popup.locator('#tab-stats')).toHaveClass(/active/);

    // Кликаем ai
    await tabs.nth(3).click();
    await expect(tabs.nth(3)).toHaveClass(/active/);
    await expect(popup.locator('#tab-ai')).toHaveClass(/active/);
  });

  test('overlay tab: toggle enabled и tier filter', async ({ extensionPopup: popup }) => {
    const toggle = popup.locator('#toggle-enabled');
    // По умолчанию включён (storage очищен → дефолт enabled: true)
    await expect(toggle).toBeChecked();

    // Выключаем — кликаем по label (input скрыт CSS'ом в кастомном toggle)
    await popup.locator('label:has(#toggle-enabled)').click();
    await expect(toggle).not.toBeChecked();

    // Tier кнопки: 6 штук, все активны (без .off)
    const tierBtns = popup.locator('.tier-btn');
    await expect(tierBtns).toHaveCount(6);

    // Кликаем S — должен получить класс .off
    const btnS = popup.locator('.tier-btn[data-tier="S"]');
    await btnS.click();
    await expect(btnS).toHaveClass(/off/);

    // Кликаем повторно — .off убирается
    await btnS.click();
    await expect(btnS).not.toHaveClass(/off/);
  });

  test('overlay tab: debug toggle', async ({ extensionPopup: popup }) => {
    const debugToggle = popup.locator('#toggle-debug');
    await expect(debugToggle).not.toBeChecked();

    await popup.locator('label:has(#toggle-debug)').click();
    await expect(debugToggle).toBeChecked();
  });

  test('logs tab: пустое состояние', async ({ extensionPopup: popup }) => {
    await popup.locator('[data-tab="logs"]').click();
    const empty = popup.locator('#tab-logs .empty');
    await expect(empty).toHaveText('Игр ещё нет');
  });

  test('stats tab: пустое состояние', async ({ extensionPopup: popup }) => {
    await popup.locator('[data-tab="stats"]').click();
    // loadStats запускается по клику, если нет логов — показывает "Нет данных"
    const empty = popup.locator('#stats-content .empty');
    await expect(empty).toContainText('Нет данных');
  });

  test('AI tab: toggle Claude и сохранение URL', async ({ extensionPopup: popup }) => {
    await popup.locator('[data-tab="ai"]').click();

    const claudeToggle = popup.locator('#toggle-claude');
    // По умолчанию включён (дефолт claudeEnabled: true)
    await expect(claudeToggle).toBeChecked();

    const status = popup.locator('#ai-status');
    await expect(status).toContainText('прокси');
    // Зелёный цвет когда включен
    await expect(status).toHaveCSS('color', 'rgb(46, 204, 113)');

    // Выключаем — кликаем по label (input скрыт)
    await popup.locator('label:has(#toggle-claude)').click();
    await expect(status).toContainText('Выключен');
    await expect(status).toHaveCSS('color', 'rgb(136, 136, 136)');

    // Вводим URL и сохраняем
    const urlInput = popup.locator('#claude-base-url');
    await urlInput.fill('https://custom-proxy.example.com');
    await popup.locator('#btn-save-ai').click();
    await expect(status).toContainText('сохранён');
  });
});
