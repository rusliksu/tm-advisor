/**
 * Playwright E2E test: verify SYNERGY_RULES tooltips in the TM extension.
 *
 * Launches Chromium with the extension loaded, serves mock game pages
 * at terraforming-mars.herokuapp.com, and checks that contextual scoring
 * reasons from Section 48 appear on card badges.
 *
 * Run: node scripts/test-synergy-tooltips.mjs [--headed]
 */

import { chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.resolve(__dirname, '..', 'extension');
// Chrome extensions require headed mode — headless doesn't load content scripts
const headed = true;

// ── Scenario definitions ──

const SCENARIOS = {
  // Scenario 1: Animal placer/accumulator/eater/competition
  animal: {
    desc: 'Animal synergies (placer, eater, competition, opponent)',
    tableau: ['Birds', 'Fish', 'Dirigibles'],
    draft: ['Large Convoy', 'Predators', 'Livestock', 'Imported Nitrogen'],
    corp: 'Credicor',
    opponent: {
      tableau: ['Ants', 'Decomposers', 'Livestock'],
      corp: 'Ecoline',
    },
    game: { temperature: -10, oxygenLevel: 7, oceans: 4, generation: 4 },
    checks: [
      {
        card: 'Large Convoy',
        reason: 'копит animal',
        desc: 'Large Convoy: placer → Birds/Fish accumulator',
      },
      {
        card: 'Predators',
        reason: 'ест свои animal',
        desc: 'Predators: eats own animal penalty',
      },
      {
        card: 'Predators',
        reason: 'опп. animal',
        desc: 'Predators: opponent animal target bonus',
      },
      {
        card: 'Livestock',
        reason: 'конкуренция animal',
        desc: 'Livestock: 3 animal accumulators → competition',
      },
      {
        card: 'Imported Nitrogen',
        reason: 'копит animal',
        desc: 'Imported Nitrogen: multi-type placer → animal accum',
      },
    ],
  },

  // Scenario 2: Microbe synergies + self-feeders
  microbe: {
    desc: 'Microbe synergies (self-feeder, placer→accum, competition)',
    tableau: ['Decomposers', 'Tardigrades', 'Symbiotic Fungus'],
    draft: ['Ants', 'Extreme-Cold Fungus', 'Imported Hydrogen', 'Bactoviral Research'],
    corp: 'Splice',
    opponent: {
      tableau: ['Birds', 'Fish'],
      corp: 'Arklight',
    },
    game: { temperature: -16, oxygenLevel: 4, oceans: 2, generation: 3 },
    checks: [
      {
        card: 'Extreme-Cold Fungus',
        reason: 'копит microbe',
        desc: 'Extreme-Cold Fungus: places microbe → Decomposers/Tardigrades',
      },
      {
        card: 'Ants',
        reason: 'placer для microbe',
        desc: 'Ants: accumulator + Symbiotic Fungus placer on tableau',
      },
      {
        card: 'Ants',
        reason: 'конкуренция microbe',
        desc: 'Ants: 3+ microbe accumulators → competition',
      },
      {
        card: 'Ants',
        reason: 'ест свои microbe',
        desc: 'Ants: dual-type eats own microbes penalty',
      },
      {
        card: 'Imported Hydrogen',
        reason: 'копит',
        desc: 'Imported Hydrogen: multi-type placer → microbe accum',
      },
    ],
  },

  // Scenario 3: Floater synergies
  floater: {
    desc: 'Floater synergies (placer→accum, accumulator→placer)',
    tableau: ['Dirigibles', 'Floating Habs', 'Stratopolis'],
    draft: ['Jovian Lanterns', 'Aerial Mappers', 'Atmo Collectors', 'Rotator Impacts'],
    corp: 'Celestic',
    opponent: {
      tableau: ['Livestock'],
      corp: 'Ecoline',
    },
    game: { temperature: -6, oxygenLevel: 9, oceans: 5, generation: 5 },
    checks: [
      {
        card: 'Jovian Lanterns',
        reason: 'конкуренция floater',
        desc: 'Jovian Lanterns: 3+ floater accumulators → competition',
      },
      {
        card: 'Aerial Mappers',
        reason: 'конкуренция floater',
        desc: 'Aerial Mappers: floater competition with Dirigibles/Floating Habs/Stratopolis',
      },
      {
        card: 'Atmo Collectors',
        reason: 'конкуренция floater',
        desc: 'Atmo Collectors: floater competition',
      },
    ],
  },

  // Scenario 4: Fighter accumulators (no placer exists, competition)
  fighter: {
    desc: 'Fighter synergies (no placer, competition at 3+)',
    tableau: ['Security Fleet', 'Asteroid Hollowing'],
    draft: ['St. Joseph of Cupertino Mission', 'Birds'],
    corp: 'Credicor',
    opponent: { tableau: [], corp: 'Ecoline' },
    game: { temperature: -8, oxygenLevel: 8, oceans: 4, generation: 5 },
    checks: [
      {
        card: 'St. Joseph of Cupertino Mission',
        reason: 'конкуренция fighter',
        desc: 'St. Joseph: 3 fighter accumulators → competition',
      },
      {
        card: 'St. Joseph of Cupertino Mission',
        reasonAbsent: 'placer для fighter',
        desc: 'St. Joseph: no fighter placer exists → no accumWithPlacer',
      },
      {
        card: 'Birds',
        reasonAbsent: 'конкуренция fighter',
        desc: 'Birds: animal, not fighter → no fighter competition',
      },
    ],
  },

  // Scenario 5: Ants dual-type (eats:'microbe') with opponent microbes
  ants_dual: {
    desc: 'Ants dual-type: res:microbe + eats:microbe + opponent microbes',
    tableau: ['Birds'],
    draft: ['Ants'],
    corp: 'Credicor',
    opponent: {
      tableau: ['GHG Producing Bacteria', 'Nitrite Reducing Bacteria', 'Decomposers'],
      corp: 'Splice',
    },
    game: { temperature: -14, oxygenLevel: 5, oceans: 3, generation: 3 },
    checks: [
      {
        card: 'Ants',
        reason: 'опп. microbe',
        desc: 'Ants: opponent has microbe targets → eats bonus',
      },
      {
        card: 'Ants',
        reasonAbsent: 'ест свои microbe',
        desc: 'Ants: NO own microbe penalty (no own microbe accumulators)',
      },
    ],
  },

  // Scenario 6: No synergies — empty tableau, verify engine doesn't fire
  clean: {
    desc: 'Clean state: no synergy annotations on tableau',
    tableau: ['Rover Construction', 'Space Station'],
    draft: ['Birds', 'Search For Life'],
    corp: 'Credicor',
    opponent: { tableau: [], corp: 'Ecoline' },
    game: { temperature: -20, oxygenLevel: 2, oceans: 1, generation: 2 },
    checks: [
      {
        card: 'Birds',
        reasonAbsent: 'placer для animal',
        desc: 'Birds: no placer on tableau → no accumWithPlacer reason',
      },
      {
        card: 'Birds',
        reasonAbsent: 'конкуренция animal',
        desc: 'Birds: alone = no animal competition',
      },
    ],
  },

  // Scenario 7: Science accumulators
  science: {
    desc: 'Science accumulator synergy',
    tableau: ['Physics Complex', 'Search For Life'],
    draft: ['Birds', 'Decomposers'],
    corp: 'Credicor',
    opponent: { tableau: [], corp: 'Ecoline' },
    game: { temperature: -12, oxygenLevel: 6, oceans: 3, generation: 4 },
    checks: [
      // Physics Complex + Search For Life = 2 science accumulators, no competition (need 3+)
      {
        card: 'Birds',
        reasonAbsent: 'копит science',
        desc: 'Birds: not a science placer → no science reason',
      },
    ],
  },
};

// ── HTML builder ──

function buildVueBridgeData(scenario) {
  const s = scenario;
  return JSON.stringify({
    _timestamp: Date.now(),
    thisPlayer: {
      tableau: s.tableau.map((n) => ({ name: n })),
      cardsInHand: [],
      megaCredits: 40,
      steel: 2,
      steelValue: 2,
      titanium: 1,
      titaniumValue: 3,
      heat: 5,
      terraformRating: 22,
      megaCreditProduction: 8,
      steelProduction: 1,
      titaniumProduction: 0,
      plantProduction: 1,
      energyProduction: 1,
      heatProduction: 2,
      color: 'red',
      coloniesCount: 0,
      fleetSize: 1,
      tradesThisGeneration: 0,
      corporations: [{ name: s.corp }],
    },
    game: {
      temperature: s.game.temperature,
      oxygenLevel: s.game.oxygenLevel,
      oceans: s.game.oceans,
      generation: s.game.generation,
      colonies: [],
      milestones: [],
      awards: [],
      players: [
        {
          color: 'blue',
          tableau: (s.opponent.tableau || []).map((n) => ({ name: n })),
          corporations: [{ name: s.opponent.corp || 'Ecoline' }],
          megaCredits: 20,
          steel: 0,
          titanium: 0,
        },
      ],
    },
  });
}

function buildMockHTML(scenario) {
  const vueBridge = buildVueBridgeData(scenario);
  const gen = scenario.game.generation;

  const draftCardsHTML = scenario.draft
    .map(
      (name) => `
    <div class="card-container">
      <div class="card-title"><div>${name}</div></div>
      <div class="card-number">100</div>
    </div>`
    )
    .join('\n');

  const tableauCardsHTML = scenario.tableau
    .map(
      (name) => `
    <div class="card-container">
      <div class="card-title"><div>${name}</div></div>
    </div>`
    )
    .join('\n');

  return `<!DOCTYPE html>
<html>
<head><title>Terraforming Mars - Mock</title></head>
<body>
  <div id="game" data-tm-vue-bridge='${vueBridge.replace(/'/g, '&#39;')}'>
    <div class="gen_marker active">${gen}</div>
    <div class="player_home_block--cards">
      ${tableauCardsHTML}
      <div class="card-container">
        <div class="card-title is-corporation"><div>${scenario.corp}</div></div>
      </div>
    </div>
    <div class="player_home_block--hand"></div>
    <div class="wf-component--select-card">
      ${draftCardsHTML}
    </div>
  </div>
</body>
</html>`;
}

// ── Main test runner ──

async function runTest() {
  let totalPassed = 0;
  let totalFailed = 0;
  const failedDetails = [];

  console.log('Launching Chromium with extension...\n');

  const browser = await chromium.launchPersistentContext('', {
    headless: !headed,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-sandbox',
    ],
  });

  const scenarioNames = Object.keys(SCENARIOS);

  for (const key of scenarioNames) {
    const scenario = SCENARIOS[key];
    console.log(`\n══ Scenario: ${key} — ${scenario.desc} ══`);

    const page = await browser.newPage();

    // Route: serve mock HTML for this scenario
    await page.route('**/terraforming-mars.herokuapp.com/**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: buildMockHTML(scenario),
      });
    });

    await page.goto('https://terraforming-mars.herokuapp.com/game?s=' + key);

    // Wait for badge injection
    try {
      await page.waitForSelector('.tm-tier-badge', { timeout: 8000 });
    } catch {
      console.log('  (no badges injected — some cards may not be in ratings)');
    }

    // Wait for contextual scoring interval (3s) + buffer
    await page.waitForTimeout(5000);

    // Run checks
    for (const chk of scenario.checks) {
      const selector = `.wf-component--select-card .card-container[data-tm-card="${chk.card}"]`;
      try {
        const el = await page.$(selector);
        if (!el) {
          // Card not found — might not be in TM_RATINGS
          if (chk.reasonAbsent) {
            totalPassed++;
            console.log(`  ✓ ${chk.desc} (card not in ratings — reason absent by default)`);
          } else {
            totalFailed++;
            failedDetails.push(`${key}: ${chk.desc} — card "${chk.card}" not found in DOM`);
            console.log(`  ✗ ${chk.desc} — card "${chk.card}" not found (not in TM_RATINGS?)`);
          }
          continue;
        }

        const reasons = await el.evaluate((e) => e.getAttribute('data-tm-reasons') || '');

        if (chk.reason) {
          // Positive check: reason must be present
          if (reasons.includes(chk.reason)) {
            totalPassed++;
            console.log(`  ✓ ${chk.desc}`);
          } else {
            totalFailed++;
            failedDetails.push(`${key}: ${chk.desc} — expected "${chk.reason}" in: ${reasons}`);
            console.log(`  ✗ ${chk.desc}`);
            console.log(`    Expected: "${chk.reason}"`);
            console.log(`    Got reasons: ${reasons}`);
          }
        }

        if (chk.reasonAbsent) {
          // Negative check: reason must NOT be present
          if (!reasons.includes(chk.reasonAbsent)) {
            totalPassed++;
            console.log(`  ✓ ${chk.desc}`);
          } else {
            totalFailed++;
            failedDetails.push(`${key}: ${chk.desc} — found unwanted "${chk.reasonAbsent}" in: ${reasons}`);
            console.log(`  ✗ ${chk.desc}`);
            console.log(`    Unwanted: "${chk.reasonAbsent}" found in: ${reasons}`);
          }
        }
      } catch (e) {
        totalFailed++;
        failedDetails.push(`${key}: ${chk.desc} — ${e.message}`);
        console.log(`  ✗ ${chk.desc} — ${e.message}`);
      }
    }

    // Tooltip check: hover first draft card and verify tooltip panel appears
    const firstDraftCard = await page.$(
      '.wf-component--select-card .card-container[data-tm-card]'
    );
    if (firstDraftCard) {
      await firstDraftCard.hover();
      await page.waitForTimeout(400);
      const tooltip = await page.$('.tm-tooltip-panel');
      if (tooltip) {
        const tipText = await tooltip.textContent();
        if (tipText.length > 5) {
          totalPassed++;
          console.log(`  ✓ Tooltip appears on hover (${tipText.length} chars)`);
        } else {
          totalFailed++;
          console.log(`  ✗ Tooltip empty`);
        }
      } else {
        totalFailed++;
        console.log(`  ✗ No tooltip on hover`);
      }
    }

    // Screenshot per scenario
    const ssPath = path.resolve(__dirname, '..', `tm-test-${key}.png`);
    await page.screenshot({ path: ssPath, fullPage: true });

    await page.close();
  }

  // ── Summary ──
  console.log('\n' + '═'.repeat(50));
  console.log(`Results: ${totalPassed} passed, ${totalFailed} failed`);
  if (failedDetails.length > 0) {
    console.log('\nFailed:');
    for (const f of failedDetails) console.log(`  - ${f}`);
  }
  console.log('═'.repeat(50) + '\n');

  await browser.close();
  process.exit(totalFailed > 0 ? 1 : 0);
}

runTest().catch((e) => {
  console.error('Test crashed:', e);
  process.exit(1);
});
