/**
 * patch-smartbot-v12.js — Trade fix + award cost + buy threshold
 *
 * Fix 41: Trade threshold 8 → 12 (trade costs 9 MC, so value 8 = net loss)
 * Fix 42: Award cost escalation (8/14/20 MC based on how many funded, not hardcoded 14)
 * Fix 43: Early buy threshold 2 → 3 (less junk cards gen 1-4)
 * Fix 44: City bonus in normal mode 5 → 7 (city cards undervalued)
 */
const fs = require('fs');
const file = process.argv[2] || '/home/openclaw/terraforming-mars/smartbot.js';
let code = fs.readFileSync(file, 'utf8');
let changes = 0;

function replace(label, old, neu) {
  if (code.includes(old)) {
    code = code.replace(old, neu);
    changes++;
    console.log('OK: ' + label);
  } else {
    console.log('SKIP: ' + label + ' (pattern not found)');
  }
}

// Fix 41: Trade threshold — net value must exceed trade cost
// Trade costs 9 MC (or 3 energy/3 titanium). Threshold 8 = net loss.
replace('trade threshold',
  `        if (bestTradeVal >= 8) return pick(tradeIdx);`,
  `        // Trade costs 9 MC (or free if using energy/titanium)
        const tradeCost = (energy >= 3 || titanium >= 3) ? 0 : 9;
        if (bestTradeVal >= tradeCost + 3) return pick(tradeIdx);`
);

// Fix 42: Award funding — use actual cost (8/14/20) not hardcoded 14
// First award = 8 MC (amazing ROI), bots miss it by waiting for 14 MC
replace('award cost escalation',
  `    if (awardIdx >= 0 && mc >= 14 && gen >= 4) {`,
  `    const fundedAwards = state?.game?.fundedAwards?.length ?? 0;
    const awardCost = fundedAwards === 0 ? 8 : (fundedAwards === 1 ? 14 : 20);
    if (awardIdx >= 0 && mc >= awardCost && gen >= 3) {`
);

// Fix 43: REVERTED — higher buy threshold hurt VP (fewer cards = fewer VP)
// Keep original: gen<=4: 2, gen<=8: 3, else: 4

// Fix 44: City bonus in normal mode card play
// Cities give ~2 VP avg + Mayor/Landlord + adjacency. Current +5 undervalues them.
replace('city bonus normal',
  `            if (CITY_CARDS.has(c.name)) score += 5;`,
  `            if (CITY_CARDS.has(c.name)) score += 7;`
);

fs.writeFileSync(file, code);
console.log('\n' + changes + ' fixes applied to ' + file);
