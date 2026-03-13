/**
 * patch-smartbot-v41.js — Venus SP doesn't end the game
 *
 * Fix 110: Venus SP outside pushGlobe gate
 *   Bug: Venus SP (Air Scrapping, 15 MC → 1 TR) was gated inside `if (pushGlobe)`,
 *   but Venus scale doesn't affect game-ending conditions (temp/O2/oceans).
 *   When behind (!pushGlobe), bot skipped Venus SP even though it's pure TR
 *   without accelerating game end — losing ~2-5 TR decisions per game.
 *
 *   Fix: Move Venus SP EV calculation outside pushGlobe gate.
 *   When !pushGlobe, set _preferVenusSP flag so SP handler picks Venus
 *   over game-ending SPs (Asteroid/Aquifer/Greenery).
 *
 * Usage: node patch-smartbot-v41.js [path-to-smartbot.js]
 */

const fs = require('fs');
const path = process.argv[2] || 'smartbot.js';
const file = fs.readFileSync(path, 'utf8');
let code = file;
let fixes = 0;

// ===== Fix 110a: Main action chain — Venus SP outside pushGlobe =====
const venusMainOld = `      // Terraforming SPs — only when pushGlobe allows
      if (pushGlobe) {
        if (!tempDone2) bestSpEV = Math.max(bestSpEV, trMCNow + tempoNow - 14);
        if (!oceansDone2 && mc >= 18 + redsTax) bestSpEV = Math.max(bestSpEV, trMCNow + tempoNow + 2 - 18);
        const venusDone2 = (gm.venusScaleLevel ?? 0) >= 30;
        if (!venusDone2) bestSpEV = Math.max(bestSpEV, trMCNow + tempoNow - 15);
        if (!o2Done2 && mc >= 23 + redsTax) {
          const vpNow = gensLeftNow >= 6 ? 3 : gensLeftNow >= 3 ? 5 : 7;
          bestSpEV = Math.max(bestSpEV, trMCNow + tempoNow + vpNow - 23);
        }
      }`;

const venusMainNew = `      // Terraforming SPs — only when pushGlobe allows (these end the game)
      if (pushGlobe) {
        if (!tempDone2) bestSpEV = Math.max(bestSpEV, trMCNow + tempoNow - 14);
        if (!oceansDone2 && mc >= 18 + redsTax) bestSpEV = Math.max(bestSpEV, trMCNow + tempoNow + 2 - 18);
        if (!o2Done2 && mc >= 23 + redsTax) {
          const vpNow = gensLeftNow >= 6 ? 3 : gensLeftNow >= 3 ? 5 : 7;
          bestSpEV = Math.max(bestSpEV, trMCNow + tempoNow + vpNow - 23);
        }
      }
      // Fix 110: Venus SP — doesn't end game, consider regardless of pushGlobe
      const venusDone2 = (gm.venusScaleLevel ?? 0) >= 30;
      if (!venusDone2 && mc >= 15 + redsTax) {
        bestSpEV = Math.max(bestSpEV, trMCNow + tempoNow - 15);
        if (!pushGlobe) state._preferVenusSP = true;
      }`;

if (code.includes(venusMainOld)) {
  code = code.replace(venusMainOld, venusMainNew);
  fixes++;
  console.log('Fix 110a applied: Venus SP outside pushGlobe gate');
} else {
  console.log('Fix 110a SKIPPED: Venus main pattern not found');
}


// ===== Fix 110b: SP handler — prefer Venus when not pushing globe =====
// When _preferVenusSP flag set, pick Venus directly (skip game-ending SPs)
const venusSPOld = `      const tempoSP = spGensNow >= 5 ? 7 : (spGensNow >= 3 ? 5 : 3);
      const spCandidates = [`;

const venusSPNew = `      const tempoSP = spGensNow >= 5 ? 7 : (spGensNow >= 3 ? 5 : 3);
      // Fix 110: When behind, prefer Venus SP (doesn't end game)
      if (state._preferVenusSP) {
        delete state._preferVenusSP;
        if (!venusDone) {
          const venusAir = available.find(c => c.name.toLowerCase().includes('air scrapping'));
          if (venusAir && mc >= 15 + reds) {
            console.log('    \\u2192 Venus SP (not pushing globe, safe TR)');
            return { type: 'card', cards: [venusAir.name] };
          }
        }
      }
      const spCandidates = [`;

if (code.includes(venusSPOld)) {
  code = code.replace(venusSPOld, venusSPNew);
  fixes++;
  console.log('Fix 110b applied: SP handler prefers Venus when !pushGlobe');
} else {
  console.log('Fix 110b SKIPPED: SP handler pattern not found');
}


if (fixes > 0) {
  fs.writeFileSync(path, code, 'utf8');
  console.log(`\nDone: ${fixes}/2 fixes applied to ${path}`);
} else {
  console.log('\nNo fixes applied — check patterns');
  process.exit(1);
}
