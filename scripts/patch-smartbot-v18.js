#!/usr/bin/env node
// patch-smartbot-v18.js — Late buy volume + sell threshold
// Fix 59: Late game maxBuy 4 for VP/city/dynamic cards
// Fix 60: Sell threshold 6→8 (keep more cards for plays/VP)
// Fix 58 REVERTED: blue actions before marginal cards = -4 VP cards, hurts

const fs = require('fs');
const file = 'smartbot.js';
let code = fs.readFileSync(file, 'utf8');
let applied = 0;

// Fix 59: Late game maxBuy — allow 4 if VP/dynamic/city cards available
{
  const old = `      const threshold = gen <= 4 ? 2 : (gen <= 8 ? 3 : 4);
      const worthBuying = sorted.filter(c => scoreCard(c, state) >= threshold);
      const maxBuy = gen <= 4 ? 4 : (gen <= 8 ? 4 : 3);
      const count = Math.max(min, Math.min(canAfford, worthBuying.length, maxBuy));`;

  const replacement = `      const threshold = gen <= 4 ? 2 : (gen <= 8 ? 3 : 4);
      const worthBuying = sorted.filter(c => scoreCard(c, state) >= threshold);
      // Late game: buy 4 if VP/city/dynamic cards available, else 3
      let maxBuy = gen <= 4 ? 4 : (gen <= 8 ? 4 : 3);
      if (gen > 8 && maxBuy === 3) {
        const hasVP = worthBuying.some(c => VP_CARDS.has(c.name) || DYNAMIC_VP_CARDS.has(c.name) || CITY_CARDS.has(c.name));
        if (hasVP) maxBuy = 4;
      }
      const count = Math.max(min, Math.min(canAfford, worthBuying.length, maxBuy));`;

  if (code.includes(old)) {
    code = code.replace(old, replacement);
    console.log('OK: late maxBuy 4 for VP cards');
    applied++;
  } else {
    console.log('SKIP: late maxBuy (pattern not found)');
  }
}

// Fix 60: Sell threshold 6→8 (keep more cards in hand)
{
  const old = `    if (sellIdx >= 0 && cardsInHand.length > 6) return pick(sellIdx);`;
  const replacement = `    if (sellIdx >= 0 && cardsInHand.length > 8) return pick(sellIdx);`;

  if (code.includes(old)) {
    code = code.replace(old, replacement);
    console.log('OK: sell threshold 6→8');
    applied++;
  } else {
    console.log('SKIP: sell threshold (pattern not found)');
  }
}

fs.writeFileSync(file, code);
console.log(`\n${applied} fixes applied to ${file}`);
