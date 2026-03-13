#!/usr/bin/env node
// patch-smartbot-v22.js — Fix 67: Endgame card EV floor
// Fix 66: REMOVED (initial buy budget killed cards VP by -2.4)
// Fix 67: In last 2 gens (steps <= 8), raise card play threshold from 3 to 5

const fs = require('fs');
const file = process.argv[2] || 'smartbot.js';
let code = fs.readFileSync(file, 'utf8');
let applied = 0;

// ===== Fix 67: Smarter endgame card play =====
{
  const old = `    // Card is only option (SP not available/affordable)
    // But skip if EV is very low — blue actions/trade likely better
    if (bestCard && bestCardEV >= 3) {`;

  const replacement = `    // Card is only option (SP not available/affordable)
    // Skip very low EV cards — blue actions/trade likely better
    // In last 2 gens: raise threshold to 5 (focus on VP, not marginal plays)
    const cardEvFloor = (steps > 0 && steps <= 8) ? 5 : 3;
    if (bestCard && bestCardEV >= cardEvFloor) {`;

  if (code.includes(old) && !code.includes('cardEvFloor')) {
    code = code.replace(old, replacement);
    console.log('OK: Fix 67 — endgame card EV floor (last 2 gens only)');
    applied++;
  } else {
    console.log('SKIP: Fix 67 (' + (code.includes('cardEvFloor') ? 'already applied' : 'pattern not found') + ')');
  }
}

fs.writeFileSync(file, code);
console.log('\n' + applied + ' fixes applied to ' + file);
