#!/usr/bin/env node
/**
 * migrate-y-weights.js — Convert flat y-synergy strings to weighted [name, weight] format.
 *
 * Classification:
 *   +6..+7  Broken/godmode combo (COTD override only)
 *   +5      Production copy, major resource feed
 *   +4      Strong resource interaction (animal/microbe placer↔target)
 *   +3      Default synergy (tag sharing, economy complement)
 *   +2      Weak/thematic (same strategy, no direct interaction)
 *   -2      Mild conflict (resource competition)
 *   -3      Energy conflict (both consume energy)
 *   -4      Strong anti-synergy
 *
 * Usage: node scripts/migrate-y-weights.js [--dry-run]
 */

const fs = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');
const ROOT = path.resolve(__dirname, '..');
const RATINGS_PATH = path.join(ROOT, 'extension', 'data', 'ratings.json.js');
const EFFECTS_PATH = path.join(ROOT, 'extension', 'data', 'card_effects.json.js');

// ─── Load data ────────────────────────────────────────────────────────────────
const src = fs.readFileSync(RATINGS_PATH, 'utf8');
const effectsSrc = fs.readFileSync(EFFECTS_PATH, 'utf8');

// Replace const/let with var so we can eval safely
const evalSrc = src.replace(/^(const|let)\s+/gm, 'var ');
const evalEffects = effectsSrc.replace(/^(const|let)\s+/gm, 'var ');
const fn = new Function(evalSrc + ';\n' + evalEffects + ';\n return { TM_RATINGS, TM_CARD_EFFECTS };');
const { TM_RATINGS, TM_CARD_EFFECTS } = fn();

if (!TM_RATINGS) { console.error('Failed to load TM_RATINGS'); process.exit(1); }
if (!TM_CARD_EFFECTS) { console.error('Failed to load TM_CARD_EFFECTS'); process.exit(1); }

// ─── Constants ────────────────────────────────────────────────────────────────

const ANIMAL_TARGETS = new Set([
  'Birds', 'Fish', 'Livestock', 'Predators', 'Small Animals', 'Pets',
  'Ecological Zone', 'Penguins', 'Marine Apes', 'Security Fleet',
  'Venusian Animals', 'Venusian Insects', 'Stratospheric Birds',
  'Directed Impactors', 'Ants', 'Tardigrades', 'Extremophiles',
  'Aerosport Tournament', 'Jupiter Floating Station',
]);

const MICROBE_TARGETS = new Set([
  'Decomposers', 'Ants', 'Tardigrades', 'Extremophiles',
  'Nitrite Reducing Bacteria', 'GHG Producing Bacteria', 'Psychrophiles',
  'Sulphur-Eating Bacteria', 'Thermophiles', 'Viral Enhancers',
  'Topsoil Contract', 'Recyclon',
]);

const ANIMAL_PLACERS = new Set([
  'Large Convoy', 'Imported Nitrogen', 'Imported Hydrogen',
  'Local Shading', 'Herbivores', 'Bio Printing Facility',
]);

const MICROBE_PLACERS = new Set([
  'Imported Nitrogen', 'Imported Hydrogen', 'Local Shading',
  'Sponsored Academies', 'Bio Printing Facility',
]);

const PROD_COPY_CARDS = new Set([
  'Robotic Workforce', 'Mining Robots', 'Robotic Workforce (P2)',
]);

// Cards where e text mentions "copy" or "duplicate" production
const PROD_COPY_LIKE = new Set([
  'Robotic Workforce', 'Mining Robots',
]);

// ─── COTD-calibrated overrides ────────────────────────────────────────────────
// Format: { "CardA": { "CardB": weight, ... }, ... }
// Based on reddit_cotd.json analysis: strong synergy pairs confirmed by community
const COTD_OVERRIDES = {
  // Double Down combos (prelude doublers)
  'Double Down': {
    'Preservation Program': 7,   // 10 TR, negative effect only once
    'Merger': 7,                 // 3 corps, "never seen it lose"
    'Project Eden': 7,           // broken, removed from some games
    'UNMI Contractor': 6,        // 6 TR + 2 cards doubled
    'Recession': 5,              // -10 MC, -2 MC prod to all opponents
    'Lakefront Resorts': 6,      // 4 oceans + prod
    'Rise to Power': 5,          // 6 MC prod + delegates
    'Board of Directors': -4,    // DOES NOT WORK (official ruling)
    'Applied Science': -4,       // DOES NOT WORK
  },

  // Point Luna earth-tag engine
  'Point Luna': {
    'Luna Governor': 6,          // "ludicrously OP" — icehawk84
    'Cartel': 5,                 // strong earth tag synergy
    'Earth Catapult': 5,         // discount + tag
    'Miranda Resort': 4,         // earth tag VP
  },
  'Luna Governor': {
    'Point Luna': 6,
    'Cartel': 4,
  },

  // Virus attack combos
  'Virus': {
    'Media Group': 5,            // "play for net profit" — benbever
    'Decomposers': 4,            // microbe tag → 1/3 VP
    'Viral Enhancers': 4,        // microbe tag → 1 plant
    'Splice': 4,                 // microbe tag → 4 MC
    'Protected Habitats': -3,    // anti-synergy — "sell when they play it"
  },

  // Merger combos
  'Merger': {
    'Viron': 6,                  // double action on corps, "seems game winning"
    'Double Down': 7,            // 3 corps
  },

  // Birds — very strong per COTD
  'Birds': {
    'Large Convoy': 5,           // +4 animals
    'Fish': 4,                   // both animal targets, resource sharing
    'Imported Nitrogen': 4,
    'Predators': -3,             // Predators eats Birds
  },

  // Electro Catapult — well-analyzed in COTD
  'Electro Catapult': {
    'Advanced Alloys': 5,        // steel worth more
    'Viron': 4,                  // double action = 10 MC value
    'Robotic Workforce': 3,      // copy building but not amazing
    'Vitor': 3,                  // VP card = rebate
  },

  // Astra Mechanica — event replay
  'Astra Mechanica': {
    'Law Suit': 6,               // "one of the best targets in 1v1"
    'Giant Ice Asteroid': 5,     // big hitter replay
    'Large Convoy': 4,           // good but lose 2 VP on replay
    'Imported Nitrogen': 5,      // big value replay
    'Virus': 4,                  // "very annoying twice"
    'Sabotage': 4,               // deny opponent twice
    'Conscription': -3,          // negative VP, don't replay late
  },

  // Tharsis Republic
  'Tharsis Republic': {
    'Immigrant City': 4,         // classic but needs 4+ additional cities
    'Open City': 5,              // strong city card for Tharsis
    'Noctis City': 5,            // "very strong on Tharsis" — icehawk84
  },

  // Lakefront Resorts — ocean synergy
  'Lakefront Resorts': {
    'Arctic Algae': 5,
    'Kelp Farming': 4,
    'Aquifer Pumping': 4,
    'Ice Asteroid': 4,
  },

  // Strip Mine + energy analysis
  'Strip Mine': {
    'Robotic Workforce': 5,      // copy 2sp+1tp = ~7 MC/gen
    'Physics Complex': -3,       // both eat energy
    'AI Central': -2,            // competing energy drain
    'Power Plant': 4,            // energy to fuel it
    'Manutech': 5,               // prod → MC
  },

  // AI Central — card draw engine
  'AI Central': {
    'Power Plant': 4,            // needs energy
    'Strip Mine': -2,            // energy competition
    'Physics Complex': -3,       // energy competition
  },

  // Preservation Program
  'Preservation Program': {
    'Pristar': 5,                // design synergy
    'Double Down': 7,            // 10 TR doubled
    'UNMI': -2,                  // anti-synergy with corp UNMI
  },

  // Food Factory — community rates it poorly
  'Food Factory': {
    'Advanced Alloys': 3,        // only case when playable
    'Manutech': 3,               // MC bonus
  },

  // Neptunian Power Consultants
  'Neptunian Power Consultants': {
    'Advanced Alloys': 5,
    'Mining Guild': 4,
    'Rego Plastics': 4,
  },

  // Summit Logistics
  'Summit Logistics': {
    'Space Elevator': 5,         // 4x co-mentioned
    'Earth Catapult': 5,         // discount synergy
  },

  // Kelp Farming — strong per COTD
  'Kelp Farming': {
    'Arctic Algae': 4,           // both ocean-related plants
    'Ecoline': 5,                // plant engine
  },

  // Fish
  'Fish': {
    'Large Convoy': 5,           // animal placement
    'Imported Nitrogen': 4,
    'Birds': 4,                  // co-exist as animal targets
    'Predators': -4,             // Predators eats Fish!
  },

  // Predators — eats other animals
  'Predators': {
    'Fish': 5,                   // feeds on Fish
    'Birds': 5,                  // feeds on Birds
    'Small Animals': 5,          // feeds on Small Animals
    'Livestock': 4,
    'Ants': -3,                  // Ants removes from Predators
  },

  // Ants — removes animals from opponents + feeds self
  'Ants': {
    'Decomposers': 4,            // microbe synergy
    'Predators': -3,             // Ants weakens Predators
  },

  // Physics Complex — science VP
  'Physics Complex': {
    'Power Plant': 5,            // needs energy
    'Strip Mine': -3,            // energy competition
    'AI Central': -3,            // energy competition
    'Research': 3,               // science synergy
  },

  // Robotic Workforce — needs building targets
  'Robotic Workforce': {
    'Strip Mine': 5,             // 2sp+1tp-2ep = strong copy
    'Electro Catapult': 3,       // copy building prod
    'Open City': 4,              // copy 4mp-1ep city
    'Business Empire': 4,        // copy 6mp-1ep
    'Capital': 4,                // copy 5mp-2ep city
    'Space Port': 4,             // copy 4mp+1tp-1ep
  },

  // EcoLine — plant engine
  'Ecoline': {
    'Kelp Farming': 5,           // "strong" per COTD
    'Nitrophilic Moss': 4,
    'Farming': 4,
  },

  // Casinos — analyzed in COTD
  'Casinos': {
    'Tharsis Republic': 4,       // "easy if Tharsis"
    'Manutech': 4,               // 4MC bonus
    'Thorgate': 3,
  },

  // Immigrant City — "beginner trap in 2-3P early game"
  'Immigrant City': {
    'Tharsis Republic': 4,       // main synergy
  },

  // Open City
  'Open City': {
    'Pets': 4,                   // city → animal on Pets
    'Tharsis Republic': 5,       // "one of the best city cards" — benbever
  },

  // ─── Corp-specific synergies (manual) ────────────────────────────
  // Manutech: MC when production changes
  'Manutech': {
    'Strip Mine': 5,             // 3 prod changes = 3 MC
    'Business Empire': 4,        // 2 prod changes
    'Insects': 4,                // plant prod change
    'Cartel': 4,                 // MC prod change
  },

  // EcoLine: plants worth 7 instead of 8 for greenery
  'Ecoline': {
    'Kelp Farming': 5,           // 3 plant prod + 2 plants (COTD confirmed)
    'Nitrophilic Moss': 4,       // 2 plant prod
    'Farming': 4,                // 2 plant prod + 2 MC prod
  },

  // Helion: heat = MC
  'Helion': {
    'Soletta': 5,                // 7 heat prod → 7 MC/gen
    'GHG Factories': 4,          // 4 heat prod
    'Heat Trappers': 4,          // 3 heat prod steal
    'Caretaker Contract': 5,     // action: 8 heat → 1 TR
  },

  // Interplanetary Cinematics: 20 steel + building triggers
  'Interplanetary Cinematics': {
    'Rego Plastics': 4,          // steel value +1
    'Space Elevator': 4,         // ti prod + space + building
    'Electro Catapult': 5,       // action + building
    'Strip Mine': 4,             // steel prod
  },

  // Viron: free action reuse
  'Viron': {
    'AI Central': 5,             // double card draw
    'Electro Catapult': 4,       // double sell
  },

  // Mining Guild: steel bonus
  'Mining Guild': {
    'Space Elevator': 4,
    'Electro Catapult': 4,
  },

  // PhoboLog: +1 ti value
  'PhoboLog': {
    'Io Mining Industries': 5,   // ti prod + Jovian
  },

  // Saturn Systems: Jovian bonus
  'Saturn Systems': {
    'Io Mining Industries': 5,   // Jovian + ti prod
  },

  // Tycho Magnetics: animal/floater boost
  'Tycho Magnetics': {
    'Predators': 4,
    'Fish': 4,
    'Livestock': 4,
    'Physics Complex': 3,
  },

  // Morning Star Inc: Venus reqs -2
  'Morning Star Inc.': {
    'Maxwell Base': 5,           // city + Venus
    'Venus Governor': 4,
    'Atmospheric Enhancers': 4,
  },

  // Arklight: animal/plant engine
  'Arklight': {
    'Large Convoy': 5,
    'Imported Nitrogen': 5,
    'Fish': 4,
  },

  // Valley Trust: extra prelude
  'Valley Trust': {
    'Research': 4,               // science + card draw
  },

  // Factorum: energy to steel or card draw
  'Factorum': {
    'AI Central': 4,             // complementary card draw
    'Strip Mine': 4,             // steel value
  },

  // Aridor: colony bonuses
  'Aridor': {
    'Deuterium Export': 4,       // colony synergy
  },

  // ─── Card-to-card detailed weights ────────────────────────────────
  // Arctic Algae — top synergy card (24 references)
  'Arctic Algae': {
    'Kelp Farming': 4,
    'Nitrogen-Rich Asteroid': 4,
    'Giant Ice Asteroid': 4,
  },

  // Insects — #3 most referenced
  'Insects': {
    'Heather': 4,                // plant synergy
    'Lichen': 4,                 // plant synergy
    'Kelp Farming': 4,
  },

  // Community Services — no-tag bonus
  'Community Services': {
    'Sagitta Frontier Services': 4, // no-tag corp
    'Black Polar Dust': 3,
  },

  // Io Mining Industries — strong Jovian engine
  'Io Mining Industries': {
    'Saturn Systems': 5,
    'PhoboLog': 5,
    'Ganymede Colony': 4,
  },

  // Research — science tag + card draw
  'Research': {
    'Mars University': 4,
    'Olympus Conference': 4,
    'Physics Complex': 3,
  },

  // Floating Habs — floater VP
  'Floating Habs': {
    'Dirigibles': 4,
    'Aerial Mappers': 4,
    'Celestic': 4,
  },

  // Space Elevator
  'Space Elevator': {
    'Electro Catapult': 4,       // both need steel/building
    'Mining Guild': 4,
    'Summit Logistics': 5,
  },

  // Ganymede Colony
  'Ganymede Colony': {
    'Io Mining Industries': 4,
    'Jovian Lanterns': 3,
  },

  // Extreme-Cold Fungus
  'Extreme-Cold Fungus': {
    'Decomposers': 4,
    'Psychrophiles': 4,
  },

  // Symbiotic Fungus
  'Symbiotic Fungus': {
    'Decomposers': 4,
    'Ants': 4,
    'Tardigrades': 3,
  },

  // Venus Waystation
  'Venus Waystation': {
    'Morning Star Inc.': 4,
    'Floating Habs': 3,
  },

  // Aerial Mappers
  'Aerial Mappers': {
    'Floating Habs': 4,
    'Celestic': 4,
    'Stratospheric Birds': 3,
  },

  // Imported Nitrogen — triple resource placement
  'Imported Nitrogen': {
    'Fish': 5,
    'Birds': 5,
    'Ecological Zone': 5,
    'Decomposers': 4,
    'Ants': 4,
  },

  // Large Convoy — major animal placement
  'Large Convoy': {
    'Fish': 5,
    'Birds': 5,
    'Ecological Zone': 5,
    'Livestock': 4,
    'Penguins': 4,
  },

  // Psychrophiles — microbe accumulation
  'Psychrophiles': {
    'Extreme-Cold Fungus': 4,
    'Symbiotic Fungus': 4,
  },

  // Cartel — Earth tag MC prod
  'Cartel': {
    'Point Luna': 5,
    'Luna Governor': 4,
  },

  // Adapted Lichen
  'Adapted Lichen': {
    'Nitrogen-Rich Asteroid': 4,
    'Kelp Farming': 3,
  },

  // GHG Producing Bacteria
  'GHG Producing Bacteria': {
    'Symbiotic Fungus': 4,
    'Decomposers': 4,
  },

  // Venusian Animals — Venus animal VP, scales with Venus track + science action cards
  'Venusian Animals': {
    'Imported Nitrogen': 5,      // places animals directly
    'Large Convoy': 5,           // places animals directly
    'Venus Governor': 4,         // Venus raise → enables playing VA sooner
    'Atmospheric Enhancers': 4,  // Venus raise
    'Spin-inducing Asteroid': 3, // Venus raise
    'Stratospheric Birds': 3,    // Venus + floater/animal coexistence
    'Dirigibles': 3,             // Venus card
    'Morning Star Inc.': 4,      // Venus corp, req -2
  },
};

// ─── Helper: get fx for a card ────────────────────────────────────────────────
function getFx(name) {
  return TM_CARD_EFFECTS[name] || null;
}

function getData(name) {
  return TM_RATINGS[name] || null;
}

// ─── Helper: get tags for a card ──────────────────────────────────────────────
function getTags(name) {
  const d = getData(name);
  return d && d.g ? new Set(d.g.map(t => t.toLowerCase())) : new Set();
}

// ─── Classify synergy type and assign weight ──────────────────────────────────
function classifySynergy(cardA, cardB) {
  // 1. Check COTD override first
  if (COTD_OVERRIDES[cardA] && COTD_OVERRIDES[cardA][cardB] !== undefined) {
    return { weight: COTD_OVERRIDES[cardA][cardB], source: 'cotd' };
  }

  const fxA = getFx(cardA);
  const fxB = getFx(cardB);
  const tagsA = getTags(cardA);
  const tagsB = getTags(cardB);
  const dataA = getData(cardA);
  const dataB = getData(cardB);

  // 2. Production copy synergy (+5)
  if (PROD_COPY_CARDS.has(cardA) && fxB) {
    const prodVal = (fxB.sp || 0) * 2 + (fxB.tp || 0) * 3 + (fxB.mp || 0) +
      (fxB.pp || 0) * 1.5 + (fxB.ep || 0) * 1.5 + (fxB.hp || 0) * 0.5;
    if (prodVal >= 4) return { weight: Math.min(6, Math.round(prodVal)), source: 'prod-copy' };
    if (prodVal >= 2) return { weight: 4, source: 'prod-copy' };
  }
  if (PROD_COPY_CARDS.has(cardB) && fxA) {
    const prodVal = (fxA.sp || 0) * 2 + (fxA.tp || 0) * 3 + (fxA.mp || 0) +
      (fxA.pp || 0) * 1.5 + (fxA.ep || 0) * 1.5 + (fxA.hp || 0) * 0.5;
    if (prodVal >= 4) return { weight: Math.min(6, Math.round(prodVal)), source: 'prod-copy-rev' };
    if (prodVal >= 2) return { weight: 4, source: 'prod-copy-rev' };
  }

  // 3. Animal placer ↔ target (+4-5)
  if (ANIMAL_PLACERS.has(cardA) && ANIMAL_TARGETS.has(cardB)) {
    return { weight: 5, source: 'animal-place' };
  }
  if (ANIMAL_TARGETS.has(cardA) && ANIMAL_PLACERS.has(cardB)) {
    return { weight: 4, source: 'animal-target' };
  }

  // 4. Microbe placer ↔ target (+3-4)
  if (MICROBE_PLACERS.has(cardA) && MICROBE_TARGETS.has(cardB)) {
    return { weight: 4, source: 'microbe-place' };
  }
  if (MICROBE_TARGETS.has(cardA) && MICROBE_PLACERS.has(cardB)) {
    return { weight: 3, source: 'microbe-target' };
  }

  // 5. Energy conflict detection (-3)
  if (fxA && fxB && fxA.ep && fxA.ep < 0 && fxB.ep && fxB.ep < 0) {
    // Both consume energy
    const totalDrain = Math.abs(fxA.ep) + Math.abs(fxB.ep);
    if (totalDrain >= 4) return { weight: -4, source: 'energy-conflict-deep' };
    return { weight: -3, source: 'energy-conflict' };
  }

  // 6. Energy producer ↔ consumer (+4)
  if (fxA && fxB) {
    if (fxA.ep && fxA.ep > 0 && fxB.ep && fxB.ep < 0) {
      return { weight: 4, source: 'energy-feed' };
    }
    if (fxB.ep && fxB.ep > 0 && fxA.ep && fxA.ep < 0) {
      return { weight: 4, source: 'energy-feed-rev' };
    }
  }

  // 7. Predator ↔ prey anti-synergy
  if (cardA === 'Predators' && ANIMAL_TARGETS.has(cardB) && cardB !== 'Predators') {
    return { weight: 5, source: 'predator-feed' };
  }
  if (cardB === 'Predators' && ANIMAL_TARGETS.has(cardA) && cardA !== 'Predators') {
    // Being eaten is bad for the target
    return { weight: -3, source: 'predator-prey' };
  }

  // 8. Strong production synergy: card produces resource that other card benefits from
  if (fxA && fxB) {
    // Steel prod + building card (high cost)
    if (fxA.sp && fxA.sp >= 2 && tagsB.has('building') && fxB.c && fxB.c >= 15) {
      return { weight: 4, source: 'steel-feed' };
    }
    if (fxB.sp && fxB.sp >= 2 && tagsA.has('building') && fxA.c && fxA.c >= 15) {
      return { weight: 4, source: 'steel-feed-rev' };
    }
    // Ti prod + space card (high cost)
    if (fxA.tp && fxA.tp >= 1 && tagsB.has('space') && fxB.c && fxB.c >= 20) {
      return { weight: 4, source: 'ti-feed' };
    }
    if (fxB.tp && fxB.tp >= 1 && tagsA.has('space') && fxA.c && fxA.c >= 20) {
      return { weight: 4, source: 'ti-feed-rev' };
    }
  }

  // 9. Shared rare tags (+3)
  const rareTags = ['jovian', 'science', 'venus', 'earth'];
  const sharedRare = rareTags.filter(t => tagsA.has(t) && tagsB.has(t));
  if (sharedRare.length > 0) {
    return { weight: 3, source: 'rare-tag-' + sharedRare[0] };
  }

  // 10. Economy text synergy detection
  if (dataA && dataB && dataA.e && dataB.e) {
    const eA = dataA.e.toLowerCase();
    const eB = dataB.e.toLowerCase();

    // Card draw synergy: one draws, other benefits from big hand
    if ((eA.includes('draw') || eA.includes('card')) && (eB.includes('draw') || eB.includes('card'))) {
      return { weight: 3, source: 'card-draw' };
    }

    // Plant synergy: both produce/use plants
    if ((eA.includes('plant') || eA.includes('раст')) && (eB.includes('plant') || eB.includes('раст'))) {
      return { weight: 3, source: 'plant-synergy' };
    }

    // Heat synergy
    if ((eA.includes('heat') || eA.includes('тепл')) && (eB.includes('heat') || eB.includes('тепл'))) {
      return { weight: 3, source: 'heat-synergy' };
    }
  }

  // 11. VP synergy — both cards produce VP from same mechanism
  if (fxA && fxB) {
    if (fxA.vpAcc && fxB.vpAcc) {
      return { weight: 2, source: 'vp-compete' }; // competing for VP slots
    }
  }

  // 12. Colony synergy — both are colony-related
  if (dataA && dataB && dataA.e && dataB.e) {
    const eA = dataA.e.toLowerCase();
    const eB = dataB.e.toLowerCase();
    if ((eA.includes('colon') || eA.includes('trade') || eA.includes('fleet')) &&
        (eB.includes('colon') || eB.includes('trade') || eB.includes('fleet'))) {
      return { weight: 3, source: 'colony-synergy' };
    }
  }

  // 13. Action card synergy — cheap action + action multiplier
  if (dataA && dataB) {
    const eA = (dataA.e || '').toLowerCase();
    const eB = (dataB.e || '').toLowerCase();
    if ((eA.includes('action') && eB.includes('action'))) {
      return { weight: 2, source: 'action-pair' };
    }
  }

  // 14. Building tag + steel prod synergy
  if (tagsA.has('building') && fxB && fxB.sp && fxB.sp >= 1) {
    return { weight: 3, source: 'building-steel' };
  }
  if (tagsB.has('building') && fxA && fxA.sp && fxA.sp >= 1) {
    return { weight: 3, source: 'building-steel-rev' };
  }

  // 15. Space tag + ti prod synergy
  if (tagsA.has('space') && fxB && fxB.tp && fxB.tp >= 1) {
    return { weight: 3, source: 'space-ti' };
  }
  if (tagsB.has('space') && fxA && fxA.tp && fxA.tp >= 1) {
    return { weight: 3, source: 'space-ti-rev' };
  }

  // 16. Venus tag pair
  if (tagsA.has('venus') && tagsB.has('venus')) {
    return { weight: 3, source: 'venus-pair' };
  }

  // 17. Microbe/Animal tag pair (bio synergy)
  if ((tagsA.has('microbe') || tagsA.has('animal')) && (tagsB.has('microbe') || tagsB.has('animal'))) {
    return { weight: 3, source: 'bio-pair' };
  }

  // 18. Default — if it's already in y, it was manually curated → +3
  return { weight: 3, source: 'default' };
}

// ─── Main migration ───────────────────────────────────────────────────────────
const log = {
  timestamp: new Date().toISOString(),
  totalCards: 0,
  cardsWithY: 0,
  entriesMigrated: 0,
  weightDistribution: {},
  sourceDistribution: {},
  negativeSynergiesAdded: 0,
  details: [],
};

// ─── Phase 1: Migrate existing y entries ──────────────────────────────────────
for (const [cardName, data] of Object.entries(TM_RATINGS)) {
  log.totalCards++;
  if (!data.y || !Array.isArray(data.y)) continue;
  if (data.y.length === 0) continue;
  if (data.y.length === 1 && data.y[0] === 'None significant') continue;

  log.cardsWithY++;
  const newY = [];

  for (const entry of data.y) {
    if (entry === 'None significant') continue;

    // Already weighted? Keep as-is
    if (Array.isArray(entry)) {
      newY.push(entry);
      continue;
    }

    // Classify
    const result = classifySynergy(cardName, entry);
    newY.push([entry, result.weight]);
    log.entriesMigrated++;

    // Track distribution
    const w = result.weight;
    log.weightDistribution[w] = (log.weightDistribution[w] || 0) + 1;
    log.sourceDistribution[result.source] = (log.sourceDistribution[result.source] || 0) + 1;

    log.details.push({
      card: cardName,
      synergy: entry,
      weight: result.weight,
      source: result.source,
    });
  }

  data.y = newY.length > 0 ? newY : ['None significant'];
}

// ─── Phase 2: Add negative synergies for known conflicts ──────────────────────
// Energy conflicts: if a card consumes energy, add negative synergies with other heavy consumers
const energyConsumers = [];
for (const [name, fx] of Object.entries(TM_CARD_EFFECTS)) {
  if (fx.ep && fx.ep < 0 && Math.abs(fx.ep) >= 2) {
    energyConsumers.push({ name, drain: Math.abs(fx.ep) });
  }
}

// For each heavy energy consumer, check if it already has y-entries for other heavy consumers
for (const consumer of energyConsumers) {
  const data = TM_RATINGS[consumer.name];
  if (!data) continue;
  if (!data.y) data.y = [];
  if (data.y.length === 1 && data.y[0] === 'None significant') data.y = [];

  const existingNames = new Set(data.y.map(e => Array.isArray(e) ? e[0] : e));

  for (const other of energyConsumers) {
    if (other.name === consumer.name) continue;
    if (existingNames.has(other.name)) continue;

    // Only add if combined drain is severe (>= 4)
    if (consumer.drain + other.drain >= 4) {
      const weight = consumer.drain + other.drain >= 6 ? -4 : -3;
      data.y.push([other.name, weight]);
      log.negativeSynergiesAdded++;
      log.details.push({
        card: consumer.name,
        synergy: other.name,
        weight: weight,
        source: 'energy-conflict-added',
      });
    }
  }
}

// Predator/prey conflicts: Predators & Ants eat from animal targets
const predatorCards = ['Predators', 'Ants'];
for (const predator of predatorCards) {
  for (const target of ANIMAL_TARGETS) {
    if (target === predator) continue;
    if (target === 'Ants' || target === 'Predators') continue; // skip mutual

    const targetData = TM_RATINGS[target];
    if (!targetData) continue;
    if (!targetData.y) targetData.y = [];
    if (targetData.y.length === 1 && targetData.y[0] === 'None significant') targetData.y = [];

    const existingNames = new Set(targetData.y.map(e => Array.isArray(e) ? e[0] : e));
    if (existingNames.has(predator)) continue;

    // Animal target that can be eaten → negative synergy
    targetData.y.push([predator, -3]);
    log.negativeSynergiesAdded++;
    log.details.push({
      card: target,
      synergy: predator,
      weight: -3,
      source: 'predator-prey-added',
    });
  }
}

// ─── Phase 3: Write back ──────────────────────────────────────────────────────
console.log('\n=== Y-Synergy Weight Migration ===');
console.log('Cards with y:', log.cardsWithY);
console.log('Entries migrated:', log.entriesMigrated);
console.log('Negative synergies added:', log.negativeSynergiesAdded);
console.log('\nWeight distribution:');
const sortedWeights = Object.entries(log.weightDistribution).sort((a, b) => Number(b[0]) - Number(a[0]));
for (const [w, count] of sortedWeights) {
  const bar = '█'.repeat(Math.min(50, count));
  console.log(`  ${w > 0 ? '+' : ''}${w}: ${count} ${bar}`);
}
console.log('\nSource distribution:');
const sortedSources = Object.entries(log.sourceDistribution).sort((a, b) => b[1] - a[1]);
for (const [s, count] of sortedSources) {
  console.log(`  ${s}: ${count}`);
}

if (!DRY_RUN) {
  // Strategy: Rebuild TM_RATINGS JSON from modified object, preserve file structure
  // The file is: const TM_RATINGS={...};\nconst TM_COMBOS={...}; (etc.)

  // Find start/end of TM_RATINGS object in source
  const ratingsStart = src.indexOf('TM_RATINGS=');
  if (ratingsStart === -1) { console.error('Cannot find TM_RATINGS= in source'); process.exit(1); }

  // Find the opening { after TM_RATINGS=
  const objStart = src.indexOf('{', ratingsStart);

  // Find matching closing } — track brace depth
  let depth = 0;
  let objEnd = -1;
  for (let i = objStart; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) { objEnd = i; break; }
    }
  }
  if (objEnd === -1) { console.error('Cannot find end of TM_RATINGS object'); process.exit(1); }

  // Serialize the modified TM_RATINGS
  const newJson = JSON.stringify(TM_RATINGS);

  // Reconstruct file: prefix + new object + suffix
  const prefix = src.substring(0, objStart);
  const suffix = src.substring(objEnd + 1);
  const output = prefix + newJson + suffix;

  fs.writeFileSync(RATINGS_PATH, output, 'utf8');
  console.log('\n✓ ratings.json.js updated');
} else {
  console.log('\n[DRY RUN] No files modified');
}

// Save log
const logPath = path.join(__dirname, 'y-migration-log.json');
fs.writeFileSync(logPath, JSON.stringify(log, null, 2), 'utf8');
console.log('Log saved to:', logPath);

// Show sample of interesting entries
console.log('\n=== Sample: COTD-calibrated entries ===');
const cotdEntries = log.details.filter(d => d.source === 'cotd').slice(0, 15);
for (const e of cotdEntries) {
  console.log(`  ${e.card} ↔ ${e.synergy}: ${e.weight > 0 ? '+' : ''}${e.weight}`);
}

console.log('\n=== Sample: Negative synergies ===');
const negEntries = log.details.filter(d => d.weight < 0).slice(0, 15);
for (const e of negEntries) {
  console.log(`  ${e.card} ↔ ${e.synergy}: ${e.weight} (${e.source})`);
}

console.log('\n=== Sample: Production copy ===');
const copyEntries = log.details.filter(d => d.source.startsWith('prod-copy')).slice(0, 10);
for (const e of copyEntries) {
  console.log(`  ${e.card} ↔ ${e.synergy}: +${e.weight}`);
}
