/**
 * Playwright E2E test: verify SYNERGY_RULES tooltips in the TM extension.
 *
 * Launches Chromium with the extension loaded, serves mock game pages
 * at terraforming-mars.herokuapp.com, and checks that contextual scoring
 * reasons from Section 48 appear on card badges.
 *
 * Run: node apps/tm-extension/tests/e2e_synergy_tooltips.mjs [--headed]
 */

import { chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const extensionPath = path.join(repoRoot, 'extension');
const require = createRequire(import.meta.url);
const TM_CARD_TAGS = require(path.join(repoRoot, 'packages', 'tm-data', 'generated', 'extension', 'card_tags.js'));
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
        reason: 'animal цель',
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
        reason: 'animal цель',
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
        reason: 'microbe цель',
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
        reason: 'microbe цель',
        desc: 'Imported Hydrogen: multi-type placer → microbe accum',
      },
    ],
  },

  // Scenario 3: Floater synergies (v4: tag-filtered placers)
  floater: {
    desc: 'Floater synergies (placer→accum, tag-filter, competition)',
    tableau: ['Dirigibles', 'Floating Habs', 'Jupiter Floating Station'],
    draft: ['Aerial Mappers', 'Atmo Collectors', 'Titan Floating Launch-pad'],
    corp: 'Celestic',
    opponent: {
      tableau: ['Livestock'],
      corp: 'Ecoline',
    },
    game: { temperature: -6, oxygenLevel: 9, oceans: 5, generation: 5 },
    checks: [
      {
        card: 'Aerial Mappers',
        reason: 'placer для floater',
        desc: 'Aerial Mappers (venus): Celestic unrestricted placer → accumWithPlacer',
      },
      {
        card: 'Aerial Mappers',
        reason: 'конкуренция floater',
        desc: 'Aerial Mappers: 3+ floater accumulators → competition',
      },
      {
        card: 'Titan Floating Launch-pad',
        reason: 'floater цель',
        desc: 'Titan FLP (jovian placer): JFS is jovian target → valid match',
      },
      {
        card: 'Titan Floating Launch-pad',
        reasonAbsent: '3 floater цель',
        desc: 'Titan FLP: should NOT count venus targets (Dirigibles/FH) → only 1 target',
      },
      {
        card: 'Atmo Collectors',
        reason: 'placer для floater',
        desc: 'Atmo Collectors (venus): Celestic unrestricted placer → accumWithPlacer',
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

  // Scenario 7: No-target penalty (48e)
  no_target: {
    desc: 'Placer without targets → penalty',
    tableau: ['Rover Construction', 'Space Station'],
    draft: ['Large Convoy', 'Imported Nitrogen'],
    corp: 'Credicor',
    opponent: { tableau: [], corp: 'Ecoline' },
    game: { temperature: -10, oxygenLevel: 7, oceans: 4, generation: 4 },
    checks: [
      {
        card: 'Large Convoy',
        reason: 'Нет animal целей',
        desc: 'Large Convoy: no animal targets on tableau → penalty',
      },
      {
        card: 'Imported Nitrogen',
        reason: 'Нет animal целей',
        desc: 'Imported Nitrogen: no animal targets → penalty',
      },
      {
        card: 'Imported Nitrogen',
        reason: 'Нет microbe целей',
        desc: 'Imported Nitrogen: no microbe targets → penalty',
      },
    ],
    tooltipChecks: [
      {
        card: 'Imported Nitrogen',
        text: 'Нет animal целей',
        color: 'rgb(255, 82, 82)',
        desc: 'Tooltip negative reason is red',
      },
    ],
  },

  // Scenario 8: Science accumulators
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

  // Scenario 9: Full synergy label in tooltip/reasons
  project_inspection: {
    desc: 'Project Inspection shows full synergy card name',
    tableau: ['Electro Catapult'],
    draft: ['Project Inspection'],
    corp: 'Credicor',
    opponent: { tableau: [], corp: 'Ecoline' },
    game: { temperature: -16, oxygenLevel: 5, oceans: 3, generation: 4 },
    checks: [
      {
        card: 'Project Inspection',
        reason: 'Повтор Electro Catapult +3',
        desc: 'Project Inspection explains that it repeats Electro Catapult',
      },
    ],
    tooltipChecks: [
      {
        card: 'Project Inspection',
        text: 'Повтор Electro Catapult +3',
        color: 'rgb(76, 175, 80)',
        desc: 'Tooltip positive synergy row is green and keeps full card name',
      },
    ],
  },

  // Scenario 10: Long hand synergy labels keep full card name
  long_hand_label: {
    desc: 'Long hand synergy labels keep full card name',
    tableau: [],
    hand: ['Venusian Animals'],
    draft: ['Large Convoy'],
    corp: 'Credicor',
    opponent: { tableau: [], corp: 'Ecoline' },
    game: { temperature: -18, oxygenLevel: 6, oceans: 3, generation: 4 },
    checks: [
      {
        card: 'Large Convoy',
        reason: 'Venusian Animals +4a',
        desc: 'Large Convoy keeps full Venusian Animals label in hand-synergy reason',
      },
      {
        card: 'Large Convoy',
        reasonAbsent: 'Venusian +1a',
        desc: 'Large Convoy no longer truncates Venusian Animals to first word',
      },
    ],
    tooltipChecks: [
      {
        card: 'Large Convoy',
        text: 'Hand: Venusian Animals +4a',
        color: 'rgb(76, 175, 80)',
        desc: 'Long hand-synergy label stays green in tooltip',
      },
    ],
  },

  // Scenario 11: Hand reasons use structured tone and keep explicit value
  hand_resource_reason: {
    desc: 'Hand resource reasons carry structured positive tone',
    tableau: [],
    hand: ['Large Convoy', 'Deimos Down'],
    draft: ['Asteroid Rights'],
    corp: 'Credicor',
    opponent: { tableau: [], corp: 'Ecoline' },
    game: { temperature: -18, oxygenLevel: 6, oceans: 3, generation: 4 },
    checks: [
      {
        card: 'Asteroid Rights',
        reason: 'Hand: 2 ti avail +1.4 (2 spc)',
        desc: 'Asteroid Rights shows explicit hand-value reason instead of ti→spc shorthand',
      },
    ],
    tooltipChecks: [
      {
        card: 'Asteroid Rights',
        text: 'Hand: 2 ti avail +1.4 (2 spc)',
        color: 'rgb(76, 175, 80)',
        desc: 'Structured Hand reason is green in tooltip',
      },
    ],
  },

  // Scenario 12: Unlock-chain reasons for globals and tag requirements
  unlock_chain: {
    desc: 'Unlock-chain reasons name the exact card and gate',
    tableau: ['Venusian Insects'],
    hand: ['Birds', 'Venus Governor'],
    draft: ['Mining Expedition', 'Ishtar Mining'],
    corp: 'Credicor',
    opponent: { tableau: [], corp: 'Ecoline' },
    game: { temperature: -18, oxygenLevel: 12, oceans: 6, venusScaleLevel: 8, generation: 6 },
    checks: [
      {
        card: 'Mining Expedition',
        reason: 'Открывает Birds через O₂',
        desc: 'Mining Expedition should explain direct O2 unlock for Birds',
      },
      {
        card: 'Ishtar Mining',
        reason: 'Открывает Venus Governor по Venus',
        desc: 'Ishtar Mining should explain direct Venus-tag unlock for Venus Governor',
      },
    ],
  },

  // Scenario 13: Standard project badge carries structured reason payload
  standard_projects: {
    desc: 'Standard project badges expose structured reason payload',
    tableau: [],
    draft: ['Search For Life'],
    checks: [],
    standardProjects: [
      { key: 'colony', className: 'card-container card-standard-project build-colony standard', title: 'Build Colony' },
    ],
    corp: 'Credicor',
    opponent: { tableau: [], corp: 'Ecoline' },
    game: { temperature: -20, oxygenLevel: 5, oceans: 3, generation: 4 },
    spChecks: [
      {
        key: 'colony',
        reason: 'Build Colony: будет 1-я колония',
        desc: 'Build Colony SP card gets structured reason payload',
      },
    ],
    spTooltipChecks: [
      {
        key: 'colony',
        text: 'Build Colony: будет 1-я колония',
        color: 'rgb(76, 175, 80)',
        desc: 'Build Colony SP tooltip row is green',
      },
    ],
  },

  // Scenario 14: Great Aquifer should not get generic SP-cheaper double-count bonus
  great_aquifer_no_std_bonus: {
    desc: 'Great Aquifer opener keeps contextual reasons but no generic SP-cheaper bonus',
    tableau: [],
    hand: ['Neptunian Power Consultants'],
    draft: ['Great Aquifer'],
    corp: 'Tharsis Republic',
    opponent: { tableau: [], corp: 'Ecoline' },
    game: { temperature: -30, oxygenLevel: 0, oceans: 0, venusScaleLevel: 0, generation: 1 },
    checks: [
      {
        card: 'Great Aquifer',
        reasonAbsent: 'Дешевле SP океана +',
        desc: 'Great Aquifer no longer gets generic SP-ocean double-count bonus',
      },
    ],
  },

  // Scenario 15: blocked support cards should not grant generic hand bonuses
  blocked_support_cards: {
    desc: 'Blocked support cards do not grant hand-synergy bonuses before requirements are online',
    tableau: [],
    hand: ['Shuttles', 'Decomposers'],
    draft: ['Large Convoy', 'Birds'],
    corp: 'Credicor',
    opponent: { tableau: [], corp: 'Ecoline' },
    game: { temperature: -30, oxygenLevel: 0, oceans: 0, venusScaleLevel: 0, generation: 1 },
    checks: [
      {
        card: 'Large Convoy',
        reasonAbsent: 'Shuttles -2',
        desc: 'Space cards should not get Shuttles discount before 5% oxygen is reachable',
      },
      {
        card: 'Birds',
        reasonAbsent: 'Decomp +1m',
        desc: 'Bio cards should not get Decomposers microbe bonus before 3% oxygen is reachable',
      },
    ],
  },

  // Scenario 16: discount reasons should look positive when source card is online
  discount_source_reason: {
    desc: 'Discount-source reasons use positive labels',
    tableau: [],
    hand: ['Sky Docks', 'Cartel', 'Earth Office'],
    draft: ['Venus Waystation'],
    corp: 'Credicor',
    opponent: { tableau: [], corp: 'Ecoline' },
    game: { temperature: -18, oxygenLevel: 6, oceans: 3, venusScaleLevel: 8, generation: 4 },
    checks: [
      {
        card: 'Venus Waystation',
        reason: 'Sky Docks скидка +1',
        desc: 'Sky Docks discount reason is shown as a positive benefit',
      },
      {
        card: 'Venus Waystation',
        reasonAbsent: 'Sky Docks -1',
        desc: 'Sky Docks discount no longer looks like a negative reason',
      },
    ],
    tooltipChecks: [
      {
        card: 'Venus Waystation',
        text: 'Hand: Sky Docks скидка +1',
        color: 'rgb(76, 175, 80)',
        desc: 'Sky Docks discount reason is green in tooltip',
      },
    ],
  },

  // Scenario 17: per-tag cards should name tag support, not fake resource gain
  plant_tag_label: {
    desc: 'Per-tag support reasons name tags explicitly',
    tableau: [],
    hand: ['Arctic Algae'],
    draft: ['Insects'],
    corp: 'Credicor',
    opponent: { tableau: [], corp: 'Ecoline' },
    game: { temperature: -18, oxygenLevel: 0, oceans: 0, venusScaleLevel: 0, generation: 1 },
    checks: [
      {
        card: 'Insects',
        reason: '1 plant tag',
        desc: 'Insects names plant-tag support explicitly',
      },
      {
        card: 'Insects',
        reasonAbsent: '+1 plant',
        desc: 'Insects no longer labels tag support as immediate plant gain',
      },
      {
        card: 'Insects',
        reasonAbsent: 'Req далеко',
        desc: 'Exact oxygen-step penalty should suppress generic far-requirement fallback',
      },
    ],
  },

  // Scenario 18: generic Kuiper colony wording should not fire on count-only colony cards
  kuiper_not_generic_colony_count: {
    desc: 'Kuiper bonus no longer fires on generic colony-count text',
    tableau: [],
    hand: [],
    draft: ['Soil Studies'],
    corp: 'Kuiper Cooperative',
    opponent: { tableau: [], corp: 'Ecoline' },
    game: { temperature: -18, oxygenLevel: 6, oceans: 3, venusScaleLevel: 8, generation: 4 },
    checks: [
      {
        card: 'Soil Studies',
        reasonAbsent: 'Kuiper +1',
        desc: 'Soil Studies should not get generic Kuiper colony bonus just for counting colonies',
      },
    ],
  },

  // Scenario 19: dense same-tag hand reasons should explain hand density in words
  building_tag_density_label: {
    desc: 'Hand tag-density reasons explain what is dense instead of raw 4×building shorthand',
    tableau: [],
    hand: ['Power Infrastructure', 'Electro Catapult', 'Research Outpost', 'Ironworks'],
    draft: ['Strategic Base Planning'],
    corp: 'Credicor',
    opponent: { tableau: [], corp: 'Ecoline' },
    game: { temperature: -18, oxygenLevel: 4, oceans: 2, venusScaleLevel: 0, generation: 3 },
    checks: [
      {
        card: 'Strategic Base Planning',
        reason: '4 building тегов в руке',
        desc: 'Strategic Base Planning should explain building-hand density in plain text',
      },
      {
        card: 'Strategic Base Planning',
        reasonAbsent: '4×building',
        desc: 'Raw 4×building shorthand should be gone',
      },
    ],
  },

  // Scenario 20: bare corp labels should disappear when a numeric corp bonus already exists
  corp_reason_dedup: {
    desc: 'Numeric corp reasons should replace bare Корп labels',
    tableau: [],
    hand: [],
    draft: ['Ironworks'],
    corp: 'Cheung Shing MARS',
    opponent: { tableau: [], corp: 'Ecoline' },
    game: { temperature: -18, oxygenLevel: 4, oceans: 2, venusScaleLevel: 0, generation: 3 },
    checks: [
      {
        card: 'Ironworks',
        reason: 'Cheung',
        desc: 'Ironworks should still show a Cheung corp synergy reason',
      },
      {
        card: 'Ironworks',
        reasonAbsent: 'Корп: Cheung',
        desc: 'Bare Cheung corp label should be removed once numeric reason exists',
      },
    ],
  },

  // Scenario 21: hard board requirements should suppress generic far-req fallback
  harvest_greenery_req: {
    desc: 'Harvest keeps the explicit greenery requirement and drops generic far-req noise',
    tableau: [],
    hand: ['Sky Docks', 'Ecological Zone', 'GMO Contract'],
    draft: ['Harvest'],
    requirements: {
      Harvest: 'Requires that you have 3 greenery tiles in play.',
    },
    corp: 'Credicor',
    opponent: { tableau: [], corp: 'Ecoline' },
    game: { temperature: -18, oxygenLevel: 0, oceans: 0, venusScaleLevel: 0, generation: 1 },
    checks: [
      {
        card: 'Harvest',
        reason: 'Нужно 3 озеленения (есть 0)',
        desc: 'Harvest should explain the real board requirement directly',
      },
      {
        card: 'Harvest',
        reasonAbsent: 'Req далеко',
        desc: 'Harvest should not also show a generic far-requirement line',
      },
    ],
    tooltipChecks: [
      {
        card: 'Harvest',
        text: 'Нужно 3 озеленения (есть 0)',
        color: 'rgb(255, 82, 82)',
        desc: 'Board requirement penalty is red in tooltip',
      },
    ],
  },

  // Scenario 22: colony reasons should explain the target, not just name-drop it
  strategic_base_colony_reason: {
    desc: 'Strategic Base Planning names the colony target causally',
    tableau: [],
    hand: [],
    draft: ['Strategic Base Planning'],
    corp: 'Credicor',
    opponent: { tableau: [], corp: 'Ecoline' },
    game: {
      temperature: -18,
      oxygenLevel: 4,
      oceans: 2,
      venusScaleLevel: 0,
      generation: 3,
      colonies: [
        { name: 'Europa', isActive: true, trackPosition: 1, colonies: [] },
        { name: 'Pluto', isActive: true, trackPosition: 1, colonies: [] },
      ],
    },
    checks: [
      {
        card: 'Strategic Base Planning',
        reason: 'Колония на Pluto: добор/торг +4',
        desc: 'Strategic Base Planning should explain why Pluto is the best colony target',
      },
      {
        card: 'Strategic Base Planning',
        reasonAbsent: 'Колония: Europa',
        desc: 'Weak colony names should not show up as flat unexplained bonuses',
      },
    ],
  },

  // Scenario 23: Suitable Infrastructure should value production-bump hands, not generic steel/building noise
  suitable_infrastructure_prod_chain: {
    desc: 'Suitable Infrastructure prefers dense production bumps and Robinson follow-up',
    tableau: [],
    hand: ['Business Empire', 'Acquired Company', 'Mining Area', 'Power Plant', 'Research Outpost'],
    draft: ['Suitable Infrastructure'],
    corp: 'Robinson Industries',
    opponent: { tableau: [], corp: 'Ecoline' },
    game: { temperature: -18, oxygenLevel: 4, oceans: 2, venusScaleLevel: 0, generation: 1 },
    checks: [
      {
        card: 'Suitable Infrastructure',
        reason: '4 prod bumps (cheap ×4)',
        desc: 'Suitable Infrastructure should count nearby production bumps in hand',
      },
      {
        card: 'Suitable Infrastructure',
        reason: 'Robinson prod action',
        desc: 'Suitable Infrastructure should recognize Robinson Industries as a production follow-up',
      },
      {
        card: 'Suitable Infrastructure',
        reasonAbsent: 'steel avail +',
        desc: 'Suitable Infrastructure should drop generic steel-availability noise once the specific prod plan is known',
      },
    ],
  },
};

// ── HTML builder ──

function getCardTagsForMock(cardName) {
  if (!cardName) return [];
  return TM_CARD_TAGS[cardName] || TM_CARD_TAGS[String(cardName).replace(/:.+$/, '')] || [];
}

function getRequirementTextForMock(scenario, cardName) {
  return (scenario.requirements && scenario.requirements[cardName]) || '';
}

function renderMockCard(name, scenario, options = {}) {
  const requirementText = getRequirementTextForMock(scenario, name);
  const requirementHTML = requirementText ? `<div class="card-requirements">${requirementText}</div>` : '';
  const tagHTML = getCardTagsForMock(name)
    .map((tag) => `<div class="card-tag tag-${tag}"></div>`)
    .join('');
  const extraClasses = options.extraClasses ? ` ${options.extraClasses}` : '';
  const showCost = options.showCost !== false;
  const costHTML = showCost ? '<div class="card-number">100</div>' : '';
  return `
    <div class="card-container${extraClasses}">
      <div class="card-title"><div>${name}</div></div>
      ${costHTML}
      ${requirementHTML}
      ${tagHTML}
    </div>`;
}

function buildVueBridgeData(scenario) {
  const s = scenario;
  return JSON.stringify({
    _timestamp: Date.now(),
    thisPlayer: {
      tableau: s.tableau.map((n) => ({ name: n })),
      cardsInHand: (s.hand || []).map((n) => ({ name: n })),
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
      venusScaleLevel: s.game.venusScaleLevel ?? 0,
      generation: s.game.generation,
      colonies: s.game.colonies || [],
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
    .map((name) => renderMockCard(name, scenario))
    .join('\n');

  const tableauCardsHTML = scenario.tableau
    .map((name) => renderMockCard(name, scenario, { showCost: false }))
    .join('\n');

  const handCardsHTML = (scenario.hand || [])
    .map((name) => renderMockCard(name, scenario))
    .join('\n');

  const standardProjectsHTML = (scenario.standardProjects || [])
    .map(
      (sp) => `
    <div class="${sp.className}" data-test-sp="${sp.key}">
      <div class="card-title"><div>${sp.title}</div></div>
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
    <div class="player_home_block--hand">
      ${handCardsHTML}
    </div>
    <div class="wf-component--select-card">
      ${draftCardsHTML}
    </div>
    <div class="standard-projects">
      ${standardProjectsHTML}
    </div>
  </div>
</body>
</html>`;
}

function getDraftCardSelector(cardName) {
  return `.wf-component--select-card .card-container[data-tm-card="${cardName}"]`;
}

function getStandardProjectSelector(spKey) {
  return `.card-standard-project[data-test-sp="${spKey}"]`;
}

async function hoverCardAndWaitForTooltip(page, cardName) {
  const selector = getDraftCardSelector(cardName);
  await page.hover(selector);
  await page.waitForFunction(
    () => {
      const tip = document.querySelector('.tm-tooltip-panel');
      return !!tip && window.getComputedStyle(tip).display !== 'none' && !!tip.textContent;
    },
    undefined,
    { timeout: 3000 }
  );
}

async function getTooltipRowSnapshot(page, needle) {
  return page.evaluate((text) => {
    const rows = Array.from(document.querySelectorAll('.tm-tooltip-panel .tm-tip-row'));
    const row = rows.find((el) => (el.textContent || '').includes(text));
    if (!row) return null;
    return {
      text: row.textContent || '',
      color: window.getComputedStyle(row).color,
      className: row.className || '',
    };
  }, needle);
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

    if (Array.isArray(scenario.spChecks)) {
      for (const chk of scenario.spChecks) {
        try {
          const selector = getStandardProjectSelector(chk.key);
          const el = await page.$(selector);
          if (!el) {
            totalFailed++;
            failedDetails.push(`${key}: ${chk.desc} — SP "${chk.key}" not found in DOM`);
            console.log(`  ✗ ${chk.desc} — SP "${chk.key}" not found`);
            continue;
          }

          const badgeReasons = await el.evaluate((node) => node.getAttribute('data-tm-reasons') || '');

          if (badgeReasons.includes(chk.reason)) {
            totalPassed++;
            console.log(`  ✓ ${chk.desc}`);
          } else {
            totalFailed++;
            failedDetails.push(`${key}: ${chk.desc} — expected "${chk.reason}" in SP badge reasons: ${badgeReasons}`);
            console.log(`  ✗ ${chk.desc}`);
            console.log(`    Expected SP reason: "${chk.reason}"`);
            console.log(`    Got SP reasons: ${badgeReasons}`);
          }
        } catch (e) {
          totalFailed++;
          failedDetails.push(`${key}: ${chk.desc} — ${e.message}`);
          console.log(`  ✗ ${chk.desc} — ${e.message}`);
        }
      }
    }

    // Tooltip content/style checks
    if (Array.isArray(scenario.tooltipChecks)) {
      for (const chk of scenario.tooltipChecks) {
        try {
          const el = await page.$(getDraftCardSelector(chk.card));
          if (!el) {
            totalFailed++;
            failedDetails.push(`${key}: ${chk.desc} — card "${chk.card}" not found in DOM`);
            console.log(`  ✗ ${chk.desc} — card "${chk.card}" not found`);
            continue;
          }

          await hoverCardAndWaitForTooltip(page, chk.card);
          const row = await getTooltipRowSnapshot(page, chk.text);
          if (!row) {
            totalFailed++;
            failedDetails.push(`${key}: ${chk.desc} — tooltip row "${chk.text}" not found`);
            console.log(`  ✗ ${chk.desc}`);
            console.log(`    Missing tooltip row: "${chk.text}"`);
            continue;
          }

          if (row.color !== chk.color) {
            totalFailed++;
            failedDetails.push(`${key}: ${chk.desc} — expected color ${chk.color}, got ${row.color} (${row.text})`);
            console.log(`  ✗ ${chk.desc}`);
            console.log(`    Expected color: ${chk.color}`);
            console.log(`    Got color: ${row.color}`);
            console.log(`    Row text: ${row.text}`);
            continue;
          }

          totalPassed++;
          console.log(`  ✓ ${chk.desc}`);
        } catch (e) {
          totalFailed++;
          failedDetails.push(`${key}: ${chk.desc} — ${e.message}`);
          console.log(`  ✗ ${chk.desc} — ${e.message}`);
        }
      }
    }

    if (Array.isArray(scenario.spTooltipChecks)) {
      for (const chk of scenario.spTooltipChecks) {
        try {
          const selector = `${getStandardProjectSelector(chk.key)}`;
          const el = await page.$(selector);
          if (!el) {
            totalFailed++;
            failedDetails.push(`${key}: ${chk.desc} — SP "${chk.key}" not found in DOM`);
            console.log(`  ✗ ${chk.desc} — SP "${chk.key}" not found`);
            continue;
          }

          await page.hover(selector);
          await page.waitForFunction(
            () => {
              const tip = document.querySelector('.tm-tooltip-panel');
              return !!tip && window.getComputedStyle(tip).display !== 'none' && !!tip.textContent;
            },
            undefined,
            { timeout: 3000 }
          );
          const row = await getTooltipRowSnapshot(page, chk.text);
          if (!row) {
            totalFailed++;
            failedDetails.push(`${key}: ${chk.desc} — tooltip row "${chk.text}" not found`);
            console.log(`  ✗ ${chk.desc}`);
            console.log(`    Missing SP tooltip row: "${chk.text}"`);
            continue;
          }
          if (row.color !== chk.color) {
            totalFailed++;
            failedDetails.push(`${key}: ${chk.desc} — expected color ${chk.color}, got ${row.color} (${row.text})`);
            console.log(`  ✗ ${chk.desc}`);
            console.log(`    Expected color: ${chk.color}`);
            console.log(`    Got color: ${row.color}`);
            console.log(`    Row text: ${row.text}`);
            continue;
          }
          totalPassed++;
          console.log(`  ✓ ${chk.desc}`);
        } catch (e) {
          totalFailed++;
          failedDetails.push(`${key}: ${chk.desc} — ${e.message}`);
          console.log(`  ✗ ${chk.desc} — ${e.message}`);
        }
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
    const ssPath = path.join(repoRoot, `tm-test-${key}.png`);
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
