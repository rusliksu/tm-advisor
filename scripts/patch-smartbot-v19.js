#!/usr/bin/env node
// patch-smartbot-v19.js — Award funding + endgame card EV floor
// Fix 61: Award funding — require lead >= 2 (not just competitive)
//         For 3rd award (20 MC), require lead >= 3
// Fix 62: Endgame card EV floor — in endgame, skip cards with EV < 5
//         (unless VP/city card which already gets +8/+7 bonus)

const fs = require('fs');
const file = 'smartbot.js';
let code = fs.readFileSync(file, 'utf8');
let applied = 0;

// Fix 61: Award funding — stricter competitive check
{
  const old = `      const competitive = awardNames.some(aw => {
        const myVal = my[aw] ?? 0;
        if (myVal === 0) return false;
        const maxOther = Math.max(0, ...others.map(o => o[aw] ?? 0));
        return myVal >= maxOther - margin;
      });`;

  const replacement = `      // Require clear lead: >= 2 for 1st/2nd award, >= 3 for 3rd (20 MC)
      const leadReq = awardCost >= 20 ? 3 : 2;
      const competitive = awardNames.some(aw => {
        const myVal = my[aw] ?? 0;
        if (myVal === 0) return false;
        const maxOther = Math.max(0, ...others.map(o => o[aw] ?? 0));
        return myVal >= maxOther + leadReq - margin;
      });`;

  if (code.includes(old)) {
    code = code.replace(old, replacement);
    console.log('OK: award funding lead requirement');
    applied++;
  } else {
    console.log('SKIP: award funding (pattern not found)');
  }
}

// Fix 62: Endgame card EV floor — raise from 3 to 5 in endgame
{
  const old = `    // Card is only option (SP not available/affordable)
    // But skip if EV is very low — blue actions/trade likely better
    if (bestCard && bestCardEV >= 3) {`;

  const replacement = `    // Card is only option (SP not available/affordable)
    // But skip if EV is very low — blue actions/trade likely better
    // Endgame: higher threshold (5) — low EV cards waste actions
    const cardEVFloor = endgameMode ? 5 : 3;
    if (bestCard && bestCardEV >= cardEVFloor) {`;

  if (code.includes(old)) {
    code = code.replace(old, replacement);
    console.log('OK: endgame card EV floor');
    applied++;
  } else {
    console.log('SKIP: endgame card EV floor (pattern not found)');
  }
}

fs.writeFileSync(file, code);
console.log(`\n${applied} fixes applied to ${file}`);
