/**
 * patch-smartbot-v39.js — Smart World Government Terraforming
 *
 * Fix 105: Smart WGT selection instead of always pick(0)
 *   - Leading (shouldPushGlobe): pick parameter closest to max → end game faster
 *   - Behind (!shouldPushGlobe): pick Venus first (doesn't end game), then farthest parameter
 *   - Also fixes detection: adds "increase oxygen" and "add an ocean" patterns
 *
 * Impact: ~12 decisions per game improved (1 per generation)
 *
 * Usage: node patch-smartbot-v39.js [path-to-smartbot.js]
 */

const fs = require('fs');
const path = process.argv[2] || 'smartbot.js';
const file = fs.readFileSync(path, 'utf8');
let code = file;
let fixes = 0;

// ===== Fix 105: Smart World Government Terraforming =====

const wgtOld = `    // World Government: pick first terraform option
    if (worldGovIdx >= 0 || titles.some(x => x.t.includes('increase temperature') || x.t.includes('increase venus') || x.t.includes('place an ocean'))) {
      return pick(0);
    }`;

const wgtNew = `    // Fix 105: Smart World Government Terraforming
    {
      const wgtTitle = getTitle(wf).toLowerCase();
      const isWGT = worldGovIdx >= 0 || wgtTitle.includes('world government') ||
        titles.some(x => x.t.includes('increase temperature') || x.t.includes('increase venus') ||
          x.t.includes('place an ocean') || x.t.includes('add an ocean') || x.t.includes('increase oxygen'));
      if (isWGT) {
        const gm_w = state?.game || {};
        const pushW = shouldPushGlobe(state);
        // Map each option to its parameter and remaining steps
        const wgtScored = titles.map(x => {
          const t = x.t;
          let stepsLeft = 999, param = 'unknown';
          if (t.includes('temperature')) { param = 'temp'; stepsLeft = Math.max(0, Math.round((8 - (gm_w.temperature ?? -30)) / 2)); }
          else if (t.includes('oxygen')) { param = 'o2'; stepsLeft = Math.max(0, 14 - (gm_w.oxygenLevel ?? 0)); }
          else if (t.includes('ocean')) { param = 'ocean'; stepsLeft = Math.max(0, 9 - (gm_w.oceans ?? 0)); }
          else if (t.includes('venus')) { param = 'venus'; stepsLeft = Math.max(0, Math.round((30 - (gm_w.venusScaleLevel ?? 0)) / 2)); }
          return { i: x.i, param, stepsLeft };
        }).filter(x => x.stepsLeft > 0 && x.param !== 'unknown');

        if (wgtScored.length > 0) {
          if (pushW) {
            // PUSH: end game faster — pick parameter closest to max
            // Venus last (doesn't end game), among non-venus pick fewest steps
            wgtScored.sort((a, b) => {
              if (a.param === 'venus' && b.param !== 'venus') return 1;
              if (b.param === 'venus' && a.param !== 'venus') return -1;
              return a.stepsLeft - b.stepsLeft;
            });
          } else {
            // EXTEND: slow game down — prefer Venus (doesn't end game), then farthest parameter
            wgtScored.sort((a, b) => {
              if (a.param === 'venus' && b.param !== 'venus') return -1;
              if (b.param === 'venus' && a.param !== 'venus') return 1;
              return b.stepsLeft - a.stepsLeft;
            });
          }
          const best = wgtScored[0];
          console.log('    \\u2192 WGT: ' + best.param + ' (steps=' + best.stepsLeft + ' push=' + pushW + ')');
          return pick(best.i);
        }
        return pick(0);
      }
    }`;

if (code.includes(wgtOld)) {
  code = code.replace(wgtOld, wgtNew);
  fixes++;
  console.log('Fix 105 applied: smart WGT selection');
} else {
  console.log('Fix 105 SKIPPED: WGT pattern not found');
}

if (fixes > 0) {
  fs.writeFileSync(path, code, 'utf8');
  console.log(`\nDone: ${fixes}/1 fixes applied to ${path}`);
} else {
  console.log('\nNo fixes applied — check patterns');
  process.exit(1);
}
