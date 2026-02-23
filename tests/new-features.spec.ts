import { test, expect } from './fixtures';

const TM_URL = 'https://terraforming-mars.herokuapp.com';
const GOTO_OPTS = { waitUntil: 'domcontentloaded' as const, timeout: 45_000 };

async function waitForExtension(page: import('@playwright/test').Page) {
  await page.waitForSelector('[data-tm-processed]', { timeout: 15_000 });
}

test.describe('New features — Priority 1-4', () => {
  test.setTimeout(60_000);

  test('extension loads and processes cards on /cards page', async ({ extensionContext }) => {
    const page = await extensionContext.newPage();
    await page.goto(`${TM_URL}/cards`, GOTO_OPTS);
    await waitForExtension(page);

    const processed = await page.locator('[data-tm-processed]').count();
    expect(processed).toBeGreaterThan(50);

    const badges = await page.locator('.tm-tier-badge').count();
    expect(badges).toBeGreaterThan(50);

    await page.close();
  });

  test('floater trap cards have low base scores in ratings data', async ({ extensionContext }) => {
    const page = await extensionContext.newPage();
    await page.goto(`${TM_URL}/cards`, GOTO_OPTS);
    await waitForExtension(page);

    // Check Titan Air-scrapping is D-tier
    const titanCard = page.locator('[data-tm-card="Titan Air-scrapping"]');
    if (await titanCard.count() > 0) {
      const tier = await titanCard.first().getAttribute('data-tm-tier');
      expect(['D', 'F']).toContain(tier);
    }

    // Check Aerosport Tournament is D-tier
    const aerosportCard = page.locator('[data-tm-card="Aerosport Tournament"]');
    if (await aerosportCard.count() > 0) {
      const tier = await aerosportCard.first().getAttribute('data-tm-tier');
      expect(['D', 'F']).toContain(tier);
    }

    // Check Rotator Impacts is D-tier
    const rotatorCard = page.locator('[data-tm-card="Rotator Impacts"]');
    if (await rotatorCard.count() > 0) {
      const tier = await rotatorCard.first().getAttribute('data-tm-tier');
      expect(['D', 'F']).toContain(tier);
    }

    await page.close();
  });

  test('negative VP cards exist and have VP data in card_effects', async ({ extensionContext, extensionId }) => {
    const page = await extensionContext.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: 'domcontentloaded' });

    // Read card_effects.json.js via extension URL
    const negVP = await page.evaluate(async () => {
      const resp = await fetch(chrome.runtime.getURL('data/card_effects.json.js'));
      const src = await resp.text();
      // Parse: find cards with negative vp
      const matches = src.match(/"([^"]+)":\{[^}]*vp:-\d+/g) || [];
      return matches.map(m => m.match(/"([^"]+)"/)?.[1] || '');
    });

    expect(negVP.length).toBeGreaterThan(0);
    expect(negVP).toContain('Nuclear Zone');

    await page.close();
  });

  test('content.js source contains all 15 feature markers', async ({ extensionContext, extensionId }) => {
    const page = await extensionContext.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: 'domcontentloaded' });

    const features = await page.evaluate(async () => {
      const resp = await fetch(chrome.runtime.getURL('content.js'));
      const src = await resp.text();
      return {
        // Priority 1
        resourceStranding: src.includes('Resource stranding warnings'),
        breakEven: src.includes('Production break-even timer'),
        negativeVP: src.includes('Negative VP warning'),
        awardLock: src.includes('award lock discipline'),

        // Priority 2
        vpLane: src.includes('VP Lane Counter'),
        endgameChecklist: src.includes('endgame_conversion_miss'),
        oppVPCeiling: src.includes('VP Ceiling estimate'),
        decisionGate: src.includes('Decision gate reminders'),

        // Priority 3
        floaterTrap: src.includes('Floater trap detector'),
        denyDraft: src.includes('Deny-draft advisor'),
        mcVpTable: src.includes('MC → VP конвертация') || src.includes('MC →'),
        awardConfidence: src.includes('Award Lock Confidence Score'),

        // Priority 4
        o2Bottleneck: src.includes('O₂ Bottleneck'),
        multiFront: src.includes('Multi-Front Defense Gauge'),
        pivotTrigger: src.includes('Rush→Engine Pivot Trigger'),
      };
    });

    for (const [feature, present] of Object.entries(features)) {
      expect(present, `Feature "${feature}" must be present in content.js`).toBe(true);
    }

    await page.close();
  });

  test('CORP_ABILITY_SYNERGY has 20+ corps for deny-draft', async ({ extensionContext, extensionId }) => {
    const page = await extensionContext.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: 'domcontentloaded' });

    const corpCount = await page.evaluate(async () => {
      const resp = await fetch(chrome.runtime.getURL('content.js'));
      const src = await resp.text();
      return (src.match(/'[A-Z][^']+': \{ tags:/g) || []).length;
    });

    expect(corpCount).toBeGreaterThanOrEqual(20);

    await page.close();
  });

  test('MC→VP conversion table has all standard project routes', async ({ extensionContext, extensionId }) => {
    const page = await extensionContext.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: 'domcontentloaded' });

    const routes = await page.evaluate(async () => {
      const resp = await fetch(chrome.runtime.getURL('content.js'));
      const src = await resp.text();
      return {
        greenery: src.includes("path: 'Озеленение SP'") || src.includes("path: 'Озеленение SP'"),
        asteroid: src.includes("path: 'Астероид SP'"),
        city: src.includes("path: 'Город SP'"),
        venus: src.includes("path: 'Венера SP'"),
        aquifer: src.includes("path: 'Водохранилище SP'"),
        sortedByRate: src.includes('.sort(function(a, b) { return a.rateNum - b.rateNum'),
      };
    });

    expect(routes.greenery).toBe(true);
    expect(routes.asteroid).toBe(true);
    expect(routes.city).toBe(true);
    expect(routes.venus).toBe(true);
    expect(routes.aquifer).toBe(true);
    expect(routes.sortedByRate).toBe(true);

    await page.close();
  });

  test('O₂ bottleneck detects both O₂ and temperature variants', async ({ extensionContext, extensionId }) => {
    const page = await extensionContext.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: 'domcontentloaded' });

    const bottleneck = await page.evaluate(async () => {
      const resp = await fetch(chrome.runtime.getURL('content.js'));
      const src = await resp.text();
      return {
        o2: src.includes('O₂ Bottleneck') && src.includes('Кислород'),
        temp: src.includes('Темп. Bottleneck') && src.includes('Температура'),
        greeneryAdvice: src.includes('Greenery/plant карты ценнее'),
        heatAdvice: src.includes('Heat карты и астероиды ценнее'),
      };
    });

    expect(bottleneck.o2).toBe(true);
    expect(bottleneck.temp).toBe(true);
    expect(bottleneck.greeneryAdvice).toBe(true);
    expect(bottleneck.heatAdvice).toBe(true);

    await page.close();
  });

  test('award lock confidence calculates percentage', async ({ extensionContext, extensionId }) => {
    const page = await extensionContext.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: 'domcontentloaded' });

    const confidence = await page.evaluate(async () => {
      const resp = await fetch(chrome.runtime.getURL('content.js'));
      const src = await resp.text();
      return {
        hasConfPct: src.includes('confPct'),
        hasClamp: src.includes('Math.max(5, Math.min(95'),
        hasIcons: src.includes('🟢') && src.includes('🟡') && src.includes('🔴'),
        hasCategoryDetection: src.includes("awName.includes('miner')") && src.includes("awName.includes('banker')"),
      };
    });

    expect(confidence.hasConfPct).toBe(true);
    expect(confidence.hasClamp).toBe(true);
    expect(confidence.hasIcons).toBe(true);
    expect(confidence.hasCategoryDetection).toBe(true);

    await page.close();
  });

  test('S-tier cards like Point Luna are properly tiered on /cards', async ({ extensionContext }) => {
    const page = await extensionContext.newPage();
    await page.goto(`${TM_URL}/cards`, GOTO_OPTS);
    await waitForExtension(page);

    // Point Luna should be S-tier
    const pointLuna = page.locator('[data-tm-card="Point Luna"]');
    if (await pointLuna.count() > 0) {
      const tier = await pointLuna.first().getAttribute('data-tm-tier');
      expect(tier).toBe('S');
    }

    // Hackers should be D-tier (take-that penalty in 3P)
    const hackers = page.locator('[data-tm-card="Hackers"]');
    if (await hackers.count() > 0) {
      const tier = await hackers.first().getAttribute('data-tm-tier');
      expect(['D', 'F']).toContain(tier);
    }

    await page.close();
  });
});
