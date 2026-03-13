#!/usr/bin/env node
// patch-smartbot-v31.js
// Fix 85: Stop skipping greenery/heat when behind on VP
// Currently: bot skips greenery at steps<=8 unless shouldPushGlobe()
// shouldPushGlobe requires lead >= -5 (steps>4) or lead >= 0 (steps<=4)
// Result: bot behind by 20+ VP skips 429 greeneries per 100 games!
// Greenery = 1 VP + 1 TR (if O2 not max) = ~12 MC value for 8 plants — ALWAYS positive EV
// Fix: only skip greenery when LEADING (holding greenery to extend game)
// When behind or even: always place greenery (get VP + TR to catch up)

const fs = require('fs');
const file = process.argv[2] || 'smartbot.js';
let code = fs.readFileSync(file, 'utf8');
let applied = 0;

// ===== Fix 85a: Always place greenery unless leading and want to extend =====
{
  const old = `    // Greenery: always gives 1 VP, but raises O2 (closes game)
    // In danger zone + behind: only place if O2 already maxed (free VP, no globe push)
    if (greeneryIdx >= 0 && plants >= plantsNeeded) {
      if (pushGlobe || o2Done || plants >= plantsNeeded * 2) return pick(greeneryIdx);
      // Not pushing globe: skip greenery to extend game (save ~5-10 VP from extra gen)
      console.log('    → TIMING: skip greenery (steps=' + steps + ' lead=' + vpLead(state) + ' plants=' + plants + ')');
    }`;

  const replacement = `    // Greenery = 1 VP + 1 TR (if O2 not max). Skip only when ahead and want to extend game.
    // Behind by 10+: ALWAYS place (need VP to catch up)
    // Behind by 0-10: place if O2 done or plants stockpiled, else let shouldPushGlobe decide
    // Ahead: skip to extend game (more production gens)
    const myLead = vpLead(state);
    if (greeneryIdx >= 0 && plants >= plantsNeeded) {
      if (myLead <= -10 || o2Done || plants >= plantsNeeded * 2) return pick(greeneryIdx);
      if (pushGlobe) return pick(greeneryIdx);
      console.log('    → TIMING: skip greenery (steps=' + steps + ' lead=' + myLead + ' plants=' + plants + ')');
    }`;

  if (code.includes(old)) {
    code = code.replace(old, replacement);
    console.log('OK: Fix 85a — greenery: always place unless leading by 10+ VP in last 4 steps');
    applied++;
  } else {
    console.log('SKIP: Fix 85a (pattern not found)');
  }
}

// ===== Fix 85b: Always convert heat unless leading =====
{
  const old = `    // Heat conversion: raises temperature (closes game)
    // In danger zone + behind: skip if heat low (save temp steps), but convert if stockpiled
    if (heatIdx >= 0 && heat >= 8 && mc >= redsTax) {
      if (pushGlobe || tempDone || heat >= 16) return pick(heatIdx);
      console.log('    → TIMING: skip heat (steps=' + steps + ' lead=' + vpLead(state) + ' heat=' + heat + ')');
    }`;

  const replacement = `    // Heat → TR: 1 TR for 8 heat. Same logic as greenery.
    if (heatIdx >= 0 && heat >= 8 && mc >= redsTax) {
      if (myLead <= -10 || tempDone || heat >= 16) return pick(heatIdx);
      if (pushGlobe) return pick(heatIdx);
      console.log('    → TIMING: skip heat (steps=' + steps + ' lead=' + myLead + ' heat=' + heat + ')');
    }`;

  if (code.includes(old)) {
    code = code.replace(old, replacement);
    console.log('OK: Fix 85b — heat: always convert unless leading by 10+ VP in last 4 steps');
    applied++;
  } else {
    console.log('SKIP: Fix 85b (pattern not found)');
  }
}

fs.writeFileSync(file, code);
console.log('\n' + applied + ' fixes applied to ' + file);
