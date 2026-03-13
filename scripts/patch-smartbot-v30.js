#!/usr/bin/env node
// patch-smartbot-v30.js
// Fix 83: Correct STOCK_MC / PROD_MC resource valuations in tm-brain.js
// Currently: energy stock=0.7 (should be ~1.5), titanium=3 (should be 2.5), plants=1.1 (should be 1.5)
// These affect ALL card scoring via scoreCard → better draft picks (asymmetric improvement)
//
// Fix 84: Guard MANUAL_EV vs parsed action block (prevent double-counting)
// Cards with MANUAL_EV perGen should NOT also get parsed action bonuses
// Example: AI Central has MANUAL_EV perGen:7, parser also finds act.drawCard:2 → gensLeft*6 extra

const fs = require('fs');
const brainFile = process.argv[2] || 'tm-brain.js';
let brain = fs.readFileSync(brainFile, 'utf8');
let applied = 0;

// ===== Fix 83: Correct STOCK_MC / PROD_MC =====
{
  const old = `  var PROD_MC = {
    megacredits: 1, steel: 2, titanium: 3, plants: 2.2,
    energy: 1.3, heat: 0.8
  };

  // MC value of 1 instant resource
  var STOCK_MC = {
    megacredits: 1, steel: 2, titanium: 3, plants: 1.1,
    energy: 0.7, heat: 0.8
  };`;

  const replacement = `  var PROD_MC = {
    megacredits: 1, steel: 1.8, titanium: 2.5, plants: 2,
    energy: 1.7, heat: 0.8
  };

  // MC value of 1 instant resource
  var STOCK_MC = {
    megacredits: 1, steel: 1.8, titanium: 2.5, plants: 1.5,
    energy: 1.5, heat: 0.8
  };`;

  if (brain.includes(old)) {
    brain = brain.replace(old, replacement);
    console.log('OK: Fix 83 — corrected STOCK_MC / PROD_MC (energy 0.7→1.5, titanium 3→2.5, plants 1.1→1.5)');
    applied++;
  } else {
    console.log('SKIP: Fix 83 (pattern not found)');
  }
}

// ===== Fix 84: Guard MANUAL_EV vs parsed action block =====
{
  const old = `    // ── BLUE CARD ACTIONS (recurring) ──
    if (act.addResources && vpInfo && vpInfo.type === 'per_resource') {
      // Already counted in VP accumulator above, don't double count
    } else if (act.addResources) {
      ev += gensLeft * 1; // generic resource gain, small value
    }
    if (act.drawCard) ev += gensLeft * act.drawCard * 3; // card/gen
    if (act.stock) {
      for (var ask in act.stock) {
        ev += gensLeft * (act.stock[ask] || 0) * (STOCK_MC[ask] || 1) * 0.5; // 0.5 = action costs a full turn (~20% of gen)
      }
    }
    if (act.production) {
      for (var apk in act.production) {
        ev += gensLeft * (act.production[apk] || 0) * (PROD_MC[apk] || 1) * 0.5;
      }
    }
    if (act.tr) ev += gensLeft * act.tr * trMC(gensLeft, redsTax) * 0.5; // action for TR (slow)
    if (act.global) {
      for (var agk in act.global) {
        ev += gensLeft * (act.global[agk] || 0) * trMC(gensLeft, redsTax) * 0.5;
      }
    }`;

  const replacement = `    // ── BLUE CARD ACTIONS (recurring) ──
    // Skip parsed actions if MANUAL_EV covers this card (manual is more accurate, avoids double-count)
    var hasManualEV = !!MANUAL_EV[name];
    if (!hasManualEV) {
      if (act.addResources && vpInfo && vpInfo.type === 'per_resource') {
        // Already counted in VP accumulator above, don't double count
      } else if (act.addResources) {
        ev += gensLeft * 1; // generic resource gain, small value
      }
      if (act.drawCard) ev += gensLeft * act.drawCard * 3; // card/gen
      if (act.stock) {
        for (var ask in act.stock) {
          ev += gensLeft * (act.stock[ask] || 0) * (STOCK_MC[ask] || 1) * 0.5;
        }
      }
      if (act.production) {
        for (var apk in act.production) {
          ev += gensLeft * (act.production[apk] || 0) * (PROD_MC[apk] || 1) * 0.5;
        }
      }
      if (act.tr) ev += gensLeft * act.tr * trMC(gensLeft, redsTax) * 0.5;
      if (act.global) {
        for (var agk in act.global) {
          ev += gensLeft * (act.global[agk] || 0) * trMC(gensLeft, redsTax) * 0.5;
        }
      }
    }`;

  if (brain.includes(old)) {
    brain = brain.replace(old, replacement);
    console.log('OK: Fix 84 — guard MANUAL_EV vs parsed action block (prevents double-counting)');
    applied++;
  } else {
    console.log('SKIP: Fix 84 (pattern not found)');
  }
}

fs.writeFileSync(brainFile, brain);
console.log('\n' + applied + ' fixes applied to ' + brainFile);
