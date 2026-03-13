#!/usr/bin/env node
// patch-smartbot-v24.js — Fix 70-71: Heat/plant conversion improvements
// Fix 70: Convert heat even without pushGlobe if heat >= 16 (2+ conversions wasted)
// Fix 71: Convert plants even without pushGlobe if plants >= 2*plantsNeeded (steal risk + waste)

const fs = require('fs');
const file = process.argv[2] || 'smartbot.js';
let code = fs.readFileSync(file, 'utf8');
let applied = 0;

// ===== Fix 70: Smarter heat conversion =====
// Currently: bot ONLY converts heat if pushGlobe=true or tempDone=true
// Problem: if behind on VP and not pushing globe, bot sits on 30+ heat and loses 3-4 TR
// Fix: convert if heat >= 16 (2+ conversions = too much waste) regardless of timing
{
  const old = `    // Heat conversion: raises temperature (closes game)
    // In danger zone + behind: skip entirely (save temp steps for opponents to close)
    if (heatIdx >= 0 && heat >= 8 && mc >= redsTax) {
      if (pushGlobe || tempDone) return pick(heatIdx);
      console.log('    → TIMING: skip heat (steps=' + steps + ' lead=' + vpLead(state) + ')');
    }`;

  const replacement = `    // Heat conversion: raises temperature (closes game)
    // In danger zone + behind: skip if heat low (save temp steps), but convert if stockpiled
    if (heatIdx >= 0 && heat >= 8 && mc >= redsTax) {
      if (pushGlobe || tempDone || heat >= 16) return pick(heatIdx);
      console.log('    → TIMING: skip heat (steps=' + steps + ' lead=' + vpLead(state) + ' heat=' + heat + ')');
    }`;

  if (code.includes(old)) {
    code = code.replace(old, replacement);
    console.log('OK: Fix 70 — convert heat if stockpiled >= 16');
    applied++;
  } else {
    console.log('SKIP: Fix 70 (pattern not found)');
  }
}

// ===== Fix 71: Smarter plant conversion =====
// Currently: bot ONLY converts plants if pushGlobe=true or o2Done=true
// Problem: bot with 16+ plants sits on them and risks steal (Insects, Predators, etc.)
// Fix: convert if plants >= 2*plantsNeeded (too much waste/risk) regardless of timing
{
  const old = `    if (greeneryIdx >= 0 && plants >= plantsNeeded) {
      if (pushGlobe || o2Done) return pick(greeneryIdx);
      // Not pushing globe: skip greenery to extend game (save ~5-10 VP from extra gen)
      console.log('    → TIMING: skip greenery (steps=' + steps + ' lead=' + vpLead(state) + ')');
    }`;

  const replacement = `    if (greeneryIdx >= 0 && plants >= plantsNeeded) {
      if (pushGlobe || o2Done || plants >= plantsNeeded * 2) return pick(greeneryIdx);
      // Not pushing globe: skip greenery to extend game (save ~5-10 VP from extra gen)
      console.log('    → TIMING: skip greenery (steps=' + steps + ' lead=' + vpLead(state) + ' plants=' + plants + ')');
    }`;

  if (code.includes(old)) {
    code = code.replace(old, replacement);
    console.log('OK: Fix 71 — convert plants if stockpiled >= 2x needed');
    applied++;
  } else {
    console.log('SKIP: Fix 71 (pattern not found)');
  }
}

fs.writeFileSync(file, code);
console.log('\n' + applied + ' fixes applied to ' + file);
