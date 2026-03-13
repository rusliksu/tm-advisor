#!/usr/bin/env node
// patch-smartbot-v35.js (applied to tm-brain.js)
// Fix 93: More corporation synergies (6 corps missing from scoreCard)
// Fix 94: TAG_VALUE rebalance — jovian/science are milestone/award enablers
// Fix 95: 15 more MANUAL_EV entries for high-impact cards

const fs = require('fs');
const brainFile = process.argv[2] || 'tm-brain.js';
let brain = fs.readFileSync(brainFile, 'utf8');
let applied = 0;

// ===== Fix 93: More corporation synergies =====
{
  const old = `      // Poseidon: +1 MC prod per colony
      if (corp === 'Poseidon' && beh.colony) ev += gensLeft * 1;
    }`;

  const replacement = `      // Poseidon: +1 MC prod per colony
      if (corp === 'Poseidon' && beh.colony) ev += gensLeft * 1;
      // Aphrodite: +2 MC when Venus raised (each Venus card = raise + bonus)
      if (corp === 'Aphrodite' && tags.indexOf('venus') >= 0) ev += 3;
      // Lakefront Resorts: +1 MC prod per ocean — ocean cards worth more
      if (corp === 'Lakefront Resorts' && beh.ocean) ev += gensLeft * 1;
      // Inventrix: wild tag on corp = every requirement met → slight bonus to all requirement cards
      if (corp === 'Inventrix') ev += 2;
      // Vitor: +3 MC when playing VP cards
      if (corp === 'Vitor' && vpInfo) ev += 3;
      // Recyclon: microbe on building tag → 2 microbes = 1 VP
      if (corp === 'Recyclon' && hasBuilding) ev += vpMC(gensLeft) * 0.4;
      // Kuiper Cooperative: asteroid synergy (adds resource → VP)
      if (corp === 'Kuiper Cooperative' && isEvent) ev += vpMC(gensLeft) * 0.3;
      // Robinson Industries: -prod penalties less harsh (can convert back)
      if (corp === 'Robinson Industries' && prod) {
        for (var rik in prod) { if (prod[rik] < 0) ev += Math.abs(prod[rik]) * 1.5; }
      }
      // Splice: microbe tag = +2 MC or +1 microbe
      if (corp === 'Splice Tactical Genomics' && tags.indexOf('microbe') >= 0) ev += 2;
    }`;

  if (brain.includes(old)) {
    brain = brain.replace(old, replacement);
    console.log('OK: Fix 93 — 9 more corporation synergies');
    applied++;
  } else {
    console.log('SKIP: Fix 93 (pattern not found)');
  }
}

// ===== Fix 94: TAG_VALUE rebalance =====
{
  const old = `  var TAG_VALUE = {
    jovian: 4, science: 4, earth: 2, venus: 2, space: 1.5,
    building: 1.5, plant: 2, microbe: 1.5, animal: 2, power: 1,
    city: 1, moon: 1, mars: 0.5, event: 1, wild: 2
  };`;

  const replacement = `  var TAG_VALUE = {
    jovian: 5, science: 5, earth: 3, venus: 3, space: 2,
    building: 2, plant: 2, microbe: 2, animal: 2.5, power: 1,
    city: 1.5, moon: 1, mars: 0.5, event: 1, wild: 3
  };`;

  if (brain.includes(old)) {
    brain = brain.replace(old, replacement);
    console.log('OK: Fix 94 — TAG_VALUE rebalanced (jovian/science 4→5, earth/venus 2→3, space/building up)');
    applied++;
  } else {
    console.log('SKIP: Fix 94 (pattern not found)');
  }
}

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
