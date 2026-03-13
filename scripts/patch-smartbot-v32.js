#!/usr/bin/env node
// patch-smartbot-v32.js (applied to tm-brain.js)
// Fix 86: Early production compound bonus — 30% boost for production when gensLeft >= 8
// Currently: ev += delta * pVal * gensLeft (linear)
// Reality: early production compounds (more MC → more cards → better engine)
// Fix: multiply by 1.3 when gensLeft >= 8 (gens 1-4), 1.15 when >= 5
//
// Fix 87: Expand MANUAL_EV — add 15+ missing cards with recurring/one-time value
// Cards with valuable actions/triggers that parser can't capture

const fs = require('fs');
const brainFile = process.argv[2] || 'tm-brain.js';
let brain = fs.readFileSync(brainFile, 'utf8');
let applied = 0;

// ===== Fix 86: Early production compound bonus =====
{
  const old = `    // ── PRODUCTION VALUE ──
    // Each +1 prod = gensLeft * MC-per-unit
    // Negative production (self-cost) penalized 1.5x because it permanently removes capability
    var prod = beh.production;
    if (prod) {
      for (var pk in prod) {
        var pVal = PROD_MC[pk] || 1;
        var delta = prod[pk];
        if (delta < 0) {
          ev += delta * pVal * gensLeft * 1.5; // penalty multiplier for self-harm
        } else {
          ev += delta * pVal * gensLeft;
        }
      }
    }`;

  const replacement = `    // ── PRODUCTION VALUE ──
    // Each +1 prod = gensLeft * MC-per-unit * compound bonus
    // Early production compounds: more resources → more cards → better engine
    var prodCompound = gensLeft >= 8 ? 1.3 : (gensLeft >= 5 ? 1.15 : 1.0);
    // Negative production (self-cost) penalized 1.5x because it permanently removes capability
    var prod = beh.production;
    if (prod) {
      for (var pk in prod) {
        var pVal = PROD_MC[pk] || 1;
        var delta = prod[pk];
        if (delta < 0) {
          ev += delta * pVal * gensLeft * 1.5; // penalty multiplier for self-harm
        } else {
          ev += delta * pVal * gensLeft * prodCompound;
        }
      }
    }`;

  if (brain.includes(old)) {
    brain = brain.replace(old, replacement);
    console.log('OK: Fix 86 — early production compound bonus (1.3x at gen 1-4, 1.15x at gen 5-7)');
    applied++;
  } else {
    console.log('SKIP: Fix 86 (pattern not found)');
  }
}

// ===== Fix 87: Expand MANUAL_EV =====
{
  const old = `    // === One-time value adjustments ===
    'Mohole Lake':             { once: 5 },     // city + ocean + 3 plants, parser misses city/ocean combo
    'Research Outpost':        { once: 3 },     // city + draw 1, parser misses city
    'Maxwell Base':            { once: 2 },     // city on Venus, parser misses city value
  };`;

  const replacement = `    // === One-time value adjustments ===
    'Mohole Lake':             { once: 5 },     // city + ocean + 3 plants, parser misses city/ocean combo
    'Research Outpost':        { once: 3 },     // city + draw 1, parser misses city
    'Maxwell Base':            { once: 2 },     // city on Venus, parser misses city value

    // === v32 MANUAL_EV expansion ===
    // Action cards the parser undervalues or misses:
    'Restricted Area':         { perGen: 1.5 }, // action: 2 MC → draw 1 card (net +1.5 MC/gen)
    'Development Center':      { perGen: 2 },   // action: 1 energy → draw 1 card (net +2 MC/gen)
    'Security Fleet':          { perGen: 2 },   // action: 1 MC → +1 fighter (1 VP each)
    'Robotic Workforce':       { once: 12 },    // copy a building card's production (avg ~3 MC-prod = 12 MC value)
    'Ironworks':               { perGen: 2 },   // action: 4 energy → 1 steel + O2 raise (TR + steel)
    'Steelworks':              { perGen: 3 },   // action: 4 energy → 2 steel + O2 raise (TR + 2 steel)
    'Ore Processor':           { perGen: 1.5 }, // action: 4 energy → 1 titanium + O2 raise
    'Water Import From Europa':{ perGen: 1 },   // action: 12 MC → ocean (usually negative EV, but TR)
    'Search For Life':         { once: 3 },     // action: 1 MC → check for microbe (3 VP if found, ~35% over game)
    'Space Mirrors':           { perGen: 1.5 }, // action: 7 MC → +1 energy production
    'Cartel':                  { perGen: 1 },   // +1 MC per earth tag (ongoing, grows with tags)
    'Solar Wind Power':        { once: 2 },     // 2 titanium + 1 energy prod, parser may undervalue ti stock
    'Earth Catapult':          { perGen: 3 },   // -2 MC on all cards (strong engine, similar to Anti-Gravity)
    'Immigrant Shuttles':      { perGen: 1 },   // +1 MC per City placed (any player, 3P = ~0.5/gen)
    'Refugee Camps':           { perGen: 1.5 }, // +1 refugee per production phase (1 VP per refugee)
    'Titan Shuttles':          { perGen: 1.5 }, // action: add 2 floaters or spend 2 → 1 colony
  };`;

  if (brain.includes(old)) {
    brain = brain.replace(old, replacement);
    console.log('OK: Fix 87 — expanded MANUAL_EV with 16 new card entries');
    applied++;
  } else {
    console.log('SKIP: Fix 87 (pattern not found)');
  }
}

fs.writeFileSync(brainFile, brain);
console.log('\n' + applied + ' fixes applied to ' + brainFile);
