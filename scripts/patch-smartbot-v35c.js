#!/usr/bin/env node
// patch-smartbot-v35c.js (applied to tm-brain.js)
// v35c: ONLY Fix 95 (MANUAL_EV) — Fix 93 (corp synergies) and Fix 94 (TAG_VALUE) removed
// Testing if MANUAL_EV alone is stable + beneficial

const fs = require('fs');
const brainFile = process.argv[2] || 'tm-brain.js';
let brain = fs.readFileSync(brainFile, 'utf8');
let applied = 0;

// ===== Fix 95: 15 more MANUAL_EV entries =====
{
  const old = `    'Magnetic Field Generators':{ once: 2 },    // 3 TR for 4 energy prod - parser gets TR but not the energy trade
  };`;

  const replacement = `    'Magnetic Field Generators':{ once: 2 },    // 3 TR for 4 energy prod - parser gets TR but not the energy trade

    // === v35 MANUAL_EV expansion ===
    'AI Central':              { perGen: 4 },   // draw 2 cards/gen (action) — best blue card, parser misses
    'Acquired Company':        { perGen: 1 },   // +3 MC prod (parser may miss as prelude-like)
    'Optimal Aerobraking':     { perGen: 2 },   // +3 MC +3 heat per space event (frequent trigger)
    'Space Station':           { perGen: 1.5 }, // -2 MC on space cards (compound with space strategy)
    'Earth Office':            { perGen: 2 },   // -3 MC on earth cards (strong with earth tags)
    'Anti-Gravity Technology': { perGen: 3 },   // -2 MC on all cards (best universal discount)
    'Media Group':             { perGen: 1 },   // +3 MC per event played (decent with events)
    'Mars University':         { perGen: 2 },   // draw+discard per science tag (card filtering)
    'Olympus Conference':      { perGen: 1.5 }, // science resource → draw card (slow but steady)
    'Research Outpost':        { once: 3 },     // city + -1 MC on all cards (parser misses discount)
    'Luna Metropolis':         { once: 4 },     // city + 1 VP per earth tag (grows with earth)
    'Ganymede Colony':         { once: 3 },     // city + 1 VP per Jovian tag (grows with Jovian)
    'Physics Complex':         { perGen: 3 },   // action: 6 energy → 1 VP (strong if energy surplus)
    'Decomposers':             { perGen: 1.5 }, // add microbe per plant/animal/microbe tag → VP
    'Predators':               { perGen: 2 },   // action: remove animal from any → VP (strong accumulator)
  };`;

  if (brain.includes(old)) {
    brain = brain.replace(old, replacement);
    console.log('OK: Fix 95 — 15 more MANUAL_EV entries');
    applied++;
  } else {
    console.log('SKIP: Fix 95 (pattern not found)');
  }
}

fs.writeFileSync(brainFile, brain);
console.log('\n' + applied + ' fixes applied to ' + brainFile);
