#!/usr/bin/env node
// patch-smartbot-v20.js — Award funding stricter only
// Fix 61: Award funding — require lead >= 2 (not just competitive)
//         For 3rd award (20 MC), require lead >= 3
// NO Fix 62: endgame card EV floor removed (proved harmful in v19)

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

fs.writeFileSync(file, code);
console.log(`\n${applied} fixes applied to ${file}`);
