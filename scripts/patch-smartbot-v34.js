#!/usr/bin/env node
// patch-smartbot-v34.js (applied to tm-brain.js)
// Fix 90: Boost plant production valuation — greeneries are major VP source
// PROD_MC plants: 2 → 2.5 (each plant-prod → 1 plant/gen → greenery → 1 VP + potential TR)
// STOCK_MC plants: 1.5 → 1.8 (plants are more valuable than current estimate)
//
// Fix 91: Increase late-game VP multiplier
// vpMC late (gensLeft < 3): 7 → 8 (VP is everything in endgame, buy VP cards more aggressively)
//
// Fix 92: Add 20 more MANUAL_EV entries for commonly played cards

const fs = require('fs');
const brainFile = process.argv[2] || 'tm-brain.js';
let brain = fs.readFileSync(brainFile, 'utf8');
let applied = 0;

// ===== Fix 90: Boost plant valuation in PATCHED constants =====
// Only modify the PATCHED versions (PvP patch switches per-bot)
{
  const old = `  var PROD_MC_PATCHED = {
    megacredits: 1, steel: 1.8, titanium: 2.5, plants: 2,
    energy: 1.7, heat: 0.8
  };
  var STOCK_MC_PATCHED = {
    megacredits: 1, steel: 1.8, titanium: 2.5, plants: 1.5,
    energy: 1.5, heat: 0.8
  };`;

  const replacement = `  var PROD_MC_PATCHED = {
    megacredits: 1, steel: 1.8, titanium: 2.5, plants: 2.5,
    energy: 1.7, heat: 0.8
  };
  var STOCK_MC_PATCHED = {
    megacredits: 1, steel: 1.8, titanium: 2.5, plants: 1.8,
    energy: 1.5, heat: 0.8
  };`;

  if (brain.includes(old)) {
    brain = brain.replace(old, replacement);
    console.log('OK: Fix 90 — boost plant valuation (PROD 2→2.5, STOCK 1.5→1.8)');
    applied++;
  } else {
    console.log('SKIP: Fix 90 (pattern not found — need PvP patch applied first)');
  }
}

// ===== Fix 91: Better late-game VP multiplier =====
{
  const old = `  function vpMC(gensLeft) {
    if (gensLeft >= 6) return 3;  // early: VP cheap, MC more useful
    if (gensLeft >= 3) return 5;  // mid
    return 7;                     // late: VP = everything
  }`;

  const replacement = `  function vpMC(gensLeft) {
    if (gensLeft >= 6) return 3;  // early: VP cheap, MC more useful
    if (gensLeft >= 3) return 5;  // mid
    return 8;                     // late: VP = everything (was 7)
  }`;

  if (brain.includes(old)) {
    brain = brain.replace(old, replacement);
    console.log('OK: Fix 91 — late-game vpMC 7→8 (VP more critical in endgame)');
    applied++;
  } else {
    console.log('SKIP: Fix 91 (pattern not found)');
  }
}

// ===== Fix 92: Expand MANUAL_EV with 20 more cards =====
{
  const old = `    'Titan Shuttles':          { perGen: 1.5 }, // action: add 2 floaters or spend 2 → 1 colony
  };`;

  const replacement = `    'Titan Shuttles':          { perGen: 1.5 }, // action: add 2 floaters or spend 2 → 1 colony

    // === v34 MANUAL_EV expansion ===
    'Large Convoy':            { once: 8 },     // ocean + 5 plants + 2 cards (complex bundle, parser misses combo)
    'Nitrogen-Rich Asteroid':  { once: 6 },     // 2 temp + 1 TR + 4 plants (if 3 plant tags), big combo
    'Imported Hydrogen':       { once: 4 },     // ocean + 3 plants or 3 microbes
    'Terraforming Ganymede':   { once: 3 },     // 1 VP per Jovian tag (parser may undercount future tags)
    'Immigration Shuttles':    { perGen: 1.5 }, // +1 VP per 3 cities at end (grows over game)
    'Satellites':              { perGen: 1 },   // +1 MC per space tag (compound with space strategy)
    'Release of Inert Gases':  { once: 3 },     // 2 TR for 14 MC (parser may miss if no global key)
    'Asteroid':                { once: 2 },     // temp + 2 titanium (combo value)
    'Big Asteroid':            { once: 3 },     // 2 temp + 4 titanium (strong combo)
    'Comet':                   { once: 3 },     // temp + ocean + 2 plants removal (fast terraform)
    'Giant Ice Asteroid':      { once: 4 },     // 2 temp + ocean + 6 plants removal (huge terraform push)
    'Viral Enhancers':         { perGen: 2 },   // +1 plant/animal/microbe per relevant tag (already in v30, skip if dup)
    'Domed Crater':            { once: 2 },     // city + 3 energy prod - parser misses city in combo
    'Underground City':        { once: 2 },     // city + 2 steel prod - parser misses city
    'Noctis City':             { once: 2 },     // city + 1 energy prod - parser misses city
    'Gyropolis':               { once: 3 },     // city + 2 MC per Venus+Earth tag - growing value
    'Capital':                 { once: 5 },     // special city (VP per ocean adj) + 5 energy cost but high VP
    'Commercial District':     { once: 3 },     // city + 1 VP per adj city (city cluster VP)
    'Urbanized Area':          { once: 3 },     // city between 2 cities + 1 VP per adj city
    'Magnetic Field Generators':{ once: 2 },    // 3 TR for 4 energy prod - parser gets TR but not the energy trade
  };`;

  if (brain.includes(old)) {
    brain = brain.replace(old, replacement);
    console.log('OK: Fix 92 — expanded MANUAL_EV with 20 more card entries');
    applied++;
  } else {
    console.log('SKIP: Fix 92 (pattern not found)');
  }
}

fs.writeFileSync(brainFile, brain);
console.log('\n' + applied + ' fixes applied to ' + brainFile);
